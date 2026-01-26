import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import HostSession from '@/lib/models/HostSession';

export async function GET() {
  await connectDB();
  const live = await HostSession.findOne({ status: 'live' }).lean();
  if (!live) return NextResponse.json({ success: true, data: null });
  return NextResponse.json({ success: true, data: { domains: live.domains || [], layoutSlug: live.layoutSlug, locked: !!live.domainsLocked } });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));
  const { domains, layoutSlug } = body || {};
  const live = await HostSession.findOne({ status: 'live' });
  if (!live) return NextResponse.json({ success: false, error: 'No live session' }, { status: 404 });
  if (Array.isArray(domains)) live.domains = domains;
  if (typeof layoutSlug === 'string') live.layoutSlug = layoutSlug;
  live.domainsLocked = true;
  await live.save();
  return NextResponse.json({ success: true, data: { domains: live.domains, layoutSlug: live.layoutSlug, locked: !!live.domainsLocked } });
}


