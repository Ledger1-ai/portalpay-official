import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { InventoryItem } from '@/lib/models/InventoryItem';

export async function GET(_req: NextRequest) {
  try {
    await connectDB();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const items = await InventoryItem.find({ 'wasteLogs.0': { $exists: true } }, { name: 1, unit: 1, wasteLogs: 1 })
      .lean();
    const logs: Array<{ name: string; date: string; quantity: number; unit?: string; reason?: string } > = [];
    for (const it of items) {
      for (const wl of (it.wasteLogs || [])) {
        const d = new Date(wl.date || Date.now());
        if (d >= since) {
          logs.push({ name: it.name, date: d.toISOString(), quantity: wl.quantity, unit: it.unit, reason: wl.reason });
        }
      }
    }
    logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return NextResponse.json({ success: true, data: logs.slice(0, 50) });
  } catch (e) {
    console.error('GET /api/inventory/waste error', e);
    return NextResponse.json({ success: false, error: 'Failed to load waste logs' }, { status: 500 });
  }
}


