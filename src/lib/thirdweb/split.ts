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
  merchantWalletOverride?: string,
  extraAgents?: { wallet: string, bps: number }[]
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

    // Agent calculation helpers
    const agents = Array.isArray(extraAgents) ? extraAgents : [];
    const agentSharesBps = agents.reduce((sum, a) => sum + Math.max(0, Math.min(10000, a.bps)), 0);

    if (!brandKey) {
      // Persist recipients (without address) for later binding and exit early
      try {
        await fetch(buildApiUrl("/api/split/deploy"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": merchant, "x-csrf": "1" },
          body: JSON.stringify({
            wallet: merchant,
            platformPct: 0.5,
            agents
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
      // Only redeploy if explicit flag or partner misconfiguration
      // Note: We don't automatically check for agent mismatch here to avoid deploy loops, 
      // but the UI calling this usually implies an intent to deploy new settings.
      if (isValidHexAddress(existing)) {
        if (!j?.misconfiguredSplit?.needsRedeploy) {
          // For agents, we might want to force redeploy if requested, but checking equality is hard.
          // We'll assume if this function is called, the UI verified the need (or we can add a force flag).
          // For now, return existing if "ok". Caller logic in UI (Deploy button) usually implies "Make it so".
          // Actually, if we are in "Configure" mode, we might WANT to redeploy.
          // But existing logic returns early. We'll stick to that unless we detect critical issues.
          return existing;
        }
      }
    } catch {
      // continue to deploy if read failed
    }

    // Resolve platform recipient from env
    const platform = String(getRecipientAddress() || "").toLowerCase();
    if (!isValidHexAddress(platform)) {
      try {
        await fetch(buildBrandApiUrl(brandKey, "/api/split/deploy"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": merchant, "x-csrf": "1" },
          credentials: "include",
          body: JSON.stringify({
            wallet: merchant,
            platformPct: 0.5, // for metadata correctness
            brandKey,
            agents
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

    // Merchant gets remainder after Platform, Partner, and Agents
    const merchantBps = Math.max(0, 10000 - platformBps - partnerBps - agentSharesBps);

    const name = `${(typeof brand?.name === "string" && brand.name ? brand.name : "Brand")} Split ${merchant.slice(0, 6)}`;

    // Build payees/shares arrays
    const payeeList: string[] = [merchant, platform];
    const shareList: bigint[] = [BigInt(merchantBps), BigInt(platformBps)];

    if (partnerBps > 0) {
      payeeList.push(partner);
      shareList.push(BigInt(partnerBps));
    }

    agents.forEach(a => {
      if (isValidHexAddress(a.wallet) && a.bps > 0) {
        payeeList.push(a.wallet.toLowerCase());
        shareList.push(BigInt(a.bps));
      }
    });

    const contractAddress = await deploySplitContract({
      chain,
      client,
      account,
      params: {
        name,
        payees: payeeList,
        shares: shareList,
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
          brandKey,
          agents // Send agents to persist them in site config
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
