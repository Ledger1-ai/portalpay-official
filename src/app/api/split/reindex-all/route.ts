import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { requireRole } from "@/lib/auth";
import { fetchEthRates, fetchBtcUsd, fetchXrpUsd, fetchSolUsd } from "@/lib/eth";
import crypto from "node:crypto";
import { getClient, chain } from "@/lib/thirdweb/client";
import { getContract, readContract } from "thirdweb";

/**
 * POST /api/split/reindex-all
 * Batch reindexes all merchants with split contracts
 * Admin-only endpoint
 */
export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();

  try {
    // Require admin role
    const caller = await requireRole(req, "admin");

    console.log(`[BATCH REINDEX] Starting batch reindex initiated by ${caller.wallet.slice(0, 10)}...`);

    const container = await getContainer();

    // Query site_config documents which contain split addresses
    // Split addresses can be stored in two places:
    // 1. c.splitAddress (legacy top-level field)
    // 2. c.split.address (newer nested field)
    const spec = {
      query: `
        SELECT c.wallet, c.splitAddress, c.split
        FROM c
        WHERE c.type='site_config' AND (IS_DEFINED(c.splitAddress) OR IS_DEFINED(c.split.address))
      `,
    };

    const { resources } = await container.items.query(spec as any).fetchAll();
    const configs = Array.isArray(resources) ? resources as any[] : [];

    console.log(`[BATCH REINDEX] Found ${configs.length} merchants with split addresses in site_config`);

    // Trigger indexing for each merchant
    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const config of configs) {
      const merchantWallet = String(config?.wallet || "").toLowerCase();
      // Check both possible locations for split address
      const splitAddress = String(config?.splitAddress || config?.split?.address || "").toLowerCase();

      if (!merchantWallet || !splitAddress) continue;
      if (!/^0x[a-f0-9]{40}$/i.test(merchantWallet) || !/^0x[a-f0-9]{40}$/i.test(splitAddress)) continue;

      try {
        console.log(`[BATCH REINDEX] Indexing merchant ${merchantWallet.slice(0, 10)}... split ${splitAddress.slice(0, 10)}...`);

        // Call indexing logic directly instead of making HTTP request
        const indexResult = await indexSplitTransactionsDirect(splitAddress, merchantWallet, container);

        if (indexResult.ok) {
          successCount++;
          results.push({
            merchant: merchantWallet,
            success: true,
            indexed: indexResult.indexed,
            metrics: indexResult.metrics,
          });
          console.log(`[BATCH REINDEX] ✓ Indexed ${indexResult.indexed} txs for ${merchantWallet.slice(0, 10)}...`);
        } else {
          errorCount++;
          results.push({
            merchant: merchantWallet,
            success: false,
            error: indexResult.error,
          });
          console.error(`[BATCH REINDEX] ✗ Failed for ${merchantWallet.slice(0, 10)}...:`, indexResult.error);
        }
      } catch (e: any) {
        errorCount++;
        results.push({
          merchant: merchantWallet,
          success: false,
          error: e?.message || 'exception',
        });
        console.error(`[BATCH REINDEX] ✗ Exception for ${merchantWallet.slice(0, 10)}...:`, e);
      }
    }

    console.log(`[BATCH REINDEX] Completed - ${successCount} success, ${errorCount} errors`);

    return NextResponse.json(
      {
        ok: true,
        totalMerchants: configs.length,
        successCount,
        errorCount,
        results,
      },
      { headers: { "x-correlation-id": correlationId } }
    );
  } catch (e: any) {
    console.error("[BATCH REINDEX] Error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "batch_reindex_failed" },
      { status: 500, headers: { "x-correlation-id": correlationId } }
    );
  }
}

/**
 * Direct indexing function to avoid HTTP self-calls
 */
