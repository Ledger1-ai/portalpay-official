import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireRole } from "@/lib/auth";
import { rateLimitOrThrow, rateKey } from "@/lib/security";
import { auditEvent } from "@/lib/audit";
import crypto from "node:crypto";

export async function GET(req: NextRequest) {
    const correlationId = crypto.randomUUID();
    try {
        // Admin-only access
        const caller = await requireRole(req, "admin");

        try {
            rateLimitOrThrow(req, rateKey(req, "admin_merchants_list", caller.wallet), 20, 60_000);
        } catch (e: any) {
            return NextResponse.json({ error: "rate_limited" }, { status: 429 });
        }

        const container = await getContainer();

        const url = new URL(req.url);
        const brandKey = url.searchParams.get("brandKey");

        let query = "SELECT c.id, c.wallet, c.name, c.industryPack, c.loyalty, c.industryPackActivatedAt, c.slug, c.theme, c.kioskEnabled, c.terminalEnabled FROM c WHERE c.type='shop_config'";
        const parameters: any[] = [];

        if (brandKey) {
            query += " AND c.theme.brandKey = @brandKey";
            parameters.push({ name: "@brandKey", value: brandKey });
        }

        const spec = { query, parameters };

        const { resources } = await container.items.query(spec).fetchAll();

        // We might want to aggregate member counts here, but for now let's stick to config data 
        // to keep it fast. Detailed stats can be fetched individually or added later if needed.
        // If we really need member counts, we'd need another query to user_merchant.

        const merchants = Array.isArray(resources) ? resources.map((r: any) => ({
            id: r.id,
            wallet: r.wallet,
            name: r.name,
            industryPack: r.industryPack || "Generic",
            platformOptIn: !!r?.loyalty?.platformOptIn,
            joinedAt: r.industryPackActivatedAt || 0,
            slug: r.slug,
            logo: r.theme?.brandLogoUrl,
            kioskEnabled: !!r.kioskEnabled,
            terminalEnabled: !!r.terminalEnabled
        })) : [];

        return NextResponse.json({ ok: true, merchants }, { headers: { "x-correlation-id": correlationId } });
    } catch (e: any) {
        console.error("Failed to list merchants", e);
        return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
    }
}
