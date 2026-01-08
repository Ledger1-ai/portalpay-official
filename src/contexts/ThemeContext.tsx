'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { useBrand } from "@/contexts/BrandContext";
import { getDefaultBrandSymbol, isBasaltSurge, resolveBrandAppLogo, resolveBrandSymbol } from "@/lib/branding";

// Blocked favicon URLs that should be replaced with fallback
const BLOCKED_FAVICON_URLS = [
  "https://portalpay-b6hqctdfergaadct.z02.azurefd.net/portalpay/uploads/a311dcf8-e6de-4eca-a39c-907b347dff11.png",
];
const BLOCKED_FAVICON_REPLACEMENT = "/Surge.png";

export function sanitizeFaviconUrl(url: string | undefined): string {
  if (!url) return '';
  const normalized = url.trim().toLowerCase();
  const isBlocked = BLOCKED_FAVICON_URLS.some(blocked => normalized === blocked.toLowerCase());
  return isBlocked ? BLOCKED_FAVICON_REPLACEMENT : url;
}

export type SiteTheme = {
  primaryColor: string;
  secondaryColor: string;
  brandLogoUrl: string;
  brandFaviconUrl: string;
  symbolLogoUrl: string;
  brandName: string;
  fontFamily: string;
  receiptBackgroundUrl: string;
  brandLogoShape: 'round' | 'square' | 'unmasked';
  textColor: string;
  headerTextColor: string;
  bodyTextColor: string;
  // Added fields propagated from /api/site/config to ensure consistent client usage
  navbarMode?: 'symbol' | 'logo';
  brandKey?: string;
  footerLogoUrl?: string;
};

