import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import RobotCalibration from '@/lib/models/RobotCalibration';

export async function GET(req: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || 'default';
  const doc = await RobotCalibration.findOne({ slug }).lean();
  return NextResponse.json({ success: true, data: doc || null });
}

export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json();
  const slug = String(body.slug || 'default');
  const update = {
    slug,
    transform: body.transform || {},
    grid: body.grid || {},
    bounds: Array.isArray(body.bounds) ? body.bounds : [],
  };
  const doc = await RobotCalibration.findOneAndUpdate({ slug }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  return NextResponse.json({ success: true, data: doc });
}


