import { NextRequest, NextResponse } from 'next/server';
import mongoose, { Schema, Document } from 'mongoose';
import { connectDB } from '@/lib/db/connection';

interface IDomainPreset extends Document {
  name: string;
  regions: Array<{ id: string; name: string; color: string; tableIds: string[] }>;
}

const DomainPresetSchema = new Schema<IDomainPreset>({
  name: { type: String, required: true, unique: true },
  regions: { type: [new Schema({ id: String, name: String, color: String, tableIds: [String] }, { _id: false })], default: [] },
}, { timestamps: true });

const DomainPreset = (mongoose.models.DomainPreset as mongoose.Model<IDomainPreset>) || mongoose.model<IDomainPreset>('DomainPreset', DomainPresetSchema);

export async function GET() {
  try {
    await connectDB();
    const list = await DomainPreset.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: list });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const regions = Array.isArray(body?.regions) ? body.regions : [];
    if (!name) return NextResponse.json({ success: false, error: 'Name required' }, { status: 400 });
    const doc = await DomainPreset.findOneAndUpdate({ name }, { name, regions }, { upsert: true, new: true, setDefaultsOnInsert: true });
    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}

