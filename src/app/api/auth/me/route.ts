import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedWallet, requireThirdwebAuth } from "@/lib/auth";
import { getContainer } from "@/lib/cosmos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Validate auth via cookie/JWT
    // Validate auth via cookie/JWT
    let wallet = await getAuthenticatedWallet(req);
    let sessionAuthed = !!wallet;

    if (!wallet) {
      // Check for x-wallet header (Public status check for onboarding)
      // Allow any reasonable variation of a wallet address to avoid blocking status checks (strict auth happens later)
      const headerWallet = (req.headers.get("x-wallet") || "").trim();
      if (headerWallet && headerWallet.length >= 40) {
        wallet = headerWallet.toLowerCase();
      }
    }

    if (!wallet) {
      // Only 401 if we truly cannot identify the user at all
      return NextResponse.json({ authed: false }, { status: 401 });
    }

    // CRITICAL: Normalize wallet to lowercase for all DB queries
    // The DB stores wallets in lowercase (forced by POST).
    // If we use checksummed address here, Shop Config lookup fails (uses raw val),
    // but Pending lookup succeeds (uses .toLowerCase()).
    wallet = wallet.toLowerCase();

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
    let blocked = false;
    const platformWallet = (process.env.NEXT_PUBLIC_PLATFORM_WALLET || "").toLowerCase();
    const isPlatformAdmin = !!platformWallet && wallet.toLowerCase() === platformWallet;

    if (isPlatformAdmin) {
      // Platform Admin Bypass: Always approved, always admin
      shopStatus = "approved";
      if (!roles.includes("admin")) {
        roles.push("admin");
      }
    } else {
      try {
        const headerBrandKey = req.headers.get("x-brand-key");
        const brandKey = (headerBrandKey || process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "basaltsurge").toLowerCase();
        const container = await getContainer();

        // Check shop_config status
        // Check shop_config OR site_config status
        const shopQuery = "SELECT top 1 c.status, c.brandKey, c.id FROM c WHERE (c.type = 'shop_config' OR c.type = 'site_config') AND c.wallet = @w AND c.brandKey = @b";
        console.log("[AuthMe] Checking Access:", { wallet, brandKey, isPlatformAdmin });
        const { resources: shopResources } = await container.items.query({
          query: shopQuery,
          parameters: [{ name: "@w", value: wallet }, { name: "@b", value: brandKey }]
        }).fetchAll();
        console.log("[AuthMe] DB Result:", shopResources);
        if (shopResources.length > 0) {
          shopStatus = shopResources[0].status || "approved";
        }

        // Check if wallet is blocked via client_request
        const blockQuery = "SELECT top 1 c.status FROM c WHERE c.type = 'client_request' AND c.wallet = @w AND c.brandKey = @b AND c.status = 'blocked'";
        const { resources: blockResources } = await container.items.query({
          query: blockQuery,
          parameters: [{ name: "@w", value: wallet.toLowerCase() }, { name: "@b", value: brandKey }]
        }).fetchAll();
        if (blockResources.length > 0) {
          blocked = true;
        }

        // Check if wallet has a pending client_request (application awaiting approval)
        if (shopStatus === "none") {
          const pendingQuery = "SELECT top 1 c.status FROM c WHERE c.type = 'client_request' AND c.wallet = @w AND c.brandKey = @b AND c.status = 'pending'";
          const { resources: pendingResources } = await container.items.query({
            query: pendingQuery,
            parameters: [{ name: "@w", value: wallet.toLowerCase() }, { name: "@b", value: brandKey }]
          }).fetchAll();
          if (pendingResources.length > 0) {
            shopStatus = "pending";
          }
        }
      } catch (e) {
        // ignore, default to none
      }
    }

    return NextResponse.json({ authed: sessionAuthed, wallet, roles, shopStatus, isPlatformAdmin, blocked });
  } catch (e: any) {
    return NextResponse.json({ authed: false, error: e?.message || "failed" }, { status: 500 });
  }
}
