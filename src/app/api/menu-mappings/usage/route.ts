import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { MenuMapping } from '@/lib/models/MenuMapping';
import { InventoryItem } from '@/lib/models/InventoryItem';
import ToastAPIClient from '@/lib/services/toast-api-client';
import { convertQuantity } from '@/lib/units';

type SoldMap = Record<string, number>; // toastItemGuid -> qty sold

async function fetchOrdersBulk(
  client: ToastAPIClient,
  restaurantGuid: string,
  params: Record<string, string>
): Promise<any[]> {
  const headers = { 'Toast-Restaurant-External-ID': restaurantGuid } as Record<string, string>;
  const pageSize = Number(params.pageSize || '100');
  let page = Number(params.page || '0');
  const all: any[] = [];
  for (let i = 0; i < 20; i++) { // cap pages to avoid runaway
    const p = { ...params, page: String(page), pageSize: String(pageSize) };
    const batch = await client.makeRequest<any[]>(
      '/orders/v2/ordersBulk',
      'GET',
      undefined,
      p,
      headers
    );
    const arr = Array.isArray(batch) ? batch : [];
    all.push(...arr);
    if (arr.length < pageSize) break;
    page += 1;
  }
  return all;
}

async function buildSoldMap(orders: any[]): Promise<SoldMap> {
  const sold: SoldMap = {};
  for (const order of orders) {
    const checks = order?.checks || [];
    for (const check of checks) {
      const selections = check?.selections || [];
      for (const sel of selections) {
        if (sel?.voided) continue;
        const itemGuid = sel?.item?.guid || sel?.itemGuid || sel?.guid; // try multiple
        const qty = Number(sel?.quantity || 0);
        if (!itemGuid || qty <= 0) continue;
        sold[itemGuid] = (sold[itemGuid] || 0) + qty;
      }
    }
  }
  return sold;
}

interface UsageRow { inventoryItem: string; unit: string; quantity: number; }

async function explodeMapping(
  restaurantGuid: string,
  toastItemGuid: string,
  baseQty: number,
  acc: Map<string, Map<string, number>>, // inventoryItemId -> unit -> qty
  visited: Set<string>,
  activeModifierOptionGuid?: string | null
) {
  if (visited.has(toastItemGuid)) return;
  visited.add(toastItemGuid);
  const mappingDoc = await MenuMapping.findOne({ restaurantGuid, toastItemGuid }).lean() as any;
  if (!mappingDoc) return;
  for (const c of (mappingDoc.components || [])) {
    if (c?.modifierOptionGuid) {
      if (!activeModifierOptionGuid) continue;
      if (String(c.modifierOptionGuid) !== String(activeModifierOptionGuid)) continue;
    }
    if (c.kind === 'inventory' && c.inventoryItem) {
      const unit = String(c.unit || 'units');
      const q = Number(c.quantity || 0) * baseQty;
      if (!acc.has(String(c.inventoryItem))) acc.set(String(c.inventoryItem), new Map());
      const byUnit = acc.get(String(c.inventoryItem))!;
      byUnit.set(unit, (byUnit.get(unit) || 0) + q);
    } else if (c.kind === 'menu' && c.nestedToastItemGuid) {
      await explodeMapping(restaurantGuid, c.nestedToastItemGuid, baseQty * Number(c.quantity || 0), acc, visited, activeModifierOptionGuid);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');
    if (!restaurantGuid) {
      return NextResponse.json({ success: false, error: 'restaurantGuid required' }, { status: 400 });
    }
    const businessDate = searchParams.get('businessDate') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const pageSize = searchParams.get('pageSize') || '100';
    const activeModifierOptionGuid = searchParams.get('modifierOptionGuid');

    const client = new ToastAPIClient();
    const orders = await fetchOrdersBulk(client, restaurantGuid, {
      ...(businessDate ? { businessDate } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      pageSize,
    });

    const sold = await buildSoldMap(orders);

    // Aggregate inventory usage (keep raw units for now)
    const acc = new Map<string, Map<string, number>>();
    for (const [toastItemGuid, qty] of Object.entries(sold)) {
      await explodeMapping(restaurantGuid, toastItemGuid, qty, acc, new Set(), activeModifierOptionGuid);
    }

    // Build response rows normalized to each item's main unit
    const rows: UsageRow[] = [];
    for (const [invId, byUnit] of acc.entries()) {
      const item: any = await InventoryItem.findById(invId).lean();
      const itemUnit = String(item?.unit || 'each');
      let total = 0;
      for (const [unit, quantity] of byUnit.entries()) {
        total += convertQuantity(Number(quantity || 0), String(unit), itemUnit);
      }
      rows.push({ inventoryItem: String(invId), unit: itemUnit, quantity: total });
    }

    return NextResponse.json({ success: true, data: { sold, usage: rows } });
  } catch (e) {
    console.error('GET /api/menu-mappings/usage error', e);
    return NextResponse.json({ success: false, error: 'Failed to compute usage' }, { status: 500 });
  }
}


