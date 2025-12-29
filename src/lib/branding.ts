/**
 * Centralized branding helpers to surgically resolve BasaltSurge vs PortalPay defaults.
 * This ensures we never accidentally fall back to "portalpay" hardcoded strings when
 * we should be showing BasaltSurge.
 */

export function getEffectiveBrandKey(): string {
    // 1. Check public environment variable (available on client & server)
    const envKey = (process.env.NEXT_PUBLIC_BRAND_KEY || "").trim().toLowerCase();
    if (envKey) return envKey;

    // 2. Check server-only environment variable
    if (typeof process !== "undefined" && process.env.BRAND_KEY) {
        return process.env.BRAND_KEY.trim().toLowerCase();
    }

    // 3. Client-side hostname check (last resort for static builds/hydration)
    if (typeof window !== "undefined") {
        const host = window.location.host.toLowerCase();
        if (host.includes("basalt") || host.includes("surge")) {
            return "basaltsurge";
        }
    }

    return "portalpay";
}

export function isBasaltSurge(key?: string): boolean {
    const k = (key || getEffectiveBrandKey()).toLowerCase();
    return k === "basaltsurge";
}

export function getDefaultBrandSymbol(key?: string): string {
    return isBasaltSurge(key) ? "/BasaltSurgeD.png" : "/ppsymbol.png";
}

export function getDefaultBrandName(key?: string): string {
    return isBasaltSurge(key) ? "BasaltSurge" : "PortalPay";
}

/**
 * Resolves a logo source, falling back to the correct brand default.
 * Two-state model: Trust the source URL if provided, otherwise return brand default.
 * No blocking - the data source (site config or shop config) is responsible for correct values.
 */
export function resolveBrandSymbol(src?: string | null, brandKey?: string): string {
    const s = String(src || "").trim();
    if (s) return s; // Trust the source - no blocking
    return getDefaultBrandSymbol(brandKey);
}

export function resolveBrandAppLogo(src?: string | null, brandKey?: string): string {
    const s = String(src || "").trim();
    if (s) return s; // Trust the source - no blocking
    return getDefaultBrandSymbol(brandKey);
}
