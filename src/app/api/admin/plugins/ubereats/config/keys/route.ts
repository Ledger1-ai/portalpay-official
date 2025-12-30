
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * GENERATE new Webhook OAuth Credentials
 * WARN: This invalidates previous keys.
 */
export async function POST(req: NextRequest) {
    try {
        // 1. Admin Auth
        const auth = await requireThirdwebAuth(req);
        if (!auth.roles.includes("admin")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 2. Generate Secure Random Keys
        const clientId = `ue_${crypto.randomBytes(12).toString("hex")}`;
        const clientSecret = `sec_${crypto.randomBytes(24).toString("hex")}`;

        console.log("[Uber Keys] Generated new credentials:", {
            clientIdPrefix: clientId.slice(0, 10),
            secretPrefix: clientSecret.slice(0, 10),
            secretLength: clientSecret.length
        });

        // 3. Encrypt for Storage
        const encClientId = await encrypt(clientId);
        const encClientSecret = await encrypt(clientSecret);

        console.log("[Uber Keys] Encrypted credentials:", {
            encClientIdLength: encClientId.length,
            encClientSecretLength: encClientSecret.length
        });

        // 4. Update Config in Cosmos
        const container = await getContainer();

        // Query for existing document
        const { resources } = await container.items.query({
            query: "SELECT * FROM c WHERE c.id = @id AND c.wallet = @wallet",
            parameters: [
                { name: "@id", value: "ubereats_platform_config:portalpay" },
                { name: "@wallet", value: "portalpay" }
            ]
        }).fetchAll();
        const existing = resources[0];

        console.log("[Uber Keys] Existing document:", {
            found: !!existing,
            hasWebhookClientId: !!existing?.webhookClientId
        });

        const doc = {
            ...(existing || {}),
            id: "ubereats_platform_config:portalpay",
            partitionKey: "portalpay",
            wallet: "portalpay", // Critical for partition key alignment
            webhookClientId: encClientId,
            webhookClientSecret: encClientSecret,
            updatedAt: Date.now(),
            updatedBy: auth.wallet
        };

        console.log("[Uber Keys] Saving document with fields:", Object.keys(doc));

        const result = await container.items.upsert(doc);

        console.log("[Uber Keys] Upsert result:", {
            success: !!result.resource,
            resourceId: result.resource?.id
        });

        // 5. Return RAW keys to user (ONCE)
        return NextResponse.json({
            clientId,
            clientSecret,
            warning: "These credentials will not be shown again. Save them."
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
