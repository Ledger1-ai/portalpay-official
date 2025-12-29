/**
 * Shared brand config utilities for server-side use.
 * Provides direct Cosmos DB access without HTTP fetches to avoid cascading API calls.
 */

import { getContainer } from "@/lib/cosmos";
import { applyBrandDefaults, type BrandConfig, type ApimCatalogEntry, type BrandColors, type BrandLogos, type BrandMeta } from "@/config/brands";

// Known partner brand patterns - hostname prefixes that map to partner brand keys
const KNOWN_PARTNER_PATTERNS: Record<string, string> = {
  paynex: "paynex",
  xoinpay: "xoinpay",
  icunow: "icunow-store",
  // Add more partner brands here as needed
};

// Main platform hostnames that should NOT be treated as partner containers (without subdomains)
const PLATFORM_HOSTNAMES = [
  "portalpay.app",
  "www.portalpay.app",
  "portalpay.azurewebsites.net",
];

export type ContainerIdentity = {
  containerType: "platform" | "partner";
  brandKey: string;
};

export type BrandConfigDoc = {
  id: string; // "brand:config"
  wallet: string; // partition key = brandKey
  type: "brand_config";
  // Theme and identity
  name?: string;
  colors?: BrandColors;
  logos?: BrandLogos;
  meta?: BrandMeta;
  // Routing and fees
  appUrl?: string;
  platformFeeBps?: number;
  partnerFeeBps?: number;
  defaultMerchantFeeBps?: number;
  // Partner Split config
  partnerWallet?: string;
  // APIM product aliasing/curation
  apimCatalog?: ApimCatalogEntry[];
  // Container Apps deployment status for Partners panel
  containerAppName?: string;
  containerFqdn?: string;
  containerResourceId?: string;
  containerState?: string;
  updatedAt?: number;
};

/**
 * Derive container identity (brandKey and containerType) from hostname.
 * This is a pure function with no HTTP calls - can be used server-side safely.
 */
export function deriveContainerIdentityFromHostname(host: string): ContainerIdentity | null {
  if (!host) return null;

  // Remove port number if present (e.g., localhost:3001 -> localhost)
  const hostLower = host.toLowerCase().split(":")[0];

  // Check if this is a main platform hostname (exact match or subdomain)
  for (const platformHost of PLATFORM_HOSTNAMES) {
    if (hostLower === platformHost || hostLower.endsWith(`.${platformHost}`)) {
      return { brandKey: "portalpay", containerType: "platform" };
    }
  }

  // Handle localhost with subdomains for development testing
  // e.g., paynex.localhost:3001 -> brandKey: paynex, containerType: partner
  if (hostLower === "localhost" || hostLower === "127.0.0.1") {
    // Plain localhost without subdomain - use env vars (handled by caller)
    return null;
  }

  if (hostLower.endsWith(".localhost") || hostLower.endsWith(".127.0.0.1")) {
    const parts = hostLower.split(".");
    const candidate = parts[0];
    if (candidate && candidate.length > 0 && candidate !== "www") {
      // Check known partner patterns first
      if (KNOWN_PARTNER_PATTERNS[candidate]) {
        return { brandKey: KNOWN_PARTNER_PATTERNS[candidate], containerType: "partner" };
      }
      // Allow any subdomain on localhost for testing
      return { brandKey: candidate, containerType: "partner" };
    }
  }

  // Extract potential brand key from hostname
  // Patterns: <brandKey>.azurewebsites.net, <brandKey>.payportal.co, <brandKey>.<domain>
  const parts = hostLower.split(".");
  if (parts.length >= 2) {
    const candidate = parts[0];

    // Check known partner patterns
    if (KNOWN_PARTNER_PATTERNS[candidate]) {
      return { brandKey: KNOWN_PARTNER_PATTERNS[candidate], containerType: "partner" };
    }

    // For Azure Container Apps and custom domains, derive from subdomain
    // e.g., paynex.azurewebsites.net -> paynex
    // e.g., xoinpay.payportal.co -> xoinpay
    if (candidate && candidate.length > 2 && !["www", "api", "admin"].includes(candidate)) {
      const isAzure = hostLower.endsWith(".azurewebsites.net") || hostLower.endsWith(".azurecontainerapps.io");
      const isPayportal = hostLower.endsWith(".payportal.co") || hostLower.endsWith(".portalpay.app");

      if (isAzure || isPayportal) {
        return { brandKey: candidate, containerType: "partner" };
      }
    }
  }

  return null;
}