async function indexSplitTransactionsDirect(
  splitAddress: string,
  merchantWallet: string,
  container: any
): Promise<{ ok: boolean; indexed?: number; metrics?: any; error?: string }> {
  try {
    const correlationId = crypto.randomUUID();

    // Fetch transactions directly from Blockscout (avoid HTTP self-call)
    const txResult = await fetchSplitTransactionsDirect(splitAddress, merchantWallet, 1000);

    if (!txResult.ok) {
      return { ok: false, error: txResult.error || "failed_to_fetch_transactions" };
    }

    const transactions = txResult.transactions || [];
    const cumulative = txResult.cumulative || { payments: {}, merchantReleases: {}, platformReleases: {} };

    // Get live token prices from Coinbase API
    const [ethRates, btcUsd, xrpUsd, solUsd] = await Promise.allSettled([
      fetchEthRates(),
      fetchBtcUsd(),
      fetchXrpUsd(),
      fetchSolUsd()
    ]);

    const ethUsdRate = ethRates.status === "fulfilled" ? Number(ethRates.value?.["USD"] || 0) : 0;
    const btcUsdRate = btcUsd.status === "fulfilled" ? Number(btcUsd.value || 0) : 0;
    const xrpUsdRate = xrpUsd.status === "fulfilled" ? Number(xrpUsd.value || 0) : 0;
    const solUsdRate = solUsd.status === "fulfilled" ? Number(solUsd.value || 0) : 0;

    // Token prices in USD - use live rates with fallbacks
    const tokenPrices: Record<string, number> = {
      ETH: ethUsdRate || 2500,
      USDC: 1.0,
      USDT: 1.0,
      cbBTC: btcUsdRate || 65000,
      cbXRP: xrpUsdRate || 0.50,
      SOL: solUsdRate || 150,
    };

    // Calculate total metrics
    let totalVolumeUsd = 0;
    const uniqueCustomers = new Set<string>();
    let merchantEarnedUsd = 0;
    let platformFeeUsd = 0;

    // Calculate from cumulative payment data
    for (const [token, amount] of Object.entries(cumulative.payments || {})) {
      const tokenPrice = tokenPrices[token] || 0;
      const amountNum = Number(amount || 0);
      if (amountNum > 0 && tokenPrice > 0) {
        totalVolumeUsd += amountNum * tokenPrice;
      }
    }

    // Calculate platform fees: released amounts + releasable amounts
    // 1. Add already released platform fees
    for (const [token, amount] of Object.entries(cumulative.platformReleases || {})) {
      const tokenPrice = tokenPrices[token] || 0;
      const amountNum = Number(amount || 0);
      if (amountNum > 0 && tokenPrice > 0) {
        platformFeeUsd += amountNum * tokenPrice;
      }
    }

    // 2. Calculate releasable (pending) platform fees by QUERYING THE CONTRACT
    // Don't just assume everything pending is platform fee!
    try {
      const platformAddr = (process.env.NEXT_PUBLIC_PLATFORM_WALLET || process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "").toLowerCase();

      if (platformAddr && /^0x[a-f0-9]{40}$/i.test(platformAddr)) {
        const client = getClient();
        const contract = getContract({
          client,
          chain,
          address: splitAddress as `0x${string}`,
        });

        // Token addresses mapping
        const tokenAddresses: Record<string, string> = {
          USDC: (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").toLowerCase(),
          USDT: (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").toLowerCase(),
          cbBTC: (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").toLowerCase(),
          cbXRP: (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").toLowerCase(),
          SOL: (process.env.NEXT_PUBLIC_BASE_SOL_ADDRESS || "").toLowerCase(),
        };

        const tokensToCheck = ["ETH", ...Object.keys(tokenAddresses)];

        for (const sym of tokensToCheck) {
          try {
            let releasableUnits = 0;

            if (sym === "ETH") {
              const raw = await readContract({
                contract,
                method: "function releasable(address account) view returns (uint256)",
                params: [platformAddr as `0x${string}`],
              });
              releasableUnits = Number(raw) / 1e18;
            } else {
              const tAddr = tokenAddresses[sym];
              if (tAddr && /^0x[a-f0-9]{40}$/i.test(tAddr)) {
                // Get decimals
                let decimal = 18;
                switch (sym) {
                  case "USDC": decimal = Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6); break;
                  case "USDT": decimal = Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6); break;
                  case "cbBTC": decimal = Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8); break;
                  case "cbXRP": decimal = Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6); break;
                  case "SOL": decimal = Number(process.env.NEXT_PUBLIC_BASE_SOL_DECIMALS || 9); break;
                }

                const raw = await readContract({
                  contract,
                  method: "function releasable(address token, address account) view returns (uint256)",
                  params: [tAddr as `0x${string}`, platformAddr as `0x${string}`],
                });
                if (raw > BigInt(0)) {
                  releasableUnits = Number(raw) / Math.pow(10, decimal);
                }
              }
            }

            if (releasableUnits > 0) {
              const price = tokenPrices[sym] || 0;
              platformFeeUsd += releasableUnits * price;
            }
          } catch (e) {
            // Ignore read errors for specific tokens
          }
        }
      }
    } catch (e) {
      console.error("[indexSplitTransactionsDirect] Failed to query releasable fees:", e);
    }

    // Calculate merchant earnings from merchant releases
    for (const [token, amount] of Object.entries(cumulative.merchantReleases || {})) {
      const tokenPrice = tokenPrices[token] || 0;
      const amountNum = Number(amount || 0);
      if (amountNum > 0 && tokenPrice > 0) {
        merchantEarnedUsd += amountNum * tokenPrice;
      }
    }

    // Count unique customers from ALL payment transactions (not just the limited set)
    for (const tx of txResult.transactions || []) {
      if (tx?.type === 'payment') {
        const from = String(tx?.from || "").toLowerCase();
        if (from && /^0x[a-f0-9]{40}$/i.test(from)) {
          uniqueCustomers.add(from);
        }
      }
    }

    // Store/update indexed split metrics in Cosmos
    const indexDoc = {
      id: `split_index_${merchantWallet.toLowerCase()}`,
      type: "split_index",
      merchantWallet: merchantWallet.toLowerCase(),
      splitAddress: splitAddress.toLowerCase(),
      totalVolumeUsd: Math.round(totalVolumeUsd * 100) / 100,
      merchantEarnedUsd: Math.round(merchantEarnedUsd * 100) / 100,
      platformFeeUsd: Math.round(platformFeeUsd * 100) / 100,
      customers: uniqueCustomers.size,
      totalCustomerXp: Math.floor(totalVolumeUsd),
      transactionCount: transactions.length,
      cumulativePayments: cumulative.payments || {},
      cumulativeMerchantReleases: cumulative.merchantReleases || {},
      cumulativePlatformReleases: cumulative.platformReleases || {},
      lastIndexedAt: Date.now(),
      correlationId,
    };

    await container.items.upsert(indexDoc);

    // Also create/update individual transaction records
    let indexed = 0;
    for (const tx of transactions) {
      try {
        const txDoc = {
          id: `split_tx_${tx.hash}`,
          type: "split_transaction",
          hash: tx.hash,
          splitAddress: splitAddress.toLowerCase(),
          merchantWallet: merchantWallet.toLowerCase(),
          from: String(tx.from || "").toLowerCase(),
          to: String(tx.to || "").toLowerCase(),
          value: tx.value,
          token: tx.token,
          timestamp: tx.timestamp,
          blockNumber: tx.blockNumber,
          txType: tx.type,
          releaseType: tx.releaseType,
          releaseTo: tx.releaseTo,
          indexedAt: Date.now(),
          correlationId,
        };

        // Check if already indexed
        try {
          await container.item(txDoc.id, txDoc.id).read();
          continue; // Already indexed, skip
        } catch {
          // Not found, proceed to upsert
        }

        await container.items.upsert(txDoc);
        indexed++;
      } catch (e) {
        console.error(`Failed to index tx ${tx.hash}:`, e);
      }
    }

    return {
      ok: true,
      indexed: indexed,
      metrics: {
        totalVolumeUsd: indexDoc.totalVolumeUsd,
        merchantEarnedUsd: indexDoc.merchantEarnedUsd,
        platformFeeUsd: indexDoc.platformFeeUsd,
        customers: indexDoc.customers,
        totalCustomerXp: indexDoc.totalCustomerXp,
      }
    };
  } catch (e: any) {
    console.error("Error in direct indexing:", e);
    return { ok: false, error: e?.message || "indexing_failed" };
  }
}

