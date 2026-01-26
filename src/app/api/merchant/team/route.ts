import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireRole } from "@/lib/auth";
import { TeamMember } from "@/types/merchant-features";
import { randomUUID } from "node:crypto";

// GET: List team members for the authenticated merchant
export async function GET(req: NextRequest) {
    try {
        const container = await getContainer();

        const walletHeader = req.headers.get("x-wallet") || "";
        if (!walletHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const merchantWallet = walletHeader.toLowerCase();

        // Query by partition key (merchantWallet) if possible, or just query.
        // Assuming container partition key is /merchant or similar, we must include it in query or feed options.
        const querySpec = {
            query: "SELECT * FROM c WHERE c.type = 'merchant_team_member' AND c.merchantWallet = @wallet",
            parameters: [{ name: "@wallet", value: merchantWallet }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();

        const sanitized = resources.map((r: any) => ({
            ...r,
            pinHash: undefined // mask it
        }));

        return NextResponse.json({ items: sanitized });
    } catch (e: any) {
        console.error("GET team failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Add new team member
export async function POST(req: NextRequest) {
    try {
        const container = await getContainer();
        const body = await req.json();
        const walletHeader = req.headers.get("x-wallet") || "";
        if (!walletHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const merchantWallet = walletHeader.toLowerCase();

        if (!body.name || !body.pin || !body.role) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const { createHash } = await import("node:crypto");
        const pinHash = createHash("sha256").update(String(body.pin)).digest("hex");

        const newMember: TeamMember & { type: string, merchantWallet: string, merchant: string, linkedWallet?: string } = {
            id: randomUUID(),
            type: "merchant_team_member",
            merchant: merchantWallet, // Partition key
            merchantWallet,
            name: body.name,
            pinHash,
            role: body.role,
            active: true,
            linkedWallet: body.linkedWallet ? String(body.linkedWallet).toLowerCase() : undefined,
            createdAt: Math.floor(Date.now() / 1000),
            updatedAt: Math.floor(Date.now() / 1000)
        };

        await container.items.create(newMember);

        return NextResponse.json({ success: true, item: { ...newMember, pinHash: undefined } });

    } catch (e: any) {
        console.error("POST team failed", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// PATCH: Update team member
export async function PATCH(req: NextRequest) {
    try {
        const container = await getContainer();
        const body = await req.json();
        const walletHeader = req.headers.get("x-wallet") || "";
        if (!walletHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const merchantWallet = walletHeader.toLowerCase();

        if (!body.id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

        // Retrieve existing
        const { resource: existing } = await container.item(body.id, merchantWallet).read();
        if (!existing) return NextResponse.json({ error: "Member not found" }, { status: 404 });

        const ops: { op: string; path: string; value: any }[] = [];
        if (body.name) ops.push({ op: "set", path: "/name", value: body.name });
        if (body.role) ops.push({ op: "set", path: "/role", value: body.role });
        if (body.linkedWallet !== undefined) {
            ops.push({ op: "set", path: "/linkedWallet", value: body.linkedWallet ? String(body.linkedWallet).toLowerCase() : null });
        }

        if (body.pin) {
            const { createHash } = await import("node:crypto");
            const ph = createHash("sha256").update(String(body.pin)).digest("hex");
            ops.push({ op: "set", path: "/pinHash", value: ph });
        }

        ops.push({ op: "set", path: "/updatedAt", value: Math.floor(Date.now() / 1000) });

        if (ops.length > 0) {
            await container.item(body.id, merchantWallet).patch(ops as any);
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE: Remove team member
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        const walletHeader = req.headers.get("x-wallet") || "";
        if (!walletHeader || !id) return NextResponse.json({ error: "Unauthorized or missing ID" }, { status: 401 });

        const container = await getContainer();
        const merchantWallet = walletHeader.toLowerCase();

        try {
            // Pass partition key (merchantWallet) to item()
            await container.item(id, merchantWallet).delete();
        } catch (e) {
            return NextResponse.json({ error: "Not found or failed to delete" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
