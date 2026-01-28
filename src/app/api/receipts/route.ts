import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getContainer } from "@/lib/cosmos";
import { getSiteConfig } from "@/lib/site-config";
import { getReceipts, pushReceipts } from "@/lib/receipts-mem";
import { requireApimOrJwt } from "@/lib/gateway-auth";
import { requireCsrf, rateLimitOrThrow, rateKey } from "@/lib/security";
import { assertOwnershipOrAdmin } from "@/lib/auth";
import { getBrandConfig, computeSplitAmounts, getEffectiveProcessingFeeBps } from "@/config/brands";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReceiptLineItem = {
  label: string;
  priceUsd: number;
  qty?: number;
};

export type Receipt = {
  receiptId: string;
  totalUsd: number;
  currency: "USD";
  lineItems: ReceiptLineItem[];
  createdAt: number;
  brandName?: string;
  status?: string;
};

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 100)));
  let caller: any;
  try {
    caller = await requireApimOrJwt(req, ["receipts:read"]);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "unauthorized" },
      { status: e?.status || 401, headers: { "x-correlation-id": correlationId } }
    );
  }
  const wallet = caller.wallet;

  try {
    const container = await getContainer();
    const spec = {
      query:
        `SELECT TOP ${limit} c.receiptId, c.totalUsd, c.currency, c.lineItems, c.createdAt, c.brandName, c.status FROM c WHERE c.type='receipt' AND c.wallet=@wallet ORDER BY c.createdAt DESC`,
      parameters: [{ name: "@wallet", value: wallet }],
    } as { query: string; parameters: { name: string; value: any }[] };

    const { resources } = await container.items.query(spec).fetchAll();
    const receipts: Receipt[] = Array.isArray(resources)
      ? resources.map((row: any) => ({
        receiptId: String(row.receiptId || ""),
        totalUsd: Number(row.totalUsd || 0),
        currency: "USD",
        lineItems: Array.isArray(row.lineItems) ? row.lineItems : [],
        createdAt: Number(row.createdAt || Date.now()),
        brandName: typeof row.brandName === "string" ? row.brandName : undefined,
        status: typeof row.status === "string" ? row.status : undefined,
      }))
      : [];

    return NextResponse.json(
      { receipts },
      { headers: { "x-correlation-id": correlationId, "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0" } }
    );
  } catch (e: any) {
    // Graceful degrade when Cosmos isn't configured/available
    const receipts: Receipt[] = getReceipts(limit, wallet) as any;
    return NextResponse.json(
      { receipts, degraded: true, reason: e?.message || "cosmos_unavailable" },
      { status: 200, headers: { "x-correlation-id": correlationId, "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0" } }
    );
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const itemsBody: any[] = Array.isArray(body?.lineItems) ? body.lineItems : [];
    const totalUsdRaw = body?.totalUsd;

    // Auth: developer write via APIM key or JWT with receipts:write
    let caller: any;
    try {
      caller = await requireApimOrJwt(req, ["receipts:write"]);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "unauthorized" },
        { status: e?.status || 401, headers: { "x-correlation-id": correlationId } }
      );
    }
    const wallet = caller.wallet;

    if (!id) {
      return NextResponse.json(
        { error: "invalid_request", message: "id_required" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }
    if (!itemsBody.length || !itemsBody.every((it) => typeof it?.label === "string" && Number.isFinite(Number(it?.priceUsd)))) {
      return NextResponse.json(
        { error: "invalid_request", message: "line_items_required" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }
    const totalUsd = Number(totalUsdRaw);
    if (!Number.isFinite(totalUsd) || totalUsd < 0) {
      return NextResponse.json(
        { error: "invalid_request", message: "totalUsd_invalid" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Ownership/admin enforcement and CSRF for JWT callers (APIM callers are bound by subscription wallet)
    if (caller.source === "jwt") {
      try {
        assertOwnershipOrAdmin(caller.wallet, wallet, (caller.roles || []).includes("admin"));
      } catch {
        return NextResponse.json(
          { error: "forbidden" },
          { status: 403, headers: { "x-correlation-id": correlationId } }
        );
      }
      try {
        requireCsrf(req);
      } catch (e: any) {
        return NextResponse.json(
          { error: e?.message || "bad_origin" },
          { status: e?.status || 403, headers: { "x-correlation-id": correlationId } }
        );
      }
    }

    // Backend rate limit
    try {
      rateLimitOrThrow(req, rateKey(req, "receipt_create", wallet), 60, 60 * 1000);
    } catch (e: any) {
      const resetAt = typeof e?.resetAt === "number" ? e.resetAt : undefined;
      return NextResponse.json(
        { error: e?.message || "rate_limited", resetAt },
        { status: e?.status || 429, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Normalize line items
    const lineItems: ReceiptLineItem[] = itemsBody.map((it) => ({
      label: String(it.label || "").slice(0, 120) || "Item",
      priceUsd: Number(it.priceUsd || 0),
      qty: typeof it.qty === "number" && Number.isFinite(it.qty) && it.qty > 0 ? Math.floor(it.qty) : undefined,
    }));

    const now = Date.now();
    let brandName: string | undefined = "PortalPay";
    try {
      const cfg = await getSiteConfig().catch(() => null as any);
      if (typeof cfg?.theme?.brandName === "string" && cfg.theme.brandName) brandName = cfg.theme.brandName;
    } catch { }

    // Compute split breakdown and effective processing fee
    const brand = getBrandConfig();
    let merchantFeeBps: number | undefined = undefined;
    try {
      const c = await getContainer();
      const { resource } = await c.item("merchant:settings", wallet).read<any>();
      const n = Number((resource as any)?.merchantFeeBps);
      if (Number.isFinite(n)) merchantFeeBps = Math.max(0, Math.min(10000, Math.floor(n)));
    } catch { }
    const grossMinor = Math.round(totalUsd * 100);
    const splits = computeSplitAmounts(grossMinor, brand, merchantFeeBps ?? 0);
    const effectiveProcessingFeeBps = getEffectiveProcessingFeeBps(brand, merchantFeeBps);

    // Construct receipt doc
    const docId = `receipt:${id}`;
    const doc = {
      id: docId,
      type: "receipt",
      wallet,
      receiptId: id,
      totalUsd,
      currency: "USD",
      lineItems,
      createdAt: now,
      brandName,
      status: "pending",
      statusHistory: [{ status: "pending", ts: now }],
      // Split breakdown fields (minor units in cents)
      grossMinor,
      platformFeeBps: splits.platformFeeBps,
      partnerFeeBps: splits.partnerFeeBps,
      merchantFeeBps: splits.merchantFeeBps,
      amountPlatformMinor: splits.amountPlatformMinor,
      amountPartnerMinor: splits.amountPartnerMinor,
      amountMerchantMinor: splits.amountMerchantMinor,
      effectiveProcessingFeeBps,
    };

    // Persist in Cosmos, degrade to in-memory when necessary
    try {
      const container = await getContainer();
      await container.items.upsert(doc as any);
    } catch (e: any) {
      try {
        // Degraded mode: push to in-memory store
        pushReceipts([{ receiptId: id, totalUsd, currency: "USD", lineItems, createdAt: now, brandName, status: "pending", wallet } as any]);
      } catch { }
    }

    const paymentUrl = `https://surge.basalthq.com/pay/${encodeURIComponent(id)}`;
    return NextResponse.json(
      { id, paymentUrl, status: "pending" },
      { status: 201, headers: { "x-correlation-id": correlationId } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "server_error" },
      { status: 500, headers: { "x-correlation-id": crypto.randomUUID() } }
    );
  }
}
