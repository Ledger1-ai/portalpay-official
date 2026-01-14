import { notFound } from "next/navigation";
import { getContainer } from "@/lib/cosmos";
import { InventoryItem } from "@/types/inventory";
import KioskClient from "./KioskClient";
import { ShopConfig } from "@/app/shop/[slug]/ShopClient";

export default async function KioskPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cleanSlug = id.toLowerCase();
    const container = await getContainer();

    // 1. Resolve Shop Config
    const { resources: configs } = await container.items
        .query({
            query: "SELECT * FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true) OR c.wallet = @slug",
            parameters: [{ name: "@slug", value: cleanSlug }]
        })
        .fetchAll();

    console.log(`[KIOSK DEBUG] found ${configs.length} docs for ${cleanSlug}:`, configs.map((c: any) => ({ id: c.id, type: c.type, kiosk: c.kioskEnabled })));

    // Prioritize shop_config if multiple docs found (e.g. user doc vs shop_config)
    const config = (configs.find((c: any) => c.type === 'shop_config') || configs[0]) as (ShopConfig & { wallet: string }) | undefined;

    if (!config) {
        return notFound();
    }

    // 2. Security Check: Kiosk Enabled?
    // The flag is now on shop_config
    const isKioskEnabled = (config as any).kioskEnabled === true;

    if (!isKioskEnabled) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 text-center">
                <div className="max-w-md space-y-4">
                    <h1 className="text-2xl font-bold">Kiosk Not Enabled</h1>
                    <p className="text-muted-foreground">This merchant has not enabled Kiosk mode. Please check with an administrator.</p>
                </div>
            </div>
        );
    }

    // 3. Prebuild items (optional, client can fetch too)
    // 3. Prebuild items (optional, client can fetch too)
    const items: InventoryItem[] = [];

    const resolvedWallet = config.wallet || configs.find((c: any) => c.wallet)?.wallet || "";

    return (
        <KioskClient
            config={config}
            items={items}
            merchantWallet={resolvedWallet}
        />
    );
}
