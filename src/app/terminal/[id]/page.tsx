import { notFound } from "next/navigation";
import { getContainer } from "@/lib/cosmos";
import TerminalSessionManager from "@/components/terminal/TerminalSessionManager";
import { ShopConfig } from "@/app/shop/[slug]/ShopClient";

export default async function TerminalModePage({ params }: { params: Promise<{ id: string }> }) {
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

    // Prioritize shop_config
    const config = (configs.find((c: any) => c.type === 'shop_config') || configs[0]) as (ShopConfig & { wallet: string }) | undefined;

    if (!config) {
        return notFound();
    }

    // 2. Security Check: Terminal Enabled?
    const isTerminalEnabled = (config as any).terminalEnabled === true;

    if (!isTerminalEnabled) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 text-center">
                <div className="max-w-md space-y-4">
                    <h1 className="text-2xl font-bold">Terminal Not Enabled</h1>
                    <p className="text-muted-foreground">This merchant has not enabled Terminal mode. Please check with an administrator.</p>
                </div>
            </div>
        );
    }

    return (
        <TerminalSessionManager
            config={config}
            merchantWallet={config.wallet}
        />
    );
}
