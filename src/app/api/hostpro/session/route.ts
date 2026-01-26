import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import HostSession from '@/lib/models/HostSession';
import { getPreset } from '@/lib/host/presets';

export async function GET() {
  await connectDB();
  const live = await HostSession.findOne({ status: 'live' }).sort({ startedAt: -1 });
  if (!live) return NextResponse.json({ success: true, data: null });
  // Keep rotation stable in demo; only clamp pointer if needed
  try {
    const currentOrder: string[] = Array.isArray(live.rotation?.order) ? (live.rotation.order as any).map(String) : [];
    let pointer = Math.max(0, Math.min(Number(live.rotation?.pointer || 0), Math.max(0, currentOrder.length - 1)));
    if (pointer !== (live.rotation?.pointer || 0)) {
      live.rotation = { isLive: Boolean(live.rotation?.isLive), order: currentOrder, pointer } as any;
      await live.save();
    }
  } catch {}
  return NextResponse.json({ success: true, data: live.toObject() });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { presetSlug, servers } = body || {};
  const preset = getPreset(String(presetSlug || '3-plus-2-bar'));
  if (!preset) return NextResponse.json({ success: false, error: 'Preset not found' }, { status: 400 });
  // End any live session
  await HostSession.updateMany({ status: 'live' }, { $set: { status: 'ended', endedAt: new Date() } });
  // Only include eligible servers in rotation (active Servers role)
  const eligible = Array.isArray(servers) ? servers.filter((s: any) => String(s.role) === 'Server' && s.isActive) : [];
  const rotation = { isLive: false, order: eligible.map((s: any) => String(s.id)), pointer: 0 };
  const doc = await HostSession.create({
    presetSlug: preset.slug,
    presetName: preset.name,
    servers: eligible,
    assignments: [],
    tableOccupied: {},
    seatings: [],
    startedAt: new Date(),
    status: 'live',
    rotation,
  });
  return NextResponse.json({ success: true, data: doc });
}

export async function PUT(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { rotation, assignments, tableOccupied, seatings } = body || {};
  const live = await HostSession.findOne({ status: 'live' });
  if (!live) return NextResponse.json({ success: false, error: 'No live session' }, { status: 404 });
  if (rotation) live.rotation = rotation;
  if (assignments) live.assignments = assignments;
  if (tableOccupied) live.tableOccupied = tableOccupied;
  if (seatings) live.seatings = seatings;
  await live.save();
  return NextResponse.json({ success: true, data: live });
}

export async function DELETE(req: NextRequest) {
  await connectDB();
  const url = new URL(req.url);
  const wipe = url.searchParams.get('wipe');
  if (String(wipe).toLowerCase() === 'true') {
    await HostSession.deleteMany({});
    return NextResponse.json({ success: true, data: null });
  }
  const live = await HostSession.findOne({ status: 'live' });
  if (!live) return NextResponse.json({ success: true, data: null });
  live.status = 'ended';
  live.endedAt = new Date();
  await live.save();
  return NextResponse.json({ success: true, data: live });
}


