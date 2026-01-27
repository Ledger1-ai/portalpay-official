import { deploySplitContract } from "thirdweb/deploys";
import type { Account } from "thirdweb/wallets";
import { client, chain, getRecipientAddress } from "@/lib/thirdweb/client";
import { getBrandKey, getBrandConfig } from "@/config/brands";
import { buildApiUrl, buildBrandApiUrl } from "@/lib/http";

/**
 * Ensure a per-merchant Split contract is deployed and persisted.
 * - Checks existing split via /api/split/deploy GET (idempotent metadata store).
 * - If missing, deploys a Split contract using thirdweb (sponsored gas via AA wallet).
 * - Persists the deployed address via /api/split/deploy POST.
 *
 * Shares:
 *  - Merchant: 99.5% (9950 bps)
 *  - Platform: 0.5% (50 bps) -> NEXT_PUBLIC_RECIPIENT_ADDRESS
 *
 * Returns the split contract address if available or newly deployed; otherwise undefined.
 */
function isValidHexAddress(addr?: string): addr is `0x${string}` {
  try {
    return !!addr && /^0x[a-fA-F0-9]{40}$/.test(String(addr).trim());
  } catch {
    return false as any;
  }
}

export async function ensureSplitForWallet(
  account: Account | any,
  brandKeyOverride?: string,
  partnerFeeBpsOverride?: number,
  merchantWalletOverride?: string
): Promise<string | undefined> {
  try {
    const signerAddress = String((account?.address || "")).toLowerCase();
    const merchant = merchantWalletOverride ? String(merchantWalletOverride).toLowerCase() : signerAddress;

    if (!isValidHexAddress(merchant)) return undefined;

    // Resolve brand key: prefer override from caller, else env, else hostname fallback
    let brandKey: string | undefined = brandKeyOverride;
    if (!brandKey) {
      try {
        brandKey = getBrandKey();
      } catch {
        try {
          if (typeof window !== "undefined") {
            const host = window.location.hostname || "";
            const parts = host.split(".");
            // Fallback for Azure App Service subdomain style
            if (parts.length >= 3 && host.endsWith(".azurewebsites.net")) {
              brandKey = parts[0].toLowerCase();
            }
          }
        } catch { }
      }
    }

    if (!brandKey) {
      // Persist recipients (without address) for later binding and exit early
      try {
        await fetch(buildApiUrl("/api/split/deploy"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": merchant, "x-csrf": "1" },
          body: JSON.stringify({
            wallet: merchant,
            platformPct: 0.5,
          }),
        });
      } catch { }
      return undefined;
    }

    // Check existing split config (brand-scoped)
    try {
      const r = await fetch(buildBrandApiUrl(brandKey, `/api/split/deploy?wallet=${encodeURIComponent(merchant)}&brandKey=${encodeURIComponent(brandKey)}`), { cache: "no-store", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      const existing = String(j?.split?.address || "").toLowerCase();
      const rc = Array.isArray(j?.split?.recipients) ? j.split.recipients.length : 0;
      const partnerBrand = String(brandKey || "").toLowerCase() !== "portalpay" && String(brandKey || "").toLowerCase() !== "basaltsurge";
      // Client-side redundancy: treat 2-recipient splits as misconfigured in partner brands
      const clientMisconfigured = partnerBrand && rc > 0 && rc < 3;
      const needsRedeploy = !!(j?.misconfiguredSplit && j.misconfiguredSplit.needsRedeploy === true) || clientMisconfigured;
      if (isValidHexAddress(existing)) {
        if (!needsRedeploy) {
          return existing;
        }
        // Misconfigured existing split; proceed to deploy a new brand-scoped split with correct recipients
      }
      // If still misconfigured or no existing, fall through to redeploy with correct recipients
    } catch {
      // continue to deploy if read failed
    }

    // Resolve platform recipient from env
    const platform = String(getRecipientAddress() || "").toLowerCase();
    if (!isValidHexAddress(platform)) {
      // Cannot deploy without a valid platform recipient
      // Persist recipients (without address) for later binding
      try {
        await fetch(buildBrandApiUrl(brandKey, "/api/split/deploy"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": merchant, "x-csrf": "1" },
          credentials: "include",
          body: JSON.stringify({
            wallet: merchant,
            platformPct: 0.5, // for metadata correctness
            brandKey, // ensure server computes partner recipient for partner brands
          }),
        });
      } catch { }
      return undefined;
    }

    // Deploy Split contract via thirdweb (sponsored gas via AA)
    // Fetch effective brand config (with Cosmos overrides) to get current partnerFeeBps and partnerWallet
    let brand: any;
    try {
      const r = await fetch(buildBrandApiUrl(brandKey as string, `/api/platform/brands/${encodeURIComponent(brandKey as string)}/config`), { cache: 'no-store', credentials: "include" });
      const j = await r.json().catch(() => ({}));
      brand = j?.brand ? j.brand : getBrandConfig(brandKey as string);
    } catch {
      brand = getBrandConfig(brandKey as string);
    }

    const partner = String(brand?.partnerWallet || "").toLowerCase();

    const platformBps = typeof brand?.platformFeeBps === "number"
      ? Math.max(0, Math.min(10000, brand.platformFeeBps))
      : 50;
    // Platform container never has partner recipient
    const isPartner = brandKey !== "portalpay" && brandKey !== "basaltsurge";

    // Use override if provided, otherwise brand default
    let effectivePartnerBps = brand.partnerFeeBps;
    if (typeof partnerFeeBpsOverride === "number") {
      effectivePartnerBps = partnerFeeBpsOverride;
    }

    const partnerBps = !isPartner ? 0 : (isValidHexAddress(partner) && typeof effectivePartnerBps === "number")
      ? Math.max(0, Math.min(10000 - platformBps, effectivePartnerBps))
      : 0;
    const merchantBps = Math.max(0, 10000 - platformBps - partnerBps);

    const name = `${(typeof brand?.name === "string" && brand.name ? brand.name : "Brand")} Split ${merchant.slice(0, 6)}`;
    const payees = (partnerBps > 0 ? [merchant, partner, platform] : [merchant, platform]) as `0x${string}`[];
    const shares: bigint[] = (partnerBps > 0
      ? [BigInt(merchantBps), BigInt(partnerBps), BigInt(platformBps)]
      : [BigInt(merchantBps), BigInt(platformBps)]);

    const contractAddress = await deploySplitContract({
      chain,
      client,
      account,
      params: {
        name,
        payees,
        shares,
      },
    });

    const addr = String(contractAddress || "").toLowerCase();
    if (!isValidHexAddress(addr)) {
      return undefined;
    }

    // Persist deployed address + recipients idempotently
    try {
      const r2 = await fetch(buildBrandApiUrl(brandKey, "/api/split/deploy"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": merchant, "x-csrf": "1" },
        credentials: "include",
        body: JSON.stringify({
          wallet: merchant,
          splitAddress: addr,
          brandKey, // persist brand scoping and recipients for partner brands
        }),
      });
      // If POST failed (e.g., CSRF or auth), keep modal open by returning undefined
      if (!r2.ok) {
        return undefined;
      }
      await r2.json().catch(() => ({}));
      // Verify persistence + recipients after POST
      try {
        const r3 = await fetch(buildBrandApiUrl(brandKey, `/api/split/deploy?wallet=${encodeURIComponent(merchant)}&brandKey=${encodeURIComponent(brandKey)}`), { cache: "no-store", credentials: "include" });
        const j3 = await r3.json().catch(() => ({}));
        const a3 = String(j3?.split?.address || "").toLowerCase();
        const rc3 = Array.isArray(j3?.split?.recipients) ? j3.split.recipients.length : 0;
        const partnerBrand3 = String(brandKey || "").toLowerCase() !== "portalpay" && String(brandKey || "").toLowerCase() !== "basaltsurge";
        if (!isValidHexAddress(a3)) return undefined;
        if (partnerBrand3 && rc3 > 0 && rc3 < 3) return undefined;
      } catch {
        return undefined;
      }
    } catch { }

    return addr;
  } catch {
    return undefined;
  }
}
