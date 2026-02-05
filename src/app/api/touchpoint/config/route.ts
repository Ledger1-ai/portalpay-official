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
 *   "mode": "terminal" | "kiosk" | "handheld",
 *   "merchantWallet": "0x...",
 *   "brandKey": "xoinpay",
 *   "locked": true,
 *   "lockdownMode": "none" | "standard" | "device_owner",
 *   "unlockCodeHash": "sha256..." | null
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
                // Lockdown settings for Android app
                lockdownMode: resource.lockdownMode || "none",
                unlockCodeHash: resource.unlockCodeHash || null,
                // Remote commands for Android app polling
                clearDeviceOwner: resource.clearDeviceOwner || false,
                wipeDevice: resource.wipeDevice || false,
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

/**
 * PATCH /api/touchpoint/config
 * 
 * Admin-only endpoint to update device config or set remote commands.
 * 
 * Body:
 * {
 *   "installationId": "uuid-v4",
 *   "lockdownMode"?: "none" | "standard" | "device_owner",
 *   "clearDeviceOwner"?: boolean,  // Signal device to remove device owner
 *   "wipeDevice"?: boolean         // Signal device to factory reset
 * }
 */
export async function PATCH(req: NextRequest) {
    try {
        // Auth: Admin or Superadmin only
        const { requireThirdwebAuth } = await import("@/lib/auth");
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

        // Create deterministic ID
        const hash = crypto.createHash("sha256").update(installationId).digest("hex").slice(0, 48);
        const id = `touchpoint_${hash}`;
        const wallet = `touchpoint:${hash}`;

        const dbId = String(process.env.COSMOS_PAYPORTAL_DB_ID || "payportal");
        const containerId = "payportal_events";
        const container = await getContainer(dbId, containerId);

        // Fetch existing document
        const { resource } = await container.item(id, wallet).read();

        if (!resource || resource.type !== "touchpoint_device") {
            return json({
                error: "device_not_found",
                message: "Device not configured. Provision device first."
            }, { status: 404 });
        }

        // Build update object with only provided fields
        const updates: Record<string, any> = {
            updatedAt: new Date().toISOString(),
            updatedBy: caller.wallet,
        };

        if (body.lockdownMode !== undefined) {
            const validModes = ["none", "standard", "device_owner"];
            if (!validModes.includes(body.lockdownMode)) {
                return json({ error: "invalid_lockdown_mode" }, { status: 400 });
            }
            updates.lockdownMode = body.lockdownMode;
        }

        if (body.clearDeviceOwner !== undefined) {
            updates.clearDeviceOwner = Boolean(body.clearDeviceOwner);
        }

        if (body.wipeDevice !== undefined) {
            updates.wipeDevice = Boolean(body.wipeDevice);
        }

        // Apply updates
        const updated = { ...resource, ...updates };
        await container.item(id, wallet).replace(updated as any);

        const commands: string[] = [];
        if (updates.clearDeviceOwner) commands.push("clearDeviceOwner");
        if (updates.wipeDevice) commands.push("wipeDevice");

        return json({
            ok: true,
            installationId,
            message: commands.length > 0
                ? `Commands queued: ${commands.join(", ")}. Device will execute on next poll.`
                : "Device config updated successfully",
            pendingCommands: commands,
        });
    } catch (e: any) {
        console.error("[touchpoint/config] PATCH error:", e);
        return json({ error: "update_failed", message: e?.message || String(e) }, { status: 500 });
    }
}
