import { NextRequest, NextResponse } from 'next/server';
import { FLOOR_PRESETS } from '@/lib/host/presets';

export async function GET(_req: NextRequest) {
  return NextResponse.json({ success: true, data: FLOOR_PRESETS });
}


