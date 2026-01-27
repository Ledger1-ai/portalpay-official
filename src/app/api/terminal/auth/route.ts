import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { createHash, randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { merchantWallet, pin } = body;

        if (!merchantWallet || !pin) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const container = await getContainer();
        const w = String(merchantWallet).toLowerCase();

        // Enforce Partner Isolation
        const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
        const branding = {
            key: String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase()
        };

        if (ct === "partner") {
            // In a partner container, we must ensure the merchant belongs to this brand
            // (or at least valid brand context is present).
            if (!branding.key) {
                console.error("[Auth] Partner container missing BRAND_KEY");
                return NextResponse.json({ error: "Configuration error" }, { status: 500 });
            }

            // Verify merchant is linked to this brand & Check Access Mode
            const querySpec = {
                query: "SELECT c.brandKey, c.status FROM c WHERE c.type = 'shop_config' AND c.wallet = @w",
                parameters: [{ name: "@w", value: w }]
            };
            const { resources: shops } = await container.items.query(querySpec).fetchAll();
            const shop = shops?.[0];
            const shopBrand = String(shop?.brandKey || "portalpay").toLowerCase();

            // Allow if brands match OR if shop has no brand and we are basaltsurge (default)
            // But strict partner mode means NO cross-brand access.
            if (shopBrand !== branding.key) {
                console.warn(`[Auth] Blocked cross-brand access: Merchant ${shopBrand} trying to log in on ${branding.key}`);
                return NextResponse.json({ error: "Invalid terminal for this account" }, { status: 403 });
            }

            // Check Access Mode (Open vs Request)
            try {
                // Fetch Brand Config to see if approval is required
                const brandRes = await container.item("brand:config", branding.key).read();
                const brandConfig = brandRes.resource;

                if (brandConfig?.accessMode === 'request') {
                    // In Request Mode, merchant MUST be explicitly approved
                    if (shop?.status !== 'approved') {
                        return NextResponse.json({
                            error: "Access pending approval",
                            detail: "Your account is pending partner approval.",
                            code: "PENDING_APPROVAL"
                        }, { status: 403 });
                    }
                }
            } catch (e) {
                console.error("[Auth] Failed to check brand access mode", e);
                // Fail open? Or closed? Secure default is closed if we can't verify.
                // But preventing login due to transient error is bad. 
                // Let's log and proceed unless strict.
            }
        }

        // Find the staff member with this PIN
        const pinHash = createHash("sha256").update(String(pin)).digest("hex");

        const querySpec = {
            query: "SELECT c.id, c.name, c.role FROM c WHERE c.type = 'merchant_team_member' AND c.merchantWallet = @w AND c.pinHash = @ph",
            parameters: [
                { name: "@w", value: w },
                { name: "@ph", value: pinHash }
            ]
        };

        const { resources: staff } = await container.items.query(querySpec).fetchAll();

        if (!staff || staff.length === 0) {
            return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
        }

        const member = staff[0];

        // Create a new active session
        const sessionId = randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const sessionDoc = {
            id: sessionId,
            type: "terminal_session",
            merchantWallet: w,
            staffId: member.id,
            staffName: member.name,
            role: member.role,
            startTime: now,
            endTime: null,
            totalSales: 0,
            totalTips: 0,
            createdAt: now
        };

        await container.items.create(sessionDoc);

        return NextResponse.json({
            success: true,
            session: {
                sessionId,
                staffId: member.id,
                name: member.name,
                role: member.role,
                startTime: now
            }
        });

    } catch (e: any) {
        console.error("Terminal auth failed", e);
        return NextResponse.json({ error: e.message || "Authentication failed" }, { status: 500 });
    }
}
