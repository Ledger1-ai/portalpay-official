import { User } from '../models/User';
import { TeamMember, ITeamMember } from '../models/TeamMember';
import mongoose from 'mongoose';

const ensureObjectId = (id: any) => {
  if (id && id._id) return id._id;
  if (id && typeof id === 'string') return new mongoose.Types.ObjectId(id);
  return id;
};


import { Shift } from '../models/Shift';
import { InventoryItem } from '../models/InventoryItem';
import { Invoice } from '../models/Invoice';
import { Supplier } from '../models/Supplier';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { Analytics } from '../models/Analytics';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { Recipe } from '../models/Recipe';
import ToastEmployee from '../models/ToastEmployee';
import {
  withAuth,
  withPermission,
  withRole,
  filterByPermissions,
  AuthContext
} from './auth-guards';

import { MenuIndex } from '../models/MenuIndex';
import { MenuVisibility } from '../models/MenuVisibility';
import { MenuMapping } from '../models/MenuMapping';
import { OrderTrackingConfig } from '../models/OrderTrackingConfig';
import ToastAPIClient from '../services/toast-api-client';
import RosterConfiguration from '../models/RosterConfiguration';
import AIInsight from '../models/AIInsight';
import { VaruniAgent, createGraphQLTool } from '../services/varuni-agent';
import { GraphQLScalarType, Kind } from 'graphql';
import { convertQuantity } from '@/lib/units';

async function computeMappedCost(restaurantGuid: string, toastItemGuid: string, visited = new Set<string>()): Promise<number> {
  if (visited.has(toastItemGuid)) return 0;
  visited.add(toastItemGuid);
  const mapping: any = await MenuMapping.findOne({ restaurantGuid, toastItemGuid }).lean();
  if (!mapping) return 0;
  let total = 0;
  for (const c of (mapping.components || [])) {
    if (c.kind === 'inventory' && c.inventoryItem) {
      const inv: any = await InventoryItem.findById(c.inventoryItem).lean();
      const unitCost = Number(inv?.costPerUnit || 0);
      const invUnit = String(inv?.unit || 'each');
      const qtyInInvUnit = convertQuantity(Number(c.quantity || 0), String(c.unit || invUnit), invUnit);
      total += unitCost * qtyInInvUnit;
    } else if (c.kind === 'menu' && c.nestedToastItemGuid) {
      // If overrides exist, compute cost from overrides instead of underlying mapping
      if (Array.isArray(c.overrides) && c.overrides.length > 0) {
        for (const oc of c.overrides) {
          if (oc.kind === 'inventory' && oc.inventoryItem) {
            const inv: any = await InventoryItem.findById(oc.inventoryItem).lean();
            const unitCost = Number(inv?.costPerUnit || 0);
            const invUnit = String(inv?.unit || 'each');
            const qtyInInvUnit = convertQuantity(Number(oc.quantity || 0), String(oc.unit || invUnit), invUnit);
            total += unitCost * qtyInInvUnit * Number(c.quantity || 1);
          } else if (oc.kind === 'menu' && oc.nestedToastItemGuid) {
            const nestedCost = await computeMappedCost(restaurantGuid, oc.nestedToastItemGuid, visited);
            total += nestedCost * Number(oc.quantity || 1) * Number(c.quantity || 1);
          }
        }
      } else {
        total += await computeMappedCost(restaurantGuid, c.nestedToastItemGuid, visited) * Number(c.quantity || 1);
      }
    }
  }
  return total;
}

async function explodeToInventory(
  restaurantGuid: string,
  toastItemGuid: string,
  baseQty: number,
  acc: Map<string, Map<string, number>>,
  visited: Set<string>,
  activeModifierOptionGuid?: string | null
) {
  if (visited.has(toastItemGuid)) return;
  visited.add(toastItemGuid);
  const mapping: any = await MenuMapping.findOne({ restaurantGuid, toastItemGuid }).lean();
  if (!mapping) return;
  for (const c of (mapping.components || [])) {
    if ((c as any)?.modifierOptionGuid) {
      if (!activeModifierOptionGuid) continue;
      if (String((c as any).modifierOptionGuid) !== String(activeModifierOptionGuid)) continue;
    }
    if (c.kind === 'inventory' && c.inventoryItem) {
      const unit = String(c.unit || 'each');
      const q = Number(c.quantity || 0) * baseQty;
      if (!acc.has(String(c.inventoryItem))) acc.set(String(c.inventoryItem), new Map());
      const byUnit = acc.get(String(c.inventoryItem))!;
      byUnit.set(unit, (byUnit.get(unit) || 0) + q);
    } else if (c.kind === 'menu' && c.nestedToastItemGuid) {
      if (Array.isArray(c.overrides) && c.overrides.length > 0) {
        // explode overrides directly
        for (const oc of c.overrides) {
          if ((oc as any)?.modifierOptionGuid) {
            if (!activeModifierOptionGuid) continue;
            if (String((oc as any).modifierOptionGuid) !== String(activeModifierOptionGuid)) continue;
          }
          if (oc.kind === 'inventory' && oc.inventoryItem) {
            const unit = String(oc.unit || 'each');
            const q = Number(oc.quantity || 0) * baseQty * Number(c.quantity || 1);
            if (!acc.has(String(oc.inventoryItem))) acc.set(String(oc.inventoryItem), new Map());
            const byUnit = acc.get(String(oc.inventoryItem))!;
            byUnit.set(unit, (byUnit.get(unit) || 0) + q);
          } else if (oc.kind === 'menu' && oc.nestedToastItemGuid) {
            await explodeToInventory(restaurantGuid, oc.nestedToastItemGuid, baseQty * Number(c.quantity || 1) * Number(oc.quantity || 1), acc, visited, activeModifierOptionGuid);
          }
        }
      } else {
        await explodeToInventory(restaurantGuid, c.nestedToastItemGuid, baseQty * Number(c.quantity || 0), acc, visited, activeModifierOptionGuid);
      }
    }
  }
}

// Date helpers to ensure inclusive end-of-day filtering using restaurant timezone (Mountain by default)
import { getDefaultTimeZone, getDayRangeForYmdInTz } from '@/lib/timezone';
function toStartOfDay(input: string | Date): Date {
  const tz = getDefaultTimeZone();
  if (typeof input === 'string' && input.length === 10) {
    return getDayRangeForYmdInTz(tz, input).start;
  }
  const d = new Date(input as any);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return getDayRangeForYmdInTz(tz, ymd).start;
}
function toEndOfDay(input: string | Date): Date {
  const tz = getDefaultTimeZone();
  if (typeof input === 'string' && input.length === 10) {
    return getDayRangeForYmdInTz(tz, input).end;
  }
  const d = new Date(input as any);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return getDayRangeForYmdInTz(tz, ymd).end;
}

// TypeScript types for resolver parameters
interface ResolverArgs {
  id?: string;
  input?: unknown;
  startDate?: string;
  endDate?: string;
  period?: string;
  quantity?: number;
}

interface TeamMemberWithPerformance {
  performance?: {
    rating?: number;
  };
  [key: string]: any;
}

// Helper to reverse receiving transactions for a PO and decrement item stocks
async function reverseReceivingForOrder(orderId: string, createdByHint?: string) {
  try {
    const rx = await InventoryTransaction.find({ referenceType: 'PurchaseOrder', referenceId: orderId, transactionType: 'receiving', isReversed: { $ne: true } }).lean();
    if (!rx.length) return;
    let createdBy = createdByHint;
    if (!createdBy) {
      let sys: any = await User.findOne({ email: 'system@varuni.local' }).lean();
      if (!sys) sys = await User.create({ name: 'System', email: 'system@varuni.local', password: 'ChangeMe123!@#', role: 'Super Admin', permissions: ['admin', 'inventory'] });
      createdBy = String(sys._id);
    }
    for (const t of rx) {
      const item: any = await InventoryItem.findById(t.inventoryItem);
      if (item) {
        const before = Number(item.currentStock || 0);
        const after = Math.max(0, before - Math.abs(Number(t.quantity || 0)));
        item.currentStock = after;
        // Update status
        if (after <= 0) item.status = 'out_of_stock';
        else if (after <= item.minThreshold) item.status = 'critical';
        else if (after <= item.minThreshold * 1.5) item.status = 'low';
        else item.status = 'normal';
        await item.save();
      }
      // Mark original as reversed and write an adjustment reversal record
      await InventoryTransaction.updateOne({ _id: t._id }, { $set: { isReversed: true, reversedDate: new Date(), reversalReason: 'PO status reverted' } });
      await InventoryTransaction.create({
        inventoryItem: t.inventoryItem,
        itemName: (t as any).itemName,
        transactionType: 'adjustment',
        quantity: -Math.abs(Number(t.quantity || 0)),
        unit: (t as any).unit,
        unitCost: Number((t as any).unitCost || 0),
        totalCost: Math.abs(Number(t.quantity || 0)) * Number((t as any).unitCost || 0),
        balanceBefore: 0,
        balanceAfter: 0,
        location: (t as any).location,
        referenceType: 'PurchaseOrder',
        referenceId: (t as any).referenceId,
        referenceNumber: (t as any).referenceNumber,
        supplier: (t as any).supplier,
        createdBy,
      });
    }
  } catch (e) {
    console.warn('reverseReceivingForOrder failed', e);
  }
}

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize(value: any) { return value; },
  parseValue(value: any) { return value; },
  parseLiteral(ast: any) {
    switch (ast.kind) {
      case Kind.STRING: return ast.value;
      case Kind.INT: return parseInt(ast.value, 10);
      case Kind.FLOAT: return parseFloat(ast.value);
      case Kind.BOOLEAN: return ast.value === true;
      case Kind.NULL: return null;
      case Kind.OBJECT: return null; // Not supported in literals here
      case Kind.LIST: return null;
      default: return null;
    }
  }
});

function isPopulatedSupplier(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === "string" && candidate.name.length > 0;
}

