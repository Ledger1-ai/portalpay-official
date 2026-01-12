import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        // Basic validation of body could be added here

        // UCP Session Creation
        // We expect an optional cart or lineItems in the body, or just an empty session start
        const container = await getContainer();

        // Use a unique ID for the session
        const sessionId = crypto.randomUUID();

        // Default empty cart if not provided
        const cart = body.cart || { items: [] };

        const sessionDoc = {
            id: `ucp_session_${sessionId}`,
            type: "ucp_session",
            status: "active", // active, completed, abandoned
            cart: cart,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            wallet: body.wallet || "anonymous", // Optional wallet if known
            currency: "USD",
            metadata: body.metadata || {}
        };

        await container.items.create(sessionDoc);

        // Return the session in UCP format
        // UCP format might strictly require certain fields, adhering to a basic JSON representation here
        return NextResponse.json({
            id: sessionId,
            status: "active",
            cart: cart,
            url: `${req.nextUrl.origin}/api/ucp/checkout-sessions/${sessionId}`
        }, { status: 201 });

    } catch (error) {
        console.error("Error creating UCP checkout session:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
