import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { MenuMapping } from '@/lib/models/MenuMapping';
import { InventoryItem } from '@/lib/models/InventoryItem';
import { convertQuantity } from '@/lib/units';

async function computeCost(restaurantGuid: string, toastItemGuid: string, visited = new Set<string>()): Promise<number> {
  if (visited.has(toastItemGuid)) return 0; // prevent cycles
  visited.add(toastItemGuid);

  const mapping = await MenuMapping.findOne({ restaurantGuid, toastItemGuid }).lean();
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
      // cost of nested mapping multiplied by the menu quantity
      const nestedCost = await computeCost(restaurantGuid, c.nestedToastItemGuid, visited);
      total += nestedCost * Number(c.quantity || 1);
    }
  }
  return total;
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');
    const toastItemGuid = searchParams.get('toastItemGuid');
    if (!restaurantGuid || !toastItemGuid) {
      return NextResponse.json({ success: false, error: 'restaurantGuid and toastItemGuid required' }, { status: 400 });
    }

    const cost = await computeCost(restaurantGuid, toastItemGuid);
    return NextResponse.json({ success: true, data: { cost } });
  } catch (e) {
    console.error('GET /api/menu-mappings/cost error', e);
    return NextResponse.json({ success: false, error: 'Failed to compute cost' }, { status: 500 });
  }
}


