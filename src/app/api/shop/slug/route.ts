import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getBrandKey } from "@/config/brands";

const DOC_ID = "shop:config";

/**
 * Get brand-scoped document ID for shop config.
 * Platform (portalpay) uses legacy "shop:config", partners use "shop:config:{brandKey}".
 */
function getDocIdForBrand(brandKey?: string): string {
  try {
    const key = String(brandKey || "").toLowerCase();
    if (!key || key === "portalpay" || key === "basaltsurge") return DOC_ID;
    return `${DOC_ID}:${key}`;
  } catch {
    return DOC_ID;
  }
}

function cleanSlug(input: any): string {
  const s = String(input || "").toLowerCase().trim();
  if (!s) return "";
  // allow a-z 0-9, hyphen, and dot (for domains), trim leading/trailing hyphens/dots
  const cleaned = s.replace(/[^a-z0-9\-\.]/g, "").replace(/^[-\.]+|[-\.]+$/g, "");
  return cleaned.slice(0, 64); // Increased length for domains
}

function validateWallet(raw: any): string {
  const w = String(raw || "").toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(w) ? w : "";
}

/**
 * Reserved slugs that must never be claimed by shops,
 * to avoid conflicts with top-level routes and system paths.
 */
const RESERVED_SLUGS = new Set<string>([
  "admin",
  "console",
  "developers",
  "developer",
  "docs",
  "doc",
  "shop",
  "portal",
  "terminal",
  "vs",
  "locations",
  "crypto-payments",
  "get-started",
  "faq",
  "u",
  "api",
  "og-image",
  "robots",
  "sitemap",
  "favicon",
  "team",
  "industry-packs",
  "analytics",
  "leaderboard",
  "inventory",
  "orders",
  "receipts",
  "reviews",
  "site",
  "platform",
  "partners",
  "billing",
  "merchants",
  "users",
  "auth",
  "test"
]);
function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const rawSlug = url.searchParams.get("slug") || "";
    const slug = cleanSlug(rawSlug);
    if (!slug) {
      return NextResponse.json(
        { error: "invalid_slug" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }
    // Reserved slugs are not available for shops
    if (isReservedSlug(slug)) {
      return NextResponse.json(
        { available: false, reserved: true },
        { headers: { "x-correlation-id": correlationId } }
      );
    }

    let brandKey: string | undefined = undefined;
    try {
      brandKey = getBrandKey();
    } catch {
      brandKey = undefined;
    }
    let normalizedBrand = String(brandKey || "portalpay").toLowerCase();
    if (normalizedBrand === "basaltsurge") normalizedBrand = "portalpay";

    try {
      const c = await getContainer();
      // Check slug availability within this brand's namespace only.
      // For platform (portalpay): check docs without brandKey OR with brandKey='portalpay'
      // For partners: check docs with explicit brandKey matching this container
      const spec = normalizedBrand === "portalpay"
        ? {
          query:
            "SELECT TOP 1 c.wallet, c.slug, c.brandKey, c.customDomain, c.customDomainVerified FROM c WHERE c.type='shop_config' AND (c.slug=@slug OR (c.customDomain=@slug AND c.customDomainVerified=true)) AND (NOT IS_DEFINED(c.brandKey) OR c.brandKey=@brandKey OR c.brandKey='')",
          parameters: [
            { name: "@slug", value: slug },
            { name: "@brandKey", value: normalizedBrand },
          ],
        }
        : {
          query:
            "SELECT TOP 1 c.wallet, c.slug, c.brandKey, c.customDomain, c.customDomainVerified FROM c WHERE c.type='shop_config' AND (c.slug=@slug OR (c.customDomain=@slug AND c.customDomainVerified=true)) AND c.brandKey=@brandKey",
          parameters: [
            { name: "@slug", value: slug },
            { name: "@brandKey", value: normalizedBrand },
          ],
        };
      const { resources } = await c.items.query(spec as any).fetchAll();
      const row = Array.isArray(resources) && resources.length ? resources[0] : null;

      // If we found a match
      if (row) {
        // If the input was a domain (contains dot), return the wallet/slug associated with it
        if (slug.includes(".")) {
          return NextResponse.json(
            { available: false, wallet: String(row.wallet || ""), slug: String(row.slug || ""), brandKey: normalizedBrand, isCustomDomain: true },
            { headers: { "x-correlation-id": correlationId } }
          );
        }
        // If exact slug match
        if (String(row.slug || "") === slug) {
          return NextResponse.json(
            { available: false, wallet: String(row.wallet || ""), brandKey: normalizedBrand },
            { headers: { "x-correlation-id": correlationId } }
          );
        }
      }
      return NextResponse.json(
        { available: true, brandKey: normalizedBrand },
        { headers: { "x-correlation-id": correlationId } }
      );
    } catch (e: any) {
      // Degraded: if DB unavailable, cannot determine uniqueness
      return NextResponse.json(
        { degraded: true, reason: e?.message || "cosmos_unavailable", unknown: true },
        { status: 503, headers: { "x-correlation-id": correlationId } }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500, headers: { "x-correlation-id": correlationId } }
    );
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const body = (await req.json().catch(() => ({}))) as { slug?: string };
    const url = new URL(req.url);
    const slugParam = url.searchParams.get("slug") || "";
    const slug = cleanSlug(body.slug || slugParam);
    const headerWallet = String(req.headers.get("x-wallet") || "");
    const wallet = validateWallet(headerWallet);
    if (!wallet) {
      return NextResponse.json(
        { error: "wallet_required" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }
    if (!slug) {
      return NextResponse.json(
        { error: "invalid_slug" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }
    if (isReservedSlug(slug)) {
      return NextResponse.json(
        { error: "reserved_slug" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Determine brand key for brand-scoped slug namespace
    let brandKey: string | undefined = undefined;
    try {
      brandKey = getBrandKey();
    } catch {
      brandKey = undefined;
    }
    let normalizedBrand = String(brandKey || "portalpay").toLowerCase();
    if (normalizedBrand === "basaltsurge") normalizedBrand = "portalpay";
    const docId = getDocIdForBrand(normalizedBrand);

    const c = await getContainer();

    // Check if slug is already taken by another wallet within this brand's namespace
    try {
      const spec = normalizedBrand === "portalpay"
        ? {
          query:
            "SELECT TOP 1 c.wallet, c.slug, c.brandKey FROM c WHERE c.type='shop_config' AND c.slug=@slug AND (NOT IS_DEFINED(c.brandKey) OR c.brandKey=@brandKey OR c.brandKey='')",
          parameters: [
            { name: "@slug", value: slug },
            { name: "@brandKey", value: normalizedBrand },
          ],
        }
        : {
          query:
            "SELECT TOP 1 c.wallet, c.slug, c.brandKey FROM c WHERE c.type='shop_config' AND c.slug=@slug AND c.brandKey=@brandKey",
          parameters: [
            { name: "@slug", value: slug },
            { name: "@brandKey", value: normalizedBrand },
          ],
        };
      const { resources } = await c.items.query(spec as any).fetchAll();
      const row = Array.isArray(resources) && resources.length ? resources[0] : null;
      if (row && String(row.wallet || "").toLowerCase() !== wallet) {
        return NextResponse.json(
          { ok: false, error: "slug_taken", brandKey: normalizedBrand },
          { status: 409, headers: { "x-correlation-id": correlationId } }
        );
      }
      // If row exists and is the same wallet, it's already reserved; treat as ok
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, degraded: true, reason: e?.message || "cosmos_unavailable" },
        { status: 503, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Upsert the per-wallet shop_config document and set slug.
    try {
      // Attempt to read existing config for this wallet (brand-scoped)
      let prev: any = null;
      try {
        const { resource } = await c.item(docId, wallet).read<any>();
        prev = resource;
      } catch {
        prev = null;
      }

      const now = Date.now();
      // Minimal defaults if none exist
      const base = prev && typeof prev === "object" ? prev : {
        id: docId,
        wallet,
        type: "shop_config",
        brandKey: normalizedBrand,
        name: "",
        description: "",
        bio: "",
        theme: {
          primaryColor: "#0ea5e9",
          secondaryColor: "#22c55e",
          textColor: "#0b1020",
          accentColor: "#f59e0b",
          brandLogoUrl: "/BasaltSurgeWideD.png",
          coverPhotoUrl: "",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        },
        arrangement: "grid",
        createdAt: now,
      };

      const doc = {
        ...base,
        id: docId,
        wallet,
        type: "shop_config",
        brandKey: normalizedBrand,
        slug,
        updatedAt: now,
      };

      await c.items.upsert(doc as any);
      return NextResponse.json(
        { ok: true, slug, wallet, brandKey: normalizedBrand },
        { headers: { "x-correlation-id": correlationId } }
      );
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, degraded: true, reason: e?.message || "cosmos_unavailable" },
        { status: 503, headers: { "x-correlation-id": correlationId } }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500, headers: { "x-correlation-id": correlationId } }
    );
  }
}
