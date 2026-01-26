import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { MenuMapping } from '@/lib/models/MenuMapping';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid');
    const toastItemGuid = searchParams.get('toastItemGuid');
    const q: any = {};
    if (restaurantGuid) q.restaurantGuid = restaurantGuid;
    if (toastItemGuid) q.toastItemGuid = toastItemGuid;
    const docs = await MenuMapping.find(q).lean();
    return NextResponse.json({ success: true, data: docs });
  } catch (e) {
    console.error('GET /api/menu-mappings error', e);
    return NextResponse.json({ success: false, error: 'Failed to load menu mappings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { restaurantGuid, toastItemGuid, toastItemName, toastItemSku, components, recipeSteps } = body || {};
    if (!restaurantGuid || !toastItemGuid) {
      return NextResponse.json({ success: false, error: 'restaurantGuid and toastItemGuid required' }, { status: 400 });
    }
    const doc = await MenuMapping.findOneAndUpdate(
      { restaurantGuid, toastItemGuid },
      { restaurantGuid, toastItemGuid, toastItemName, toastItemSku, components, recipeSteps },
      { new: true, upsert: true }
    );
    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    console.error('POST /api/menu-mappings error', e);
    return NextResponse.json({ success: false, error: 'Failed to save menu mapping' }, { status: 500 });
  }
}