/**
 * Fetch split transactions directly from Blockscout without HTTP call
 */
async function fetchSplitTransactionsDirect(
  splitAddress: string,
  merchantWallet: string,
  limit: number
): Promise<{ ok: boolean; transactions?: any[]; cumulative?: any; error?: string }> {
  try {
    const transactionsUrl = `https://base.blockscout.com/api/v2/addresses/${splitAddress}/transactions`;
    const tokenTransfersUrl = `https://base.blockscout.com/api/v2/addresses/${splitAddress}/token-transfers`;

    const [txResponse, tokenResponse] = await Promise.all([
      fetch(transactionsUrl, { headers: { "Accept": "application/json" } }),
      fetch(tokenTransfersUrl, { headers: { "Accept": "application/json" } })
    ]);

    if (!txResponse.ok) {
      return { ok: false, error: `Blockscout transactions API returned ${txResponse.status}` };
    }
    if (!tokenResponse.ok) {
      return { ok: false, error: `Blockscout token-transfers API returned ${tokenResponse.status}` };
    }

    const [txData, tokenData] = await Promise.all([
      txResponse.json(),
      tokenResponse.json()
    ]);

    const ethItems = Array.isArray(txData?.items) ? txData.items : [];
    const tokenItems = Array.isArray(tokenData?.items) ? tokenData.items : [];

    const splitAddrLower = splitAddress.toLowerCase();
    const merchantAddrLower = merchantWallet?.toLowerCase();
    const platformAddrLower = (process.env.NEXT_PUBLIC_PLATFORM_WALLET || process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "").toLowerCase();

    const tokenAddresses: Record<string, string> = {
      ETH: "native",
      USDC: (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").toLowerCase(),
      USDT: (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").toLowerCase(),
      cbBTC: (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").toLowerCase(),
      cbXRP: (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").toLowerCase(),
      SOL: (process.env.NEXT_PUBLIC_BASE_SOL_ADDRESS || "").toLowerCase(),
    };

    const addressToToken = new Map<string, string>();
    for (const [symbol, addr] of Object.entries(tokenAddresses)) {
      if (addr && addr !== "native") {
        addressToToken.set(addr, symbol);
      }
    }

    const cumulativePayments: Record<string, number> = {};
    const cumulativeMerchantReleases: Record<string, number> = {};
    const cumulativePlatformReleases: Record<string, number> = {};

    // Process ETH transactions
    const ethTransactions = await Promise.all(ethItems.map(async (tx: any) => {
      const txValue = tx?.value ? String(tx.value) : "0";
      const timestamp = tx?.timestamp ? new Date(tx.timestamp).getTime() : Date.now();
      const hash = tx?.hash || "";
      const from = tx?.from?.hash || "";
      const to = tx?.to?.hash || "";

      let valueInEth = Number(txValue) / 1e18;

      const fromLower = from.toLowerCase();
      const toLower = to.toLowerCase();

      const isPayment = toLower === splitAddrLower && fromLower !== merchantAddrLower && fromLower !== platformAddrLower;
      const isRelease = toLower === splitAddrLower && (fromLower === merchantAddrLower || fromLower === platformAddrLower);

      let txType: 'payment' | 'release' | 'unknown' = 'unknown';
      let releaseType: 'merchant' | 'platform' | undefined;
      let releaseTo: string | undefined;

      if (isPayment) {
        txType = 'payment';
      } else if (isRelease) {
        txType = 'release';

        // Initial guess based on caller
        releaseType = fromLower === merchantAddrLower ? 'merchant' : 'platform';

        // Try to refine using logs to find actual recipient
        try {
          const logsUrl = `https://base.blockscout.com/api/v2/transactions/${hash}/logs`;
          const logsRes = await fetch(logsUrl, { headers: { "Accept": "application/json" } });

          if (logsRes.ok) {
            const logsData = await logsRes.json();
            const logs = Array.isArray(logsData?.items) ? logsData.items : [];
            const paymentReleasedTopic = "0xdf20fd1e76bc69d672e4814fafb2c449bba3a5369d8359adf9e05e6fde87b056";

            for (const log of logs) {
              const topics = Array.isArray(log?.topics) ? log.topics : [];
              const logAddress = String(log?.address?.hash || "").toLowerCase();

              if (logAddress === splitAddrLower && topics[0]?.toLowerCase() === paymentReleasedTopic.toLowerCase()) {
                const dataHex = String(log?.data || "0x");

                if (dataHex.startsWith("0x") && dataHex.length >= 130) {
                  try {
                    const dataWithoutPrefix = dataHex.slice(2);
                    const addressSegment = dataWithoutPrefix.slice(0, 64);
                    const toAddr = `0x${addressSegment.slice(-40)}`.toLowerCase();
                    const amountSegment = dataWithoutPrefix.slice(64, 128);
                    const amountHex = `0x${amountSegment}`;
                    const amountWei = BigInt(amountHex);
                    valueInEth = Number(amountWei) / 1e18;
                    releaseTo = toAddr;

                    // Update releaseType based on Verified Recipient
                    if (releaseTo === merchantAddrLower) releaseType = 'merchant';
                    else if (releaseTo === platformAddrLower) releaseType = 'platform';

                    break;
                  } catch (e) {
                    // Keep original value if parsing fails
                  }
                }
              }
            }
          }
        } catch (e) {
          // Continue with transaction value if log fetch fails
        }
      }

      if (txType === 'payment') {
        cumulativePayments['ETH'] = (cumulativePayments['ETH'] || 0) + valueInEth;
      } else if (txType === 'release' && releaseType) {
        if (releaseType === 'merchant') {
          cumulativeMerchantReleases['ETH'] = (cumulativeMerchantReleases['ETH'] || 0) + valueInEth;
        } else if (releaseType === 'platform') {
          cumulativePlatformReleases['ETH'] = (cumulativePlatformReleases['ETH'] || 0) + valueInEth;
        }
      }

      return {
        hash,
        from,
        to,
        value: valueInEth,
        timestamp,
        blockNumber: tx?.block || 0,
        status: tx?.status || "success",
        type: txType,
        releaseType,
        releaseTo,
        token: 'ETH',
      };
    }));

    // Process token transfers
    const supportedTokens = ["USDC", "USDT", "cbBTC", "cbXRP", "SOL"];
    const tokenTransactions = tokenItems.map((transfer: any) => {
      const tokenAddr = String(transfer?.token?.address || "").toLowerCase();
      let tokenSymbol = addressToToken.get(tokenAddr);

      if (!tokenSymbol) {
        const blockscoutSymbol = String(transfer?.token?.symbol || "").toUpperCase();
        if (blockscoutSymbol === "USDC" || blockscoutSymbol.includes("USDC")) tokenSymbol = "USDC";
        else if (blockscoutSymbol === "USDT" || blockscoutSymbol.includes("USDT")) tokenSymbol = "USDT";
        else if (blockscoutSymbol === "CBBTC" || blockscoutSymbol.includes("BTC")) tokenSymbol = "cbBTC";
        else if (blockscoutSymbol === "CBXRP" || blockscoutSymbol.includes("XRP")) tokenSymbol = "cbXRP";
        else if (blockscoutSymbol === "SOL" || blockscoutSymbol.includes("SOL")) tokenSymbol = "SOL";
        else return null;
      }

      if (!supportedTokens.includes(tokenSymbol)) return null;

      const decimals = Number(transfer?.token?.decimals || 18);
      const valueRaw = String(transfer?.total?.value || "0");
      const valueInToken = Number(valueRaw) / Math.pow(10, decimals);

      const timestamp = transfer?.timestamp ? new Date(transfer.timestamp).getTime() : Date.now();
      const hash = transfer?.tx_hash || "";
      const from = String(transfer?.from?.hash || "").toLowerCase();
      const to = String(transfer?.to?.hash || "").toLowerCase();

      let txType: 'payment' | 'release' | 'unknown' = 'unknown';
      let releaseType: 'merchant' | 'platform' | undefined;
      let releaseTo: string | undefined;

      const isPayment = to === splitAddrLower && from !== merchantAddrLower && from !== platformAddrLower;
      const isRelease = from === splitAddrLower;

      if (isPayment) {
        txType = 'payment';
        cumulativePayments[tokenSymbol] = (cumulativePayments[tokenSymbol] || 0) + valueInToken;
      } else if (isRelease) {
        txType = 'release';
        releaseTo = to;

        if (to === merchantAddrLower) {
          releaseType = 'merchant';
          cumulativeMerchantReleases[tokenSymbol] = (cumulativeMerchantReleases[tokenSymbol] || 0) + valueInToken;
        } else if (to === platformAddrLower) {
          releaseType = 'platform';
          cumulativePlatformReleases[tokenSymbol] = (cumulativePlatformReleases[tokenSymbol] || 0) + valueInToken;
        }
      }

      return {
        hash,
        from: transfer?.from?.hash || "",
        to: transfer?.to?.hash || "",
        value: valueInToken,
        timestamp,
        blockNumber: transfer?.block || 0,
        status: "success",
        type: txType,
        releaseType,
        releaseTo,
        token: tokenSymbol,
      };
    }).filter(Boolean);

    const transactions = [...ethTransactions, ...tokenTransactions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return {
      ok: true,
      transactions,
      cumulative: {
        payments: cumulativePayments,
        merchantReleases: cumulativeMerchantReleases,
        platformReleases: cumulativePlatformReleases,
      }
    };
  } catch (e: any) {
    console.error("Error fetching split transactions directly:", e);
    return { ok: false, error: e?.message || "failed_to_fetch_transactions" };
  }
}
