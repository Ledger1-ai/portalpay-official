import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import HostSession from '@/lib/models/HostSession';
import { getPreset } from '@/lib/host/presets';

function computeDomainCapacity(presetSlug: string, domainIds: string[]): number {
  const preset = getPreset(presetSlug);
  if (!preset) return 0;
  const set = new Set(domainIds.flatMap((d) => preset.domains.find(x => x.id === d || x.name === d)?.tableIds || []));
  let total = 0;
  for (const id of set) {
    const t = preset.tables.find(tb => tb.id === id);
    total += t?.capacity || 0;
  }
  return total;
}

export async function GET() {
  await connectDB();
  const live = await HostSession.findOne({ status: 'live' }).lean();
  if (!live) return NextResponse.json({ success: true, data: null });
  // Cast to any to satisfy TS when using lean() result
  return NextResponse.json({ success: true, data: { assignments: (live as any).assignments || [] } });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { assignments, servers: providedServers } = body || {};
  const live = await HostSession.findOne({ status: 'live' });
  if (!live) return NextResponse.json({ success: false, error: 'No live session' }, { status: 404 });
  if (Array.isArray(assignments)) {
    live.assignments = assignments;
    live.assignmentsLocked = true;
    await live.save();
    return NextResponse.json({ success: true, data: live.assignments });
  }
  // Auto assign domains evenly by capacity
  const preset = getPreset(live.presetSlug);
  if (!preset) return NextResponse.json({ success: false, error: 'Preset missing' }, { status: 400 });
  // Only include eligible active Servers for auto-assignment. Prefer provided servers if present
  const sourceServers: Array<any> = Array.isArray(providedServers) ? providedServers : (live.servers || []);
  const serverIds: string[] = sourceServers
    .filter((s: any) => String(s.role) === 'Server' && s.isActive)
    .map((s: any) => String(s.id));
  if (!serverIds.length) {
    live.assignments = [];
    await live.save();
    return NextResponse.json({ success: true, data: live.assignments });
  }
  // Prefer locked domains from the live session (persisted regions) if present
  const activeDomains: Array<{ id: string; name: string; tableIds?: string[] }> = Array.isArray((live as any).domains) && (live as any).domains.length
    ? (live as any).domains as any
    : preset.domains.map(d => ({ id: d.id, name: d.name, tableIds: (d as any).tableIds || [] })) as any;
  // Compute capacity from preset tables for consistency
  const domains = activeDomains.map(d => ({ id: d.id, name: d.name, cap: computeDomainCapacity(preset.slug, [d.id]) }));
  domains.sort((a, b) => b.cap - a.cap);
  const buckets = serverIds.map((id) => ({ serverId: id, cap: 0, domainIds: [] as string[] }));
  for (const d of domains) {
    buckets.sort((a, b) => a.cap - b.cap);
    buckets[0].domainIds.push(d.id);
    buckets[0].cap += d.cap;
  }
  live.assignments = buckets.map(b => ({ serverId: b.serverId, domainIds: b.domainIds }));
  live.assignmentsLocked = true;
  await live.save();
  return NextResponse.json({ success: true, data: live.assignments });
}


