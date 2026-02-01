import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";
import { getBrandKey } from "@/config/brands";

/**
 * GET /api/orders/me
 * Returns receipts (orders) associated with the authenticated buyer.
 *
 * Query params:
 * - page: number (default 0)
 * - limit: number (default 50)
 *
 * Notes:
 * - This endpoint relies on receipts including buyerWallet (recorded on settlement statuses via /api/receipts/status).
 * - Results are sorted by createdAt desc and paginated server-side.
 */
export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const caller = await requireThirdwebAuth(req);
    const me = String(caller.wallet || "").toLowerCase();

    if (!/^0x[a-f0-9]{40}$/i.test(me)) {
      return NextResponse.json(
        { ok: false, error: "invalid_buyer_wallet" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }

    const url = new URL(req.url);
    const page = Math.max(0, Math.floor(Number(url.searchParams.get("page") ?? "0")));
    const limit = Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? "50")));

    // Try Cosmos first: cross-partition query over receipts where buyerWallet == me
    let resources: any[] = [];
    try {
      const container = await getContainer();
      const spec = {
        // Cross-partition query scanning receipts for the buyer
        query:
          "SELECT c.id, c.wallet, c.receiptId, c.totalUsd, c.currency, c.lineItems, c.createdAt, c.brandName, c.jurisdictionCode, c.taxRate, c.taxComponents, c.status, c.buyerWallet, c.shopSlug, c.metadata, c.transactionHash FROM c WHERE c.type = 'receipt' AND c.buyerWallet = @buyer",
        parameters: [{ name: "@buyer", value: me }],
      } as { query: string; parameters: { name: string; value: any }[] };

      const { resources: rows } = await container.items.query(spec).fetchAll();
      resources = Array.isArray(rows) ? rows : [];

      // UI-layer synthetic duplicate cleanup: drop R-ONCHAIN receipts when a canonical exists
      // Matching criteria: same merchant wallet AND either same transactionHash OR within ±2h and ±$1
      try {
        const isSynthetic = (r: any) =>
          typeof r?.receiptId === "string" && r.receiptId.startsWith("R-ONCHAIN-");

        const byMerchant = new Map<string, any[]>();
        for (const r of resources) {
          const w = String(r?.wallet || "");
          const arr = byMerchant.get(w) || [];
          arr.push(r);
          byMerchant.set(w, arr);
        }

        const filtered: any[] = [];
        for (const [wallet, arr] of byMerchant.entries()) {
          const canon = arr.filter((r) => !isSynthetic(r));
          const syn = arr.filter((r) => isSynthetic(r));
          for (const s of syn) {
            const sTs = Number(s?.createdAt || 0);
            const sUsd = Number(s?.totalUsd || 0);
            const sTx =
              typeof s?.transactionHash === "string" ? String(s.transactionHash).toLowerCase() : "";

            let matched = false;
            for (const c of canon) {
              // Only let "strong" canonical receipts suppress synthetic ones
              // If the canonical receipt is just "checkout_initialized" (no tx, not paid), ignore it here
              // so we prefer the synthetic one (which is reconciled/paid)
              const cStatus = String(c?.status || "").toLowerCase();
              const cHsTx = typeof c?.transactionHash === "string" && !!c.transactionHash;
              const isStrong = cStatus === "paid" || cStatus === "reconciled" || cHsTx;

              if (!isStrong) continue;

              const cTx =
                typeof c?.transactionHash === "string" ? String(c.transactionHash).toLowerCase() : "";

              // Prefer exact tx hash match when present
              if (sTx && cTx && sTx === cTx) {
                matched = true;
                break;
              }

              // Otherwise match by time + amount tolerance
              const withinTime = Math.abs(Number(c?.createdAt || 0) - sTs) <= 2 * 60 * 60 * 1000; // ±2h
              const withinAmt = Math.abs(Number(c?.totalUsd || 0) - sUsd) <= 1; // ±$1
              if (withinTime && withinAmt) {
                matched = true;
                break;
              }
            }

            // Keep synthetic only if no canonical match was found
            if (!matched) {
              filtered.push(s);
            }
          }

          // Always keep canonical receipts (they will be filtered by status next)
          filtered.push(...canon);
        }

        resources = filtered;

        // UI-layer cleanup: drop tracking-only receipts (no tx) older than 6h,
        // and drop tracking receipts when a canonical (paid/reconciled/tx-backed) exists nearby (±24h, ±$1)
        try {
          const trackingSet = new Set(["checkout_initialized", "buyer_logged_in", "link_opened"]);
          const now = Date.now();

          // Strict filtering: Only show Paid/Settled receipts (User Request: "only reciepts that got to the paid status should be counted")
          // We also include receipts with a transactionHash as proof of payment.
          const validStatuses = new Set(["paid", "checkout_success", "confirmed", "tx_mined", "reconciled"]);
          resources = resources.filter((r: any) => {
            const st = String(r?.status || "").toLowerCase();
            const hasTx = typeof r?.transactionHash === "string" && !!r.transactionHash;
            return validStatuses.has(st) || hasTx;
          });

          const byMerchant2 = new Map<string, any[]>();
          for (const r of resources) {
            const w = String(r?.wallet || "");
            const arr = byMerchant2.get(w) || [];
            arr.push(r);
            byMerchant2.set(w, arr);
          }

          const finalList: any[] = [];
          for (const [w, arr] of byMerchant2.entries()) {
            const canon = arr.filter((r) => {
              const status = String(r?.status || "").toLowerCase();
              const hasTx = typeof r?.transactionHash === "string" && r.transactionHash;
              return hasTx || status === "paid" || status === "reconciled";
            });
            const others = arr.filter((r) => !canon.includes(r));

            for (const r of others) {
              const status = String(r?.status || "").toLowerCase();
              const isArchived = !!(r?.metadata?.archived);
              const isRecovered = typeof r?.receiptId === "string" && r.receiptId.startsWith("R-RECOVERED-");

              // Hide tracking-only and any archived/recovered recovery docs from buyer view
              const hide = trackingSet.has(status) || isArchived || isRecovered;
              if (!hide) finalList.push(r);
            }

            // Always keep canonical
            finalList.push(...canon);
          }

          resources = finalList;
        } catch { }
      } catch { }
    } catch (e) {
      // If Cosmos unavailable or buyerWallet not yet recorded, degrade gracefully
      resources = [];
    }

    // Partner container isolation: filter receipts to current brand when brandKey is configured
    try {
      const brandKey = getBrandKey();
      if (brandKey && String(brandKey).toLowerCase() !== "portalpay" && String(brandKey).toLowerCase() !== "basaltsurge") {
        resources = (resources || []).filter((r: any) => String(r?.brandKey || "").toLowerCase() === String(brandKey).toLowerCase());
      }
    } catch { }
    // Sort by createdAt desc
    resources.sort((a, b) => {
      const ta = Number(a?.createdAt || 0);
      const tb = Number(b?.createdAt || 0);
      return tb - ta;
    });

    const total = resources.length;
    const start = page * limit;
    const end = start + limit;
    const items = resources.slice(start, end).map((r) => ({
      receiptId: String(r.receiptId || ""),
      merchantWallet: String(r.wallet || ""),
      totalUsd: Number(r.totalUsd || 0),
      currency: String(r.currency || "USD"),
      lineItems: (() => {
        const li = Array.isArray(r.lineItems) ? r.lineItems : [];
        const minimal =
          li.length === 0 ||
          (li.length === 1 &&
            typeof li[0]?.label === "string" &&
            li[0].label.toLowerCase().includes("on-chain") &&
            Number(li[0]?.priceUsd || 0) <= 0);
        if (!minimal) return li;
        const tokenSym = String((r?.metadata?.token ?? r?.token ?? r?.expectedToken ?? r?.settlementToken ?? "") || "");
        const price = Number(r.totalUsd || 0);
        if (price > 0) {
          return [{ label: tokenSym ? `On-chain Payment (${tokenSym})` : "On-chain Payment", priceUsd: price }];
        }
        return li;
      })(),
      createdAt: Number(r.createdAt || 0),
      brandName: r.brandName,
      jurisdictionCode: r.jurisdictionCode,
      taxRate: typeof r.taxRate === "number" ? r.taxRate : undefined,
      taxComponents: Array.isArray(r.taxComponents) ? r.taxComponents : undefined,
      status: String(r.status || "generated"),
      buyerWallet: String(r.buyerWallet || ""),
      shopSlug: typeof r.shopSlug === "string" ? r.shopSlug : undefined,
      // Settlement metadata for UI
      tokenSymbol: String((r?.metadata?.token ?? r?.token ?? r?.expectedToken ?? r?.settlementToken ?? "") || ""),
      tokenAmount: Number(r?.metadata?.tokenValue ?? r?.tokenValue ?? r?.expectedAmountToken ?? r?.settlementAmountToken ?? 0),
      transactionHash:
        typeof r?.transactionHash === "string" && r.transactionHash
          ? String(r.transactionHash)
          : typeof r?.metadata?.txHash === "string" && r.metadata.txHash
            ? String(r.metadata.txHash)
            : "",
    }));

    return NextResponse.json(
      { ok: true, items, total, page, pageSize: limit },
      { headers: { "x-correlation-id": correlationId } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "failed" },
      { status: 500, headers: { "x-correlation-id": correlationId } }
    );
  }
}
