import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { LabelTemplate } from '@/lib/models/LabelTemplate';

export async function GET() {
  try {
    await connectDB();
    const templates = await LabelTemplate.find({}).sort({ updatedAt: -1 });
    const active = await LabelTemplate.findOne({ isActive: true });
    return NextResponse.json({ success: true, templates, active });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to load templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { template, setActive } = body || {};
    if (!template) return NextResponse.json({ success: false, error: 'Missing template' }, { status: 400 });
    await connectDB();
    const created = await LabelTemplate.create({ ...template, isActive: Boolean(setActive) });
    if (setActive) {
      await LabelTemplate.updateMany({ _id: { $ne: created._id } }, { $set: { isActive: false } });
    }
    const templates = await LabelTemplate.find({}).sort({ updatedAt: -1 });
    const active = await LabelTemplate.findOne({ isActive: true });
    return NextResponse.json({ success: true, templates, active: active || created });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to save template' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, update, setActive } = body || {};
    await connectDB();
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
    await LabelTemplate.updateOne({ _id: id }, { $set: update || {} });
    if (typeof setActive === 'boolean') {
      await LabelTemplate.updateMany({}, { $set: { isActive: false } });
      await LabelTemplate.updateOne({ _id: id }, { $set: { isActive: setActive } });
    }
    const templates = await LabelTemplate.find({}).sort({ updatedAt: -1 });
    const active = await LabelTemplate.findOne({ isActive: true });
    return NextResponse.json({ success: true, templates, active });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
    await connectDB();
    const deleted = await LabelTemplate.findByIdAndDelete(id);
    // If the deleted template was active, set the latest as active
    if (deleted?.isActive) {
      const latest = await LabelTemplate.findOne({}).sort({ updatedAt: -1 });
      if (latest) await LabelTemplate.updateOne({ _id: latest._id }, { $set: { isActive: true } });
    }
    const templates = await LabelTemplate.find({}).sort({ updatedAt: -1 });
    const active = await LabelTemplate.findOne({ isActive: true });
    return NextResponse.json({ success: true, templates, active });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'Failed to delete template' }, { status: 500 });
  }
}


