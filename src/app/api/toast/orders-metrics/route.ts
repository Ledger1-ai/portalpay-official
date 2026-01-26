import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db/connection';
import { Analytics } from '@/lib/models/Analytics';
import ToastAPIClient from '@/lib/services/toast-api-client';
import { getDefaultTimeZone, formatYMDInTimeZone, getDayRangeForYmdInTz } from '@/lib/timezone';
import { isDemoMode, getDemoNow } from '@/lib/config/demo';

let cachedTimeZone: string | null = null;

function resolveTimeZone(defaultTz = getDefaultTimeZone()): string {
  // Prefer explicit env override; fall back to cached or default
  const tz = process.env.TOAST_TIMEZONE || cachedTimeZone || defaultTz;
  return tz;
}

async function ensureTimeZone(client: ToastAPIClient, restaurantGuid: string) {
  if (process.env.TOAST_TIMEZONE) {
    cachedTimeZone = process.env.TOAST_TIMEZONE;
    return cachedTimeZone;
  }
  if (cachedTimeZone) return cachedTimeZone;
  try {
    const restaurant = await client.getRestaurant(restaurantGuid);
    if ((restaurant as any)?.timeZone) {
      cachedTimeZone = (restaurant as any).timeZone as string;
    }
  } catch {
    // ignore, use default
  }
  return resolveTimeZone();
}

function formatBusinessDateYMD(tz: string, d = new Date()): string {
  return formatYMDInTimeZone(tz, d);
}

function formatBusinessDateCompact(tz: string, d = new Date()): string {
  // Build yyyyMMdd required by Toast Orders Bulk
  const ymd = formatBusinessDateYMD(tz, d); // YYYY-MM-DD
  return ymd.replaceAll('-', '');
}

