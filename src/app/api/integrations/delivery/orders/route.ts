
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireThirdwebAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET: Fetch Uber Eats orders for the connected store
 * 
 * Query params:
 * - storeId: Filter by store (optional, uses connected store if not provided)
 * - status: Filter by status (optional)
 * - limit: Max results (default 20)
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireThirdwebAuth(req);
        const wallet = auth.wallet;

        const { searchParams } = new URL(req.url);
        const storeId = searchParams.get("storeId");
        const status = searchParams.get("status");
        const limit = parseInt(searchParams.get("limit") || "20", 10);

        const container = await getContainer();

        // Build query
        let query = "SELECT * FROM c WHERE c.type='uber_eats_order'";
        const parameters: { name: string; value: string }[] = [];

        if (storeId) {
            query += " AND c.storeId=@storeId";
            parameters.push({ name: "@storeId", value: storeId });
        }

        if (status) {
            query += " AND c.status=@status";
            parameters.push({ name: "@status", value: status.toUpperCase() });
        }

        query += " ORDER BY c.placedAt DESC";

        const { resources: orders } = await container.items.query({
            query,
            parameters
        }).fetchAll();

        // Calculate stats
        const now = Date.now();
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const weekStart = now - 7 * 24 * 60 * 60 * 1000;

        const todaysOrders = orders.filter((o: any) => o.placedAt >= todayStart);
        const weeksOrders = orders.filter((o: any) => o.placedAt >= weekStart);

        const stats = {
            activeOrders: orders.filter((o: any) =>
                ["CREATED", "ACCEPTED", "PREPARING", "READY"].includes(o.status)
            ).length,
            completedToday: todaysOrders.filter((o: any) => o.status === "DELIVERED").length,
            pendingOrders: orders.filter((o: any) => o.status === "CREATED").length,
            cancelledToday: todaysOrders.filter((o: any) => o.status === "CANCELLED").length,
            revenueToday: todaysOrders
                .filter((o: any) => o.status !== "CANCELLED")
                .reduce((sum: number, o: any) => sum + (o.total || 0), 0) / 100, // cents to dollars
            ordersThisWeek: weeksOrders.length,
            revenueThisWeek: weeksOrders
                .filter((o: any) => o.status !== "CANCELLED")
                .reduce((sum: number, o: any) => sum + (o.total || 0), 0) / 100,
            averageDeliveryTime: 28 // Placeholder - would calculate from actual delivery times
        };

        // Format orders for response
        const formattedOrders = orders.slice(0, limit).map((order: any) => ({
            id: order.orderId,
            orderNumber: `UE-${order.orderId?.slice(-4)?.toUpperCase() || "0000"}`,
            customerName: order.customerName || "Customer",
            items: order.items?.length || 0,
            total: (order.total || 0) / 100, // cents to dollars
            status: order.status?.toLowerCase().replace(" ", "_") || "pending",
            createdAt: order.placedAt || order.createdAt,
            estimatedDelivery: order.estimatedReadyTime
        }));

        return NextResponse.json({
            orders: formattedOrders,
            stats,
            total: orders.length
        });

    } catch (err: any) {
        console.error("[Orders API] Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
