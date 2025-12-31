
import { NextRequest, NextResponse } from "next/server";
import { requireThirdwebAuth } from "@/lib/auth";
import { getAccessToken, validateStoreAccess, getUberEatsConfig } from "@/lib/uber-eats";

export const dynamic = "force-dynamic";

/**
 * POST: Verify Uber Eats connection for a store
 * 
 * This endpoint:
 * 1. Authenticates the merchant via Thirdweb
 * 2. Gets/caches an Uber Eats access token
 * 3. Validates store access with that token
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate merchant
        const auth = await requireThirdwebAuth(req);
        console.log(`[Uber Auth] Merchant ${auth.wallet.slice(0, 10)}... requesting store connection`);

        const body = await req.json();
        const { storeId } = body;

        if (!storeId) {
            return NextResponse.json({ error: "Missing Store ID" }, { status: 400 });
        }

        // 2. Check platform config exists
        const config = await getUberEatsConfig();
        if (!config) {
            return NextResponse.json({
                error: "Platform not configured for Uber Eats",
                details: "Admin must configure Uber Eats credentials in the Plugins panel"
            }, { status: 503 });
        }

        console.log(`[Uber Auth] Using ${config.isSandbox ? 'sandbox' : 'production'} mode`);

        // 3. Get access token (uses caching)
        const token = await getAccessToken();
        if (!token) {
            return NextResponse.json({
                error: "Failed to authenticate with Uber Eats",
                details: "Token acquisition failed - check platform credentials"
            }, { status: 401 });
        }

        // 4. Validate store access (optional but recommended)
        const storeValid = await validateStoreAccess(storeId);
        if (!storeValid) {
            console.warn(`[Uber Auth] Store ${storeId} validation failed - may not have access`);
            // Don't fail here - store might exist but validation endpoint differs
        }

        // 5. Return success with token info (not the actual token)
        return NextResponse.json({
            success: true,
            scope: token.scope,
            expiresAt: token.expiresAt,
            storeValidated: storeValid,
            environment: config.isSandbox ? "sandbox" : "production"
        });

    } catch (err: any) {
        console.error("[Uber Auth] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
