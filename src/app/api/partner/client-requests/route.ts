import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { encrypt, decrypt } from "@/lib/encryption";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth, getAuthenticatedWallet } from "@/lib/auth";

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
    status: "pending" | "approved" | "rejected" | "blocked";
    shopName: string;
    legalBusinessName?: string;
    businessType?: string;
    ein?: string;
    website?: string;
    phone?: string;
    businessAddress?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
    };
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

        // Platform wallet always has superadmin access
        const platformWallet = String(process.env.NEXT_PUBLIC_PLATFORM_WALLET || "").toLowerCase();
        const callerWallet = String(caller?.wallet || "").toLowerCase();
        const isPlatformAdmin = !!platformWallet && platformWallet === callerWallet;

        if (!isPlatformAdmin && !roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const brandKey = getBrandKey();
        if (!brandKey) {
            return json({ error: "missing_brand_key" }, { status: 500 });
        }

        const url = new URL(req.url);
        const statusFilter = url.searchParams.get("status") || "";

        const container = await getContainer();

        // Fetch requests AND their corresponding site configs (for split persistence)
        let query = `SELECT * FROM c WHERE (c.type = 'client_request' OR c.type = 'site_config' OR c.type = 'shop_config') AND c.brandKey = @brand ORDER BY c.createdAt DESC`;
        const params: any[] = [{ name: "@brand", value: brandKey }];

        const { resources } = await container.items.query({ query, parameters: params }).fetchAll();

        const requestsMap = new Map<string, any>();
        const configMap = new Map<string, any>();
        const allWallets = new Set<string>();

        resources.forEach((r: any) => {
            if (r.wallet) {
                const w = String(r.wallet).toLowerCase();
                allWallets.add(w);
                if (r.type === "client_request" && (!statusFilter || statusFilter === r.status)) {
                    requestsMap.set(w, r);
                } else if (r.type === "site_config" || r.type === "shop_config") {
                    const existing = configMap.get(w);
                    // Prioritize site_config over shop_config
                    // And since we sort by DESC, the first site_config we see is the newest.
                    // Do NOT overwrite existing site_config with older ones.
                    if (!existing || (r.type === "site_config" && existing.type !== "site_config")) {
                        configMap.set(w, r);
                    }
                }
            }
        });

        const result = Array.from(allWallets).map((wallet) => {
            const req = requestsMap.get(wallet);
            const conf = configMap.get(wallet);

            if (!req && !conf) return null; // Should not happen
            // If filtering by status and we have no request (orphan), orphan implies 'active' or specific status.
            // If statusFilter is set to 'pending', we skip orphans.
            if (statusFilter && statusFilter === "pending" && !req) return null;

            // Decrypt helpers
            const maskEin = (ein: string) => {
                try {
                    const d = decrypt(ein);
                    return `***-**-${d.length > 4 ? d.slice(-4) : d}`;
                } catch { return ein; }
            };

            // If we have a request, enrich it
            if (req) {
                const deployedSplit = conf?.split;
                const deployedAddress = conf?.splitAddress || conf?.split?.address;
                const enriched = {
                    ...req,
                    deployedSplitAddress: deployedAddress,
                    splitHistory: conf?.splitHistory || [],
                    splitConfig: conf?.splitConfig || req.splitConfig, // Prefer deployed config
                    shopName: conf?.shopName || req.shopName, // Prefer deployed name
                };
                if (req.ein) enriched.ein = maskEin(req.ein);
                return enriched;
            }

            // Orphan handling: No request but has config
            // Synthesize a request object so it appears in the list and can be deleted
            return {
                id: conf.id || `orphan-${wallet.slice(0, 8)}`,
                wallet: wallet,
                brandKey: conf.brandKey || brandKey,
                shopName: conf.shopName || conf.displayName || "Orphaned Merchant",
                legalBusinessName: "Data Missing (Orphaned)",
                businessType: "unknown",
                contactEmail: "",
                status: "orphaned", // Distinct status
                createdAt: (conf._ts || 0) * 1000,
                updatedAt: (conf._ts || 0) * 1000,
                splitConfig: conf.splitConfig,
                deployedSplitAddress: conf.splitAddress || conf.split?.address,
                splitHistory: conf.splitHistory || [],
                note: "This merchant has a configuration but no request record. Delete to effectively remove access.",
            };
        }).filter(Boolean); // Remove nulls

        return json({ ok: true, requests: result, brandKey });
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
        // Try full JWT auth first, then fall back to basic wallet auth
        // This allows new users (who just connected but haven't signed yet) to submit applications
        let wallet: string | null = null;

        try {
            const caller = await requireThirdwebAuth(req);
            wallet = caller?.wallet || null;
        } catch {
            // Fall back to basic authenticated wallet (cookie-based)
            wallet = await getAuthenticatedWallet(req);
        }

        // If no authenticated session, check for x-wallet header (Unauthenticated submission for new users)
        if (!wallet) {
            const headerWallet = req.headers.get("x-wallet");
            if (headerWallet && /^0x[a-fA-F0-9]{40}$/.test(headerWallet)) {
                wallet = headerWallet;
            }
        }

        if (!wallet) {
            return json({ error: "unauthorized" }, { status: 401 });
        }

        const w = wallet.toLowerCase();

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

        // Check for existing pending request
        const existingQuery = {
            query: `SELECT c.id, c.status FROM c WHERE c.type = 'client_request' AND c.wallet = @w AND c.brandKey = @brand`,
            parameters: [
                { name: "@w", value: w },
                { name: "@brand", value: brandKey }
            ]
        };
        const { resources: existing } = await container.items.query(existingQuery).fetchAll();

        // Check if user is blocked
        const blockedRequest = existing.find((r: any) => r.status === "blocked");
        if (blockedRequest) {
            return json({ error: "blocked", message: "Your account has been blocked from applying." }, { status: 430 });
        }

        // Check for pending request
        const pendingRequest = existing.find((r: any) => r.status === "pending");
        if (pendingRequest) {
            return json({ error: "pending_request_exists", message: "You already have a pending request." }, { status: 409 });
        }

        const doc: ClientRequestDoc = {
            id: crypto.randomUUID(),
            wallet: w,
            type: "client_request",
            brandKey,
            status: "pending",
            shopName,
            legalBusinessName: typeof body?.legalBusinessName === "string" ? body.legalBusinessName : undefined,
            businessType: typeof body?.businessType === "string" ? body.businessType : undefined,
            // Encrypt EIN/SSN if present to protect sensitive PII
            ein: typeof body?.ein === "string" && body.ein ? encrypt(body.ein) : undefined,
            website: typeof body?.website === "string" ? body.website : undefined,
            phone: typeof body?.phone === "string" ? body.phone : undefined,
            businessAddress: body?.businessAddress || undefined,
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

        // Platform wallet always has superadmin access
        const platformWallet = String(process.env.NEXT_PUBLIC_PLATFORM_WALLET || "").toLowerCase();
        const callerWallet = String(caller?.wallet || "").toLowerCase();
        const isPlatformAdmin = !!platformWallet && platformWallet === callerWallet;

        if (!isPlatformAdmin && !roles.includes("admin") && !roles.includes("superadmin")) {
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

        if (newStatus !== "pending" && newStatus !== "approved" && newStatus !== "rejected" && newStatus !== "blocked") {
            return json({ error: "invalid_status", message: "status must be 'pending', 'approved', 'rejected', or 'blocked'" }, { status: 400 });
        }

        const splitConfig = body?.splitConfig;

        if (newStatus === "approved" && splitConfig) {
            const { partnerBps, merchantBps } = splitConfig;
            const partner = Number(partnerBps || 0);
            const merchant = Number(merchantBps || 0);
            const platform = 10000 - partner - merchant;

            // Basic validation
            if (partner < 0 || merchant < 0 || platform < 0 || (partner + merchant + platform) !== 10000) {
                return json({ error: "invalid_split_config", message: "Split configuration must sum to 100% (10000 bps)" }, { status: 400 });
            }
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
        const updatedDoc: any = {
            ...request,
            status: newStatus,
            reviewedBy: caller.wallet,
            reviewedAt: Date.now()
        };

        if (splitConfig) {
            updatedDoc.splitConfig = splitConfig;
        }

        await container.item(request.id, request.wallet).replace(updatedDoc);

        // On approve: Create minimal shop_config for the user
        if (newStatus === "approved") {
            const shopConfigId = `shop:${request.wallet}`;
            // If splitConfig provided, use it. Otherwise defaults.
            // Note: If no splitConfig provided, we just create the shop config without explicit splits, 
            // relying on system defaults later or forcing manual update if needed.
            // But we prefer explicit if provided.

            const shopConfig: any = {
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

            if (splitConfig) {
                shopConfig.splitConfig = {
                    partnerBps: Number(splitConfig.partnerBps),
                    merchantBps: Number(splitConfig.merchantBps),
                    agents: Array.isArray(splitConfig.agents) ? splitConfig.agents : []
                    // Platform bps is implicit/remainder in some contexts or explicit in others.
                    // We'll store what we received. 
                };
            }

            if (typeof body.processingFeePct === "number") {
                shopConfig.processingFeePct = Number(body.processingFeePct);
            }

            await container.items.upsert(shopConfig);
        }

        return json({ ok: true, requestId, status: newStatus });
    } catch (e: any) {
        console.error("[client-requests] PATCH Error:", e);
        return json({ error: e?.message || "update_failed" }, { status: 500 });
    }
}

/**
 * DELETE /api/partner/client-requests
 * 
 * Partner Admins: Delete a client request (allows user to apply again fresh).
 * Body: { requestId }
 */
export async function DELETE(req: NextRequest) {
    try {
        const caller = await requireThirdwebAuth(req).catch(() => null as any);
        const roles = Array.isArray(caller?.roles) ? caller.roles : [];

        // Platform wallet always has superadmin access
        const platformWallet = String(process.env.NEXT_PUBLIC_PLATFORM_WALLET || "").toLowerCase();
        const callerWallet = String(caller?.wallet || "").toLowerCase();
        const isPlatformAdmin = !!platformWallet && platformWallet === callerWallet;

        if (!isPlatformAdmin && !roles.includes("admin") && !roles.includes("superadmin")) {
            return json({ error: "forbidden" }, { status: 403 });
        }

        const brandKey = getBrandKey();
        if (!brandKey) {
            return json({ error: "missing_brand_key" }, { status: 500 });
        }

        const body = await req.json().catch(() => ({} as any));
        const requestId = String(body?.requestId || "").trim();
        const targetWallet = String(body?.wallet || "").toLowerCase();

        if (!requestId && !targetWallet) {
            return json({ error: "request_id_or_wallet_required" }, { status: 400 });
        }

        const container = await getContainer();

        let merchantWallet = "";
        let requestIdToDelete = requestId;

        // Strategy 1: Look up by Request ID (standard flow)
        if (requestId) {
            const findQuery = {
                query: `SELECT * FROM c WHERE c.type = 'client_request' AND c.id = @id AND c.brandKey = @brand`,
                parameters: [
                    { name: "@id", value: requestId },
                    { name: "@brand", value: brandKey }
                ]
            };
            const { resources: requests } = await container.items.query<ClientRequestDoc>(findQuery).fetchAll();
            if (requests[0]) {
                merchantWallet = requests[0].wallet;
                requestIdToDelete = requests[0].id;
            }
        }

        // Strategy 2: If no request found but wallet provided (Orphan / Admin cleanup flow)
        if (!merchantWallet && targetWallet) {
            merchantWallet = targetWallet;
        }

        if (!merchantWallet) {
            return json({ error: "request_not_found" }, { status: 404 });
        }

        // 1. Delete the specific request document if we have a valid ID and it's not synthetic
        if (requestIdToDelete && !requestIdToDelete.startsWith("orphan-") && !requestIdToDelete.startsWith("site:")) {
            try {
                await container.item(requestIdToDelete, merchantWallet).delete();
            } catch (e) { /* ignore */ }
        }

        // 2. Query for all other documents belonging to this merchant wallet
        // Includes: site_config, shop_config, inventory, orders, split_index, etc.
        // We delete everything where partition key matches the wallet.
        const relatedQuery = {
            query: `SELECT * FROM c WHERE c.wallet = @w`,
            parameters: [{ name: "@w", value: merchantWallet }]
        };
        const { resources: relatedDocs } = await container.items.query(relatedQuery).fetchAll();

        // Batch delete all related documents
        await Promise.all(relatedDocs.map(async (doc: any) => {
            try {
                // Determine partition key (usually wallet, but some might differ? No, query was by wallet)
                // Use the doc's own partition key value just in case, but here it's merchantWallet
                await container.item(doc.id, merchantWallet).delete();
            } catch (err) {
                console.warn(`[client-requests] Failed to delete doc ${doc.id}:`, err);
            }
        }));

        return json({ ok: true, requestId, wallet: merchantWallet, deleted: true, relatedDocsDeleted: relatedDocs.length });
    } catch (e: any) {
        console.error("[client-requests] DELETE Error:", e);
        return json({ error: e?.message || "delete_failed" }, { status: 500 });
    }
}
