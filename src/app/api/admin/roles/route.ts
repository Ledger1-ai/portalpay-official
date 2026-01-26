import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getAuthenticatedWallet } from "@/lib/auth";
import { isPlatformSuperAdmin } from "@/lib/authz";
import { getEnv } from "@/lib/env";
import { logAdminAction } from "@/lib/audit";

const DOC_ID = "admin_roles";
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const wallet = await getAuthenticatedWallet(req);
        if (!wallet || !isPlatformSuperAdmin(wallet)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const c = await getContainer();
        const { resource } = await c.item(DOC_ID, "global").read(); // Partition key 'global' for platform-wide admins

        // Fallback to env vars if no DB record exists (Bootstrap mode)
        if (!resource || !Array.isArray(resource.admins)) {
            const env = getEnv();
            const owner = String(env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
            const envAdmins = (env.ADMIN_WALLETS || []).map(a => String(a || "").toLowerCase());

            const bootstrapList: { wallet: string; role: string; name: string }[] = [];
            if (owner) bootstrapList.push({ wallet: owner, role: "platform_super_admin", name: "Owner" });
            envAdmins.forEach(a => {
                if (a && a !== owner) bootstrapList.push({ wallet: a, role: "platform_super_admin", name: "Admin (Env)" });
            });

            return NextResponse.json({ admins: bootstrapList, source: "env" });
        }

        return NextResponse.json({ admins: resource.admins, source: "db" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const wallet = await getAuthenticatedWallet(req);
        if (!wallet || !isPlatformSuperAdmin(wallet)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { admins } = body;

        if (!Array.isArray(admins)) {
            return NextResponse.json({ error: "Invalid body: admins must be an array" }, { status: 400 });
        }

        // Validation: Ensure at least one Super Admin remains
        const superAdmins = admins.filter((a: any) => a.role === "platform_super_admin");
        if (superAdmins.length === 0) {
            return NextResponse.json({ error: "Cannot remove the last Super Admin" }, { status: 400 });
        }

        const doc = {
            id: DOC_ID,
            wallet: "global", // Partition Key
            type: "admin_roles",
            updatedAt: new Date().toISOString(),
            updatedBy: wallet,
            admins: admins.map((a: any) => ({
                wallet: String(a.wallet || "").toLowerCase().trim(),
                role: String(a.role || "platform_admin"), // Default to General Admin
                name: String(a.name || "").slice(0, 100),
                email: String(a.email || "").slice(0, 100)
            })).filter((a: any) => /^0x[a-f0-9]{40}$/.test(a.wallet))
        };

        const c = await getContainer();

        // Fetch previous state for diffing
        const { resource: prevResource } = await c.item(DOC_ID, "global").read();
        const oldAdmins = Array.isArray(prevResource?.admins) ? prevResource.admins : [];
        const oldMap = new Map<string, any>(oldAdmins.map((a: any) => [a.wallet.toLowerCase(), a]));

        // Upsert new state
        const { resource } = await c.items.upsert(doc);

        // Calculate Diff
        const newAdmins = resource?.admins || [];
        const newMap = new Map<string, any>(newAdmins.map((a: any) => [a.wallet.toLowerCase(), a]));
        const actorName = newMap.get(wallet.toLowerCase())?.name || oldMap.get(wallet.toLowerCase())?.name || wallet;

        const changes: string[] = [];

        // Check for additions and updates
        for (const [w, newUser] of newMap.entries()) {
            const oldUser = oldMap.get(w);
            if (!oldUser) {
                changes.push(`Added admin ${newUser.name || w} as ${formatRole(newUser.role)}`);
            } else {
                if (oldUser.role !== newUser.role) {
                    changes.push(`Changed role for ${newUser.name || w} from ${formatRole(oldUser.role)} to ${formatRole(newUser.role)}`);
                }
                if (oldUser.name !== newUser.name) {
                    changes.push(`Renamed admin ${w} from "${oldUser.name}" to "${newUser.name}"`);
                }
                if (oldUser.email !== newUser.email) {
                    changes.push(`Updated email for ${newUser.name || w}`);
                }
            }
        }

        // Check for removals
        for (const [w, oldUser] of oldMap.entries()) {
            if (!newMap.has(w)) {
                changes.push(`Removed admin ${oldUser.name || w}`);
            }
        }

        if (changes.length > 0) {
            logAdminAction(wallet, "update_admin_roles", {
                summary: `${changes.length} changes made`,
                changes,
                updatedBy: actorName
            });
        }

        return NextResponse.json({ success: true, admins: resource?.admins || [] });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

function formatRole(r: string) {
    return r.replace(/_/g, ' ').replace('platform', '').trim();
}
