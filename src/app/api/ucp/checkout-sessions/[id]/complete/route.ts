import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const container = await getContainer();

        // 1. Fetch Session
        const { resources } = await container.items
            .query({
                query: "SELECT * FROM c WHERE c.id = @id",
                parameters: [{ name: "@id", value: `ucp_session_${id}` }]
            })
            .fetchAll();
        const doc = resources[0];

        if (!doc) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        if (doc.status === "completed") {
            return NextResponse.json({ error: "Session already completed" }, { status: 400 });
        }

        // 2. Logic to "Complete" the session
        // In a real UCP flow, this might trigger the actual payment processing or finalize the order.
        // For x402, the payment happens via the "pay" challenge usually.
        // If this is a UCP "complete", it implies the agent has decided to buy. 
        // We should probably check if it's paid or just convert it to an Order.

        // For now, we will mark it as completed and return a mock order confirmation.
        // Ideally, we would call the internal Order creation logic here if payment was verified.

        doc.status = "completed";
        doc.completedAt = new Date().toISOString();

        await container.items.upsert(doc);

        return NextResponse.json({
            id: id,
            status: "completed",
            orderId: `ord_${crypto.randomUUID().split("-")[0]}`, // Mock order ID for now
            message: "Order placed successfully via UCP"
        });

    } catch (error) {
        console.error("Error completing UCP session:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