type ThemeContextType = {
  theme: SiteTheme;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

const defaultTheme: SiteTheme = {
  primaryColor: '#35ff7c',
  secondaryColor: '#FF6B35',
  // Neutral defaults to avoid PortalPay flash in partner context before BrandContext loads
  brandLogoUrl: '/BasaltSurgeWideD.png',
  brandFaviconUrl: '/Surge.png',
  symbolLogoUrl: '/BasaltSurgeD.png',
  brandName: 'BasaltSurge',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  receiptBackgroundUrl: '/watermark.png',
  textColor: '#ffffff',
  headerTextColor: '#ffffff',
  bodyTextColor: '#e5e7eb',
  brandLogoShape: 'square',
  navbarMode: 'logo',
  brandKey: 'basaltsurge',
  footerLogoUrl: '',
};

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  isLoading: true,
  refetch: async () => { },
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const brand = useBrand();
  const account = useActiveAccount();
  const wallet = (account?.address || '').toLowerCase();
  const [theme, setTheme] = useState<SiteTheme>(() => ({
    ...defaultTheme,
    // Seed with container brand colors so landing page reflects merchant theme immediately
    // FORCE overrides for BasaltSurge to prevent old DB values or defaults from showing
    primaryColor: (brand as any)?.key?.toLowerCase() === 'basaltsurge' ? '#35ff7c' : (typeof (brand as any)?.colors?.primary === 'string' ? (brand as any).colors.primary : defaultTheme.primaryColor),
    secondaryColor: (brand as any)?.key?.toLowerCase() === 'basaltsurge' ? '#FF6B35' : (typeof (brand as any)?.colors?.accent === 'string' ? (brand as any).colors.accent : defaultTheme.secondaryColor),
    brandName: brand.name,
    brandFaviconUrl: sanitizeFaviconUrl(brand.logos.favicon),
    symbolLogoUrl: (brand as any)?.key?.toLowerCase() === 'basaltsurge' ? '/BasaltSurgeD.png' : String(brand.logos.symbol || brand.logos.app || ''),
    brandLogoUrl: (brand as any)?.key?.toLowerCase() === 'basaltsurge' ? '/BasaltSurgeWideD.png' : brand.logos.app,
    footerLogoUrl: (brand as any)?.logos?.footer || '',
    navbarMode: (brand as any)?.key?.toLowerCase() === 'basaltsurge' ? 'logo' : ((brand as any)?.logos?.navbarMode === 'logo' ? 'logo' : 'symbol'),
    brandKey: (brand as any)?.key || '',
  }));
  const [isLoading, setIsLoading] = useState(true);

  // Fetch theme from API
  const fetchTheme = useMemo(() => {
    return async () => {
      setIsLoading(true);
      try {
        const headers: Record<string, string> = {};
        const recipientEnv = String(process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "").toLowerCase();
        // Prefer active wallet for personal whitelabel post-login
        // For partner containers, fall back to RECIPIENT env to load default merchant theme
        // For platform container, DO NOT fall back to RECIPIENT env so platform theme is used when logged out
        let isPartner = false;
        try {
          const ct = typeof document !== "undefined"
            ? (document.documentElement.getAttribute('data-pp-container-type') || '').toLowerCase()
            : '';
          isPartner = ct === 'partner';
        } catch { }
        if (!isPartner) {
          try {
            const bk = String((brand as any)?.key || '').toLowerCase();
            isPartner = !!bk && bk !== 'portalpay' && bk !== 'basaltsurge';
          } catch { }
        }
        const useWallet = wallet || (isPartner ? recipientEnv : '');
        if (useWallet) headers['x-wallet'] = useWallet;
        headers['x-theme-caller'] = 'ThemeContext:fetchTheme';

        // Build base URL using selected wallet (if any) and append invoice=1 when requested via query (mode/layout/invoice)
        const baseUrl = useWallet ? `/api/site/config?wallet=${encodeURIComponent(useWallet)}` : `/api/site/config`;
        let urlWithParams = baseUrl;
        try {
          const loc = new URL(window.location.href);
          const invParam = String(loc.searchParams.get('invoice') || '').toLowerCase();
          const modeParam = String(loc.searchParams.get('mode') || '').toLowerCase();
          const layoutParam = String(loc.searchParams.get('layout') || '').toLowerCase();
          const useInvoice = invParam === '1' || invParam === 'true' || modeParam === 'invoice' || layoutParam === 'invoice';
          if (useInvoice) {
            urlWithParams = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}invoice=1`;
          }
        } catch { }

        // Also fetch shop config if wallet is available - shop theme takes priority for branding
        // This is READ-ONLY - we never write to shop config here
        let shopTheme: any = null;
        if (useWallet) {
          try {
            const shopRes = await fetch(`/api/shop/config?wallet=${encodeURIComponent(useWallet)}`, { cache: 'no-store' });
            if (shopRes.ok) {
              const shopData = await shopRes.json();
              const shopConfig = shopData?.config || shopData || {};
              shopTheme = shopConfig.theme || null;
              // Ensure name is carried over if not explicitly in theme
              if (shopTheme && !shopTheme.brandName && shopConfig.name) {
                shopTheme.partName = shopConfig.name; // Temporary holder
              }
            }
          } catch { /* Shop config fetch is optional */ }
        }

        // Retry/backoff on transient failures to reduce console noise during dev reloads
        let j: any = {};
        let lastErr: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await fetch(urlWithParams, { cache: 'no-store', headers });
            j = await r.json();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            const delay = attempt === 0 ? 200 : 700;
            await new Promise(res => setTimeout(res, delay));
          }
        }
        if (lastErr) {
          throw lastErr;
        }

        // Merge site config theme with shop theme - shop theme takes priority for branding
        const siteTheme = (j?.config?.theme || {}) as any;
        let mergedTheme = { ...siteTheme };


        // Detect if we're in BasaltSurge context
        const brandKey = String((brand as any)?.key || '').toLowerCase();
        const isBasaltSurgeContext = brandKey === 'basaltsurge';

        if (shopTheme) {
          // Shop theme overrides for branding elements
          // STRICT OVERRIDE: If shop theme is present, it replaces site theme branding completely
          // to avoid leaking platform (PortalPay) branding into merchant context.
          // EXCEPTION: In BasaltSurge context, skip default platform logos (cblogod.png, ppsymbol.png etc.)
          // to preserve the correct BasaltSurge branding.
          const shopLogoToUse = resolveBrandAppLogo(shopTheme.brandLogoUrl || mergedTheme.brandLogoUrl, brandKey);

          console.log('[ThemeContext DEBUG] shopTheme colors:', {
            primary: shopTheme.primaryColor,
            secondary: shopTheme.secondaryColor,
            name: shopTheme.brandName || shopTheme.name,
          });

          mergedTheme = {
            ...mergedTheme,
            primaryColor: shopTheme.primaryColor || mergedTheme.primaryColor || defaultTheme.primaryColor,
            secondaryColor: shopTheme.secondaryColor || mergedTheme.secondaryColor || defaultTheme.secondaryColor,
            brandLogoUrl: shopLogoToUse,
            brandFaviconUrl: sanitizeFaviconUrl(shopTheme.brandFaviconUrl || shopTheme.symbolLogoUrl || shopTheme.brandLogoUrl || mergedTheme.brandFaviconUrl || ''),
            symbolLogoUrl: sanitizeFaviconUrl(shopTheme.symbolLogoUrl || shopTheme.brandFaviconUrl || shopLogoToUse),
            navbarMode: (/(basalt|portal\s*pay)/i.test(String(shopTheme.brandName || shopTheme.name || shopTheme.partName || ''))) ? 'logo' : (shopTheme.navbarMode || 'symbol'),
            brandName: shopTheme.brandName || shopTheme.name || shopTheme.partName || mergedTheme.brandName || brand.name || '',
            textColor: shopTheme.textColor || mergedTheme.textColor || defaultTheme.textColor,
            fontFamily: shopTheme.fontFamily || mergedTheme.fontFamily || defaultTheme.fontFamily,
            brandLogoShape: shopTheme.logoShape || mergedTheme.brandLogoShape || defaultTheme.brandLogoShape,
            headerTextColor: shopTheme.textColor || mergedTheme.headerTextColor || defaultTheme.headerTextColor,
            bodyTextColor: shopTheme.textColor ? shopTheme.textColor : (mergedTheme.bodyTextColor || defaultTheme.bodyTextColor)

          };
        }
        // Client-side sanitization using merged theme (shop takes priority)
        const t = (() => {
          const x: any = { ...mergedTheme };
          const bKey = String((brand as any)?.key || '').toLowerCase();
          const isBS = bKey === 'basaltsurge' || bKey === 'portalpay';

          // Determine container type from DOM attribute set by RootLayout
          let isPartner = false;
          try {
            const ct = typeof document !== 'undefined'
              ? (document.documentElement.getAttribute('data-pp-container-type') || '').toLowerCase()
              : '';
            isPartner = ct === 'partner';
          } catch { }

          // Only force specific brand colors if NO customizations exist and it's THE GLOBAL config (landing page)
          // (No shopTheme and NOT a per-merchant wallet means it's likely the landing page)
          const mWallet = String((mergedTheme as any).wallet || '').toLowerCase();
          const isPerMerchant = /^0x[a-f0-9]{40}$/.test(mWallet);
          const isGlobal = !shopTheme && !isPerMerchant;

          if (isBS && isGlobal) {
            const p = String(x.primaryColor || '').toLowerCase();
            const s = String(x.secondaryColor || '').toLowerCase();
            // Force Basalt colors if it's the old defaults or empty
            const isOldDefault = !p || p === '#1f2937' || p === '#0d9488' || p === '#14b8a6' || p === '#10b981';
            const isOldAccent = !s || s === '#f54029' || s === '#2dd4bf' || s === '#22d3ee';
            if (isOldDefault) x.primaryColor = '#35ff7c';
            if (isOldAccent) x.secondaryColor = '#FF6B35';
            if (!x.brandName || x.brandName === 'PortalPay' || x.brandName === 'Basaltsurge' || x.brandName === 'BasaltSurge') {
              x.brandName = 'BasaltSurge';
            }
          }

          // Replace legacy platform logos with brand default only if NOT a custom merchant logo
          const brandKeyFinal = String((brand as any)?.key || '').toLowerCase();

          // Use our robust resolvers to clean up any legacy assets
          x.brandLogoUrl = resolveBrandAppLogo(x.brandLogoUrl, brandKeyFinal);
          x.symbolLogoUrl = resolveBrandSymbol(x.symbolLogoUrl || x.brandLogoUrl, brandKeyFinal);

          // Ensure favicon is sanitized against malicious URLs
          if (x.brandFaviconUrl) {
            x.brandFaviconUrl = sanitizeFaviconUrl(x.brandFaviconUrl);
          }
          // Also sanitize logos if they look like the blocked URL
          if (x.brandLogoUrl) x.brandLogoUrl = sanitizeFaviconUrl(x.brandLogoUrl);
          if (x.symbolLogoUrl) x.symbolLogoUrl = sanitizeFaviconUrl(x.symbolLogoUrl);

          if (x.logos) {
            x.logos.symbol = x.symbolLogoUrl;
            x.logos.app = x.brandLogoUrl;
          }

          // Clamp legacy teal defaults if they are still present
          // Only do this for global/platform defaults, NEVER for a specific shop theme (merchant might want teal)
          const isPlatform = !brandKeyFinal || brandKeyFinal === "portalpay" || brandKeyFinal === "basaltsurge";
          if (isPlatform && !shopTheme) {
            const defaultPrimary = '#35ff7c';
            const defaultAccent = '#FF6B35';
            const p = String(x.primaryColor || "").toLowerCase();
            const s = String(x.secondaryColor || "").toLowerCase();

            if (p === '#10b981' || p === '#14b8a6' || p === '#0d9488') {
              x.primaryColor = defaultPrimary;
            }
            if (s === '#2dd4bf' || s === '#22d3ee') {
              x.secondaryColor = defaultAccent;
            }
          }
          // STRICT override for BasaltSurge: Always enforce new assets
          // BUT only if we are NOT in a specific merchant context (i.e. no shopTheme loaded)
          if (isBS && !shopTheme) {
            x.primaryColor = '#35ff7c';
            x.secondaryColor = '#FF6B35';
            x.brandLogoUrl = '/BasaltSurgeWideD.png';
            x.symbolLogoUrl = '/BasaltSurgeD.png';
            if (x.logos) {
              x.logos.app = '/BasaltSurgeWideD.png';
              x.logos.symbol = '/BasaltSurgeD.png';
              x.logos.navbarMode = 'logo';
            }
            x.navbarMode = 'logo';
          }
          return x;
        })();

        setTheme({
          ...defaultTheme,
          ...t,
          // Explicitly ensure critical brand fields are reset if missing in t
          primaryColor: t.primaryColor || defaultTheme.primaryColor,
          secondaryColor: t.secondaryColor || defaultTheme.secondaryColor,
          brandLogoUrl: resolveBrandAppLogo(t.brandLogoUrl || defaultTheme.brandLogoUrl, (brand as any).key),
          symbolLogoUrl: resolveBrandSymbol(t.symbolLogoUrl || defaultTheme.symbolLogoUrl, (brand as any).key),
          brandName: t.brandName || defaultTheme.brandName,
          // Preserve container-specifics if needed, or re-calculate?
          // navbarMode and footerLogoUrl are in t or defaultTheme
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pp:theme:ready', { detail: t }));
          window.dispatchEvent(new CustomEvent('pp:theme:updated', { detail: t }));
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch theme:', error);
        setIsLoading(false);
      }
    };
  }, [wallet, brand.key, brand.name]);

  // Initial fetch
  // Do NOT fetch any theme on portal or shop routes — those pages are the sole source of truth for their themes.
  // This prevents accidental cross-wallet theme pulls and eliminates extra /api/site/config calls.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const path = url.pathname || "";
      if (path.startsWith("/portal") || path.startsWith("/shop")) {
        setIsLoading(false);
        return;
      }
    } catch { }
    fetchTheme();
  }, [fetchTheme]);

  // Sync CSS variables on :root when theme changes
  useEffect(() => {
    try {
      const root = document.documentElement;

      // CRITICAL GUARD: Never override portal/shop merchant themes
      // Check hardlock first - if merchant hardlock is set, portal/shop owns the theme
      const hardLock = root.getAttribute('data-pp-theme-hardlock');
      if (hardLock === 'merchant') {
        return; // Portal/Shop has exclusive control
      }

      // Never override theme on Portal or Shop routes; those pages manage their theme lifecycle
      try {
        const url = new URL(window.location.href);
        const path = url.pathname || '';
        if (path.startsWith('/portal') || path.startsWith('/shop')) {
          return;
        }
      } catch { }

      // Check theme lock
      const lock = root.getAttribute('data-pp-theme-lock') || 'user';
      // Allow brand theme to override unless explicitly hardlocked for merchant,
      // or hardlocked for portalpay default while the current brand IS portalpay
      if (lock === 'merchant' || (lock === 'portalpay-default' && String(brand?.key || '').toLowerCase() === 'portalpay')) {
        return; // Don't override these locks in their legitimate scopes
      }

      // Check if merchant theme stage is active
      const stage = root.getAttribute('data-pp-theme-stage') || '';
      const merchantAvailable = root.getAttribute('data-pp-theme-merchant-available');
      if (stage === 'merchant' || merchantAvailable === '1') {
        return; // Merchant theme is active, don't override
      }

      const setVar = (key: string, val?: string) => {
        if (!val) return;
        root.style.setProperty(key, val);
      };

      setVar('--pp-primary', theme.primaryColor);
      setVar('--pp-secondary', theme.secondaryColor);
      setVar('--pp-text', theme.headerTextColor || theme.textColor);
      setVar('--pp-text-header', theme.headerTextColor || theme.textColor);
      setVar('--pp-text-body', theme.bodyTextColor);
      setVar('--primary', theme.primaryColor);
      // Ensure text on primary surfaces uses merchant-provided contrast color
      setVar('--primary-foreground', theme.headerTextColor || theme.textColor || '#ffffff');

      // Sync secondary colors for broader utility usage
      setVar('--secondary', theme.secondaryColor);
      setVar('--secondary-foreground', '#ffffff');

      if (typeof theme.fontFamily === 'string' && theme.fontFamily.trim().length > 0) {
        setVar('--pp-font', theme.fontFamily);
      }

      // Notify external subscribers (like Thirdweb theme reactive handlers)
      try {
        window.dispatchEvent(new CustomEvent('pp:theme:updated', { detail: { ...theme } }));
        window.dispatchEvent(new CustomEvent('pp:theme:ready', { detail: { ...theme } }));
      } catch { }
    } catch { }
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      isLoading,
      refetch: fetchTheme,
    }),
    [theme, isLoading, fetchTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
