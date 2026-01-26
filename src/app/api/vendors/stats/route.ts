import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { PurchaseOrder } from "@/lib/models/PurchaseOrder";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get('vendorId');

    const query: any = {};
    if (vendorId) query.supplier = vendorId;

    // Populate inventoryItem for category aggregation
    const orders = await PurchaseOrder.find(query)
      .populate('supplier', 'name companyName supplierCode')
      .populate('items.inventoryItem', 'category')
      .lean();

    const byVendor: Record<string, any> = {};

    for (const o of orders as any[]) {
      const vKey = String(o.supplier?._id || o.supplier || o.supplierName || 'unknown');
      if (!byVendor[vKey]) {
        byVendor[vKey] = {
          vendorId: o.supplier?._id || o.supplier || null,
          vendorName: o.supplier?.name || o.supplierName || 'Unknown',
          fullyReceived: 0,
          partial: 0,
          ordered: 0,
          draft: 0,
          cancelled: 0,
          totalOrders: 0,
          totalSpent: 0,
          itemsOrdered: 0,
          categories: {} as Record<string, { qty: number; spent: number }>,
        };
      }

      const v = byVendor[vKey];
      v.totalOrders += 1;
      switch (o.status) {
        case 'received': v.fullyReceived += 1; break;
        case 'partially_received': v.partial += 1; break;
        case 'sent': v.ordered += 1; break;
        case 'draft': v.draft += 1; break;
        case 'cancelled': v.cancelled += 1; break;
      }
      v.totalSpent += Number(o.total || 0);

      for (const it of (o.items || [])) {
        const qty = Number(it.quantityOrdered || 0);
        const line = Number(it.unitCost || 0) * qty;
        v.itemsOrdered += qty;
        const cat = it.inventoryItem?.category || 'Uncategorized';
        if (!v.categories[cat]) v.categories[cat] = { qty: 0, spent: 0 };
        v.categories[cat].qty += qty;
        v.categories[cat].spent += line;
      }
    }

    const result = vendorId ? Object.values(byVendor)[0] || null : Object.values(byVendor);
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    console.error('GET /api/vendors/stats error', e);
    return NextResponse.json({ success: false, error: 'Failed to compute vendor stats' }, { status: 500 });
  }
}


