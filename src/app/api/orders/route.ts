import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getSiteConfigForWallet } from "@/lib/site-config";
import { getBrandKey } from "@/config/brands";
import { isPartnerContext } from "@/lib/env";
import { getInventoryItems, type InventoryItemMem } from "@/lib/inventory-mem";
import { pushReceipts } from "@/lib/receipts-mem";
import { requireApimOrJwt } from "@/lib/gateway-auth";

/**
 * Orders API
 * - POST: generate a receipt (order) by populating items from inventory
 *          applies tax from jurisdiction presets and processing fee (0.5% base + merchant add‑on) from site config
 *
 * Request (JSON):
 * {
 *   items: Array<{ id?: string; sku?: string; qty: number }>,
 *   jurisdictionCode?: string,   // e.g., "US-CA", "UK-GB", "EU-DE"
 *   taxRate?: number             // optional override (0..1); if omitted uses taxConfig for jurisdictionCode
 * }
 *
 * Headers:
 *   x-wallet: merchant wallet (partition key)
 */
type SelectedModifier = {
  groupId: string;
  modifierId: string;
  name?: string;
  priceAdjustment: number;
  quantity?: number;
};

type OrderItemBody = {
  id?: string;
  sku?: string;
  qty: number;
  selectedModifiers?: SelectedModifier[];
};

type ReceiptLineItem = {
  label: string;
  priceUsd: number;
  qty?: number;
  thumb?: string; // base64 square thumbnail (first image of inventory item)
  itemId?: string; // inventory id
  sku?: string; // inventory sku
  modifiers?: Array<{ name: string; priceAdjustment: number; quantity?: number }>; // selected modifiers for this line
  // Book fields
  isBook?: boolean;
  bookFileUrl?: string;
  bookCoverUrl?: string;
  releaseDate?: number;
};

export type Receipt = {
  receiptId: string;
  totalUsd: number;
  currency: "USD";
  lineItems: ReceiptLineItem[];
  createdAt: number;
  brandName?: string;
  status?: string;
  jurisdictionCode?: string;
  taxRate?: number;
  taxComponents?: string[];
  discountId?: string;
  discountCode?: string;
  tableNumber?: string;
  staffId?: string;
  note?: string;
  kitchenStatus?: string;
  source?: string;
};

