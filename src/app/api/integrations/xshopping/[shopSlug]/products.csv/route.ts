
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

// Helper to escape CSV fields
function csvEscape(field: any): string {
    const stringValue = String(field || "").trim();
    if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ shopSlug: string }> }) {
    try {
        const { shopSlug } = await params;
        if (!shopSlug) {
            return new NextResponse("Missing shop slug", { status: 400 });
        }

        const container = await getContainer();

        // 1. Resolve Shop Slug (Normalize basaltsurge -> portalpay)
        const effectiveSlug = shopSlug.toLowerCase() === 'basaltsurge' ? 'portalpay' : shopSlug.toLowerCase();

        const { resources: shops } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true)",
                parameters: [{ name: "@slug", value: effectiveSlug }]
            })
            .fetchAll();

        const shop = shops[0];

        // If no shop found, and it's a known brand key like 'portalpay', we might want to fallback or check generic brand config?
        // But the user requested "only pulls that shops inventory".
        if (!shop || !shop.wallet) {
            // Debug: check if there's a fallback or if this is a platform test
            // For now, return 404 to respect "only pulls that shops inventory"
            return new NextResponse(`Shop not found or wallet missing for slug: ${effectiveSlug}`, { status: 404 });
        }

        const wallet = shop.wallet;

        // 2. Fetch Inventory Items for this Wallet
        const { resources: items } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.type='inventory_item' AND c.wallet=@wallet",
                parameters: [{ name: "@wallet", value: wallet }]
            })
            .fetchAll();

        // 3. Generate CSV
        // X Shopping Feed Specs: id, title, description, link, image_link, price, availability, condition, brand
        const headers = [
            "id",
            "title",
            "description",
            "link",
            "image_link",
            "price",
            "availability",
            "condition",
            "brand"
        ];

        // Construct Base URL based on request custom domain or env?
        // Ideally should match the shop's domain.
        // If shop has customDomain, use that.
        let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://pay.ledger1.ai";
        if (shop.customDomain && shop.customDomainVerified) {
            baseUrl = `https://${shop.customDomain}`;
        } else if (process.env.NEXT_PUBLIC_APP_URL) {
            baseUrl = process.env.NEXT_PUBLIC_APP_URL;
        }

        const csvRows = items
            // Remove filter to include all items with defaults as requested
            .map((item: any, index: number) => {
                const rawPrice = typeof item.priceUsd === 'number' ? item.priceUsd : 0;
                const price = `${rawPrice.toFixed(2)} ${item.currency || 'USD'}`;

                // Availability: in_stock, out_of_stock, preorder (snake_case required)
                let availability = "out_of_stock";
                if (item.stockQty === -1 || item.stockQty > 0) {
                    availability = "in_stock";
                }

                // Link construction:
                const itemId = item.id || `missing-id-${index}`;
                let link = "";
                if (shop.customDomain && shop.customDomainVerified) {
                    link = `https://${shop.customDomain}/product/${itemId}`;
                } else {
                    // Use effectiveSlug to ensure link works if portalpay is the real route
                    link = `${baseUrl}/shop/${effectiveSlug}/product/${itemId}`;
                }

                // Image fallback
                // Use a placeholder if no image is present to satisfy "Must have URL"
                // X Shopping requires unique URLs, so we append the item ID
                let imageLink = "";
                if (item.images && item.images.length > 0) {
                    imageLink = item.images[0];
                } else {
                    // Use the main platform URL to ensure reliable serving of the API asset
                    // (custom domains might handle API routes differently depending on middleware)
                    const platformUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pay.ledger1.ai";
                    imageLink = `${platformUrl}/api/integrations/xshopping/${effectiveSlug}/product-images/default?id=${itemId}`;
                }

                // Description fallback
                const safeName = item.name || "Untitled Product";
                const description = item.description || `${safeName} available at ${shop.name || effectiveSlug}`;

                return [
                    csvEscape(itemId),
                    csvEscape(safeName),
                    csvEscape(description),
                    csvEscape(link),
                    csvEscape(imageLink),
                    csvEscape(price),
                    csvEscape(availability),
                    "new", // Default condition
                    csvEscape(shop.name || effectiveSlug)
                ].join(",");
            });

        const csvContent = [headers.join(","), ...csvRows].join("\n");

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="x-shopping-feed-${shopSlug}.csv"`
            }
        });

    } catch (err: any) {
        console.error("X Shopping Feed Error:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
