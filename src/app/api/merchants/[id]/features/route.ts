import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireRole } from "@/lib/auth";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        // Admin or Partner role required
        const caller = await requireRole(req, "admin"); // TODO: Allow partners if they manage this merchant
        // For now, restrictive to admins.

        const { kioskEnabled, terminalEnabled } = await req.json();
        const container = await getContainer();

        const { id } = await ctx.params;
        const wallet = id.toLowerCase();

        // We must update the shop_config document because that's what the Kiosk/Terminal pages read.
        // The ID format for shop_config is typically "site:config:portalpay:<wallet>" (default) 
        // or we need to query for it.

        const q = "SELECT * FROM c WHERE c.type='shop_config' AND c.wallet=@wallet";
        const { resources } = await container.items.query({
            query: q,
            parameters: [{ name: "@wallet", value: wallet }]
        }).fetchAll();

        if (!resources || resources.length === 0) {
            return NextResponse.json({ error: "Merchant config not found" }, { status: 404 });
        }

        const doc = resources[0];

        // Update fields
        if (kioskEnabled !== undefined) doc.kioskEnabled = kioskEnabled;
        if (terminalEnabled !== undefined) doc.terminalEnabled = terminalEnabled;

        // Surgical migration: Ensure brandKey is set to basaltsurge if missing or legacy
        if (!doc.brandKey || doc.brandKey === 'portalpay') {
            doc.brandKey = 'basaltsurge';
        }

        doc.updatedAt = Constants.now();

        await container.items.upsert(doc);

        return NextResponse.json({ success: true, settings: { kioskEnabled: doc.kioskEnabled, terminalEnabled: doc.terminalEnabled } });

    } catch (e: any) {
        console.error("Failed to update merchant features", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

const Constants = {
    now: () => Math.floor(Date.now() / 1000)
};
