import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { merchantWallet, pin } = body;

        if (!merchantWallet || !pin) {
            return NextResponse.json({ error: "Missing wallet or PIN" }, { status: 400 });
        }

        const container = await getContainer();

        const { createHash } = await import("node:crypto");
        const pinHash = createHash("sha256").update(String(pin)).digest("hex");

        // Query for team member
        // Partition key is merchantWallet
        // We need to find a member with this wallet and pinHash
        const querySpec = {
            query: "SELECT * FROM c WHERE c.type = 'merchant_team_member' AND c.merchantWallet = @wallet AND c.pinHash = @hash AND c.active = true",
            parameters: [
                { name: "@wallet", value: merchantWallet.toLowerCase() },
                { name: "@hash", value: pinHash }
            ]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();

        if (resources.length === 0) {
            return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
        }

        const member = resources[0];

        // Return basic member info (no hash)
        return NextResponse.json({
            success: true,
            member: {
                id: member.id,
                name: member.name,
                role: member.role
            }
        });

    } catch (e: any) {
        console.error("Auth failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
