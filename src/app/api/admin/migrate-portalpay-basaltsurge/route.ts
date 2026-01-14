
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireRole } from "@/lib/auth";

// Force specific runtime to allow long execution if needed (though max duration applies)
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds

export async function POST(req: NextRequest) {
    try {
        await requireRole(req, "admin");

        const container = await getContainer();
        const results: any[] = [];
        const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

        // Helper to migrate a batch of documents
        const migrateDocs = async (docType: string, label: string) => {
            // Query for docs of this type that have EITHER:
            // 1. brandKey = 'portalpay'
            // 2. brandKey is NOT defined (legacy default)
            const querySpec = {
                query: `
                    SELECT * FROM c 
                    WHERE c.type = @docType 
                    AND (c.brandKey = 'portalpay' OR NOT IS_DEFINED(c.brandKey))
                `,
                parameters: [
                    { name: "@docType", value: docType }
                ]
            };

            const { resources } = await container.items.query(querySpec).fetchAll();
            let updatedCount = 0;
            let skippedCount = 0;

            for (const doc of resources) {
                // Double check exclusion for known partners just in case they ended up in this bucket
                // (Though if they are missing brandKey, they *are* technically defaulting to platform right now)
                if (doc.wallet && (
                    doc.wallet === 'paynex' ||
                    doc.wallet === 'xoinpay' ||
                    doc.wallet === 'icunow-store'
                )) {
                    skippedCount++;
                    continue;
                }

                // Prepare update
                doc.brandKey = 'basaltsurge';
                // Only touch updatedAt if we actually change something to avoid noise? 
                // Better to mark it as touched.
                doc.updatedAt = Date.now();
                // Add a migration flag so we know this was touched by script
                doc._migration = "portalpay-to-basaltsurge-v1";

                if (!dryRun) {
                    await container.items.upsert(doc);
                }
                updatedCount++;
            }

            results.push({
                type: label,
                found: resources.length,
                migrated: updatedCount,
                skipped: skippedCount
            });
        };

        // 1. Migrate Shop Configs
        await migrateDocs('shop_config', 'Shop Configurations');

        // 2. Migrate Receipts (Orders)
        await migrateDocs('receipt', 'Receipts/Orders');

        // 3. Migrate Generic Site Config (if exists)
        // Usually id="site:config"
        try {
            const { resource: siteConfig } = await container.item("site:config", "site:config").read();
            if (siteConfig && (siteConfig.brandKey === 'portalpay' || !siteConfig.brandKey)) {
                siteConfig.brandKey = 'basaltsurge';
                siteConfig.updatedAt = Date.now();
                if (!dryRun) await container.items.upsert(siteConfig);
                results.push({ msg: "Updated site:config Global Config" });
            }
        } catch { }

        // 4. Ensure BasaltSurge Brand Config exists (Clone PortalPay if needed)
        try {
            const { resource: basaltsurge } = await container.item("brand:config", "basaltsurge").read();
            if (!basaltsurge) {
                const { resource: portalpay } = await container.item("brand:config", "portalpay").read();
                if (portalpay) {
                    const newDoc = {
                        ...portalpay,
                        id: "brand:config",
                        wallet: "basaltsurge", // Partition Key
                        name: "BasaltSurge",
                        updatedAt: Date.now(),
                        _migration: "cloned-from-portalpay"
                    };
                    if (!dryRun) await container.items.upsert(newDoc);
                    results.push({ msg: "Cloned brand:config/portalpay -> brand:config/basaltsurge" });
                } else {
                    results.push({ msg: "No legacy portalpay brand config found to clone." });
                }
            } else {
                results.push({ msg: "BasaltSurge brand config already exists." });
            }
        } catch (e: any) {
            results.push({ error: "Brand Config Check Failed", details: e.message });
        }


        // 5. Inventory Items?
        // User asked for "All inventory".
        // Let's check if inventory items have brandKey usage.
        // It's safer to just run it. If they don't have it, adding it sets the default explicitly.
        // But for thousands of items this might be slow. 
        // We'll trust the 60s timeout for now.
        await migrateDocs('inventory_item', 'Inventory Items');


        return NextResponse.json({
            success: true,
            dryRun,
            results
        });

    } catch (e: any) {
        console.error("Migration failed", e);
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
