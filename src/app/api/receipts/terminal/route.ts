import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getSiteConfigForWallet } from "@/lib/site-config";
import { pushReceipts } from "@/lib/receipts-mem";
import { isSupportedCurrency } from "@/lib/fx";
import { getBrandKey } from "@/config/brands";
import { getContainerIdentity, getBrandConfigFromCosmos } from "@/lib/brand-config";

/**
 * POST /api/receipts/terminal
 * Headers:
 *   x-wallet: merchant wallet (partition key)
 *
 * Body (JSON):
 * {
 *   amountUsd: number,               // base amount (pre-tax/fees)
 *   label?: string,                  // optional line item label (default: "Terminal Payment")
 *   currency?: string,               // optional currency override (defaults to store currency or USD)
 *   jurisdictionCode?: string,       // optional jurisdiction to apply; otherwise default from site config
 *   taxRate?: number,                // optional override (0..1); if provided, takes precedence
 *   taxComponents?: string[]         // optional set of component codes from jurisdiction to sum
 * }
 *
 * Behavior:
 * - Creates a receipt with a single base line item (label + amountUsd)
 * - Applies tax (from override, selected components, jurisdiction rate, or default jurisdiction from site config)
 * - Applies processing fee: 0.5% base + merchant-configured add-on from site config
 * - Persists to Cosmos DB (partitioned by wallet); falls back to in-memory if Cosmos unavailable
 * - Returns { ok: true, receipt }
 */

type ReceiptLineItem = {
  label: string;
  priceUsd: number;
  qty?: number;
};

export type Receipt = {
  receiptId: string;
  totalUsd: number;
  currency: string;
  lineItems: ReceiptLineItem[];
  createdAt: number;
  brandName?: string;
  status?: string;
  jurisdictionCode?: string;
  taxRate?: number;
  taxComponents?: string[];
  employeeId?: string;
  sessionId?: string;
  tipAmount?: number;
};

function toCents(n: number) {
  return Math.round(Math.max(0, Number(n || 0)) * 100);
}
function fromCents(c: number) {
  return Math.round(c) / 100;
}

