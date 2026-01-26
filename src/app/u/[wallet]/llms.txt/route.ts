import { NextRequest } from "next/server";

// Reuse the logic, but we might need to adapt the lookup if "slug" is actually a wallet address
// The shop/[slug] route does a DB lookup for slug OR custom domain. 
// If we are in u/[wallet], the param is 'wallet'. 
// We should probably just write a separate tailored one for u/[wallet] to be safe and clear.

import { NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getBaseUrl } from "@/lib/base-url";

export const dynamic = "force-dynamic";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ wallet: string }> }
) {
    const { wallet } = await params;
    const cleanWallet = wallet.toLowerCase();

    if (!/^0x[a-f0-9]{40}$/.test(cleanWallet)) {
        return new NextResponse("Invalid wallet address", { status: 400 });
    }

    try {
        const container = await getContainer();

        // 1. Fetch Shop Config via Wallet (site_config)
        // Query site_config type for this wallet
        const { resources: configs } = await container.items
            .query({
                query: "SELECT TOP 1 * FROM c WHERE c.type = 'site_config' AND c.wallet = @wallet ORDER BY c.updatedAt DESC",
                parameters: [{ name: "@wallet", value: cleanWallet }]
            })
            .fetchAll();

        const config = configs[0] as (any) | undefined;

        // Even if no config exists, we can technically list inventory for the wallet if they have items
        // But let's assume if no config, they aren't a "shop"

        const shopName = config?.theme?.brandName || "PortalPay Merchant";
        const shopDesc = config?.story || "";

        // 2. Fetch Inventory
        const { resources: items } = await container.items
            .query({
                query: "SELECT c.id, c.sku, c.name, c.priceUsd, c.description, c.category, c.stockQty FROM c WHERE c.type='inventory_item' AND c.wallet=@wallet ORDER BY c.metrics.revenueUsd DESC",
                parameters: [{ name: "@wallet", value: cleanWallet }]
            })
            .fetchAll();

        const baseUrl = getBaseUrl();
        const checkoutUrl = `${baseUrl}/api/orders`;

        // 3. Generate Markdown
        const lines: string[] = [];
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
        lines.push(`  - \`X-Wallet: ${cleanWallet}\``);
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
        console.error("Error generating llms.txt for wallet", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
