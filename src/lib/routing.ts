/**
 * Shared routing logic for middleware and client components.
 * Used to identify vanity slugs and exclude system routes.
 */

export const EXCLUDE_PREFIXES = new Set<string>([
    "", // root "/"
    "_next",
    "api",
    "admin",
    "analytics",
    "audio-setup",
    "shop", // exclude builder route from vanity slug rewrite
    "cblink-setup",
    "console",
    "defi",
    "developers",
    "docs", // documentation routes
    "extension",
    "faq",
    "get-started", // get started landing page
    "leaderboard",
    "live",
    "kiosk", // kiosk mode
    "msa", // Master Services Agreement signing page
    "msas", // Master Services Agreement with special terms
    "portal",
    "pricing",
    "profile",
    "partners",
    "subscribe",
    "support",
    "u",
    "terminal",
    "iso-demo", // ISO demo terminal with bps + fixed fee display
    "vs", // comparison landing pages
    "crypto-payments", // industry landing pages
    "locations", // location landing pages
    "pms", // PMS routes
    "favicon.ico",
    "globals.css",
    "robots.txt",
    "sitemap.xml",
    "opengraph-image",
    "opengraph-image.png",
    "twitter-image",
    ".well-known",
]);

export function isCandidateSlug(pathname: string): string | null {
    try {
        // Normalize
        let p = pathname || "/";
        // Strip leading slash
        if (p.startsWith("/")) p = p.slice(1);
        // Ignore nested paths like /a/b — only root-level segment
        const segs = p.split("/").filter(Boolean);
        if (segs.length !== 1) return null;

        const seg = segs[0];

        // Exclude known prefixes and assets
        if (EXCLUDE_PREFIXES.has(seg)) return null;
        if (seg.includes(".")) return null; // likely an asset like file.ext

        // Allow only [a-z0-9-]
        const cleaned = seg.toLowerCase().replace(/[^a-z0-9\-]/g, "").replace(/^-+|-+$/g, "");
        if (!cleaned) return null;

        return cleaned.slice(0, 32);
    } catch {
        return null;
    }
}
