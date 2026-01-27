import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getBrandKey(): string {
    const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
    const envKey = String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase();
    if (ct === "partner") return envKey;
    return envKey || "basaltsurge";
}

function json(obj: any, init?: { status?: number }) {
    return NextResponse.json(obj, init);
}

type ClientRequestDoc = {
    id: string;
    wallet: string; // Partition key = requesting wallet
    type: "client_request";
    brandKey: string;
    status: "pending" | "approved" | "rejected";
    shopName: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    notes?: string;
    reviewedBy?: string;
    reviewedAt?: number;
    createdAt: number;
};

/**
 * GET /api/partner/client-requests
 * 
 * Partner Admins: List all client requests for this brand.
 * Query params: ?status=pending|approved|rejected (optional filter)
 */
export async function GET(req: NextRequest) {
    try {
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];
        if (!roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const brandKey = getBrandKey();
        if (!brandKey) {
            return json({ error: "missing_brand_key" }, { status: 500 });
        }

        const url = new URL(req.url);
        const statusFilter = url.searchParams.get("status") || "";

        const container = await getContainer();

        let query = `SELECT * FROM c WHERE c.type = 'client_request' AND c.brandKey = @brand`;
        const params: any[] = [{ name: "@brand", value: brandKey }];

        if (statusFilter === "pending" || statusFilter === "approved" || statusFilter === "rejected") {
            query += ` AND c.status = @status`;
            params.push({ name: "@status", value: statusFilter });
        }

        query += ` ORDER BY c.createdAt DESC`;

        const { resources } = await container.items.query({ query, parameters: params }).fetchAll();

        return json({ ok: true, requests: resources, brandKey });
    } catch (e: any) {
        console.error("[client-requests] GET Error:", e);
        return json({ error: e?.message || "query_failed" }, { status: 500 });
    }
}

/**
 * POST /api/partner/client-requests
 * 
 * Public (requires wallet auth): Submit a new client access request.
 * Body: { shopName, logoUrl?, faviconUrl?, primaryColor?, notes? }
 */
export async function POST(req: NextRequest) {
    try {
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        if (!caller?.wallet) {
            return json({ error: "unauthorized" }, { status: 401 });
        }

        const brandKey = getBrandKey();
        if (!brandKey) {
            return json({ error: "missing_brand_key" }, { status: 500 });
        }

        const body = await req.json().catch(() => ({} as any));
        const shopName = String(body?.shopName || "").trim();

        if (!shopName) {
            return json({ error: "shop_name_required" }, { status: 400 });
        }

        const container = await getContainer();
        const w = caller.wallet.toLowerCase();

        // Check for existing pending request
        const existingQuery = {
            query: `SELECT c.id FROM c WHERE c.type = 'client_request' AND c.wallet = @w AND c.brandKey = @brand AND c.status = 'pending'`,
            parameters: [
                { name: "@w", value: w },
                { name: "@brand", value: brandKey }
            ]
        };
        const { resources: existing } = await container.items.query(existingQuery).fetchAll();

        if (existing.length > 0) {
            return json({ error: "pending_request_exists", message: "You already have a pending request." }, { status: 409 });
        }

        const doc: ClientRequestDoc = {
            id: crypto.randomUUID(),
            wallet: w,
            type: "client_request",
            brandKey,
            status: "pending",
            shopName,
            logoUrl: typeof body?.logoUrl === "string" ? body.logoUrl : undefined,
            faviconUrl: typeof body?.faviconUrl === "string" ? body.faviconUrl : undefined,
            primaryColor: typeof body?.primaryColor === "string" ? body.primaryColor : undefined,
            notes: typeof body?.notes === "string" ? body.notes.slice(0, 500) : undefined,
            createdAt: Date.now()
        };

        await container.items.create(doc);

        return json({ ok: true, requestId: doc.id, status: "pending" });
    } catch (e: any) {
        console.error("[client-requests] POST Error:", e);
        return json({ error: e?.message || "create_failed" }, { status: 500 });
    }
}

/**
 * PATCH /api/partner/client-requests
 * 
 * Partner Admins: Approve or reject a client request.
 * Body: { requestId, status: "approved" | "rejected" }
 * On approve: Creates a minimal shop_config for the user.
 */
export async function PATCH(req: NextRequest) {
    try {
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];
        if (!roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const brandKey = getBrandKey();
        if (!brandKey) {
            return json({ error: "missing_brand_key" }, { status: 500 });
        }

        const body = await req.json().catch(() => ({} as any));
        const requestId = String(body?.requestId || "").trim();
        const newStatus = body?.status;

        if (!requestId) {
            return json({ error: "request_id_required" }, { status: 400 });
        }

        if (newStatus !== "approved" && newStatus !== "rejected") {
            return json({ error: "invalid_status", message: "status must be 'approved' or 'rejected'" }, { status: 400 });
        }

        const container = await getContainer();

        // Find the request (query by type + id since partition key is wallet)
        const findQuery = {
            query: `SELECT * FROM c WHERE c.type = 'client_request' AND c.id = @id AND c.brandKey = @brand`,
            parameters: [
                { name: "@id", value: requestId },
                { name: "@brand", value: brandKey }
            ]
        };
        const { resources: requests } = await container.items.query<ClientRequestDoc>(findQuery).fetchAll();
        const request = requests[0];

        if (!request) {
            return json({ error: "request_not_found" }, { status: 404 });
        }

        // Update the request
        const updatedDoc: ClientRequestDoc = {
            ...request,
            status: newStatus,
            reviewedBy: caller.wallet,
            reviewedAt: Date.now()
        };

        await container.item(request.id, request.wallet).replace(updatedDoc);

        // On approve: Create minimal shop_config for the user
        if (newStatus === "approved") {
            const shopConfigId = `shop:${request.wallet}`;
            const shopConfig = {
                id: shopConfigId,
                wallet: request.wallet,
                type: "shop_config",
                brandKey,
                name: request.shopName,
                theme: {
                    primaryColor: request.primaryColor || "#0ea5e9",
                    brandLogoUrl: request.logoUrl,
                    brandFaviconUrl: request.faviconUrl
                },
                status: "approved",
                approvedBy: caller.wallet,
                approvedAt: Date.now(),
                createdAt: Date.now()
            };

            await container.items.upsert(shopConfig);
        }

        return json({ ok: true, requestId, status: newStatus });
    } catch (e: any) {
        console.error("[client-requests] PATCH Error:", e);
        return json({ error: e?.message || "update_failed" }, { status: 500 });
    }
}
