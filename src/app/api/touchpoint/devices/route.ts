import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(obj: any, init?: { status?: number; headers?: Record<string, string> }) {
    try {
        const s = JSON.stringify(obj);
        const len = new TextEncoder().encode(s).length;
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        };
        headers["Content-Length"] = String(len);
        return new NextResponse(s, { status: init?.status ?? 200, headers });
    } catch {
        return NextResponse.json(obj, init as any);
    }
}

function getContainerType(): "platform" | "partner" {
    const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
    return ct === "partner" ? "partner" : "platform";
}

function getBrandKey(): string {
    // Strict partner isolation: in partner container, MUST use env var
    const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
    const envKey = String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase();

    if (ct === "partner") {
        return envKey;
    }

    // Platform default
    return envKey || "basaltsurge";
}

/**
 * GET /api/touchpoint/devices
 * 
 * Admin-only endpoint to list all configured touchpoint devices.
 * Platform admins see all devices.
 * Partner admins see only their brand's devices.
 * 
 * Query params:
 * - brandKey: filter by brand (platform admin only)
 * - limit: max results (default 100)
 */
export async function GET(req: NextRequest) {
    try {
        // Auth: Admin or Superadmin only
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];
        if (!roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const url = new URL(req.url);
        const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 100)));
        const qBrandKey = (url.searchParams.get("brandKey") || "").toLowerCase();

        const containerType = getContainerType();
        const envBrandKey = getBrandKey();
        const isPlatform = containerType === "platform";
        const isSuperadmin = roles.includes("superadmin");

        // Determine target brand
        let targetBrand = isPlatform ? (qBrandKey || "") : envBrandKey;

        const dbId = String(process.env.COSMOS_PAYPORTAL_DB_ID || "payportal");
        const containerId = "payportal_events";
        const container = await getContainer(dbId, containerId);

        // Build query
        let query = `SELECT TOP @top * FROM c WHERE c.type = 'touchpoint_device'`;
        const parameters: any[] = [
            { name: "@top", value: limit },
        ];

        if (targetBrand) {
            query += ` AND c.brandKey = @brandKey`;
            parameters.push({ name: "@brandKey", value: targetBrand });
        }

        query += ` ORDER BY c.ts DESC`;

        const querySpec = { query, parameters };

        const { resources } = await container.items.query(querySpec as any).fetchAll();

        // Count total
        let countQuery = `SELECT VALUE COUNT(1) FROM c WHERE c.type = 'touchpoint_device'`;
        const countParams: any[] = [];
        if (targetBrand) {
            countQuery += ` AND c.brandKey = @brandKey`;
            countParams.push({ name: "@brandKey", value: targetBrand });
        }
        const { resources: countRes } = await container.items.query({
            query: countQuery,
            parameters: countParams,
        } as any).fetchAll();
        const totalCount = countRes?.[0] || 0;

        return json({
            ok: true,
            total: totalCount,
            brandKey: targetBrand || null,
            devices: resources.map((r: any) => ({
                id: r.id,
                installationId: r.installationId,
                mode: r.mode,
                merchantWallet: r.merchantWallet,
                brandKey: r.brandKey,
                locked: r.locked,
                configuredAt: r.configuredAt,
                configuredBy: r.configuredBy,
                lastSeen: r.lastSeen,
                ts: r.ts,
            })),
        });
    } catch (e: any) {
        console.error("[touchpoint/devices] Error:", e);
        return json({ error: "query_failed", message: e?.message || String(e) }, { status: 500 });
    }
}
