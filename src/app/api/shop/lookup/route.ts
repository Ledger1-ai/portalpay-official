import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getBrandKey } from "@/config/brands";

// GET /api/shop/lookup?wallet=0x...
// Returns the shop slug for a given merchant wallet
export async function GET(req: NextRequest) {
    try {
        const wallet = req.nextUrl.searchParams.get("wallet");

        if (!wallet) {
            return NextResponse.json({ ok: false, error: "Missing wallet parameter" }, { status: 400 });
        }

        const normalizedWallet = wallet.toLowerCase();
        const container = await getContainer();

        // Get the current brand key
        let brandKey = "basaltsurge";
        try {
            brandKey = getBrandKey() || "basaltsurge";
        } catch {
            brandKey = "basaltsurge";
        }
        const targetBrand = brandKey.toLowerCase();

        // Query ALL shop configs for this wallet to see what's available
        // We'll filter in code to be safe and to debug
        const { resources } = await container.items
            .query({
                query: "SELECT c.slug, c.name, c.brandKey FROM c WHERE c.type = 'shop_config' AND c.wallet = @wallet AND c.slug != null",
                parameters: [
                    { name: "@wallet", value: normalizedWallet }
                ]
            })
            .fetchAll();

        console.log("[shop/lookup] raw resources:", resources);
        console.log("[shop/lookup] target brand:", targetBrand);

        if (resources.length === 0) {
            return NextResponse.json({ ok: false, error: "No shop found for this wallet" }, { status: 404 });
        }

        // Find best match
        // 1. Exact brand match
        let match = resources.find((r: any) => (r.brandKey || "").toLowerCase() === targetBrand);

        // 2. If target is portalpay, allow null/undefined brandKey
        if (!match && targetBrand === "portalpay") {
            match = resources.find((r: any) => !r.brandKey);
        }

        // 3. If still no match, and we have results, maybe just return the first one?
        // For now, let's be strict but if we have 'genrevo' and it's missing brandKey, it might be caught by #2
        // If the user has a shop on another brand, we probably shouldn't link to it from this admin panel unless we want to cross-link.
        // Let's fallback to the first one if only one exists, to be helpful.
        if (!match && resources.length === 1) {
            match = resources[0];
        }

        if (match && match.slug) {
            return NextResponse.json({
                ok: true,
                slug: match.slug,
                name: match.name || null,
                brandKey: match.brandKey // for debugging
            });
        }

        return NextResponse.json({ ok: false, error: "No matching shop found for this brand" }, { status: 404 });
    } catch (e: any) {
        console.error("Shop lookup error:", e);
        return NextResponse.json({ ok: false, error: e?.message || "Failed to lookup shop" }, { status: 500 });
    }
}