function buildSupplierFallback(order: any) {
  const supplierObjectId = ensureObjectId(order?.supplier);
  const fallbackId = supplierObjectId ? String(supplierObjectId) : (order?._id ? `missing:${order._id}` : `missing:${Date.now()}`);
  const name = typeof order?.supplierName === "string" && order.supplierName.trim().length > 0 ? order.supplierName.trim() : "Unknown Supplier";
  const createdAt = order?.orderDate ? new Date(order.orderDate) : new Date();
  const updatedAt = order?.updatedAt ? new Date(order.updatedAt) : createdAt;
  return {
    id: fallbackId,
    _id: fallbackId,
    name,
    companyName: name,
    supplierCode: typeof order?.poNumber === "string" && order.poNumber ? `MISSING-${order.poNumber}` : "MISSING-SUPPLIER",
    type: "Aftermarket",
    categories: [],
    status: "inactive",
    contacts: [],
    address: null,
    paymentTerms: null,
    logistics: null,
    performanceMetrics: null,
    programs: [],
    accreditations: [],
    digitalPortals: [],
    documents: [],
    preferred: false,
    notes: order?.notes ?? null,
    createdAt,
    updatedAt,
  };
}
export const resolvers = {
  JSON: JSONScalar,
  Query: {
    // User queries
    me: withAuth(async (_: unknown, __: unknown, context: AuthContext) => {
      return await User.findById(context.user!.userId);
    }),

    users: withPermission('team', async () => {
      return await User.find({ isActive: true }).select('-password');
    }),

    // Team queries - Allow read access but filter data
    teamMembers: async (_: unknown, { timeWindow }: { timeWindow: string }, context: AuthContext) => {
      try {
        const members = await TeamMember.find({}).populate('performance');

        // In a real app, you would filter performance data based on the timeWindow
        // For now, we'll just return all data and let the frontend handle it

        if (context.isAuthenticated && context.hasPermission('team')) {
          return members.map(member => {
            // Here you would fetch and calculate historical data
            const history = [
              { date: new Date('2023-01-01'), rating: 4.2 },
              { date: new Date('2023-01-02'), rating: 4.5 },
            ];
            return {
              ...member.toObject(),
              id: member._id, // Ensure id is included
              performance: {
                ...member.performance.toObject(),
                history,
              }
            };
          });
        }

        return [];
      } catch (error) {
        console.error('Error fetching team members:', error);
        return [];
      }
    },

    teamMember: async (_: unknown, { id }: ResolverArgs, context: AuthContext) => {
      try {
        const member = await TeamMember.findById(id).populate('performance');
        if (!member) return null;

        // Check permissions
        if (context.isAuthenticated && (
          context.hasPermission('team') ||
          member.userId === context.user?.userId
        )) {
          return member;
        }

        return null;
      } catch (error) {
        console.error('Error fetching team member:', error);
        return null;
      }
    },

    // Scheduling queries - Allow read access but filter data
    shifts: async (_: unknown, { startDate, endDate }: ResolverArgs, context: AuthContext) => {
      try {
        const filter: { date?: { $gte: Date; $lte: Date } } = {};
        if (startDate && endDate) {
          filter.date = {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          };
        }

        const shifts = await Shift.find(filter).populate('teamMember');

        // If authenticated and has permission, return all data
        if (context.isAuthenticated && context.hasPermission('scheduling')) {
          return shifts;
        }

        // If not authenticated, return empty array
        return [];
      } catch (error) {
        console.error('Error fetching shifts:', error);
        return [];
      }
    },

    shift: async (_: unknown, { id }: ResolverArgs, context: AuthContext) => {
      try {
        const shift = await Shift.findById(id).populate('teamMember');
        if (!shift) return null;

        // Check permissions
        if (context.isAuthenticated && (
          context.hasPermission('scheduling') ||
          shift.assignedTo === context.user?.userId
        )) {
          return shift;
        }

        return null;
      } catch (error) {
        console.error('Error fetching shift:', error);
        return null;
      }
    },

    // Inventory queries - Allow read access but filter data
    inventoryItems: async () => {
      console.log('*** GraphQL inventoryItems resolver called ***');

      try {
        const items = await InventoryItem.find({}).sort({ createdAt: -1 });
        console.log(`*** GraphQL returning ${items.length} items ***`);
        return items;
      } catch (error) {
        console.error('*** GraphQL error:', error);
        return [];
      }
    },

    inventoryItem: async (_: unknown, { id }: ResolverArgs, context: AuthContext) => {
      try {
        const item = await InventoryItem.findById(id);
        if (!item) return null;

        // If authenticated and has permission, return data
        if (context.isAuthenticated && context.hasPermission('inventory')) {
          return item;
        }

        return null;
      } catch (error) {
        console.error('Error fetching inventory item:', error);
        return null;
      }
    },

    lowStockItems: async (_: unknown, __: unknown, context: AuthContext) => {
      try {
        // If authenticated and has permission, return all data
        if (context.isAuthenticated && context.hasPermission('inventory')) {
          return await InventoryItem.find({
            $expr: { $lte: ['$currentStock', '$minThreshold'] }
          });
        }

        return [];
      } catch (error) {
        console.error('Error fetching low stock items:', error);
        return [];
      }
    },

    // Supplier queries
    suppliers: async (_: unknown, __: unknown, context: AuthContext) => {
      try {
        if (context.isAuthenticated && context.hasPermission('inventory')) {
          return await Supplier.find({}).sort({ preferred: -1, name: 1 });
        }
        return [];
      } catch (error) {
        console.error('Error fetching suppliers:', error);
        return [];
      }
    },
    supplier: async (_: unknown, { id }: ResolverArgs, context: AuthContext) => {
      try {
        const supplier = await Supplier.findById(id);
        if (!supplier) return null;
        if (context.isAuthenticated && context.hasPermission('inventory')) {
          return supplier;
        }
        return null;
      } catch (error) {
        console.error('Error fetching supplier:', error);
        return null;
      }
    },

    // Invoicing queries
    invoices: async (_: unknown, { status, search, pagination }: { status?: string; search?: string; pagination?: { page?: number; pageSize?: number } }, context: AuthContext) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('invoicing')) {
          return { items: [], totalCount: 0 };
        }

        const page = Math.max(1, pagination?.page ?? 1);
        const pageSize = Math.max(1, Math.min(pagination?.pageSize ?? 25, 200));
        const filter: Record<string, unknown> = {};
        if (status) {
          filter.status = status;
        }
        if (search) {
          const regex = new RegExp(search, 'i');
          filter.$or = [
            { invoiceNumber: regex },
            { clientName: regex },
            { 'vehicle.make': regex },
            { 'vehicle.model': regex },
            { 'serviceLaneTicket.ticketNumber': regex },
          ];
        }

        const [items, totalCountRaw] = await Promise.all([
          Invoice.find(filter)
            .sort({ issuedDate: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .populate('advisor')
            .populate({ path: 'serviceLaneTicket', populate: ['advisor', 'primaryTechnician', 'bay'] }),
          Invoice.countDocuments(filter),
        ]);

        const permittedItems = filterByPermissions(items, context);
        const safeTotalCount =
          typeof totalCountRaw === 'number' && Number.isFinite(totalCountRaw)
            ? totalCountRaw
            : items.length;
        if (safeTotalCount !== totalCountRaw) {
          console.warn('[graphql] invoices: falling back to computed totalCount', {
            totalCountRaw,
            fallback: safeTotalCount,
          });
        }

        const totalCount = context.hasRole(['Super Admin', 'Manager']) ? safeTotalCount : permittedItems.length;
        return { items: permittedItems, totalCount };
      } catch (error) {
        console.error('Error fetching invoices:', error);
        return { items: [], totalCount: 0 };
      }
    },

    invoice: async (_: unknown, { id }: ResolverArgs, context: AuthContext) => {
      try {
        const invoice = await Invoice.findById(id);
        if (!invoice) return null;

        // Check permissions
        if (context.isAuthenticated && (
          context.hasPermission('invoicing') ||
          invoice.userId === context.user?.userId
        )) {
          return invoice;
        }

        return null;
      } catch (error) {
        console.error('Error fetching invoice:', error);
        return null;
      }
    },

    // Analytics queries
    shopAnalytics: async (
      _: unknown,
      { period, startDate, endDate }: { period: string; startDate?: string; endDate?: string },
      context: AuthContext
    ) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('analytics')) return [];

        const query: any = { period };
        if (startDate && endDate) {
          query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const docs = await Analytics.find(query).sort({ date: 1 }).lean();
        return docs;
      } catch (error) {
        console.error('Error fetching shop analytics:', error);
        return [];
      }
    },

    // Inventory analytics & reports
    inventoryMovement: async (
      _: unknown,
      { period, startDate, endDate, itemId }: { period: string; startDate: string; endDate: string; itemId?: string },
      context: AuthContext
    ) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) return [];
        const query: any = {
          createdAt: {
            $gte: toStartOfDay(startDate),
            $lte: toEndOfDay(endDate),
          },
        };
        if (itemId) query.inventoryItem = itemId;

        let txs = await InventoryTransaction.find(query)
          .populate('inventoryItem', 'name category unit')
          .sort({ createdAt: 1 })
          .lean();

        // Include synthetic receiving for partial POs that haven't generated tx yet (delta-aware)
        try {
          const poWindowFilter: any = {};
          if (startDate && endDate) {
            poWindowFilter.$or = [
              { updatedAt: { $gte: toStartOfDay(startDate), $lte: toEndOfDay(endDate) } },
              { receivedDate: { $gte: toStartOfDay(startDate), $lte: toEndOfDay(endDate) } },
              { orderDate: { $gte: toStartOfDay(startDate), $lte: toEndOfDay(endDate) } },
              { expectedDeliveryDate: { $gte: toStartOfDay(startDate), $lte: toEndOfDay(endDate) } },
            ];
          }
          const pos: any[] = await PurchaseOrder.find(poWindowFilter).lean();
          // Build received sum map for existing tx within the window
          const key = (oId: any, iId: any) => `${String(oId)}::${String(iId)}`;
          const receivedMap = new Map<string, number>();
          for (const t of txs) {
            if (t.transactionType === 'receiving' && t.referenceType === 'PurchaseOrder' && t.referenceId && t.inventoryItem) {
              const invId = (t as any).inventoryItem?._id || (t as any).inventoryItem;
              const k = key((t as any).referenceId, invId);
              receivedMap.set(k, (receivedMap.get(k) || 0) + Math.abs(Number(t.quantity || 0)));
            }
          }
          // Prepare shortfall map by period key
          const shortfallByKey = new Map<string, number>();
          const periodKey = (d: Date) => {
            const date = new Date(d);
            switch (String(period)) {
              case 'daily': return date.toISOString().split('T')[0];
              case 'weekly': {
                const ws = new Date(date);
                const dow = ws.getDay();
                const diff = (dow + 6) % 7; // Monday start
                ws.setDate(ws.getDate() - diff);
                return ws.toISOString().split('T')[0];
              }
              case 'monthly': return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              case 'quarterly': { const q = Math.floor(date.getMonth() / 3) + 1; return `${date.getFullYear()}-Q${q}`; }
              case 'yearly': return String(date.getFullYear());
              default: return date.toISOString().split('T')[0];
            }
          };
          const synthetic: any[] = [];
          for (const o of pos) {
            const items = Array.isArray(o.items) ? o.items : [];
            for (const it of items) {
              const qtyRec = Number(it.quantityReceived || 0);
              if (!it.inventoryItem || qtyRec <= 0) continue;
              const k = key(o._id, it.inventoryItem);
              const already = receivedMap.get(k) || 0;
              const delta = qtyRec - already;
              if (delta > 0) {
                synthetic.push({
                  inventoryItem: it.inventoryItem,
                  itemName: it.name,
                  transactionType: 'receiving',
                  quantity: delta,
                  unit: it.unit,
                  unitCost: Number(it.unitCost || 0),
                  totalCost: delta * Number(it.unitCost || 0),
                  balanceBefore: 0,
                  balanceAfter: 0,
                  createdAt: o.updatedAt || o.receivedDate || o.orderDate || o.expectedDeliveryDate || new Date(),
                  referenceType: 'PurchaseOrder',
                  referenceId: o._id,
                });
              }
              // Compute shortfall (outstanding/missed) for visualization
              const ordered = Number(it.quantityOrdered || 0);
              const credited = Number(it.creditedQuantity || 0);
              const short = Math.max(0, ordered - (qtyRec + credited));
              if (short > 0) {
                const baseDate = o.expectedDeliveryDate || o.orderDate || o.updatedAt || o.receivedDate || new Date();
                const k2 = periodKey(baseDate);
                shortfallByKey.set(k2, (shortfallByKey.get(k2) || 0) + short);
              }
            }
          }
          if (synthetic.length) {
            txs = [...txs, ...synthetic];
          }
          // Attach shortfall to each tx group by dateKey via a hidden property on the function scope
          (global as any).__inv_shortfall = shortfallByKey;
        } catch (e) {
          console.warn('inventoryMovement synthetic receiving supplement skipped', e);
        }

        const groups: Record<string, any[]> = {};
        for (const t of txs) {
          const d = new Date(t.createdAt as any);
          let key = '';
          switch (String(period)) {
            case 'daily':
              // Local date key to avoid UTC boundary shifts
              key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              break;
            case 'weekly': {
              const ws = new Date(d);
              const dow = ws.getDay();
              const diff = (dow + 6) % 7; // Monday start
              ws.setDate(ws.getDate() - diff);
              key = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
              break;
            }
            case 'monthly':
              key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              break;
            case 'quarterly': {
              const q = Math.floor(d.getMonth() / 3) + 1;
              key = `${d.getFullYear()}-Q${q}`;
              break;
            }
            case 'yearly':
              key = String(d.getFullYear());
              break;
            default:
              key = d.toISOString().split('T')[0];
          }
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        }

        const shortfallMap: Map<string, number> | undefined = (global as any).__inv_shortfall;
        const mappedPoints = await Promise.all(Object.entries(groups).map(async ([dateKey, transactions]) => {
          let sampleDate: Date;
          if (String(dateKey).includes('Q')) {
            const [yearStr, qStr] = String(dateKey).split('-');
            const year = Number(yearStr);
            const q = Number((qStr || 'Q1').replace('Q', '')) || 1;
            sampleDate = new Date(year, (q - 1) * 3, 1);
          } else if (String(dateKey).length === 4) {
            sampleDate = new Date(Number(dateKey), 0, 1);
          } else if (String(dateKey).length === 7) {
            const [y, m] = String(dateKey).split('-');
            sampleDate = new Date(Number(y), Number(m) - 1, 1);
          } else {
            const [y, m, d] = String(dateKey).split('-');
            sampleDate = new Date(Number(y), Number(m) - 1, Number(d));
          }
          const received = (transactions as any[])
            .filter((t: any) => ['purchase', 'receiving', 'transfer_in', 'production', 'return'].includes(t.transactionType))
            .reduce((s: number, t: any) => s + Math.abs(Number(t.quantity || 0)), 0);
          const usage = (transactions as any[])
            .filter((t: any) => ['sale', 'consumption', 'waste', 'transfer_out', 'expiry', 'theft'].includes(t.transactionType))
            .reduce((s: number, t: any) => s + Math.abs(Number(t.quantity || 0)), 0);
          const adjustments = (transactions as any[])
            .filter((t: any) => ['adjustment', 'count_adjustment'].includes(t.transactionType))
            .reduce((s: number, t: any) => s + Number(t.quantity || 0), 0);
          const totalValue = (transactions as any[]).reduce((s: number, t: any) => s + Math.abs(Number(t.totalCost || 0)), 0);
          const itemsCount = await InventoryItem.countDocuments({ createdAt: { $lte: sampleDate } });

          let displayDate = '';
          switch (String(period)) {
            case 'daily':
              displayDate = sampleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              break;
            case 'weekly': {
              const weekEnd = new Date(sampleDate);
              weekEnd.setDate(sampleDate.getDate() + 6);
              displayDate = `${sampleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
              break;
            }
            case 'monthly':
              displayDate = sampleDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              break;
            case 'quarterly': {
              const q = Math.floor(sampleDate.getMonth() / 3) + 1;
              displayDate = `Q${q} ${sampleDate.getFullYear()}`;
              break;
            }
            case 'yearly':
              displayDate = String(sampleDate.getFullYear());
              break;
            default:
              displayDate = sampleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }

          return {
            date: displayDate,
            dateKey,
            received,
            usage,
            adjustments,
            totalValue,
            netMovement: received - usage + adjustments,
            transactionCount: (transactions as any[]).length,
            itemsCount,
            shortfall: shortfallMap ? (shortfallMap.get(dateKey) || 0) : 0,
          };
        }));
        const points = (mappedPoints as any[]).sort((a: any, b: any) => String(a.dateKey).localeCompare(String(b.dateKey)));
        return points;
      } catch (e) {
        console.error('inventoryMovement error', e);
        return [];
      }
    },

    inventoryAnalyticsSummary: async (
      _: unknown,
      { startDate, endDate }: { startDate: string; endDate: string },
      context: AuthContext
    ) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) {
          return {
            totalInventoryValue: 0,
            totalItems: 0,
            lowStockItems: 0,
            criticalItems: 0,
            wasteCostInPeriod: 0,
            wasteQtyInPeriod: 0,
            turnoverRatio: 0,
          };
        }
        const items = await InventoryItem.find({}).lean();
        const totalInventoryValue = items.reduce((s: number, it: any) => s + Number(it.currentStock || 0) * Number(it.costPerUnit || 0), 0);
        const totalItems = items.length;
        const lowStockItems = items.filter((it: any) => Number(it.currentStock || 0) <= Number(it.minThreshold || 0)).length;
        const criticalItems = items.filter((it: any) => ['critical', 'out_of_stock'].includes(String(it.status))).length;

        const start = toStartOfDay(startDate); const end = toEndOfDay(endDate);
        const wasteTx = await InventoryTransaction.find({
          createdAt: { $gte: start, $lte: end },
          transactionType: { $in: ['waste', 'expiry', 'theft'] },
        }).lean();
        // Compute waste from transactions using unitCost if present
        let wasteCostInPeriod = 0;
        let wasteQtyInPeriod = 0;
        for (const t of wasteTx) {
          const qty = Math.abs(Number((t as any).quantity || 0));
          const unitCost = Number((t as any).unitCost || 0);
          const totalCost = Number((t as any).totalCost || 0);
          wasteQtyInPeriod += qty;
          wasteCostInPeriod += totalCost > 0 ? Math.abs(totalCost) : qty * unitCost;
        }
        // Fallback: include InventoryItem.wasteLogs within range, priced at item costPerUnit
        for (const it of items) {
          const cpu = Number((it as any).costPerUnit || 0);
          const logs = Array.isArray((it as any).wasteLogs) ? (it as any).wasteLogs : [];
          for (const log of logs) {
            const d = new Date(log.date || it.updatedAt || start);
            if (d >= start && d <= end) {
              const q = Math.abs(Number(log.quantity || 0));
              wasteQtyInPeriod += q;
              wasteCostInPeriod += q * cpu;
            }
          }
        }

        const usageTx = await InventoryTransaction.find({
          createdAt: { $gte: start, $lte: end },
          transactionType: { $in: ['sale', 'consumption', 'waste', 'transfer_out', 'expiry', 'theft'] },
        }).lean();
        const usageCost = usageTx.reduce((s: number, t: any) => s + Math.abs(Number(t.totalCost || 0)), 0);
        const avgInventoryValue = totalInventoryValue || 1; // approximation with current value
        const turnoverRatio = avgInventoryValue > 0 ? usageCost / avgInventoryValue : 0;

        return {
          totalInventoryValue,
          totalItems,
          lowStockItems,
          criticalItems,
          wasteCostInPeriod,
          wasteQtyInPeriod,
          turnoverRatio,
        };
      } catch (e) {
        console.error('inventoryAnalyticsSummary error', e);
        return {
          totalInventoryValue: 0,
          totalItems: 0,
          lowStockItems: 0,
          criticalItems: 0,
          wasteCostInPeriod: 0,
          wasteQtyInPeriod: 0,
          turnoverRatio: 0,
        };
      }
    },

    abcAnalysis: async (
      _: unknown,
      { startDate, endDate, metric }: { startDate: string; endDate: string; metric?: string },
      context: AuthContext
    ) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) return [];
        const start = toStartOfDay(startDate); const end = toEndOfDay(endDate);
        const metricKey = (metric || 'consumptionValue').toLowerCase();
        const txs = await InventoryTransaction.find({ createdAt: { $gte: start, $lte: end } }).lean();

        const valueByItem = new Map<string, { name: string; value: number }>();
        for (const t of txs) {
          let include = false;
          if (metricKey === 'spendvalue') include = ['purchase', 'receiving', 'transfer_in', 'production', 'return'].includes((t as any).transactionType);
          else include = ['sale', 'consumption', 'waste', 'transfer_out', 'expiry', 'theft'].includes((t as any).transactionType);
          if (!include) continue;
          const key = String((t as any).inventoryItem);
          const name = (t as any).itemName || '';
          const add = Math.abs(Number((t as any).totalCost || 0));
          const cur = valueByItem.get(key) || { name, value: 0 };
          cur.value += add;
          valueByItem.set(key, cur);
        }

        const total = Array.from(valueByItem.values()).reduce((s, v) => s + v.value, 0) || 1;
        const rows = Array.from(valueByItem.entries())
          .sort((a, b) => b[1].value - a[1].value)
          .map(([itemId, obj], idx, arr) => {
            const cumulative = arr.slice(0, idx + 1).reduce((s, x) => s + x[1].value, 0) / total;
            const category = cumulative <= 0.8 ? 'A' : cumulative <= 0.95 ? 'B' : 'C';
            return { itemId, name: obj.name || itemId, value: obj.value, cumulativePct: cumulative, category };
          });
        return rows;
      } catch (e) {
        console.error('abcAnalysis error', e);
        return [];
      }
    },

    wasteReport: async (
      _: unknown,
      { startDate, endDate }: { startDate: string; endDate: string },
      context: AuthContext
    ) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) {
          return { byReason: [], byItem: [], totalQuantity: 0, totalCost: 0 };
        }
        const start = toStartOfDay(startDate); const end = toEndOfDay(endDate);
        const txs = await InventoryTransaction.find({
          createdAt: { $gte: start, $lte: end },
          transactionType: { $in: ['waste', 'expiry', 'theft'] },
        }).populate('inventoryItem', 'name costPerUnit').lean();

        const reasonMap = new Map<string, { quantity: number; cost: number }>();
        const itemMap = new Map<string, { name: string; quantity: number; cost: number }>();
        let totalQuantity = 0, totalCost = 0;
        for (const t of txs) {
          const reason = String((t as any).reason || (t as any).transactionType || 'unknown');
          const q = Math.abs(Number((t as any).quantity || 0));
          const unitCost = Number((t as any).unitCost || (t as any).inventoryItem?.costPerUnit || 0);
          const totalCostTx = Number((t as any).totalCost || 0);
          const c = Math.abs(totalCostTx > 0 ? totalCostTx : q * unitCost);
          totalQuantity += q; totalCost += c;
          const rc = reasonMap.get(reason) || { quantity: 0, cost: 0 };
          rc.quantity += q; rc.cost += c; reasonMap.set(reason, rc);
          const itemId = String((t as any).inventoryItem);
          const name = (t as any).itemName || ((t as any).inventoryItem?.name) || itemId;
          const ic = itemMap.get(itemId) || { name, quantity: 0, cost: 0 };
          ic.quantity += q; ic.cost += c; itemMap.set(itemId, ic);
        }
        // Include InventoryItem.wasteLogs within range as additional source
        const items = await InventoryItem.find({}).select('name costPerUnit wasteLogs').lean();
        for (const it of items) {
          const cpu = Number((it as any).costPerUnit || 0);
          const logs = Array.isArray((it as any).wasteLogs) ? (it as any).wasteLogs : [];
          for (const log of logs) {
            const d = new Date(log.date || it.updatedAt || start);
            if (d >= start && d <= end) {
              const q = Math.abs(Number(log.quantity || 0));
              const reason = String(log.reason || 'waste');
              const c = q * cpu;
              totalQuantity += q; totalCost += c;
              const rc = reasonMap.get(reason) || { quantity: 0, cost: 0 };
              rc.quantity += q; rc.cost += c; reasonMap.set(reason, rc);
              const id = String((it as any)._id);
              const name = (it as any).name || id;
              const ic = itemMap.get(id) || { name, quantity: 0, cost: 0 };
              ic.quantity += q; ic.cost += c; itemMap.set(id, ic);
            }
          }
        }
        return {
          byReason: Array.from(reasonMap.entries()).map(([reason, v]) => ({ reason, quantity: v.quantity, cost: v.cost })),
          byItem: Array.from(itemMap.entries()).map(([itemId, v]) => ({ itemId, name: v.name, quantity: v.quantity, cost: v.cost })),
          totalQuantity,
          totalCost,
        };
      } catch (e) {
        console.error('wasteReport error', e);
        return { byReason: [], byItem: [], totalQuantity: 0, totalCost: 0 };
      }
    },

    supplierPerformanceReport: async (
      _: unknown,
      { startDate, endDate }: { startDate: string; endDate: string },
      context: AuthContext
    ) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) return [];
        const start = toStartOfDay(startDate); const end = toEndOfDay(endDate);
        const orders = await PurchaseOrder.find({ createdAt: { $gte: start, $lte: end } }).populate('supplier').lean();

        const map = new Map<string, { supplierId: string; supplierName: string; totalOrders: number; totalSpent: number; onTimeCount: number; deliveredCount: number; qualityRating: number }>();
        for (const o of orders) {
          const sid = String((o as any).supplier?._id || o.supplier || o.supplierName);
          const sname = (o as any).supplier?.name || o.supplierName || 'Unknown Supplier';
          const row = map.get(sid) || { supplierId: sid, supplierName: sname, totalOrders: 0, totalSpent: 0, onTimeCount: 0, deliveredCount: 0, qualityRating: 0 };
          row.totalOrders += 1;
          row.totalSpent += Number((o as any).total || 0);
          if ((o as any).actualDeliveryDate) {
            row.deliveredCount += 1;
            if ((o as any).expectedDeliveryDate && (o as any).actualDeliveryDate <= (o as any).expectedDeliveryDate) row.onTimeCount += 1;
          }
          const q = Number(((o as any).supplier?.performanceMetrics?.qualityRating) || 0);
          row.qualityRating = Math.max(row.qualityRating, q);
          map.set(sid, row);
        }
        const rows = Array.from(map.values()).map(r => ({
          supplierId: r.supplierId,
          supplierName: r.supplierName,
          totalOrders: r.totalOrders,
          totalSpent: r.totalSpent,
          averageOrderValue: r.totalOrders > 0 ? r.totalSpent / r.totalOrders : 0,
          onTimeDeliveryRate: r.deliveredCount > 0 ? (r.onTimeCount / r.deliveredCount) * 100 : 0,
          qualityRating: r.qualityRating,
        }));
        return rows;
      } catch (e) {
        console.error('supplierPerformanceReport error', e);
        return [];
      }
    },

    inventoryTurnoverSeries: async (
      _: unknown,
      { period, startDate, endDate }: { period: string; startDate: string; endDate: string },
      context: AuthContext
    ) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) return [];
        const start = toStartOfDay(startDate); const end = toEndOfDay(endDate);
        const txs = await InventoryTransaction.find({
          createdAt: { $gte: start, $lte: end },
          transactionType: { $in: ['sale', 'consumption', 'waste', 'transfer_out', 'expiry', 'theft'] },
        }).lean();

        const items = await InventoryItem.find({}).lean();
        const currentInventoryValue = items.reduce((s: number, it: any) => s + Number(it.currentStock || 0) * Number(it.costPerUnit || 0), 0) || 1;

        const groups: Record<string, any[]> = {};
        for (const t of txs) {
          const d = new Date((t as any).createdAt);
          let key = '';
          switch (String(period)) {
            case 'daily': key = d.toISOString().split('T')[0]; break;
            case 'weekly': { const ws = new Date(d); ws.setDate(d.getDate() - d.getDay()); key = ws.toISOString().split('T')[0]; break; }
            case 'monthly': key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; break;
            case 'quarterly': { const q = Math.floor(d.getMonth() / 3) + 1; key = `${d.getFullYear()}-Q${q}`; break; }
            case 'yearly': key = String(d.getFullYear()); break;
            default: key = d.toISOString().split('T')[0];
          }
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
        }

        return Object.entries(groups).map(([dateKey, arr]) => {
          const usageCost = (arr as any[]).reduce((s, t: any) => s + Math.abs(Number(t.totalCost || 0)), 0);
          const sampleDate = new Date(dateKey.includes('Q') || dateKey.length === 4 ? `${(dateKey as string).split('-')[0]}-01-01` : (dateKey as string));
          let displayDate = '';
          switch (String(period)) {
            case 'daily': displayDate = sampleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); break;
            case 'weekly': { const we = new Date(sampleDate); we.setDate(sampleDate.getDate() + 6); displayDate = `${sampleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; break; }
            case 'monthly': displayDate = sampleDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); break;
            case 'quarterly': { const q = Math.floor(sampleDate.getMonth() / 3) + 1; displayDate = `Q${q} ${sampleDate.getFullYear()}`; break; }
            case 'yearly': displayDate = String(sampleDate.getFullYear()); break;
            default: displayDate = sampleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }
          return { date: displayDate, period: String(period), usageCost, avgInventoryValue: currentInventoryValue, turnover: currentInventoryValue > 0 ? usageCost / currentInventoryValue : 0 };
        }).sort((a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime());
      } catch (e) {
        console.error('inventoryTurnoverSeries error', e);
        return [];
      }
    },

    recipeProfitabilityReport: async () => {
      try {
        const recipes = await Recipe.find({}).lean();
        return (recipes || []).map((r: any) => ({
          recipeId: String(r._id),
          name: r.name,
          foodCost: Number(r.foodCost || 0),
          menuPrice: Number(r.menuPrice || 0),
          foodCostPct: Number(r.actualFoodCostPercentage || 0),
          grossMargin: Number(r.grossMargin || 0),
          isPopular: Boolean(r.isPopular),
        }));
      } catch (e) {
        console.error('recipeProfitabilityReport error', e);
        return [];
      }
    },

    crossPanelLinks: async (_: unknown, { itemIds }: { itemIds?: string[] }) => {
      try {
        const itemQuery = itemIds && itemIds.length ? { _id: { $in: itemIds } } : {};
        const items = await InventoryItem.find(itemQuery).lean();
        const itemIdSet = new Set(items.map((i: any) => String(i._id)));

        const orders = await PurchaseOrder.find({ 'items.inventoryItem': { $exists: true } }).populate('supplier').lean();
        const recipes = await Recipe.find({ 'ingredients.inventoryItem': { $exists: true } }).lean();

        const vendorNamesByItem = new Map<string, Set<string>>();
        for (const o of orders) {
          const sname = (o as any).supplier?.name || (o as any).supplierName || 'Unknown Supplier';
          for (const it of ((o as any).items || [])) {
            const iid = String((it as any).inventoryItem || '');
            if (!iid || (itemIdSet.size && !itemIdSet.has(iid))) continue;
            if (!vendorNamesByItem.has(iid)) vendorNamesByItem.set(iid, new Set());
            vendorNamesByItem.get(iid)!.add(sname);
          }
        }

        const recipeNamesByItem = new Map<string, Set<string>>();
        for (const r of recipes) {
          for (const ing of ((r as any).ingredients || [])) {
            const iid = String((ing as any).inventoryItem || '');
            if (!iid || (itemIdSet.size && !itemIdSet.has(iid))) continue;
            if (!recipeNamesByItem.has(iid)) recipeNamesByItem.set(iid, new Set());
            recipeNamesByItem.get(iid)!.add((r as any).name || 'Recipe');
          }
        }

        return items.map((it: any) => ({
          itemId: String(it._id),
          itemName: it.name,
          vendorNames: Array.from(vendorNamesByItem.get(String(it._id)) || new Set()),
          recipeNames: Array.from(recipeNamesByItem.get(String(it._id)) || new Set()),
        }));
      } catch (e) {
        console.error('crossPanelLinks error', e);
        return [];
      }
    },

    // Global search across models
    globalSearch: async (_: unknown, { query, limit = 10 }: { query: string; limit?: number }, context: AuthContext) => {
      try {
        const q = String(query || '').trim();
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escape(q), 'i');
        const isShort = q.length <= 2 && q.length > 0;
        type Row = { id: string; kind: string; title: string; description?: string; route: string; icon?: string };
        const inventoryRows: Row[] = [];
        const vendorRows: Row[] = [];
        const teamRows: Row[] = [];
        const userRows: Row[] = [];
        const poRows: Row[] = [];
        const invoiceRows: Row[] = [];
        const recipeRows: Row[] = [];
        const shiftRows: Row[] = [];
        const menuRows: Row[] = [];
        const rosterRows: Row[] = [];
        const shortcutRows: Row[] = [];

        // If empty query, return fast, curated shortcuts (no DB hits)
        if (!q) {
          shortcutRows.push(
            { id: 'quick-inventory', kind: 'Shortcut', title: 'Inventory', route: '/dashboard/inventory', description: 'Manage items and stock', icon: 'package' },
            { id: 'quick-vendors', kind: 'Shortcut', title: 'Vendors', route: '/dashboard/inventory?vendors=1', description: 'Supplier directory', icon: 'truck' },
            { id: 'quick-team', kind: 'Shortcut', title: 'Team', route: '/dashboard/team', description: 'People and roles', icon: 'users' },
            { id: 'quick-analytics', kind: 'Shortcut', title: 'Analytics', route: '/dashboard/analytics', description: 'KPIs and trends', icon: 'bar-chart-3' },
            { id: 'quick-menu', kind: 'Shortcut', title: 'Menu', route: '/dashboard/menu', description: 'Indexed menu items', icon: 'utensils' },
          );
          return shortcutRows.slice(0, limit);
        }

        // Run category queries in parallel for speed
        await Promise.all([
          (async () => {
            if (context.isAuthenticated && context.hasPermission('inventory')) {
              // Prefer text index, fallback to regex if text not available
              let items: any[] = [];
              try {
                if (isShort) {
                  const prefix = new RegExp('^' + escape(q), 'i');
                  items = await InventoryItem.find({ name: prefix }, { name: 1, category: 1 })
                    .limit(limit)
                    .lean();
                } else {
                  items = await InventoryItem.find({ $text: { $search: q } }, { score: { $meta: 'textScore' }, name: 1, category: 1 })
                    .sort({ score: { $meta: 'textScore' } })
                    .limit(limit)
                    .lean();
                }
              } catch {
                const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
                items = await InventoryItem.find({ $or: [{ name: prefix }, { category: prefix }] }, { name: 1, category: 1 })
                  .limit(limit)
                  .lean();
              }
              for (const it of items) {
                inventoryRows.push({ id: String(it._id), kind: 'InventoryItem', title: it.name, description: it.category || it.description || '', route: `/dashboard/inventory?itemId=${String(it._id)}`, icon: 'package' });
              }
            }
          })(),
          (async () => {
            // Users (admin/settings or team management)
            if (context.isAuthenticated && (context.hasPermission('settings') || context.hasPermission('team'))) {
              let usersFound: any[] = [];
              try {
                if (isShort) {
                  const prefix = new RegExp('^' + escape(q), 'i');
                  usersFound = await User.find({ $or: [{ name: prefix }, { email: prefix }, { role: prefix }] }, { name: 1, email: 1, role: 1 })
                    .limit(limit)
                    .lean();
                } else {
                  usersFound = await User.find({ $text: { $search: q } }, { score: { $meta: 'textScore' }, name: 1, email: 1, role: 1 })
                    .sort({ score: { $meta: 'textScore' } })
                    .limit(limit)
                    .lean();
                }
              } catch {
                const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
                usersFound = await User.find({ $or: [{ name: prefix }, { email: prefix }, { role: prefix }] }, { name: 1, email: 1, role: 1 })
                  .limit(limit)
                  .lean();
              }
              for (const u of usersFound) {
                userRows.push({ id: String(u._id), kind: 'User', title: u.name, description: u.email || u.role || '', route: `/dashboard/settings`, icon: 'settings' });
              }
            }
          })(),
          (async () => {
            if (context.isAuthenticated && context.hasPermission('inventory')) {
              let vendors: any[] = [];
              try {
                if (isShort) {
                  const prefix = new RegExp('^' + escape(q), 'i');
                  vendors = await Supplier.find({ $or: [{ name: prefix }, { companyName: prefix }] }, { name: 1, companyName: 1, supplierCode: 1 })
                    .limit(limit)
                    .lean();
                } else {
                  vendors = await Supplier.find({ $text: { $search: q } }, { score: { $meta: 'textScore' }, name: 1, companyName: 1, supplierCode: 1 })
                    .sort({ score: { $meta: 'textScore' } })
                    .limit(limit)
                    .lean();
                }
              } catch {
                const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
                vendors = await Supplier.find({ $or: [{ name: prefix }, { companyName: prefix }, { supplierCode: prefix }] }, { name: 1, companyName: 1, supplierCode: 1 })
                  .limit(limit)
                  .lean();
              }
              for (const v of vendors) {
                vendorRows.push({ id: String(v._id), kind: 'Vendor', title: v.name || v.companyName, description: v.supplierCode || '', route: `/dashboard/inventory?vendorId=${String(v._id)}`, icon: 'truck' });
              }
            }
          })(),
          (async () => {
            if (context.isAuthenticated && context.hasPermission('team')) {
              let people: any[] = [];
              try {
                if (isShort) {
                  const prefix = new RegExp('^' + escape(q), 'i');
                  people = await TeamMember.find({ $or: [{ name: prefix }, { email: prefix }] }, { name: 1, email: 1, role: 1, department: 1 })
                    .limit(limit)
                    .lean();
                } else {
                  people = await TeamMember.find({ $text: { $search: q } }, { score: { $meta: 'textScore' }, name: 1, email: 1, role: 1, department: 1 })
                    .sort({ score: { $meta: 'textScore' } })
                    .limit(limit)
                    .lean();
                }
              } catch {
                const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
                people = await TeamMember.find({ $or: [{ name: prefix }, { email: prefix }, { department: prefix }, { role: prefix }] }, { name: 1, email: 1, role: 1, department: 1 })
                  .limit(limit)
                  .lean();
              }
              for (const p of people) {
                teamRows.push({ id: String(p._id), kind: 'TeamMember', title: p.name, description: p.role || p.department || '', route: `/dashboard/team?memberId=${String(p._id)}`, icon: 'users' });
              }
            }
          })(),
          (async () => {
            if (context.isAuthenticated && context.hasPermission('inventory')) {
              const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
              const pos = await PurchaseOrder.find({ $or: [{ poNumber: prefix }, { supplierName: prefix }] }, { poNumber: 1, supplierName: 1 })
                .limit(limit)
                .lean();
              for (const o of pos) {
                poRows.push({ id: String(o._id), kind: 'PurchaseOrder', title: (o as any).poNumber, description: (o as any).supplierName || '', route: `/dashboard/inventory?poId=${String(o._id)}`, icon: 'file-text' });
              }
            }
          })(),
          (async () => {
            if (context.isAuthenticated && context.hasPermission('invoicing')) {
              const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
              const inv = await Invoice.find({ $or: [{ invoiceNumber: prefix }, { clientName: prefix }, { description: regex }] }, { invoiceNumber: 1, clientName: 1 })
                .limit(limit)
                .lean();
              for (const i of inv) {
                invoiceRows.push({ id: String(i._id), kind: 'Invoice', title: i.invoiceNumber || i.clientName, description: i.clientName || '', route: `/dashboard/invoicing?invoiceId=${String(i._id)}`, icon: 'dollar-sign' });
              }
            }
          })(),
          (async () => {
            // Recipes (menu/inventory intersection)
            if (context.isAuthenticated && (context.hasPermission('menu') || context.hasPermission('inventory'))) {
              let recipesFound: any[] = [];
              try {
                if (isShort) {
                  const prefix = new RegExp('^' + escape(q), 'i');
                  recipesFound = await Recipe.find({ $or: [{ name: prefix }, { category: prefix }, { tags: prefix }] }, { name: 1, category: 1, isPopular: 1 })
                    .limit(limit)
                    .lean();
                } else {
                  recipesFound = await Recipe.find({ $text: { $search: q } }, { score: { $meta: 'textScore' }, name: 1, category: 1, isPopular: 1 })
                    .sort({ score: { $meta: 'textScore' } })
                    .limit(limit)
                    .lean();
                }
              } catch {
                const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
                recipesFound = await Recipe.find({ $or: [{ name: prefix }, { category: prefix }, { tags: prefix }] }, { name: 1, category: 1, isPopular: 1 })
                  .limit(limit)
                  .lean();
              }
              for (const r of recipesFound) {
                recipeRows.push({ id: String(r._id), kind: 'Recipe', title: r.name, description: r.category || '', route: `/dashboard/menu`, icon: 'utensils' });
              }
            }
          })(),
          (async () => {
            // Shifts (scheduling)
            if (context.isAuthenticated && context.hasPermission('scheduling')) {
              const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
              const shiftsFound = await Shift.find({ $or: [{ role: prefix }, { status: prefix }] }, { role: 1, date: 1, status: 1 })
                .limit(limit)
                .lean();
              for (const s of shiftsFound) {
                const dateStr = s.date ? new Date(s.date as any).toLocaleDateString('en-US') : '';
                shiftRows.push({ id: String(s._id), kind: 'Shift', title: s.role, description: `${dateStr} · ${s.status}`, route: `/dashboard/scheduling`, icon: 'calendar' });
              }
            }
          })(),
        ]);

        // Menu Items (indexed Toast menus)
        {
          const idx: any = await MenuIndex.findOne({}).lean();
          if (idx && idx.menus) {
            const matched: Array<{ guid: string; name: string }> = [];
            const visitMenu = (node: any) => {
              if (!node) return;
              if (Array.isArray(node.menuGroups)) node.menuGroups.forEach(visitMenu);
              if (Array.isArray(node.menuItems)) {
                for (const mi of node.menuItems) {
                  if (regex.test(String(mi.name || ''))) matched.push({ guid: String(mi.guid), name: mi.name });
                }
              }
            };
            for (const m of (idx as any).menus || []) visitMenu(m);
            for (const mi of matched.slice(0, limit)) {
              menuRows.push({
                id: mi.guid,
                kind: 'MenuItem',
                title: mi.name,
                description: 'Toast Menu',
                route: `/dashboard/menu?itemGuid=${encodeURIComponent(mi.guid)}`,
                icon: 'utensils',
              });
            }
          }
        }

        // Rosters (by name/description)
        if (context.isAuthenticated && context.hasPermission('roster')) {
          const prefix = new RegExp((isShort ? '^' : '') + escape(q), 'i');
          const rosters = await RosterConfiguration.find({ $or: [{ name: prefix }, { description: prefix }] }, { name: 1, isActive: 1 })
            .limit(limit)
            .lean();
          for (const r of rosters) {
            rosterRows.push({ id: String(r._id), kind: 'Roster', title: r.name, description: (r as any).isActive ? 'Active' : '', route: `/dashboard/roster`, icon: 'users' });
          }
        }

        // Basic Analytics shortcuts
        if (/analytics|revenue|waste|inventory/i.test(q)) {
          shortcutRows.push({ id: 'analytics', kind: 'Shortcut', title: 'Analytics Dashboard', description: 'Open analytics', route: '/dashboard/analytics', icon: 'bar-chart-3' });
        }

        // Round-robin merge so one type doesn't crowd the rest
        const buckets: Row[][] = [
          inventoryRows,
          vendorRows,
          teamRows,
          userRows,
          poRows,
          invoiceRows,
          recipeRows,
          shiftRows,
          menuRows,
          rosterRows,
          shortcutRows,
        ]
          .filter(arr => Array.isArray(arr) && arr.length > 0);
        const merged: Row[] = [];
        while (merged.length < limit && buckets.some(b => b.length > 0)) {
          for (const b of buckets) {
            if (merged.length >= limit) break;
            const next = b.shift();
            if (next) merged.push(next);
          }
        }

        // De-duplicate by kind+id and return
        const dedup = new Map<string, Row>();
        for (const r of merged) {
          const key = `${r.kind}::${r.id}`;
          if (!dedup.has(key)) dedup.set(key, r);
        }
        return Array.from(dedup.values());
      } catch (e) {
        console.error('globalSearch error', e);
        return [];
      }
    },

    // Menus
    indexedMenus: async (_: unknown, { restaurantGuid }: { restaurantGuid: string }) => {
      return MenuIndex.findOne({ restaurantGuid }).lean();
    },
    menuVisibility: async (_: unknown, { restaurantGuid }: { restaurantGuid: string }) => {
      const raw = await MenuVisibility.findOne({ restaurantGuid }).lean();
      if (!raw) return { restaurantGuid, hiddenMenus: [], hiddenGroups: [], updatedAt: null } as any;
      const doc: any = raw as any;
      const rGuid = (doc as any)['restaurantGuid'];
      const hiddenMenus = (doc as any)['hiddenMenus'] || [];
      const hiddenGroups = (doc as any)['hiddenGroups'] || [];
      const updatedAt = (doc as any)['updatedAt'] || null;
      return { restaurantGuid: rGuid, hiddenMenus, hiddenGroups, updatedAt } as any;
    },
    menuMappings: async (_: unknown, { restaurantGuid, toastItemGuid }: { restaurantGuid: string; toastItemGuid?: string }) => {
      const q: any = { restaurantGuid };
      if (toastItemGuid) q.toastItemGuid = toastItemGuid;
      const docs = await MenuMapping.find(q).lean();
      return docs.map((d: any) => ({ id: String(d._id), ...d }));
    },
    menuItemCost: async (_: unknown, { restaurantGuid, toastItemGuid }: { restaurantGuid: string; toastItemGuid: string }) => {
      return computeMappedCost(restaurantGuid, toastItemGuid);
    },
    menuItemCapacity: async (_: unknown, { restaurantGuid, toastItemGuid, quantity = 1, modifierOptionGuid }: { restaurantGuid: string; toastItemGuid: string; quantity?: number; modifierOptionGuid?: string }) => {
      const acc = new Map<string, Map<string, number>>();
      await explodeToInventory(restaurantGuid, toastItemGuid, Number(quantity || 1), acc, new Set(), modifierOptionGuid || undefined);
      // Compute capacity by inventory availability with unit normalization to item unit
      let capacity = Infinity as number;
      let allHaveStock = true;
      const requirements: Array<{ inventoryItem: string; unit: string; quantityPerOrder: number; available: number }> = [];
      for (const [invId, byUnit] of acc.entries()) {
        const item: any = await InventoryItem.findById(invId).lean();
        const stock = Number(item?.currentStock || 0);
        const itemUnit = String(item?.unit || 'each');
        let requiredInItemUnit = 0;
        for (const [unit, qPer] of byUnit.entries()) {
          requiredInItemUnit += convertQuantity(Number(qPer || 0), String(unit), itemUnit);
        }
        const possible = requiredInItemUnit > 0 ? Math.floor(stock / requiredInItemUnit) : 0;
        if (stock <= 0) allHaveStock = false;
        if (requiredInItemUnit > 0) capacity = Math.min(capacity, possible);
        requirements.push({ inventoryItem: String(invId), unit: itemUnit, quantityPerOrder: requiredInItemUnit, available: stock });
      }
      if (capacity === Infinity) capacity = 0;
      if (!allHaveStock) capacity = 0;
      return { capacity, allHaveStock, requirements };
    },
    orderTrackingStatus: async (_: unknown, { restaurantGuid }: { restaurantGuid: string }) => {
      const cfg = await OrderTrackingConfig.findOne({ restaurantGuid }).lean();
      return cfg || { restaurantGuid, enabled: false };
    },
    menuItemStock: async (_: unknown, { restaurantGuid, guids, multiLocationIds }: { restaurantGuid: string; guids?: string[]; multiLocationIds?: string[] }) => {
      const client = new (require('../services/toast-api-client').default)();
      try {
        const rows = await client.getMenuItemInventory(restaurantGuid, guids || [], multiLocationIds || []);
        return rows.map((r: any) => ({ guid: r.guid, multiLocationId: r.multiLocationId, status: r.status, quantity: r.quantity ?? null, versionId: r.versionId }));
      } catch (e) {
        console.warn('menuItemStock error', e);
        return [];
      }
    },

    // Roster queries
    rosterConfigurations: async () => {
      const RosterConfiguration = (await import('@/lib/models/RosterConfiguration')).default;
      return RosterConfiguration.find({}).sort({ isActive: -1, updatedAt: -1 });
    },
    rosterConfiguration: async (_: unknown, { name }: { name: string }) => {
      const RosterConfiguration = (await import('@/lib/models/RosterConfiguration')).default;
      return RosterConfiguration.findOne({ name });
    },
    activeRosterConfiguration: async () => {
      const RosterConfiguration = (await import('@/lib/models/RosterConfiguration')).default;
      return RosterConfiguration.findOne({ isActive: true });
    },
    roleMappings: withPermission('roster', async () => {
      const RoleMapping = (await import('@/lib/models/RoleMapping')).default;
      return RoleMapping.find({});
    }),

    // Orders
    purchaseOrders: async (_: unknown, { vendorId, status }: { vendorId?: string; status?: string }, context: AuthContext) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) return [];
        const query: any = {};
        if (vendorId) query.supplier = vendorId;
        if (status) query.status = status;
        const orders = await PurchaseOrder.find(query).populate('supplier').sort({ createdAt: -1 });

        const missingOrders = orders.filter((order: any) => !isPopulatedSupplier(order?.supplier));
        if (missingOrders.length > 0) {
          const supplierIds = Array.from(
            new Set(
              missingOrders
                .map((order: any) => {
                  if (isPopulatedSupplier(order?.supplier)) return null;
                  return ensureObjectId(order?.supplier);
                })
                .filter((id): id is mongoose.Types.ObjectId => Boolean(id)),
            ),
          );

          const fallbackById = supplierIds.length
            ? new Map(
              (await Supplier.find({ _id: { $in: supplierIds } }))
                .map((doc) => [String(doc._id), doc] as const),
            )
            : new Map<string, any>();

          const nameCandidates = Array.from(
            new Set(
              missingOrders
                .map((order: any) => (typeof order?.supplierName === 'string' ? order.supplierName : null))
                .filter((name): name is string => Boolean(name)),
            ),
          );

          const fallbackByName = nameCandidates.length
            ? new Map(
              (await Supplier.find({ name: { $in: nameCandidates } }))
                .map((doc) => [doc.name, doc] as const),
            )
            : new Map<string, any>();

          for (const order of missingOrders) {
            const rawSupplier = order?.supplier;
            const resolvedId = !isPopulatedSupplier(rawSupplier) ? ensureObjectId(rawSupplier) : undefined;
            if (resolvedId) {
              const match = fallbackById.get(String(resolvedId));
              if (match) {
                order.supplier = match;
                continue;
              }
            }

            const supplierName = typeof order?.supplierName === 'string' ? order.supplierName : null;
            if (supplierName) {
              const match = fallbackByName.get(supplierName);
              if (match) {
                order.supplier = match;
                continue;
              }
            }

            console.warn(
              '[graphql] purchaseOrders: synthesized supplier for missing reference',
              String(order?.poNumber ?? order?._id ?? 'unknown'),
            );
            order.supplier = buildSupplierFallback(order);
          }
        }

        return orders;
      } catch (e) {
        console.error('purchaseOrders error', e);
        return [];
      }
    },
    purchaseOrder: async (_: unknown, { id }: { id: string }, context: AuthContext) => {
      try {
        if (!context.isAuthenticated || !context.hasPermission('inventory')) return null;
        return await PurchaseOrder.findById(id).populate('supplier');
      } catch (e) {
        console.error('purchaseOrder error', e);
        return null;
      }
    },
    savedRosters: withPermission('roster', async (_: unknown, { startDate, endDate }: { startDate: Date, endDate: Date }) => {
      const SavedRoster = (await import('@/lib/models/SavedRoster')).default;
      return SavedRoster.find({ rosterDate: { $gte: startDate, $lte: endDate } }).sort({ rosterDate: -1, shift: 1 });
    }),
    savedRoster: withPermission('roster', async (_: unknown, { id }: { id: string }) => {
      const SavedRoster = (await import('@/lib/models/SavedRoster')).default;
      return SavedRoster.findById(id);
    }),
    rosterCandidates: async (_: unknown, { includeToastOnly = false, onlySevenShiftsActive = true }: { includeToastOnly?: boolean; onlySevenShiftsActive?: boolean }) => {
      try {
        console.log('Fetching roster candidates...');

        // 1. Fetch all active Toast employees efficiently
        const toastEmployees = await ToastEmployee.find({
          isLocallyDeleted: { $ne: true }
        }).lean();
        console.log(`Found ${toastEmployees.length} active Toast employees.`);

        // 2. Collect all emails to fetch linked TeamMembers in one query
        const emails = toastEmployees
          .map(emp => emp.email)
          .filter((email): email is string => !!email);

        const linkedTeamMembers = await TeamMember.find({
          email: { $in: emails }
        }).populate('performance').lean();

        // 3. Create a lookup map for efficient access
        const teamMemberMap = new Map(
          linkedTeamMembers.map(tm => [tm.email, tm])
        );

        // 4. Map the results in memory
        const candidates = toastEmployees.map(emp => {
          console.log('Processing employee:', emp.firstName, emp.lastName, 'Job Titles:', emp.jobTitles);
          const name = `${emp.firstName} ${emp.lastName}`.trim();
          const sevenShiftsEnrolled = typeof emp.sevenShiftsId === 'number' && !Number.isNaN(emp.sevenShiftsId);
          const toastEnrolled = emp.isActive === true;

          let rating = 0;
          const linkedTeamMember = emp.email ? teamMemberMap.get(emp.email) : undefined;
          if (linkedTeamMember && linkedTeamMember.performance) {
            rating = (linkedTeamMember.performance as any).rating || 0;
          }

          return {
            id: emp.toastGuid,
            name,
            email: emp.email || '',
            role: Array.isArray(emp.jobTitles) && emp.jobTitles.length ? emp.jobTitles[0].title : 'N/A',
            roles: Array.isArray(emp.jobTitles) ? emp.jobTitles.map((j: any) => j.title) : [],
            department: linkedTeamMember?.department || '',
            toastEnrolled,
            sevenShiftsEnrolled,
            rating,
          };
        });

        let filtered = candidates;
        if (onlySevenShiftsActive) {
          filtered = filtered.filter(c => c.sevenShiftsEnrolled);
        } else if (!includeToastOnly) {
          filtered = filtered.filter(c => c.sevenShiftsEnrolled || c.toastEnrolled);
        }

        console.log(`Returning ${filtered.length} roster candidates.`);
        return filtered;
      } catch (e) {
        console.error('rosterCandidates resolver error:', e);
        return [];
      }
    },
    // AI Insights
    aiInsights: async (_: unknown, args: { module?: string; forDate?: Date; status?: string }) => {
      const filter: any = {};
      if (args.module) filter.module = args.module;
      if (args.status) filter.status = args.status;
      if (args.forDate) filter.forDate = args.forDate;
      return await AIInsight.find(filter).sort({ createdAt: -1 });
    }
  },

  Mutation: {
    // User mutations
    createUser: withRole(['Super Admin'], async (_: unknown, { input }: ResolverArgs) => {
      // Don't allow password in input - it should be set separately
      const { password, ...userData } = input as { password?: string; email: string };

      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      const user = new User(userData);
      return await user.save();
    }),

    updateUser: withAuth(async (_: unknown, { id, input }: ResolverArgs, context: AuthContext) => {
      // Users can update their own profile, admins can update any user
      if (id !== context.user!.userId && !context.hasRole(['Super Admin', 'Manager'])) {
        throw new Error('Access denied');
      }

      const updateInput = input as { role?: string; permissions?: string[]; isActive?: boolean };
      // Don't allow updating sensitive fields unless admin
      if (!context.hasRole(['Super Admin'])) {
        delete updateInput.role;
        delete updateInput.permissions;
        delete updateInput.isActive;
      }

      return await User.findByIdAndUpdate(id, updateInput, { new: true }).select('-password');
    }),

    deleteUser: withRole(['Super Admin'], async (_: unknown, { id }: ResolverArgs, context: AuthContext) => {
      // Don't allow deleting yourself
      if (id === context.user!.userId) {
        throw new Error('Cannot delete your own account');
      }

      await User.findByIdAndUpdate(id, { isActive: false });
      return true;
    }),

    // Team mutations
    createTeamMember: withPermission('team', async (_: unknown, { input }: ResolverArgs, context: AuthContext) => {
      const teamMemberData = {
        ...input as object,
        createdBy: context.user!.userId,
        department: (input as any).department || 'Support', // Ensure department has a default
      };
      const teamMember = new TeamMember(teamMemberData);
      return await teamMember.save();
    }),

    updateTeamMember: withPermission('team', async (_: unknown, { id, input }: ResolverArgs, context: AuthContext) => {
      const member = await TeamMember.findById(id);
      if (!member) throw new Error('Team member not found');

      // Check permissions
      if (!context.hasRole(['Super Admin', 'Manager']) && member.userId !== context.user!.userId) {
        throw new Error('Access denied');
      }

      return await TeamMember.findByIdAndUpdate(id, input as any, { new: true });
    }),

    deleteTeamMember: withRole(['Super Admin', 'Manager'], async (_: unknown, { id }: ResolverArgs) => {
      await TeamMember.findByIdAndDelete(id);
      return true;
    }),

    syncFromToast: withRole(['Super Admin', 'Manager'], async () => {
      // TODO: Implement Toast POS integration
      console.log('Syncing from Toast POS...');
      return true;
    }),

    // All other mutations require authentication
    createShift: withPermission('scheduling', async (_: unknown, { input }: ResolverArgs, context: AuthContext) => {
      const shift = new Shift({
        ...input as object,
        createdBy: context.user!.userId
      });
      return await shift.save();
    }),

    updateShift: withPermission('scheduling', async (_: unknown, { id, input }: ResolverArgs, context: AuthContext) => {
      const shift = await Shift.findById(id);
      if (!shift) throw new Error('Shift not found');

      // Check permissions
      if (!context.hasRole(['Super Admin', 'Manager']) &&
        shift.assignedTo !== context.user!.userId &&
        shift.createdBy !== context.user!.userId) {
        throw new Error('Access denied');
      }

      return await Shift.findByIdAndUpdate(id, input as any, { new: true });
    }),

    deleteShift: withRole(['Super Admin', 'Manager'], async (_: unknown, { id }: ResolverArgs) => {
      await Shift.findByIdAndDelete(id);
      return true;
    }),

    // Inventory mutations
    createInventoryItem: withPermission('inventory', async (_: unknown, { input }: ResolverArgs, context: AuthContext) => {
      const body = { ...(input as Record<string, any>) };
      const initialStock = Number(body.currentStock ?? 0);
      const minThreshold = Number(body.minThreshold ?? 0);
      if (initialStock <= 0) {
        body.status = 'out_of_stock';
      } else if (initialStock <= minThreshold) {
        body.status = 'critical';
      } else if (initialStock <= minThreshold * 1.5) {
        body.status = 'low';
      } else {
        body.status = 'normal';
      }
      const inventoryItem = new InventoryItem({
        ...body,
        createdBy: context.user!.userId
      });
      const saved = await inventoryItem.save();
      // Auto-assign QR code to the item's ID if not provided
      if (!saved.qrCode) {
        saved.qrCode = saved._id.toString();
        await saved.save();
      }
      return saved;
    }),

    updateInventoryItem: withPermission('inventory', async (_: unknown, { id, input }: ResolverArgs) => {
      try {
        const existing = await InventoryItem.findById(id);
        if (!existing) throw new Error('Inventory item not found');
        const payload = { ...(input as Record<string, any>) };
        // Sanitize unique/sparse fields to avoid duplicate empty strings
        if (typeof payload.barcode === 'string' && !payload.barcode.trim()) {
          delete payload.barcode;
        }
        if (typeof payload.qrCode === 'string' && !payload.qrCode.trim()) {
          delete payload.qrCode;
        }
        const affectsStatus = Object.prototype.hasOwnProperty.call(payload, 'currentStock') || Object.prototype.hasOwnProperty.call(payload, 'minThreshold');
        if (affectsStatus) {
          const nextStock = Number(Object.prototype.hasOwnProperty.call(payload, 'currentStock') ? payload.currentStock : existing.currentStock);
          const nextMin = Number(Object.prototype.hasOwnProperty.call(payload, 'minThreshold') ? payload.minThreshold : existing.minThreshold);
          if (nextStock <= 0) {
            payload.status = 'out_of_stock';
          } else if (nextStock <= nextMin) {
            payload.status = 'critical';
          } else if (nextStock <= nextMin * 1.5) {
            payload.status = 'low';
          } else {
            payload.status = 'normal';
          }
        }
        return await InventoryItem.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
      } catch (e: any) {
        if (e && (e.code === 11000 || e.name === 'MongoServerError')) {
          const field = e?.keyPattern ? Object.keys(e.keyPattern)[0] : 'field';
          const value = e?.keyValue ? Object.values(e.keyValue)[0] : '';
          throw new Error(`Duplicate value for ${field}${value ? `: ${value}` : ''}`);
        }
        throw e;
      }
    }),

    deleteInventoryItem: withRole(['Super Admin', 'Manager'], async (_: unknown, { id }: ResolverArgs) => {
      await InventoryItem.findByIdAndDelete(id);
      return true;
    }),

    updateStock: withPermission('inventory', async (_: unknown, { id, quantity }: ResolverArgs, context: AuthContext) => {
      const item = await InventoryItem.findById(id);
      if (!item) throw new Error('Inventory item not found');

      if (quantity === undefined) throw new Error('Quantity is required');

      const before = Number(item.currentStock || 0);
      const after = Number(quantity);
      const delta = after - before;
      item.currentStock = after;
      item.lastUpdated = new Date();
      item.updatedBy = context.user!.userId;

      // Update status based on stock levels
      if (quantity <= 0) {
        item.status = 'out_of_stock';
      } else if (quantity <= item.minThreshold) {
        item.status = 'critical';
      } else if (quantity <= item.minThreshold * 1.5) {
        item.status = 'low';
      } else {
        item.status = 'normal';
      }

      const saved = await item.save();
      // Record a count adjustment transaction for audit trail
      try {
        await InventoryTransaction.create({
          inventoryItem: saved._id,
          itemName: saved.name,
          transactionType: 'count_adjustment',
          quantity: delta,
          unit: saved.unit,
          unitCost: Number(saved.costPerUnit || 0),
          totalCost: Math.abs(delta) * Number(saved.costPerUnit || 0),
          balanceBefore: before,
          balanceAfter: after,
          location: saved.location,
          reason: 'Manual count update',
          referenceType: 'Manual',
          referenceNumber: `CNT-${Date.now()}`,
          createdBy: context.user!.userId,
        });
      } catch (e) {
        console.warn('Failed to write count_adjustment transaction', e);
      }
      return saved;
    }),

    recordInventoryWaste: withPermission('inventory', async (_: unknown, { itemId, quantity, reason, notes }: { itemId: string; quantity: number; reason: string; notes?: string }, context: AuthContext) => {
      const item = await InventoryItem.findById(itemId);
      if (!item) throw new Error('Inventory item not found');

      if (!item.wasteLogs) {
        item.wasteLogs = [];
      }

      const before = Number(item.currentStock || 0);
      const newWasteLog = {
        _id: new mongoose.Types.ObjectId(),
        date: new Date(),
        quantity,
        reason,
        notes,
        recordedBy: context.user!.userId,
      };

      item.wasteLogs.push(newWasteLog);

      item.currentStock = Math.max(0, before - quantity);
      if (item.currentStock <= 0) {
        item.currentStock = 0;
        item.status = 'out_of_stock';
      } else if (item.currentStock <= item.minThreshold) {
        item.status = 'critical';
      } else if (item.currentStock <= item.minThreshold * 1.5) {
        item.status = 'low';
      } else {
        item.status = 'normal';
      }

      item.markModified('wasteLogs');
      const saved = await item.save();
      // Create waste transaction for analytics
      try {
        await InventoryTransaction.create({
          inventoryItem: saved._id,
          itemName: saved.name,
          transactionType: 'waste',
          quantity: Math.abs(quantity),
          unit: saved.unit,
          unitCost: Number(saved.costPerUnit || 0),
          totalCost: Math.abs(quantity) * Number(saved.costPerUnit || 0),
          balanceBefore: before,
          balanceAfter: Number(saved.currentStock || 0),
          location: saved.location,
          reason,
          notes,
          referenceType: 'Manual',
          referenceNumber: `WASTE-${Date.now()}`,
          createdBy: context.user!.userId,
        });
      } catch (e) {
        console.warn('Failed to write waste transaction', e);
      }
      return saved;
    }),

    // Vendor mutations
    createVendor: withPermission('inventory', async (_: unknown, { input }: ResolverArgs, context: AuthContext) => {
      const vendor = new Supplier({
        ...(input as object),
        createdBy: context.user!.userId
      });
      return await vendor.save();
    }),
    updateVendor: withPermission('inventory', async (_: unknown, { id, input }: ResolverArgs) => {
      return await Supplier.findByIdAndUpdate(id, input as any, { new: true });
    }),
    deleteVendor: withRole(['Super Admin', 'Manager'], async (_: unknown, { id }: ResolverArgs) => {
      await Supplier.findByIdAndDelete(id);
      return true;
    }),

    updateVendorRepresentative: withPermission('inventory', async (_: unknown, { id, input }: any, context: AuthContext) => {
      const vendor = await Supplier.findById(id);
      if (!vendor) throw new Error('Vendor not found');

      const now = new Date();
      // Close out existing representative into history if present
      if (vendor.currentRepresentative && Object.keys(vendor.currentRepresentative.toObject ? vendor.currentRepresentative.toObject() : vendor.currentRepresentative).length) {
        vendor.representativeHistory = vendor.representativeHistory || [];
        vendor.representativeHistory.push({
          representative: vendor.currentRepresentative,
          fromDate: vendor.currentRepresentative.startDate || undefined,
          toDate: now,
          reason: input.reason,
          changedBy: context.user?.userId,
          changedAt: now,
        });
      }

      // Set new current representative
      vendor.currentRepresentative = {
        ...input.representative
      };

      await vendor.save();
      return vendor;
    }),

    // Invoicing mutations
    createInvoice: withPermission('invoicing', async (_: unknown, { input }: ResolverArgs, context: AuthContext) => {
      const invoice = new Invoice({
        ...input as object,
        issuedDate: new Date(),
        status: 'pending',
        createdBy: context.user!.userId
      });
      return await invoice.save();
    }),

    updateInvoice: withPermission('invoicing', async (_: unknown, { id, input }: ResolverArgs, context: AuthContext) => {
      const invoice = await Invoice.findById(id);
      if (!invoice) throw new Error('Invoice not found');

      // Check permissions
      if (!context.hasRole(['Super Admin', 'Manager']) && invoice.userId !== context.user!.userId) {
        throw new Error('Access denied');
      }

      return await Invoice.findByIdAndUpdate(id, input as any, { new: true });
    }),

    deleteInvoice: withRole(['Super Admin', 'Manager'], async (_: unknown, { id }: ResolverArgs) => {
      await Invoice.findByIdAndDelete(id);
      return true;
    }),

    markInvoicePaid: withPermission('invoicing', async (_: unknown, { id }: ResolverArgs, context: AuthContext) => {
      const invoice = await Invoice.findById(id);
      if (!invoice) throw new Error('Invoice not found');

      // Check permissions
      if (!context.hasRole(['Super Admin', 'Manager']) && invoice.userId !== context.user!.userId) {
        throw new Error('Access denied');
      }

      return await Invoice.findByIdAndUpdate(
        id,
        {
          status: 'paid',
          paidDate: new Date(),
          updatedBy: context.user!.userId
        },
        { new: true }
      );
    }),

    // Orders
    createPurchaseOrder: withPermission('inventory', async (_: unknown, { input }: any, context: AuthContext) => {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const hm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      const poNumber = `PO-${ymd}-${hm}-${rand}`;
      const payload: any = {
        poNumber,
        supplier: input.supplierId || undefined,
        supplierName: input.supplierName || 'Unknown Supplier',
        expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : undefined,
        items: (input.items || []).map((it: any) => ({
          inventoryItem: it.inventoryItem,
          name: it.name,
          sku: it.sku,
          syscoSKU: it.syscoSKU,
          vendorSKU: it.vendorSKU,
          quantityOrdered: Number(it.quantityOrdered || 0),
          quantityReceived: Number(it.quantityReceived || 0),
          unit: it.unit,
          unitCost: Number(it.unitCost || 0),
          totalCost: Number(it.totalCost || (Number(it.unitCost || 0) * Number(it.quantityOrdered || 0))),
          notes: it.notes,
        })),
        notes: input.notes || '',
        status: ((): string => {
          const s = String(input.status || '').toLowerCase();
          if (s === 'ordered') return 'sent';
          if (s === 'partial') return 'partially_received';
          if (s === 'received') return 'received';
          if (s === 'cancelled') return 'cancelled';
          return 'draft';
        })(),
        createdBy: context.user?.userId,
      };
      payload.subtotal = (payload.items || []).reduce((s: number, i: any) => s + Number(i.totalCost || 0), 0);
      payload.total = payload.subtotal + Number(payload.tax || 0) + Number(payload.shipping || 0);
      const created = await PurchaseOrder.create(payload);
      return created;
    }),
    updatePurchaseOrder: withPermission('inventory', async (_: unknown, { id, input }: any, context: AuthContext) => {
      const prev = await PurchaseOrder.findById(id).lean();
      const update: any = {};
      if (input.supplierId !== undefined) update.supplier = input.supplierId;
      if (input.supplierName !== undefined) update.supplierName = input.supplierName;
      if (input.expectedDeliveryDate !== undefined) update.expectedDeliveryDate = input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : undefined;
      if (Array.isArray(input.items)) {
        update.items = input.items.map((it: any) => ({
          inventoryItem: it.inventoryItem,
          name: it.name,
          sku: it.sku,
          syscoSKU: it.syscoSKU,
          vendorSKU: it.vendorSKU,
          quantityOrdered: Number(it.quantityOrdered || 0),
          quantityReceived: Number(it.quantityReceived || 0),
          unit: it.unit,
          unitCost: Number(it.unitCost || 0),
          totalCost: Number(it.totalCost || (Number(it.unitCost || 0) * Number(it.quantityOrdered || 0))),
          notes: it.notes,
        }));
      }
      if (input.notes !== undefined) update.notes = input.notes;
      if (input.status !== undefined) {
        const s = String(input.status || '').toLowerCase();
        update.status = s === 'ordered' ? 'sent' : s === 'partial' ? 'partially_received' : s === 'received' ? 'received' : s === 'cancelled' ? 'cancelled' : 'draft';
      }
      const updated = await PurchaseOrder.findByIdAndUpdate(id, update, { new: true });
      // If status changed off partially_received/received, reverse previous receiving
      try {
        const wasReceived = prev && ['partially_received', 'received'].includes(String((prev as any).status));
        const nowReceived = updated && ['partially_received', 'received'].includes(String((updated as any).status));
        if (wasReceived && !nowReceived) {
          await reverseReceivingForOrder(String((updated as any)._id), context.user?.userId);
        }
      } catch (e) {
        console.warn('updatePurchaseOrder reverse check failed', e);
      }
      return updated;
    }),
    receivePurchaseOrder: withPermission('inventory', async (_: unknown, { id, receipts }: any, context: AuthContext) => {
      const order: any = await PurchaseOrder.findById(id);
      if (!order) throw new Error('Order not found');

      const now = new Date();
      const originalItems = (order.items || []).map((it: any) => it.toObject?.() || { ...it });

      let allReceived = true;
      let anyReceived = false;
      const missing: Array<{ name: string; missingQuantity: number; unitCost: number; totalCredit: number; }> = [];
      let accumulatedCredit = 0;

      order.items = order.items.map((it: any) => {
        const r = receipts.find((rc: any) => String(rc.inventoryItem || rc.name) === String(it.inventoryItem || it.name));
        const receivedQty = Number(r?.quantityReceived || 0);
        const creditFlag = Boolean(r?.credit);
        const orderedQty = Number(it.quantityOrdered || 0);
        const priorReceived = Number(it.quantityReceived || 0);
        const priorCredited = Number(it.creditedQuantity || 0);
        const updatedReceived = Math.min(orderedQty, priorReceived + receivedQty);
        let updatedCredited = priorCredited;
        let missingQty = Math.max(0, orderedQty - updatedReceived - updatedCredited);
        const unitCost = Number(it.unitCost || 0);
        if (receivedQty > 0) anyReceived = true;
        if (creditFlag && missingQty > 0) {
          updatedCredited += missingQty;
          accumulatedCredit += unitCost * missingQty;
          missingQty = 0;
        }
        if (missingQty > 0) {
          allReceived = false;
          missing.push({ name: it.name, missingQuantity: missingQty, unitCost, totalCredit: unitCost * missingQty });
        }
        return {
          ...it.toObject?.() || it,
          quantityReceived: updatedReceived,
          creditedQuantity: updatedCredited,
        };
      });

      const allCleared = order.items.every((it: any) => Number(it.quantityReceived || 0) + Number(it.creditedQuantity || 0) >= Number(it.quantityOrdered || 0));
      order.status = allCleared ? 'received' : (anyReceived || order.status === 'partially_received' ? 'partially_received' : order.status);
      if (order.status === 'received') order.receivedDate = now;
      order.creditTotal = Number(order.creditTotal || 0) + accumulatedCredit;
      const savedOrder = await order.save();
      const totalCredit = accumulatedCredit;

      // Update inventory items and create transactions
      try {
        for (const it of savedOrder.items as any[]) {
          const original = originalItems.find((orig: any) => String(orig.inventoryItem || orig.name) === String(it.inventoryItem || it.name));
          const priorReceived = Number(original?.quantityReceived || 0);
          const newlyReceived = Math.max(0, Number(it.quantityReceived || 0) - priorReceived);

          if (newlyReceived > 0 && it.inventoryItem) {
            const itemDoc: any = await InventoryItem.findById(it.inventoryItem);
            if (itemDoc) {
              const before = Number(itemDoc.currentStock || 0);
              const after = before + newlyReceived;
              itemDoc.currentStock = after;
              itemDoc.lastUpdated = now;
              if (after <= 0) itemDoc.status = 'out_of_stock';
              else if (after <= itemDoc.minThreshold) itemDoc.status = 'critical';
              else if (after <= itemDoc.minThreshold * 1.5) itemDoc.status = 'low';
              else itemDoc.status = 'normal';
              await itemDoc.save();

              await InventoryTransaction.create({
                inventoryItem: itemDoc._id,
                itemName: itemDoc.name,
                transactionType: 'receiving',
                quantity: newlyReceived,
                unit: it.unit,
                unitCost: Number(it.unitCost || 0),
                totalCost: newlyReceived * Number(it.unitCost || 0),
                balanceBefore: before,
                balanceAfter: after,
                location: itemDoc.location,
                referenceType: 'PurchaseOrder',
                referenceId: order._id,
                referenceNumber: order.poNumber,
                supplier: order.supplier,
                createdBy: context.user?.userId,
                createdAt: now,
                updatedAt: now,
              });
            }
          }
        }
      } catch (txErr) {
        console.warn('receivePurchaseOrder: failed to update inventory/transactions', txErr);
      }

      let replacementOrder: any = null;
      const missingForReplacement = (savedOrder.items as any[])
        .map((it: any) => {
          const short = Math.max(0, Number(it.quantityOrdered || 0) - (Number(it.quantityReceived || 0) + Number(it.creditedQuantity || 0)));
          if (short > 0) {
            return {
              inventoryItem: it.inventoryItem, name: it.name, sku: it.sku, syscoSKU: it.syscoSKU, vendorSKU: it.vendorSKU,
              quantityOrdered: short, quantityReceived: 0, unit: it.unit,
              unitCost: Number(it.unitCost || 0), totalCost: Number(it.unitCost || 0) * short,
              notes: `Replacement for ${order.poNumber}`,
            };
          }
          return null;
        })
        .filter(Boolean);

      if (Array.isArray(missingForReplacement) && (missingForReplacement as any[]).length > 0) {
        const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const hm = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
        replacementOrder = await PurchaseOrder.create({
          poNumber: `PO-${ymd}-${hm}-${rand}`,
          supplier: order.supplier, supplierName: order.supplierName, expectedDeliveryDate: undefined,
          items: missingForReplacement as any,
          subtotal: (missingForReplacement as any[]).reduce((s, i: any) => s + Number(i.totalCost || 0), 0),
          total: (missingForReplacement as any[]).reduce((s, i: any) => s + Number(i.totalCost || 0), 0),
          status: 'draft', notes: `Replacement order for missing items from ${order.poNumber}`,
          parentOrder: order._id, isPartial: true,
        });
      }

      return { order: savedOrder, missing, totalCredit, replacementOrder };
    }),

    resetPurchaseOrder: withRole(['Super Admin'], async (_: unknown, { id }: any, context: AuthContext) => {
      // Reverse receiving counts before reset
      try { await reverseReceivingForOrder(String(id), context.user?.userId); } catch { }
      const order: any = await PurchaseOrder.findById(id);
      if (!order) throw new Error('Order not found');
      // Reset fields: quantities received/credited, status back to draft, dates cleared, credits cleared
      order.items = (order.items || []).map((it: any) => ({
        ...it.toObject?.() || it,
        quantityReceived: 0,
        creditedQuantity: 0,
        totalCost: Number(it.unitCost || 0) * Number(it.quantityOrdered || 0),
      }));
      order.status = 'draft';
      order.actualDeliveryDate = undefined;
      order.receivedDate = undefined;
      order.creditTotal = 0;
      order.parentOrder = undefined;
      order.isPartial = false;
      order.subtotal = (order.items || []).reduce((s: number, i: any) => s + Number(i.totalCost || 0), 0);
      order.total = order.subtotal + Number(order.tax || 0) + Number(order.shipping || 0);
      await order.save();
      return order;
    }),

    deletePurchaseOrder: withRole(['Super Admin'], async (_: unknown, { id }: any, context: AuthContext) => {
      const existing = await PurchaseOrder.findById(id);
      if (!existing) return false;
      try { await reverseReceivingForOrder(String(id), context.user?.userId); } catch { }
      await PurchaseOrder.findByIdAndDelete(id);
      return true;
    }),

    // Roster mutations
    createRosterConfiguration: withRole(['Super Admin', 'Manager'], async (_: unknown, { input }: any) => {
      const RosterConfiguration = (await import('@/lib/models/RosterConfiguration')).default;
      const created = await RosterConfiguration.create({
        name: input.name,
        description: input.description,
        nodes: input.nodes || [],
        isActive: false,
      });
      return created;
    }),
    updateRosterConfiguration: withRole(['Super Admin', 'Manager'], async (_: unknown, { id, input }: any) => {
      const RosterConfiguration = (await import('@/lib/models/RosterConfiguration')).default;
      const updated = await RosterConfiguration.findByIdAndUpdate(
        id,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.nodes !== undefined ? { nodes: input.nodes } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        { new: true }
      );
      return updated;
    }),
    deleteRosterConfiguration: withRole(['Super Admin', 'Manager'], async (_: unknown, { id }: any) => {
      const RosterConfiguration = (await import('@/lib/models/RosterConfiguration')).default;
      await RosterConfiguration.findByIdAndDelete(id);
      return true;
    }),
    setActiveRosterConfiguration: withRole(['Super Admin', 'Manager'], async (_: unknown, { id }: any) => {
      const RosterConfiguration = (await import('@/lib/models/RosterConfiguration')).default;
      await RosterConfiguration.updateMany({}, { $set: { isActive: false } });
      const updated = await RosterConfiguration.findByIdAndUpdate(id, { isActive: true }, { new: true });
      return updated;
    }),

    updateRoleMapping: withPermission('roster', async (_: unknown, { id, input }: any) => {
      const RoleMapping = (await import('@/lib/models/RoleMapping')).default;
      return RoleMapping.findByIdAndUpdate(id, input, { new: true });
    }),

    // Saved Roster Mutations
    saveRoster: withPermission('roster', async (_: unknown, { input }: any) => {
      const SavedRoster = (await import('@/lib/models/SavedRoster')).default;
      const newRoster = new SavedRoster(input);
      await newRoster.save();
      return newRoster;
    }),
    updateSavedRoster: withPermission('roster', async (_: unknown, { id, input }: any) => {
      const SavedRoster = (await import('@/lib/models/SavedRoster')).default;
      return SavedRoster.findByIdAndUpdate(id, input, { new: true });
    }),
    deleteSavedRoster: withPermission('roster', async (_: unknown, { id }: any) => {
      const SavedRoster = (await import('@/lib/models/SavedRoster')).default;
      await SavedRoster.findByIdAndDelete(id);
      return true;
    }),

    // Menus
    indexMenus: withPermission('inventory', async (_: unknown, { restaurantGuid }: { restaurantGuid: string }) => {
      const client = new ToastAPIClient();
      // Use Menus V2 only as requested
      const data = await client.makeRequest<any>(
        '/menus/v2/menus',
        'GET',
        undefined,
        { restaurantGuid },
        { 'Toast-Restaurant-External-ID': restaurantGuid }
      );
      const payload: any = {
        restaurantGuid,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        menus: data.menus || [],
        modifierGroupReferences: new Map(Object.entries(data.modifierGroupReferences || {})),
        modifierOptionReferences: new Map(Object.entries(data.modifierOptionReferences || {})),
      };
      await MenuIndex.findOneAndUpdate({ restaurantGuid }, payload, { upsert: true, new: true });
      return true;
    }),
    setMenuVisibility: withPermission('inventory', async (_: unknown, { restaurantGuid, hiddenMenus, hiddenGroups }: { restaurantGuid: string; hiddenMenus?: string[]; hiddenGroups?: string[] }, context: AuthContext) => {
      const update: any = { restaurantGuid };
      if (hiddenMenus) update.hiddenMenus = Array.from(new Set(hiddenMenus));
      if (hiddenGroups) update.hiddenGroups = Array.from(new Set(hiddenGroups));
      const candidateUserId = context.user?.userId;
      if (candidateUserId && mongoose.Types.ObjectId.isValid(candidateUserId)) {
        update.updatedBy = new mongoose.Types.ObjectId(candidateUserId);
      }
      const doc = await MenuVisibility.findOneAndUpdate(
        { restaurantGuid },
        update,
        { upsert: true, new: true }
      );
      return { restaurantGuid: doc.restaurantGuid, hiddenMenus: doc.hiddenMenus || [], hiddenGroups: doc.hiddenGroups || [], updatedAt: doc.updatedAt } as any;
    }),
    upsertMenuMapping: withPermission('inventory', async (_: unknown, { input }: any) => {
      const { restaurantGuid, toastItemGuid, toastItemName, toastItemSku, components, recipeSteps, recipeMeta } = input || {};
      if (!restaurantGuid || !toastItemGuid) throw new Error('restaurantGuid and toastItemGuid required');
      const doc = await MenuMapping.findOneAndUpdate(
        { restaurantGuid, toastItemGuid },
        { restaurantGuid, toastItemGuid, toastItemName, toastItemSku, components, recipeSteps, recipeMeta },
        { new: true, upsert: true }
      );
      return { id: String(doc._id), ...doc.toObject() };
    }),
    generateRecipeDraft: withPermission('inventory', async (_: unknown, { restaurantGuid, toastItemGuid, priceyness, cuisinePreset, atmospherePreset }: { restaurantGuid: string; toastItemGuid: string; priceyness?: number; cuisinePreset?: string; atmospherePreset?: string }) => {
      const mapping: any = await MenuMapping.findOne({ restaurantGuid, toastItemGuid }).lean();
      if (!mapping) throw new Error('No mapping found');
      const itemName = mapping.toastItemName || toastItemGuid;
      // Build structured context: ingredients and nested components
      const components = (mapping.components || []).map((c: any) => ({
        kind: c.kind,
        inventoryItem: c.inventoryItem ? String(c.inventoryItem) : undefined,
        nestedToastItemGuid: c.nestedToastItemGuid || undefined,
        quantity: Number(c.quantity || 0),
        unit: String(c.unit || ''),
        overrides: Array.isArray(c.overrides) ? c.overrides : [],
      }));

      const ontology = `Cooking Ontology:
Techniques: sear, sauté, sweat, blanch, parboil, braise, roast, bake, confit, poach, steam, grill, broil, smoke, sous-vide.
Preparations: mince, dice, brunoise, julienne, chiffonade, crush, zest, peel, core, trim, portion, temper, bloom, deglaze, reduce, emulsify.
Stations: prep, hot line, garde manger, pastry, expo.
Doneness: rare, medium-rare, medium, medium-well, well-done; al dente.
Attributes: umami, acidic, sweet, bitter, salty, spicy, smokey, herbaceous, bright, rich.
Sanitation: HACCP steps where relevant (cooling, holding temps), allergen call-outs.
Scaling: maintain ratios and salt at ~1.0–1.5% of total weight as guideline.
`;

      const presetsText = `Pricing: ${priceyness ?? 2}/4. Cuisine: ${cuisinePreset || 'chef_standard'}. Atmosphere: ${atmospherePreset || 'casual_modern'}.`;

      const agent = new VaruniAgent();
      const system = `${ontology}\nYou generate restaurant-ready structured recipes with clear steps, timings, equipment, and mise.en.place.`;
      const user = `Create a structured recipe for "${itemName}" using these components (inventory or nested menu):\n${JSON.stringify(components)}\n${presetsText}. Output strictly JSON with fields: recipeMeta{servings, difficulty, prepTime, cookTime, totalTime, equipment[], miseEnPlace[], plating, allergens[], tasteProfile[], priceyness, cuisinePreset, atmospherePreset, notes}, and recipeSteps[{step, instruction, time, notes}].`;
      const result = await agent.chat(`${system}\n\n${user}`, {
        graphqlEndpoint: process.env.NEXT_PUBLIC_GRAPHQL_URL || '/api/graphql',
        callGraphQL: async () => ({} as any),
      } as any);
      let parsed: any = {};
      try { parsed = JSON.parse(result.text || '{}'); } catch { }

      // Local helpers to sanitize AI output to strict GraphQL schema types
      function coerceString(value: any): string {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        try { return JSON.stringify(value); } catch { return String(value); }
      }

      function ensureStringArray(value: any): string[] {
        if (value == null) return [];
        if (Array.isArray(value)) {
          return value
            .map((v) => {
              if (typeof v === 'string') return v;
              // Prefer common label fields if present
              const label = (v && (v.name || v.title || v.label || v.text || v.use)) ? (v.name || v.title || v.label || v.text || v.use) : undefined;
              if (label) return String(label);
              return coerceString(v);
            })
            .filter((s) => !!s);
        }
        return [coerceString(value)].filter((s) => !!s);
      }

      function parseDurationToMinutes(input: any): number | undefined {
        if (input == null) return undefined;
        if (typeof input === 'number' && Number.isFinite(input)) return Math.round(input);
        if (typeof input !== 'string') return undefined;
        const s = input.trim().toLowerCase();
        if (!s) return undefined;
        if (s === 'ongoing' || s === 'as needed' || s === '-') return undefined;
        // Simple number string
        const numericOnly = parseFloat(s);
        if (!Number.isNaN(numericOnly) && !/[a-z]/.test(s.replace(/[\d.\s]/g, ''))) {
          return Math.round(numericOnly);
        }
        let minutes = 0;
        const hourMatch = s.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
        if (hourMatch) minutes += parseFloat(hourMatch[1]) * 60;
        const minMatch = s.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/);
        if (minMatch) minutes += parseFloat(minMatch[1]);
        const secMatch = s.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)\b/);
        if (secMatch) minutes += parseFloat(secMatch[1]) / 60;
        if (minutes > 0) return Math.round(minutes);
        return undefined;
      }

      function coerceDifficulty(input: any): string | undefined {
        if (input == null) return undefined;
        const s = String(input).trim().toLowerCase();
        if (!s) return undefined;
        if (s.startsWith('easy')) return 'Easy';
        if (s.startsWith('med')) return 'Medium';
        if (s.startsWith('hard')) return 'Hard';
        return 'Medium';
      }

      function clampPriceyness(input: any): number | undefined {
        if (input == null) return undefined;
        if (typeof input === 'number' && Number.isFinite(input)) return Math.min(4, Math.max(1, Math.round(input)));
        const s = String(input).trim().toLowerCase();
        if (!s) return undefined;
        if (/^\d/.test(s)) {
          const n = parseInt(s, 10);
          if (Number.isFinite(n)) return Math.min(4, Math.max(1, n));
        }
        if (s.includes('very')) return 4;
        if (s.includes('low')) return 1;
        if (s.includes('medium')) return 2;
        if (s.includes('high')) return 3;
        return undefined;
      }

      function sanitizeMeta(meta: any): any {
        const out: any = {};
        if (meta == null || typeof meta !== 'object') return out;
        if (meta.servings != null && Number.isFinite(Number(meta.servings))) out.servings = Number(meta.servings);
        const diff = coerceDifficulty(meta.difficulty);
        if (diff) out.difficulty = diff;
        const prep = parseDurationToMinutes(meta.prepTime);
        if (prep != null) out.prepTime = prep;
        const cook = parseDurationToMinutes(meta.cookTime);
        if (cook != null) out.cookTime = cook;
        const total = parseDurationToMinutes(meta.totalTime);
        if (total != null) out.totalTime = total;
        out.equipment = ensureStringArray(meta.equipment);
        out.miseEnPlace = ensureStringArray(meta.miseEnPlace);
        if (meta.plating != null) out.plating = coerceString(meta.plating);
        out.allergens = ensureStringArray(meta.allergens);
        out.tasteProfile = ensureStringArray(meta.tasteProfile);
        const price = clampPriceyness(meta.priceyness);
        if (price != null) out.priceyness = price;
        if (meta.cuisinePreset != null) out.cuisinePreset = coerceString(meta.cuisinePreset);
        if (meta.atmospherePreset != null) out.atmospherePreset = coerceString(meta.atmospherePreset);
        if (meta.notes != null) out.notes = coerceString(meta.notes);
        return out;
      }

      function sanitizeSteps(steps: any[]): any[] {
        if (!Array.isArray(steps)) return [];
        return steps
          .map((s: any, idx: number) => {
            const instruction = coerceString(s?.instruction);
            const time = parseDurationToMinutes(s?.time);
            const clean: any = {
              step: Number.isInteger(s?.step) ? s.step : (idx + 1),
              instruction,
            };
            if (time != null) clean.time = Math.max(0, Math.round(time));
            if (s?.notes != null) clean.notes = coerceString(s.notes);
            return clean;
          })
          .filter((s: any) => !!s.instruction && Number.isInteger(s.step) && s.step > 0);
      }

      const recipeMeta = sanitizeMeta(parsed.recipeMeta || {});
      const recipeSteps = sanitizeSteps(Array.isArray(parsed.recipeSteps) ? parsed.recipeSteps : []);
      if (recipeMeta.totalTime == null && recipeSteps.length > 0) {
        const summed = recipeSteps.reduce((acc: number, s: any) => acc + (Number.isFinite(s.time) ? s.time : 0), 0);
        if (summed > 0) recipeMeta.totalTime = summed;
      }
      return { recipeMeta, recipeSteps, notes: typeof parsed.notes === 'string' ? parsed.notes : '' };
    }),
    setOrderTracking: withPermission('inventory', async (_: unknown, { restaurantGuid, enabled }: { restaurantGuid: string; enabled: boolean }) => {
      const doc = await OrderTrackingConfig.findOneAndUpdate(
        { restaurantGuid },
        { restaurantGuid, enabled, lastRunAt: enabled ? new Date() : undefined },
        { new: true, upsert: true }
      );
      return doc;
    }),
    runOrderTracking: withPermission('inventory', async (_: unknown, { restaurantGuid, businessDate }: { restaurantGuid: string; businessDate?: string }, context: AuthContext) => {
      const client = new ToastAPIClient();
      const headers = { 'Toast-Restaurant-External-ID': restaurantGuid } as Record<string, string>;
      const params: Record<string, string> = {};
      if (businessDate) params.businessDate = businessDate;
      // Default to today in restaurant's tz if not provided
      const resp = await client.makeRequest<any[]>(
        '/orders/v2/ordersBulk',
        'GET',
        undefined,
        params,
        headers
      );
      const orders = Array.isArray(resp) ? resp : [];
      const sold: Record<string, number> = {};
      for (const order of orders) {
        const checks = order?.checks || [];
        for (const check of checks) {
          const selections = check?.selections || [];
          for (const sel of selections) {
            if (sel?.voided) continue;
            const itemGuid = sel?.item?.guid || sel?.itemGuid || sel?.guid;
            const qty = Number(sel?.quantity || 0);
            if (!itemGuid || qty <= 0) continue;
            sold[itemGuid] = (sold[itemGuid] || 0) + qty;
          }
        }
      }
      const acc = new Map<string, Map<string, number>>();
      for (const [toastItemGuid, qty] of Object.entries(sold)) {
        await explodeToInventory(restaurantGuid, toastItemGuid, qty, acc, new Set());
      }
      // Write transactions and adjust inventory
      let creator: any = context.user?.userId;
      if (!creator) {
        let sys: any = await User.findOne({ email: 'system@varuni.local' }).lean();
        if (!sys) sys = await User.create({ name: 'System', email: 'system@varuni.local', password: 'ChangeMe123!@#', role: 'Super Admin', permissions: ['admin', 'inventory'] });
        creator = String(sys._id);
      }
      const now = new Date();
      for (const [invId, byUnit] of acc.entries()) {
        const item: any = await InventoryItem.findById(invId);
        if (!item) continue;
        const itemUnit = String(item.unit || 'each');
        let totalUsage = 0;
        for (const [unit, quantity] of byUnit.entries()) {
          totalUsage += convertQuantity(Number(quantity || 0), String(unit), itemUnit);
        }
        const before = Number(item.currentStock || 0);
        const after = Math.max(0, before - totalUsage);
        item.currentStock = after;
        if (after <= 0) item.status = 'out_of_stock';
        else if (after <= item.minThreshold) item.status = 'critical';
        else if (after <= item.minThreshold * 1.5) item.status = 'low';
        else item.status = 'normal';
        await item.save();
        await InventoryTransaction.create({
          inventoryItem: item._id,
          itemName: item.name,
          transactionType: 'consumption',
          quantity: Math.abs(totalUsage),
          unit: itemUnit,
          unitCost: Number(item.costPerUnit || 0),
          totalCost: Math.abs(totalUsage) * Number(item.costPerUnit || 0),
          balanceBefore: before,
          balanceAfter: after,
          location: item.location,
          referenceType: 'Sale',
          referenceNumber: `ORD-${now.getTime()}`,
          createdBy: creator,
          createdAt: now,
          updatedAt: now,
        });
      }
      await OrderTrackingConfig.findOneAndUpdate(
        { restaurantGuid },
        { restaurantGuid, enabled: true, lastRunAt: now, lastBusinessDate: businessDate },
        { upsert: true }
      );
      return true;
    }),
    updateMenuItemStock: withPermission('inventory', async (_: unknown, { restaurantGuid, updates }: { restaurantGuid: string; updates: Array<{ guid?: string; multiLocationId?: string; status: string; quantity?: number | null; versionId?: string }> }) => {
      const client = new (require('../services/toast-api-client').default)();
      const rows = await client.updateMenuItemInventory(restaurantGuid, updates as any);
      return rows.map((r: any) => ({ guid: r.guid, multiLocationId: r.multiLocationId, status: r.status, quantity: r.quantity ?? null, versionId: r.versionId }));
    }),
    // AI Insights mutations
    generateInsights: withAuth(async (_: unknown, args: { module: string; forDate?: Date }, context: AuthContext) => {
      const agent = new VaruniAgent();
      const authHeader = context.req.headers.get('authorization') || '';
      const callGraphQL = async (query: string, variables?: Record<string, any>) => {
        const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/api/graphql';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ query, variables }),
        });
        const json = await res.json();
        return json.data;
      };

      // Register toolsets
      agent.registerToolSet({
        name: 'inventory',
        description: 'Inventory analytics and stock tools',
        tools: [
          createGraphQLTool('getInventoryAnalyticsSummary', 'Fetch inventory analytics summary', `query($startDate: Date!, $endDate: Date!){ inventoryAnalyticsSummary(startDate:$startDate,endDate:$endDate){ totalInventoryValue totalItems lowStockItems criticalItems wasteCostInPeriod wasteQtyInPeriod turnoverRatio } }`),
          createGraphQLTool('getLowStockItems', 'Fetch low stock items', `query{ lowStockItems{ id name currentStock minThreshold unit costPerUnit status } }`),
        ],
      });

      const today = new Date();
      const nextDay = args.forDate ? new Date(args.forDate) : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const result = await agent.chat(
        `Generate 3-5 actionable ${args.module} insights for ${nextDay.toISOString().slice(0, 10)} with fields: title, description, action, urgency (low|medium|critical), impact. Respond with JSON array only, no prose.`,
        {
          graphqlEndpoint: process.env.NEXT_PUBLIC_GRAPHQL_URL || '/api/graphql',
          callGraphQL,
          userId: context.user?.userId,
        },
        args.module
      );

      let parsed: any[] = [];
      try { parsed = JSON.parse(result.text || '[]'); } catch { }
      if (!Array.isArray(parsed)) parsed = [];

      const docs = parsed.slice(0, 6).map((p) => ({
        module: args.module as any,
        title: String(p.title || 'Insight'),
        description: String(p.description || ''),
        action: String(p.action || ''),
        urgency: (p.urgency || 'medium') as any,
        impact: p.impact ? String(p.impact) : undefined,
        data: p,
        status: 'active',
        forDate: nextDay,
        createdBy: 'varuni',
      }));

      if (docs.length) {
        await AIInsight.insertMany(docs);
      }
      return true;
    }),
    dismissInsight: withAuth(async (_: unknown, args: { id: string }) => {
      await AIInsight.findByIdAndUpdate(args.id, { status: 'dismissed' });
      return true;
    }),
  },

  WasteLog: {
    id: (w: any) => String(w._id),
    recordedBy: async (w: any) => {
      if (!w.recordedBy) return null;
      return await User.findById(w.recordedBy);
    },
  },

  Subscription: {
    shiftUpdated: {
      subscribe: withAuth(() => {
        // TODO: Implement real-time subscriptions with authentication
        return null;
      })
    },
    inventoryUpdated: {
      subscribe: withPermission('inventory', () => {
        // TODO: Implement real-time subscriptions with authentication
        return null;
      })
    },
    newInvoice: {
      subscribe: withPermission('invoicing', () => {
        // TODO: Implement real-time subscriptions with authentication
        return null;
      })
    },
    teamMemberUpdated: {
      subscribe: withPermission('team', () => {
        // TODO: Implement real-time subscriptions with authentication
        return null;
      })
    }
  },
};
