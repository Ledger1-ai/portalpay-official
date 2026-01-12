import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getBaseUrl } from "@/lib/base-url";

export const dynamic = "force-dynamic";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const cleanSlug = slug.toLowerCase();

    try {
        const container = await getContainer();

        // 1. Fetch Shop Config
        const { resources: configs } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true)",
                parameters: [{ name: "@slug", value: cleanSlug }]
            })
            .fetchAll();

        const config = configs[0] as (any) | undefined;

        if (!config) {
            return new NextResponse("Shop not found", { status: 404 });
        }

        // 2. Fetch Inventory
        // We'll fetch the top 50 items for the context window
        const { resources: items } = await container.items
            .query({
                query: "SELECT c.id, c.sku, c.name, c.priceUsd, c.description, c.category, c.stockQty FROM c WHERE c.type='inventory_item' AND c.wallet=@wallet ORDER BY c.metrics.revenueUsd DESC",
                parameters: [{ name: "@wallet", value: config.wallet }]
            })
            .fetchAll();

        const shopName = config.name || config.theme?.brandName || "PortalPay Shop";
        const shopDesc = config.description || config.bio || "";
        const baseUrl = getBaseUrl();
        const checkoutUrl = `${baseUrl}/api/orders`;

        // 3. Generate Markdown
        const lines = [];
        lines.push(`# ${shopName}`);
        if (shopDesc) lines.push(`\n${shopDesc}`);
        lines.push(`\nThis shop supports **Agentic Payments** via x402.`);
        lines.push(`Agents can autonomously purchase items listed below by sending a POST request.`);

        lines.push(`\n## Universal Commerce Protocol (UCP)`);
        lines.push(`This shop also implements the UCP \`checkout-sessions\` capability.`);
        lines.push(`- **Create Session**: \`POST ${baseUrl}/api/ucp/checkout-sessions\``);
        lines.push(`- **Get/Update Session**: \`GET/PATCH ${baseUrl}/api/ucp/checkout-sessions/:id\``);
        lines.push(`- **Complete Session**: \`POST ${baseUrl}/api/ucp/checkout-sessions/:id/complete\``);


        lines.push(`\n## Payment Instructions`);
        lines.push(`- **Endpoint**: \`POST ${checkoutUrl}\``);
        lines.push(`- **Headers**:`);
        lines.push(`  - \`Content-Type: application/json\``);
        lines.push(`  - \`X-Agent-Payment: true\` (Triggers 402 L402 flow)`);
        lines.push(`  - \`X-Wallet: ${config.wallet}\` (Optional, helps routing)`);
        lines.push(`- **Body**:`);
        lines.push(`  \`\`\`json`);
        lines.push(`  {`);
        lines.push(`    "items": [`);
        lines.push(`      { "id": "inventory:<ID>", "qty": 1 }`);
        lines.push(`    ]`);
        lines.push(`  }`);
        lines.push(`  \`\`\``);

        lines.push(`\n## Inventory`);

        if (items.length === 0) {
            lines.push(`No items currently available.`);
        } else {
            items.forEach((item: any) => {
                const stock = item.stockQty === -1 ? "Infinite" : item.stockQty;
                const price = item.priceUsd !== undefined ? `$${item.priceUsd.toFixed(2)}` : "Price Varies";
                lines.push(`\n### ${item.name}`);
                lines.push(`- **ID**: \`${item.id}\` (SKU: ${item.sku})`);
                lines.push(`- **Price**: ${price}`);
                lines.push(`- **Stock**: ${stock}`);
                if (item.description) lines.push(`- **Description**: ${item.description}`);
            });
        }

        return new NextResponse(lines.join("\n"), {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
            }
        });

    } catch (e) {
        console.error("Error generating llms.txt", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
