import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getContainerType(): "platform" | "partner" {
    const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
    return ct === "partner" ? "partner" : "platform";
}

function getBrandKey(): string {
    return String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "portalpay").toLowerCase();
}

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

/**
 * Phone-home install telemetry (called by the APK on first launch)
 *
 * POST /api/app/installs
 *   Body:
 *   {
 *     app: "portalpay" | "paynex",
 *     brandKey?: string,             // optional; default from container env
 *     installId: string,             // stable ID persisted by app (UUID)
 *     versionName?: string,
 *     versionCode?: number,
 *     device?: {
 *       model?: string,
 *       android?: string,
 *       sdk?: string | number,
 *       abi?: string
 *     }
 *   }
 *
 *   Writes a single document per (app, brandKey, installId, version) to Cosmos:
 *   type = "app_install", source = "apk_phone_home"
 *
 * GET /api/app/installs?app=portalpay|paynex[&brandKey=...][&limit=50]
 *   Auth required:
 *     - Platform SuperAdmin: detailed list and totals across brands (when brandKey provided)
 *     - Partner container: count-only for its own brand
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({} as any));
        const app: "portalpay" | "paynex" = body?.app === "paynex" ? "paynex" : "portalpay";
        const brandKey = String(body?.brandKey || getBrandKey()).toLowerCase();

        const installId = String(body?.installId || "").trim();
        if (!installId) {
            return json({ error: "invalid_install_id" }, { status: 400 });
        }

        const versionName = typeof body?.versionName === "string" ? body.versionName : undefined;
        const versionCode = typeof body?.versionCode === "number" ? body.versionCode : (typeof body?.versionCode === "string" ? Number(body.versionCode) || undefined : undefined);

        const device = typeof body?.device === "object" && body.device ? body.device : undefined;

        const containerType = getContainerType();

        // Deterministic id and partition key for de-duplication
        const dedupKey = `${app}|${brandKey}|${installId}|${versionName || ""}|${versionCode || ""}`;
        const hash = crypto.createHash("sha256").update(dedupKey).digest("hex").slice(0, 48);
        const id = `app_install_${hash}`;
        const wallet = `install:${hash}`; // partition key

        const doc = {
            id,
            type: "app_install" as const,
            source: "apk_phone_home" as const,
            wallet,           // partition key
            roles: [] as string[],
            app,
            brandKey,
            containerType,
            installId,
            versionName,
            versionCode,
            device: device ? {
                label: [
                    (device.model || "").toString().trim(),
                    (device.android ? `Android ${String(device.android).trim()}` : "").trim(),
                    (device.sdk ? `SDK ${String(device.sdk).trim()}` : "").trim(),
                ].filter(Boolean).join(" · ") || undefined,
                model: device.model ? String(device.model) : undefined,
                android: device.android ? String(device.android) : undefined,
                sdk: device.sdk != null ? String(device.sdk) : undefined,
                abi: device.abi ? String(device.abi) : undefined,
            } : undefined,
            userAgent: req.headers.get("user-agent") || undefined,
            installerHost: req.headers.get("host") || undefined,
            ip: req.headers.get("x-forwarded-for") || undefined,
            ts: Date.now(),
        };

        const dbId = String(process.env.COSMOS_PAYPORTAL_DB_ID || "payportal");
        const installsContainerId = "payportal_installs";
        const container = await getContainer(dbId, installsContainerId);

        // Try to create; treat conflict as success (de-dup)
        try {
            await container.items.create(doc as any);
            return json({ ok: true, id });
        } catch (e: any) {
            const msg = String(e?.message || "");
            if (/conflict/i.test(msg)) {
                return json({ ok: true, id, dedup: true });
            }
            // If unknown error, still don't surface details to clients
            return json({ error: "log_failed" }, { status: 500 });
        }
    } catch {
        return json({ error: "log_failed" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const app = url.searchParams.get("app") === "paynex" ? "paynex" : "portalpay";
        const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 50)));
        const qBrandKey = (url.searchParams.get("brandKey") || "").toLowerCase();

        // Auth check for reading telemetry
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];

        const containerType = getContainerType();
        let brandKeyEnv = getBrandKey();
        // Normalize basaltsurge to portalpay for unmigrated legacy data
        if (brandKeyEnv === "basaltsurge") brandKeyEnv = "portalpay";

        const isPlatform = containerType === "platform";
        const isSuperadmin = roles.includes("superadmin");
        const isPartner = containerType === "partner";

        let targetBrand = isPartner ? brandKeyEnv : (qBrandKey || brandKeyEnv);
        // Normalize target brand as well
        if (targetBrand === "basaltsurge") targetBrand = "portalpay";

        const dbId = String(process.env.COSMOS_PAYPORTAL_DB_ID || "payportal");
        const installsContainerId = "payportal_installs";
        const container = await getContainer(dbId, installsContainerId);

        // For portalpay (platform/legacy), include items with missing/undefined brandKey
        const isPlatformQuery = targetBrand === "portalpay";
        const brandCondition = isPlatformQuery
            ? "(c.brandKey = @brandKey OR NOT IS_DEFINED(c.brandKey) OR c.brandKey = null OR c.brandKey = '')"
            : "c.brandKey = @brandKey";

        const querySpec = {
            query: `SELECT TOP @top * FROM c WHERE c.type = 'app_install' AND c.app = @app AND ${brandCondition} ORDER BY c.ts DESC`,
            parameters: [
                { name: "@top", value: limit },
                { name: "@app", value: app },
                { name: "@brandKey", value: targetBrand },
            ],
        };

        const { resources } = await container.items.query(querySpec as any).fetchAll();
        const totalCount = (await container.items.query({
            query: `SELECT VALUE COUNT(1) FROM c WHERE c.type = 'app_install' AND c.app = @app AND ${brandCondition}`,
            parameters: [
                { name: "@app", value: app },
                { name: "@brandKey", value: targetBrand },
            ],
        } as any).fetchAll()).resources?.[0] || 0;

        if (isPlatform && isSuperadmin) {
            return NextResponse.json({
                app,
                brandKey: targetBrand,
                total: totalCount,
                items: resources.map((r: any) => ({
                    id: r.id,
                    app: r.app,
                    brandKey: r.brandKey,
                    containerType: r.containerType,
                    installId: r.installId,
                    versionName: r.versionName,
                    versionCode: r.versionCode,
                    device: r.device,
                    ts: r.ts,
                    userAgent: r.userAgent,
                    installerHost: r.installerHost,
                    ip: r.ip,
                    source: r.source,
                })),
            });
        }

        // Partner or non-superadmin: count only
        return NextResponse.json({
            app,
            brandKey: targetBrand,
            total: totalCount,
        });
    } catch (e: any) {
        return NextResponse.json({ error: "query_failed", message: e?.message || String(e) }, { status: 500 });
    }
}