export async function GET(request: NextRequest) {
  try {
    // In demo mode, short-circuit with fresh, current-day metrics and upsert cache
    if (isDemoMode()) {
      const tz = getDefaultTimeZone();
      const now = getDemoNow();
      const ymd = formatYMDInTimeZone(tz, now);
      const { start: dayStartLocal, end: dayEndLocal } = getDayRangeForYmdInTz(tz, ymd);
      const revenue = 6842;
      const ordersCompleted = 142;
      const avgOrderValue = ordersCompleted > 0 ? revenue / ordersCompleted : 0;
      const avgTurnoverMinutes = 12.8;
      try {
        await connectDB();
        await Analytics.updateOne(
          { period: 'daily', date: { $gte: dayStartLocal, $lte: dayEndLocal } },
          { $set: { period: 'daily', date: dayStartLocal, revenue, orders: ordersCompleted, avgOrderValue } },
          { upsert: true }
        );
      } catch {}
      return NextResponse.json({
        success: true,
        data: {
          date: ymd,
          ordersCompleted,
          revenue,
          avgOrderValue,
          avgTurnoverMinutes,
        },
        lastUpdatedAt: new Date().toISOString(),
        nextSuggestedRefreshAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        cached: false,
        timeZone: tz,
      });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const force = (searchParams.get('force') || '').toLowerCase() === 'true';
    const restaurantGuid = process.env.TOAST_RESTAURANT_ID || '';

    if (!restaurantGuid) {
      return NextResponse.json({ success: false, error: 'Missing TOAST_RESTAURANT_ID' }, { status: 400 });
    }

    const now = new Date();

    // Try cache (Analytics daily doc for today)
    // Cache key by calendar date in restaurant timezone
    const client = new ToastAPIClient();
    const timeZone = await ensureTimeZone(client, restaurantGuid);
    const businessDateYMD = formatBusinessDateYMD(timeZone, now); // YYYY-MM-DD in restaurant TZ
    const businessDateParam = formatBusinessDateCompact(timeZone, now); // yyyyMMdd
    const { start: dayStartLocal, end: dayEndLocal } = getDayRangeForYmdInTz(timeZone, businessDateYMD);

    const existing = await Analytics.findOne({ period: 'daily', date: { $gte: dayStartLocal, $lte: dayEndLocal } }).lean() as any;
    const updatedAt = existing?.updatedAt ? new Date(existing.updatedAt) : null;
    const isFresh = updatedAt ? (now.getTime() - updatedAt.getTime()) < 2 * 60 * 1000 : false; // 2 minutes to avoid stale partials

    if (existing && isFresh && !force) {
      const avgOrderValue = existing.orders > 0 ? (existing.revenue || 0) / existing.orders : 0;
      return NextResponse.json({
        success: true,
        data: {
          date: businessDateYMD,
          ordersCompleted: existing.orders || 0,
          revenue: existing.revenue || 0,
          avgOrderValue,
        },
        lastUpdatedAt: updatedAt?.toISOString() || null,
        nextSuggestedRefreshAt: new Date((updatedAt?.getTime() || now.getTime()) + 2 * 60 * 1000).toISOString(),
        cached: true,
        timeZone,
      });
    }

    // Fetch fresh data from Toast Orders Bulk
    const headers = { 'Toast-Restaurant-External-ID': restaurantGuid } as Record<string, string>;
    
    // Use businessDate to align with restaurant local day and fetch all pages
    let page = 1; // Toast requires page >= 1
    const pageSize = 100; // Toast caps pageSize at 100
    const allOrders: any[] = [];
    // Try a few pages defensively; stop when empty
    // Some Toast tenants may not support pagination; handle both
    let full = true;
    for (let i = 0; i < 20; i++) {
      const params: Record<string, string> = { businessDate: businessDateParam, page: String(page), pageSize: String(pageSize) };
      try {
        const resp = await client.makeRequest<any>(
          '/orders/v2/ordersBulk',
          'GET',
          undefined,
          params,
          headers
        );
        const arr: any[] = Array.isArray(resp) ? resp : ((resp as any)?.data || []);
        allOrders.push(...arr);
        if (!Array.isArray(resp)) {
          if ((resp as any)?.hasMore === true) {
            page += 1;
            if (arr.length === 0) break;
          } else {
            break;
          }
        } else {
          if (arr.length < pageSize) break;
          page += 1;
        }
      } catch (e) {
        full = false;
        break;
      }
    }
    const ordersArray: any[] = allOrders;

    // Determine if an order is completed based on its checks/payments
    const isOrderCompleted = (o: any): boolean => {
      if (!o || o.voided === true) return false;
      if (o.closedDate) return true;
      if (o.paymentStatus && String(o.paymentStatus).toUpperCase() !== 'OPEN') return true;
      const checks = Array.isArray(o.checks) ? o.checks : [];
      return checks.some((c: any) => {
        if (c?.closedDate) return true;
        const payments = Array.isArray(c?.payments) ? c.payments : [];
        return payments.some((p: any) => p?.paidDate || (p?.paymentStatus && String(p.paymentStatus).toUpperCase() !== 'OPEN'));
      });
    };

    const completedOrders = ordersArray.filter(isOrderCompleted);
    const ordersCompleted = completedOrders.length;

    // Revenue: sum of base payment amounts excluding tips, minus refunds, across completed orders
    let totalTurnoverMs = 0;
    let turnoverCount = 0;
    const revenue = completedOrders.reduce((sum: number, o: any) => {
      const checks = Array.isArray(o.checks) ? o.checks : [];
      const orderBase = checks.reduce((checkSum: number, c: any) => {
        const payments = Array.isArray(c?.payments) ? c.payments : [];
        const paidBase = payments.reduce((pSum: number, p: any) => {
          const amount = Number(p?.amount ?? 0);
          const tip = Number(p?.tipAmount ?? 0);
          const refund = Number((p?.refund && p.refund.refundAmount) ?? 0);
          // Net sales: amount excluding tips, minus refunds
          return pSum + Math.max(0, amount - tip) - refund;
        }, 0);
        // Accumulate turnover time (open -> close) when available
        const opened = c?.openedDate ? new Date(c.openedDate).getTime() : null;
        const closed = c?.closedDate ? new Date(c.closedDate).getTime() : null;
        if (opened && closed && closed > opened) {
          totalTurnoverMs += (closed - opened);
          turnoverCount += 1;
        }
        return checkSum + paidBase;
      }, 0);
      return sum + orderBase;
    }, 0);

    const avgOrderValue = ordersCompleted > 0 ? revenue / ordersCompleted : 0;
    const avgTurnoverMinutes = turnoverCount > 0 ? (totalTurnoverMs / turnoverCount) / 60000 : 0;

    // Upsert Analytics daily doc
    // Only cache if we completed pagination and values are not regressing
    const prevOrders = Number(existing?.orders || 0);
    if (full && ordersCompleted >= prevOrders) {
      await Analytics.updateOne(
        { period: 'daily', date: { $gte: dayStartLocal, $lte: dayEndLocal } },
        {
          $set: {
            period: 'daily',
            date: dayStartLocal,
            revenue,
            orders: ordersCompleted,
            avgOrderValue,
          },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        date: businessDateYMD,
        ordersCompleted,
        revenue,
        avgOrderValue,
        avgTurnoverMinutes,
      },
      lastUpdatedAt: new Date().toISOString(),
      nextSuggestedRefreshAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      cached: false,
      partial: !full,
      timeZone,
    });
  } catch (error) {
    console.error('GET /api/toast/orders-metrics error', error);
    return NextResponse.json({ success: false, error: 'Failed to compute orders metrics' }, { status: 500 });
  }
}


