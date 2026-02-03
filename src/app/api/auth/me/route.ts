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

        // AUTHORITATIVE: Check client_request status FIRST
        // This is the source of truth for approval/pending/blocked/rejected status
        const clientRequestQuery = "SELECT top 1 c.status FROM c WHERE c.type = 'client_request' AND c.wallet = @w AND c.brandKey = @b";
        console.log("[AuthMe] Checking Access:", { wallet, brandKey, isPlatformAdmin });
        const { resources: clientRequestResources } = await container.items.query({
          query: clientRequestQuery,
          parameters: [{ name: "@w", value: wallet.toLowerCase() }, { name: "@b", value: brandKey }]
        }).fetchAll();
        console.log("[AuthMe] ClientRequest Result:", clientRequestResources);

        if (clientRequestResources.length > 0) {
          const requestStatus = clientRequestResources[0].status;
          if (requestStatus === "approved") {
            shopStatus = "approved";
          } else if (requestStatus === "pending") {
            shopStatus = "pending";
          } else if (requestStatus === "blocked") {
            blocked = true;
          } else if (requestStatus === "rejected") {
            shopStatus = "rejected";
          }
        }

        // LEGACY FALLBACK: If no client_request exists, check if shop_config exists with setupComplete=true
        // This supports merchants who were approved before the client_request system existed
        if (shopStatus === "none" && !blocked) {
          const legacyShopQuery = "SELECT top 1 c.setupComplete FROM c WHERE (c.type = 'shop_config' OR c.type = 'site_config') AND c.wallet = @w AND c.brandKey = @b AND c.setupComplete = true";
          const { resources: legacyResources } = await container.items.query({
            query: legacyShopQuery,
            parameters: [{ name: "@w", value: wallet }, { name: "@b", value: brandKey }]
          }).fetchAll();
          console.log("[AuthMe] Legacy Shop Result:", legacyResources);

          if (legacyResources.length > 0) {
            // Legacy approved merchant - has a completed shop config but no client_request
            shopStatus = "approved";
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
