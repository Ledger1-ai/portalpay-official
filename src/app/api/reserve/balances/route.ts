import { NextRequest, NextResponse } from "next/server";
import { chain, serverClient } from "@/lib/thirdweb/server";
import { getRpcClient, eth_getBalance, eth_call } from "thirdweb/rpc";
import { fetchEthRates, fetchBtcUsd, fetchXrpUsd, fetchSolUsd } from "@/lib/eth";
import { getSiteConfigForWallet } from "@/lib/site-config";
import { getContainer } from "@/lib/cosmos";

// Force dynamic rendering to avoid build-time evaluation
export const dynamic = 'force-dynamic';

/**
 * Returns live balances for the reserve wallet (owner wallet) across:
 * ETH (native), USDC, USDT, cbBTC, cbXRP.
 * Also includes USD conversions using live rates.
 * Environment:
 *   - NEXT_PUBLIC_OWNER_WALLET: reserve wallet address (0x...)
 *   - NEXT_PUBLIC_BASE_USDC_ADDRESS / DECIMALS
 *   - NEXT_PUBLIC_BASE_USDT_ADDRESS / DECIMALS
 *   - NEXT_PUBLIC_BASE_CBBTC_ADDRESS / DECIMALS
 *   - NEXT_PUBLIC_BASE_CBXRP_ADDRESS / DECIMALS
 */
