import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getContainer } from "@/lib/cosmos";

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

/**
 * GET /api/touchpoint/config?installationId=xxx
 * 
 * Public endpoint for devices to fetch their configuration.
 * No auth required, but uses secure installation ID as key.
 * 
 * Response:
 * {
 *   "configured": true,
 *   "mode": "terminal" | "kiosk",
 *   "merchantWallet": "0x...",
 *   "brandKey": "xoinpay",
 *   "locked": true
 * }
 * 
 * OR if not configured:
 * {
 *   "configured": false,
 *   "installationId": "xxx"
 * }
 * 
 * DELETE /api/touchpoint/config?installationId=xxx
 * 
 * Admin-only endpoint to reset/unconfigure a device.
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const installationId = url.searchParams.get("installationId")?.trim();

        if (!installationId) {
            return json({ error: "installation_id_required" }, { status: 400 });
        }

        // Create deterministic ID (same as provision endpoint)
        const hash = crypto.createHash("sha256").update(installationId).digest("hex").slice(0, 48);
        const id = `touchpoint_${hash}`;
        const wallet = `touchpoint:${hash}`;

        const dbId = String(process.env.COSMOS_PAYPORTAL_DB_ID || "payportal");
        const containerId = "payportal_events";
        const container = await getContainer(dbId, containerId);

        // Try to fetch the document
        try {
            const { resource } = await container.item(id, wallet).read();

            if (!resource || resource.type !== "touchpoint_device") {
                // Not configured
                return json({
                    configured: false,
                    installationId,
                });
            }

            // Update last seen timestamp
            try {
                const updated = {
                    ...resource,
                    lastSeen: new Date().toISOString(),
                };
                await container.item(id, wallet).replace(updated as any);
            } catch {
                // Non-critical if lastSeen update fails
            }

            // Return configuration
            return json({
                configured: true,
                mode: resource.mode,
                merchantWallet: resource.merchantWallet,
                brandKey: resource.brandKey,
                locked: resource.locked,
                configuredAt: resource.configuredAt,
            });
        } catch {
            // Document doesn't exist = not configured
            return json({
                configured: false,
                installationId,
            });
        }
    } catch (e: any) {
        console.error("[touchpoint/config] Error:", e);
        return json({ error: "config_fetch_failed", message: e?.message || String(e) }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        // Auth: Admin or Superadmin only
        const { requireThirdwebAuth } = await import("@/lib/auth");
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];
        if (!roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const url = new URL(req.url);
        const installationId = url.searchParams.get("installationId")?.trim();

        if (!installationId) {
            return json({ error: "installation_id_required" }, { status: 400 });
        }

        // Create deterministic ID
        const hash = crypto.createHash("sha256").update(installationId).digest("hex").slice(0, 48);
        const id = `touchpoint_${hash}`;
        const wallet = `touchpoint:${hash}`;

        const dbId = String(process.env.COSMOS_PAYPORTAL_DB_ID || "payportal");
        const containerId = "payportal_events";
        const container = await getContainer(dbId, containerId);

        // Delete the document
        try {
            await container.item(id, wallet).delete();
            return json({
                ok: true,
                installationId,
                message: "Device configuration deleted successfully",
            });
        } catch {
            // If document doesn't exist, that's fine
            return json({
                ok: true,
                installationId,
                message: "Device was not configured",
            });
        }
    } catch (e: any) {
        console.error("[touchpoint/config] Delete error:", e);
        return json({ error: "delete_failed", message: e?.message || String(e) }, { status: 500 });
    }
}