function genReceiptId(): string {
  const baseId = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `R-${baseId}`;
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const queryWallet = String(url.searchParams.get("wallet") || "").toLowerCase();
    const headerWallet = String(req.headers.get("x-wallet") || "").toLowerCase();
    const rawWallet = headerWallet || queryWallet;
    if (!/^0x[a-f0-9]{40}$/i.test(rawWallet)) {
      return NextResponse.json(
        { error: "wallet_required" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }
    const wallet = rawWallet;

    const amountUsd = Number(body?.amountUsd);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return NextResponse.json(
        { error: "invalid_amount" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Fetch site config (processingFeePct, taxConfig, brandName, storeCurrency), and ensure split configured
    const cfg = await getSiteConfigForWallet(wallet).catch(() => null as any);
    const baseLabel = (String(body?.label || "").trim() || "Terminal Payment").slice(0, 120);
    const currencyInput = typeof body?.currency === "string" ? body.currency.toUpperCase() : (cfg?.storeCurrency || "USD");
    const currency = isSupportedCurrency(currencyInput) ? currencyInput : "USD";
    const jurisdictionCode = typeof body?.jurisdictionCode === "string" ? body.jurisdictionCode : undefined;
    const taxRateOverride = typeof body?.taxRate === "number" ? Number(body.taxRate) : undefined;
    const taxComponents: string[] = Array.isArray(body?.taxComponents) ? body.taxComponents : [];

    const brandName = cfg?.theme?.brandName || "PortalPay";
    try {
      let splitAddr = (cfg as any)?.splitAddress || (cfg as any)?.split?.address || "";
      if (!/^0x[a-f0-9]{40}$/i.test(String(splitAddr))) {
        // Fallback: attempt to resolve split via split/deploy endpoint, propagating auth headers/cookies.
        try {
          const xfProto = req.headers.get("x-forwarded-proto");
          const xfHost = req.headers.get("x-forwarded-host");
          const host = req.headers.get("host");
          const proto = xfProto || (process.env.NODE_ENV === "production" ? "https" : "http");
          const h = xfHost || host || "";
          const origin = h ? `${proto}://${h}` : (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin);

          const cookie = req.headers.get("cookie") || "";
          const authorization = req.headers.get("authorization") || "";
          const headers: Record<string, string> = { "x-wallet": wallet };
          if (cookie) headers["cookie"] = cookie;
          if (authorization) headers["authorization"] = authorization;

          const r = await fetch(`${origin}/api/split/deploy?wallet=${encodeURIComponent(wallet)}`, {
            cache: "no-store",
            headers,
          });
          const j = await r.json().catch(() => ({}));
          const addr = String(j?.split?.address || "").toLowerCase();
          if (/^0x[a-f0-9]{40}$/i.test(addr)) {
            splitAddr = addr;
          }
        } catch { }
      }
      if (!/^0x[a-f0-9]{40}$/i.test(String(splitAddr))) {
        return NextResponse.json(
          { error: "split_required", message: "Split contract not configured for this merchant" },
          { status: 403, headers: { "x-correlation-id": correlationId } }
        );
      }
    } catch { }

    // Compute taxRate: precedence override > explicit components > jurisdiction rate > default jurisdiction (components if present)
    let appliedJurisdictionCode: string | undefined = jurisdictionCode || undefined;
    let appliedTaxComponents: string[] | undefined =
      Array.isArray(taxComponents) && taxComponents.length ? taxComponents : undefined;

    let taxRate = 0;
    try {
      if (Number.isFinite(taxRateOverride) && (taxRateOverride as number) >= 0 && (taxRateOverride as number) <= 1) {
        taxRate = Math.max(0, Math.min(1, taxRateOverride as number));
      } else if (jurisdictionCode && Array.isArray((cfg as any)?.taxConfig?.jurisdictions)) {
        const j = (cfg as any).taxConfig.jurisdictions.find(
          (x: any) => String(x.code || "").toLowerCase() === String(jurisdictionCode).toLowerCase()
        );
        if (Array.isArray(taxComponents) && taxComponents.length && Array.isArray((j as any)?.components)) {
          const compMap = new Map<string, number>(
            (j as any).components.map((c: any) => [
              String(c.code || "").toLowerCase(),
              Math.max(0, Math.min(1, Number(c.rate || 0))),
            ])
          );
          taxRate = Math.max(
            0,
            Math.min(
              1,
              taxComponents.reduce((s, code) => s + (compMap.get(String(code || "").toLowerCase()) || 0), 0)
            )
          );
        } else {
          const r = Number(j?.rate || 0);
          taxRate = Number.isFinite(r) && r >= 0 && r <= 1 ? r : 0;
          appliedTaxComponents = undefined;
        }
      } else if (typeof taxRateOverride !== "number" && Array.isArray((cfg as any)?.taxConfig?.jurisdictions)) {
        const defCode = String((cfg as any)?.taxConfig?.defaultJurisdictionCode || "");
        if (defCode) {
          const j = (cfg as any).taxConfig.jurisdictions.find(
            (x: any) => String(x.code || "").toLowerCase() === defCode.toLowerCase()
          );
          if (j) {
            appliedJurisdictionCode = defCode;
            const comps = Array.isArray((j as any)?.components) ? (j as any).components : [];
            if (comps.length) {
              const sum = comps.reduce(
                (s: number, c: any) => s + Math.max(0, Math.min(1, Number(c?.rate || 0))),
                0
              );
              taxRate = Math.max(0, Math.min(1, sum));
              appliedTaxComponents = comps.map((c: any) => String(c?.code || "")).filter(Boolean);
            } else {
              const r = Math.max(0, Math.min(1, Number((j as any)?.rate || 0)));
              taxRate = r;
              appliedTaxComponents = undefined;
            }
          }
        }
      }
    } catch { }

    // Processing fee add-on (above base platform fee)
    // basePlatformFeePct: combined platform + partner fee (brand-configured; fallback to 0.5%)
    let basePlatformFeePct: number | undefined =
      typeof (cfg as any)?.basePlatformFeePct === "number" ? Math.max(0, Number((cfg as any).basePlatformFeePct)) : undefined;

    if (typeof basePlatformFeePct !== "number") {
      try {
        const xfHost = req.headers.get("x-forwarded-host");
        const host = req.headers.get("host");
        const u = new URL(req.url);
        const hostname = (xfHost || host || u.hostname || "").toLowerCase();
        const { brandKey: bk } = getContainerIdentity(hostname);
        let brandKeyForFees = bk;
        if (!brandKeyForFees) {
          try { brandKeyForFees = getBrandKey(); } catch { brandKeyForFees = ""; }
        }
        if (brandKeyForFees) {
          const { brand: fetchedBrand, overrides: fetchedOverrides } = await getBrandConfigFromCosmos(brandKeyForFees);
          const ov = (typeof fetchedOverrides === "object" && fetchedOverrides) ? fetchedOverrides : ({} as any);
          const fb = (typeof fetchedBrand === "object" && fetchedBrand) ? fetchedBrand : null;
          const platformBps = typeof ov?.platformFeeBps === "number" ? ov.platformFeeBps
            : (typeof (fb as any)?.platformFeeBps === "number" ? (fb as any).platformFeeBps : 50);
          const partnerBps = typeof ov?.partnerFeeBps === "number" ? ov.partnerFeeBps
            : (typeof (fb as any)?.partnerFeeBps === "number" ? (fb as any).partnerFeeBps : 0);
          basePlatformFeePct = (platformBps + partnerBps) / 100;
        } else {
          basePlatformFeePct = 0.5;
        }
      } catch {
        basePlatformFeePct = 0.5;
      }
    }

    const processingFeePct =
      typeof cfg?.processingFeePct === "number" ? Math.max(0, Number(cfg.processingFeePct)) : 0;

    // Build line items: base + optional Tax + Processing Fee
    const baseCents = toCents(amountUsd);
    const taxCents = Math.round(baseCents * Math.max(0, Math.min(1, taxRate)));
    const baseWithoutFeeCents = baseCents + taxCents;
    const totalFeePct = Math.max(0, basePlatformFeePct + processingFeePct);
    const feePctFraction = totalFeePct / 100;
    const processingFeeCents = Math.round(baseWithoutFeeCents * feePctFraction);

    const lineItems: ReceiptLineItem[] = [
      { label: baseLabel, priceUsd: fromCents(baseCents) },
      ...(taxCents > 0 ? [{ label: "Tax", priceUsd: fromCents(taxCents) }] : []),
      ...(processingFeeCents > 0 ? [{ label: "Processing Fee", priceUsd: fromCents(processingFeeCents) }] : []),
    ];

    const totalUsd = fromCents(baseWithoutFeeCents + processingFeeCents);
    const receiptId = genReceiptId();
    const ts = Date.now();

    const doc = {
      id: `receipt:${receiptId}`,
      type: "receipt",
      wallet,
      receiptId,
      totalUsd,
      currency,
      lineItems,
      createdAt: ts,
      brandName,
      jurisdictionCode: appliedJurisdictionCode,
      taxRate: Math.max(0, Math.min(1, taxRate)),
      taxComponents: appliedTaxComponents,
      status: "generated",
      employeeId: typeof body?.employeeId === "string" ? body.employeeId : undefined,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : undefined,
      statusHistory: [{ status: "generated", ts }],
      lastUpdatedAt: ts,
    };

    const receipt: Receipt & { sessionId?: string } = {
      receiptId,
      totalUsd,
      currency,
      lineItems,
      createdAt: ts,
      brandName,
      jurisdictionCode: appliedJurisdictionCode,
      taxRate: Math.max(0, Math.min(1, taxRate)),
      taxComponents: appliedTaxComponents,
      status: "generated",
      employeeId: typeof body?.employeeId === "string" ? body.employeeId : undefined,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : undefined,
    };

    // Persist
    try {
      const container = await getContainer();
      await container.items.upsert(doc as any);
      return NextResponse.json({ ok: true, receipt }, { headers: { "x-correlation-id": correlationId } });
    } catch (e: any) {
      // Degraded: push to in-memory
      pushReceipts([{ ...receipt, wallet } as any]);
      return NextResponse.json(
        { ok: true, degraded: true, reason: e?.message || "cosmos_unavailable", receipt },
        { status: 200, headers: { "x-correlation-id": correlationId } }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500, headers: { "x-correlation-id": crypto.randomUUID() } }
    );
  }
}