export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const queryWallet = String(url.searchParams.get("wallet") || "").toLowerCase();
    const headerWallet = String(req.headers.get("x-wallet") || "").toLowerCase();
    const envOwner = String(process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
    const wallet = (queryWallet || headerWallet || envOwner).toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
      return NextResponse.json(
        { error: "wallet_unset_or_invalid" },
        { status: 400, headers: { "x-correlation-id": correlationId } }
      );
    }

    // Support direct splitAddress parameter to bypass lookup (used by Partners panel accordion)
    const querySplitAddress = String(url.searchParams.get("splitAddress") || "").toLowerCase();
    const queryBrandKey = String(url.searchParams.get("brandKey") || "").toLowerCase();

    // Resolve source wallet to query on-chain: prefer per-merchant splitAddress if configured
    let walletToQuery = wallet;

    // Priority 1: Use directly provided splitAddress parameter (most reliable for brand-scoped queries)
    if (querySplitAddress && /^0x[a-f0-9]{40}$/i.test(querySplitAddress)) {
      walletToQuery = querySplitAddress;
    } else {
      // Priority 2: Try site-config lookup
      try {
        const cfg = await getSiteConfigForWallet(wallet, queryBrandKey);
        const splitAddr = (cfg as any)?.splitAddress || (cfg as any)?.split?.address;
        if (typeof splitAddr === "string" && /^0x[a-f0-9]{40}$/i.test(splitAddr)) {
          walletToQuery = splitAddr.toLowerCase();
        }
      } catch { }
    }

    // Fallback: if site-config did not yield a split address, attempt to read via split/deploy API.
    // Propagate auth headers/cookies so the deploy endpoint can read stored configuration.
    if (walletToQuery === wallet) {
      try {
        const xfProto = req.headers.get("x-forwarded-proto");
        const xfHost = req.headers.get("x-forwarded-host");
        const host = req.headers.get("host");
        const proto = xfProto || (process.env.NODE_ENV === "production" ? "https" : "http");
        const h = xfHost || host || "";
        const origin = h ? `${proto}://${h}` : (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin);

        const cookie = req.headers.get("cookie") || "";
        const authorization = req.headers.get("authorization") || "";
        const headers: Record<string, string> = { "x-wallet": wallet };
        if (cookie) headers["cookie"] = cookie;
        if (authorization) headers["authorization"] = authorization;

        // Include brandKey in the fallback request so split/deploy knows the brand context
        const brandKeyParam = queryBrandKey || "";
        const r = await fetch(`${origin}/api/split/deploy?wallet=${encodeURIComponent(wallet)}${brandKeyParam ? `&brandKey=${encodeURIComponent(brandKeyParam)}` : ""}`, {
          cache: "no-store",
          headers,
        });
        const j = await r.json().catch(() => ({}));
        const addr = String(j?.split?.address || "").toLowerCase();
        if (/^0x[a-f0-9]{40}$/i.test(addr)) {
          walletToQuery = addr;
        }
      } catch { }
    }

    const rpc = getRpcClient({ client: serverClient, chain });

    // Env tokens
    const USDC = (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").trim().toLowerCase();
    const USDT = (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").trim().toLowerCase();
    const CBBTC = (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").trim().toLowerCase();
    const CBXRP = (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").trim().toLowerCase();
    const SOL = (process.env.NEXT_PUBLIC_BASE_SOL_ADDRESS || "").trim().toLowerCase();

    const USDC_DEC = Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6);
    const USDT_DEC = Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6);
    const CBBTC_DEC = Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8);
    const CBXRP_DEC = Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6);
    const SOL_DEC = Number(process.env.NEXT_PUBLIC_BASE_SOL_DECIMALS || 9);

    // Price feeds
    const [ethRates, btcUsd, xrpUsd, solUsd] = await Promise.allSettled([
      fetchEthRates(),
      fetchBtcUsd(),
      fetchXrpUsd(),
      fetchSolUsd(),
    ]);

    const ethUsdRate =
      ethRates.status === "fulfilled" ? Number(ethRates.value?.["USD"] || 0) : 0;
    const btcUsdRate = btcUsd.status === "fulfilled" ? Number(btcUsd.value || 0) : 0;
    const xrpUsdRate = xrpUsd.status === "fulfilled" ? Number(xrpUsd.value || 0) : 0;
    const solUsdRate = solUsd.status === "fulfilled" ? Number(solUsd.value || 0) : 0;

    // Helpers
    function hexToBigInt(hex: string): bigint {
      const h = (hex || "0x0").startsWith("0x") ? hex : ("0x" + hex);
      try {
        return BigInt(h);
      } catch {
        return BigInt(0);
      }
    }
    function pad32(hexNoPrefix: string): string {
      return hexNoPrefix.padStart(64, "0");
    }
    function addrToTopic(addr: string): string {
      return "000000000000000000000000" + addr.replace(/^0x/, "");
    }

    async function erc20BalanceOf(token: `0x${string}`, wallet: `0x${string}`): Promise<bigint> {
      try {
        const data = ("0x70a08231" + addrToTopic(wallet)) as `0x${string}`; // balanceOf(address)
        const r = await eth_call(rpc, { to: token, data });
        return hexToBigInt(String(r || "0x0"));
      } catch {
        return BigInt(0);
      }
    }

    // ETH native
    const ethWei = await eth_getBalance(rpc, { address: walletToQuery as `0x${string}` }).catch(() => "0x0");
    const ethRaw = BigInt(ethWei);
    const ethUnits = Number(ethRaw) / 1e18;
    const ethUsd = ethUnits * (ethUsdRate > 0 ? ethUsdRate : 0);

    // ERC20 balances
    let usdcUnits = 0, usdtUnits = 0, cbbtcUnits = 0, cbxrpUnits = 0, solUnits = 0;
    if (USDC && /^0x[a-f0-9]{40}$/.test(USDC)) {
      const raw = await erc20BalanceOf(USDC as `0x${string}`, walletToQuery as `0x${string}`);
      usdcUnits = Number(raw) / Math.pow(10, USDC_DEC || 6);
    }
    if (USDT && /^0x[a-f0-9]{40}$/.test(USDT)) {
      const raw = await erc20BalanceOf(USDT as `0x${string}`, walletToQuery as `0x${string}`);
      usdtUnits = Number(raw) / Math.pow(10, USDT_DEC || 6);
    }
    if (CBBTC && /^0x[a-f0-9]{40}$/.test(CBBTC)) {
      const raw = await erc20BalanceOf(CBBTC as `0x${string}`, walletToQuery as `0x${string}`);
      cbbtcUnits = Number(raw) / Math.pow(10, CBBTC_DEC || 8);
    }
    if (CBXRP && /^0x[a-f0-9]{40}$/.test(CBXRP)) {
      const raw = await erc20BalanceOf(CBXRP as `0x${string}`, walletToQuery as `0x${string}`);
      cbxrpUnits = Number(raw) / Math.pow(10, CBXRP_DEC || 6);
    }
    if (SOL && /^0x[a-f0-9]{40}$/.test(SOL)) {
      const raw = await erc20BalanceOf(SOL as `0x${string}`, walletToQuery as `0x${string}`);
      solUnits = Number(raw) / Math.pow(10, SOL_DEC || 9);
    }

    // USD conversions (USDC/USDT assumed 1 USD)
    const usdcUsd = usdcUnits * 1.0;
    const usdtUsd = usdtUnits * 1.0;
    const cbbtcUsd = cbbtcUnits * (btcUsdRate > 0 ? btcUsdRate : 0);
    const cbxrpUsd = cbxrpUnits * (xrpUsdRate > 0 ? xrpUsdRate : 0);
    const solUsdVal = solUnits * (solUsdRate > 0 ? solUsdRate : 0);

    const balances = {
      ETH: { units: ethUnits, usd: ethUsd, decimals: 18 },
      USDC: { units: usdcUnits, usd: usdcUsd, decimals: USDC_DEC || 6, address: USDC || null },
      USDT: { units: usdtUnits, usd: usdtUsd, decimals: USDT_DEC || 6, address: USDT || null },
      cbBTC: { units: cbbtcUnits, usd: cbbtcUsd, decimals: CBBTC_DEC || 8, address: CBBTC || null },
      cbXRP: { units: cbxrpUnits, usd: cbxrpUsd, decimals: CBXRP_DEC || 6, address: CBXRP || null },
      SOL: { units: solUnits, usd: solUsdVal, decimals: SOL_DEC || 9, address: SOL || null },
    };

    const rates = {
      ETH_USD: ethUsdRate,
      BTC_USD: btcUsdRate,
      XRP_USD: xrpUsdRate,
      SOL_USD: solUsdRate,
    };

    const totalUsd =
      balances.ETH.usd +
      balances.USDC.usd +
      balances.USDT.usd +
      balances.cbBTC.usd +
      balances.cbXRP.usd +
      balances.SOL.usd;

    // Fetch indexed transaction metrics for this merchant
    let indexedMetrics: any = null;
    try {
      const container = await getContainer();
      const spec = {
        query: `
          SELECT c.totalVolumeUsd, c.merchantEarnedUsd, c.platformFeeUsd, 
                 c.customers, c.totalCustomerXp, c.transactionCount
          FROM c
          WHERE c.type='split_index' AND c.merchantWallet=@wallet
        `,
        parameters: [{ name: "@wallet", value: wallet }]
      };
      const { resources } = await container.items.query(spec as any).fetchAll();
      if (Array.isArray(resources) && resources.length > 0) {
        const row = resources[0];
        indexedMetrics = {
          totalVolumeUsd: Number(row?.totalVolumeUsd || 0),
          merchantEarnedUsd: Number(row?.merchantEarnedUsd || 0),
          platformFeeUsd: Number(row?.platformFeeUsd || 0),
          customers: Number(row?.customers || 0),
          totalCustomerXp: Number(row?.totalCustomerXp || 0),
          transactionCount: Number(row?.transactionCount || 0),
        };
      }
    } catch (e) {
      console.error("[RESERVE BALANCES] Error fetching indexed metrics:", e);
    }

    return NextResponse.json(
      {
        merchantWallet: wallet,
        sourceWallet: walletToQuery,
        splitAddressUsed: walletToQuery !== wallet ? walletToQuery : null,
        balances,
        rates,
        totalUsd,
        indexedMetrics,
        splitHistory: (await getSiteConfigForWallet(wallet, queryBrandKey) as any)?.splitHistory || []
      },
      { headers: { "x-correlation-id": correlationId } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { degraded: true, reason: e?.message || "reserve_balances_unavailable" },
      { status: 200, headers: { "x-correlation-id": correlationId } }
    );
  }
}