/**
 * Get container identity from environment variables and/or hostname.
 * No HTTP calls - uses direct env reads and hostname parsing.
 */
export function getContainerIdentity(host?: string): ContainerIdentity {
  // Detect from runtime env first (preferred)
  let containerType = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "").toLowerCase();
  let brandKey = String(process.env.NEXT_PUBLIC_BRAND_KEY || process.env.BRAND_KEY || "").toLowerCase();

  // If brandKey is empty, try to derive from hostname
  if (!brandKey && host) {
    const derived = deriveContainerIdentityFromHostname(host);

    if (derived) {
      brandKey = derived.brandKey;
      // Only override containerType if it wasn't explicitly set in env
      if (!containerType) {
        containerType = derived.containerType;
      }
    }
  }

  // Default containerType to "platform" if still empty
  if (!containerType) {
    containerType = "platform";
  }

  // Default brandKey to environment variable or portalpay if still empty
  if (!brandKey) {
    brandKey = String(process.env.NEXT_PUBLIC_BRAND_KEY || process.env.BRAND_KEY || "portalpay").toLowerCase();
  }

  return {
    containerType: containerType as "platform" | "partner",
    brandKey,
  };
}

/**
 * Read brand overrides directly from Cosmos DB.
 * No HTTP calls - direct database access.
 */
export async function readBrandOverridesFromCosmos(brandKey: string): Promise<BrandConfigDoc | null> {
  try {
    const c = await getContainer();
    const { resource } = await c.item("brand:config", brandKey).read<BrandConfigDoc>();
    return resource || null;
  } catch {
    return null;
  }
}

// In-memory cache for brand config to prevent excessive Cosmos reads
const brandConfigCache: Record<string, { data: BrandConfigDoc | null; ts: number }> = {};
const BRAND_CONFIG_CACHE_TTL = 30_000; // 30 seconds

/**
 * Read brand overrides with in-memory caching.
 * Reduces Cosmos DB reads for frequently accessed brand configs.
 */
export async function readBrandOverridesCached(brandKey: string): Promise<BrandConfigDoc | null> {
  const key = String(brandKey || "").toLowerCase();
  const now = Date.now();
  const cached = brandConfigCache[key];

  if (cached && (now - cached.ts) < BRAND_CONFIG_CACHE_TTL) {
    return cached.data;
  }

  const data = await readBrandOverridesFromCosmos(key);
  brandConfigCache[key] = { data, ts: Date.now() };
  return data;
}

/**
 * Invalidate the brand config cache for a specific key.
 * Call this after PATCH operations.
 */
export function invalidateBrandConfigCache(brandKey: string): void {
  const key = String(brandKey || "").toLowerCase();
  delete brandConfigCache[key];
}

/**
 * Convert brand overrides to an effective BrandConfig with defaults applied.
 */
