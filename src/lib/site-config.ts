import { getContainer } from "@/lib/cosmos";
import { getBrandKey } from "@/config/brands";
import { isPartnerContext } from "@/lib/env";

const DOC_ID = "site:config";

function getDocIdForBrand(brandKey?: string): string {
  try {
    const key = String(brandKey || "").toLowerCase();
    // Legacy mapping: portalpay and basaltsurge share the 'site:config:portalpay' document ID
    if (!key || key === "portalpay" || key === "basaltsurge") return "site:config:portalpay";
    return `${DOC_ID}:${key}`;
  } catch {
    return DOC_ID;
  }
}

export type SiteTheme = {
  primaryColor: string;
  secondaryColor: string;
  brandLogoUrl: string;
  brandFaviconUrl: string;
  brandName: string;
  fontFamily: string;
  receiptBackgroundUrl: string;
};

export type SiteConfig = {
  story: string;
  storyHtml: string;
  defiEnabled: boolean;
  theme: SiteTheme;
  processingFeePct?: number; // optional checkout processing fee percentage (e.g., 2.9)
  reserveRatios?: Record<string, number>; // optional reserve ratios by symbol: { USDC: 0.4, USDT: 0.2, cbBTC: 0.2, cbXRP: 0.1, ETH: 0.1, SOL: 0.1 }
  defaultPaymentToken?: "ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP" | "SOL"; // default payment token for portal page

  // Per-merchant split routing (PaymentSplitter/Split) for on-chain revenue share
  splitAddress?: string; // if set, checkout will route to this instead of the merchant EOA
  split?: {
    address: string;
    recipients?: { address: string; sharesBps: number }[];
  };

  [key: string]: any;
};

function defaultTheme(): SiteTheme {
  const brandKey = (process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "basaltsurge").toLowerCase();
  // Force BasaltSurge if nothing else matches, or if it's basaltsurge
  const isBasalt = true; // Always default to Basalt branding now

  return {
    primaryColor: "#35ff7c", // Basalt neon green
    secondaryColor: "#16A34A",
    // Neutral defaults to prevent PortalPay takeover; actual logos injected from BrandContext or site-config
    brandLogoUrl: "/BasaltSurgeWideD.png",
    brandFaviconUrl: "/Surge.png", // Use shield PNG as favicon
    brandName: "BasaltSurge",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    receiptBackgroundUrl: "/watermark.png",
  };
}

