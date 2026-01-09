import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * X Shopping Platform Config (Brand-Specific)
 * Stored under `xshopping_platform_config:{brandKey}`
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ brandKey: string }> }) {
    try {
        const { brandKey } = await params;
        const normalizedBrandKey = brandKey.toLowerCase();

        // Allow admin or partner access - strict admin check might be too restrictive if partners need to read their own config
        // For now, keeping consistent with other admin routes
        const auth = await requireThirdwebAuth(req);
        if (!auth.roles.includes("admin")) {
            // Allow if it's the partner accessing their own brand? 
            // Current auth pattern usually checks roles or wallet match. 
            // For simplicity in this iteration, we assume admin role or valid partner signature is handled by requireThirdwebAuth or upstream middleware if present. 
            // Just proceeding with admin check for SAFETY first.
            if (!auth.roles.includes("admin")) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }

        const container = await getContainer();
        // ID format: xshopping_platform_config:basaltsurge
        const docId = `xshopping_platform_config:${normalizedBrandKey}`;

        // Partition key is still 'portalpay' for platform-level configs? 
        // OR should it be the brandKey? 
        // Previous global config used 'portalpay'. 
        // For brand isolation, usually we partition by brand? 
        // However, 'xshopping_platform_config' implies a platform-wide setting tailored for a brand.
        // Let's stick to 'portalpay' partition for platform-owned configs about brands, 
        // OR use the brandKey as partition if this is "Brand Config".
        // Looking at Shopify: `shopify_plugin_config:${brandKey}` with partition `${brandKey}`.
        // We will follow Shopify pattern: partitionKey = brandKey.
        let resource: any = null;
        try {
            const response = await container.item(docId, normalizedBrandKey).read();
            resource = response.resource;
        } catch (e: any) {
            // 404 is expected if not found
            if (e.code !== 404) throw e;
        }

        return NextResponse.json({ config: resource || { enabled: false } });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brandKey: string }> }) {
    try {
        const { brandKey } = await params;
        const normalizedBrandKey = brandKey.toLowerCase();

        const auth = await requireThirdwebAuth(req);
        if (!auth.roles.includes("admin")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { enabled } = await req.json();

        const container = await getContainer();
        const docId = `xshopping_platform_config:${normalizedBrandKey}`;

        // Fetch existing using query to be safe or just read
        let existing: any = null;
        try {
            const response = await container.item(docId, normalizedBrandKey).read();
            existing = response.resource;
        } catch (e: any) {
            if (e.code !== 404) throw e;
        }

        const doc = {
            ...(existing || {}),
            id: docId,
            partitionKey: normalizedBrandKey,
            wallet: normalizedBrandKey, // Associate with brand wallet logic if needed, or just use brandKey
            enabled,
            updatedAt: Date.now(),
            updatedBy: auth.wallet
        };

        await container.items.upsert(doc);

        return NextResponse.json({ success: true, ok: true });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
