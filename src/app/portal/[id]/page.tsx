"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckoutWidget, darkTheme } from "thirdweb/react";
import { getAddress } from "thirdweb";
import dynamic from "next/dynamic";
const ConnectButton = dynamic(() => import("thirdweb/react").then((m) => m.ConnectButton), { ssr: false });
import { client, chain, getWallets } from "@/lib/thirdweb/client";
import { base } from "thirdweb/chains";
import { usePortalThirdwebTheme, getConnectButtonStyle, connectButtonClass } from "@/lib/thirdweb/theme";
import { buildReceiptEndpoint, buildReceiptFetchInit } from "@/lib/receipts";
import { useActiveAccount } from "thirdweb/react";
import { getDefaultBrandName, getDefaultBrandSymbol, resolveBrandAppLogo, resolveBrandSymbol } from "@/lib/branding";
import { fetchEthRates, fetchUsdRates, fetchBtcUsd, fetchXrpUsd, type EthRates } from "@/lib/eth";
import { SUPPORTED_CURRENCIES, convertFromUsd, formatCurrency, getCurrencyFlag, roundForCurrency } from "@/lib/fx";

// Live QR Payment Portal: supports compact (default) and wide layout variants.
// Embedded mode (embedded=1 or iframe) removes page background to fit seamlessly in host modals.

type SiteTheme = {
  primaryColor: string;
  secondaryColor: string;
  brandLogoUrl: string;
  brandFaviconUrl: string;
  symbolLogoUrl?: string;
  brandName: string;
  fontFamily: string;
  receiptBackgroundUrl: string;
  brandLogoShape?: "round" | "square";
  textColor?: string;
  headerTextColor?: string;
  bodyTextColor?: string;
  navbarMode?: "symbol" | "logo";
  brandKey?: string;
};

type SiteConfigResponse = {
  config?: {
    theme?: SiteTheme;
    defaultPaymentToken?: "ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP" | "SOL";
    processingFeePct?: number;
    tokens?: TokenDef[];
  };
  degraded?: boolean;
  reason?: string;
};

const CURRENCIES = SUPPORTED_CURRENCIES;

type ReceiptLineItem = {
  label: string;
  priceUsd: number;
  qty?: number;
};

type Receipt = {
  receiptId: string;
  totalUsd: number;
  currency: "USD";
  lineItems: ReceiptLineItem[];
  createdAt: number;
  brandName?: string;
  jurisdictionCode?: string;
  taxRate?: number;
  taxComponents?: string[];
  tipAmount?: number;
  employeeId?: string;
  sessionId?: string;
  status?: string;
};

// Helper to determine if receipt is already paid/settled
function isSettled(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s === "paid" ||
    s === "checkout_success" ||
    s === "confirmed" ||
    s === "reconciled" ||
    s === "tx_mined" ||
    s === "recipient_validated" ||
    s.includes("refund")
  );
}

type TokenDef = {
  symbol: "ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP" | "SOL";
  type: "native" | "erc20";
  address?: string;
  decimals?: number;
};

function getBuildTimeTokens(): TokenDef[] {
  const tokens: TokenDef[] = [];
  tokens.push({ symbol: "ETH", type: "native" });

  // Helper to sanitize env vars (remove quotes, whitespace)
  const sanitize = (s: string | undefined) => (s || "").replace(/["']/g, "").trim();

  const usdc = sanitize(process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS) || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
  const usdt = sanitize(process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS) || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"; // Base USDT
  const cbbtc = sanitize(process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS) || "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"; // Base cbBTC
  const cbxrp = sanitize(process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS) || "0xcb585250f852C6c6bf90434AB21A00f02833a4af"; // cbXRP
  const sol = sanitize(process.env.NEXT_PUBLIC_BASE_SOL_ADDRESS) || "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82";

  if (usdc)
    tokens.push({
      symbol: "USDC",
      type: "erc20",
      address: usdc,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6),
    });
  if (usdt)
    tokens.push({
      symbol: "USDT",
      type: "erc20",
      address: usdt,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6),
    });
  if (cbbtc)
    tokens.push({
      symbol: "cbBTC",
      type: "erc20",
      address: cbbtc,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8),
    });
  if (cbxrp)
    tokens.push({
      symbol: "cbXRP",
      type: "erc20",
      address: cbxrp,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6),
    });
  if (sol)
    tokens.push({
      symbol: "SOL",
      type: "erc20",
      address: sol,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_SOL_DECIMALS || 9),
    });

  return tokens;
}

function isValidHexAddress(addr: string): boolean {
  try {
    return /^0x[a-fA-F0-9]{40}$/.test(String(addr || "").trim());
  } catch {
    return false;
  }
}

function selectTokenFromRatios(ratios: Record<string, number> | undefined, available: TokenDef[]): string | null {
  if (!ratios || Object.keys(ratios).length === 0) return null;

  // Filter ratios to only include available tokens
  const candidates: { symbol: string; weight: number }[] = [];
  let totalWeight = 0;

  for (const [symbol, weight] of Object.entries(ratios)) {
    // Basic validation: weight > 0
    if (typeof weight !== "number" || weight <= 0) continue;

    // Check if token is available/supported
    const isAvail = available.some(t => t.symbol === symbol || (symbol === "ETH" && t.type === "native"));
    if (isAvail) {
      candidates.push({ symbol, weight });
      totalWeight += weight;
    }
  }

  if (candidates.length === 0) return null;

  // Weighted random selection
  let r = Math.random() * totalWeight;
  for (const c of candidates) {
    if (r < c.weight) return c.symbol;
    r -= c.weight;
  }

  // Fallback to first candidate (should rarely happen due to float precision)
  return candidates[0].symbol;
}

