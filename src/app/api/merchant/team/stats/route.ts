import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function GET(req: NextRequest) {
    try {
        const walletHeader = req.headers.get("x-wallet") || "";
        if (!walletHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const merchantWallet = walletHeader.toLowerCase();
        const container = await getContainer();

        // 1. Fetch all receipts for this merchant to aggregate sales by employee
        // Note: For high volume, this might need pagination or accurate indexing. 
        // We limit to last 1000 or similar for performance if needed, but for now we try full agg (careful with RU).
        // A better optimized way is to maintain a "stats" document or aggregated view.
        // For this implementation, we'll try a GROUP BY logic if simpler, or just fetch all heavy.
        // Cosmos GROUP BY is supported.
        const salesQuery = {
            query: "SELECT c.employeeId, SUM(c.totalUsd) as total, SUM(c.tipAmount) as tips FROM c WHERE c.type='receipt' AND c.wallet=@w AND IS_DEFINED(c.employeeId) GROUP BY c.employeeId",
            parameters: [{ name: "@w", value: merchantWallet }]
        };

        let salesMap: Record<string, number> = {};
        let tipsMap: Record<string, number> = {};
        try {
            const { resources } = await container.items.query(salesQuery).fetchAll();
            resources.forEach((r: any) => {
                if (r.employeeId) {
                    salesMap[r.employeeId] = r.total;
                    tipsMap[r.employeeId] = r.tips || 0;
                }
            });
        } catch (e) {
            console.warn("Stats agg failed, falling back to empty", e);
        }

        // 2. Fetch last active session and Unpaid Tips
        const sessionQuery = {
            query: "SELECT c.staffId, MAX(c.startTime) as lastActive, SUM(c.totalTips) as unpaidTips FROM c WHERE c.type='terminal_session' AND c.merchantWallet=@w AND (NOT IS_DEFINED(c.tipsPaid) OR c.tipsPaid=false) GROUP BY c.staffId",
            parameters: [{ name: "@w", value: merchantWallet }]
        };
        // Note: SUM(totalTips) only works if sessions were closed with the new logic. Old sessions have undefined totalTips (0).

        const lastActiveQuery = {
            query: "SELECT c.staffId, MAX(c.startTime) as lastActive FROM c WHERE c.type='terminal_session' AND c.merchantWallet=@w GROUP BY c.staffId",
            parameters: [{ name: "@w", value: merchantWallet }]
        };

        let sessionMap: Record<string, number> = {};
        let unpaidTipsMap: Record<string, number> = {};

        try {
            // Unpaid Tips
            const { resources: unpaid } = await container.items.query(sessionQuery).fetchAll();
            unpaid.forEach((r: any) => {
                // The query above groups by staffId.
                // However, MAX(startTime) is scoped to the UNPAID sessions, which is wrong for "Last Active".
                // "Last Active" should be global.
                if (r.staffId) unpaidTipsMap[r.staffId] = r.unpaidTips || 0;
            });

            // Last Active (Global)
            const { resources: active } = await container.items.query(lastActiveQuery).fetchAll();
            active.forEach((r: any) => {
                if (r.staffId) sessionMap[r.staffId] = r.lastActive;
            });

        } catch (e) {
            console.warn("Session agg failed", e);
        }

        return NextResponse.json({ sales: salesMap, tips: tipsMap, unpaidTips: unpaidTipsMap, sessions: sessionMap });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
