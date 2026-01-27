import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { createHash, randomUUID } from "node:crypto";

export async function GET(req: NextRequest) {
    try {
        const merchantWallet = req.headers.get("x-wallet");
        if (!merchantWallet) {
            return NextResponse.json({ error: "Wallet required" }, { status: 401 });
        }

        const container = await getContainer();
        const w = String(merchantWallet).toLowerCase();

        // Enforce Partner Isolation
        const ct = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
        const branding = {
            key: String(process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "").toLowerCase()
        };

        if (ct === "partner") {
            if (!branding.key) return NextResponse.json({ error: "Configuration error" }, { status: 500 });

            // Verify merchant matches brand
            const querySpec = {
                query: "SELECT c.brandKey FROM c WHERE c.type = 'shop_config' AND c.wallet = @w",
                parameters: [{ name: "@w", value: w }]
            };
            const { resources: shops } = await container.items.query(querySpec).fetchAll();
            const shopBrand = String(shops?.[0]?.brandKey || "portalpay").toLowerCase();

            if (shopBrand !== branding.key) {
                return NextResponse.json({ error: "Unauthorized for this brand" }, { status: 403 });
            }
        }

        const querySpec = {
            query: "SELECT c.id, c.name, c.role FROM c WHERE c.type = 'merchant_team_member' AND c.merchantWallet = @w",
            parameters: [{ name: "@w", value: w }]
        };

        const { resources: members } = await container.items.query(querySpec).fetchAll();

        return NextResponse.json({ members });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const merchantWallet = req.headers.get("x-wallet");
        if (!merchantWallet) {
            return NextResponse.json({ error: "Wallet required" }, { status: 401 });
        }

        const body = await req.json();
        const { name, role, pin } = body;

        if (!name || !pin) {
            return NextResponse.json({ error: "Name and PIN required" }, { status: 400 });
        }

        const container = await getContainer();
        const w = String(merchantWallet).toLowerCase();
        const pinHash = createHash("sha256").update(String(pin)).digest("hex");

        const newMember = {
            id: randomUUID(),
            type: "merchant_team_member",
            merchantWallet: w,
            name,
            role: role || "staff",
            pinHash,
            createdAt: Math.floor(Date.now() / 1000)
        };

        await container.items.create(newMember);

        return NextResponse.json({ success: true, member: newMember });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const merchantWallet = req.headers.get("x-wallet");
        if (!merchantWallet) {
            return NextResponse.json({ error: "Wallet required" }, { status: 401 });
        }

        const body = await req.json();
        const { id, name, role, pin } = body;

        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        const container = await getContainer();
        const { resource: member } = await container.item(id, id).read();

        // Security check: ensure member belongs to this merchant
        if (!member || member.merchantWallet !== merchantWallet.toLowerCase()) {
            return NextResponse.json({ error: "Member not found" }, { status: 404 });
        }

        const updates: any = {};
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (pin) updates.pinHash = createHash("sha256").update(String(pin)).digest("hex");

        const updatedMember = { ...member, ...updates };
        await container.item(id, id).replace(updatedMember);

        return NextResponse.json({ success: true, member: updatedMember });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const merchantWallet = req.headers.get("x-wallet");
        if (!merchantWallet) {
            return NextResponse.json({ error: "Wallet required" }, { status: 401 });
        }

        const body = await req.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        const container = await getContainer();
        const { resource: member } = await container.item(id, id).read();

        if (!member || member.merchantWallet !== merchantWallet.toLowerCase()) {
            return NextResponse.json({ error: "Member not found" }, { status: 404 });
        }

        await container.item(id, id).delete();

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