export function toEffectiveBrand(brandKey: string, overrides?: Partial<BrandConfigDoc> | null): BrandConfig {
  // Always use a neutral stub - brand values should come from Cosmos DB overrides, not static BRANDS map.
  // This ensures new partners can be added purely through the DB without updating static code.
  const key = String(brandKey || "").toLowerCase();
  const baseRaw: BrandConfig = {
    key,
    name: key ? key.charAt(0).toUpperCase() + key.slice(1) : "", // Titleized key as placeholder
    colors: key === "basaltsurge" ? { primary: "#22C55E", accent: "#16A34A" } : { primary: "#0a0a0a", accent: "#6b7280" }, // Neutral dark colors
    logos: { app: key === "basaltsurge" ? "/BasaltSurgeWideD.png" : "", favicon: "/api/favicon" }, // Use dynamic favicon endpoint
    meta: {},
    appUrl: undefined,
    platformFeeBps: 50,
    partnerFeeBps: 0,
    defaultMerchantFeeBps: 0,
    partnerWallet: "",
    apimCatalog: [],
  };

  const withDefaults = applyBrandDefaults(baseRaw);
  if (!overrides) return withDefaults;

  const merged: BrandConfig = applyBrandDefaults({
    ...withDefaults,
    name: typeof overrides.name === "string" ? overrides.name : withDefaults.name,
    colors: typeof overrides.colors === "object"
      ? {
        primary: typeof overrides.colors?.primary === "string" ? overrides.colors.primary : withDefaults.colors.primary,
        accent: typeof overrides.colors?.accent === "string" ? overrides.colors.accent! : withDefaults.colors.accent,
      }
      : withDefaults.colors,
    logos: typeof overrides.logos === "object"
      ? {
        app: typeof overrides.logos?.app === "string" ? overrides.logos.app : withDefaults.logos.app,
        favicon: typeof overrides.logos?.favicon === "string" ? overrides.logos.favicon : withDefaults.logos.favicon,
        symbol: typeof overrides.logos?.symbol === "string" ? overrides.logos.symbol : withDefaults.logos.symbol,
        footer: typeof overrides.logos?.footer === "string" ? overrides.logos.footer : withDefaults.logos.footer,
        navbarMode:
          (overrides.logos as any)?.navbarMode === "logo" || (overrides.logos as any)?.navbarMode === "symbol"
            ? (overrides.logos as any).navbarMode
            : (withDefaults as any)?.logos?.navbarMode,
      }
      : withDefaults.logos,
    meta: typeof overrides.meta === "object"
      ? {
        ogTitle: typeof overrides.meta?.ogTitle === "string" ? overrides.meta.ogTitle : withDefaults.meta?.ogTitle,
        ogDescription: typeof overrides.meta?.ogDescription === "string" ? overrides.meta.ogDescription : withDefaults.meta?.ogDescription,
      }
      : withDefaults.meta,
    appUrl: overrides.appUrl ?? withDefaults.appUrl,
    platformFeeBps: typeof overrides.platformFeeBps === "number" ? overrides.platformFeeBps : withDefaults.platformFeeBps,
    partnerFeeBps: typeof overrides.partnerFeeBps === "number" ? overrides.partnerFeeBps : withDefaults.partnerFeeBps,
    defaultMerchantFeeBps: typeof overrides.defaultMerchantFeeBps === "number" ? overrides.defaultMerchantFeeBps : withDefaults.defaultMerchantFeeBps,
    partnerWallet: typeof overrides.partnerWallet === "string" ? overrides.partnerWallet : (withDefaults as any).partnerWallet,
    apimCatalog: Array.isArray(overrides.apimCatalog) ? overrides.apimCatalog : withDefaults.apimCatalog,
  });

  // FORCE override for BasaltSurge to ensure new branding assets are used
  // This protections prevents old DB configs from reverting the hardcoded improvements
  if (key === "basaltsurge") {
    merged.colors.primary = "#35ff7c";
    merged.colors.accent = "#FF6B35";
    merged.logos.app = "/BasaltSurgeWideD.png";
    merged.logos.symbol = "/BasaltSurgeD.png";
    merged.logos.og = "/BasaltSurgeD.png";
    merged.logos.twitter = "/BasaltSurgeD.png";
    (merged.logos as any).navbarMode = "logo";
  }

  return merged;
}

/**
 * Get full brand config with overrides from Cosmos DB (cached).
 * This is the main entry point for getting brand config without HTTP calls.
 */
export async function getBrandConfigFromCosmos(brandKey: string): Promise<{ brand: BrandConfig; overrides: BrandConfigDoc | null }> {
  const key = String(brandKey || "").toLowerCase();
  const overrides = await readBrandOverridesCached(key);
  const brand = toEffectiveBrand(key, overrides);
  return { brand, overrides };
}