export default function PortalReceiptPage() {
  // ... (hooks)

  const twTheme = usePortalThirdwebTheme();
  const { id } = useParams() as { id?: string };
  const receiptId = String(id || "");
  const account = useActiveAccount();
  const [wallets, setWallets] = useState<any[]>([]);
  useEffect(() => {
    let mounted = true;
    getWallets()
      .then((w) => { if (mounted) setWallets(w as any[]); })
      .catch(() => setWallets([]));
    return () => { mounted = false; };
  }, []);
  const loggedIn = !!account?.address;
  const viewerWalletLower = (account?.address || "").toLowerCase();
  const [resolvedRecipient, setResolvedRecipient] = useState<`0x${string}` | undefined>(undefined);

  // Site theme (seeded with brand defaults to avoid hydration flash)
  const [theme, setTheme] = useState<SiteTheme>(() => {
    const isBS = typeof window !== "undefined"
      ? (window.location.host.toLowerCase().includes("basaltsurge") || (process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase() === "basaltsurge")
      : (process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase() === "basaltsurge";

    return {
      primaryColor: isBS ? "#35ff7c" : "#10b981",
      secondaryColor: isBS ? "#FF6B35" : "#2dd4bf",
      brandLogoUrl: isBS ? "/BasaltSurgeWideD.png" : "/ppsymbol.png",
      brandFaviconUrl: "/favicon-32x32.png",
      symbolLogoUrl: isBS ? "/BasaltSurgeD.png" : undefined,
      brandName: "BasaltSurge",
      fontFamily:
        "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      receiptBackgroundUrl: "/watermark.png",
      brandLogoShape: isBS ? "square" : "round",
      navbarMode: isBS ? "logo" : undefined,
      textColor: "#ffffff",
      headerTextColor: "#ffffff",
      bodyTextColor: "#e5e7eb",
    };
  });

  // Partner brand colors from container config (for partner containers without merchant theme)
  const [partnerBrandColors, setPartnerBrandColors] = useState<{ primary?: string; accent?: string } | null>(null);

  // Partner brand logos from container config
  const [partnerLogoApp, setPartnerLogoApp] = useState<string>("");
  const [partnerLogoSymbol, setPartnerLogoSymbol] = useState<string>("");
  const [partnerLogoFavicon, setPartnerLogoFavicon] = useState<string>("");
  const [partnerBrandName, setPartnerBrandName] = useState<string>("");



  // URL params and layout/embedding detection
  const searchParams = useSearchParams();
  const layoutParam = String(searchParams?.get("layout") || "").toLowerCase();
  const modeParam = String(searchParams?.get("mode") || "").toLowerCase();
  const invoiceParam = String(searchParams?.get("invoice") || "").toLowerCase();
  const isWideLayout = layoutParam === "wide";
  const isInvoiceLayout = layoutParam === "invoice" || modeParam === "invoice" || invoiceParam === "1" || invoiceParam === "true";
  const embeddedParam = String(searchParams?.get("embedded") || "");
  const isEmbeddedParam = embeddedParam === "1";
  const [isIframe, setIsIframe] = useState(false);
  const isEmbedded = isEmbeddedParam || isIframe;
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobileViewport(mq.matches);
    onChange();
    try { mq.addEventListener("change", onChange); } catch { mq.addListener(onChange); }
    return () => {
      try { mq.removeEventListener("change", onChange); } catch { mq.removeListener(onChange); }
    };
  }, []);
  const isResponsiveWide = useMemo(() => {
    if (layoutParam === "wide") return true;
    if (layoutParam === "compact") return false;
    // Fallback to viewport: wide on tablets/desktop, compact on phones
    return !isMobileViewport;
  }, [layoutParam, isMobileViewport]);
  // For embedded mode, always use compact (single column) layout on mobile
  const isTwoColumnLayout = isEmbedded ? (!isMobileViewport && (isInvoiceLayout || isResponsiveWide)) : (isInvoiceLayout || isResponsiveWide);
  const EMBEDDED_WIDGET_HEIGHT = Number(searchParams?.get("e_h") || 320);
  const mobileTextColor = isMobileViewport ? "#ffffff" : undefined;
  const forceEmbedTextColor = isEmbedded ? "#ffffff" : undefined;
  // Move wallet theme readiness earlier so effects can safely depend on it
  const [walletThemeLoaded, setWalletThemeLoaded] = useState(false);
  const [useMerchantThemeLock, setUseMerchantThemeLock] = useState(false);

  // Shop slug propagated from public shop page to tag receipts for reviews
  const shopSlugParam = String(searchParams?.get("shop") || "").toLowerCase();

  // Optional theme override parameters (passed by shop slugs)
  const tPrimary = String(searchParams?.get("t_primary") || "").trim();
  const tSecondary = String(searchParams?.get("t_secondary") || "").trim();
  const tText = String(searchParams?.get("t_text") || "").trim();
  const tFont = String(searchParams?.get("t_font") || "").trim();
  const tBrand = String(searchParams?.get("t_brand") || "").trim();
  const tLogo = String(searchParams?.get("t_logo") || "").trim();
  const hasThemeOverride =
    !!tPrimary || !!tSecondary || !!tText || !!tFont || !!tBrand || !!tLogo;
  const hasColorOverride = !!tPrimary || !!tSecondary || !!tText;

  // Detect iframe on client-side to avoid hydration mismatch
  useEffect(() => {
    setIsIframe(typeof window !== "undefined" && window.parent && window.parent !== window);
  }, []);


  // Resolve recipient from QR/link param or ?wallet if present; fallback to default
  const recipientParam = String(searchParams?.get("recipient") || "").toLowerCase();
  const walletParam = String(searchParams?.get("wallet") || "").toLowerCase();
  const recipient = (isValidHexAddress(recipientParam) ? (recipientParam as `0x${string}`) : (isValidHexAddress(walletParam) ? (walletParam as `0x${string}`) : ("" as any)));
  const hasRecipient = isValidHexAddress(recipient);
  // Force PortalPay theme for subscription flows
  const forcePortalTheme = String(searchParams?.get("forcePortalTheme") || "") === "1";
  // Resolve merchant wallet STRICTLY from URL recipient to avoid any cross-user/authed wallet bleed.
  // We do NOT fall back to receipt-resolved or authed wallet here on portal routes.
  const merchantWallet = (hasRecipient ? (recipient as `0x${string}`) : undefined);
  const merchantWalletLower = (merchantWallet || "").toLowerCase();

  // Smart fallback: If URL doesn't have recipient, use the one resolved from receipt (to fix logos)
  const effectiveMerchantWallet = merchantWallet || resolvedRecipient;

  // Merchant theme is expected when viewer is not the recipient (buyer flow) and not forcing default
  // Allow merchant to see their own theme if they are visiting via a parameterized URL (verification/preview flow)
  const hasMerchantForTheme = useMerchantThemeLock || (!!effectiveMerchantWallet && !forcePortalTheme);

  // Compute effective colors: Merchant theme takes precedence over partner container if a merchant is active
  const effectivePrimaryColor = (hasMerchantForTheme && theme.primaryColor) || partnerBrandColors?.primary || theme.primaryColor;
  const effectiveSecondaryColor = (hasMerchantForTheme && theme.secondaryColor) || partnerBrandColors?.accent || theme.secondaryColor;

  // Compute effective logos: Merchant theme takes precedence over partner container if a merchant is active
  // This ensures the PFP/Shop Logo (which resides in theme) wins over any container defaults.
  const effectiveLogoApp = (hasMerchantForTheme && theme.brandLogoUrl) || partnerLogoApp || theme.brandLogoUrl || "";
  // Fallback to brandLogoUrl (PFP) if symbolLogoUrl is missing to prevents dropping through to partner defaults
  const effectiveLogoSymbol = (hasMerchantForTheme && (theme.symbolLogoUrl || theme.brandLogoUrl)) || partnerLogoSymbol || theme.symbolLogoUrl || "";
  const effectiveLogoFavicon = (hasMerchantForTheme && theme.brandFaviconUrl) || partnerLogoFavicon || theme.brandFaviconUrl || "";
  const effectiveBrandName = (hasMerchantForTheme && theme.brandName) || partnerBrandName || theme.brandName || "BasaltSurge";

  // Helper functions to get the best available logo
  const defaultPortalSymbol = getDefaultBrandSymbol(theme.brandKey);
  const getHeaderLogo = () => effectiveLogoApp || effectiveLogoSymbol || effectiveLogoFavicon || defaultPortalSymbol;
  const getSymbolLogo = () => effectiveLogoSymbol || effectiveLogoFavicon || effectiveLogoApp || defaultPortalSymbol;

  // Persist merchant theme expectation for invoice layout once merchant wallet is known
  React.useLayoutEffect(() => {
    try {
      if (merchantWallet && isInvoiceLayout && !forcePortalTheme) {
        setUseMerchantThemeLock(true);
        const root = document.documentElement;
        root.setAttribute("data-pp-theme-hardlock", "merchant");
        root.setAttribute("data-pp-theme-lock", "merchant");
      }
    } catch { }
  }, [merchantWallet, isInvoiceLayout, forcePortalTheme]);

  // Clear all CSS variables on mount to prevent flash from previous session.
  // Guard: If shop provided color overrides or a merchant theme is expected, do NOT clear here,
  // because we either apply overrides synchronously or clear/apply in the merchant fetch path.
  useEffect(() => {
    if (hasColorOverride || hasMerchantForTheme) return;
    try {
      const root = document.documentElement;
      root.style.removeProperty("--pp-primary");
      root.style.removeProperty("--pp-secondary");
      root.style.removeProperty("--pp-text");
      root.style.removeProperty("--pp-text-header");
      root.style.removeProperty("--pp-text-body");
      root.style.removeProperty("--primary");
      root.style.removeProperty("--pp-font");
    } catch { }
  }, [hasColorOverride, hasMerchantForTheme]);

  // Set deterministic theme lock early to prevent global ThemeLoader from overriding merchant/default portal themes
  React.useLayoutEffect(() => {
    try {
      const root = document.documentElement;
      const lock = forcePortalTheme ? "portalpay-default" : (hasMerchantForTheme ? "merchant" : "user");
      root.setAttribute("data-pp-theme-lock", lock);
      if (lock === "merchant") {
        root.setAttribute("data-pp-theme-hardlock", "merchant");
      } else {
        root.removeAttribute("data-pp-theme-hardlock");
      }
    } catch { }
    // Reset lock on unmount to avoid persisting merchant/default state across routes
    return () => {
      try {
        const root = document.documentElement;
        root.setAttribute("data-pp-theme-lock", "user");
        root.removeAttribute("data-pp-theme-hardlock");
      } catch { }
    };
  }, [merchantWallet, receiptId, hasMerchantForTheme, forcePortalTheme]);

  // On portal routes, never fetch a global user theme here — the portal component owns theme application.
  useEffect(() => {
    return;
  }, [hasMerchantForTheme, forcePortalTheme, walletThemeLoaded, isInvoiceLayout]);

  // Correlation ID from query for parent postMessage
  const correlationId = String(searchParams?.get("correlationId") || "");
  // App URL for postMessage target; fallback to current origin in dev
  const appUrl =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
      : (process.env.NEXT_PUBLIC_APP_URL || "");
  // Derive the parent page's origin from document.referrer when embedded (iframe), falling back to app URL.
  let parentOrigin = "";
  try {
    if (typeof document !== "undefined" && typeof document.referrer === "string" && document.referrer.length > 0) {
      parentOrigin = new URL(document.referrer).origin;
    }
  } catch { }
  const targetOrigin = parentOrigin || appUrl;

  // Explicit readiness flags for loader dismissal
  const [configReady, setConfigReady] = useState(false);
  const [receiptReady, setReceiptReady] = useState(false);
  const [portalReadySent, setPortalReadySent] = useState(false);
  const [merchantAvail, setMerchantAvail] = useState<null | boolean>(null);
  const [merchantGraceWindowElapsed, setMerchantGraceWindowElapsed] = useState(false);
  const [isClientSide, setIsClientSide] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastPreferredHeightRef = useRef<number>(0);
  const loadedMerchantWalletRef = useRef<string>("");

  // Deduplicate /api/site/config calls per-merchant (cache + in-flight coalescing)
  const cfgCacheRef = useRef<Map<string, SiteConfigResponse>>(new Map());
  const inflightCfgRef = useRef<Map<string, Promise<SiteConfigResponse>>>(new Map());
  const getSiteConfigOnce = async (key: string, walletHex: string): Promise<SiteConfigResponse> => {
    try {
      const normKey = String(key || walletHex || "").toLowerCase();
      if (cfgCacheRef.current.has(normKey)) {
        return cfgCacheRef.current.get(normKey)!;
      }
      if (inflightCfgRef.current.has(normKey)) {
        return await inflightCfgRef.current.get(normKey)!;
      }
      const p = (async () => {
        const url = `/api/site/config?wallet=${encodeURIComponent(walletHex)}`;
        const headers = { "x-theme-caller": "PortalPage:merchant", "x-wallet": String(walletHex || "").toLowerCase(), "x-recipient": String(walletHex || "").toLowerCase() };

        // Concurrently fetch site config, shop config, AND user profile for smart logo fallback
        const [siteRes, shopConfig, profileRes] = await Promise.all([
          fetch(url, { cache: "no-store", headers }).then(r => r.json()).catch(() => ({} as any)),
          walletHex
            ? fetch(`/api/shop/config?wallet=${encodeURIComponent(walletHex)}`, { cache: "no-store", headers: { "x-theme-caller": "PortalPage:merchant:shop" } })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
            : Promise.resolve(null),
          walletHex
            ? fetch(`/api/users/profile?wallet=${encodeURIComponent(walletHex)}`, { cache: "no-store", headers: { "x-theme-caller": "PortalPage:merchant:profile" } })
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
            : Promise.resolve(null)
        ]);

        const j: SiteConfigResponse = siteRes || {};
        const shopTheme = shopConfig?.config?.theme;
        const shopName = shopConfig?.config?.name;
        const pfpUrl = profileRes?.profile?.pfpUrl;

        // Merge shop theme if present - SHOP takes priority for branding colors/logos
        // Merge shop theme if present - SHOP takes priority for branding colors/logos
        // USER REQUEST: Site config is deprecated, strictly use Shop Config + Profile
        if (shopTheme) {
          if (!j.config) j.config = {};

          // Start with a clean slate or safe defaults, IGNORING siteRes theme
          // This ensures no "PortalPay" defaults bleed through from the deprecated site config
          const cleanTheme = {
            primaryColor: "#10b981",
            secondaryColor: "#2dd4bf",
            brandLogoUrl: "", // Start empty to force PFP fallback
            symbolLogoUrl: "",
            brandFaviconUrl: "/favicon-32x32.png",
            brandName: "BasaltSurge",
            fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            receiptBackgroundUrl: "/watermark.png",
            brandLogoShape: "round",
            textColor: "#ffffff",
            headerTextColor: "#ffffff",
            bodyTextColor: "#e5e7eb",
            ...shopTheme // Spread shop theme over defaults
          };

          const t = cleanTheme as any;

          // Re-apply specific smart fallback logic on this clean object
          let effectiveLogo = shopTheme.brandLogoUrl;

          // Smart Logo Resolution:
          // If the shop logo is missing OR matches a platform default/placeholder,
          // and we have a valid PFP, use the PFP instead.
          // Note: Since we ignored siteRes, 'effectiveLogo' is solely from Shop Config now.
          const isGenericLogo = !effectiveLogo || effectiveLogo.includes("ppsymbol") || effectiveLogo.includes("BasaltSurge") || effectiveLogo.includes("placeholder");

          if (isClientSide) {
            console.log("[PortalTheme] Smart Logo Debug (Shop Config Only):", {
              shopName,
              originalLogo: shopTheme.brandLogoUrl,
              effectiveLogo,
              isGenericLogo,
              pfpUrl,
              willSwap: isGenericLogo && !!pfpUrl
            });
          }

          if (isGenericLogo && pfpUrl) {
            effectiveLogo = pfpUrl;
            console.log("[PortalTheme] Swapped generic/missing shop logo for PFP:", pfpUrl);
          }

          if (effectiveLogo) {
            t.brandLogoUrl = effectiveLogo;

            // Force overwrite symbol if it's currently a generic platform symbol or missing
            const currentSymbol = String(t.symbolLogoUrl || "");
            const isGenericSymbol = !currentSymbol || currentSymbol.includes("ppsymbol") || currentSymbol.includes("BasaltSurge");

            if (isGenericSymbol) {
              t.symbolLogoUrl = effectiveLogo;
            }
          }

          if (shopName) {
            t.brandName = shopName;
          }

          // Replace the config theme entirely
          j.config.theme = t;
        }



        try { cfgCacheRef.current.set(normKey, j); } catch { }
        return j;
      })()
        .finally(() => {
          try { inflightCfgRef.current.delete(normKey); } catch { }
        });
      inflightCfgRef.current.set(normKey, p);
      return await p;
    } catch {
      return {} as any;
    }
  };

  // Detect client-side rendering to avoid hydration mismatches
  useEffect(() => {
    setIsClientSide(true);
  }, []);

  // Fetch partner brand colors, logos, and name for partner containers
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ci = await fetch("/api/site/container", { cache: "no-store" }).then(r => r.json()).catch(() => ({} as any));
        const bk = String(ci?.brandKey || "").trim();
        const ct = String(ci?.containerType || "").toLowerCase();
        const isPartner = ct === "partner";

        if (bk && isPartner) {
          const pj = await fetch(`/api/platform/brands/${encodeURIComponent(bk)}/config`, { cache: "no-store" }).then(r => r.json()).catch(() => ({} as any));
          const bc = (pj?.brand?.colors || {}) as any;
          const logos = (pj?.brand?.logos || {}) as any;
          const rawBrandName = String(pj?.brand?.name || "").trim();

          if (!cancelled) {
            const primary = typeof bc.primary === "string" ? bc.primary : undefined;
            const accent = typeof bc.accent === "string" ? bc.accent : undefined;

            // Extract logos from brand config
            const logoApp = typeof logos.app === "string" ? logos.app : "";
            const logoSymbol = typeof logos.symbol === "string" ? logos.symbol : "";
            const logoFavicon = typeof logos.favicon === "string" ? logos.favicon : "";

            // Auto-titleize brandKey if brand name is missing or generic
            const titleizedKey = bk ? bk.charAt(0).toUpperCase() + bk.slice(1) : "";
            const isGenericName = !rawBrandName || /^(ledger\d*|partner\d*|default|portalpay|basaltsurge)$/i.test(rawBrandName);
            const partnerName = isGenericName ? titleizedKey : rawBrandName;

            console.log("[PORTAL] Partner brand fetched:", { bk, primary, accent, partnerName, logoApp, logoSymbol, logoFavicon });
            setPartnerBrandColors({ primary, accent });
            setPartnerLogoApp(logoApp);
            setPartnerLogoSymbol(logoSymbol);
            setPartnerLogoFavicon(logoFavicon);
            setPartnerBrandName(partnerName);

            // If no merchant theme is expected, apply partner colors and brand name
            if (!hasMerchantForTheme && !forcePortalTheme) {
              // Update theme state with partner brand name and logos
              setTheme((prev) => ({
                ...prev,
                brandName: partnerName || prev.brandName,
                brandLogoUrl: logoApp || prev.brandLogoUrl,
                symbolLogoUrl: logoSymbol || prev.symbolLogoUrl,
                brandFaviconUrl: logoFavicon || prev.brandFaviconUrl,
              }));

              // Apply partner colors to CSS variables
              if (primary) {
                try {
                  const root = document.documentElement;
                  root.style.setProperty("--pp-primary", primary);
                  if (accent) root.style.setProperty("--pp-secondary", accent);
                  root.style.setProperty("--primary", primary);
                  console.log("[PORTAL] Applied partner brand colors to CSS variables");
                } catch { }
              }
            }
          }
        }
      } catch (e) {
        console.error("[PORTAL] Error fetching partner brand:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [hasMerchantForTheme, forcePortalTheme]);

  // Signal to ThemeReadyGate whether a merchant theme is expected/available for this portal view
  useEffect(() => {
    try {
      const rootEl = document.documentElement;
      if (hasMerchantForTheme && !forcePortalTheme) {
        rootEl.setAttribute("data-pp-theme-merchant-expected", "1");
        if (walletThemeLoaded) {
          rootEl.setAttribute("data-pp-theme-merchant-available", "1");
        }
      } else {
        rootEl.setAttribute("data-pp-theme-merchant-expected", "0");
        rootEl.setAttribute("data-pp-theme-merchant-available", "0");
      }
    } catch { }
  }, [hasMerchantForTheme, walletThemeLoaded, forcePortalTheme]);

  // If no merchant is present for theme, consider global config sufficient for loader dismissal
  useEffect(() => {
    if (!hasMerchantForTheme || forcePortalTheme) setConfigReady(true);
  }, [hasMerchantForTheme, forcePortalTheme]);

  // Ensure theme loader clears when config is ready (global or merchant-specific)
  useEffect(() => {
    try {
      if (configReady) {
        const rootEl = document.documentElement;
        rootEl.setAttribute("data-pp-theme-ready", "1");
        window.dispatchEvent(new CustomEvent("pp:theme:ready", { detail: { source: "portal", reason: "config_ready" } }));
      }
    } catch { }
  }, [configReady]);

  // Grace window: wait briefly for merchant theme before allowing fallback to global
  useEffect(() => {
    let t: number | undefined;
    if (hasMerchantForTheme) {
      setMerchantGraceWindowElapsed(false);
      t = window.setTimeout(() => setMerchantGraceWindowElapsed(true), 1500);
    } else {
      setMerchantGraceWindowElapsed(true);
    }
    return () => {
      if (t) window.clearTimeout(t);
    };
  }, [hasMerchantForTheme]);

  // Wallet-scoped theme fetch: apply recipient-specific branding when portal opens
  // Using useLayoutEffect to apply theme synchronously before browser paint
  React.useLayoutEffect(() => {
    const currentMerchantKey = String(merchantWallet || "").toLowerCase();

    // Check if we are upgrading from a default/generic theme to a partner theme
    const isDefaultTheme = theme.brandName === "BasaltSurge" || theme.brandName === "PortalPay";
    // Check if we have partner data available to upgrade to
    const canUpgradeToPartner = isDefaultTheme && (!!partnerBrandColors?.primary || !!partnerBrandName);

    const alreadyLoaded = loadedMerchantWalletRef.current === currentMerchantKey && walletThemeLoaded;

    console.log('[PORTAL THEME DEBUG] useLayoutEffect triggered', {
      currentMerchantKey,
      alreadyLoaded,
      canUpgradeToPartner,
      hasMerchantForTheme,
      walletThemeLoaded,
      forcePortalTheme,
      hasColorOverride,
      receiptId
    });

    // If we already loaded this merchant's theme in this instance, just re-apply CSS vars and skip refetch
    // UNLESS we are upgrading to a partner theme from a default state
    if (alreadyLoaded && hasMerchantForTheme && !canUpgradeToPartner) {
      console.log('[PORTAL THEME DEBUG] Re-applying cached theme from memory');
      try {
        const root = document.documentElement;
        const setVar = (n: string, v?: string) => {
          if (typeof v === "string" && v.length > 0) root.style.setProperty(n, v);
          else root.style.removeProperty(n);
        };
        setVar("--pp-primary", theme.primaryColor);
        setVar("--pp-secondary", theme.secondaryColor);
        setVar("--pp-text", forceEmbedTextColor || mobileTextColor || (theme.headerTextColor || (theme as any).textColor));
        setVar("--pp-text-header", forceEmbedTextColor || mobileTextColor || (theme.headerTextColor || (theme as any).textColor));
        setVar("--pp-text-body", forceEmbedTextColor || mobileTextColor || theme.bodyTextColor);
        setVar("--primary", theme.primaryColor);
        setVar("--pp-font", theme.fontFamily);
      } catch { }
      return;
    }

    // Check sessionStorage for cached theme before resetting to defaults
    let cachedTheme: SiteTheme | null = null;
    try {
      if (hasMerchantForTheme && currentMerchantKey) {
        const cached = sessionStorage.getItem(`pp:theme:${currentMerchantKey}`);
        if (cached) {
          cachedTheme = JSON.parse(cached);
          try {
            if (cachedTheme && typeof cachedTheme === "object") {
              // Replace legacy cblogod with correct platform symbol
              if ((cachedTheme as any).symbolLogoUrl === "/cblogod.png") (cachedTheme as any).symbolLogoUrl = getDefaultBrandSymbol(cachedTheme.brandKey);
              if ((cachedTheme as any).brandLogoUrl === "/cblogod.png") (cachedTheme as any).brandLogoUrl = getDefaultBrandSymbol(cachedTheme.brandKey);
              const bg = String((cachedTheme as any).receiptBackgroundUrl || "");
              if (/manifest\.webmanifest$/i.test(bg)) (cachedTheme as any).receiptBackgroundUrl = "/watermark.png";
              if ((cachedTheme as any).primaryColor === "#10b981" || (cachedTheme as any).primaryColor === "#14b8a6") (cachedTheme as any).primaryColor = "#1f2937";
              if ((cachedTheme as any).secondaryColor === "#2dd4bf" || (cachedTheme as any).secondaryColor === "#22d3ee") (cachedTheme as any).secondaryColor = "#F54029";
            }
          } catch { }
          console.log('[PORTAL THEME DEBUG] Found cached theme in sessionStorage', cachedTheme);
        } else {
          console.log('[PORTAL THEME DEBUG] No cached theme found in sessionStorage');
        }
      }
    } catch (e) {
      console.error('[PORTAL THEME DEBUG] Error reading sessionStorage', e);
    }

    // If we have a cached theme, apply it immediately and mark as loaded
    // BUT IGNORE CACHE if we are upgrading to partner branding and the cache is generic
    const isCachedGeneric = cachedTheme && (cachedTheme.brandName === "BasaltSurge" || cachedTheme.brandName === "PortalPay");
    const ignoreCache = isCachedGeneric && canUpgradeToPartner;

    if (cachedTheme && hasMerchantForTheme && !ignoreCache) {
      console.log('[PORTAL THEME DEBUG] Applying cached theme immediately');
      setTheme(cachedTheme);
      try {
        const root = document.documentElement;
        root.style.setProperty("--pp-primary", cachedTheme.primaryColor);
        root.style.setProperty("--pp-secondary", cachedTheme.secondaryColor);
        root.style.setProperty("--pp-text", mobileTextColor || (cachedTheme.headerTextColor || cachedTheme.textColor || "#ffffff"));
        root.style.setProperty("--pp-text-header", mobileTextColor || (cachedTheme.headerTextColor || cachedTheme.textColor || "#ffffff"));
        root.style.setProperty("--pp-text-body", mobileTextColor || (cachedTheme.bodyTextColor || "#e5e7eb"));
        root.style.setProperty("--primary", cachedTheme.primaryColor);
        if (cachedTheme.fontFamily) {
          root.style.setProperty("--pp-font", cachedTheme.fontFamily);
        }
      } catch { }
      setWalletThemeLoaded(true);
      setMerchantAvail(true);
      setConfigReady(true);
      loadedMerchantWalletRef.current = currentMerchantKey;

      try {
        const rootEl = document.documentElement;
        rootEl.setAttribute("data-pp-theme-merchant-available", "1");
        rootEl.setAttribute("data-pp-theme-stage", "merchant");
        rootEl.setAttribute("data-pp-theme-ready", "1");
        window.dispatchEvent(new CustomEvent("pp:theme:merchant_ready", { detail: cachedTheme }));
        window.dispatchEvent(new CustomEvent("pp:theme:ready", { detail: cachedTheme }));
      } catch { }
      return;
    }

    // Reset theme and flags when merchant changes and no cache available
    // Only perform this reset if a merchant theme is expected and not already loaded,
    // otherwise keep the currently applied theme to avoid snapping back to defaults.
    if (hasMerchantForTheme && !walletThemeLoaded) {
      setTheme({
        primaryColor: partnerBrandColors?.primary || "#10b981",
        secondaryColor: partnerBrandColors?.accent || "#2dd4bf",
        brandLogoUrl: partnerLogoApp || getDefaultBrandSymbol(),
        brandFaviconUrl: partnerLogoFavicon || "/favicon-32x32.png",
        brandName: partnerBrandName || "BasaltSurge",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        receiptBackgroundUrl: "/watermark.png",
        brandLogoShape: "round",
        textColor: "#ffffff",
        headerTextColor: "#ffffff",
        bodyTextColor: "#e5e7eb",
      });
      setWalletThemeLoaded(false);
      setConfigReady(false);
      loadedMerchantWalletRef.current = "";
    }

    // If the shop passed explicit COLOR overrides, apply them immediately and skip fetching merchant theme.
    // Brand/logo/font overrides alone should NOT force default colors.
    if (hasColorOverride) {
      console.log('[PORTAL THEME DEBUG] Applying color overrides from URL params', {
        tPrimary,
        tSecondary,
        tText,
        tFont
      });
      try {
        const root = document.documentElement;
        if (tPrimary) {
          root.style.setProperty("--pp-primary", tPrimary);
          // If no explicit secondary provided, mirror primary for accents
          if (!tSecondary) root.style.setProperty("--pp-secondary", tPrimary);
          root.style.setProperty("--primary", tPrimary);
        }
        if (tSecondary) {
          root.style.setProperty("--pp-secondary", tSecondary);
        }
        {
          const effectiveText = forceEmbedTextColor || mobileTextColor || tText;
          if (effectiveText) {
            root.style.setProperty("--pp-text", effectiveText);
            root.style.setProperty("--pp-text-header", effectiveText);
            root.style.setProperty("--pp-text-body", effectiveText);
          }
        }
        if (tFont) {
          root.style.setProperty("--pp-font", tFont);
        }
      } catch { }

      setTheme((prev) => ({
        primaryColor: tPrimary || prev.primaryColor,
        secondaryColor: (tSecondary || (!tSecondary && tPrimary) ? (tSecondary || tPrimary) : prev.secondaryColor),
        brandLogoUrl: tLogo || prev.brandLogoUrl,
        brandFaviconUrl: prev.brandFaviconUrl,
        brandName: tBrand || prev.brandName,
        fontFamily: tFont || prev.fontFamily,
        receiptBackgroundUrl: prev.receiptBackgroundUrl,
        brandLogoShape: prev.brandLogoShape,
        textColor: tText || prev.textColor,
        headerTextColor: tText || prev.headerTextColor,
        bodyTextColor: tText || prev.bodyTextColor,
      }));

      setWalletThemeLoaded(true);
      setMerchantAvail(true);
      setConfigReady(true);

      try {
        const rootEl = document.documentElement;
        rootEl.setAttribute("data-pp-theme-merchant-available", "1");
        rootEl.setAttribute("data-pp-theme-stage", "merchant");
        rootEl.setAttribute("data-pp-theme-ready", "1");
        window.dispatchEvent(new CustomEvent("pp:theme:merchant_ready", { detail: { primary: tPrimary, secondary: tSecondary, text: tText, font: tFont, brand: tBrand, logo: tLogo } }));
        window.dispatchEvent(new CustomEvent("pp:theme:ready", { detail: { source: "portal", reason: "override_params" } }));
      } catch { }

      return;
    }

    // If only brand/logo/font overrides are present, merge them into theme but still allow merchant fetch to provide colors.
    if (tBrand || tLogo || tFont) {
      setTheme((prev) => ({
        ...prev,
        brandLogoUrl: tLogo || prev.brandLogoUrl,
        brandName: tBrand || prev.brandName,
        fontFamily: tFont || prev.fontFamily,
      }));
      try {
        if (tFont) document.documentElement.style.setProperty("--pp-font", tFont);
      } catch { }
    }

    if (!hasMerchantForTheme || forcePortalTheme) {
      console.log('[PORTAL THEME DEBUG] No merchant theme needed or forcing portal theme', {
        hasMerchantForTheme,
        forcePortalTheme
      });
      setConfigReady(true);
      return;
    }

    console.log('[PORTAL THEME DEBUG] Fetching merchant theme from API', {
      merchantWallet: effectiveMerchantWallet,
      recipient
    });

    // Clear existing CSS variables immediately to prevent flash
    try {
      const root = document.documentElement;
      root.style.removeProperty("--pp-primary");
      root.style.removeProperty("--pp-secondary");
      root.style.removeProperty("--pp-text");
      root.style.removeProperty("--pp-text-header");
      root.style.removeProperty("--pp-text-body");
      root.style.removeProperty("--primary");
      root.style.removeProperty("--pp-font");
    } catch { }

    let cancelled = false;
    (async () => {
      try {
        // Use effectiveMerchantWallet to support receipt-derived merchant identity
        const j: SiteConfigResponse = await getSiteConfigOnce(currentMerchantKey, String(effectiveMerchantWallet || recipient));
        const t = j?.config?.theme;
        console.log('[PORTAL THEME DEBUG] API response received', { hasTheme: !!t, theme: t });
        if (!cancelled && t) {
          // Build complete theme object with Partner Fallbacks
          const merchantTheme = {
            primaryColor: (typeof t.primaryColor === "string" ? t.primaryColor : undefined) || partnerBrandColors?.primary || "#10b981",
            secondaryColor: (typeof t.secondaryColor === "string" ? t.secondaryColor : undefined) || partnerBrandColors?.accent || "#2dd4bf",
            brandLogoUrl: (typeof t.brandLogoUrl === "string" ? t.brandLogoUrl : undefined) || partnerLogoApp || getDefaultBrandSymbol(t.brandKey),
            brandFaviconUrl: (typeof t.brandFaviconUrl === "string" ? t.brandFaviconUrl : undefined) || partnerLogoFavicon || "/favicon-32x32.png",
            symbolLogoUrl: (typeof (t as any)?.logos?.symbol === "string" ? (t as any).logos.symbol : undefined) || partnerLogoSymbol,
            brandName: (typeof t.brandName === "string" ? t.brandName : undefined) || partnerBrandName || "BasaltSurge",
            fontFamily: typeof t.fontFamily === "string" ? t.fontFamily : "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            receiptBackgroundUrl: typeof t.receiptBackgroundUrl === "string" ? t.receiptBackgroundUrl : "/watermark.png",
            brandLogoShape: t.brandLogoShape === "round" ? "round" : "square" as "round" | "square",
            textColor: typeof (t as any)?.textColor === "string" ? (t as any).textColor : "#ffffff",
            headerTextColor: typeof (t as any)?.headerTextColor === "string" ? (t as any).headerTextColor : (typeof (t as any)?.textColor === "string" ? (t as any).textColor : "#ffffff"),
            bodyTextColor: typeof (t as any)?.bodyTextColor === "string" ? (t as any).bodyTextColor : "#e5e7eb",
          };

          // Apply CSS variables immediately before setting state
          try {
            const root = document.documentElement;
            root.style.setProperty("--pp-primary", merchantTheme.primaryColor);
            root.style.setProperty("--pp-secondary", merchantTheme.secondaryColor);
            root.style.setProperty("--pp-text", forceEmbedTextColor || mobileTextColor || merchantTheme.headerTextColor);
            root.style.setProperty("--pp-text-header", forceEmbedTextColor || mobileTextColor || merchantTheme.headerTextColor);
            root.style.setProperty("--pp-text-body", forceEmbedTextColor || mobileTextColor || merchantTheme.bodyTextColor);
            root.style.setProperty("--primary", merchantTheme.primaryColor);
            if (merchantTheme.fontFamily) {
              root.style.setProperty("--pp-font", merchantTheme.fontFamily);
            }
          } catch { }

          // Set theme state (preserve explicit brand overrides from URL if present)
          const mergedTheme = {
            ...merchantTheme,
            brandLogoUrl: tLogo || merchantTheme.brandLogoUrl,
            brandName: tBrand || merchantTheme.brandName,
            fontFamily: tFont || merchantTheme.fontFamily,
          };
          setTheme(mergedTheme);
          try {
            (() => {
              try {
                const s = { ...mergedTheme } as any;
                if (s.symbolLogoUrl === "/cblogod.png") s.symbolLogoUrl = getDefaultBrandSymbol(s.brandKey);
                if (s.brandLogoUrl === "/cblogod.png") s.brandLogoUrl = getDefaultBrandSymbol(s.brandKey);
                if (typeof s.receiptBackgroundUrl === "string" && /manifest\.webmanifest$/i.test(s.receiptBackgroundUrl)) s.receiptBackgroundUrl = "/watermark.png";
                if (s.primaryColor === "#10b981" || s.primaryColor === "#14b8a6") s.primaryColor = "#1f2937";
                if (s.secondaryColor === "#2dd4bf" || s.secondaryColor === "#22d3ee") s.secondaryColor = "#F54029";
                sessionStorage.setItem(`pp:theme:${currentMerchantKey}`, JSON.stringify(s));
              } catch { }
            })();
            console.log('[PORTAL THEME DEBUG] Cached theme to sessionStorage');
          } catch (e) {
            console.error('[PORTAL THEME DEBUG] Failed to cache theme', e);
          }
          setWalletThemeLoaded(true);
          setMerchantAvail(true);
          setConfigReady(true);
          loadedMerchantWalletRef.current = currentMerchantKey;

          console.log('[PORTAL THEME DEBUG] Theme successfully applied and ready', {
            currentMerchantKey,
            merchantTheme
          });

          try {
            const rootEl = document.documentElement;
            rootEl.setAttribute("data-pp-theme-merchant-available", "1");
            rootEl.setAttribute("data-pp-theme-stage", "merchant");
            rootEl.setAttribute("data-pp-theme-ready", "1");
            window.dispatchEvent(new CustomEvent("pp:theme:merchant_ready", { detail: merchantTheme }));
            window.dispatchEvent(new CustomEvent("pp:theme:ready", { detail: merchantTheme }));
          } catch { }
        } else if (!cancelled) {
          console.log('[PORTAL THEME DEBUG] No theme returned from API, applying fallbacks');
          // Fallback to Partner or Default if API returns nothing
          const fallbackTheme = {
            primaryColor: partnerBrandColors?.primary || "#10b981",
            secondaryColor: partnerBrandColors?.accent || "#2dd4bf",
            brandLogoUrl: partnerLogoApp || getDefaultBrandSymbol(),
            brandFaviconUrl: partnerLogoFavicon || "/favicon-32x32.png",
            brandName: partnerBrandName || "BasaltSurge",
            fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
            receiptBackgroundUrl: "/watermark.png",
            brandLogoShape: "round",
            textColor: "#ffffff",
            headerTextColor: "#ffffff",
            bodyTextColor: "#e5e7eb",
          } as any;

          setTheme(fallbackTheme);
          setWalletThemeLoaded(true);

          try {
            const rootEl = document.documentElement;
            rootEl.setAttribute("data-pp-theme-merchant-available", "0");
            rootEl.setAttribute("data-pp-theme-ready", "1");
            window.dispatchEvent(new CustomEvent("pp:theme:ready", { detail: { source: "portal", reason: "merchant_unavailable" } }));
            setMerchantAvail(false);
            setConfigReady(true);
          } catch { }
        }
      } catch (e) {
        console.error('[PORTAL THEME DEBUG] Error fetching theme', e);
        if (!cancelled) {
          try {
            const rootEl = document.documentElement;
            rootEl.setAttribute("data-pp-theme-merchant-available", "0");
            rootEl.setAttribute("data-pp-theme-ready", "1");
            window.dispatchEvent(new CustomEvent("pp:theme:ready", { detail: { source: "portal", reason: "error" } }));
            setMerchantAvail(false);
            setConfigReady(true);
          } catch { }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [merchantWallet, receiptId, hasMerchantForTheme, forcePortalTheme, effectiveMerchantWallet, partnerBrandColors, partnerBrandName, partnerLogoApp, partnerLogoSymbol, partnerLogoFavicon]);

  // Background style only (no CSS vars inline to avoid hydration mismatch)
  const backgroundStyle = useMemo(() => {
    // Disable container background image for embedded views and two-column layout
    // to avoid visual duplication with the decorative left-half gradient layer.
    if (isEmbedded || isTwoColumnLayout) return {};
    const url = (theme.receiptBackgroundUrl || "").trim();
    // Avoid manifest.webmanifest 500 noise by skipping it as a background image
    if (!url || /manifest\.webmanifest$/i.test(url)) {
      return {};
    }
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    } as React.CSSProperties;
  }, [theme.receiptBackgroundUrl, isEmbedded, isTwoColumnLayout]);

  // CSS vars are applied ONLY in useLayoutEffect above (single source of truth)
  // This useEffect is disabled to prevent re-application when theme state changes

  // Compute navbar mode (Symbol+Text vs Full Width) with partner fallback
  const isPartnerContainer =
    typeof document !== "undefined" &&
    ((document.documentElement.getAttribute("data-pp-container-type") || "").toLowerCase() === "partner");
  const navbarMode: "symbol" | "logo" = (() => {
    const m = (theme as any)?.navbarMode || ((theme as any)?.logos?.navbarMode);
    if (m === "logo" || m === "symbol") return m;
    return isPartnerContainer ? "logo" : "symbol";
  })();

  // Degrade to symbol+text if full-width logo looks like a generic/platform asset
  const fullLogoCandidate = (() => {
    const app = String((theme.brandLogoUrl || "")).trim();
    const sym = String((theme.symbolLogoUrl || "")).trim();
    const fav = String((theme.brandFaviconUrl || "")).trim();
    return app || sym || fav || "";
  })();
  const fileName = (fullLogoCandidate.split("/").pop() || "").toLowerCase();
  const genericRe = /^(basaltsurge.*\.png|portalpay(\d*)\.png|ppsymbol(\.png)?|favicon\-[0-9]+x[0-9]+\.png|next\.svg)$/i;
  const hasPartnerPath = fullLogoCandidate.includes("/brands/");
  const canUseFullLogo = !!fullLogoCandidate && (hasPartnerPath || !genericRe.test(fileName));
  const effectiveNavbarMode: "symbol" | "logo" = (navbarMode === "logo" && canUseFullLogo) ? "logo" : "symbol";

  // Fee from admin config
  const [processingFeePct, setProcessingFeePct] = useState<number>(0);
  // Base platform fee (platformFeeBps + partnerFeeBps) - loaded from site config for partner containers
  const [basePlatformFeePct, setBasePlatformFeePct] = useState<number>(0.5);

  // Dynamic receipt
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  useEffect(() => {
    if (!receiptId) return;
    let cancelled = false;
    setLoadingReceipt(true);
    try {
      const url = buildReceiptEndpoint(receiptId, recipient);
      const init = { cache: "no-store", ...buildReceiptFetchInit(recipient) } as RequestInit;
      fetch(url, init)
        .then((r) => r.json())
        .then((j) => {
          if (cancelled) return;
          const rec: Receipt | undefined = j?.receipt;
          if (rec && typeof rec.totalUsd === "number") {
            setReceipt(rec);
            try {
              const rw = String((rec as any)?.recipientWallet || "").toLowerCase();
              if (/^0x[a-f0-9]{40}$/i.test(rw)) setResolvedRecipient(rw as `0x${string}`);
            } catch { }
          } else {
            setReceipt(null);
          }
        })
        .catch(() => {
          if (!cancelled) setReceipt(null);
        })
        .finally(() => {
          if (!cancelled) setLoadingReceipt(false);
        });
    } catch {
      if (!cancelled) setLoadingReceipt(false);
    }
    return () => {
      cancelled = true;
    };
  }, [receiptId, recipient]);

  const items: ReceiptLineItem[] = Array.isArray(receipt?.lineItems) ? receipt!.lineItems : [];
  const itemsSubtotalUsd = useMemo(() => {
    try {
      const base = items
        .filter((it) => !/processing fee/i.test(it.label || ""))
        .filter((it) => !/portal fee/i.test(it.label || ""))
        .filter((it) => !/tax/i.test(it.label || ""))
        .filter((it) => !/gratuity/i.test(it.label || ""))
        .filter((it) => !/tip/i.test(it.label || ""))
        .reduce((s, it) => s + Number(it.priceUsd || 0), 0);
      const subtotal = +base.toFixed(2);
      if (subtotal > 0) return subtotal;
      // Fallback only if no subtotal found (unlikely)
      let fallback = Number(receipt?.totalUsd || 0);
      if (receipt?.tipAmount) fallback -= receipt.tipAmount;
      return fallback > 0 ? +fallback.toFixed(2) : 0;
    } catch {
      return 0;
    }
  }, [items, receipt?.totalUsd, receipt?.tipAmount]);

  const taxUsd = useMemo(() => {
    try {
      const tax = items.find((it) => /tax/i.test(it.label || ""));
      return tax ? +Number(tax.priceUsd || 0).toFixed(2) : 0;
    } catch {
      return 0;
    }
  }, [items]);

  const [tipChoice, setTipChoice] = useState<"0" | "10" | "15" | "20" | "custom">("0");
  const [tipCustomPct, setTipCustomPct] = useState<number>(0);
  const [updatingTip, setUpdatingTip] = useState(false);

  const tipUsd = Number(receipt?.tipAmount || 0);

  const handleTipUpdate = async (val: string | number) => {
    if (!receiptId || updatingTip) return;

    // Calculate intended amount from percentage
    let amount = 0;
    const pct = Number(val);
    if (!isNaN(pct) && pct > 0) {
      amount = Number(((pct / 100) * itemsSubtotalUsd).toFixed(2));
    }

    setUpdatingTip(true);
    try {
      const res = await fetch(`/api/receipts/${receiptId}/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipAmount: amount })
      });
      if (res.ok) {
        const j = await res.json();
        if (j.receipt) {
          setReceipt(j.receipt);
        }
      }
    } finally {
      setUpdatingTip(false);
    }
  };

  const baseWithoutFeeNoTipUsd = useMemo(
    () => +(itemsSubtotalUsd + taxUsd).toFixed(2),
    [itemsSubtotalUsd, taxUsd]
  );

  const processingFeeUsd = useMemo(() => {
    const feeItem = items.find(it => /processing fee/i.test(it.label || "") || /portal fee/i.test(it.label || ""));
    if (feeItem) return Number(feeItem.priceUsd || 0);

    if (receipt?.totalUsd) {
      // Fee is the remainder
      return Math.max(0, +(receipt.totalUsd - itemsSubtotalUsd - taxUsd - tipUsd).toFixed(2));
    }
    return 0;
  }, [items, receipt?.totalUsd, itemsSubtotalUsd, taxUsd, tipUsd]);

  // We rely on the server's totalUsd which includes everything.
  const totalUsd = Number(receipt?.totalUsd || 0);

  // Compute receipt readiness (loaded and has a positive total)
  useEffect(() => {
    const ok = !loadingReceipt && !!receipt && totalUsd > 0;
    setReceiptReady(ok);
  }, [loadingReceipt, receipt, totalUsd]);

  /**
   * Unblock the portal overlay deterministically:
   * - As soon as the theme/config is ready, mark portal-ready so ThemeReadyGate clears.
   * - Additionally, if config never flags ready due to network delay, clear overlay after a short fallback timeout.
   */
  useEffect(() => {
    if (portalReadySent) return;
    let timeoutId: number | undefined;
    if (configReady) {
      try {
        const root = document.documentElement;
        root.setAttribute("data-pp-portal-ready", "1");
        window.dispatchEvent(new CustomEvent("pp:portal:ready"));
      } catch { }
      setPortalReadySent(true);
    } else {
      timeoutId = window.setTimeout(() => {
        try {
          const root = document.documentElement;
          root.setAttribute("data-pp-portal-ready", "1");
          window.dispatchEvent(new CustomEvent("pp:portal:ready"));
        } catch { }
        setPortalReadySent(true);
      }, 8000);
    }
    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [portalReadySent, configReady]);

  // Post preferred height for host to size iframe nicely ("smidge taller" auto-adjust) with clamp and change detection
  useEffect(() => {
    if (!isIframe) return;
    const sendPreferredHeight = () => {
      try {
        const el = contentRef.current || containerRef.current;
        let h = el ? el.scrollHeight : document.documentElement.scrollHeight;
        const minH = isTwoColumnLayout ? (isEmbedded ? 580 : 720) : (isEmbedded ? 920 : 560);
        h = Math.max(minH, h);
        const last = lastPreferredHeightRef.current || 0;
        if (Math.abs(h - last) > 8) {
          lastPreferredHeightRef.current = h;
          // New event name (primary)
          window.parent.postMessage({ type: "gateway-preferred-height", height: h, correlationId, receiptId }, targetOrigin);
          // DEPRECATED: Remove after 2026-04-30 - kept for backwards compatibility
          window.parent.postMessage({ type: "portalpay-preferred-height", height: h, correlationId, receiptId }, targetOrigin);
        }
      } catch { }
    };
    sendPreferredHeight();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(sendPreferredHeight);
      if (contentRef.current) ro.observe(contentRef.current);
      else if (containerRef.current) ro.observe(containerRef.current);
    } catch { }
    return () => {
      try {
        if (ro) ro.disconnect();
      } catch { }
    };
  }, [isIframe, isTwoColumnLayout, receiptReady, configReady, totalUsd, correlationId, receiptId, targetOrigin]);

  // Currency and rates
  const [rates, setRates] = useState<EthRates>({});
  const [usdRates, setUsdRates] = useState<Record<string, number>>({});
  const [currency, setCurrency] = useState("USD");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement | null>(null);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<Date | null>(null);
  const availableFiatCurrencies = useMemo(() => {
    const keys = new Set(Object.keys(rates || {}).map((k) => k.toUpperCase()));
    return SUPPORTED_CURRENCIES.filter((c) => c.code === "USD" || keys.has(c.code));
  }, [rates]);

  useEffect(() => {
    fetchEthRates()
      .then((r) => {
        setRates(r);
        setRatesUpdatedAt(new Date());
      })
      .catch(() => setRates({}));
  }, []);

  useEffect(() => {
    fetchUsdRates()
      .then((r) => setUsdRates(r))
      .catch(() => setUsdRates({}));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchEthRates();
        if (!cancelled) {
          setRates(r);
          setRatesUpdatedAt(new Date());
        }
      } catch { }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchUsdRates();
        if (!cancelled) {
          setUsdRates(r);
        }
      } catch { }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency]);

  useEffect(() => {
    const id = window.setInterval(() => {
      fetchEthRates()
        .then((r) => {
          setRates(r);
          setRatesUpdatedAt(new Date());
        })
        .catch(() => { });
    }, 60000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id2 = window.setInterval(() => {
      fetchUsdRates()
        .then((r) => setUsdRates(r))
        .catch(() => { });
    }, 60000);
    return () => {
      window.clearInterval(id2);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!currencyRef.current) return;
      if (!currencyRef.current.contains(e.target as Node)) setCurrencyOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const [token, setToken] = useState<"ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP" | "SOL">(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = (p.get("token") || "").trim();
      const valid = ["ETH", "USDC", "USDT", "cbBTC", "cbXRP", "SOL"];
      const match = valid.find(v => v.toLowerCase() === t.toLowerCase());
      if (match) return match as any;
    }
    return "ETH";
  });
  const [availableTokens, setAvailableTokens] = useState<TokenDef[]>(() => getBuildTimeTokens());

  // Consolidated site-config fetch (single call) to set fee, default token, and seller/split address
  useEffect(() => {
    if (!merchantWallet) return; // avoid unscoped fetch on portal; wait for merchant wallet
    let cancelled = false;
    getSiteConfigOnce(String(merchantWallet).toLowerCase(), String(merchantWallet))
      .then((j: SiteConfigResponse) => {
        if (cancelled) return;
        const cfg = j?.config || {};

        // Merge runtime tokens if present (preserves ETH, adds/updates others)
        if (cfg?.tokens && Array.isArray(cfg.tokens) && cfg.tokens.length > 0) {
          const runtimeTokens = cfg.tokens as TokenDef[];
          // Start with build-time tokens (which have env vars)
          const validBuildTokens = getBuildTimeTokens();
          // Merge runtime tokens ON TOP of build tokens (updating addresses if needed), 
          // BUT ensure we don't lose env-defined tokens just because server config excludes them.

          const merged = [...validBuildTokens];
          for (const rt of runtimeTokens) {
            const idx = merged.findIndex(m => m.symbol === rt.symbol);
            if (idx >= 0) {
              merged[idx] = rt; // Update existing
            } else {
              merged.push(rt); // Add new
            }
          }
          if (!cancelled) setAvailableTokens(merged);
        }

        // processingFeePct
        if (typeof cfg.processingFeePct === "number") {
          setProcessingFeePct(cfg.processingFeePct);
        }

        // basePlatformFeePct (platform + partner fees for partner containers)
        if (typeof (cfg as any).basePlatformFeePct === "number") {
          setBasePlatformFeePct((cfg as any).basePlatformFeePct);
        }

        // defaultPaymentToken or Dynamic Reserve Strategy
        const t = (cfg as any)?.defaultPaymentToken as any;

        // Check for reserve ratios for dynamic selection
        const ratios = (cfg as any)?.reserveRatios as Record<string, number> | undefined;
        let selected = "ETH";

        // Dynamic Strategy (Respect accumulationMode):
        const accumulationMode = (cfg as any)?.accumulationMode;
        let dynamicToken = null;
        if (accumulationMode !== "fixed") {
          dynamicToken = selectTokenFromRatios(ratios, availableTokens);
        }

        // Actually, availableTokens in this scope is the OLD state. We should use runtimeTokens if present, else availableTokens state.
        const effectiveTokens = (cfg?.tokens && Array.isArray(cfg.tokens) && cfg.tokens.length > 0)
          ? (cfg.tokens as TokenDef[])
          : availableTokens;

        let urlOverride = null;
        if (searchParams?.get("token")) {
          const tParam = String(searchParams.get("token")).trim();
          // Case-insensitive match against effective tokens
          const avail = effectiveTokens.find((x) => x.symbol.toLowerCase() === tParam.toLowerCase());
          const ok = (tParam.toUpperCase() === "ETH") || (!!avail?.address && isValidHexAddress(String(avail.address)));
          if (ok && avail) urlOverride = avail.symbol;
          else if (ok && tParam.toUpperCase() === "ETH") urlOverride = "ETH";
        }

        if (urlOverride) {
          selected = urlOverride;
        } else if (dynamicToken) {
          selected = dynamicToken;
          console.log("[PORTAL] Dynamic Reserve Strategy selected:", selected);
        } else if (typeof t === "string") {
          const avail = effectiveTokens.find((x) => x.symbol === t);
          const ok = t === "ETH" || (!!avail?.address && isValidHexAddress(String(avail.address)));
          if (ok) selected = t;
        }

        setToken(selected as any);

        // sellerAddress (split routing)
        const splitAddr = (cfg as any)?.splitAddress || (cfg as any)?.split?.address || "";
        if (isValidHexAddress(String(splitAddr || ""))) {
          setSellerAddress(splitAddr as `0x${string}`);
        } else {
          setSellerAddress(merchantWallet as `0x${string}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // fallback to merchant wallet if split lookup fails
          setSellerAddress(merchantWallet as `0x${string}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [merchantWallet, availableTokens]);

  const displayableTokens = useMemo(
    () =>
      availableTokens.filter((t) => t.symbol === "ETH" || (t.address && t.address.length > 0)),
    [availableTokens]
  );
  const availableBridgeTokens = useMemo(
    () =>
      displayableTokens.filter((t) => t.symbol === "USDC" || t.symbol === "USDT"),
    [displayableTokens]
  );

  useEffect(() => {
    const isTokenAvailable = displayableTokens.some((t) => t.symbol === token);
    if (!isTokenAvailable) {
      setToken("ETH");
    }
  }, [displayableTokens, token]);

  const [btcUsd, setBtcUsd] = useState(0);
  const [xrpUsd, setXrpUsd] = useState(0);
  const [tokenIcons, setTokenIcons] = useState<Record<string, string>>({});

  const COINGECKO_ID_OVERRIDES: Record<string, string> = useMemo(
    () => ({
      ETH: "ethereum",
      USDC: "usd-coin",
      USDT: "tether",
      cbBTC: "coinbase-wrapped-btc",
      cbXRP: "coinbase-wrapped-xrp",
      SOL: "solana",
    }),
    []
  );

  const STATIC_TOKEN_ICONS: Record<string, string> = useMemo(
    () => ({
      ETH: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
      USDC: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
      USDT: "https://assets.coingecko.com/coins/images/325/small/Tether-logo.png",
      cbBTC: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
      cbXRP: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
      SOL: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
    }),
    []
  );

  useEffect(() => {
    setTokenIcons(STATIC_TOKEN_ICONS);
  }, [STATIC_TOKEN_ICONS]);

  // Payment Confirmation State & Polling
  const [paymentConfirmed, setPaymentConfirmed] = useState<{ txHash: string; amount: number; token: string } | null>(null);



  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (token === "cbBTC") {
        try {
          const r = await fetchBtcUsd();
          if (!cancelled) setBtcUsd(r);
        } catch { }
      }
      if (token === "cbXRP") {
        try {
          const r = await fetchXrpUsd();
          if (!cancelled) setXrpUsd(r);
        } catch { }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Retroactive Attribution:
  // If we have a receipt ID (receiptId) but no buyer wallet has been recorded yet (or we want to claim it),
  // and the user just connected their wallet, try to claim it.
  const [hasClaimed, setHasClaimed] = useState(false);
  useEffect(() => {
    if (!loggedIn || !account?.address || !receiptId) return;
    if (hasClaimed) return;

    // Only attempt claim if we suspect it's unclaimed or just to be safe.
    // We rely on the API to handle idempotency or updates.
    console.log("[RECEIPT] Attempting to claim receipt:", receiptId, "for", account.address);

    fetch("/api/receipts/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiptId: receiptId,
        wallet: merchantWallet || recipient,
        status: "receipt_claimed",
        buyerWallet: account.address
      })
    })
      .then(() => setHasClaimed(true))
      .catch(e => console.error("[RECEIPT] Claim failed:", e));
  }, [loggedIn, account?.address, receiptId, merchantWallet, recipient, hasClaimed]);

  const tokenDef = useMemo(() => availableTokens.find((t) => t.symbol === token), [availableTokens, token]);

  const chainId = (chain as any)?.id ?? 0;
  const hasClientId = !!(process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "");
  const isBaseChain = chainId === 8453 || chainId === 84532;
  const isFiatEligibleToken = token === "USDC" || token === "USDT";
  const isFiatFlow = isBaseChain && isFiatEligibleToken;
  const widgetCurrency = isBaseChain ? currency : undefined;
  const widgetFiatAmount = useMemo(() => {
    if (!widgetCurrency) return null;
    const usdRounded = totalUsd > 0 ? Number(totalUsd.toFixed(2)) : 0;
    return usdRounded > 0 ? usdRounded.toFixed(2) : "0";
  }, [widgetCurrency, totalUsd]);
  const widgetSupported =
    // Relaxed chain check to allow dev/prod variances (client defaults to Base anyway)
    // (chainId === 8453 || chainId === 84532) &&
    (token === "ETH" || ["cbBTC", "cbXRP", "SOL", "USDC", "USDT"].includes(token));
  // Fallback map for Base addresses to ensure we never fail on known tokens due to API config issues
  const BASE_ADDRS: Record<string, string> = {
    "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "USDT": "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
    "cbBTC": "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // Checksum fixed
    "cbXRP": "0xcb585250f852C6c6bf90434AB21A00f02833a4af",
    "SOL": "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82"
  };

  const tokenAddr = token === "ETH" ? undefined : (() => {
    // If we have a defined address (from config or fallback), ENFORCE checksum validation
    const raw = tokenDef?.address || BASE_ADDRS[token] || undefined;
    if (!raw) return undefined;
    try { return getAddress(raw); } catch { return raw; } // Ensures EIP-55 compliance even if input is lowercase
  })();
  const hasTokenAddr = token === "ETH" || (tokenAddr ? isValidHexAddress(tokenAddr) : false);
  // Feature flag: thirdweb Account Abstraction (AA) can cause runtime errors (e.g., "Cannot read properties of undefined (reading 'aa')")
  // in some environments when sponsorGas/client setup is incomplete or mismatched. Gate AA behind NEXT_PUBLIC_THIRDWEB_AA_ENABLED
  // to make it opt-in. Set NEXT_PUBLIC_THIRDWEB_AA_ENABLED=true to enable AA connectOptions; leave unset/false to disable.
  const aaEnabled = String(process.env.NEXT_PUBLIC_THIRDWEB_AA_ENABLED || "").toLowerCase() === "true";

  const [sellerAddress, setSellerAddress] = useState<`0x${string}` | undefined>(undefined);

  async function postStatus(status: string, extra?: any) {
    try {
      if (!receiptId) return;
      await fetch("/api/receipts/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptId,
          wallet: merchantWallet || recipient,
          status,
          ...(shopSlugParam ? { shopSlug: shopSlugParam } : {}),
          ...extra,
        }),
      });
    } catch { }
  }

  useEffect(() => {
    try {
      if (receiptId) {
        postStatus("link_opened");
      }
    } catch { }
  }, [receiptId]);

  useEffect(() => {
    try {
      if (loggedIn && receiptId) {
        const buyer = (account?.address || "").toLowerCase();
        postStatus("buyer_logged_in", { buyer });
      }
    } catch { }
  }, [loggedIn, receiptId, account?.address]);

  const usdRate = Number(rates["USD"] || 0);
  const ethAmount = useMemo(() => {
    if (!usdRate || usdRate <= 0) return 0;
    return +(totalUsd / usdRate).toFixed(9);
  }, [totalUsd, usdRate]);

  const widgetAmount = useMemo(() => {
    if (token === "ETH") {
      return ethAmount > 0 ? ethAmount.toFixed(6) : "0";
    }
    const decimals = Number(tokenDef?.decimals || (tokenDef?.symbol === "cbBTC" ? 8 : 6));
    if (tokenDef?.symbol === "USDC" || tokenDef?.symbol === "USDT") {
      return totalUsd > 0 ? totalUsd.toFixed(decimals) : "0";
    }
    if (tokenDef?.symbol === "cbBTC") {
      if (!btcUsd || btcUsd <= 0) return "0";
      const units = totalUsd / btcUsd;
      return units > 0 ? units.toFixed(decimals) : "0";
    }
    if (tokenDef?.symbol === "cbXRP") {
      if (!xrpUsd || xrpUsd <= 0) return "0";
      const units = totalUsd / xrpUsd;
      return units > 0 ? units.toFixed(decimals) : "0";
    }
    if (tokenDef?.symbol === "SOL") {
      const solPerUsd = Number(usdRates["SOL"] || 0);
      if (!solPerUsd || solPerUsd <= 0) return "0";
      const solUsd = 1 / solPerUsd; // USD per SOL
      const units = totalUsd / solUsd;
      return units > 0 ? units.toFixed(decimals) : "0";
    }
    return "0";
  }, [token, tokenDef?.decimals, tokenDef?.symbol, ethAmount, totalUsd, btcUsd, xrpUsd, usdRates]);

  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout;

    if (!receipt || paymentConfirmed || loadingReceipt) return;

    const checkPayment = async () => {
      try {
        const res = await fetch("/api/terminal/check-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: merchantWallet,
            receiptId: receiptId,
            since: receipt.createdAt,
            amount: Number(widgetAmount),
            currency: token
          })
        });
        const data = await res.json();
        if (data.ok && data.paid && active) {
          setPaymentConfirmed({
            txHash: data.txHash || "",
            amount: totalUsd, // Display USD amount 
            token: token
          });
          // Also trigger postStatus
          await postStatus("checkout_success_poll", { txHash: data.txHash });
        }
      } catch (e) {
        console.error("Poll error", e);
      }
    };

    // Poll every 5s if we have a valid receipt configuration
    if (merchantWallet && receiptId) {
      timer = setInterval(checkPayment, 5000);
      // Initial check delayed slightly
      setTimeout(checkPayment, 2000);
    }

    return () => { active = false; clearInterval(timer); };
  }, [receipt, paymentConfirmed, loadingReceipt, merchantWallet, receiptId, totalUsd, widgetAmount, token]);

  const amountReady = useMemo(() => {
    if (isFiatFlow && widgetFiatAmount) {
      return Number(widgetFiatAmount) > 0;
    }
    return Number(widgetAmount) > 0;
  }, [isFiatFlow, widgetFiatAmount, widgetAmount]);

  useEffect(() => {
    try {
      if (
        merchantWallet &&
        receiptId &&
        widgetSupported &&
        amountReady &&
        tokenDef &&
        hasTokenAddr &&
        !loadingReceipt &&
        !!receipt
      ) {
        postStatus("checkout_initialized", { token, amount: widgetAmount });
      }
    } catch { }
  }, [
    merchantWallet,
    receiptId,
    widgetSupported,
    amountReady,
    tokenDef,
    hasTokenAddr,
    loadingReceipt,
    receipt,
    token,
    widgetAmount,
  ]);

  const displayTotalRounded = useMemo(() => {
    if (currency === "USD") return Number(totalUsd.toFixed(2));
    const usdRateDirect = Number(usdRates[currency] || 0);
    const converted = usdRateDirect > 0 ? totalUsd * usdRateDirect : convertFromUsd(totalUsd, currency, rates);
    const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
    return rounded;
  }, [currency, totalUsd, usdRates, rates]);

  const payRef = useRef<HTMLDivElement | null>(null);
  const widgetRootRef = useRef<HTMLDivElement | null>(null);

  // Reorder thirdweb Checkout payment options to prioritize "Pay with Card"
  // The thirdweb sheet renders into a portal attached to document.body; observe body for stable reordering
  useEffect(() => {
    const scopeEl = document.body;
    const tryReorder = () => {
      try {
        const allButtons = Array.from(scopeEl.querySelectorAll('button'));
        const getByText = (t: string) => allButtons.find(b => (b.textContent || '').toLowerCase().includes(t));
        const isWalletAddrLike = (txt: string) => {
          const s = (txt || '').toLowerCase();
          if (!s.includes('0x')) return false;
          // Accept full or truncated addresses: e.g., 0xabc123..., 0xabc123…xyz
          return /0x[a-f0-9]{2,6}(\.{3}|…)[a-f0-9]{2,6}/i.test(s) || /0x[a-f0-9]{6,}/i.test(s);
        };
        const cardBtn = getByText('pay with card');
        const connectBtn = getByText('connect a wallet');
        const walletBtn = allButtons.find(b => isWalletAddrLike(b.textContent || '')) || allButtons.find(b => /(metamask|coinbase wallet|wallet)/i.test(b.textContent || '')) || null;

        // Ensure we have a common parent list element
        const list = (cardBtn && connectBtn && cardBtn.parentElement === connectBtn.parentElement) ? (cardBtn.parentElement as HTMLElement) : (walletBtn && cardBtn && walletBtn.parentElement === cardBtn.parentElement ? (cardBtn.parentElement as HTMLElement) : null);
        if (!list) return;
        if ((list as any).dataset && (list as any).dataset.ppOrderApplied === '1') return; // avoid repeated reordering flicker

        // Desired order: Card, Connect, Wallet Address (if present)
        cardBtn && list.insertBefore(cardBtn, list.firstChild);
        if (connectBtn) list.insertBefore(connectBtn, cardBtn ? cardBtn.nextSibling : list.firstChild);
        if (walletBtn) list.insertBefore(walletBtn, connectBtn ? connectBtn.nextSibling : (cardBtn ? cardBtn.nextSibling : list.firstChild));
        (list as any).dataset.ppOrderApplied = '1';

        // Highlight Card option
        if (cardBtn) {
          const accent = effectiveSecondaryColor || theme.secondaryColor || '#F54029';
          (cardBtn as HTMLElement).style.outline = `2px solid ${accent}`;
          (cardBtn as HTMLElement).style.boxShadow = '0 0 0 3px rgba(0,0,0,0.15)';
          if (!cardBtn.querySelector('[data-pp-badge]')) {
            const titleEl = cardBtn.querySelector('span[color="primaryText"]') as HTMLElement | null;
            const badge = document.createElement('span');
            badge.dataset.ppBadge = '1';
            badge.textContent = 'Recommended';
            badge.style.marginLeft = '8px';
            badge.style.fontSize = '11px';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '9999px';
            badge.style.background = accent;
            badge.style.color = '#fff';
            badge.style.opacity = '0.95';
            (titleEl || cardBtn).appendChild(badge);
          }
        }
      } catch { }
    };

    const mo = new MutationObserver(tryReorder);
    mo.observe(scopeEl, { childList: true, subtree: true });
    tryReorder();
    const t1 = setTimeout(tryReorder, 100);
    const t2 = setTimeout(tryReorder, 400);
    const t3 = setTimeout(tryReorder, 1200);
    return () => { try { mo.disconnect(); } catch { }; clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [effectiveSecondaryColor, theme.secondaryColor]);

  const payLabel = useMemo(() => {
    return currency === "USD"
      ? formatCurrency(totalUsd, "USD")
      : formatCurrency(displayTotalRounded, currency);
  }, [currency, totalUsd, displayTotalRounded]);

  function onPayClick() {
    try {
      const root = widgetRootRef.current;
      if (!root) return;
      const btns = Array.from(root.querySelectorAll("button"));
      const primary = (() => {
        const candidates = btns.filter((b) => {
          const el = b as HTMLElement;
          // Exclude our external bottom pay button to avoid self-click recursion
          if (el.getAttribute("data-pp-bottom-pay") === "1") return false;
          const t = (el.textContent || "").trim().toLowerCase();
          return t.startsWith("pay") || t.includes("buy now") || t.includes("buy") || t.includes("checkout") || t.includes("pay now");
        });
        return candidates[0] || btns[btns.length - 1] || null;
      })();
      if (primary) (primary as HTMLButtonElement).click();
    } catch { }
  }

  useEffect(() => {
    // Disabled the label auto-updater to prevent DOM churn and "page not responding" issues
  }, []);

  // Override body background and lock outer scroll when embedded
  useEffect(() => {
    if (!isEmbedded) return;
    try {
      const bodyEl = document.body;
      const htmlEl = document.documentElement;
      const originalBodyBg = bodyEl.style.background;
      const originalHtmlBg = htmlEl.style.background;
      const originalBodyOverflow = bodyEl.style.overflow;
      const originalHtmlOverflow = htmlEl.style.overflow;
      const originalBodyOverscroll = (bodyEl.style as any).overscrollBehavior;
      const originalHtmlOverscroll = (htmlEl.style as any).overscrollBehavior;

      // Make embed background transparent and prevent outer scrollbars
      bodyEl.style.background = "transparent";
      htmlEl.style.background = "transparent";
      bodyEl.style.overflow = "hidden";
      htmlEl.style.overflow = "hidden";
      try {
        (bodyEl.style as any).overscrollBehavior = "contain";
        (htmlEl.style as any).overscrollBehavior = "contain";
      } catch { }

      return () => {
        bodyEl.style.background = originalBodyBg;
        htmlEl.style.background = originalHtmlBg;
        bodyEl.style.overflow = originalBodyOverflow;
        htmlEl.style.overflow = originalHtmlOverflow;
        try {
          (bodyEl.style as any).overscrollBehavior = originalBodyOverscroll || "";
          (htmlEl.style as any).overscrollBehavior = originalHtmlOverscroll || "";
        } catch { }
      };
    } catch { }
  }, [isEmbedded]);

  return (
    <div
      className={`w-full flex flex-col`}
      style={{
        height: isEmbedded ? "100%" : "var(--pp-vh)",
        minHeight: isEmbedded ? "100%" : undefined,
        background: isEmbedded ? "transparent" : undefined,
      }}
    >
      <div
        ref={containerRef}
        className={`pp-embed-white-text relative ${isEmbedded ? "border-2 rounded-2xl shadow-none bg-transparent" : (isInvoiceLayout ? "rounded-none border-0 shadow-none bg-transparent" : "rounded-2xl border shadow-xl bg-[rgba(10,11,16,0.6)] backdrop-blur")} ${isTwoColumnLayout ? (isInvoiceLayout ? "w-full max-w-none mx-auto" : "w-full max-w-none mx-auto") : ""} ${isEmbedded ? "no-scrollbar" : ""}`}
        style={{
          ...backgroundStyle,
          display: "flex",
          flexDirection: "column",
          flex: "1 1 auto",
          height: isEmbedded ? "100%" : "var(--pp-vh)",
          minHeight: isEmbedded ? "100%" : undefined,
          maxHeight: isEmbedded ? undefined : "var(--pp-vh)",
          // Embedded: always use auto to allow scrolling when content exceeds container
          overflowY: "auto", // Fix: explicit overflow-y
          WebkitOverflowScrolling: "touch", // Fix: native momentum scrolling
          overscrollBehavior: "contain", // Fix: prevent parent scroll chaining
          touchAction: "pan-y", // Fix: explicit touch action
          fontFamily: theme.fontFamily,
          borderColor: isEmbedded ? "var(--pp-primary)" : undefined,
        }}
      >
        <style dangerouslySetInnerHTML={{
          __html: `
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `}} />
        {/* Left-half decorative gradient background (only for invoice-style full page) */}
        {!isEmbedded && isInvoiceLayout && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1/2 pointer-events-none -z-10 hidden md:block"
            style={{ background: "radial-gradient(1800px 900px at 20% 50%, color-mix(in srgb, var(--pp-primary) 20%, transparent), transparent 62%)" }}
          />
        )}

        {/* Header (centered card width) */}
        <div
          className={`relative z-[10] flex items-center gap-3 w-full overflow-hidden ${isEmbedded ? "px-3 py-2 rounded-t-2xl" : (isTwoColumnLayout ? (isInvoiceLayout ? "max-w-none px-4 md:px-6 py-1 md:py-2" : "max-w-none px-4 md:px-6 py-1 md:py-2") : "px-4 md:px-6 py-2")}`}
          style={{ background: effectivePrimaryColor, color: "var(--pp-text-header)" }}
        >
          {effectiveNavbarMode === "logo" ? (
            // Full-width logo (no text)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={effectiveBrandName || "Logo"}
              src={getHeaderLogo()}
              className="h-9 w-auto max-w-[360px] object-contain rounded-none bg-transparent drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]"
              style={{ fontFamily: theme.fontFamily }}
            />
          ) : (
            <>
              <div className={`${theme.brandLogoShape === "round" ? "rounded-full" : "rounded-md"} w-9 h-9 bg-white/10 flex items-center justify-center overflow-hidden`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="logo"
                  src={getSymbolLogo()}
                  className="max-h-9 object-contain drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]"
                />
              </div>
              <div className="font-semibold truncate" style={{ fontFamily: theme.fontFamily }}>
                {effectiveBrandName || getDefaultBrandName(theme.brandKey)}
              </div>
            </>
          )}
          <div className="ml-auto" />
          {isClientSide && isEmbedded && (
            <button
              type="button"
              aria-label="Close portal"
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors text-xl font-light"
              style={{ color: "var(--pp-text-header)" }}
              onClick={() => {
                try {
                  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
                    // New event name (primary)
                    window.parent.postMessage({ type: "gateway-card-cancel", correlationId, receiptId, recipient: merchantWallet || recipient }, targetOrigin);
                    // DEPRECATED: Remove after 2026-04-30 - kept for backwards compatibility
                    window.parent.postMessage({ type: "portalpay-card-cancel", correlationId, receiptId, recipient: merchantWallet || recipient }, targetOrigin);
                  }
                } catch { }
              }}
            >
              ✕
            </button>
          )}
          {isMobileViewport && !isEmbedded && (
            <div className="ml-2">
              <ConnectButton
                client={client}
                chain={chain}
                wallets={wallets}
                connectButton={{
                  label: <span className="microtext drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">Login</span>,
                  className: connectButtonClass,
                  style: getConnectButtonStyle(),
                }}
                signInButton={{
                  label: "Authenticate",
                  className: connectButtonClass,
                  style: getConnectButtonStyle(),
                }}
                detailsButton={{
                  displayBalanceToken: { [((chain as any)?.id ?? 8453)]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
                }}
                connectModal={{
                  showThirdwebBranding: false,
                  title: "Login",
                  titleIcon: (() => {
                    const c = (theme.brandLogoUrl || "").trim();
                    const a = (theme.symbolLogoUrl || "").trim();
                    const b = (theme.brandFaviconUrl || "").trim();
                    return resolveBrandSymbol(c || a || b, (theme as any)?.brandKey || (theme as any)?.key);
                  })(),
                  size: "compact",
                }}
                theme={twTheme}
              />
            </div>
          )}
        </div>

        {/* Floating login button (top-right, hidden when embedded) */}
        <div className="hidden sm:block fixed top-2 right-2 z-[20002]" style={{ display: isEmbedded ? "none" : undefined }}>
          <ConnectButton
            client={client}
            chain={chain}
            wallets={wallets}
            connectButton={{
              label: <span className="microtext drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">Login</span>,
              className: connectButtonClass,
              style: getConnectButtonStyle(),
            }}
            signInButton={{
              label: "Authenticate",
              className: connectButtonClass,
              style: getConnectButtonStyle(),
            }}
            detailsButton={{
              displayBalanceToken: { [((chain as any)?.id ?? 8453)]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
            }}
            connectModal={{
              showThirdwebBranding: false,
              title: "Login",
              titleIcon: (() => {
                const c = (theme.brandLogoUrl || "").trim();
                const a = (theme.symbolLogoUrl || "").trim();
                const b = (theme.brandFaviconUrl || "").trim();
                return resolveBrandSymbol(c || a || b, (theme as any)?.brandKey || (theme as any)?.key);
              })(),
              size: "compact",
            }}
            theme={twTheme}
          />
        </div>

        {/* Scrollable content (centered) */}
        <div
          ref={contentRef}
          className={`flex-1 flex flex-col ${isTwoColumnLayout ? ("items-stretch justify-start py-6 md:py-10 w-full " + (isInvoiceLayout ? "max-w-6xl" : "max-w-6xl")) : "items-center justify-start max-w-[428px]"} ${isEmbedded && !isTwoColumnLayout ? "px-3" : "px-3"} mx-auto`}
          style={{
            backdropFilter: "saturate(1.02) contrast(1.02)",
            paddingTop: isEmbedded ? "env(safe-area-inset-top, 0px)" : undefined,
            maxWidth: isEmbedded ? "none" : undefined,
            paddingLeft: isEmbedded && !isTwoColumnLayout ? undefined : (isEmbedded ? 0 : undefined),
            paddingRight: isEmbedded && !isTwoColumnLayout ? undefined : (isEmbedded ? 0 : undefined),
            paddingBottom: isEmbedded ? 0 : (isTwoColumnLayout ? "calc(env(safe-area-inset-bottom, 0px) + 24px)" : "calc(env(safe-area-inset-bottom, 0px) + 36px)"),
            color: "var(--pp-text-body)",
            minHeight: isEmbedded ? undefined : "calc(var(--pp-vh) - 64px - 60px)",
            overflow: "visible",
            position: "relative",
            flexGrow: isEmbedded ? 1 : undefined,
            justifyContent: isEmbedded ? "space-between" : undefined,
          }}
        >
          {isTwoColumnLayout ? (
            <>

              <div className={`${isTwoColumnLayout ? (isEmbedded ? "mt-4 mb-2 w-full" : "mt-8 md:mt-12 mb-4 md:mb-6 w-full") : "my-auto"} grid ${isTwoColumnLayout ? "grid-cols-2" : "grid-cols-1"} gap-3 items-stretch md:gap-6`}>
                <div className="relative overflow-visible p-3 md:p-4 h-full flex flex-col justify-center">
                  {/* Currency equivalents selector */}
                  <div className="p-3" ref={currencyRef}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold">Order Preview</div>
                        <div className="microtext text-muted-foreground">
                          Totals are shown in the selected currency. USD equivalent is shown when applicable.
                        </div>
                      </div>
                      <div className="microtext text-muted-foreground">
                        {ratesUpdatedAt ? `Rates ${ratesUpdatedAt.toLocaleTimeString()}` : "Loading rates…"}
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-xs text-muted-foreground">Select currency</label>
                      <div className="relative mt-1">
                        <button
                          type="button"
                          onClick={() => setCurrencyOpen((v) => !v)}
                          className="h-10 px-3 text-left border rounded-md bg-background hover:bg-foreground/5 transition-colors flex items-center gap-3 w-full"
                          title="View currency equivalents"
                        >
                          <span className="inline-flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={currency}
                              src={getCurrencyFlag(currency)}
                              className="w-[18px] h-[14px] rounded-[2px] ring-1 ring-foreground/10"
                            />
                          </span>
                          <span className="truncate">
                            {currency} — {(availableFiatCurrencies as readonly any[]).find((x) => x.code === currency)?.name || ""}
                          </span>
                          <span className="ml-auto opacity-70">▾</span>
                        </button>
                        {currencyOpen && (
                          <div className="absolute z-[20005] mt-1 w-full rounded-md border bg-background shadow-md p-1 max-h-64 overflow-hidden">
                            {availableFiatCurrencies.map((c) => (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => {
                                  setCurrency(c.code);
                                  setCurrencyOpen(false);
                                }}
                                className="w-full px-2 py-2 rounded-md hover:bg-foreground/5 flex items-center gap-2 text-sm transition-colors"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  alt={c.code}
                                  src={getCurrencyFlag(c.code)}
                                  className="w-[18px] h-[14px] rounded-[2px] ring-1 ring-foreground/10"
                                />
                                <span className="font-medium">{c.code}</span>
                                <span className="text-muted-foreground">— {c.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Receipt */}
                  <div className="mt-2 p-3">
                    <div className="flex items-center gap-3">
                      <div className={`${theme.brandLogoShape === "round" ? "rounded-full" : "rounded-lg"} w-10 h-10 bg-foreground/5 overflow-hidden grid place-items-center`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getSymbolLogo()}
                          alt="Logo"
                          className="w-10 h-10 object-contain"
                        />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{effectiveBrandName || getDefaultBrandName(theme.brandKey)}</div>
                        <div className="microtext text-muted-foreground">Digital Receipt</div>
                      </div>
                      <div className="ml-auto microtext text-muted-foreground">
                        {loadingReceipt ? "Loading…" : "Live"}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {(() => {
                        const displayItems = (items || []).filter((it) => {
                          const label = String(it.label || "");
                          return !/processing fee/i.test(label) && !/portal fee/i.test(label) && !/tax/i.test(label);
                        });
                        return displayItems.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm">
                            <span className="opacity-80">
                              {it.label}
                              {typeof it.qty === "number" && it.qty > 1 ? ` × ${it.qty}` : ""}
                            </span>
                            <span>{(() => {
                              const usdVal = Number(it.priceUsd || 0);
                              if (currency === "USD") {
                                return formatCurrency(usdVal, "USD");
                              }
                              const converted = convertFromUsd(usdVal, currency, rates);
                              const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                              return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(usdVal, "USD");
                            })()}</span>
                          </div>
                        ));
                      })()}

                      <div className="mt-2">
                        <div className="text-xs font-medium">Add a tip</div>
                        <div className="mt-1 flex gap-2 flex-wrap">
                          {(["0", "10", "15", "20", "custom"] as const).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setTipChoice(v)}
                              className={`px-2 py-1 rounded-md border text-xs hover:bg-foreground/5 transition-colors ${tipChoice === v ? "bg-foreground/10 border-foreground/20" : ""}`}
                              title={v === "custom" ? "Custom tip amount" : `Tip ${v}%`}
                            >
                              {v === "custom" ? "Custom" : `${v}%`}
                            </button>
                          ))}
                          {tipChoice === "custom" && (
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={Number.isFinite(tipCustomPct) ? String(tipCustomPct) : ""}
                              onChange={(e) => setTipCustomPct(Number(e.target.value))}
                              placeholder="%"
                              className="h-7 px-2 rounded-md border bg-background text-xs w-20"
                              title="Enter tip percentage"
                            />
                          )}
                        </div>
                        <div className="microtext text-muted-foreground mt-1">
                          Tip applies to subtotal before tax and fees.
                        </div>
                      </div>

                      <div className="border-t border-dashed my-2" />
                      <div className="flex items-center justify-between text-sm">
                        <span>Subtotal</span>
                        <span>{(() => {
                          if (currency === "USD") {
                            return formatCurrency(itemsSubtotalUsd, "USD");
                          }
                          const converted = convertFromUsd(itemsSubtotalUsd, currency, rates);
                          const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                          return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(itemsSubtotalUsd, "USD");
                        })()}</span>
                      </div>
                      {tipUsd > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="opacity-80">Tip</span>
                          <span>{(() => {
                            if (currency === "USD") {
                              return formatCurrency(tipUsd, "USD");
                            }
                            const converted = convertFromUsd(tipUsd, currency, rates);
                            const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                            return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(tipUsd, "USD");
                          })()}</span>
                        </div>
                      )}
                      {taxUsd > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="opacity-80">Tax</span>
                          <span>{(() => {
                            if (currency === "USD") {
                              return formatCurrency(taxUsd, "USD");
                            }
                            const converted = convertFromUsd(taxUsd, currency, rates);
                            const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                            return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(taxUsd, "USD");
                          })()}</span>
                        </div>
                      )}
                      {processingFeeUsd > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="opacity-80">Processing Fee ({(basePlatformFeePct + Number(processingFeePct || 0)).toFixed(2)}%)</span>
                          <span>{(() => {
                            if (currency === "USD") {
                              return formatCurrency(processingFeeUsd, "USD");
                            }
                            const converted = convertFromUsd(processingFeeUsd, currency, rates);
                            const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                            return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(processingFeeUsd, "USD");
                          })()}</span>
                        </div>
                      )}
                      <div className="border-t border-dashed my-2" />
                      <div className="flex items-center justify-between font-semibold">
                        <span>Total ({currency})</span>
                        <span>{currency === "USD" ? formatCurrency(totalUsd, "USD") : formatCurrency(displayTotalRounded, currency)}</span>
                      </div>
                      {(() => {
                        if (currency === "USD") return null;
                        return (
                          <div className="mt-1 microtext text-muted-foreground">
                            Equivalent: {formatCurrency(totalUsd, "USD")} (USD)
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="h-full flex flex-col justify-center">
                  {/* Payment Section */}
                  <div ref={payRef} className={`mt-0 md:mt-0 ${isEmbedded ? "rounded-none border-0 p-0 bg-transparent" : "rounded-2xl border p-3 bg-background/70"} flex flex-col`}>
                    <div ref={widgetRootRef} className={isEmbedded ? "mt-0 border-2 rounded-2xl p-3" : "mt-0 rounded-2xl border p-3"} style={{ minHeight: isEmbedded ? `${EMBEDDED_WIDGET_HEIGHT}px` : undefined, overflow: isEmbedded ? "hidden" : undefined, borderColor: isEmbedded ? "rgba(255,255,255,0.1)" : undefined }}>
                      {!loadingReceipt && receipt && totalUsd > 0 && amountReady && merchantWallet && tokenDef && hasTokenAddr && widgetSupported ? (
                        <>
                          {/* Payment Complete State - Blocks Double Payment */}
                          {(paymentConfirmed || isSettled(receipt.status)) ? (
                            <div className="w-full flex flex-col items-center justify-center gap-4 py-8 text-center animate-in fade-in zoom-in duration-300">
                              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mb-2">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                              <div className="space-y-1">
                                <div className="text-xl font-bold text-white">Payment Complete</div>
                                <div className="text-sm text-foreground/80">
                                  {formatCurrency(totalUsd, "USD")} • {receiptId}
                                </div>
                              </div>
                              <div className="p-4 rounded-xl bg-white/5 border border-white/10 w-full max-w-[280px] mt-2">
                                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                                  Proof of Payment
                                </div>
                                <div className="text-lg font-bold text-white break-all">
                                  {paymentConfirmed?.txHash ? (
                                    <span className="font-mono text-xs">{paymentConfirmed.txHash.slice(0, 10)}...{paymentConfirmed.txHash.slice(-8)}</span>
                                  ) : (
                                    <span className="font-mono text-sm">Validating...</span>
                                  )}
                                </div>
                                <div className="text-xs text-emerald-400 font-medium mt-1">
                                  Show this screen to merchant
                                </div>
                              </div>
                              <div className="mt-4 flex gap-2">
                                <button className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors" onClick={() => window.location.reload()}>
                                  Refresh Receipt
                                </button>
                              </div>
                            </div>
                          ) : (
                            <CheckoutWidget
                              key={`${token}-${currency}-${ratesUpdatedAt ? ratesUpdatedAt.getTime() : 0}`}
                              className="w-full"
                              client={client}
                              chain={chain}
                              currency={widgetCurrency as any}
                              amount={(isFiatFlow && widgetFiatAmount) ? (widgetFiatAmount as any) : widgetAmount}
                              seller={sellerAddress || merchantWallet || recipient}
                              tokenAddress={token === "ETH" ? undefined : (tokenAddr as any)}
                              showThirdwebBranding={false}
                              theme={darkTheme({
                                colors: {
                                  modalBg: "transparent",
                                  borderColor: "transparent",
                                  primaryText: "#ffffff",
                                  secondaryText: "#ffffff",
                                  accentText: "#ffffff",
                                  accentButtonBg: theme.primaryColor,
                                  accentButtonText: "#ffffff",
                                  primaryButtonBg: theme.primaryColor,
                                  primaryButtonText: "#ffffff",
                                  connectedButtonBg: "rgba(255,255,255,0.04)",
                                  connectedButtonBgHover: "rgba(255,255,255,0.08)",
                                },
                              })}
                              style={{
                                width: "100%",
                                maxWidth: "100%",

                                background: "transparent",
                                border: "none",
                                borderRadius: 0,
                              }}
                              connectOptions={{ accountAbstraction: { chain, sponsorGas: true } }}
                              purchaseData={{
                                productId: `portal:${receiptId}`,
                                meta: {
                                  token,
                                  currency,
                                  usd: totalUsd,
                                  tipUsd,
                                  itemsSubtotalUsd,
                                  taxUsd,
                                  processingFeeUsd: processingFeeUsd,
                                  feePct: (basePlatformFeePct + Number(processingFeePct || 0)),
                                },
                              }}
                              onSuccess={(result: any) => {
                                // Onramp Tracking: Capture success and link txHash immediately
                                console.log("[CHECKOUT] Success:", result);
                                const txHash = result?.transactionHash || result?.hash;
                                const buyer = (account?.address || "").toLowerCase();

                                // IMMEDIATE STATE UPDATE TO BLOCK DOUBLE SPEND
                                setPaymentConfirmed({
                                  txHash: txHash || "",
                                  amount: totalUsd,
                                  token: token
                                });

                                // Link txHash to receipt immediately via receipt_claimed
                                if (txHash && receiptId) {
                                  postStatus("receipt_claimed", {
                                    buyerWallet: buyer,
                                    txHash
                                  }).catch(e => console.error("[CHECKOUT] Failed to update status:", e));
                                } else {
                                  postStatus("checkout_success", { buyer });
                                }

                                // Legacy post-processing steps (billing, postMessage)
                                try {
                                  fetch("/api/billing/purchase", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "x-wallet": buyer,
                                      "x-recipient": merchantWallet || recipient,
                                    },
                                    body: JSON.stringify({
                                      seconds: 1,
                                      usd: Number(totalUsd.toFixed(2)),
                                      token,
                                      wallet: buyer,
                                      receiptId,
                                      recipient: merchantWallet || recipient,
                                      idempotencyKey: `portal:${receiptId}:${buyer}:${Date.now()}`,
                                    }),
                                  }).catch(() => { });

                                  try {
                                    window.postMessage({ type: "billing:refresh" }, "*");
                                  } catch { }

                                  try {
                                    if (typeof window !== "undefined" && window.parent && window.parent !== window) {
                                      const confirmToken = `ppc_${receiptId}_${Date.now()}`;
                                      // New event name (primary)
                                      window.parent.postMessage({ type: "gateway-card-success", token: confirmToken, correlationId, receiptId, recipient: merchantWallet || recipient }, targetOrigin);
                                      // DEPRECATED: Remove after 2026-04-30 - kept for backwards compatibility
                                      window.parent.postMessage({ type: "portalpay-card-success", token: confirmToken, correlationId, receiptId, recipient: merchantWallet || recipient }, targetOrigin);
                                    }
                                  } catch { }
                                } catch { }
                              }}
                            />
                          )}
                        </>
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center gap-3 py-8 text-center min-h-[240px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={getSymbolLogo()}
                            alt="Logo"
                            className="w-16 h-16 rounded-lg object-contain"
                          />
                          <div className="text-sm text-muted-foreground">
                            {loadingReceipt
                              ? "Loading receipt…"
                              : totalUsd <= 0
                                ? "Invalid amount"
                                : !merchantWallet
                                  ? "Recipient not configured"
                                  : !widgetSupported
                                    ? "Unsupported token/network"
                                    : !amountReady
                                      ? "Loading rates…"
                                      : (!tokenDef || !hasTokenAddr)
                                        ? "Token not configured"
                                        : "Preparing checkout…"}
                          </div>
                        </div>
                      )}

                      <div className="microtext text-muted-foreground text-center mt-3">
                        Trustless, permissionless settlement via {effectiveBrandName} on Base. Funds settle on-chain — no custodial hold. Uses live payment flow and records spend/XP.
                        {isClientSide && isIframe && !isMobileViewport ? (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  const msg = { type: "portalpay-card-cancel", correlationId, receiptId, recipient: merchantWallet || recipient };
                                  window.parent.postMessage(msg, targetOrigin);
                                } catch { }
                              }}
                              className="px-3 py-1.5 rounded-md border bg-background hover:bg-foreground/5 transition-colors text-xs"
                              title="Cancel checkout"
                            >
                              Cancel checkout
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Currency equivalents selector */}
              <div className={isEmbedded ? "rounded-none border-0 bg-transparent p-0" : "rounded-xl border bg-background/80 p-3"} ref={currencyRef}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Order Preview</div>
                    <div className="microtext text-muted-foreground">
                      Totals are shown in the selected currency. USD equivalent is shown when applicable.
                    </div>
                  </div>
                  <div className="microtext text-muted-foreground">
                    {ratesUpdatedAt ? `Rates ${ratesUpdatedAt.toLocaleTimeString()}` : "Loading rates…"}
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">Select currency</label>
                  <div className="relative mt-1">
                    <button
                      type="button"
                      onClick={() => setCurrencyOpen((v) => !v)}
                      className="h-10 px-3 text-left border rounded-md bg-background hover:bg-foreground/5 transition-colors flex items-center gap-3 w-full"
                      title="View currency equivalents"
                    >
                      <span className="inline-flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={currency}
                          src={getCurrencyFlag(currency)}
                          className="w-[18px] h-[14px] rounded-[2px] ring-1 ring-foreground/10"
                        />
                      </span>
                      <span className="truncate">
                        {currency} — {(availableFiatCurrencies as readonly any[]).find((x) => x.code === currency)?.name || ""}
                      </span>
                      <span className="ml-auto opacity-70">▾</span>
                    </button>
                    {currencyOpen && (
                      <div className="absolute z-[20005] mt-1 w-full rounded-md border bg-background shadow-md p-1 max-h-64 overflow-hidden">
                        {availableFiatCurrencies.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setCurrency(c.code);
                              setCurrencyOpen(false);
                            }}
                            className="w-full px-2 py-2 rounded-md hover:bg-foreground/5 flex items-center gap-2 text-sm transition-colors"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt={c.code}
                              src={getCurrencyFlag(c.code)}
                              className="w-[18px] h-[14px] rounded-[2px] ring-1 ring-foreground/10"
                            />
                            <span className="font-medium">{c.code}</span>
                            <span className="text-muted-foreground">— {c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Receipt */}
              <div className={`mt-4 ${isEmbedded ? "" : "rounded-2xl border p-3 bg-background/70"}`}>
                <div className="flex items-center gap-3">
                  <div className={`${theme.brandLogoShape === "round" ? "rounded-full" : "rounded-lg"} w-10 h-10 bg-foreground/5 overflow-hidden grid place-items-center`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getSymbolLogo()}
                      alt="Logo"
                      className="w-10 h-10 object-contain"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{effectiveBrandName || getDefaultBrandName(theme.brandKey)}</div>
                    <div className="microtext text-muted-foreground">Digital Receipt</div>
                  </div>
                  <div className="ml-auto microtext text-muted-foreground">
                    {loadingReceipt ? "Loading…" : "Live"}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {(() => {
                    const displayItems = (items || []).filter((it) => {
                      const label = String(it.label || "");
                      return !/processing fee/i.test(label) && !/portal fee/i.test(label) && !/tax/i.test(label);
                    });
                    return displayItems.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="opacity-80">
                          {it.label}
                          {typeof it.qty === "number" && it.qty > 1 ? ` × ${it.qty}` : ""}
                        </span>
                        <span>{(() => {
                          const usdVal = Number(it.priceUsd || 0);
                          if (currency === "USD") {
                            return formatCurrency(usdVal, "USD");
                          }
                          const converted = convertFromUsd(usdVal, currency, rates);
                          const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                          return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(usdVal, "USD");
                        })()}</span>
                      </div>
                    ));
                  })()}

                  <div className="mt-2">
                    <div className="text-xs font-medium flex items-center gap-2">
                      Add a tip
                      {updatingTip && <span className="animate-spin text-xs">⏳</span>}
                    </div>
                    <div className="mt-1 flex gap-2 flex-wrap">
                      {(["0", "10", "15", "20", "custom"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          disabled={updatingTip}
                          onClick={() => {
                            setTipChoice(v);
                            if (v !== "custom") handleTipUpdate(v);
                          }}
                          className={`px-2 py-1 rounded-md border text-xs hover:bg-foreground/5 transition-colors ${tipChoice === v ? "bg-foreground/10 border-foreground/20" : ""} ${updatingTip ? "opacity-50 cursor-not-allowed" : ""}`}
                          title={v === "custom" ? "Custom tip amount" : `Tip ${v}%`}
                        >
                          {v === "custom" ? "Custom" : `${v}%`}
                        </button>
                      ))}
                      {tipChoice === "custom" && (
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          disabled={updatingTip}
                          value={Number.isFinite(tipCustomPct) ? String(tipCustomPct) : ""}
                          onChange={(e) => setTipCustomPct(Number(e.target.value))}
                          onBlur={() => handleTipUpdate(tipCustomPct)}
                          placeholder="%"
                          className="h-7 px-2 rounded-md border bg-background text-xs w-20"
                          title="Enter tip percentage"
                        />
                      )}
                    </div>
                    <div className="microtext text-muted-foreground mt-1">
                      Tip applies to subtotal before tax and fees.
                    </div>
                  </div>

                  <div className="border-t border-dashed my-2" />
                  <div className="flex items-center justify-between text-sm">
                    <span>Subtotal</span>
                    <span>{(() => {
                      if (currency === "USD") {
                        return formatCurrency(itemsSubtotalUsd, "USD");
                      }
                      const converted = convertFromUsd(itemsSubtotalUsd, currency, rates);
                      const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                      return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(itemsSubtotalUsd, "USD");
                    })()}</span>
                  </div>
                  {tipUsd > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="opacity-80">Tip</span>
                      <span>{(() => {
                        if (currency === "USD") {
                          return formatCurrency(tipUsd, "USD");
                        }
                        const converted = convertFromUsd(tipUsd, currency, rates);
                        const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                        return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(tipUsd, "USD");
                      })()}</span>
                    </div>
                  )}
                  {taxUsd > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="opacity-80">Tax</span>
                      <span>{(() => {
                        if (currency === "USD") {
                          return formatCurrency(taxUsd, "USD");
                        }
                        const converted = convertFromUsd(taxUsd, currency, rates);
                        const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                        return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(taxUsd, "USD");
                      })()}</span>
                    </div>
                  )}
                  {processingFeeUsd > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="opacity-80">Processing Fee ({(basePlatformFeePct + Number(processingFeePct || 0)).toFixed(2)}%)</span>
                      <span>{(() => {
                        if (currency === "USD") {
                          return formatCurrency(processingFeeUsd, "USD");
                        }
                        const converted = convertFromUsd(processingFeeUsd, currency, rates);
                        const rounded = converted > 0 ? roundForCurrency(converted, currency) : 0;
                        return rounded > 0 ? formatCurrency(rounded, currency) : formatCurrency(processingFeeUsd, "USD");
                      })()}</span>
                    </div>
                  )}
                  <div className="border-t border-dashed my-2" />
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total ({currency})</span>
                    <span>{currency === "USD" ? formatCurrency(totalUsd, "USD") : formatCurrency(displayTotalRounded, currency)}</span>
                  </div>
                  {(() => {
                    if (currency === "USD") return null;
                    return (
                      <div className="mt-1 microtext text-muted-foreground">
                        Equivalent: {formatCurrency(totalUsd, "USD")} (USD)
                      </div>
                    );
                  })()}
                </div>

                {/* Payment Section */}
                <div ref={payRef} className={`mt-4 ${isEmbedded ? "rounded-none border-0 p-0 bg-transparent" : "rounded-2xl border p-3 bg-background/70"}`}>
                  <div ref={widgetRootRef} className={isEmbedded ? "mt-1 flex-1 border-2 rounded-2xl p-3" : "mt-2 rounded-2xl border p-3 flex-1"} style={{ minHeight: isEmbedded ? `${EMBEDDED_WIDGET_HEIGHT}px` : undefined, overflow: isEmbedded ? "hidden" : undefined, borderColor: isEmbedded ? "rgba(255,255,255,0.1)" : undefined }}>
                    {!loadingReceipt && receipt && totalUsd > 0 && amountReady && merchantWallet && tokenDef && hasTokenAddr && widgetSupported ? (
                      <>
                        {(paymentConfirmed || isSettled(receipt.status)) ? (
                          <div className="w-full flex flex-col items-center justify-center gap-4 py-8 text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mb-2">
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <div className="space-y-1">
                              <div className="text-xl font-bold text-white">Payment Complete</div>
                              <div className="text-sm text-foreground/80">
                                {formatCurrency(totalUsd, "USD")} • {receiptId}
                              </div>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10 w-full max-w-[280px] mt-2">
                              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                                Proof of Payment
                              </div>
                              <div className="text-lg font-bold text-white break-all">
                                {paymentConfirmed?.txHash ? (
                                  <span className="font-mono text-xs">{paymentConfirmed.txHash.slice(0, 10)}...{paymentConfirmed.txHash.slice(-8)}</span>
                                ) : (
                                  <span className="font-mono text-sm">Validating...</span>
                                )}
                              </div>
                              <div className="text-xs text-emerald-400 font-medium mt-1">
                                Show this screen to merchant
                              </div>
                            </div>
                            <div className="mt-4 flex gap-2">
                              <button className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors" onClick={() => window.location.reload()}>
                                Refresh Receipt
                              </button>
                            </div>
                          </div>
                        ) : (
                          <CheckoutWidget
                            key={`${token}-${currency}-${ratesUpdatedAt ? ratesUpdatedAt.getTime() : 0}`}
                            className="w-full"
                            client={client}
                            chain={base} // FORCE Base chain to align with hardcoded Base tokens
                            currency={currency as any} // valid on Base
                            amount={(isFiatFlow && widgetFiatAmount) ? (widgetFiatAmount as any) : widgetAmount}
                            seller={sellerAddress || merchantWallet || recipient}
                            tokenAddress={token === "ETH" ? undefined : (tokenAddr as any)}
                            showThirdwebBranding={false}
                            theme={darkTheme({
                              colors: {
                                modalBg: "transparent",
                                borderColor: "transparent",
                                primaryText: "#ffffff",
                                secondaryText: "#ffffff",
                                accentText: "#ffffff",
                                accentButtonBg: theme.primaryColor,
                                accentButtonText: "#ffffff",
                                primaryButtonBg: theme.primaryColor,
                                primaryButtonText: "#ffffff",
                                connectedButtonBg: "rgba(255,255,255,0.04)",
                                connectedButtonBgHover: "rgba(255,255,255,0.08)",
                              },
                            })}
                            style={{
                              width: "100%",
                              maxWidth: "100%",

                              background: "transparent",
                              border: "none",
                              borderRadius: 0,
                            }}
                            connectOptions={{ accountAbstraction: { chain, sponsorGas: true } }}

                            purchaseData={{
                              productId: `portal:${receiptId}`,
                              meta: {
                                token,
                                currency,
                                usd: totalUsd,
                                tipUsd,
                                itemsSubtotalUsd,
                                taxUsd,
                                processingFeeUsd: processingFeeUsd,
                                feePct: (basePlatformFeePct + Number(processingFeePct || 0)),
                                employeeId: receipt?.employeeId,
                                sessionId: receipt?.sessionId,
                              },
                            }}
                            onSuccess={async (data: any) => {
                              try {
                                const wallet = (account?.address || "").toLowerCase();

                                // Robust txHash extraction from Thirdweb SDK response
                                // data: { quote: BridgePrepareResult; statuses: Array<CompletedStatusResult>; }
                                let txHash = "";
                                const statuses = Array.isArray(data?.statuses) ? data.statuses : [];

                                // 1. Try to find a transaction hash in statuses
                                const txStatus = statuses.find((s: any) => s.transactionHash);
                                if (txStatus) txHash = txStatus.transactionHash;

                                // 2. Fallback to top-level property (older SDK versions)
                                if (!txHash && data?.transactionHash) txHash = data.transactionHash;

                                // 3. Last resort fallback
                                if (!txHash) txHash = "";

                                setPaymentConfirmed({
                                  txHash,
                                  amount: totalUsd,
                                  token: currency
                                });

                                await postStatus("paid", { buyer: wallet, txHash });
                                await fetch("/api/billing/purchase", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "x-wallet": wallet,
                                    "x-recipient": merchantWallet || recipient,
                                  },
                                  body: JSON.stringify({
                                    seconds: 1,
                                    usd: Number(totalUsd.toFixed(2)),
                                    token,
                                    wallet,
                                    receiptId,
                                    recipient: merchantWallet || recipient,
                                    idempotencyKey: `portal:${receiptId}:${wallet}:${Date.now()}`,
                                  }),
                                });
                                try {
                                  window.postMessage({ type: "billing:refresh" }, "*");
                                } catch { }
                                try {
                                  if (typeof window !== "undefined" && window.parent && window.parent !== window) {
                                    const confirmToken = `ppc_${receiptId}_${Date.now()}`;
                                    // New event name (primary)
                                    window.parent.postMessage({ type: "gateway-card-success", token: confirmToken, correlationId, receiptId, recipient: merchantWallet || recipient, txHash }, targetOrigin);
                                    // DEPRECATED: Remove after 2026-04-30 - kept for backwards compatibility
                                    window.parent.postMessage({ type: "portalpay-card-success", token: confirmToken, correlationId, receiptId, recipient: merchantWallet || recipient }, targetOrigin);
                                  }
                                } catch { }
                              } catch (err) {
                                console.error("Checkout success handler error", err);
                              }
                            }}
                            onError={(error) => {
                              console.error("CheckoutWidget Error:", error);
                              postStatus("checkout_error", { error: error.message });
                            }}
                          />
                        )}
                      </>
                    ) : (
                      <div className="w-full flex flex-col items-center justify-center gap-3 py-8 text-center min-h-[240px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={getSymbolLogo()}
                          alt="Logo"
                          className="w-16 h-16 rounded-lg object-contain"
                        />
                        <div className="text-sm text-muted-foreground">
                          {loadingReceipt
                            ? "Loading receipt…"
                            : totalUsd <= 0
                              ? "Invalid amount"
                              : !merchantWallet
                                ? "Recipient not configured"
                                : !widgetSupported
                                  ? "Unsupported token/network"
                                  : !amountReady
                                    ? "Loading rates…"
                                    : (!tokenDef || !hasTokenAddr)
                                      ? "Token not configured"
                                      : "Preparing checkout…"}
                        </div>
                      </div>
                    )}

                    <div className="microtext text-muted-foreground text-center mt-3">
                      Trustless, permissionless settlement via {effectiveBrandName} on Base. Funds settle on-chain — no custodial hold. Uses live payment flow and records spend/XP.
                      {isClientSide && isIframe && !isMobileViewport ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                // New event name (primary)
                                window.parent.postMessage({ type: "gateway-card-cancel", correlationId, receiptId, recipient: merchantWallet || recipient }, targetOrigin);
                                // DEPRECATED: Remove after 2026-04-30 - kept for backwards compatibility
                                window.parent.postMessage({ type: "portalpay-card-cancel", correlationId, receiptId, recipient: merchantWallet || recipient }, targetOrigin);
                              } catch { }
                            }}
                            className="px-3 py-1.5 rounded-md border bg-background hover:bg-foreground/5 transition-colors text-xs"
                            title="Cancel checkout"
                          >
                            Cancel checkout
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        {/* Footer note - placed outside scrollable content for embedded to ensure visibility */}
        {isClientSide && isEmbedded && (
          <div
            className="px-4 py-2 text-[11px] opacity-80 rounded-b-2xl"
            style={{ background: effectiveSecondaryColor, color: "var(--pp-text-header)", flexShrink: 0 }}
          >
            Trustless, permissionless on-chain settlement via {effectiveBrandName}. Embedded view uses a transparent background to fit host UI.
          </div>
        )}
      </div>

      {/* Footer note - non-embedded (outside container) */}
      {isClientSide && !isEmbedded && (
        <div
          className="px-4 py-2 text-[11px] opacity-80 rounded-xl mt-2 mx-auto max-w-[428px]"
          style={{ background: effectiveSecondaryColor, color: "var(--pp-text-header)" }}
        >
          Trustless, permissionless on-chain settlement via {effectiveBrandName}. Full-page view applies your configured branding and theme.
        </div>
      )}

      {/* Success Animation Overlay */}
      {paymentConfirmed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-500">
          <div className="text-center p-6 max-w-sm mx-auto">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_50px_-5px_rgba(34,197,94,0.6)] animate-in zoom-in duration-300">
                <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-2 text-white">Payment Complete!</h2>
            <div className="text-5xl font-mono font-bold mb-2 text-white tracking-tight">
              {formatCurrency(paymentConfirmed.amount, "USD")}
            </div>
            <div className="text-sm text-gray-400 mb-8">
              Transaction Confirmed
            </div>

            {paymentConfirmed.txHash && (
              <a
                href={`https://basescan.org/tx/${paymentConfirmed.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-mono transition-colors border border-white/10"
              >
                <span>View on Basescan</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