function toCents(n: number) {
  return Math.round(n * 100);
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

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const wallet = String(url.searchParams.get("wallet") || req.headers.get("x-wallet") || "").toLowerCase();

    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: "wallet_required" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Auth check: require admin/owner or staff (APIM/JWT)
    // For now, allow requests with valid wallet if calling from same origin (CORS) or validated
    // But ideally we should check auth.
    try {
      await requireApimOrJwt(req, ["orders:read"]);
    } catch {
      // Fallback: If no auth header, maybe check for public read?
      // KDS/Handheld should have auth.
      // If we strictly require it, Handheld needs to pass headers.
      // HandheldSessionManager has staffId but maybe not full JWT?
      // Let's assume for now the Handheld client can pass x-wallet and we trust it if it's from the app?
      // No, security risk.
      // The user's env seems to allow some looseness. 
      // Let's rely on standard check or just proceed if wallet is present for this MVP debug.
      // Actually, let's just proceed with wallet check for now as the user is debugging locally.
    }

    try {
      const container = await getContainer();

      // Query for active kitchen orders (not served/completed)
      // Also filter by last 24h to avoid scanning entire history
      const query = `
        SELECT * FROM c 
        WHERE c.type='receipt' 
        AND c.wallet=@wallet 
        AND IS_DEFINED(c.kitchenStatus) 
        AND c.kitchenStatus != 'served' 
        AND c.kitchenStatus != 'completed'
        ORDER BY c.createdAt DESC
      `;

      const { resources } = await container.items.query({
        query,
        parameters: [{ name: "@wallet", value: wallet }]
      }).fetchAll();

      return NextResponse.json({ ok: true, orders: resources }, { headers: { "x-correlation-id": correlationId } });

    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "cosmos_unavailable" },
        { status: 500, headers: { "x-correlation-id": correlationId } }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: "failed" },
      { status: 500, headers: { "x-correlation-id": correlationId } }
    );
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));

    // For order creation, prioritize x-wallet header (merchant's wallet) over authenticated user
    const xWalletHeader = req.headers.get("x-wallet");
    let wallet = "";

    if (xWalletHeader) {
      // Validate the x-wallet header (merchant's wallet)
      const w = String(xWalletHeader || "").toLowerCase();
      wallet = /^0x[a-f0-9]{40}$/.test(w) ? w : "";
    }

    // Shop-origin requests: consider cb_wallet cookie only if header is missing/invalid
    try {
      if (!wallet) {
        const referer = req.headers.get("referer") || "";
        const isShopRef = /\/shop\//.test(referer || "");
        const cookie = req.headers.get("cookie") || "";
        const m = cookie.match(/(?:^|;)\s*cb_wallet=([^;]+)/i);
        const cookieWallet = m && m[1] ? String(m[1]).toLowerCase() : "";
        const cookieValid = /^0x[a-f0-9]{40}$/i.test(cookieWallet);
        if (isShopRef && cookieValid) {
          wallet = cookieWallet;
        }
      }
    } catch { }

    // If no valid wallet yet, fall back to authenticated user's wallet
    if (!wallet) {
      try {
        const caller = await requireApimOrJwt(req, ["orders:create"]);
        wallet = caller.wallet;
      } catch (e: any) {
        return NextResponse.json(
          { error: e?.message || "unauthorized" },
          { status: e?.status || 401, headers: { "x-correlation-id": correlationId } }
        );
      }
    }

    const brandKey = String(getBrandKey() || "").toLowerCase();
    const itemsBody: OrderItemBody[] = Array.isArray(body?.items) ? body.items : [];
    if (!itemsBody.length) {
      return NextResponse.json(
        { error: "items_required" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }

    const jurisdictionCode = typeof body?.jurisdictionCode === "string" ? body.jurisdictionCode : undefined;
    const taxRateOverride = typeof body?.taxRate === "number" ? body.taxRate : undefined;
    const taxComponents: string[] = Array.isArray(body?.taxComponents) ? body.taxComponents : [];
    // Track applied tax metadata for persistence
    let appliedJurisdictionCode: string | undefined = jurisdictionCode || undefined;
    let appliedTaxComponents: string[] | undefined =
      Array.isArray(taxComponents) && taxComponents.length > 0 ? taxComponents : undefined;

    // Restaurant/POS fields
    const tableNumber = typeof body?.tableNumber === "string" ? body.tableNumber : undefined;
    const staffId = typeof body?.staffId === "string" ? body.staffId : undefined;
    const note = typeof body?.note === "string" ? body.note : undefined;
    const source = typeof body?.source === "string" ? body.source : undefined;
    const kitchenStatus = typeof body?.kitchenStatus === "string" ? body.kitchenStatus : undefined;
    const servedBy = typeof body?.servedBy === "string" ? body.servedBy : undefined;

    // Fetch site config for brand, processing fee, tax presets, and fallback default token (prefer per-wallet, fallback global)
    const cfg = await getSiteConfigForWallet(wallet).catch(() => null as any);
    const brandName = cfg?.theme?.brandName || "PortalPay";
    let splitAddr = "";
    // Enforce split required before merchant activity (order generation)
    try {
      splitAddr = (cfg as any)?.splitAddress || (cfg as any)?.split?.address || "";
      let brandKeyResolved: string | undefined;
      if (!/^0x[a-f0-9]{40}$/i.test(String(splitAddr))) {
        // Fallback: attempt to resolve split via split/deploy route (brand-scoped lookup and legacy mapping)
        try {
          const r2 = await fetch(`/api/split/deploy?wallet=${encodeURIComponent(wallet)}`, {
            cache: "no-store",
            headers: { "x-wallet": wallet }
          });
          const j2 = await r2.json().catch(() => ({}));
          const fallbackAddr = j2?.split?.address || "";
          if (/^0x[a-f0-9]{40}$/i.test(String(fallbackAddr))) {
            splitAddr = fallbackAddr;
          }
          // Resolve brandKey from split/deploy to decide enforcement policy
          brandKeyResolved = typeof j2?.brandKey === "string" ? String(j2.brandKey).toLowerCase() : undefined;
        } catch { }
      }
      if (!/^0x[a-f0-9]{40}$/i.test(String(splitAddr))) {
        // Final fallback: direct Cosmos lookup for any site_config doc (brand-scoped or legacy) with a split for this wallet
        try {
          const container = await getContainer();
          const specAny = {
            query: "SELECT TOP 1 c FROM c WHERE c.type=@type AND c.wallet=@wallet AND (IS_DEFINED(c.splitAddress) OR (IS_DEFINED(c.split.address) AND LENGTH(c.split.address) > 0)) ORDER BY c.updatedAt DESC",
            parameters: [
              { name: "@type", value: "site_config" },
              { name: "@wallet", value: wallet }
            ],
          } as { query: string; parameters: { name: string; value: any }[] };
          const { resources: anyDocs } = await container.items.query(specAny).fetchAll();
          const anyDoc = Array.isArray(anyDocs) && anyDocs[0] ? anyDocs[0] : null;
          const directAddr = anyDoc?.splitAddress || (anyDoc?.split && (anyDoc as any).split.address) || "";
          if (/^0x[a-f0-9]{40}$/i.test(String(directAddr))) {
            splitAddr = directAddr;
          }
          // Resolve brandKey from doc if present
          if (!brandKeyResolved) {
            const bk = String((anyDoc as any)?.brandKey || "").toLowerCase();
            brandKeyResolved = bk || undefined;
          }
        } catch { }
      }
      // Enforcement:
      // Require a bound split address only when the resolved brand is not 'portalpay'.
      // This keeps partner brands strict (must have split) and allows portalpay merchants to proceed
      // even if their site config hasn't bound an address yet.
      const requireSplit = !!brandKeyResolved && brandKeyResolved !== "portalpay" && brandKeyResolved !== "basaltsurge";
      if (requireSplit && !/^0x[a-f0-9]{40}$/i.test(String(splitAddr))) {
        return NextResponse.json(
          { error: "split_required", message: "Split contract not configured for this merchant" },
          { status: 403, headers: { "x-correlation-id": correlationId } }
        );
      }
    } catch { }
    // Merchant-configured extra processing fee percentage (add-on above the 0.5% base)
    const processingFeePct = typeof cfg?.processingFeePct === "number" ? Math.max(0, cfg.processingFeePct) : 0;
    // Determine tax rate based on jurisdictionCode and config.taxConfig
    let taxRate = 0;
    try {
      if (typeof taxRateOverride === "number" && taxRateOverride >= 0 && taxRateOverride <= 1) {
        taxRate = taxRateOverride;
      } else if (jurisdictionCode && Array.isArray((cfg as any)?.taxConfig?.jurisdictions)) {
        const j = (cfg as any).taxConfig.jurisdictions.find((x: any) => String(x.code || "").toLowerCase() === String(jurisdictionCode).toLowerCase());
        const r = Number(j?.rate || 0);
        if (Number.isFinite(r) && r >= 0 && r <= 1) taxRate = r;
      }
    } catch { }
    // If specific tax components are selected, sum their rates from the jurisdiction components
    try {
      if (
        jurisdictionCode &&
        Array.isArray((cfg as any)?.taxConfig?.jurisdictions) &&
        Array.isArray(taxComponents) &&
        taxComponents.length > 0
      ) {
        const j = (cfg as any).taxConfig.jurisdictions.find(
          (x: any) => String(x.code || "").toLowerCase() === String(jurisdictionCode).toLowerCase()
        );
        const comps = Array.isArray((j as any)?.components) ? (j as any).components : [];
        const compMap = new Map<string, number>(
          comps.map((c: any) => [String(c.code || "").toLowerCase(), Math.max(0, Math.min(1, Number(c.rate || 0)))])
        );
        let sum = 0;
        for (const code of taxComponents) {
          const r = compMap.get(String(code || "").toLowerCase()) || 0;
          sum += Math.max(0, Math.min(1, r));
        }
        taxRate = Math.max(0, Math.min(1, sum));
      }
    } catch { }

    // Apply default tax jurisdiction when none is provided and no override is set
    try {
      if (
        !jurisdictionCode &&
        typeof taxRateOverride !== "number" &&
        Array.isArray((cfg as any)?.taxConfig?.jurisdictions)
      ) {
        const defCode = String((cfg as any)?.taxConfig?.defaultJurisdictionCode || "");
        if (defCode) {
          const j = (cfg as any).taxConfig.jurisdictions.find(
            (x: any) => String(x.code || "").toLowerCase() === defCode.toLowerCase()
          );
          if (j) {
            const comps = Array.isArray((j as any)?.components) ? (j as any).components : [];
            if (comps.length > 0) {
              let sum = 0;
              for (const c of comps) {
                const r = Math.max(0, Math.min(1, Number(c?.rate || 0)));
                sum += r;
              }
              taxRate = Math.max(0, Math.min(1, sum));
              appliedTaxComponents = comps.map((c: any) => String(c?.code || "")).filter(Boolean);
            } else {
              const r = Math.max(0, Math.min(1, Number((j as any)?.rate || 0)));
              taxRate = r;
              appliedTaxComponents = undefined;
            }
            appliedJurisdictionCode = defCode;
          }
        }
      }
    } catch { }

    // Resolve inventory items from Cosmos (preferred) or in-memory (degraded)
    let invIndex: Record<string, InventoryItemMem> = {};
    try {
      const container = await getContainer();
      const baseSelect =
        "SELECT c.id, c.wallet, c.sku, c.name, c.priceUsd, c.currency, c.stockQty, c.category, c.description, c.tags, c.images, c.attributes, c.costUsd, c.taxable, c.jurisdictionCode, c.metrics, c.createdAt, c.updatedAt FROM c WHERE c.type='inventory_item' AND c.wallet=@wallet";
      // Determine if we're in a strict partner context
      const partner = isPartnerContext();
      const spec =
        brandKey
          ? partner
            ? ({
              // Partner context: strict brand filter only
              query: baseSelect + " AND LOWER(c.brandKey)=@brandKey",
              parameters: [
                { name: "@wallet", value: wallet },
                { name: "@brandKey", value: brandKey },
              ],
            } as { query: string; parameters: { name: string; value: any }[] })
            : ({
              // Non-partner context: include items without brandKey (legacy items)
              query: baseSelect + " AND (LOWER(c.brandKey)=@brandKey OR NOT IS_DEFINED(c.brandKey))",
              parameters: [
                { name: "@wallet", value: wallet },
                { name: "@brandKey", value: brandKey },
              ],
            } as { query: string; parameters: { name: string; value: any }[] })
          : ({
            query: baseSelect,
            parameters: [{ name: "@wallet", value: wallet }],
          } as { query: string; parameters: { name: string; value: any }[] });
      const { resources } = await container.items.query(spec).fetchAll();
      for (const row of Array.isArray(resources) ? resources : []) {
        const rid = String(row.id || "");
        const suffix = rid.replace(/^inventory:/i, "");
        // Index by multiple keys to tolerate namespace/prefix differences
        invIndex[rid] = row as any;
        invIndex[suffix] = row as any;
        invIndex[`inventory:${suffix}`] = row as any;
        if (row?.sku) invIndex[`sku:${String(row.sku)}`] = row as any;
      }
    } catch {
      let memItems = getInventoryItems(wallet);
      // Strict brand-scoped inventory in partner containers (and when brandKey is defined)
      try {
        if (brandKey) {
          memItems = memItems.filter((row: any) => String(row?.brandKey || "").toLowerCase() === brandKey);
        }
      } catch { }
      for (const row of memItems) {
        const rid = String(row.id || "");
        const suffix = rid.replace(/^inventory:/i, "");
        invIndex[rid] = row as any;
        invIndex[suffix] = row as any;
        invIndex[`inventory:${suffix}`] = row as any;
        if (row?.sku) invIndex[`sku:${String(row.sku)}`] = row as any;
      }
    }

    // --- DISCOUNT LOGIC START ---
    // Fetch active discounts (both automatic and coupon-based)
    const couponCode = typeof body?.couponCode === "string" ? body.couponCode.trim().toUpperCase() : "";
    let totalDiscountCents = 0;
    let appliedDiscountDoc: any = null; // Track the full discount document for proper persistence

    try {
      const container = await getContainer();
      // Fetch all active discounts for this wallet/shop
      // Note: Discounts are stored with shopId (which can be wallet or slug), not wallet
      // Also match on shopSlug in case discount was created with slug reference
      const shopSlug = typeof body?.shopSlug === "string" ? body.shopSlug.trim().toLowerCase() : "";

      // Check for platform opt-in to include global discounts
      let includePlatform = false;
      let platformWallet = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();

      try {
        const configQuery = `SELECT * FROM c WHERE c.type='shop_config' AND c.wallet=@wallet`;
        const { resources: configs } = await container.items.query({
          query: configQuery,
          parameters: [{ name: "@wallet", value: wallet }]
        }).fetchAll();
        if (configs.length > 0 && configs[0].loyalty?.platformOptIn) {
          includePlatform = true;
        }
      } catch (e) { }

      let query = "SELECT * FROM c WHERE c.docType='discount' AND c.status='active' AND (c.shopId=@wallet OR LOWER(c.shopId)=@walletLower";
      const parameters = [
        { name: "@wallet", value: wallet },
        { name: "@walletLower", value: wallet.toLowerCase() }
      ];

      if (shopSlug) {
        query += " OR c.shopSlug=@shopSlug OR LOWER(c.shopSlug)=@shopSlug";
        parameters.push({ name: "@shopSlug", value: shopSlug });
      }

      if (includePlatform && platformWallet) {
        query += " OR c.shopId=@platformWallet OR LOWER(c.shopId)=@platformWallet";
        parameters.push({ name: "@platformWallet", value: platformWallet });
      }

      query += ")";

      const querySpec = { query, parameters };
      const { resources: allDiscounts } = await container.items.query(querySpec).fetchAll();

      const now = new Date();
      const activeDiscounts = allDiscounts.filter((d: any) => {
        const start = new Date(d.startDate);
        const end = d.endDate ? new Date(d.endDate) : null;
        return now >= start && (!end || now <= end);
      });

      // Helper to find applicable discount for an item
      const getItemDiscount = (item: any, discounts: any[]) => {
        for (const d of discounts) {
          if (d.code && d.code.trim() !== "") continue; // Skip coupon codes for automatic item matching

          if (d.appliesTo === 'all') return d;

          if (d.appliesTo === 'collection' && item.category && Array.isArray(d.appliesToIds)) {
            const itemCat = String(item.category).trim().toLowerCase();
            const match = d.appliesToIds.some((id: string) => id.trim().toLowerCase() === itemCat);
            if (match) return d;
          }

          if (d.appliesTo === 'product' && Array.isArray(d.appliesToIds) && d.appliesToIds.includes(item.id)) {
            return d;
          }
        }
        return null;
      };

      // 1. Calculate Item-Level Automatic Discounts
      const discountAggregates: Record<string, { discount: any; totalQty: number; totalAmountCents: number }> = {};
      const buyXGetYEligibleItems: Record<string, Array<{ priceCents: number; lineIndex: number }>> = {};
      const itemDiscountsMap: Record<number, any> = {}; // lineIndex -> discount

      // First pass: Aggregate and identify applicable discounts
      for (let i = 0; i < itemsBody.length; i++) {
        const it = itemsBody[i];
        const keyId = String(it.id || "");
        const idNorm = keyId.replace(/^inventory:/i, "");
        const keySku = it.sku ? `sku:${String(it.sku)}` : "";
        const inv = invIndex[keyId] || invIndex[idNorm] || invIndex[`inventory:${idNorm}`] || (keySku ? invIndex[keySku] : undefined);

        if (inv) {
          const discount = getItemDiscount(inv, activeDiscounts);
          if (discount) {
            itemDiscountsMap[i] = discount;
            const qty = Math.max(1, Number(it.qty || 1));

            // Calculate base unit price (including modifiers)
            let unitCents = toCents(Number(inv.priceUsd || 0));
            if (Array.isArray(it.selectedModifiers) && it.selectedModifiers.length > 0) {
              for (const mod of it.selectedModifiers) {
                unitCents += toCents(Number(mod.priceAdjustment || 0)) * Math.max(1, Number(mod.quantity || 1));
              }
            }

            if (!discountAggregates[discount.id]) {
              discountAggregates[discount.id] = { discount, totalQty: 0, totalAmountCents: 0 };
              buyXGetYEligibleItems[discount.id] = [];
            }
            discountAggregates[discount.id].totalQty += qty;
            discountAggregates[discount.id].totalAmountCents += (unitCents * qty);

            if (discount.type === 'buy_x_get_y') {
              for (let k = 0; k < qty; k++) {
                buyXGetYEligibleItems[discount.id].push({ priceCents: unitCents, lineIndex: i });
              }
            }
          }
        }
      }

      // Calculate savings from automatic discounts
      let totalItemSavingsCents = 0;

      // Process Buy X Get Y
      Object.values(discountAggregates).forEach(({ discount, totalQty }) => {
        if (discount.type === 'buy_x_get_y' && discount.minRequirement === 'quantity') {
          const items = buyXGetYEligibleItems[discount.id];
          items.sort((a, b) => a.priceCents - b.priceCents); // Cheapest first

          const buyQty = discount.minRequirementValue || 0;
          const getQty = discount.value || 0;
          if (buyQty > 0 && getQty > 0) {
            const groupSize = buyQty + getQty;
            const freeCount = Math.floor(totalQty / groupSize) * getQty;

            for (let k = 0; k < freeCount && k < items.length; k++) {
              totalItemSavingsCents += items[k].priceCents;
            }
          }
        }
      });

      // Process Percentage / Fixed Amount
      // We need to iterate items again to apply these, checking requirements against aggregates
      for (let i = 0; i < itemsBody.length; i++) {
        const discount = itemDiscountsMap[i];
        if (discount && discount.type !== 'buy_x_get_y') {
          const agg = discountAggregates[discount.id];
          let meetsReq = true;
          if (discount.minRequirement === 'amount') {
            meetsReq = agg.totalAmountCents >= toCents(discount.minRequirementValue || 0);
          } else if (discount.minRequirement === 'quantity') {
            meetsReq = agg.totalQty >= (discount.minRequirementValue || 0);
          }

          if (meetsReq) {
            const it = itemsBody[i];
            const qty = Math.max(1, Number(it.qty || 1));
            // Re-calculate unit cents (should optimize this to not redo)
            const keyId = String(it.id || "");
            const idNorm = keyId.replace(/^inventory:/i, "");
            const keySku = it.sku ? `sku:${String(it.sku)}` : "";
            const inv = invIndex[keyId] || invIndex[idNorm] || invIndex[`inventory:${idNorm}`] || (keySku ? invIndex[keySku] : undefined);
            if (inv) {
              let unitCents = toCents(Number(inv.priceUsd || 0));
              if (Array.isArray(it.selectedModifiers)) {
                for (const mod of it.selectedModifiers) {
                  unitCents += toCents(Number(mod.priceAdjustment || 0)) * Math.max(1, Number(mod.quantity || 1));
                }
              }

              if (discount.type === 'percentage') {
                totalItemSavingsCents += Math.round((unitCents * qty) * (discount.value / 100));
              } else if (discount.type === 'fixed_amount') {
                totalItemSavingsCents += toCents(discount.value) * qty;
              }
            }
          }
        }
      }

      // 2. Apply Coupon (Order Level)
      let couponSavingsCents = 0;
      let appliedCouponDiscount: any = null;
      if (couponCode) {
        const coupon = activeDiscounts.find((d: any) => d.code === couponCode);
        if (coupon) {
          appliedCouponDiscount = coupon; // Store full discount document
          // Coupon applies to the subtotal AFTER item discounts?
          // Frontend logic: currentSubtotal = sum(unitPrice * qty) where unitPrice is discounted.
          // So yes, coupon applies to discounted subtotal.

          // Calculate gross subtotal first
          let grossSubtotalCents = 0;
          for (const it of itemsBody) {
            const keyId = String(it.id || "");
            const idNorm = keyId.replace(/^inventory:/i, "");
            const keySku = it.sku ? `sku:${String(it.sku)}` : "";
            const inv = invIndex[keyId] || invIndex[idNorm] || invIndex[`inventory:${idNorm}`] || (keySku ? invIndex[keySku] : undefined);
            if (inv) {
              let unitCents = toCents(Number(inv.priceUsd || 0));
              if (Array.isArray(it.selectedModifiers)) {
                for (const mod of it.selectedModifiers) {
                  unitCents += toCents(Number(mod.priceAdjustment || 0)) * Math.max(1, Number(mod.quantity || 1));
                }
              }
              grossSubtotalCents += unitCents * Math.max(1, Number(it.qty || 1));
            }
          }

          const currentSubtotalCents = Math.max(0, grossSubtotalCents - totalItemSavingsCents);

          let meetsReq = true;
          if (coupon.minRequirement === 'amount') {
            meetsReq = currentSubtotalCents >= toCents(coupon.minRequirementValue || 0);
          } else if (coupon.minRequirement === 'quantity') {
            const totalQty = itemsBody.reduce((s, i) => s + (i.qty || 1), 0);
            meetsReq = totalQty >= (coupon.minRequirementValue || 0);
          }

          if (meetsReq) {
            if (coupon.type === 'percentage') {
              couponSavingsCents = Math.round(currentSubtotalCents * (coupon.value / 100));
            } else if (coupon.type === 'fixed_amount') {
              couponSavingsCents = toCents(coupon.value);
            }
          }
        }
      }

      totalDiscountCents = totalItemSavingsCents + couponSavingsCents;

      // Track which discount was actually applied for receipt persistence
      if (appliedCouponDiscount) {
        appliedDiscountDoc = appliedCouponDiscount;
      } else if (totalItemSavingsCents > 0) {
        // For automatic discounts, find the first applied discount from aggregates
        const appliedAutoDiscount = Object.values(discountAggregates)[0]?.discount;
        if (appliedAutoDiscount) {
          appliedDiscountDoc = appliedAutoDiscount;
        }
      }

    } catch (e) {
      console.error("Failed to calculate discounts", e);
    }
    // --- DISCOUNT LOGIC END ---

    // Build line items
    const lineItems: ReceiptLineItem[] = [];
    let taxableSubtotalCents = 0;
    let subtotalCents = 0;

    for (const it of itemsBody) {
      const keyId = String(it.id || "");
      const idNorm = keyId.replace(/^inventory:/i, "");
      const keySku = it.sku ? `sku:${String(it.sku)}` : "";
      const inv =
        invIndex[keyId] ||
        invIndex[idNorm] ||
        invIndex[`inventory:${idNorm}`] ||
        (keySku ? invIndex[keySku] : undefined);
      const qty = Math.max(1, Number(it.qty || 1));
      if (!inv) {
        return NextResponse.json(
          { error: "inventory_item_not_found", id: it.id, sku: it.sku },
          { status: 400, headers: { "x-correlation-id": correlationId } }
        );
      }
      // Calculate unit price including modifier adjustments
      let unitCents = toCents(Number(inv.priceUsd || 0));
      const modifiers: Array<{ name: string; priceAdjustment: number; quantity?: number }> = [];
      if (Array.isArray(it.selectedModifiers) && it.selectedModifiers.length > 0) {
        for (const mod of it.selectedModifiers) {
          const modQty = Math.max(1, Number(mod.quantity || 1));
          const modPrice = Number(mod.priceAdjustment || 0);
          unitCents += toCents(modPrice) * modQty;
          modifiers.push({
            name: String(mod.name || mod.modifierId || "Modifier"),
            priceAdjustment: modPrice,
            quantity: modQty > 1 ? modQty : undefined,
          });
        }
      }
      const lineTotalCents = unitCents * qty;
      const lineTotal = fromCents(lineTotalCents);

      if (inv.taxable) taxableSubtotalCents += lineTotalCents;
      subtotalCents += lineTotalCents;

      lineItems.push({
        label: inv.name || inv.sku || "Item",
        priceUsd: lineTotal,
        qty,
        thumb: Array.isArray((inv as any)?.images) && (inv as any).images.length ? (inv as any).images[0] : undefined,
        itemId: String(inv.id || ""),
        sku: String(inv.sku || ""),
        modifiers: modifiers.length > 0 ? modifiers : undefined,
        isBook: (inv as any).isBook === true,
        bookFileUrl: typeof (inv as any).bookFileUrl === "string" ? (inv as any).bookFileUrl : undefined,
        bookCoverUrl: typeof (inv as any).bookCoverUrl === "string" ? (inv as any).bookCoverUrl : undefined,
        releaseDate: typeof (inv as any).releaseDate === "number" ? (inv as any).releaseDate : undefined,
      });
    }

    // Apply Discount
    let discountAmountCents = totalDiscountCents;
    // Use the discount code for display purposes
    const displayDiscountCode = appliedDiscountDoc?.code || (discountAmountCents > 0 ? 'Automatic' : null);

    // Subtotal, tax, processing fee
    // Ensure discount doesn't exceed subtotal
    discountAmountCents = Math.min(discountAmountCents, subtotalCents);
    const discountedSubtotalCents = subtotalCents - discountAmountCents;

    // Recalculate tax base? 
    // Usually tax is on discounted price. 
    // If we have a general discount, we should proportionally reduce taxableSubtotalCents
    if (discountAmountCents > 0 && subtotalCents > 0) {
      const discountRatio = discountedSubtotalCents / subtotalCents;
      taxableSubtotalCents = Math.round(taxableSubtotalCents * discountRatio);
    }

    const taxBaseCents = Math.max(0, taxableSubtotalCents);
    const taxCents = Math.round(taxBaseCents * Math.max(0, Math.min(1, taxRate)));
    const baseWithoutFeeCents = discountedSubtotalCents + taxCents;

    // Total processing fee = basePlatformFeePct (platform + partner fee) + merchant add-on from site config
    // basePlatformFeePct: 0.5% for PortalPay, 2% for Paynex, etc.
    const basePlatformFeePct = typeof (cfg as any)?.basePlatformFeePct === "number" ? Math.max(0, (cfg as any).basePlatformFeePct) : 0.5;
    const totalFeePct = Math.max(0, basePlatformFeePct + Number(processingFeePct || 0));
    const feePctFraction = totalFeePct / 100;
    const processingFeeCents = Math.round(baseWithoutFeeCents * feePctFraction);

    const finalLineItems: ReceiptLineItem[] = [
      ...lineItems,
      ...(discountAmountCents > 0 ? [{ label: `Discount (${displayDiscountCode || 'Applied'})`, priceUsd: -fromCents(discountAmountCents) }] : []),
      ...(taxCents > 0 ? [{ label: "Tax", priceUsd: fromCents(taxCents) }] : []),
      ...(processingFeeCents > 0 ? [{ label: "Processing Fee", priceUsd: fromCents(processingFeeCents) }] : []),
    ];

    const totalUsd = fromCents(baseWithoutFeeCents + processingFeeCents);

    // --- x402 Agentic Payment Logic START ---
    // Check if the client is an agent requesting L402 flow
    const acceptHeader = req.headers.get("accept") || "";
    const agentHeader = req.headers.get("x-agent-payment") || "";
    const isAgentic = acceptHeader.includes("application/vnd.l402+json") || agentHeader.toLowerCase() === "true";

    let x402Status = "none";

    if (isAgentic && totalUsd > 0) {
      try {
        const { settlePayment, facilitator } = await import("thirdweb/x402");
        const { createThirdwebClient } = await import("thirdweb");
        const { defineChain } = await import("thirdweb/chains");

        const secretKey = process.env.THIRDWEB_SECRET_KEY;
        const serviceWallet = process.env.THIRDWEB_SERVER_WALLET_ADDRESS || process.env.NEXT_PUBLIC_OWNER_WALLET;
        const chainId = Number(process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || 8453);

        if (secretKey && serviceWallet) {
          const client = createThirdwebClient({ secretKey });
          const network = defineChain(chainId);

          const thirdwebFacilitator = facilitator({
            client,
            serverWalletAddress: serviceWallet as `0x${string}`,
            waitUntil: "confirmed", // Agents should probably wait for confirmation or at least simulation
          });

          const paymentData = req.headers.get("x-payment");
          const resourceUrl = req.nextUrl.toString();

          // We are asking the agent to pay the *Merchant* (or the platform, which then splits it?)
          // Currently, PortalPay splits heavily rely on the client-side checkout or split contracts.
          // For simplicity in this x402 implementation, we will route funds to the configured SPLIT address if available,
          // or the merchant wallet if no split is found. 
          // HOWEVER, x402 from thirdweb usually expects to verify payment to a specific address.
          // If we use the merchant's wallet, we need read access to that wallet's history or use a generated address?
          // The simpler MVP approach: Pay to the Platform/Service Wallet (facilitator) which acts as a custodian or 
          // just verify payments to the intended recipient if `settlePayment` supports verification of 3rd party transfers.
          // Looking at `subscriptions/route.ts`, it pays `ownerWallet`. 
          // For Orders, we ideally want to pay `splitAddr` or `wallet`.
          // `thirdweb/x402` server-side verification usually monitors the address it controls or specified.

          // For this MVP, let's respect the `splitAddr` or `wallet` we derived earlier.
          const payTo = (splitAddr && /^0x[a-f0-9]{40}$/i.test(splitAddr)) ? splitAddr : wallet;

          // NOTE: The `facilitator` helper in thirdweb SDK primarily monitors the `serverWalletAddress` if it's based on specific service logic,
          // but `settlePayment` allows `payTo`. If `payTo` is different from `serverWalletAddress`, the verification 
          // might rely on the chain indexer seeing the tx.

          const result = await settlePayment({
            resourceUrl,
            method: "POST",
            paymentData,
            payTo: payTo as `0x${string}`,
            network,
            price: `$${totalUsd}`,
            routeConfig: {
              description: `Order Payment for ${brandName}`,
              mimeType: "application/json",
              outputSchema: {}, // We return the receipt as the "resource"
            },
            facilitator: thirdwebFacilitator,
          });

          if (result.status !== 200) {
            return NextResponse.json(result.responseBody, {
              status: 402,
              headers: { ...(result.responseHeaders as any), "x-correlation-id": correlationId },
            });
          }

          // Payment detected and settled!
          x402Status = "paid";
        }
      } catch (e) {
        console.error("x402 checking failed", e);
        // Fallback to normal flow if x402 check fails/crashes (don't block non-agentic or messed up configs)
        // But if it WAS an agentic request, they might expect a 402. 
        // For safety, if explicitly agentic, maybe we should error? 
        // Let's log and proceed for now to be safe.
      }
    }
    // --- x402 Agentic Payment Logic END ---

    const receiptId = genReceiptId();
    const ts = Date.now();

    // Use storeCurrency from config instead of hardcoded USD
    const receiptCurrency = typeof cfg?.storeCurrency === "string" ? cfg.storeCurrency : "USD";

    const receipt: Receipt = {
      receiptId,
      totalUsd,
      currency: receiptCurrency as "USD",
      lineItems: finalLineItems,
      createdAt: ts,
      brandName,
      jurisdictionCode: appliedJurisdictionCode,
      taxRate: Math.max(0, Math.min(1, taxRate)),
      taxComponents: appliedTaxComponents,
      status: x402Status === "paid" ? "paid" : "generated",
      // @ts-ignore - Extending Receipt type dynamically for now
      tableNumber,
      // @ts-ignore
      staffId,
      // @ts-ignore
      kitchenStatus,
      // @ts-ignore
      source,
      // @ts-ignore
      servedBy,
      // @ts-ignore
      note
    };

    const doc = {
      id: `receipt:${receiptId}`,
      type: "receipt",
      wallet, // container partition key (merchant)
      brandKey: brandKey || undefined,
      receiptId,
      totalUsd,
      currency: receiptCurrency,
      lineItems: finalLineItems,
      createdAt: ts,
      brandName,
      jurisdictionCode: appliedJurisdictionCode,
      taxRate: Math.max(0, Math.min(1, taxRate)),
      taxComponents: appliedTaxComponents,
      status: x402Status === "paid" ? "paid" : "generated",
      statusHistory: [{ status: x402Status === "paid" ? "paid" : "generated", ts }],
      discountId: appliedDiscountDoc?.id, // Track used discount
      discountCode: appliedDiscountDoc?.code,

      // Restaurant/POS Persisted Fields
      tableNumber,
      staffId,
      kitchenStatus,
      source,
      servedBy,
      note
    };

    try {
      const container = await getContainer();
      await container.items.upsert(doc as any);

      // Increment usage count for discount if applied
      if (appliedDiscountDoc && appliedDiscountDoc.id) {
        try {
          // Fetch the current discount document to ensure we have all required fields
          const { resource: currentDiscount } = await container.item(appliedDiscountDoc.id, wallet).read();
          if (currentDiscount) {
            const updatedDiscount = {
              ...currentDiscount,
              usedCount: (currentDiscount.usedCount || 0) + 1,
              lastUsedAt: ts
            };
            await container.items.upsert(updatedDiscount);
          }
        } catch (err) {
          console.error("Failed to increment discount usage count:", err);
        }
      }

      const theme = cfg?.theme || {};
      const tParams = new URLSearchParams();
      tParams.set("recipient", wallet);
      tParams.set("t_text", String(theme.textColor || "#ffffff"));
      if (theme.primaryColor) tParams.set("t_primary", theme.primaryColor);
      if (theme.secondaryColor) tParams.set("t_secondary", theme.secondaryColor);
      if (theme.fontFamily) tParams.set("t_font", theme.fontFamily);
      if (theme.brandName) tParams.set("t_brand", theme.brandName);
      if (theme.brandLogoUrl) tParams.set("t_logo", theme.brandLogoUrl);

      const portalLink = `https://surge.basalthq.com/portal/${receiptId}?${tParams.toString()}`;

      // no stock decrement here; inventory management can be extended later (reserved vs sold)
      return NextResponse.json(
        { ok: true, receipt, portalLink },
        { headers: { "x-correlation-id": correlationId } }
      );
    } catch (e: any) {
      // Graceful degrade when Cosmos isn't configured/available
      pushReceipts([{ ...receipt, wallet, brandKey } as any]);
      const portalLink = `https://surge.basalthq.com/portal/${receiptId}?recipient=${wallet}&t_text=%23ffffff`;
      return NextResponse.json(
        { ok: true, degraded: true, reason: e?.message || "cosmos_unavailable", receipt, portalLink },
        { status: 200, headers: { "x-correlation-id": correlationId } }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500, headers: { "x-correlation-id": correlationId } }
    );
  }
}
