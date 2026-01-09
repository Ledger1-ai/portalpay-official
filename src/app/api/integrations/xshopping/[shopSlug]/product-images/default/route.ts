
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import sharp from "sharp";
import { createMeshGradient } from "@/lib/og-image-utils";
import { fetchImageAsBuffer } from "@/lib/og-asset-loader";

export const runtime = 'nodejs'; // sharp needs nodejs

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopSlug: string }> }) {
    try {
        const { shopSlug } = await params;

        // Normalize basaltsurge -> portalpay
        const effectiveSlug = shopSlug.toLowerCase() === 'basaltsurge' ? 'portalpay' : shopSlug.toLowerCase();

        const container = await getContainer();
        const { resources: shops } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true)",
                parameters: [{ name: "@slug", value: effectiveSlug }]
            })
            .fetchAll();

        const shop = shops[0];

        if (!shop) {
            return new NextResponse("Shop not found", { status: 404 });
        }

        // 1. Prepare Background
        // Priority: Shop Banner -> Brand Gradient -> Default Gradient
        let bgBuffer: Buffer | null = null;

        // Try fetching banner
        if (shop.assets?.bannerUrl) {
            bgBuffer = await fetchImageAsBuffer(shop.assets.bannerUrl);
        }

        // If no banner or fetch failed, generate gradient
        if (!bgBuffer) {
            const primary = shop.palette?.primary || '#0ea5e9';
            const accent = shop.palette?.accent || '#3b82f6';
            // Generate a 3rd color shift
            const colors = [primary, accent, '#8b5cf6'];
            const svg = createMeshGradient(colors, 800, 800); // Square-ish for product images
            bgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
        } else {
            // Resize banner to cover 800x800 square
            bgBuffer = await sharp(bgBuffer)
                .resize(800, 800, { fit: 'cover' })
                .png()
                .toBuffer();
        }

        // 2. Prepare Logo Overlay
        let logoBuffer: Buffer | null = null;
        const iconUrl = shop.assets?.iconUrl || shop.assets?.squareIconUrl || shop.assets?.logoUrl;

        if (iconUrl) {
            logoBuffer = await fetchImageAsBuffer(iconUrl);
        }

        if (logoBuffer) {
            // Resize logo to fitting size (e.g. 200x200)
            const logoResized = await sharp(logoBuffer)
                .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            // Composite logo onto center of background
            bgBuffer = await sharp(bgBuffer)
                .composite([{ input: logoResized, gravity: 'center' }])
                .png()
                .toBuffer();
        }

        return new NextResponse(new Uint8Array(bgBuffer), {
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "public, max-age=86400"
            }
        });

    } catch (error) {
        console.error("Error generating product image:", error);
        return new NextResponse("Error generating image", { status: 500 });
    }
}
