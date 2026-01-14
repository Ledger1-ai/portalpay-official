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
