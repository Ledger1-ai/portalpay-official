import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import HostSession from '@/lib/models/HostSession';
import { getPreset } from '@/lib/host/presets';

function getDomainTables(presetSlug: string, domainIds: string[]): string[] {
  const preset = getPreset(presetSlug);
  if (!preset) return [];
  const ids = new Set<string>();
  for (const did of domainIds) {
    const d = preset.domains.find(x => x.id === did || x.name === did);
    if (d) for (const t of d.tableIds) ids.add(t);
  }
  return Array.from(ids);
}

function capacityOfTables(presetSlug: string, tableIds: string[]): number {
  const preset = getPreset(presetSlug);
  if (!preset) return 0;
  let sum = 0;
  for (const id of tableIds) {
    sum += preset.tables.find(t => t.id === id)?.capacity || 0;
  }
  return sum;
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { partySize, preferredServerId } = body || {};
  const live = await HostSession.findOne({ status: 'live' });
  if (!live) return NextResponse.json({ success: false, error: 'No live session' }, { status: 404 });
  const preset = getPreset(live.presetSlug);
  if (!preset) return NextResponse.json({ success: false, error: 'Preset missing' }, { status: 400 });
  const rotationOrder = live.rotation?.order || [];
  let serverId: string | undefined = preferredServerId || rotationOrder[live.rotation.pointer] || (live.servers[0]?.id as any);
  const assignment = live.assignments.find((a: { serverId: string; domainIds: string[] }) => a.serverId === serverId);
  // If next-up has insufficient capacity free, suggest others
  const tableIds = getDomainTables(preset.slug, assignment?.domainIds || []);
  const availableTables = tableIds.filter(tid => !live.tableOccupied[tid]);
  const candidates = availableTables
    .map(tid => ({ tid, cap: preset.tables.find(t => t.id === tid)?.capacity || 0 }))
    .filter(t => t.cap >= partySize)
    .sort((a, b) => a.cap - b.cap);
  if (candidates.length === 0) {
    // search all servers
    const suggestions: Array<{ serverId: string; tableId: string; slack: number }> = [];
    for (const a of live.assignments) {
      const tids = getDomainTables(preset.slug, a.domainIds).filter(tid => !live.tableOccupied[tid]);
      for (const tid of tids) {
        const cap = preset.tables.find(t => t.id === tid)?.capacity || 0;
        if (cap >= partySize) suggestions.push({ serverId: a.serverId, tableId: tid, slack: cap - partySize });
      }
    }
    suggestions.sort((a, b) => a.slack - b.slack);
    return NextResponse.json({ success: true, data: { suggestions } });
  }
  // Default selection
  const picked = candidates[0];
  return NextResponse.json({ success: true, data: { serverId, tableId: picked.tid, slack: picked.cap - partySize, suggested: true } });
}


