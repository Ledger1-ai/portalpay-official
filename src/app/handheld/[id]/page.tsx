import { notFound } from "next/navigation";
import { getContainer } from "@/lib/cosmos";
import HandheldSessionManager from "@/components/handheld/HandheldSessionManager";
import { ShopConfig } from "@/app/shop/[slug]/ShopClient";
import { getSiteConfigForWallet } from "@/lib/site-config";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HandheldModePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cleanSlug = id.toLowerCase();
    const container = await getContainer();

    // 1. Resolve Shop Config (to identify the wallet)
    const { resources: configs } = await container.items
        .query({
            query: "SELECT * FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true) OR c.wallet = @slug",
            parameters: [{ name: "@slug", value: cleanSlug }]
        })
        .fetchAll();

    // Prioritize shop_config
    const initialConfig = (configs.find((c: any) => c.type === 'shop_config') || configs[0]) as (ShopConfig & { wallet: string }) | undefined;

    if (!initialConfig || !initialConfig.wallet) {
        return notFound();
    }

    // 2. Fetch Normalized Site Config (handles inheritance, branding, and splits)
    // We use the wallet found in step 1 to perform the standard config lookup
    const normalizedConfig = await getSiteConfigForWallet(initialConfig.wallet);

    // 3. Merge configs
    // We want the specific fields from initialConfig (arrangement, bio, etc.) to override defaults
    // We use normalizedConfig as the base (defaults)
    const mergedConfig = {
        ...normalizedConfig,
        ...initialConfig,
        theme: {
            ...normalizedConfig.theme,
            ...initialConfig.theme
        }
    };

    // 4. Security Check: Handheld Enabled? (Optional, similar to Terminal Check)
    // For now, assume if Terminal or Kiosk is enabled, or just existence of config allows it.
    // Or we can add a specific check later. Defaults to allowing if provisioned.

    // 4. Fetch Inventory (Server-Side)
    const merchantWallet = mergedConfig.wallet || initialConfig.wallet;
    let items: any[] = [];
    try {
        const { resources } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.type = 'inventory_item' AND c.wallet = @wallet",
                parameters: [{ name: "@wallet", value: merchantWallet }]
            })
            .fetchAll();
        items = resources || [];
    } catch (e) {
        console.error("Failed to fetch inventory for handheld", e);
    }

    return (
        <HandheldSessionManager
            config={mergedConfig as any}
            merchantWallet={merchantWallet}
            items={items}
        />
    );
}
