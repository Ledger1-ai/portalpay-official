"use client";

import React, { useEffect, useRef, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { CheckCircle } from "lucide-react";

type SiteConfig = {
  processingFeePct?: number;
  reserveRatios?: Record<string, number>;
  defaultPaymentToken?: "ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP" | "SOL";
  accumulationMode?: "fixed" | "dynamic";
  taxConfig?: {
    jurisdictions?: { code: string; name: string; rate: number; country?: string; type?: string }[];
    provider?: { name?: string; apiKeySet?: boolean };
  };
  theme?: { brandName?: string };
};

export function ReserveSettings() {
  const account = useActiveAccount();
  const [processingFeePct, setProcessingFeePct] = useState<number>(0);
  const [storeCurrency, setStoreCurrency] = useState<string>("USD");
  const [ratios, setRatios] = useState<Record<string, number>>({
    USDC: 0.2,
    USDT: 0.2,
    cbBTC: 0.2,
    cbXRP: 0.2,
    ETH: 0.2,
    SOL: 0,
  });
  const [defaultPaymentToken, setDefaultPaymentToken] = useState<
    "ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP" | "SOL"
  >("ETH");
  const [accumulationMode, setAccumulationMode] = useState<"fixed" | "dynamic">("fixed");
  const accModeUserChangedRef = useRef<boolean>(false);
  // Baselines to highlight unsaved changes
  const [lastSavedProcessingFeePct, setLastSavedProcessingFeePct] = useState<number>(0);
  const [lastSavedStoreCurrency, setLastSavedStoreCurrency] = useState<string>("USD");
  const [lastSavedRatios, setLastSavedRatios] = useState<Record<string, number>>({
    USDC: 0.2,
    USDT: 0.2,
    cbBTC: 0.2,
    cbXRP: 0.2,
    ETH: 0.2,
    SOL: 0,
  });
  const [lastSavedDefaultPaymentToken, setLastSavedDefaultPaymentToken] = useState<
    "ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP" | "SOL"
  >("ETH");
  const [lastSavedAccumulationMode, setLastSavedAccumulationMode] = useState<"fixed" | "dynamic">("fixed");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedPulse, setSavedPulse] = useState(false);
  const ratiosDebounceRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);

  async function postRatios(newRatios: Record<string, number>) {
    try {
      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": account?.address || "",
        },
        body: JSON.stringify({ reserveRatios: newRatios }),
      });
      if (r.ok) {
        setLastSavedRatios({ ...newRatios });
        setSavedPulse(true);
        try { setTimeout(() => setSavedPulse(false), 1200); } catch { }
      } else {
        const j = await r.json().catch(() => ({}));
        setError(j?.error || "Failed to auto-save ratios");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to auto-save ratios");
    }
  }

  function schedulePostRatios(newRatios: Record<string, number>) {
    try {
      if (ratiosDebounceRef.current) {
        clearTimeout(ratiosDebounceRef.current as any);
      }
      ratiosDebounceRef.current = window.setTimeout(() => {
        postRatios(newRatios);
      }, 400) as any;
    } catch { }
  }

  useEffect(() => {
    setLoading(true);
    fetch("/api/site/config", {
      headers: {
        "x-wallet": account?.address || "",
      },
    })
      .then((r) => r.json())
      .then((j) => {
        const cfg: SiteConfig = j?.config || {};
        if (typeof cfg.processingFeePct === "number") {
          setProcessingFeePct(cfg.processingFeePct);
          setLastSavedProcessingFeePct(cfg.processingFeePct);
        }
        if (typeof (cfg as any).storeCurrency === "string") {
          const sc = (cfg as any).storeCurrency;
          setStoreCurrency(sc);
          setLastSavedStoreCurrency(sc);
        }
        if (cfg.reserveRatios && typeof cfg.reserveRatios === "object") {
          setRatios((prev) => ({ ...prev, ...cfg.reserveRatios }));
          setLastSavedRatios({ ...lastSavedRatios, ...cfg.reserveRatios });
        }
        if (cfg.defaultPaymentToken) {
          setDefaultPaymentToken(cfg.defaultPaymentToken);
          setLastSavedDefaultPaymentToken(cfg.defaultPaymentToken);
        }
        if (cfg.accumulationMode === "dynamic" || cfg.accumulationMode === "fixed") {
          if (!accModeUserChangedRef.current) {
            setAccumulationMode(cfg.accumulationMode);
            setLastSavedAccumulationMode(cfg.accumulationMode);
            try {
              window.dispatchEvent(
                new CustomEvent("pp:accumulationModeChanged", { detail: { mode: cfg.accumulationMode } })
              );
            } catch { }
          }
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [account?.address]);

  useEffect(() => {
    const onUpdated = (e: any) => {
      try {
        const next = e?.detail?.ratios;
        if (next && typeof next === "object") {
          setRatios((prev) => ({ ...prev, ...next }));
        }
      } catch { }
    };
    try { window.addEventListener("pp:reserveRatiosUpdated", onUpdated as any); } catch { }
    return () => {
      try { window.removeEventListener("pp:reserveRatiosUpdated", onUpdated as any); } catch { }
    };
  }, [account?.address]);

  useEffect(() => {
    const onSave = () => {
      try { saveSettings(); } catch { }
    };
    try { window.addEventListener("pp:saveReserveSettings", onSave as any); } catch { }
    return () => {
      try { window.removeEventListener("pp:saveReserveSettings", onSave as any); } catch { }
    };
  }, [account?.address, processingFeePct, defaultPaymentToken, accumulationMode, ratios]);

  function handleSliderChange(changedSymbol: string, newValue: number) {
    const tokens = ["USDC", "USDT", "cbBTC", "cbXRP", "ETH", "SOL"];
    const clampedValue = Math.max(0, Math.min(1, newValue);

    const remaining = 1 - clampedValue;
    const otherTokens = tokens.filter((t) => t !== changedSymbol);

    const currentOthersSum = otherTokens.reduce((sum, t) => sum + (ratios[t] || 0), 0);

    const newRatios: Record<string, number> = { [changedSymbol]: clampedValue };

    if (currentOthersSum > 0) {
      otherTokens.forEach((token) => {
        const proportion = (ratios[token] || 0) / currentOthersSum;
        newRatios[token] = remaining * proportion;
      });
    } else {
      const equalShare = remaining / otherTokens.length;
      otherTokens.forEach((token) => {
        newRatios[token] = equalShare;
      });
    }

    setRatios(newRatios);
    schedulePostRatios(newRatios);
    try { window.dispatchEvent(new CustomEvent("pp:reserveRatiosUpdated", { detail: { ratios: newRatios } })); } catch { }
  }

  async function saveSettings() {
    try {
      setSaving(true);
      setError("");
      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": account?.address || "",
        },
        body: JSON.stringify({
          processingFeePct: Math.max(0, Number(processingFeePct)),
          storeCurrency,
          reserveRatios: ratios,
          defaultPaymentToken,
          accumulationMode,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.error || "Failed to save");
        return;
      }
      // Successful save: update baselines and pulse
      setLastSavedProcessingFeePct(Math.max(0, Number(processingFeePct)));
      setLastSavedStoreCurrency(storeCurrency || "USD");
      setLastSavedRatios({ ...ratios });
      setLastSavedDefaultPaymentToken(defaultPaymentToken);
      setLastSavedAccumulationMode(accumulationMode);
      setSavedPulse(true);
      try { setTimeout(() => setSavedPulse(false), 1500); } catch { }
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Render loading skeleton
  if (loading) {
    return <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-muted/20 rounded-md w-full"></div>
      <div className="h-10 bg-muted/20 rounded-md w-full"></div>
      <div className="h-10 bg-muted/20 rounded-md w-full"></div>
    </div>;
  }

  return (
    <div className="space-y-4">
      {/* Save confirmation pulse */}
      <div className="flex justify-end">{savedPulse && (
        <div className="rounded-full bg-green-600/90 text-white px-3 py-1.5 text-xs inline-flex items-center gap-1 shadow">
          <CheckCircle className="h-3 w-3" /> Saved
        </div>
      )}</div>

      <div>
        <label className="text-sm font-medium">Store Currency</label>
        <select
          className={`w-full h-9 px-3 py-1 border rounded-md bg-background ${(storeCurrency !== lastSavedStoreCurrency) ? "ring-1 ring-amber-500 border-amber-300" : ""}`}
          value={storeCurrency}
          onChange={(e) => setStoreCurrency(e.target.value)}
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        <div className="microtext text-muted-foreground mt-1">
          Global default currency for your store. Can be overridden per item or per transaction.
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Processing Fee (%)</label>
        <input
          type="number"
          min={0}
          step={0.01}
          className={`w-full h-9 px-3 py-1 border rounded-md bg-background ${(Math.abs((processingFeePct || 0) - (lastSavedProcessingFeePct || 0)) > 0.0001) ? "ring-1 ring-amber-500 border-amber-300" : ""}`}
          value={processingFeePct}
          onChange={(e) => setProcessingFeePct(Math.max(0, Number(e.target.value || 0)))}
        />
        <div className="microtext text-muted-foreground mt-1">
          Base 0.5% is automatically included. This field adds your extra percentage (e.g., 2.5 = +2.5%). The merchant receives anything above the 0.5% base.
        </div>
      </div>

      <div className="mt-3">
        <label className="text-sm font-medium">Accumulation Mode</label>
        <select
          className={`w-full h-9 px-3 py-1 border rounded-md bg-background ${(accumulationMode !== lastSavedAccumulationMode) ? "ring-1 ring-amber-500 border-amber-300" : ""}`}
          value={accumulationMode}
          onChange={(e) => {
            const mode = e.target.value as any;
            accModeUserChangedRef.current = true;
            setAccumulationMode(mode);
            try {
              window.dispatchEvent(new CustomEvent("pp:accumulationModeChanged", { detail: { mode } }));
            } catch { }
            (async () => {
              try {
                const r = await fetch("/api/site/config", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                  body: JSON.stringify({ accumulationMode: mode }),
                });
                if (r.ok) {
                  setLastSavedAccumulationMode(mode);
                  setSavedPulse(true);
                  try { setTimeout(() => setSavedPulse(false), 1200); } catch { }
                }
              } catch { }
            })();
          }}
        >
          <option value="fixed">Fixed (reconcile to default token)</option>
          <option value="dynamic">Dynamic (rotate reconciliation behind the scenes)</option>
        </select>
        <div className="microtext text-muted-foreground mt-1">
          In Fixed mode, reconciliation uses the Default Payment Token. In Dynamic mode, the internal settlement token rotates per order; buyers see the token selected for their order.
        </div>
      </div>

      {accumulationMode === "fixed" && (
        <div>
          <label className="text-sm font-medium">Default Payment Token</label>
          <select
            className={`w-full h-9 px-3 py-1 border rounded-md bg-background ${(defaultPaymentToken !== lastSavedDefaultPaymentToken) ? "ring-1 ring-amber-500 border-amber-300" : ""}`}
            value={defaultPaymentToken}
            onChange={(e) => setDefaultPaymentToken(e.target.value as any)}
          >
            <option value="ETH">ETH (Ethereum)</option>
            <option value="USDC">USDC (USD Coin)</option>
            <option value="USDT">USDT (Tether)</option>
            <option value="cbBTC">cbBTC (Coinbase Wrapped BTC)</option>
            <option value="cbXRP">cbXRP (Coinbase Wrapped XRP)</option>
            <option value="SOL">SOL (Solana on Base)</option>
          </select>
          <div className="microtext text-muted-foreground mt-1">
            Buyers will see "Pay with {defaultPaymentToken}". Reconciliation targets this token.
          </div>
        </div>
      )}

      {accumulationMode === "dynamic" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Reserve Ratios (Target Fractions)</label>
            <span
              className={`microtext font-medium ${Math.abs(currentTotal - 1) < 0.001 ? "text-green-600" : "text-amber-600"
                }`}
            >
              Total: {currentTotal.toFixed(3)}
            </span>
          </div>
          <div className="space-y-4">
            {["USDC", "USDT", "cbBTC", "cbXRP", "ETH", "SOL"].map((symbol) => (
              <div
                key={symbol}
                className={`space-y-1 rounded-md border p-2 ${Math.abs((ratios[symbol] || 0) - (lastSavedRatios[symbol] || 0)) > 0.0005
                  ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20"
                  : "border-transparent"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{symbol}</label>
                  <span className="text-sm font-mono">{(ratios[symbol] || 0).toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  className="w-full glass-range"
                  value={ratios[symbol] || 0}
                  onChange={(e) => handleSliderChange(symbol, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
          <div className="microtext text-muted-foreground mt-2">
            Adjusting one slider automatically adjusts others to maintain total = 1.0. In Dynamic mode, the settlement token rotates for each subsequent purchase; buyers will see the token selected for their order.
          </div>
        </div>
      )}

      {error && <div className="microtext text-red-500">{error}</div>}

    </div>
  );
}
