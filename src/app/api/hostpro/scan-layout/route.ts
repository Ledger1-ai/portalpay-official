import { NextRequest, NextResponse } from 'next/server';
import FloorLayout from '@/lib/models/FloorLayout';
import { connectDB } from '@/lib/db/connection';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug') || undefined;
    const all = searchParams.get('all');
    if (all) {
      const list = await FloorLayout.find({}).sort({ updatedAt: -1 }).lean();
      return NextResponse.json({ success: true, data: list });
    }
    if (slug) {
      const one = await FloorLayout.findOne({ slug }).lean();
      return NextResponse.json({ success: true, data: one || null });
    }
    // Default: return most recently updated layout
    const latest = await FloorLayout.findOne({}).sort({ updatedAt: -1 }).lean();
    return NextResponse.json({ success: true, data: latest || null });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const slug = body?.slug || 'default';
    const payload = {
      slug,
      imagePath: body?.imagePath || undefined,
      width: Number(body?.width || 1200),
      height: Number(body?.height || 800),
      tables: Array.isArray(body?.tables) ? body.tables : [],
      walls: Array.isArray(body?.walls) ? body.walls : [],
      labels: Array.isArray(body?.labels) ? body.labels : [],
      cachedAt: new Date(),
    };
    const saved = await FloorLayout.findOneAndUpdate({ slug }, payload, { upsert: true, new: true, setDefaultsOnInsert: true });
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');
    if (!slug) return NextResponse.json({ success: false, error: 'slug required' }, { status: 400 });
    // Prevent deletion of the latest (default) layout
    const latest: any = await FloorLayout.findOne({}).sort({ updatedAt: -1 }).lean();
    if (latest && String((latest as any).slug) === String(slug)) {
      return NextResponse.json({ success: false, error: 'Cannot delete the latest layout' }, { status: 400 });
    }
    await FloorLayout.deleteOne({ slug });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}