function normalize(raw?: any): SiteConfig {
  const base: any = {
    story: "",
    storyHtml: "",
    // PortalPay: DeFi removed; default to disabled
    defiEnabled: false,
    theme: defaultTheme(),
  };
  if (raw && typeof raw === "object") Object.assign(base, raw);

  base.story = typeof base.story === "string" ? base.story : "";
  base.storyHtml = typeof base.storyHtml === "string" ? base.storyHtml : "";

  // Defi gate: force boolean; default false for PortalPay
  base.defiEnabled = base.defiEnabled === true ? true : false;

  // Theme normalization
  const t = base.theme || {};
  base.theme = {
    primaryColor: typeof t.primaryColor === "string" ? t.primaryColor : defaultTheme().primaryColor,
    secondaryColor: typeof t.secondaryColor === "string" ? t.secondaryColor : defaultTheme().secondaryColor,
    brandLogoUrl: typeof t.brandLogoUrl === "string" ? t.brandLogoUrl : "",
    brandFaviconUrl: typeof t.brandFaviconUrl === "string" ? t.brandFaviconUrl : defaultTheme().brandFaviconUrl,
    brandName: typeof t.brandName === "string" ? t.brandName : defaultTheme().brandName,
    fontFamily: typeof t.fontFamily === "string" ? t.fontFamily : defaultTheme().fontFamily,
    receiptBackgroundUrl: typeof t.receiptBackgroundUrl === "string" ? t.receiptBackgroundUrl : defaultTheme().receiptBackgroundUrl,
  };

  // Optional fields
  if (typeof base.processingFeePct !== "number" || base.processingFeePct < 0) {
    base.processingFeePct = undefined;
  }
  if (!base.reserveRatios || typeof base.reserveRatios !== "object") {
    base.reserveRatios = undefined;
  }
  // Default payment token validation
  const validTokens = ["ETH", "USDC", "USDT", "cbBTC", "cbXRP", "SOL"];
  if (!validTokens.includes(base.defaultPaymentToken)) {
    base.defaultPaymentToken = "ETH"; // default to ETH if not set or invalid
  }

  // Split config normalization (supports top-level and nested under config.*)
  const isHex = (s: any) => /^0x[a-fA-F0-9]{40}$/.test(String(s || "").trim());

  // Normalize nested config if present
  const cfg = base && typeof base === "object" && typeof base.config === "object" ? base.config : undefined;

  // Determine split address from various locations
  const nestedSplitAddr =
    (cfg && isHex(cfg.splitAddress) ? cfg.splitAddress : undefined) ||
    (cfg && cfg.split && isHex(cfg.split.address) ? cfg.split.address : undefined) ||
    undefined;

  // Prefer explicit top-level when valid; otherwise hoist from nested config
  if (!isHex(base.splitAddress) && nestedSplitAddr) {
    base.splitAddress = nestedSplitAddr;
  }
  if (!isHex(base.splitAddress)) {
    base.splitAddress = undefined;
  }

  // Build unified split object with recipients
  const existingSplitAddr = base?.split && isHex(base.split.address) ? base.split.address : undefined;
  const effectiveSplitAddr = existingSplitAddr || base.splitAddress || nestedSplitAddr || undefined;

  // Collect recipients from either top-level split or nested config.split/recipients
  const recipientsIn = Array.isArray(base?.split?.recipients)
    ? base.split.recipients
    : Array.isArray(cfg?.split?.recipients)
      ? cfg.split.recipients
      : Array.isArray(cfg?.recipients)
        ? cfg.recipients
        : [];

  const recipients = recipientsIn
    .map((r: any) => {
      const a = isHex(r?.address) ? r.address : undefined;
      const b = Math.max(0, Math.min(10000, Number(r?.sharesBps || 0)));
      return a ? { address: a, sharesBps: b } : null;
    })
    .filter(Boolean);

  base.split = effectiveSplitAddr ? { address: effectiveSplitAddr, recipients } : undefined;

  return base as SiteConfig;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  try {
    const c = await getContainer();
    const { resource } = await c.item(DOC_ID, DOC_ID).read<any>();
    return normalize(resource);
  } catch {
    return normalize();
  }
}

