import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
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

function getBrandKey(): string {
    // Strict partner isolation: in partner container, MUST use env var
    const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
    const envKey = String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase();

    if (ct === "partner") {
        return envKey; // If empty, let it fail validation or return empty string
    }

    // Platform default
    return envKey || "basaltsurge";
}

/**
 * POST /api/touchpoint/provision
 * 
 * Admin-only endpoint to configure a touchpoint device.
 * Once provisioned, the device is locked and can only be reset by an admin.
 * 
 * Body:
 * {
 *   "installationId": "uuid-v4",           // Unique device ID from APK
 *   "mode": "terminal" | "kiosk",
 *   "merchantWallet": "0x...",
 *   "brandKey"?: string                     // Optional override
 * }
 * 
 * Writes a document to Cosmos:
 * type = "touchpoint_device"
 */
export async function POST(req: NextRequest) {
    try {
        // Auth: Admin or Superadmin only
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];
        if (!roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const body = await req.json().catch(() => ({} as any));

        const installationId = String(body?.installationId || "").trim();
        if (!installationId) {
            return json({ error: "installation_id_required" }, { status: 400 });
        }

        const mode = String(body?.mode || "").toLowerCase();
        if (mode !== "terminal" && mode !== "kiosk" && mode !== "handheld") {
            return json({ error: "invalid_mode", message: "mode must be 'terminal', 'kiosk', or 'handheld'" }, { status: 400 });
        }

        const merchantWallet = String(body?.merchantWallet || "").trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(merchantWallet)) {
            return json({ error: "invalid_wallet", message: "merchantWallet must be a valid 0x address" }, { status: 400 });
        }

        const envBrandKey = getBrandKey();

        // Strict check: if partner container but no brand key resolved, fail
        const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
        if (ct === "partner" && !envBrandKey) {
            return json({ error: "configuration_error", message: "Partner container missing BRAND_KEY" }, { status: 500 });
        }

        // Platform admins can override brandKey; Partner admins cannot
        let brandKey = envBrandKey;
        if (ct === "platform" && body?.brandKey) {
            brandKey = String(body.brandKey).toLowerCase();
        }

        // Create deterministic ID and partition key
        const hash = crypto.createHash("sha256").update(installationId).digest("hex").slice(0, 48);
        const id = `touchpoint_${hash}`;
        const wallet = `touchpoint:${hash}`; // partition key

        const doc = {
            id,
            type: "touchpoint_device" as const,
            wallet, // partition key for Cosmos
            roles: [] as string[],
            installationId,
            mode: mode as "terminal" | "kiosk" | "handheld",
            merchantWallet,
            brandKey,
            locked: true,
            configuredAt: new Date().toISOString(),
            configuredBy: caller.wallet,
            lastSeen: null as string | null,
            ts: Date.now(),
        };

        const dbId = String(process.env.COSMOS_PAYPORTAL_DB_ID || "payportal");
        const containerId = "payportal_events";
        const container = await getContainer(dbId, containerId);

        // Upsert to allow re-provisioning
        await container.items.upsert(doc as any);

        return json({
            ok: true,
            id,
            installationId,
            mode,
            merchantWallet,
            brandKey,
            locked: true,
        });
    } catch (e: any) {
        console.error("[touchpoint/provision] Error:", e);
        return json({ error: "provision_failed", message: e?.message || String(e) }, { status: 500 });
    }
}
