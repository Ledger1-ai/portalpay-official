
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { decrypt } from "@/lib/crypto";
import { requireThirdwebAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        const auth = await requireThirdwebAuth(req);
        // We might want to allow "admin" or "merchant" roles here.
        // For now, assuming any authenticated user (merchant) can try to connect their store if they have a storeId.

        const body = await req.json();
        const { storeId } = body;

        if (!storeId) {
            return NextResponse.json({ error: "Missing Store ID" }, { status: 400 });
        }

        // 1. Fetch Platform Credentials
        const container = await getContainer();
        const { resource: platformConfig } = await container.item("ubereats_platform_config:portalpay", "portalpay").read();

        if (!platformConfig || !platformConfig.clientId || !platformConfig.clientSecret) {
            return NextResponse.json({ error: "Platform not configured for Uber Eats" }, { status: 503 });
        }

        const clientId = await decrypt(platformConfig.clientId);
        const clientSecret = await decrypt(platformConfig.clientSecret);
        // Check if running in sandbox mode (environment field set by admin config)
        const isSandbox = platformConfig.environment === "sandbox" || platformConfig.sandbox === true;

        // 2. Exchange Creds for Token with Uber (Client Credentials Flow)
        // Note: For multi-merchant, we might need different flows (e.g. Authorization Code) if merchants have their own Uber accounts.
        // But per requirements, it seems we are an "Aggregator" or single platform connecting many stores under one App?
        // If we uses Client Credentials, we are acting as the App Owner managing the store.
        // The storeId is just a parameter in the API calls.
        const params = new URLSearchParams();
        params.append("client_id", clientId);
        params.append("client_secret", clientSecret);
        params.append("grant_type", "client_credentials");
        params.append("scope", "eats.store eats.order"); // verify scopes

        // Use the correct OAuth endpoint based on environment
        // Sandbox: https://sandbox-login.uber.com/oauth/v2/token
        // Production: https://login.uber.com/oauth/v2/token
        const tokenUrl = isSandbox
            ? "https://sandbox-login.uber.com/oauth/v2/token"
            : "https://login.uber.com/oauth/v2/token";

        console.log(`[Uber Auth] Using ${isSandbox ? 'sandbox' : 'production'} mode`);

        const tokenRes = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.text();
            console.error("Uber Token Error", err);
            return NextResponse.json({ error: "Uber Auth Failed", details: err, sandbox: isSandbox }, { status: 401 });
        }

        const tokenData = await tokenRes.json();

        // 3. Verify Store Access (Optional but good)
        // We could try to fetch the store details to ensure this App has checking rights.

        // 4. Return Success (we don't necessarily need to return the token to the frontend if we proxy everything, 
        // but for this task we might just confirm connection).
        // In a real app, we'd save the { storeId, connected: true } to the Merchant's settings in DB.

        return NextResponse.json({ success: true, scope: tokenData.scope });

    } catch (err: any) {
        console.error("Uber Auth Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