export async function getSiteConfigForWallet(wallet?: string): Promise<SiteConfig> {
  try {
    const c = await getContainer();

    // Prefer brand-scoped site config when a brand is configured (safe fallback to legacy).
    let brandKey: string | undefined = undefined;
    try {
      brandKey = getBrandKey();
      // Explicitly alias basaltsurge to portalpay to ensure it shares the exact same config/split logic
      // This forces the lookup to treat basaltsurge exactly like the main portalpay instance
      if (brandKey && String(brandKey).toLowerCase() === "basaltsurge") {
        brandKey = "portalpay";
      }
    } catch {
      // brand not configured (e.g., platform container w/ legacy merchants) — continue with legacy flow
      brandKey = undefined;
    }

    if (wallet && typeof wallet === "string" && wallet.length > 0) {
      // console.log("[site-config] lookup", { wallet, brandKey });
      // 1) Try brand-scoped doc first (e.g., "site:config:<brandKey>")
      if (brandKey) {
        try {
          const docId = getDocIdForBrand(brandKey);
          // console.log("[site-config] step1 try", { docId, wallet });
          const { resource } = await c.item(docId, wallet).read<any>();
          if (resource) {
            const n = normalize(resource);
            const hasSplit = n.splitAddress || n.split?.address;
            // console.log("[site-config] step1 found", { id: resource.id, brandKey: resource.brandKey, hasSplit, splitAddr: n.splitAddress });
            const normalizedBrand = (brandKey || "").toLowerCase();
            const isPlatform = normalizedBrand === "portalpay" || normalizedBrand === "basaltsurge";
            if (hasSplit || !isPlatform) return n;
            // platform brand without split in brand-scoped doc: continue to legacy/global search
          }
        } catch { }
      }
      // 2) Fallback to legacy per-wallet doc ("site:config" partitioned by wallet)
      // IMPORTANT: Partner containers should NOT fall back to legacy docs to prevent cross-tenant data leakage
      const partnerCtx = isPartnerContext();
      if (!partnerCtx || !brandKey || String(brandKey).toLowerCase() === "portalpay" || String(brandKey).toLowerCase() === "basaltsurge") {
        try {
          const { resource } = await c.item(DOC_ID, wallet).read<any>();
          if (resource) {
            const normalizedLegacy = normalize(resource);
            const hasSplitLegacy =
              /^0x[a-fA-F0-9]{40}$/.test(String((normalizedLegacy as any)?.splitAddress || "")) ||
              /^0x[a-fA-F0-9]{40}$/.test(String((normalizedLegacy as any)?.split?.address || ""));
            // console.log("[site-config] step2 legacy found", { id: resource.id, hasSplitLegacy, splitAddr: normalizedLegacy.splitAddress });
            if (hasSplitLegacy) {
              return normalizedLegacy;
            }
            // Legacy doc exists but no split bound — inherit from global if platform brand
            const normalizedBrand = (brandKey || "").toLowerCase();
            if (normalizedBrand === "portalpay" || normalizedBrand === "basaltsurge") {
              try {
                const { resource: globalRes } = await c.item(DOC_ID, DOC_ID).read<any>();
                if (globalRes) {
                  const g = normalize(globalRes);
                  if (g.splitAddress || g.split?.address) {
                    normalizedLegacy.splitAddress = g.splitAddress || g.split?.address;
                    normalizedLegacy.split = g.split;
                    return normalizedLegacy;
                  }
                }
              } catch { }
            }
            // Legacy doc exists but no split bound — look for any brand-scoped doc with a split for this wallet.
            try {
              const spec2 = {
                query: "SELECT TOP 1 c FROM c WHERE c.type=@type AND c.wallet=@wallet AND (IS_DEFINED(c.splitAddress) OR (IS_DEFINED(c.split.address) AND LENGTH(c.split.address) > 0)) ORDER BY c.updatedAt DESC",
                parameters: [
                  { name: "@type", value: "site_config" },
                  { name: "@wallet", value: wallet }
                ],
              } as { query: string; parameters: { name: string; value: any }[] };
              const { resources: rows2 } = await c.items.query(spec2).fetchAll();
              const row2 = Array.isArray(rows2) && rows2[0] ? rows2[0] : null;
              if (row2) {
                // console.log("[site-config] step2 query found", { id: row2.id, splitAddr: row2.splitAddress });
                return normalize(row2);
              }
            } catch { }
            // No alternative with split found; return the legacy-normalized config.
            return normalizedLegacy;
          }
        } catch { }
      }
    }

    // 2.5) Fallback: locate any site_config document for this wallet (brand-scoped or legacy)
    // This covers cases where partner containers persisted brand-scoped docs (e.g., site:config:<brand>)
    // and platform containers are resolving only legacy doc ids.
    try {
      const spec = {
        query: "SELECT TOP 1 c FROM c WHERE c.type=@type AND c.wallet=@wallet ORDER BY c.updatedAt DESC",
        parameters: [
          { name: "@type", value: "site_config" },
          { name: "@wallet", value: wallet }
        ],
      } as { query: string; parameters: { name: string; value: any }[] };
      const { resources } = await c.items.query(spec).fetchAll();
      const row = Array.isArray(resources) && resources[0] ? resources[0] : null;
      if (row) {
        // console.log("[site-config] step2.5 query found", { id: row.id });
        return normalize(row);
      }
    } catch { }

    // 3) Global singleton fallback ("site:config" partitioned by "site:config")
    try {
      const { resource } = await c.item(DOC_ID, DOC_ID).read<any>();
      return normalize(resource);
    } catch {
      return normalize();
    }
  } catch {
    return normalize();
  }
}

export async function isDefiEnabled(): Promise<boolean> {
  const cfg = await getSiteConfig();
  // PortalPay: respect stored value but default is disabled
  return cfg.defiEnabled === true;
}
