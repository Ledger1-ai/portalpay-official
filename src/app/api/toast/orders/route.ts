import { NextRequest, NextResponse } from 'next/server';
import ToastCompleteAPI from '@/lib/services/toast-complete-api';
import ToastAPIClient from '@/lib/services/toast-api-client';
import { connectDB } from '@/lib/db/connection';
import HostSession from '@/lib/models/HostSession';
import ToastEmployee from '@/lib/models/ToastEmployee';
import { ToastTablesClient } from '@/lib/services/toast-tables-client';
import { isDemoMode, isDemoStubsEnabled } from '@/lib/config/demo';
import { loadEnv } from '@/lib/config/load-env';

export async function GET(request: NextRequest) {
  try {
    // Ensure environment variables are loaded for runtime demo mode detection
    loadEnv();
    const { searchParams } = new URL(request.url);
    const restaurantGuid = searchParams.get('restaurantGuid') || process.env.TOAST_RESTAURANT_ID || '';
    const startDate = searchParams.get('startDate') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const endDate = searchParams.get('endDate') || new Date().toISOString();

    if (!restaurantGuid) {
      return NextResponse.json({
        error: 'restaurantGuid is required',
      }, { status: 400 });
    }

    // In demo mode, reflect occupancy from HostSession instead of Toast
    if (isDemoMode() && isDemoStubsEnabled()) {
      await connectDB();
      const live = await HostSession.findOne({ status: 'live' }).lean();
      const seatings: Array<{ id: string; serverId: string; tableId: string; startedAt: Date; status: string }>
        = Array.isArray(live?.seatings) ? (live!.seatings as any) : [];
      const open = seatings.filter(s => String(s.status) === 'seated');
      const demoOrders = open.map((s) => ({
        guid: s.id,
        orderNumber: s.id,
        totalAmount: 0,
        amount: 0,
        orderStatus: 'OPEN',
        createdDate: (s.startedAt ? new Date(s.startedAt) : new Date()).toISOString(),
        table: { externalId: String(s.tableId) },
        server: { externalId: String(s.serverId) },
        checks: [{}],
      }));
      return NextResponse.json({ success: true, data: demoOrders, count: demoOrders.length, timestamp: new Date().toISOString() });
    }

    const toastAPI = new ToastCompleteAPI();
    const orders = await toastAPI.getOrders(restaurantGuid, startDate, endDate);

    return NextResponse.json({
      success: true,
      data: orders,
      count: orders.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Orders API error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Orders fetch failed',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Create a new Toast order and attach it to a server and table
export async function POST(request: NextRequest) {
  try {
    // Ensure environment variables are loaded for runtime demo mode detection
    loadEnv();
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const {
      serverId, // 7shifts user id (number or string)
      tableId,  // floor-plan table id like '24' or Toast table guid
      partySize = 2,
      diningOptionGuid: providedDiningOptionGuid,
    } = body || {};

    const restaurantGuid = process.env.TOAST_RESTAURANT_ID || '';
    if (!restaurantGuid) return NextResponse.json({ success: false, error: 'Restaurant ID missing' }, { status: 500 });

    // Resolve server (Toast RestaurantUser guid) via mapping table
    let serverGuid: string | undefined;
    try {
      const emp = await ToastEmployee.findOne({ sevenShiftsId: Number(serverId) }).lean();
      serverGuid = (emp as any)?.toastGuid;
    } catch {}

    // Resolve table guid by GUID or by name matching
    let toastTableGuid: string | undefined;
    try {
      const tablesClient = new ToastTablesClient();
      // Try GUID fetch first
      const asGuid = await tablesClient.fetchTableByGuid(String(tableId));
      if (asGuid?.guid) {
        toastTableGuid = asGuid.guid;
      } else {
        const byNames = await tablesClient.fetchTablesByFloorPlan([String(tableId)]);
        const match = byNames.matched[String(tableId)];
        if (match?.guid) toastTableGuid = match.guid;
      }
    } catch {}

    // Determine dining option guid
    const diningOptionGuid = String(providedDiningOptionGuid || process.env.TOAST_DINING_OPTION_GUID || '');
    if (!diningOptionGuid) {
      return NextResponse.json({ success: false, error: 'Dining option guid not configured (TOAST_DINING_OPTION_GUID)' }, { status: 500 });
    }

    // Compose order payload (minimal, dine-in)
    const nowIso = new Date().toISOString();
    const orderGuid = (globalThis as any).crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const checkGuid = (globalThis as any).crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const payload: any = {
      guid: orderGuid,
      entityType: 'Order',
      openedDate: nowIso,
      createdDate: nowIso,
      numberOfGuests: Number(partySize) || 2,
      source: 'API',
      diningOption: { guid: diningOptionGuid, entityType: 'DiningOption' },
      checks: [
        {
          guid: checkGuid,
          entityType: 'Check',
          openedDate: nowIso,
          selections: [],
        },
      ],
    };
    if (serverGuid) payload.server = { guid: serverGuid, entityType: 'RestaurantUser' };
    if (toastTableGuid) payload.table = { guid: toastTableGuid, entityType: 'Table' };

    // In demo mode, don't call Toast. Simulate a successful order creation.
    let resp: any = { guid: orderGuid };
    if (!isDemoMode() || isDemoStubsEnabled()) {
      const client = new ToastAPIClient();
      const headers = { 'Toast-Restaurant-External-ID': restaurantGuid } as Record<string, string>;
      resp = await client.makeRequest<any>('/orders/v2/orders', 'POST', JSON.stringify(payload), undefined, headers);
    }

    // Persist the order guid on the latest seating for this server/table if available
    try {
      const live = await HostSession.findOne({ status: 'live' });
      if (live) {
        // Find the most recent seating for serverId without toastOrderGuid
        const idx = (live.seatings || []).slice().reverse().findIndex((s: any) => String(s.serverId) === String(serverId) && (!s.toastOrderGuid));
        if (idx >= 0) {
          const actual = live.seatings.length - 1 - idx;
          (live.seatings as any)[actual].toastOrderGuid = resp?.guid || orderGuid;
          await live.save();
        }
      }
    } catch {}

    return NextResponse.json({ success: true, data: resp });
  } catch (error) {
    console.error('POST /api/toast/orders error', error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create order' }, { status: 500 });
  }
}