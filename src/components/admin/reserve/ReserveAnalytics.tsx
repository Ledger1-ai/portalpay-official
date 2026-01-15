"use client";

import React, { useEffect, useRef, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { sendTransaction, prepareContractCall, getContract } from "thirdweb";
import { client, chain } from "@/lib/thirdweb/client";
import { createPortal } from "react-dom";
import TruncatedAddress from "@/components/truncated-address";

type ReserveBalancesResponse = {
  degraded?: boolean;
  reason?: string;
  balances?: Record<
    string,
    {
      units?: number;
      usd?: number;
      address?: string | null;
    }
  >;
  totalUsd?: number;
  wallet?: string;
  merchantWallet?: string;
  sourceWallet?: string;
  splitAddressUsed?: string | null;
  indexedMetrics?: {
    totalVolumeUsd: number;
    merchantEarnedUsd: number;
    platformFeeUsd: number;
    customers: number;
    totalCustomerXp: number;
    transactionCount: number;
  };
};

export function ReserveAnalytics() {
  const [data, setData] = useState<ReserveBalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false);
  const account = useActiveAccount();


  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawResults, setWithdrawResults] = useState<any[]>([]);

  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawQueue, setWithdrawQueue] = useState<string[]>([]);
  const [withdrawProcessed, setWithdrawProcessed] = useState(0);
  const [withdrawStatuses, setWithdrawStatuses] = useState<Record<string, { status: string; tx?: string; reason?: string }>>({});

  function formatReleaseMessage(rr: { symbol?: string; status?: string; transactionHash?: string; reason?: string }): string {
    try {
      const sym = String(rr?.symbol || "").toUpperCase();
      const st = String(rr?.status || "");
      const statusLabel = st === "submitted" ? "Submitted" : st === "skipped" ? "Skipped" : st === "failed" ? "Failed" : st || "—";
      const parts: string[] = [`${sym}: ${statusLabel}`];
      if (rr?.reason) {
        const r = String(rr.reason || "");
        const friendly =
          r === "not_due_payment"
            ? "No funds due to this account"
            : r === "signature_mismatch"
              ? "Contract method signature mismatch (overload)"
              : r === "token_address_not_configured"
                ? "Token address not configured"
                : r;
        parts.push(friendly);
      }
      if (rr?.transactionHash) {
        parts.push(String(rr.transactionHash).slice(0, 10) + "…");
      }
      return parts.join(" • ");
    } catch {
      return `${String(rr?.symbol || "").toUpperCase()}: ${String(rr?.status || "")}`;
    }
  }

  function statusClassFor(rr: { status?: string }): string {
    const st = String(rr?.status || "");
    return st === "failed" ? "text-red-500" : st === "skipped" ? "text-amber-600" : "text-muted-foreground";
  }

  async function withdrawMerchant(onlySymbol?: string) {
    try {
      setWithdrawError("");
      if (!account?.address) {
        setWithdrawError("Connect your wallet");
        return;
      }
      const isHex = (s: string) => /^0x[a-f0-9]{40}$/i.test(String(s || "").trim());
      const merchant = String((data?.merchantWallet || account?.address || "")).toLowerCase();
      const split = String(data?.splitAddressUsed || "").toLowerCase();
      if (!isHex(merchant)) {
        setWithdrawError("merchant_wallet_required");
        return;
      }
      if (!isHex(split)) {
        setWithdrawError("split_address_not_configured");
        return;
      }

      const preferred = ["ETH", "USDC", "USDT", "cbBTC", "cbXRP", "SOL"];
      const balEntries = Object.entries((data?.balances || {}) as Record<string, any>);
      const nonZero = balEntries
        .filter(([sym, info]) => preferred.includes(sym) && Number(info?.units || 0) > 0)
        .map(([sym]) => sym as string);
      let queue = nonZero.length ? nonZero : preferred;
      if (onlySymbol) queue = [onlySymbol];

      const envTokens: Record<string, { address?: `0x${string}`; decimals?: number }> = {
        ETH: { address: undefined, decimals: 18 },
        USDC: {
          address: (data?.balances?.["USDC"]?.address || process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6),
        },
        USDT: {
          address: (data?.balances?.["USDT"]?.address || process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6),
        },
        cbBTC: {
          address: (data?.balances?.["cbBTC"]?.address || process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8),
        },
        cbXRP: {
          address: (data?.balances?.["cbXRP"]?.address || process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "0xcb585250f852C6c6bf90434AB21A00f02833a4af").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6),
        },
        SOL: {
          address: (data?.balances?.["SOL"]?.address || process.env.NEXT_PUBLIC_BASE_SOL_ADDRESS || "0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_SOL_DECIMALS || 9),
        },
      };

      const PAYMENT_SPLITTER_ABI = [
        {
          type: "function",
          name: "release",
          inputs: [{ name: "account", type: "address" }],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "release",
          inputs: [
            { name: "token", type: "address" },
            { name: "account", type: "address" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ] as const;

      const contract = getContract({
        client,
        chain,
        address: split as `0x${string}`,
        abi: PAYMENT_SPLITTER_ABI as any,
      });

      setWithdrawLoading(true);
      setWithdrawError("");

      if (!onlySymbol) {
        setWithdrawResults([]);
        setWithdrawModal({ open: true, wallet: merchant, queue, processed: 0, statuses: {} });
      }

      for (const symbol of queue) {
        try {
          let tx: any;
          if (symbol === "ETH") {
            tx = (prepareContractCall as any)({
              contract: contract as any,
              method: "function release(address account)",
              params: [merchant as `0x${string}`],
            });
          } else {
            const t = envTokens[symbol];
            const tokenAddr = t?.address as `0x${string}` | undefined;
            if (!tokenAddr || !isHex(String(tokenAddr))) {
              const rr = { symbol, status: "skipped", reason: "token_address_not_configured" };
              if (!onlySymbol) {
                setWithdrawModalStatuses((prev) => ({ ...prev, [symbol]: { status: rr.status, reason: rr.reason } }));
              }
              setWithdrawResults((prev: any[]) => {
                const next = Array.isArray(prev) ? prev.slice() : [];
                next.push(rr as any);
                return next;
              });
              if (!onlySymbol) setWithdrawModalProcessed((p) => p + 1);
              continue;
            }
            tx = (prepareContractCall as any)({
              contract: contract as any,
              method: "function release(address token, address account)",
              params: [tokenAddr, merchant as `0x${string}`],
            });
          }

          const sent = await sendTransaction({
            account: account as any,
            transaction: tx,
          });
          const transactionHash = (sent as any)?.transactionHash || (sent as any)?.hash || undefined;

          const rr = { symbol, transactionHash, status: "submitted" as const };
          if (!onlySymbol) {
            setWithdrawModalStatuses((prev) => ({ ...prev, [symbol]: { status: rr.status, tx: rr.transactionHash } }));
          }
          setWithdrawResults((prev: any[]) => {
            const next = Array.isArray(prev) ? prev.slice() : [];
            next.push(rr as any);
            return next;
          });
        } catch (err: any) {
          const raw = String(err?.message || err || "");
          const lower = raw.toLowerCase();
          const isNotDue =
            lower.includes("not due payment") || lower.includes("account is not due payment");
          const isOverload = lower.includes("number of parameters and values must match");
          const rr = {
            symbol,
            status: (isNotDue ? "skipped" : "failed") as "skipped" | "failed",
            reason: isNotDue ? "not_due_payment" : isOverload ? "signature_mismatch" : raw,
          };
          if (!onlySymbol) {
            setWithdrawModalStatuses((prev) => ({ ...prev, [symbol]: { status: rr.status, reason: rr.reason } }));
          }
          setWithdrawResults((prev: any[]) => {
            const next = Array.isArray(prev) ? prev.slice() : [];
            next.push(rr as any);
            return next;
          });
        } finally {
          if (!onlySymbol) {
            setWithdrawModalProcessed((p) => p + 1);
          }
        }
      }

      try { await fetchBalances(); } catch { }
    } catch (e: any) {
      setWithdrawError(e?.message || "Withdraw failed");
    } finally {
      setWithdrawLoading(false);
    }
  }

  function setWithdrawModal(val: { open: boolean; wallet?: string; queue: string[]; processed: number; statuses: Record<string, { status: string; tx?: string; reason?: string }> }) {
    setWithdrawModalOpen(val.open);
    setWithdrawQueue(val.queue);
    setWithdrawProcessed(val.processed);
    setWithdrawStatuses(val.statuses);
  }

  function setWithdrawModalStatuses(fn: (prev: Record<string, { status: string; tx?: string; reason?: string }>) => Record<string, { status: string; tx?: string; reason?: string }>) {
    setWithdrawStatuses(fn);
  }

  function setWithdrawModalProcessed(fn: (prev: number) => number) {
    setWithdrawProcessed(fn);
  }

  async function fetchBalances() {
    try {
      setLoading(true);
      setError("");
      const r = await fetch("/api/reserve/balances", {
        headers: {
          "x-wallet": account?.address || "",
        },
      });
      const j: ReserveBalancesResponse = await r.json().catch(() => ({} as any));
      if (j.degraded) {
        setError(j.reason || "Degraded data");
      }
      setData(j);
    } catch (e: any) {
      setError(e?.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIndexing(true);
        try {
          await fetch(`/api/site/metrics?range=24h`, {
            headers: { "x-wallet": account?.address || "" },
          });
        } catch { }
        await fetchBalances();
      } finally {
        if (!cancelled) setIndexing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [account?.address]);

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-foreground/10 rounded" />
          <div className="h-8 w-24 bg-foreground/10 rounded" />
        </div>
        <div className="h-4 w-64 bg-foreground/10 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 rounded-md border glass-pane space-y-2">
              <div className="h-3 w-12 bg-foreground/10 rounded" />
              <div className="h-5 w-20 bg-foreground/10 rounded" />
              <div className="h-3 w-16 bg-foreground/10 rounded" />
            </div>
          ))}
        </div>
        <div className="p-4 rounded-md border glass-pane space-y-2">
          <div className="h-4 w-48 bg-foreground/10 rounded" />
          <div className="h-8 w-32 bg-foreground/10 rounded" />
        </div>
        <div className="text-center text-sm text-muted-foreground italic mt-8">
          "The best time to start was yesterday. The next best time is now."
        </div>
      </div>
    );
  }

  if (error && !data) {
    return <div className="text-sm text-red-500">Error: {error}</div>;
  }

  if (!data || !data.balances) {
    return <div className="text-sm text-muted-foreground">No data available</div>;
  }

  const { balances, totalUsd, merchantWallet, sourceWallet, splitAddressUsed } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Reserve Analytics</h3>
        <div className="flex items-center gap-2">
          {indexing && <span className="microtext text-muted-foreground animate-pulse">Indexing…</span>}
          <button
            onClick={fetchBalances}
            disabled={loading}
            className="px-2 py-1 rounded-md border text-xs"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="microtext text-muted-foreground">
        Merchant wallet: <TruncatedAddress address={merchantWallet || ""} />
        {sourceWallet && sourceWallet !== merchantWallet ? (
          <>
            {" "}
            • Source wallet: <TruncatedAddress address={sourceWallet || ""} />
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => withdrawMerchant()}
          disabled={withdrawLoading || !splitAddressUsed}
          className="px-2 py-1 rounded-md border text-xs"
          title={splitAddressUsed ? "Withdraw from split to your wallet" : "Split address not configured"}
        >
          {withdrawLoading ? "Withdrawing…" : "Withdraw to Wallet"}
        </button>
        {withdrawError && <span className="microtext text-red-500">{withdrawError}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(balances).map(([symbol, info]: [string, any]) => (
          <div key={symbol} className="p-3 rounded-md border glass-pane">
            <div className="text-xs font-medium text-muted-foreground">{symbol}</div>
            <div className="text-sm font-semibold mt-1">{Number(info.units || 0).toFixed(6)}</div>
            <div className="microtext text-muted-foreground mt-1">
              ${Number(info.usd || 0).toFixed(2)}
            </div>

            <div className="mt-2">
              <button
                onClick={() => withdrawMerchant(symbol)}
                disabled={withdrawLoading || !splitAddressUsed}
                className="px-2 py-1 rounded-md border text-xs"
                title={splitAddressUsed ? `Withdraw ${symbol} to your wallet` : "Split address not configured"}
              >
                {withdrawLoading ? "Working…" : `Withdraw ${symbol}`}
              </button>
              {(() => {
                try {
                  const rr = (withdrawResults || []).find((x: any) => String(x?.symbol || "") === String(symbol));
                  return rr ? (
                    <div className={`microtext mt-1 ${statusClassFor(rr)}`}>
                      {formatReleaseMessage(rr)}
                    </div>
                  ) : null;
                } catch {
                  return null;
                }
              })()}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-md border glass-pane">
        <div className="text-sm font-medium">Total Reserve Value (USD)</div>
        <div className="text-2xl font-bold mt-1">${Number(totalUsd || 0).toFixed(2)}</div>
      </div>

      <div className="rounded-md border glass-pane p-4">
        <div className="text-sm font-medium mb-2">Reserve Distribution</div>
        <div className="h-4 w-full rounded-full overflow-hidden flex">
          {Object.entries(balances).map(([symbol, info]: [string, any]) => {
            const pct = totalUsd ? (Number(info.usd || 0) / Number(totalUsd || 1)) : 0;
            const colors: Record<string, string> = {
              USDC: "#3b82f6",
              USDT: "#10b981",
              cbBTC: "#f59e0b",
              cbXRP: "#6366f1",
              SOL: "#14f195",
              ETH: "#8b5cf6",
            };
            const bg = colors[symbol] || "#999999";
            return (
              <div
                key={symbol}
                title={`${symbol} • ${Math.round(pct * 1000) / 10}%`}
                style={{ width: `${Math.max(0, pct * 100)}%`, backgroundColor: bg }}
                className="h-4"
              />
            );
          })}
        </div>
        <div className="microtext text-muted-foreground mt-1 flex flex-wrap gap-2">
          {Object.entries(balances).map(([symbol, info]: [string, any]) => {
            const pct = totalUsd ? (Number(info.usd || 0) / Number(totalUsd || 1)) : 0;
            return (
              <span key={symbol}>
                {symbol}: {Math.round(pct * 1000) / 10}%
              </span>
            );
          })}
        </div>
      </div>


      {error && <div className="microtext text-amber-500">Warning: {error}</div>}

      {withdrawModalOpen && typeof window !== "undefined"
        ? createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
            onKeyDown={(e) => { if (e.key === "Escape") setWithdrawModalOpen(false); }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
          >
            <div className="w-full max-w-sm rounded-md border bg-background p-4">
              <div className="text-sm font-medium mb-2">Withdrawing to Wallet</div>
              <div className="microtext text-muted-foreground mb-2">
                {withdrawProcessed} / {Math.max(0, withdrawQueue.length)} processed
              </div>
              <div className="h-2 w-full bg-foreground/10 rounded">
                <div
                  className="h-2 bg-green-500 rounded"
                  style={{
                    width: `${Math.min(100, Math.floor((withdrawProcessed / Math.max(1, withdrawQueue.length)) * 100))}%`,
                  }}
                />
              </div>
              <div className="mt-3 max-h-40 overflow-auto microtext">
                {withdrawQueue.map((sym) => {
                  const st = withdrawStatuses[sym];
                  const cls = st
                    ? st.status === "failed"
                      ? "text-red-500"
                      : st.status === "skipped"
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    : "text-muted-foreground";
                  const fallback =
                    withdrawProcessed <= withdrawQueue.indexOf(sym) ? "queued" : "working…";
                  return (
                    <div key={sym} className={cls}>
                      {sym}: {st?.status || fallback}
                      {st?.tx ? ` • ${String(st.tx).slice(0, 10)}…` : ""}
                      {st?.reason ? ` • ${st.reason}` : ""}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  className="px-3 py-1.5 rounded-md border text-sm"
                  onClick={() => setWithdrawModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  );
}
