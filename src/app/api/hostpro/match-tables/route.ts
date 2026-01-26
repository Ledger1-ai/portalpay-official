import { NextRequest, NextResponse } from 'next/server';
import { ToastTablesClient } from '@/lib/services/toast-tables-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids : [];

    const url = process.env.TOAST_API_URL || '';
    const restaurantId = process.env.TOAST_RESTAURANT_ID || '';
    const token = process.env.TOAST_ACCESS_TOKEN || '';

    // If Toast is not configured, don't attempt network call — return graceful no-op
    const isConfigured = Boolean(url && restaurantId && token) && !/toast-api-server/i.test(url);
    if (!isConfigured) {
      return NextResponse.json({
        success: true,
        data: {
          matchedCount: 0,
          total: ids.length,
          matched: {},
          unmatched: ids,
          suggestions: {},
          note: 'Toast integration not configured; set TOAST_API_URL, TOAST_RESTAURANT_ID, TOAST_ACCESS_TOKEN to enable matching.'
        }
      });
    }

    const client = new ToastTablesClient(restaurantId);
    const result = await client.fetchTablesByFloorPlan(ids);
    return NextResponse.json({
      success: true,
      data: {
        matchedCount: Object.keys(result.matched || {}).length,
        total: ids.length,
        matched: result.matched,
        unmatched: result.unmatched,
        suggestions: result.suggestions,
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}


