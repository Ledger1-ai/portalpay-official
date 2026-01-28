
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

        // 1. Resolve Shop Slug to Wallet
        // Shop configs are stored in the same container.
        // Query for the shop config to get the owner wallet.
        const { resources: shops } = await container.items
            .query({
                query: "SELECT c.wallet, c.name FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true)",
                parameters: [{ name: "@slug", value: shopSlug.toLowerCase() }]
            })
            .fetchAll();

        const shop = shops[0];

        if (!shop || !shop.wallet) {
            return new NextResponse("Shop not found", { status: 404 });
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

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://surge.basalthq.com"; // Fallback, should ideally use request host or config

        const csvRows = items.map((item: any) => {
            const price = `${item.priceUsd || 0} ${item.currency || 'USD'}`;
            const availability = (item.stockQty === -1 || item.stockQty > 0) ? "in stock" : "out of stock";
            const link = `${baseUrl}/shop/${shopSlug}/product/${item.id}`;
            const imageLink = item.images && item.images.length > 0 ? item.images[0] : "";

            return [
                csvEscape(item.id),
                csvEscape(item.name),
                csvEscape(item.description || item.name),
                csvEscape(link),
                csvEscape(imageLink),
                csvEscape(price),
                csvEscape(availability),
                "new", // Default condition
                csvEscape(shop.name || "BasaltSurge") // Default brand if not present on item, or use item.brand
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
