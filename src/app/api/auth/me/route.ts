import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedWallet, requireThirdwebAuth } from "@/lib/auth";
import { getContainer } from "@/lib/cosmos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Validate auth via cookie/JWT
    const wallet = await getAuthenticatedWallet(req);
    if (!wallet) {
      return NextResponse.json({ authed: false }, { status: 401 });
    }

    // Try to enrich with roles (non-fatal if unavailable)
    let roles: string[] = [];
    try {
      const authz = await requireThirdwebAuth(req);
      if (authz && Array.isArray(authz.roles)) {
        roles = authz.roles;
      }
    } catch {
      // ignore, roles remain []
    }

    // Check for Shop Config status (for Partner Access Gating)
    let shopStatus = "none";
    try {
      const brandKey = (process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "basaltsurge").toLowerCase();
      const container = await getContainer();
      const query = "SELECT top 1 c.status FROM c WHERE c.type = 'shop_config' AND c.wallet = @w AND c.brandKey = @b";
      const { resources } = await container.items.query({
        query,
        parameters: [{ name: "@w", value: wallet }, { name: "@b", value: brandKey }]
      }).fetchAll();
      if (resources.length > 0) {
        shopStatus = resources[0].status || "approved";
      }
    } catch (e) {
      // ignore, default to none
    }

    return NextResponse.json({ authed: true, wallet, roles, shopStatus });
  } catch (e: any) {
    return NextResponse.json({ authed: false, error: e?.message || "failed" }, { status: 500 });
  }
}
