import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const container = await getContainer();
        const { resource: session } = await container.item(`ucp_session_${id}`, "anonymous").read(); // Partition key might be tricky if variable

        // If we used partitionKey="/wallet", and defaulted to "anonymous" or user's wallet
        // We need to know the partition key to read efficiently. 
        // In strict Cosmos NoSQL, we need the partition key. 
        // For this implementation, let's try a query if direct read fails or if PK is unknown.
        // Or, for simplicity in this specific "Getting Started" impl, strict reliance on the query is safer without knowing the wallet upfront.

        let doc = session;
        if (!doc) {
            const { resources } = await container.items
                .query({
                    query: "SELECT * FROM c WHERE c.id = @id",
                    parameters: [{ name: "@id", value: `ucp_session_${id}` }]
                })
                .fetchAll();
            doc = resources[0];
        }

        if (!doc) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 });
        }

        return NextResponse.json({
            id: id,
            status: doc.status,
            cart: doc.cart,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            url: `${req.nextUrl.origin}/api/ucp/checkout-sessions/${id}`
        });

    } catch (error) {
        console.error("Error retrieving UCP session:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await req.json();
        const container = await getContainer();

        // 1. Fetch existing
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

        // 2. Update fields
        if (body.cart) {
            doc.cart = body.cart;
        }
        if (body.status) {
            doc.status = body.status;
        }
        if (body.wallet) {
            doc.wallet = body.wallet;
        }
        doc.updatedAt = new Date().toISOString();

        // 3. Save
        await container.items.upsert(doc);

        return NextResponse.json({
            id: id,
            status: doc.status,
            cart: doc.cart,
            updatedAt: doc.updatedAt,
            url: `${req.nextUrl.origin}/api/ucp/checkout-sessions/${id}`
        });

    } catch (error) {
        console.error("Error updating UCP session:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
