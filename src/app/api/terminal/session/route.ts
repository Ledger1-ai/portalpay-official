import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

// GET: Fetch session details (for re-hydration or check)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sessionId = searchParams.get("sessionId");
        const merchantWallet = req.headers.get("x-wallet"); // Passed from client context if possible, or we rely on just ID

        if (!sessionId) {
            return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
        }

        const container = await getContainer();

        // If we have merchantWallet, we can do a direct point read/query efficiently. 
        // If not, we query by ID (assuming ID is unique).
        // Since session ID is UUID, query is fine.

        const querySpec = {
            query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'terminal_session'",
            parameters: [{ name: "@id", value: sessionId }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();

        if (!resources || resources.length === 0) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        const session = resources[0];

        // Aggregate stats from receipts for this session
        const statsQuery = {
            query: "SELECT VALUE { totalSales: SUM(c.totalUsd), totalTips: SUM(c.tipAmount), count: COUNT(1) } FROM c WHERE c.type = 'receipt' AND c.sessionId = @sid",
            parameters: [{ name: "@sid", value: sessionId }]
        };

        // Let's fetch total sales and tips.
        const { resources: stats } = await container.items.query(statsQuery).fetchAll();
        const aggregated = stats[0] || { totalSales: 0, totalTips: 0, count: 0 };

        return NextResponse.json({
            session: {
                ...session,
                totalSales: aggregated.totalSales || 0,
                totalTips: aggregated.totalTips || 0,
                transactionCount: aggregated.count || 0
            }
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: End Session (Clock Out)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sessionId, merchantWallet } = body;

        if (!sessionId || !merchantWallet) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const container = await getContainer();
        const w = String(merchantWallet).toLowerCase();

        // Fetch valid session
        const { resource: session } = await container.item(sessionId, w).read();

        if (!session) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        if (session.endTime) {
            return NextResponse.json({ success: true, message: "Already ended" });
        }

        const now = Math.floor(Date.now() / 1000);

        // Aggregate stats before closing
        const statsQuery = {
            query: "SELECT VALUE { totalSales: SUM(c.totalUsd), totalTips: SUM(c.tipAmount) } FROM c WHERE c.type = 'receipt' AND c.sessionId = @sid",
            parameters: [{ name: "@sid", value: sessionId }]
        };
        const { resources: stats } = await container.items.query(statsQuery).fetchAll();
        const agg = stats[0] || { totalSales: 0, totalTips: 0 };

        // Patch update
        const ops = [
            { op: "set", path: "/endTime", value: now },
            { op: "set", path: "/totalSales", value: agg.totalSales || 0 },
            { op: "set", path: "/totalTips", value: agg.totalTips || 0 },
            { op: "add", path: "/tipsPaid", value: false }
        ] as any[];

        await container.item(sessionId, w).patch(ops);

        return NextResponse.json({ success: true, endTime: now });

    } catch (e: any) {
        console.error("Session update failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
