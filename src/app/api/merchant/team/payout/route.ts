import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function POST(req: NextRequest) {
    try {
        const walletHeader = req.headers.get("x-wallet") || "";
        if (!walletHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const merchantWallet = walletHeader.toLowerCase();

        const body = await req.json().catch(() => ({}));
        const { staffId, sessionIds } = body;

        if (!staffId && (!Array.isArray(sessionIds) || sessionIds.length === 0)) {
            return NextResponse.json({ error: "Missing staffId or sessionIds" }, { status: 400 });
        }

        const container = await getContainer();
        const now = Math.floor(Date.now() / 1000);

        // Find target sessions
        let targetIds: string[] = [];

        if (Array.isArray(sessionIds) && sessionIds.length > 0) {
            targetIds = sessionIds;
        } else if (staffId) {
            const query = {
                query: "SELECT c.id FROM c WHERE c.type='terminal_session' AND c.merchantWallet=@w AND c.staffId=@sid AND (NOT IS_DEFINED(c.tipsPaid) OR c.tipsPaid=false) AND IS_DEFINED(c.endTime)",
                parameters: [
                    { name: "@w", value: merchantWallet },
                    { name: "@sid", value: staffId }
                ]
            };
            const { resources } = await container.items.query(query).fetchAll();
            targetIds = resources.map((r: any) => r.id);
        }

        if (targetIds.length === 0) {
            return NextResponse.json({ success: true, count: 0, message: "No unpaid sessions found" });
        }

        // Execute patches concurrently (batching would be better but simple concurrency is OK for reasonable size)
        // Cosmos patch requires partition key. Session ID is unique?
        // Partition key for terminal_session is `merchantWallet` usually?
        // Wait, in `session/route.ts` I used `container.item(sessionId, w).patch(...)`.
        // So `merchantWallet` IS the partition key.

        const promises = targetIds.map(id => {
            return container.item(id, merchantWallet).patch([
                { op: "set", path: "/tipsPaid", value: true },
                { op: "set", path: "/tipsPaidAt", value: now }
            ]).catch(e => {
                console.error(`Failed to pay out session ${id}`, e);
                return null;
            });
        });

        await Promise.all(promises);

        return NextResponse.json({ success: true, count: targetIds.length });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
