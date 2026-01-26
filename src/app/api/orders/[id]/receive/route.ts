import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { PurchaseOrder } from "@/lib/models/PurchaseOrder";
import { InventoryItem } from "@/lib/models/InventoryItem";
import { InventoryTransaction } from "@/lib/models/InventoryTransaction";
import { extractTokenFromHeader, verifyToken } from "@/lib/auth/jwt";
import { User } from "@/lib/models/User";

export async function POST(request: NextRequest, { params }: any) {
  try {
    await connectDB();
    const body = await request.json();
    const { receipts } = body || {};
    if (!Array.isArray(receipts)) {
      return NextResponse.json({ success: false, error: 'Missing receipts' }, { status: 400 });
    }

    const order: any = await PurchaseOrder.findById(params.id);
    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });

    let allReceived = true;
    let anyReceived = false;
    let accumulatedCredit = 0;
    const missing: Array<{ name: string; missingQuantity: number; unitCost: number; totalCredit: number; } > = [];

    // Preserve original item state for delta calculations (before updating quantities)
    const originalItems = (order.items || []).map((it: any) => it.toObject?.() || { ...it });

    const now = new Date();
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
    order.status = allCleared ? 'received' : (anyReceived ? 'partially_received' : order.status);
    if (order.status === 'received') {
      order.receivedDate = new Date();
    }
    order.creditTotal = Number(order.creditTotal || 0) + accumulatedCredit;
    await order.save();

    // Update inventory items and create receiving transactions for the delta
    try {
      // Determine createdBy from JWT or system user
      let createdBy: any = null;
      try {
        const authHeader = request.headers.get('authorization');
        const token = extractTokenFromHeader(authHeader);
        if (token) {
          const decoded = verifyToken(token);
          createdBy = decoded.userId;
        }
      } catch {}
      if (!createdBy) {
        let sys = await User.findOne({ email: 'system@varuni.local' }).lean();
        if (!sys) {
          sys = await User.create({ name: 'System', email: 'system@varuni.local', password: 'ChangeMe123!@#', role: 'Super Admin', permissions: ['admin','inventory'] }) as any;
        }
        createdBy = (sys as any)._id;
      }

      for (const it of order.items as any[]) {
        const line = (it as any);
        const original = originalItems.find((orig: any) => String(orig.inventoryItem || orig.name) === String(line.inventoryItem || line.name));
        const priorReceived = Number(original?.quantityReceived || 0);
        const newlyReceived = Math.max(0, Number(line.quantityReceived || 0) - priorReceived);
        if (newlyReceived > 0 && line.inventoryItem) {
          const itemDoc: any = await InventoryItem.findById(line.inventoryItem);
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
              unit: line.unit,
              unitCost: Number(line.unitCost || 0),
              totalCost: newlyReceived * Number(line.unitCost || 0),
              balanceBefore: before,
              balanceAfter: after,
              location: itemDoc.location,
              referenceType: 'PurchaseOrder',
              referenceId: order._id,
              referenceNumber: (order as any).poNumber,
              supplier: (order as any).supplier,
              createdBy,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }
    } catch (txErr) {
      console.warn('receive: failed to update inventory/transactions', txErr);
    }

    const totals = missing.reduce((s, m) => s + m.totalCredit, 0) + accumulatedCredit;

    // Create replacement order for uncredited missing items
    let replacementOrder: any = null;
    const missingForReplacement = order.items
      .map((it: any) => {
        const short = Math.max(0, Number(it.quantityOrdered || 0) - (Number(it.quantityReceived || 0) + Number(it.creditedQuantity || 0)));
        if (short > 0) {
          return {
            inventoryItem: it.inventoryItem,
            name: it.name,
            sku: it.sku,
            syscoSKU: it.syscoSKU,
            vendorSKU: it.vendorSKU,
            quantityOrdered: short,
            quantityReceived: 0,
            unit: it.unit,
            unitCost: Number(it.unitCost || 0),
            totalCost: Number(it.unitCost || 0) * short,
            notes: `Replacement for ${order.poNumber}`,
          };
        }
        return null;
      })
      .filter(Boolean) as any[];

    if (!order || (Array.isArray(missingForReplacement) && missingForReplacement.length > 0)) {
      const now = new Date();
      const ymd = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const hm = `${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      const poNumber = `PO-${ymd}-${hm}-${rand}`;
      replacementOrder = await PurchaseOrder.create({
        poNumber,
        supplier: order.supplier,
        supplierName: order.supplierName,
        expectedDeliveryDate: undefined,
        items: missingForReplacement as any,
        subtotal: (missingForReplacement as any[]).reduce((s, i:any) => s + Number(i.totalCost || 0), 0),
        total: (missingForReplacement as any[]).reduce((s, i:any) => s + Number(i.totalCost || 0), 0),
        status: 'draft',
        notes: `Replacement order for missing items from ${order.poNumber}`,
        parentOrder: order._id,
        isPartial: true,
      });
    }

    return NextResponse.json({ success: true, data: order, missing, totalCredit: totals, replacementOrder });
  } catch (e) {
    console.error('POST /api/orders/[id]/receive error', e);
    return NextResponse.json({ success: false, error: 'Failed to receive order' }, { status: 500 });
  }
}


