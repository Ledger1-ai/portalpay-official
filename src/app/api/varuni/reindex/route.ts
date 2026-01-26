import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { InventoryItem } from '@/lib/models/InventoryItem';
import { Supplier } from '@/lib/models/Supplier';
import { Recipe } from '@/lib/models/Recipe';
import { embedText, upsertEmbedding } from '@/lib/services/rag';

export async function POST(req: NextRequest) {
  try {
    if (process.env.VARUNI_RAG_ENABLED !== 'true') {
      return NextResponse.json({ success: false, message: 'RAG disabled' }, { status: 400 });
    }
    await connectDB();
    const { namespace } = await req.json().catch(() => ({}));
    const ns = String(namespace || 'global');

    // Index key entities
    const items = await InventoryItem.find({}).limit(2000).lean();
    for (const it of items) {
      const text = `InventoryItem ${it.name} (${it.category}) stock=${it.currentStock} ${it.unit}, min=${it.minThreshold}, status=${it.status}, supplier=${it.supplier}`;
      await upsertEmbedding(ns, 'InventoryItem', String((it as any)._id), text, { name: it.name, category: it.category });
    }
    const vendors = await Supplier.find({}).limit(2000).lean();
    for (const v of vendors) {
      const text = `Vendor ${v.name} company=${v.companyName} preferred=${v.preferred ? 'yes' : 'no'} categories=${(v.categories||[]).join(', ')}`;
      await upsertEmbedding(ns, 'Supplier', String((v as any)._id), text, { name: v.name });
    }
    const recipes = await Recipe.find({}).limit(2000).lean();
    for (const r of recipes) {
      const text = `Recipe ${r.name} foodCost=${r.foodCost} grossMargin=${r.grossMargin}`;
      await upsertEmbedding(ns, 'Recipe', String((r as any)._id), text, { name: r.name });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    console.error('Varuni reindex error', e);
    return NextResponse.json({ success: false, error: e?.message || 'Reindex failed' }, { status: 500 });
  }
}

export const GET = async () => new NextResponse('Method Not Allowed', { status: 405 });

