import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { InventoryItem } from '@/lib/models/InventoryItem';

export async function GET(_req: NextRequest) {
  try {
    await connectDB();

    // Low stock alerts
    const lowStock = await InventoryItem.find({ $or: [
      { status: 'critical' },
      { status: 'low' }
    ] }).sort({ updatedAt: -1 }).limit(10).lean();

    // Recent waste logs (last 24h)
    const since = new Date(Date.now() - 24*60*60*1000);
    const wasteItems = await InventoryItem.find({ 'wasteLogs.0': { $exists: true } }, { name: 1, unit: 1, wasteLogs: 1, updatedAt: 1 }).lean();
    const wasteLogs: Array<{ name: string; quantity: number; unit?: string; reason?: string; date: Date }> = [];
    for (const it of wasteItems) {
      for (const wl of (it.wasteLogs || [])) {
        const d = new Date(wl.date || Date.now());
        if (d >= since) wasteLogs.push({ name: it.name, quantity: wl.quantity, unit: it.unit, reason: wl.reason, date: d });
      }
    }

    const activities: Array<{ id: string; type: string; message: string; time: string; status: 'success'|'warning'|'info' }>= [];

    for (const i of lowStock) {
      activities.push({
        id: `low-${i._id}`,
        type: 'inventory',
        message: `Low stock: ${i.name}`,
        time: new Date(i.updatedAt || Date.now()).toISOString(),
        status: i.status === 'critical' ? 'warning' : 'info',
      });
    }
    for (const w of wasteLogs) {
      activities.push({
        id: `waste-${w.name}-${w.date.getTime()}`,
        type: 'waste',
        message: `Waste logged: ${w.quantity} ${w.unit || ''} ${w.name}${w.reason ? ` (${w.reason})` : ''}`,
        time: w.date.toISOString(),
        status: 'warning',
      });
    }

    activities.sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return NextResponse.json({ success: true, data: activities.slice(0, 20) });
  } catch (e) {
    console.error('GET /api/activity/recent error', e);
    return NextResponse.json({ success: false, error: 'Failed to load recent activity' }, { status: 500 });
  }
}


