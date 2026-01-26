import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import HostSession from '@/lib/models/HostSession';
import { ToastTablesClient } from '@/lib/services/toast-tables-client';

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { serverId, tableId, partySize, advancePointer } = body || {};
  const live = await HostSession.findOne({ status: 'live' });
  if (!live) return NextResponse.json({ success: false, error: 'No live session' }, { status: 404 });
  // Reserve the table
  live.tableOccupied[tableId] = true;
  const seatId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  // Try to resolve Toast table guid/name for tracking
  let toastTableName: string | undefined;
  try {
    const client = new ToastTablesClient();
    const table = await client.fetchTableByGuid(String(tableId));
    toastTableName = table?.name || undefined;
  } catch {}
  live.seatings.push({ id: seatId, serverId, tableId, partySize: Number(partySize || 0), startedAt: new Date(), status: 'seated', toastTableName } as any);
  // Update lastActiveAt timestamp for TTL-based visibility of inactive members
  try {
    live.servers = (live.servers || []).map((s: any) => String(s.id) === String(serverId) ? { ...s, lastActiveAt: new Date() } : s);
  } catch {}
  // Advance rotation pointer if live
  const shouldAdvance = (advancePointer === undefined ? true : Boolean(advancePointer));
  if (shouldAdvance && Array.isArray(live.rotation?.order) && live.rotation.order.length) {
    live.rotation.pointer = (live.rotation.pointer + 1) % live.rotation.order.length;
  }
  await live.save();
  return NextResponse.json({ success: true, data: live });
}


