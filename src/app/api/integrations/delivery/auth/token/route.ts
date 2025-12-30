
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { decrypt } from "@/lib/crypto";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * Uber calls this to get an Access Token (Client Credentials Flow)
 */
export async function GET() {
    return NextResponse.json({
        status: "active",
        message: "Uber Auth Token endpoint is live. Use POST for authentication."
    }, {
        headers: { "Access-Control-Allow-Origin": "*" }
    });
}

export async function POST(req: NextRequest) {
    try {
        // Log everything about the incoming request for debugging
        const contentType = req.headers.get("content-type") || "";
        const authHeader = req.headers.get("authorization") || "";

        console.log("[Uber Token] === Incoming Request ===", {
            method: req.method,
            contentType,
            authHeaderPresent: !!authHeader,
            authHeaderType: authHeader ? authHeader.split(" ")[0] : "none"
        });

        // 1. Extract Client Credentials
        let clientId: string | null = null;
        let clientSecret: string | null = null;
        let grantType: string | null = null;
        let requestedScope: string | null = null;


        // Method A: Check Authorization: Basic header (RFC 6749 Section 2.3.1)
        if (authHeader.toLowerCase().startsWith("basic ")) {
            try {
                const base64Credentials = authHeader.slice(6).trim(); // "Basic " is 6 chars
                const decoded = Buffer.from(base64Credentials, "base64").toString("utf-8");
                const colonIndex = decoded.indexOf(":");
                if (colonIndex > 0) {
                    clientId = decoded.slice(0, colonIndex).trim();
                    clientSecret = decoded.slice(colonIndex + 1).trim();
                }
                console.log("[Uber Token] Extracted from Basic auth header:", {
                    decodedLength: decoded.length,
                    colonAt: colonIndex
                });
            } catch (e) {
                console.error("[Uber Token] Basic auth decode error:", e);
            }
        }

        // Method B: Parse body (form-urlencoded is standard for OAuth2)
        if (!clientId || !clientSecret) {
            try {
                // Clone request to read body multiple ways if needed
                const bodyText = await req.text();
                console.log("[Uber Token] Raw body length:", bodyText?.length || 0);

                if (contentType.includes("application/x-www-form-urlencoded") ||
                    contentType.includes("application/x-www-form-urlencoded") === false) {
                    // Try URLSearchParams for form-urlencoded
                    const params = new URLSearchParams(bodyText);
                    clientId = params.get("client_id") || clientId;
                    clientSecret = params.get("client_secret") || clientSecret;
                    grantType = params.get("grant_type");
                    requestedScope = params.get("scope");
                    console.log("[Uber Token] Parsed as form-urlencoded:", {
                        hasClientId: !!params.get("client_id"),
                        hasClientSecret: !!params.get("client_secret"),
                        grantType,
                        requestedScope
                    });
                }

                // If still empty, try JSON
                if ((!clientId || !clientSecret) && contentType.includes("application/json")) {
                    try {
                        const json = JSON.parse(bodyText);
                        clientId = json.client_id || clientId;
                        clientSecret = json.client_secret || clientSecret;
                        grantType = json.grant_type;
                        requestedScope = json.scope || requestedScope;
                        console.log("[Uber Token] Parsed as JSON");
                    } catch (e) {
                        // Not JSON
                    }
                }
            } catch (e) {
                console.error("[Uber Token] Body parse error:", e);
            }
        }

        console.log("[Uber Token] Final extraction:", {
            hasClientId: !!clientId,
            clientIdPrefix: clientId?.slice(0, 10) || "none",
            hasClientSecret: !!clientSecret,
            secretLength: clientSecret?.length || 0,
            grantType: grantType || "not provided"
        });

        if (!clientId || !clientSecret) {
            console.warn("[Uber Token] FAILED - Missing credentials");
            return NextResponse.json(
                { error: "invalid_request", error_description: "Missing client_id or client_secret" },
                { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
            );
        }

        // 2. Validate Credentials against stored config
        const container = await getContainer();
        const { resources } = await container.items.query({
            query: "SELECT * FROM c WHERE c.id = @id AND c.wallet = @wallet",
            parameters: [
                { name: "@id", value: "ubereats_platform_config:portalpay" },
                { name: "@wallet", value: "portalpay" }
            ]
        }).fetchAll();
        const resource = resources[0];

        if (!resource || !resource.webhookClientId || !resource.webhookClientSecret) {
            console.error("[Uber Token] Platform config missing or incomplete");
            return NextResponse.json(
                { error: "invalid_client", error_description: "Server not configured" },
                { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
            );
        }

        const validId = await decrypt(resource.webhookClientId);
        const validSecret = await decrypt(resource.webhookClientSecret);

        console.log("[Uber Token] Comparing credentials:", {
            providedIdPrefix: clientId?.slice(0, 8),
            expectedIdPrefix: validId?.slice(0, 8),
            idsMatch: clientId === validId,
            providedSecretPrefix: clientSecret?.slice(0, 10),
            expectedSecretPrefix: validSecret?.slice(0, 10),
            providedSecretLength: clientSecret?.length,
            expectedSecretLength: validSecret?.length,
            secretsMatch: clientSecret === validSecret
        });

        if (clientId !== validId || clientSecret !== validSecret) {
            console.warn("[Uber Token] Credential mismatch");
            return NextResponse.json(
                { error: "invalid_client", error_description: "Credentials do not match" },
                { status: 401, headers: { "Access-Control-Allow-Origin": "*" } }
            );
        }

        // 3. Generate Access Token
        const accessToken = `wh_tok_${crypto.randomBytes(32).toString("hex")}`;
        const expiresIn = 3600; // 1 hour

        // 4. Store Token with TTL (soft expiration check in code)
        // Storing in same container, different partition/id pattern "webhook_tokens"
        // Ideally we'd use Cosmos TTL but keeping it simple with logic check
        await container.items.create({
            id: `wh_token:${accessToken}`,
            partitionKey: "portalpay", // Kept simple
            wallet: "portalpay", // Critical for PK
            type: "webhook_access_token",
            expiresAt: Date.now() + (expiresIn * 1000)
        });

        // Default scope - Uber expects 'testScope' during registration
        const defaultScopes = "testScope";
        const finalScope = requestedScope || defaultScopes;

        console.log("[Uber Token] SUCCESS - Token generated:", {
            tokenPrefix: accessToken.slice(0, 15),
            expiresIn,
            scope: finalScope
        });

        // 5. Response with CORS
        const response = NextResponse.json({
            access_token: accessToken,
            token_type: "Bearer",
            expires_in: expiresIn,
            scope: finalScope
        });

        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

        return response;

    } catch (err: any) {
        console.error("Token Error:", err);
        return NextResponse.json(
            { error: "server_error", error_description: err.message },
            {
                status: 500,
                headers: { "Access-Control-Allow-Origin": "*" }
            }
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}
