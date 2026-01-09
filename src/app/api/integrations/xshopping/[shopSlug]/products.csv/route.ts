
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

// Helper to escape CSV fields complying with RFC 4180
function csvEscape(field: any): string {
    const stringValue = String(field || "").trim();
    if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n") || stringValue.includes("\r")) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

// Helper to strip HTML tags
function stripHtml(html: string): string {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, " ").replace(/\s+/g, " ").trim();
}

// Helper to truncate text
function truncate(text: string, maxLength: number): string {
    if (!text) return "";
    return text.length > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
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

        // For X Shopping, validation fails if URL returns 404. We must return a 200 with empty CSV or valid error?
        // "Shop not found" implies no feed. 404 is appropriate.
        if (!shop || !shop.wallet) {
            return new NextResponse(`Shop not found or wallet missing for slug: ${effectiveSlug}`, { status: 404 });
        }

        const wallet = shop.wallet;

        // 2. Fetch Inventory Items for this Wallet
        const { resources: items } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.type='inventory_item' AND c.wallet=@wallet AND (c.approvalStatus != 'ARCHIVED' OR NOT IS_DEFINED(c.approvalStatus))",
                parameters: [{ name: "@wallet", value: wallet }]
            })
            .fetchAll();

        // 3. Generate CSV
        // X Shopping Template Spec: id,title,description,availability,condition,price,link,image_link,gtin,mpn,brand,mobile_link,additional_image_link,google_product_category,product_type,inventory,sale_price,sale_price_effective_date,gender,color,size,age_group,item_group_id,custom_label_0,custom_label_1,custom_label_2,custom_label_3,custom_label_4
        const headers = [
            "id",
            "title",
            "description",
            "availability",
            "condition",
            "price",
            "link",
            "image_link",
            "gtin",
            "mpn",
            "brand",
            "mobile_link",
            "additional_image_link",
            "google_product_category",
            "product_type",
            "inventory",
            "sale_price",
            "sale_price_effective_date",
            "gender",
            "color",
            "size",
            "age_group",
            "item_group_id",
            "custom_label_0",
            "custom_label_1",
            "custom_label_2",
            "custom_label_3",
            "custom_label_4"
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

        // Shop name cleanup
        const cleanBrandName = truncate(stripHtml(shop.name || effectiveSlug), 100);

        const csvRows = items
            // Remove filter to include all items with defaults as requested
            .map((item: any, index: number) => {
                // ID: Max 100 chars
                let itemId = String(item.id || `missing-id-${index}`).trim();
                itemId = truncate(itemId, 100);

                // Title: Max 150 chars, no HTML
                let title = stripHtml(item.name || "Untitled Product");
                if (!title) title = "Untitled Product";
                title = truncate(title, 150);

                // Description: Max 5000 chars, no HTML
                // Fallback MUST exist
                let description = stripHtml(item.description || "");
                if (!description) {
                    description = `${title} available at ${cleanBrandName}`;
                }
                description = truncate(description, 5000);

                // Price: Format "99.99 USD"
                const rawPrice = typeof item.priceUsd === 'number' ? item.priceUsd : 0;
                const price = `${rawPrice.toFixed(2)} ${item.currency || 'USD'}`;

                // Availability: in_stock, out_of_stock
                let availability = "out_of_stock";
                if (item.stockQty === -1 || item.stockQty > 0) {
                    availability = "in_stock";
                }

                // Link: Valid HTTPS URL
                let link = "";
                if (shop.customDomain && shop.customDomainVerified) {
                    link = `https://${shop.customDomain}/product/${itemId}`;
                } else {
                    link = `${baseUrl}/shop/${effectiveSlug}/product/${itemId}`;
                }

                // Image Link
                // X requires unique image URLs to refresh cache, appending ID helps? 
                // X Spec: "If you change the image later, the new image must use a different URL"
                let imageLink = "";
                if (item.images && item.images.length > 0) {
                    imageLink = item.images[0];
                } else {
                    const platformUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pay.ledger1.ai";
                    imageLink = `${platformUrl}/api/integrations/xshopping/${effectiveSlug}/product-images/default?id=${itemId}`;
                }

                return [
                    csvEscape(itemId),
                    csvEscape(title),
                    csvEscape(description),
                    csvEscape(availability),
                    "new", // condition
                    csvEscape(price),
                    csvEscape(link),
                    csvEscape(imageLink),
                    "", // gtin
                    "", // mpn
                    csvEscape(cleanBrandName), // brand
                    "", // mobile_link
                    "", // additional_image_link
                    "", // google_product_category
                    csvEscape(item.category || "General"), // product_type
                    Number.isFinite(item.stockQty) ? (item.stockQty === -1 ? "100" : String(item.stockQty)) : "0", // inventory (pseudo)
                    "", // sale_price
                    "", // sale_price_effective_date
                    "", // gender
                    "", // color
                    "", // size
                    "", // age_group
                    "", // item_group_id
                    "", // custom_label_0
                    "", // custom_label_1
                    "", // custom_label_2
                    "", // custom_label_3
                    ""  // custom_label_4
                ].join(",");
            });

        const csvContent = [headers.join(","), ...csvRows].join("\n");

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="x-shopping-feed-${effectiveSlug}.csv"`
            }
        });

    } catch (err: any) {
        console.error("X Shopping Feed Error:", err);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
