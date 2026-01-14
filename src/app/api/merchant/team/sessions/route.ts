import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function GET(req: NextRequest) {
    try {
        const walletHeader = req.headers.get("x-wallet") || "";
        if (!walletHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const merchantWallet = walletHeader.toLowerCase();
        const memberId = req.nextUrl.searchParams.get("memberId") || "";

        if (!memberId) {
            return NextResponse.json({ error: "memberId required" }, { status: 400 });
        }

        const container = await getContainer();

        // Fetch all sessions for this employee
        const sessionsQuery = {
            query: `SELECT c.id, c.startTime, c.endTime, c.totalSales, c.totalTips, c.tipsPaid, c.tipsPaidAt 
                    FROM c 
                    WHERE c.type='terminal_session' 
                    AND c.merchantWallet=@w 
                    AND c.staffId=@memberId 
                    ORDER BY c.startTime DESC`,
            parameters: [
                { name: "@w", value: merchantWallet },
                { name: "@memberId", value: memberId }
            ]
        };

        const { resources: sessions } = await container.items.query(sessionsQuery).fetchAll();

        return NextResponse.json({ sessions });

    } catch (e: any) {
        console.error("Failed to fetch member sessions", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
