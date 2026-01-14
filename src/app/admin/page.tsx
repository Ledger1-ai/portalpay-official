"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useActiveAccount } from "thirdweb/react";
import { QRCodeCanvas } from "qrcode.react";
import { createPortal } from "react-dom";
import { sendTransaction, prepareTransaction, getContract, prepareContractCall, readContract } from "thirdweb";
import { client, chain } from "@/lib/thirdweb/client";
import { fetchEthRates, fetchUsdRates } from "@/lib/eth";
import { ImagePlus, Trash2, Star, StarOff, Link as LinkIcon, Plus, Wand2, Infinity as InfinityIcon, Copy, ExternalLink, Download, LayoutGrid, List } from "lucide-react";
import TruncatedAddress from "@/components/truncated-address";
import { SUPPORTED_CURRENCIES, formatCurrency, convertFromUsd, convertToUsd, roundForCurrency } from "@/lib/fx";
import { RestaurantFields, type ModifierGroup } from "@/components/inventory/RestaurantFields";
import { RetailFields, type VariationGroup, type Variant } from "@/components/inventory/RetailFields";
import { HotelFields, type Room } from "@/components/inventory/HotelFields";
import { FreelancerFields, type AddOn } from "@/components/inventory/FreelancerFields";
import { PublishingFields } from "@/components/inventory/PublishingFields";
import type { PublishingFormat, BookCondition } from "@/types/inventory";
import { LegacyAttributeAlert } from "@/components/inventory/LegacyAttributeAlert";
import { ToastImportModal } from "@/components/inventory/ToastImportModal";
import { migrateAttributes } from "@/lib/inventory-migration";
import type { IndustryPackType, IndustryAttributes } from "@/types/inventory";
import KitchenDisplayPanel from "@/components/admin/KitchenDisplayPanel";
import PMSPanel from "@/components/admin/PMSPanel";
import { ReserveTabs } from "@/components/admin/reserve";
import { Modal } from "@/components/ui/modal";
import { useBrand } from "@/contexts/BrandContext";
import { getDefaultBrandName } from "@/lib/branding";
import BrandingPanelExt from "@/app/admin/panels/BrandingPanel";
import { Thumbnail, type ReserveBalancesResponse, type SiteConfig, type TaxCatalogEntry } from "@/app/admin/panels/common";
import PartnerManagementPanelExt from "@/app/admin/panels/PartnerManagementPanel";
import ApplicationsPanelExt from "@/app/admin/panels/ApplicationsPanel";
import EndpointsPanel from "@/app/admin/panels/EndpointsPanel";
import SplitConfigPanelExt from "@/app/admin/panels/SplitConfigPanel";
import MessagesPanelExt from "@/app/admin/panels/MessagesPanel";
import TeamPanel from "@/app/admin/panels/TeamPanel";
import MyPurchasesPanelExt from "@/app/admin/panels/MyPurchasesPanel";
import { SEOLandingPagesPanel } from "@/app/admin/panels/SEOLandingPagesPanel";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import AdminHero from "@/components/admin/admin-hero";
import InstallerPackagesPanel from "@/app/admin/panels/InstallerPackagesPanel";
import AdminManagementPanel from "@/app/admin/panels/AdminManagementPanel";
import IntegrationsPanel from "@/app/admin/panels/IntegrationsPanel";
import ShopifyIntegrationPanel from "@/app/admin/panels/ShopifyIntegrationPanel";
import PartnerShopifyPanel from "@/app/admin/panels/PartnerShopifyPanel";
import GlobalArtPanel from "@/app/admin/panels/GlobalArtPanel";
import GetSupportPanel from "@/app/admin/panels/GetSupportPanel";
import SupportAdminPanel from "@/app/admin/panels/SupportAdminPanel";
import RewardsPanel from "@/app/admin/panels/RewardsPanel";
import LoyaltyPanel from "@/app/admin/panels/LoyaltyPanel";
import LoyaltyPanelPartner from "@/app/admin/panels/LoyaltyPanelPartner";
import LoyaltyPanelPlatform from "@/app/admin/panels/LoyaltyPanelPlatform";
import ContractsPanel from "@/app/admin/panels/ContractsPanel";
import DeliveryPanel from "@/app/admin/panels/DeliveryPanel";
import WritersWorkshopPanelExt from "@/app/admin/panels/WritersWorkshopPanel";
import PublicationsPanelExt from "@/app/admin/panels/PublicationsPanel";
import { isPlatformCtx, isPartnerCtx, isPlatformSuperAdmin, canAccessPanel } from "@/lib/authz";


/**
 * Admin Page (modularized into tabs: Reserve, Inventory, Orders)
 * - Reserve: ReserveSettings, Strategy Modulator & Presets, Tax Management, ReserveAnalytics
 * - Inventory: Add items with analytics-ready attributes; list & delete
 * - Orders: Build orders from inventory; generates receipts reflecting tax + processing fee
 *
 * Backend integrations:
 * - /api/site/config: GET/POST config including reserve settings & taxConfig
 * - /api/reserve/balances: GET reserve balances (for analytics)
 * - /api/reserve/recommend: GET strategy suggestion based on deficits
 * - /api/tax/catalog: GET jurisdiction presets; used to seed taxConfig
 * - /api/inventory: GET/POST/DELETE inventory items
 * - /api/orders: POST to generate receipts from selected inventory items
 */





function ReserveStrategy() {
  const account = useActiveAccount();
  const [modulator, setModulator] = useState<number>(0.5); // 0=Stablecoin, 1=Growth (BTC/XRP/ETH)
  const [applyLoading, setApplyLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState<{ recommendedToken?: string; frequency?: number } | null>(null);
  // Debounce auto-tilt updates from modulator
  const tiltDebounceRef = useRef<number | null>(null);
  const modUpdateRef = useRef<boolean>(false);
  const saveDebounceRef = useRef<number | null>(null);
  const [accumulationMode, setAccumulationMode] = useState<"fixed" | "dynamic">("fixed");
  const rsModeUserChangedRef = useRef<boolean>(false);

  function computeTiltedRatios(base: Record<string, number>, mod: number): Record<string, number> {
    // Targets: smooth gradient from stable-heavy (mod=0) to growth-heavy (mod=1)
    const stableTarget = Math.max(0, Math.min(1, 1 - mod));
    const growthTarget = Math.max(0, Math.min(1, mod));

    // Stable distribution (USDC/USDT) honors base mix; defaults to equal if undefined
    const sUSDC = Math.max(0, Number(base.USDC || 0));
    const sUSDT = Math.max(0, Number(base.USDT || 0));
    const sSum = sUSDC + sUSDT;
    const sUSDCw = sSum > 0 ? sUSDC / sSum : 0.5;
    const sUSDTw = sSum > 0 ? sUSDT / sSum : 0.5;

    // Growth distribution (cbXRP, ETH, cbBTC) weighted by risk: cbXRP > ETH > cbBTC
    const gXRPb = Math.max(0, Number(base.cbXRP || 0));
    const gETHb = Math.max(0, Number(base.ETH || 0));
    const gBTCb = Math.max(0, Number(base.cbBTC || 0));
    const wXRP = 1.2; // highest risk
    const wETH = 1.0; // mid risk
    const wBTC = 0.8; // least risky of the three
    let gXRPw = gXRPb * wXRP;
    let gETHw = gETHb * wETH;
    let gBTCw = gBTCb * wBTC;
    const gSum = gXRPw + gETHw + gBTCw;
    if (gSum <= 0) {
      // No base provided: use pure risk weights
      gXRPw = wXRP; gETHw = wETH; gBTCw = wBTC;
    }
    const gNorm = gXRPw + gETHw + gBTCw;

    const ratios: Record<string, number> = {
      USDC: Math.max(0, Math.min(1, +(stableTarget * sUSDCw).toFixed(4))),
      USDT: Math.max(0, Math.min(1, +(stableTarget * sUSDTw).toFixed(4))),
      cbXRP: Math.max(0, Math.min(1, +(growthTarget * (gXRPw / gNorm)).toFixed(4))),
      ETH: Math.max(0, Math.min(1, +(growthTarget * (gETHw / gNorm)).toFixed(4))),
      cbBTC: Math.max(0, Math.min(1, +(growthTarget * (gBTCw / gNorm)).toFixed(4))),
    };

    // Normalize to sum=1
    const sum = Object.values(ratios).reduce((s, v) => s + Number(v || 0), 0);
    if (sum > 0) {
      for (const k of Object.keys(ratios)) ratios[k] = +(ratios[k] / sum).toFixed(4);
    }
    return ratios;
  }

  function computeModulatorFromRatios(next: Record<string, number>): number {
    // If all tokens are approximately equal (balanced), snap to center 0.5
    const approx = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps;
    const values = {
      USDC: Number(next.USDC || 0),
      USDT: Number(next.USDT || 0),
      cbBTC: Number(next.cbBTC || 0),
      cbXRP: Number(next.cbXRP || 0),
      ETH: Number(next.ETH || 0),
    };
    const isBalancedEqual =
      approx(values.USDC, 0.2) &&
      approx(values.USDT, 0.2) &&
      approx(values.cbBTC, 0.2) &&
      approx(values.cbXRP, 0.2) &&
      approx(values.ETH, 0.2);
    if (isBalancedEqual) return 0.5;

    const stableShare = (values.USDC || 0) + (values.USDT || 0);
    const wBtc = 0.8; // least volatile
    const wEth = 1.0; // mid volatile
    const wXrp = 1.2; // most volatile
    const weightedGrowth = (values.cbBTC || 0) * wBtc + (values.ETH || 0) * wEth + (values.cbXRP || 0) * wXrp;
    const denom = stableShare + weightedGrowth;
    const growthPortion = denom > 0 ? weightedGrowth / denom : 0.5;
    return +growthPortion.toFixed(2);
  }

  async function postTiltFromCurrentConfig() {
    try {
      // Compute and dispatch immediately for snappy UI; persist with a short debounce.
      const m = Math.max(0, Math.min(1, Number(modulator || 0)));
      let ratios: Record<string, number>;
      const isCenter = Math.abs(m - 0.5) < 0.005;
      if (isCenter) {
        // Balanced: exact 0.2 across all, and ensure the modulator reflects center
        ratios = { USDC: 0.2, USDT: 0.2, cbBTC: 0.2, cbXRP: 0.2, ETH: 0.2 };
      } else {
        // Deterministic mapping independent of any remote base config:
        // equal split across stables; growth split by risk weights
        ratios = computeTiltedRatios({}, m);
      }

      try {
        window.dispatchEvent(new CustomEvent("pp:reserveRatiosUpdated", { detail: { ratios } }));
      } catch { }

      // Debounced persist
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current as any);
      }
      saveDebounceRef.current = window.setTimeout(async () => {
        try {
          await fetch("/api/site/config", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
            body: JSON.stringify({ reserveRatios: ratios }),
          });
        } catch { }
      }, 120) as any;
    } catch { }
  }

  function scheduleTilt() {
    try {
      // If modulator was just updated due to external ratios change, skip posting to avoid feedback loop.
      if (modUpdateRef.current) {
        modUpdateRef.current = false;
        return;
      }
      // Compute and dispatch immediately for responsiveness
      postTiltFromCurrentConfig();
    } catch { }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/reserve/recommend", {
          headers: { "x-wallet": account?.address || "" },
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          setRecommendation({ recommendedToken: j.recommendedToken, frequency: j.frequency });
        }
      } catch { }
    })();
  }, [account?.address]);

  // Track accumulation mode to control visibility of Strategy Modulator
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/site/config", { headers: { "x-wallet": account?.address || "" } });
        const j = await r.json().catch(() => ({}));
        const m = j?.config?.accumulationMode;
        if (m === "fixed" || m === "dynamic") {
          if (!rsModeUserChangedRef.current) setAccumulationMode(m);
        }
      } catch { }
    })();
  }, [account?.address]);

  // React to accumulation mode changes from ReserveSettings
  useEffect(() => {
    const onMode = (e: any) => {
      try {
        const m = e?.detail?.mode;
        if (m === "fixed" || m === "dynamic") {
          rsModeUserChangedRef.current = true;
          setAccumulationMode(m);
        }
      } catch { }
    };
    try { window.addEventListener("pp:accumulationModeChanged", onMode as any); } catch { }
    return () => {
      try { window.removeEventListener("pp:accumulationModeChanged", onMode as any); } catch { }
    };
  }, []);

  // Auto-apply reserve ratio tilt when moving the modulator slider
  useEffect(() => {
    scheduleTilt();
  }, [modulator, account?.address]);

  // Sync modulator when reserve ratios are updated from sliders or presets
  useEffect(() => {
    const onRatiosUpdated = (e: any) => {
      try {
        const next = e?.detail?.ratios;
        if (next && typeof next === "object") {
          const m = computeModulatorFromRatios(next);
          modUpdateRef.current = true;
          setModulator(m);
        }
      } catch { }
    };
    try { window.addEventListener("pp:reserveRatiosUpdated", onRatiosUpdated as any); } catch { }
    return () => {
      try { window.removeEventListener("pp:reserveRatiosUpdated", onRatiosUpdated as any); } catch { }
    };
  }, [account?.address]);

  function preset(type: "balanced" | "stable" | "btc_hedge" | "xrp_focus") {
    setError("");

    // Balanced: snap slider to center and set exact 0.2 across all tokens
    if (type === "balanced") {
      const target = { USDC: 0.2, USDT: 0.2, cbBTC: 0.2, cbXRP: 0.2, ETH: 0.2 };
      modUpdateRef.current = true;
      setModulator(0.5);
      try { window.dispatchEvent(new CustomEvent("pp:reserveRatiosUpdated", { detail: { ratios: target } })); } catch { }
      (async () => {
        try {
          await fetch("/api/site/config", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
            body: JSON.stringify({ reserveRatios: target }),
          });
        } catch { }
      })();
      return;
    }

    const presets: Record<string, Record<string, number>> = {
      stable: { USDC: 0.4, USDT: 0.4, cbBTC: 0.1, cbXRP: 0.05, ETH: 0.05 },
      btc_hedge: { USDC: 0.25, USDT: 0.25, cbBTC: 0.3, cbXRP: 0.1, ETH: 0.1 },
      xrp_focus: { USDC: 0.25, USDT: 0.25, cbBTC: 0.1, cbXRP: 0.3, ETH: 0.1 },
    };
    const target = { ...presets[type] };
    // Normalize to exact sum=1.0000
    const sum = Object.values(target).reduce((s, v) => s + Number(v || 0), 0) || 1;
    for (const k of Object.keys(target)) target[k] = +(Number(target[k] || 0) / sum).toFixed(4);
    // Move risk slider to reflect this preset
    const m = computeModulatorFromRatios(target);
    modUpdateRef.current = true;
    setModulator(m);
    try { window.dispatchEvent(new CustomEvent("pp:reserveRatiosUpdated", { detail: { ratios: target } })); } catch { }
    (async () => {
      try {
        await fetch("/api/site/config", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
          body: JSON.stringify({ reserveRatios: target }),
        });
      } catch { }
    })();
  }

  async function applyRatios(base: Record<string, number>) {
    try {
      setApplyLoading(true);
      setError("");

      // Smooth gradient using risk-ordered growth (cbXRP > ETH > cbBTC) and stable equalization
      const mod = Math.max(0, Math.min(1, Number(modulator || 0)));
      const stableTarget = Math.max(0, Math.min(1, 1 - mod));
      const growthTarget = Math.max(0, Math.min(1, mod));

      // Stable group honors base mix; equal if missing
      const sUSDC = Math.max(0, Number(base.USDC || 0));
      const sUSDT = Math.max(0, Number(base.USDT || 0));
      const sSum = sUSDC + sUSDT;
      const sUSDCw = sSum > 0 ? sUSDC / sSum : 0.5;
      const sUSDTw = sSum > 0 ? sUSDT / sSum : 0.5;

      // Growth group uses base influenced risk weights (cbXRP, ETH, cbBTC)
      const gXRPb = Math.max(0, Number(base.cbXRP || 0));
      const gETHb = Math.max(0, Number(base.ETH || 0));
      const gBTCb = Math.max(0, Number(base.cbBTC || 0));
      const wXRP = 1.2, wETH = 1.0, wBTC = 0.8;
      let gXRPw = gXRPb * wXRP;
      let gETHw = gETHb * wETH;
      let gBTCw = gBTCb * wBTC;
      const gSum = gXRPw + gETHw + gBTCw;
      if (gSum <= 0) {
        gXRPw = wXRP; gETHw = wETH; gBTCw = wBTC;
      }
      const gNorm = gXRPw + gETHw + gBTCw;

      const ratios = {
        USDC: +(stableTarget * sUSDCw).toFixed(4) as any,
        USDT: +(stableTarget * sUSDTw).toFixed(4) as any,
        cbXRP: +(growthTarget * (gXRPw / gNorm)).toFixed(4) as any,
        ETH: +(growthTarget * (gETHw / gNorm)).toFixed(4) as any,
        cbBTC: +(growthTarget * (gBTCw / gNorm)).toFixed(4) as any,
      } as unknown as Record<string, number>;

      // Normalize to sum=1
      const sum = Object.values(ratios).reduce((s, v) => s + Number(v || 0), 0);
      if (sum > 0) {
        for (const k of Object.keys(ratios)) ratios[k] = +(ratios[k] / sum).toFixed(4);
      }

      try { window.dispatchEvent(new CustomEvent("pp:reserveRatiosUpdated", { detail: { ratios } })); } catch { }

      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        body: JSON.stringify({ reserveRatios: ratios }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.error || "Failed to apply strategy");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to apply strategy");
    } finally {
      setApplyLoading(false);
    }
  }

  if (accumulationMode !== "dynamic") return null;
  return (
    <div className="glass-pane rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Strategy Modulator</h3>
        {recommendation?.recommendedToken ? (
          <span className="microtext text-muted-foreground">
            Suggested settle: <b>{recommendation.recommendedToken}</b> · cadence every {recommendation.frequency}
          </span>
        ) : (
          <span className="microtext text-muted-foreground">Recommendations auto‑calculated from reserve deficits</span>
        )}
      </div>
      <div>
        <label className="text-sm font-medium">Risk Appetite</label>
        <div className="relative pb-5">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={modulator}
            onChange={(e) => setModulator(Number(e.target.value))}
            onMouseUp={() => {
              const v = Number(modulator);
              if (Math.abs(v - 0.5) < 0.03) {
                modUpdateRef.current = true;
                setModulator(0.5);
              }
            }}
            onTouchEnd={() => {
              const v = Number(modulator);
              if (Math.abs(v - 0.5) < 0.03) {
                modUpdateRef.current = true;
                setModulator(0.5);
              }
            }}
            className="w-full glass-range"
          />
          {/* Center notch for Balanced */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-[2px] bg-foreground/30 rounded-sm" />
          {/* Perfectly centered Balanced label under the notch */}
          <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1">
            <button
              type="button"
              className="px-2 py-0.5 rounded border text-[10px] leading-4"
              onClick={() => { modUpdateRef.current = true; setModulator(0.5); }}
              title="Set to Balanced (0.5)"
            >
              Balanced
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between microtext text-muted-foreground">
          <span>Stablecoin-heavy</span>
          <span>Growth tilt</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="px-3 py-1.5 rounded-md border text-xs" onClick={() => preset("balanced")}>Balanced</button>
        <button className="px-3 py-1.5 rounded-md border text-xs" onClick={() => preset("stable")}>Stable Focus</button>
        <button className="px-3 py-1.5 rounded-md border text-xs" onClick={() => preset("btc_hedge")}>BTC Hedge</button>
        <button className="px-3 py-1.5 rounded-md border text-xs" onClick={() => preset("xrp_focus")}>XRP Focus</button>
        <span className="microtext text-muted-foreground ml-auto">
          Applying a preset writes reserveRatios to your config. Adjust sliders above for fine‑tuning.
        </span>
      </div>
      {error && <div className="microtext text-red-500">{error}</div>}
      {applyLoading && <div className="microtext text-muted-foreground">Applying strategy…</div>}
    </div>
  );
}



// ---------------- Withdrawal Instructions ----------------
function WithdrawalInstructionsPanel() {
  const account = useActiveAccount();
  const merchantWallet = (account?.address || "").toLowerCase();
  const brand = useBrand();

  // Resolve Split contract address for the connected merchant (from reserve balances API)
  const [splitAddress, setSplitAddress] = useState<string | null>(null);
  const [addrLoading, setAddrLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!account?.address) {
          setSplitAddress(null);
          return;
        }
        setAddrLoading(true);
        const r = await fetch(`/api/reserve/balances?wallet=${encodeURIComponent(account.address)}`, {
          headers: { "x-wallet": account.address },
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        const addrRaw =
          (typeof j?.splitAddressUsed === "string" && j.splitAddressUsed) ||
          (typeof j?.splitAddress === "string" && j.splitAddress) ||
          (typeof j?.split?.address === "string" && j.split.address) ||
          "";
        if (!cancelled) {
          let addr = addrRaw ? String(addrRaw).toLowerCase() : "";
          if (!addr) {
            try {
              const resp = await fetch(
                `/api/split/deploy?wallet=${encodeURIComponent(account.address)}${brand?.key ? `&brandKey=${encodeURIComponent(brand.key)}` : ""}`,
                { cache: "no-store" }
              );
              const sj = await resp.json().catch(() => ({}));
              const a2 = typeof sj?.split?.address === "string" ? sj.split.address : "";
              addr = a2 ? String(a2).toLowerCase() : "";
            } catch { }
          }
          setSplitAddress(addr || null);
        }
      } catch {
        if (!cancelled) setSplitAddress(null);
      } finally {
        if (!cancelled) setAddrLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [account?.address]);
  return (
    <div className="glass-pane rounded-xl border p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Overview: How money flows</h3>
        <div className="microtext text-muted-foreground mt-1">
          Money flows on-chain on Base (Coinbase L2). Each purchase is paid into your Payment Splitter (“Split”) which records shares for each recipient. Your portion is instantly releasable from the Split to your wallet. You can verify on‑chain any time:&nbsp;
          <span className="whitespace-nowrap">
            Wallet:{" "}
            {merchantWallet ? (
              <a
                className="underline"
                href={`https://base.blockscout.com/address/${merchantWallet}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Blockscout
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
          <span className="mx-1">•</span>
          <span className="whitespace-nowrap">
            Split:{" "}
            {splitAddress ? (
              <a
                className="underline"
                href={`https://base.blockscout.com/address/${splitAddress}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Blockscout
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        </div>
        <div className="mt-2 rounded-md border p-3">
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li>Buyer opens a receipt/portal and pays using the token configured for that order (Fixed = Default token, Dynamic = rotating token).</li>
            <li>
              Funds land in your Split contract{" "}
              {splitAddress ? (
                <a
                  className="underline"
                  href={`https://base.blockscout.com/address/${splitAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  (view Split on Blockscout)
                </a>
              ) : null}
              . Balances accrue per token (ETH, USDC, USDT, cbBTC, cbXRP).
            </li>
            <li>
              Your share is instantly releasable. Use Reserve Analytics to release; tokens move from Split to your wallet{" "}
              {merchantWallet ? (
                <a
                  className="underline"
                  href={`https://base.blockscout.com/address/${merchantWallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  (view Wallet on Blockscout)
                </a>
              ) : null}
              .
            </li>
            <li>After release, assets are in your custody and can be sent to Coinbase or spent directly from your wallet.</li>
          </ol>
        </div>
        <div className="mt-2 rounded-md border p-3 bg-foreground/5">
          <div className="text-sm font-medium">Addresses on Base</div>
          <div className="microtext text-muted-foreground mt-1">Use these to verify activity on Blockscout and to share addresses when needed.</div>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between rounded-md border p-2">
              <div className="text-sm">
                <div className="microtext text-muted-foreground">Your Wallet</div>
                {merchantWallet ? (
                  <TruncatedAddress address={merchantWallet} />
                ) : (
                  <span className="text-muted-foreground">(not connected)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                  onClick={() => { try { if (merchantWallet) navigator.clipboard.writeText(merchantWallet); } catch { } }}
                  disabled={!merchantWallet}
                  title="Copy wallet address"
                >
                  Copy
                </button>
                {merchantWallet ? (
                  <a
                    className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://base.blockscout.com/address/${merchantWallet}`}
                    title="Open on Blockscout"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <div className="text-sm">
                <div className="microtext text-muted-foreground">Split Contract</div>
                {splitAddress ? (
                  <TruncatedAddress address={splitAddress || ""} />
                ) : (
                  <span className="text-muted-foreground">{addrLoading ? "Loading…" : "Not configured"}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                  onClick={() => { try { if (splitAddress) navigator.clipboard.writeText(splitAddress); } catch { } }}
                  disabled={!splitAddress}
                  title="Copy split address"
                >
                  Copy
                </button>
                {splitAddress ? (
                  <a
                    className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://base.blockscout.com/address/${splitAddress}`}
                    title="Open on Blockscout"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Where to release funds</h3>
        <div className="microtext text-muted-foreground mt-1">
          Use the Reserve Analytics panel on the Reserve tab:
        </div>
        <ul className="list-disc pl-5 mt-1 text-sm">
          <li>Click “Withdraw to Wallet” to batch-release all tokens due to you.</li>
          <li>Or use the per-token “Withdraw {"<SYMBOL>"}” buttons to release specific assets.</li>
          <li>Status will indicate Submitted / Skipped / Failed. Skipped often means “not due payment” for that token right now.</li>
        </ul>
        <div className="mt-2 rounded-md border p-3 bg-foreground/5">
          <div className="text-sm font-medium">Addresses & Explorer</div>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between rounded-md border p-2">
              <div className="text-sm">
                <div className="microtext text-muted-foreground">Your Wallet</div>
                {merchantWallet ? (
                  <TruncatedAddress address={merchantWallet} />
                ) : (
                  <span className="text-muted-foreground">(not connected)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                  onClick={() => { try { if (merchantWallet) navigator.clipboard.writeText(merchantWallet); } catch { } }}
                  disabled={!merchantWallet}
                  title="Copy wallet address"
                >
                  Copy
                </button>
                {merchantWallet ? (
                  <a
                    className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://base.blockscout.com/address/${merchantWallet}`}
                    title="Open on Blockscout"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <div className="text-sm">
                <div className="microtext text-muted-foreground">Split Contract</div>
                {splitAddress ? (
                  <TruncatedAddress address={splitAddress || ""} />
                ) : (
                  <span className="text-muted-foreground">{addrLoading ? "Loading…" : "Not configured"}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                  onClick={() => { try { if (splitAddress) navigator.clipboard.writeText(splitAddress); } catch { } }}
                  disabled={!splitAddress}
                  title="Copy split address"
                >
                  Copy
                </button>
                {splitAddress ? (
                  <a
                    className="px-2 py-1 rounded-md border text-xs inline-flex items-center gap-1"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`https://base.blockscout.com/address/${splitAddress}`}
                    title="Open on Blockscout"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Best practices before cashing out</h3>
        <ul className="list-disc pl-5 mt-1 text-sm">
          <li>USDC on Base is recommended for low volatility and broad exchange support.</li>
          <li>If you received mixed tokens, consider swapping to USDC in your wallet or a DEX on Base before sending to Coinbase.</li>
          <li>Always verify the network and token standard when sending to an exchange deposit address.</li>
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Transfer to Coinbase (deposit)</h3>
        <ol className="list-decimal pl-5 mt-1 text-sm space-y-1">
          <li>Open the Coinbase app or web, go to “Receive”.</li>
          <li>Select the asset you plan to deposit (e.g., USDC). For the network, select Base if prompted.</li>
          <li>Copy your Coinbase deposit address for that asset on the Base network.</li>
          <li>From your wallet (the one connected to Admin), send the asset on Base to the copied address.</li>
          <li>Wait for confirmation; the funds will appear in your Coinbase account balance.</li>
        </ol>
        {/* Highlighted callout: Network must match & asset support (dark mode) */}
        <div className="rounded-md border p-3 mt-2 bg-foreground/5 border-amber-500/40">
          <div className="text-sm font-bold text-amber-300">NETWORK MUST MATCH</div>
          <div className="microtext text-foreground mt-1">
            Always send assets on the Base network to a Base deposit address. Mismatched networks can result in permanent loss of funds.
          </div>
          <ul className="list-disc pl-5 mt-2 text-sm text-foreground">
            <li>USDC, USDT, and ETH on Base are broadly supported across exchanges — always verify the deposit network.</li>
            <li>cbBTC and cbXRP are Coinbase‑wrapped assets on Base. When sent to a Coinbase wallet, they convert to native BTC/XRP.</li>
            <li className="text-red-400 font-semibold">Do NOT send cbBTC or cbXRP to exchanges that do not support these wrapped assets. Use Coinbase for deposits or swap to USDC first.</li>
          </ul>
        </div>
      </div>

      {/* Smart Accounts & Gas (highlighted, dark mode) */}
      <div className="rounded-md border p-3 bg-foreground/5 border-green-500/40">
        <div className="text-sm font-bold text-green-300">SMART ACCOUNTS & GAS COVERAGE</div>
        <div className="microtext text-foreground mt-1">
          Accounts created using social login use smart accounts (Account Abstraction). Gas fees for contract releases and Admin‑initiated transfers are covered, so you do not need to hold ETH for gas when withdrawing your split.
        </div>
        <ul className="list-disc pl-5 mt-1 text-sm text-foreground">
          <li>Releases from the Split and Admin transfer actions are sponsored; gas is covered.</li>
          <li>You can withdraw right away even if your wallet has zero ETH balance.</li>
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Withdraw to bank or spend with Coinbase Card</h3>
        <ul className="list-disc pl-5 mt-1 text-sm">
          <li>Once funds are in Coinbase, you can initiate a fiat withdrawal to your linked bank account.</li>
          <li>Alternatively, you can apply for a Coinbase debit card and spend crypto from your Coinbase balance with no additional card fees where supported.</li>
        </ul>
        <div className="microtext text-muted-foreground mt-2">
          See Coinbase help center for region availability and the latest fee schedule.
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="text-sm font-medium mb-1">Quick checklist</div>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>Release your due funds in Reserve Analytics.</li>
          <li>Consolidate to USDC on Base if needed.</li>
          <li>Use Coinbase “Receive” to get a Base deposit address for USDC.</li>
          <li>Send USDC (Base) from your wallet to Coinbase deposit address.</li>
          <li>Withdraw to bank or spend via Coinbase Card.</li>
        </ul>
      </div>
    </div>
  );
}

/** ---------------- Shop Setup Instructions ---------------- */
function ShopSetupInstructionsPanel() {
  const account = useActiveAccount();
  const [slug, setSlug] = useState<string>("");
  const [origin, setOrigin] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    try { setOrigin(window.location.origin); } catch { }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setError("");
        const r = await fetch("/api/shop/config", {
          headers: { "x-wallet": account?.address || "" },
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        const s = typeof j?.config?.slug === "string" ? j.config.slug : "";
        setSlug(s);
      } catch (e: any) {
        setError(e?.message || "Failed to load shop config");
      }
    })();
  }, [account?.address]);

  const shopUrl = slug ? `${origin}/shop/${encodeURIComponent(slug)}` : "";

  return (
    <div className="glass-pane rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Shop Setup Instructions</h3>
        <span className="microtext text-muted-foreground">Claim slug → add inventory → share link</span>
      </div>

      <ol className="list-decimal pl-5 space-y-1 text-sm">
        <li>
          Claim your shop slug to get a friendly URL.
          <div className="microtext text-muted-foreground">
            Open the Profile page and set your display name and shop slug. Your public shop will be accessible at /shop/&lt;slug&gt;.
            <span className="ml-2">
              <a href="/profile" className="underline">Go to Profile</a>
            </span>
          </div>
        </li>
        <li>
          Add inventory from the Inventory tab.
          <div className="microtext text-muted-foreground">
            Use Add Item to upload images, set price, stock, category, tags, and attributes. Mark items as taxable if applicable.
          </div>
        </li>
        <li>
          Share your shop link to start earning.
          <div className="rounded-md border p-2 mt-1 microtext">
            <div className="text-sm font-medium">Your Shop Link</div>
            <div className="mt-1">
              {shopUrl ? (
                <div className="flex items-center justify-between gap-2">
                  <a href={shopUrl} className="underline truncate" title={shopUrl}>{shopUrl}</a>
                  <button
                    className="px-2 py-1 rounded-md border text-xs"
                    onClick={() => { try { navigator.clipboard.writeText(shopUrl); } catch { } }}
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  No slug set yet. Visit <a href="/profile" className="underline">Profile</a> to claim a slug.
                </span>
              )}
            </div>
          </div>
        </li>
        <li>
          Optionally create quick orders or terminal payments.
          <div className="microtext text-muted-foreground">
            Use Orders to generate a receipt from selected items or Terminal to create a one‑off charge with QR.
          </div>
        </li>
      </ol>

      {error && <div className="microtext text-red-500">{error}</div>}
      <div className="rounded-md border p-3 bg-foreground/5">
        <div className="text-sm font-medium">Tips</div>
        <ul className="list-disc pl-5 mt-1 text-sm">
          <li>Use high‑quality images (WebP) and clear names/descriptions for higher conversion.</li>
          <li>Group items with tags and attributes for analytics and easy filtering.</li>
          <li>Enable taxes by setting your default jurisdiction in Reserve → Tax Management.</li>
        </ul>
      </div>
    </div>
  );
}

/** ---------------- Profile Setup Instructions ---------------- */
function ProfileSetupInstructionsPanel() {
  return (
    <div className="glass-pane rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Profile Setup Instructions</h3>
        <span className="microtext text-muted-foreground">Customize identity & roles</span>
      </div>

      <ol className="list-decimal pl-5 space-y-1 text-sm">
        <li>
          Open Profile to edit your identity.
          <div className="microtext text-muted-foreground">
            Visit <a href="/profile" className="underline">/profile</a> to set your display name, avatar/logo, and public details shown across your pages.
          </div>
        </li>
        <li>
          Choose your role: merchant, buyer, or both.
          <div className="microtext text-muted-foreground">
            Roles control surfaces and features you see:
          </div>
          <ul className="list-disc pl-5 mt-1 text-sm">
            <li><b>Merchant</b>: Access Admin, Inventory, Orders, Reserve, analytics, and shop management.</li>
            <li><b>Buyer</b>: Focused purchasing flow and loyalty XP tracking.</li>
            <li><b>Both</b>: Use the same wallet to operate a shop and buy from others.</li>
          </ul>
        </li>
        <li>
          Verify your public profile page.
          <div className="microtext text-muted-foreground">
            Your public profile is accessible at <code className="text-xs">/u/&lt;wallet&gt;</code>. Share it to showcase your brand and receipts history.
          </div>
        </li>
      </ol>

      <div className="rounded-md border p-3 bg-foreground/5">
        <div className="text-sm font-medium">Note</div>
        <div className="microtext text-muted-foreground mt-1">
          Admin visibility requires a connected wallet with merchant role. If you don’t see Admin tabs, confirm your role settings in Profile.
        </div>
      </div>
    </div>
  );
}

/** ---------------- Whitelabel Instructions ---------------- */
function WhitelabelInstructionsPanel() {
  return (
    <div className="glass-pane rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Whitelabel Instructions</h3>
        <span className="microtext text-muted-foreground">Customize the entire experience</span>
      </div>

      <div className="microtext text-muted-foreground">
        The Shop page lets you configure theme and branding to fully whitelabel the buyer and merchant experience.
      </div>

      <ol className="list-decimal pl-5 space-y-1 text-sm">
        <li>
          Configure your shop.
          <div className="microtext">
            Visit <a href="/shop" className="underline">/shop</a> to configure your branding, upload logos, set colors, and preview changes live.
          </div>
        </li>
        <li>
          Set brand and theme.
          <div className="microtext">
            Configure brand name, logo, and theme colors. Branding propagates to Receipts, Portal, Shop, and Admin surfaces.
          </div>
        </li>
      </ol>

      <div className="rounded-md border p-3 bg-foreground/5">
        <div className="text-sm font-medium">Where branding is used</div>
        <ul className="list-disc pl-5 mt-1 text-sm">
          <li>Receipt headers, QR modals, and print views</li>
          <li>Portal checkout pages</li>
          <li>Shop pages and profile surfaces</li>
          <li>Admin navigation and tables (logos, names)</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------- Tax Management (Reserve) ----------------
function TaxManagement() {
  const account = useActiveAccount();
  const [catalog, setCatalog] = useState<TaxCatalogEntry[]>([]);
  const [configJurisdictions, setConfigJurisdictions] = useState<TaxCatalogEntry[]>([]);
  const [provider, setProvider] = useState<{ name?: string; apiKeySet?: boolean }>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [zip, setZip] = useState("");
  const [zipRate, setZipRate] = useState<number | null>(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipMeta, setZipMeta] = useState<{ state?: string; region_name?: string } | null>(null);
  const [defaultJurisdictionCode, setDefaultJurisdictionCode] = useState<string>("");
  // Custom Jurisdiction Builder state
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customComponents, setCustomComponents] = useState<Array<{ code: string; name: string; ratePct: string }>>([
    { code: "SALES", name: "Sales Tax", ratePct: "" },
  ]);
  const [customError, setCustomError] = useState("");
  useEffect(() => {
    try {
      if (customOpen) {
        setTimeout(() => {
          try {
            (document.getElementById("custom-jurisdiction-name") as HTMLInputElement | null)?.focus();
          } catch { }
        }, 0);
      }
    } catch { }
  }, [customOpen]);

  async function refresh() {
    try {
      setLoading(true);
      setError("");
      const cfgRes = await fetch("/api/site/config", { headers: { "x-wallet": account?.address || "" } });
      const cfg = await cfgRes.json().catch(() => ({}));
      const tc = (cfg?.config?.taxConfig || {}) as { jurisdictions?: TaxCatalogEntry[]; provider?: { name?: string; apiKeySet?: boolean } };
      setConfigJurisdictions(Array.isArray(tc.jurisdictions) ? tc.jurisdictions : []);
      setProvider(tc.provider || {});
      setDefaultJurisdictionCode(typeof (tc as any)?.defaultJurisdictionCode === "string" ? (tc as any).defaultJurisdictionCode : "");

      const catRes = await fetch("/api/tax/catalog");
      const cat = await catRes.json().catch(() => ({}));
      setCatalog(Array.isArray(cat?.jurisdictions) ? cat.jurisdictions : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load tax data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [account?.address]);

  async function addJurisdiction(j: TaxCatalogEntry) {
    try {
      setError("");
      const next = [...configJurisdictions.filter((x) => x.code !== j.code), j];
      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        body: JSON.stringify({ taxConfig: { jurisdictions: next, provider } }),
      });
      const jx = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(jx?.error || "Failed to add jurisdiction");
        return;
      }
      setConfigJurisdictions(next);
    } catch (e: any) {
      setError(e?.message || "Failed to add jurisdiction");
    }
  }

  async function removeJurisdiction(code: string) {
    try {
      setError("");
      const next = configJurisdictions.filter((x) => x.code !== code);
      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        body: JSON.stringify({ taxConfig: { jurisdictions: next, provider } }),
      });
      const jx = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(jx?.error || "Failed to remove jurisdiction");
        return;
      }
      setConfigJurisdictions(next);
    } catch (e: any) {
      setError(e?.message || "Failed to remove jurisdiction");
    }
  }

  async function setProviderName(name: string) {
    try {
      const nextProv = { ...provider, name };
      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        body: JSON.stringify({ taxConfig: { jurisdictions: configJurisdictions, provider: nextProv } }),
      });
      const jx = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(jx?.error || "Failed to set provider");
        return;
      }
      setProvider(nextProv);
    } catch (e: any) {
      setError(e?.message || "Failed to set provider");
    }
  }

  async function setDefaultJurisdiction(code: string) {
    try {
      const nextCode = (code || "").slice(0, 16);
      const r = await fetch("/api/site/config", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        body: JSON.stringify({ taxConfig: { jurisdictions: configJurisdictions, provider, defaultJurisdictionCode: nextCode } }),
      });
      const jx = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(jx?.error || "Failed to set default jurisdiction");
        return;
      }
      setDefaultJurisdictionCode(nextCode);
    } catch (e: any) {
      setError(e?.message || "Failed to set default jurisdiction");
    }
  }

  async function lookupZipRate() {
    try {
      setZipLoading(true);
      setError("");
      setZipRate(null);
      setZipMeta(null);
      const zipTrim = String(zip || "").trim();
      if (!zipTrim) {
        setError("Enter a ZIP/Postal code");
        return;
      }
      const res = await fetch(`https://api.taxratesapi.com/rates/${encodeURIComponent(zipTrim)}`);
      const j = await res.json().catch(() => ({}));
      // Parse known response shape: { data: { combined_rate, state, region_name, ... } }
      const combined = Number(j?.data?.combined_rate ?? 0);
      const rate =
        Number.isFinite(combined) && combined > 0
          ? combined
          : Number((j && (j.rate ?? (j.result?.rate) ?? (j.data?.rate))) || 0);
      if (!Number.isFinite(rate) || rate < 0) {
        setError("Rate not found for ZIP");
        setZipRate(null);
        return;
      }
      setZipRate(Math.min(1, rate));
      // Capture meta for persistent jurisdiction naming
      const st = typeof j?.data?.state === "string" ? j.data.state : undefined;
      const rn = typeof j?.data?.region_name === "string" ? j.data.region_name : undefined;
      setZipMeta({ state: st, region_name: rn });
    } catch (e: any) {
      setError(e?.message || "Failed to lookup ZIP");
      setZipRate(null);
      setZipMeta(null);
    } finally {
      setZipLoading(false);
    }
  }

  // Helpers for Custom Jurisdiction Builder
  function genCodeFromName(n: string): string {
    const slug = String(n || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const base = `CUS-${slug}`.slice(0, 16);
    const existing = new Set<string>([...configJurisdictions, ...catalog].map((x) => String(x.code || "")));
    if (!existing.has(base)) return base;
    let code = base;
    let i = 0;
    while (existing.has(code) && i < 100) {
      const suffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2);
      code = `${base.slice(0, Math.max(0, 16 - 3))}-${suffix}`;
      i++;
    }
    return code.slice(0, 16);
  }
  function totalCustomRateFraction(): number {
    try {
      const sum = (customComponents || []).reduce((s, c) => s + Math.max(0, Math.min(100, Number(c.ratePct || 0))) / 100, 0);
      return Math.max(0, Math.min(1, sum));
    } catch {
      return 0;
    }
  }
  async function saveCustomJurisdiction() {
    try {
      setCustomError("");
      const name = String(customName || "").trim();
      if (!name) {
        setCustomError("Enter a jurisdiction name");
        return;
      }
      const comps = (customComponents || []).map((c) => ({
        code: String(c.code || "").toUpperCase().slice(0, 16),
        name: String(c.name || "").trim().slice(0, 80),
        rate: Math.max(0, Math.min(1, Number(c.ratePct || 0) / 100)),
      })).filter((c) => c.code && c.name && Number.isFinite(c.rate));
      if (!comps.length) {
        setCustomError("Add at least one tax component with a valid rate");
        return;
      }
      const rate = Math.max(0, Math.min(1, comps.reduce((s, c) => s + (Number(c.rate) || 0), 0)));
      const rawCode = String(customCode || "").toUpperCase().replace(/[^A-Z0-9-]+/g, "-").slice(0, 16);
      const code = rawCode || genCodeFromName(name);
      await addJurisdiction({ code, name: name.slice(0, 80), rate, components: comps });
      setCustomOpen(false);
      setCustomName("");
      setCustomCode("");
      setCustomComponents([{ code: "SALES", name: "Sales Tax", ratePct: "" }]);
    } catch (e: any) {
      setCustomError(e?.message || "Failed to save custom jurisdiction");
    }
  }

  return (
    <div className="glass-pane rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tax Management</h3>
        <button className="px-2 py-1 rounded-md border text-xs" onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="microtext text-muted-foreground">
        Provider: <input
          className="inline-block h-7 px-2 py-1 border rounded-md bg-background text-xs ml-1"
          placeholder="TaxJar / Avalara / Custom"
          value={provider?.name || ""}
          onChange={(e) => setProviderName(e.target.value)}
        />
        <span className="ml-2 badge-soft">{provider?.apiKeySet ? "API Key Set" : "No API Key"}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md border p-3">
          <div className="text-sm font-medium mb-2">Configured Jurisdictions</div>
          <div className="space-y-2">
            {(configJurisdictions || []).map((j) => (
              <div key={j.code} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <div className="text-sm font-semibold">{j.name}</div>
                  <div className="microtext text-muted-foreground">{j.code} • {Math.round(j.rate * 10000) / 100}%</div>
                </div>
                <button className="px-2 py-1 rounded-md border text-xs" onClick={() => removeJurisdiction(j.code)}>Remove</button>
              </div>
            ))}
            {(configJurisdictions || []).length === 0 && (
              <div className="microtext text-muted-foreground">No jurisdictions configured yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="text-sm font-medium mb-2">Compact Tax Setup</div>
          <div className="space-y-3">
            <div>
              <label className="microtext text-muted-foreground">ZIP/Postal Code Lookup</label>
              <div className="mt-1 flex flex-col sm:flex-row items-stretch gap-2">
                <input
                  className="flex-1 h-9 px-3 py-1 border rounded-md bg-background"
                  placeholder="e.g., 90210, SW1A 1AA"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                />
                <button
                  className="px-3 py-1.5 rounded-md border text-sm w-full sm:w-auto"
                  onClick={lookupZipRate}
                  disabled={zipLoading}
                >
                  {zipLoading ? "Looking up…" : "Lookup"}
                </button>
              </div>
              {zipRate !== null && (
                <div className="microtext text-muted-foreground mt-1 flex flex-col sm:flex-row items-stretch gap-2">
                  <span>Rate: {Math.round((zipRate || 0) * 10000) / 100}%</span>
                  <button
                    className="px-3 py-1.5 rounded-md border text-sm flex items-center w-full sm:w-auto"
                    onClick={() => {
                      const zipTrim = String(zip || "").trim();
                      const st = zipMeta?.state ? String(zipMeta.state).toUpperCase() : "";
                      const rn = zipMeta?.region_name ? String(zipMeta.region_name) : "";
                      const codeBase = st ? `US-${st}-${zipTrim}` : `US-${zipTrim}`;
                      const code = codeBase.slice(0, 16);
                      const nameBase = rn ? `${rn} (${st || "US"})` : `Postal ${zipTrim}`;
                      const name = nameBase.slice(0, 80);
                      addJurisdiction({ code, name, rate: Math.max(0, Math.min(1, zipRate || 0)) });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Jurisdiction
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="microtext text-muted-foreground">Popular Jurisdiction Presets</label>
              <div className="mt-1 flex flex-col sm:flex-row items-stretch gap-2">
                <select className="w-full sm:w-64 h-9 px-3 py-1 border rounded-md bg-background truncate" id="tax-preset-select">
                  {(catalog || []).map((j) => (
                    <option key={j.code} value={j.code}>{j.name} ({Math.round(j.rate * 10000) / 100}%)</option>
                  ))}
                </select>
                <button
                  className="px-3 py-1.5 rounded-md border text-sm flex items-center w-full sm:w-auto"
                  onClick={() => {
                    const sel = document.getElementById("tax-preset-select") as HTMLSelectElement | null;
                    const code = sel?.value || "";
                    const found = (catalog || []).find((x) => x.code === code);
                    if (found) addJurisdiction(found);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Selected
                </button>
              </div>
              {(catalog || []).length === 0 && (
                <div className="microtext text-muted-foreground mt-1">Presets unavailable</div>
              )}
            </div>

            <div>
              <label className="microtext text-muted-foreground">Custom Jurisdiction Builder</label>
              <div className="mt-1 flex flex-col sm:flex-row items-stretch gap-2">
                <button
                  className="px-3 py-1.5 rounded-md border text-sm flex items-center w-full sm:w-auto"
                  onClick={() => setCustomOpen(true)}
                  type="button"
                >
                  <Wand2 className="h-4 w-4 mr-1" /> Build Custom Jurisdiction
                </button>
              </div>
              <div className="microtext text-muted-foreground mt-1">
                Define a custom jurisdiction by combining multiple tax components (e.g., sales + excise).
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="text-sm font-medium mb-2">Default Jurisdiction</div>
        <div className="microtext text-muted-foreground mb-2">
          Current: {defaultJurisdictionCode ? defaultJurisdictionCode : "None"}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-2">
          <select
            className="flex-1 h-9 px-3 py-1 border rounded-md bg-background"
            value={defaultJurisdictionCode}
            onChange={(e) => setDefaultJurisdictionCode(e.target.value)}
          >
            <option value="">Select jurisdiction…</option>
            {(configJurisdictions || []).map((j) => (
              <option key={j.code} value={j.code}>
                {j.name} ({Math.round(j.rate * 10000) / 100}%)
              </option>
            ))}
          </select>
          <button
            className="px-3 py-1.5 rounded-md border text-sm w-full sm:w-auto"
            onClick={() => setDefaultJurisdiction(defaultJurisdictionCode)}
            disabled={!defaultJurisdictionCode}
          >
            Save Default
          </button>
        </div>
        <div className="microtext text-muted-foreground mt-1">
          This sets your default tax jurisdiction used when generating orders.
        </div>
      </div>

      <div className="microtext text-muted-foreground">
        Rates auto‑update via provider when configured. Catalog is a bootstrap reference; integrate a certified tax engine for production.
      </div>

      {error && <div className="microtext text-red-500">{error}</div>}

      {customOpen && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4">
            <div className="w-full max-w-2xl rounded-md border bg-background p-4 relative">
              <button
                onClick={() => setCustomOpen(false)}
                className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                title="Close"
                aria-label="Close custom jurisdiction builder"
              >
                ✕
              </button>
              <div className="text-lg font-semibold mb-2">Build Custom Jurisdiction</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Name</label>
                  <input
                    id="custom-jurisdiction-name"
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    placeholder="e.g., Springfield (IL) Cannabis"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Code (optional)</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="flex-1 h-9 px-3 py-1 border rounded-md bg-background font-mono"
                      placeholder="Auto-generated if empty"
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                      maxLength={16}
                    />
                    <button
                      type="button"
                      className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                      onClick={() => setCustomCode(genCodeFromName(customName))}
                      title="Auto-generate code from name"
                      aria-label="Auto-generate code"
                    >
                      <Wand2 className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="microtext text-muted-foreground mt-1">Max 16 chars. Allowed: A-Z, 0-9, dash. Example: CUS-SPRINGFIELD</div>
                </div>
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="microtext text-muted-foreground">Tax Components</label>
                    <button
                      type="button"
                      className="px-2 py-1 rounded-md border text-xs flex items-center"
                      onClick={() =>
                        setCustomComponents((prev) => [...prev, { code: "", name: "", ratePct: "" }])
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add Component
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    {customComponents.map((c, idx) => (
                      <div key={idx} className="rounded-md border p-2 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                        <input
                          className="md:col-span-2 h-8 px-2 py-1 border rounded-md bg-background font-mono"
                          placeholder="Code"
                          value={c.code}
                          onChange={(e) =>
                            setCustomComponents((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, code: e.target.value.toUpperCase().slice(0, 16) } : x))
                            )
                          }
                          maxLength={16}
                          title="Component code"
                        />
                        <input
                          className="md:col-span-6 h-8 px-2 py-1 border rounded-md bg-background"
                          placeholder="Component name"
                          value={c.name}
                          onChange={(e) =>
                            setCustomComponents((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x))
                            )
                          }
                          title="Component name"
                        />
                        <div className="col-span-12 md:col-span-2 flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            className="h-8 w-full px-2 py-1 border rounded-md bg-background text-right"
                            placeholder="%"
                            value={c.ratePct}
                            onChange={(e) =>
                              setCustomComponents((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, ratePct: e.target.value } : x))
                              )
                            }
                            title="Rate (%)"
                          />
                        </div>
                        {idx > 0 ? (
                          <div className="col-span-12 md:col-span-2 flex md:justify-end justify-start mt-1 md:mt-0">
                            <button
                              type="button"
                              className="h-8 px-2 rounded-md border text-xs"
                              onClick={() =>
                                setCustomComponents((prev) => prev.filter((_x, i) => i !== idx))
                              }
                              aria-label="Remove component"
                              title="Remove"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div className="col-span-12 md:col-span-2" />
                        )}
                      </div>
                    ))}
                    {customComponents.length === 0 && (
                      <div className="microtext text-muted-foreground">No components yet. Add at least one.</div>
                    )}
                  </div>
                </div>
                <div className="md:col-span-2 rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <span className="microtext text-muted-foreground">Total Rate</span>
                    <span className="text-sm font-semibold">
                      {Math.round(totalCustomRateFraction() * 10000) / 100}%
                    </span>
                  </div>
                  <div className="microtext text-muted-foreground">Computed as the sum of component rates, clamped to 100%.</div>
                </div>
              </div>
              {customError && <div className="microtext text-red-500 mt-2">{customError}</div>}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button className="px-3 py-1.5 rounded-md border text-sm" onClick={() => setCustomOpen(false)}>Cancel</button>
                <button className="px-3 py-1.5 rounded-md border text-sm" onClick={saveCustomJurisdiction}>
                  Save Jurisdiction
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

// ---------------- Reserve Analytics ----------------
function ReserveAnalytics() {
  const [data, setData] = useState<ReserveBalancesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false);
  const account = useActiveAccount();

  // Transaction tracking state
  const [transactions, setTransactions] = useState<any[]>([]);
  const [cumulative, setCumulative] = useState<{ payments: Record<string, number>; merchantReleases: Record<string, number>; platformReleases: Record<string, number> }>({ payments: {}, merchantReleases: {}, platformReleases: {} });
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState("");

  // Split withdraw state
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [withdrawResults, setWithdrawResults] = useState<any[]>([]);
  // Friendly formatter for result reason/status
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
  // Batch withdraw progress (merchant)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawQueue, setWithdrawQueue] = useState<string[]>([]);
  const [withdrawProcessed, setWithdrawProcessed] = useState(0);
  const [withdrawStatuses, setWithdrawStatuses] = useState<Record<string, { status: string; tx?: string; reason?: string }>>({});

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

      // Build token queue: prefer tokens with positive balances
      const preferred = ["ETH", "USDC", "USDT", "cbBTC", "cbXRP", "SOL"];
      const balEntries = Object.entries((data?.balances || {}) as Record<string, any>);
      const nonZero = balEntries
        .filter(([sym, info]) => preferred.includes(sym) && Number(info?.units || 0) > 0)
        .map(([sym]) => sym as string);
      let queue = nonZero.length ? nonZero : preferred;
      if (onlySymbol) queue = [onlySymbol];

      // Resolve token addresses from env
      const envTokens: Record<string, { address?: `0x${string}`; decimals?: number }> = {
        ETH: { address: undefined, decimals: 18 },
        USDC: {
          address: (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6),
        },
        USDT: {
          address: (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6),
        },
        cbBTC: {
          address: (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8),
        },
        cbXRP: {
          address: (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6),
        },
        SOL: {
          address: (process.env.NEXT_PUBLIC_BASE_SOL_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_SOL_DECIMALS || 9),
        },
      };

      // Minimal ABI for PaymentSplitter
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

      // Contract handle
      const contract = getContract({
        client,
        chain,
        address: split as `0x${string}`,
        abi: PAYMENT_SPLITTER_ABI as any,
      });

      // Initialize UI state
      setWithdrawResults((prev: any[]) => (onlySymbol ? prev : []));
      if (!onlySymbol) {
        setWithdrawQueue(queue);
        setWithdrawProcessed(0);
        setWithdrawStatuses({});
        setWithdrawModalOpen(true);
      }

      // Execute releases with the connected wallet
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
              setWithdrawStatuses((prev) => ({ ...prev, [symbol]: { status: rr.status, reason: rr.reason } }));
              setWithdrawResults((prev: any[]) => {
                const next = Array.isArray(prev) ? prev.slice() : [];
                next.push(rr as any);
                return next;
              });
              if (!onlySymbol) setWithdrawProcessed((p) => p + 1);
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
          setWithdrawStatuses((prev) => ({ ...prev, [symbol]: { status: rr.status, tx: rr.transactionHash } }));
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
          setWithdrawStatuses((prev) => ({ ...prev, [symbol]: { status: rr.status, reason: rr.reason } }));
          setWithdrawResults((prev: any[]) => {
            const next = Array.isArray(prev) ? prev.slice() : [];
            next.push(rr as any);
            return next;
          });
        } finally {
          if (!onlySymbol) setWithdrawProcessed((p) => p + 1);
        }
      }

      // balances may have changed after withdrawals
      try { await fetchBalances(); } catch { }
    } catch (e: any) {
      setWithdrawError(e?.message || "Withdraw failed");
    }
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

      // Fetch transactions if split address is available
      if (j.splitAddressUsed && /^0x[a-f0-9]{40}$/i.test(j.splitAddressUsed)) {
        await fetchTransactions(j.splitAddressUsed, j.merchantWallet || account?.address || "");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTransactions(splitAddress: string, merchantWallet: string) {
    try {
      setTxLoading(true);
      setTxError("");

      const r = await fetch(`/api/split/transactions?splitAddress=${encodeURIComponent(splitAddress)}&merchantWallet=${encodeURIComponent(merchantWallet)}&limit=100`, {
        cache: "no-store"
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || j?.error) {
        setTxError(j?.error || "Failed to load transactions");
        setTransactions([]);
        setCumulative({ payments: {}, merchantReleases: {}, platformReleases: {} });
      } else {
        const txs = Array.isArray(j?.transactions) ? j.transactions : [];
        const cumulativeData = j?.cumulative || { payments: {}, merchantReleases: {}, platformReleases: {} };
        setTransactions(txs);
        setCumulative(cumulativeData);
      }
    } catch (e: any) {
      setTxError(e?.message || "Failed to load transactions");
      setTransactions([]);
    } finally {
      setTxLoading(false);
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
    return <div className="text-sm text-muted-foreground">Loading balances…</div>;
  }

  if (error && !data) {
    return <div className="text-sm text-red-500">Error: {error}</div>;
  }

  if (!data || !data.balances) {
    return <div className="text-sm text-muted-foreground">No data available</div>;
  }

  const { balances, totalUsd, merchantWallet, sourceWallet, splitAddressUsed } = data;
  const computedSplit = splitAddressUsed || (data as any)?.splitAddress || (data as any)?.split?.address || "";

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
          disabled={withdrawLoading || !computedSplit}
          className="px-2 py-1 rounded-md border text-xs"
          title={computedSplit ? "Withdraw from split to your wallet" : "Split address not configured"}
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
                disabled={withdrawLoading || !computedSplit}
                className="px-2 py-1 rounded-md border text-xs"
                title={computedSplit ? `Withdraw ${symbol} to your wallet` : "Split address not configured"}
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
              ETH: "#8b5cf6",
              SOL: "#14f195",
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

      {/* Transaction History - matches Users panel format */}
      {computedSplit && (
        <div className="rounded-md border glass-pane p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Recent Transactions</div>
            <button
              className="px-2 py-1 rounded-md border text-xs"
              onClick={() => fetchTransactions(String(computedSplit || ""), String(merchantWallet || account?.address || ""))}
              disabled={txLoading}
            >
              {txLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          {txLoading ? (
            <div className="microtext text-muted-foreground">Loading transactions…</div>
          ) : txError ? (
            <div className="microtext text-red-500">{txError}</div>
          ) : transactions.length > 0 ? (
            <>
              <div className="microtext text-muted-foreground mb-2">
                Showing last {transactions.length} transactions to split
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {transactions.map((tx: any, idx: number) => {
                  const txType = tx?.type || 'unknown';
                  const releaseType = tx?.releaseType;
                  const isPayment = txType === 'payment';
                  const isRelease = txType === 'release';

                  return (
                    <div key={idx} className={`p-2 rounded border text-xs ${isRelease ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">
                            <a
                              href={`https://base.blockscout.com/tx/${tx.hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {String(tx.hash || "").slice(0, 10)}…{String(tx.hash || "").slice(-8)}
                            </a>
                          </span>
                          {isPayment && <span className="px-1 py-0.5 rounded text-[10px] bg-green-100 text-green-700">Payment</span>}
                          {isRelease && releaseType === 'merchant' && <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">Merchant Release</span>}
                          {isRelease && releaseType === 'platform' && <span className="px-1 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700">Platform Release</span>}
                        </div>
                        <span className="font-semibold">{Number(tx.value || 0).toFixed(4)} {String(tx.token || 'ETH').toUpperCase()}</span>
                      </div>
                      <div className="flex items-center justify-between microtext text-muted-foreground">
                        <span>{isPayment ? 'From' : 'To'}: {String(isPayment ? tx.from : tx.to || "").slice(0, 8)}…</span>
                        <span>{new Date(Number(tx.timestamp || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 space-y-1">
                <div className="microtext text-muted-foreground">
                  Payments: {(() => {
                    const payments = transactions.filter((tx: any) => tx?.type === 'payment');
                    const tokens = new Set(payments.map((tx: any) => tx.token || 'ETH'));
                    return `${payments.length} tx • ${Array.from(tokens).join(', ')}`;
                  })()}
                </div>
                <div className="microtext text-muted-foreground">
                  Merchant Releases: {(() => {
                    const releases = transactions.filter((tx: any) => tx?.type === 'release' && tx?.releaseType === 'merchant');
                    const tokens = new Set(releases.map((tx: any) => tx.token || 'ETH'));
                    return `${releases.length} tx • ${Array.from(tokens).join(', ')}`;
                  })()}
                </div>
                <div className="microtext text-muted-foreground">
                  Platform Releases: {(() => {
                    const releases = transactions.filter((tx: any) => tx?.type === 'release' && tx?.releaseType === 'platform');
                    const tokens = new Set(releases.map((tx: any) => tx.token || 'ETH'));
                    return `${releases.length} tx • ${Array.from(tokens).join(', ')}`;
                  })()}
                </div>
                {data?.indexedMetrics && (
                  <>
                    <div className="microtext text-muted-foreground">
                      Total Volume: ${Number(data.indexedMetrics.totalVolumeUsd || 0).toFixed(2)}
                    </div>
                    <div className="microtext text-muted-foreground">
                      Customers: {Number(data.indexedMetrics.customers || 0)}
                    </div>
                    <div className="microtext text-muted-foreground">
                      Platform Fee: ${Number(data.indexedMetrics.platformFeeUsd || 0).toFixed(2)}
                    </div>
                  </>
                )}
                <div className="microtext text-muted-foreground">
                  View on{" "}
                  <a
                    href={`https://base.blockscout.com/address/${computedSplit}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Blockscout
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="microtext text-muted-foreground">No transactions found</div>
          )}
        </div>
      )}

      {error && <div className="microtext text-amber-500">Warning: {error}</div>}
      {withdrawModalOpen && typeof window !== "undefined"
        ? createPortal(
          <div
            className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4"
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

// ---------------- Receipts Admin (used in Orders tab for history/QR) ----------------
function ReceiptsAdmin() {
  const [receipts, setReceipts] = React.useState<Array<{
    receiptId: string;
    totalUsd: number;
    currency: string;
    lineItems?: { label: string; priceUsd: number; qty?: number; thumb?: string; itemId?: string; sku?: string }[];
    createdAt: number;
    brandName?: string;
    status?: string;
    jurisdictionCode?: string;
    taxRate?: number;
    taxComponents?: string[];
  }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [seeding, setSeeding] = React.useState(false);
  const [purging, setPurging] = React.useState(false);
  const [qrOpen, setQrOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<{
    receiptId: string;
    totalUsd: number;
    createdAt: number;
    currency: string;
    brandName?: string;
    lineItems?: { label: string; priceUsd: number; qty?: number; thumb?: string; itemId?: string; sku?: string }[];
    status?: string;
    jurisdictionCode?: string;
    taxRate?: number;
    taxComponents?: string[];
  } | null>(null);
  const [origin, setOrigin] = React.useState("");
  const [brandLogoUrl, setBrandLogoUrl] = React.useState<string>("");
  const [themeConfig, setThemeConfig] = React.useState<any>({});
  const [editOpen, setEditOpen] = React.useState(false);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [editDraft, setEditDraft] = React.useState<{ items: { label: string; priceUsd: number; qty?: number; thumb?: string }[]; taxRate?: number } | null>(null);
  const [editLoading, setEditLoading] = React.useState(false);
  const [editError, setEditError] = React.useState("");
  // Edit modal tax selection state
  const [editJurisdictions, setEditJurisdictions] = React.useState<TaxCatalogEntry[]>([]);
  const [editJurisdictionCode, setEditJurisdictionCode] = React.useState<string>("");
  const [editSelectedComponents, setEditSelectedComponents] = React.useState<string[]>([]);
  // Override input shown as percent string, e.g., "8.4" -> 8.4%
  const [editTaxOverridePct, setEditTaxOverridePct] = React.useState<string>("");
  // Transaction hash tracking state
  const [editTransactionHash, setEditTransactionHash] = React.useState<string>("");
  const [splitTransactions, setSplitTransactions] = React.useState<any[]>([]);
  const [txLoading, setTxLoading] = React.useState(false);
  const [splitAddress, setSplitAddress] = React.useState<string>("");
  const [refundDraft, setRefundDraft] = React.useState<{ selected: Record<number, boolean>; buyerWallet: string; refundUsd: number }>({ selected: {}, buyerWallet: "", refundUsd: 0 });
  const [refundLoading, setRefundLoading] = React.useState(false);
  const [refundError, setRefundError] = React.useState("");
  const account = useActiveAccount();
  const operatorWallet = (account?.address || "").toLowerCase();
  const superadminRecipient = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
  const isSuperadminRecipient = !!superadminRecipient && operatorWallet === superadminRecipient;
  const [testHidden, setTestHidden] = React.useState<boolean>(false);
  const shortWallet = React.useMemo(() => {
    const w = operatorWallet;
    return w ? `${w.slice(0, 6)}…${w.slice(-4)}` : "(not connected)";
  }, [operatorWallet]);

  // Info modal for notifications/errors (replaces alerts)
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [modalTitle, setModalTitle] = React.useState("");
  const [modalDesc, setModalDesc] = React.useState("");
  const [modalMicrotexts, setModalMicrotexts] = React.useState<Array<{ label: string; value?: string }>>([]);
  function showInfo(title: string, desc: string, microtexts: Array<{ label: string; value?: string }> = []) {
    try {
      setModalTitle(title);
      setModalDesc(desc);
      setModalMicrotexts(microtexts);
      setInfoOpen(true);
    } catch { }
  }

  React.useEffect(() => {
    try { setOrigin(window.location.origin); } catch { }
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/site/config", { cache: "no-store", headers: { "x-wallet": account?.address || "" } });
        const j = await r.json().catch(() => ({} as any));
        const t = j?.config?.theme || {};
        setThemeConfig(t);
        const url = typeof t?.brandLogoUrl === "string" ? t.brandLogoUrl : "";
        setBrandLogoUrl(url);
      } catch { }
    })();
  }, [account?.address]);

  async function loadReceipts() {
    try {
      setLoading(true);
      setError("");
      const r = await fetch(`/api/receipts?limit=100`, {
        cache: "no-store",
        credentials: "include",
        headers: {
          "x-wallet": account?.address || "",
        },
      });
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j?.receipts) ? j.receipts : [];
      setReceipts(arr);
      if (j?.degraded) setError(j?.reason || "Degraded; using in-memory data");
    } catch (e: any) {
      setError(e?.message || "Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }

  async function seed() {
    try {
      setSeeding(true);
      setError("");
      const r = await fetch(`/api/receipts/seed`, {
        method: "POST",
        headers: {
          "x-wallet": account?.address || "",
        },
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j?.error || "Failed to seed");
      }
      await loadReceipts();
    } catch (e: any) {
      setError(e?.message || "Failed to seed");
    } finally {
      setSeeding(false);
    }
  }

  async function purge() {
    try {
      setError("");
      setPurging(true);
      const r = await fetch(`/api/receipts/purge`, {
        method: "POST",
        headers: {
          "x-wallet": account?.address || "",
        },
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to purge receipts");
      }
      await loadReceipts();
    } catch (e: any) {
      setError(e?.message || "Failed to purge receipts");
    } finally {
      setPurging(false);
    }
  }

  React.useEffect(() => {
    loadReceipts();
  }, [account?.address]);

  async function openQR(rec: any) {
    try {
      const id = String(rec?.receiptId || "");
      if (!id) {
        setSelected(rec);
        setQrOpen(true);
        return;
      }
      const r = await fetch(`/api/receipts/${encodeURIComponent(id)}`, { cache: "no-store", credentials: "include" });
      const j = await r.json().catch(() => ({}));
      const full = j?.receipt || rec;
      setSelected(full);
    } catch {
      setSelected(rec);
    }
    setQrOpen(true);
  }
  function closeQR() {
    setQrOpen(false);
    setSelected(null);
  }

  function openEdit(rec: any) {
    try {
      setSelected(rec);
      const baseItems = Array.isArray(rec?.lineItems)
        ? rec.lineItems.filter((it: any) => !/processing fee/i.test(String(it?.label || "")) && !/tax/i.test(String(it?.label || "")))
        : [];
      setEditDraft({ items: baseItems, taxRate: undefined });
      setEditError("");
      // Reset tax selection state
      setEditTaxOverridePct("");
      setEditJurisdictions([]);
      setEditJurisdictionCode("");
      setEditSelectedComponents([]);
      // Reset transaction hash state
      setEditTransactionHash((rec as any)?.transactionHash || "");
      setSplitTransactions([]);
      setTxLoading(false);
      setSplitAddress("");

      // Load tax config and split transactions
      (async () => {
        try {
          const r = await fetch("/api/site/config", { headers: { "x-wallet": account?.address || "" } });
          const j = await r.json().catch(() => ({}));
          const list: TaxCatalogEntry[] = Array.isArray(j?.config?.taxConfig?.jurisdictions) ? j.config.taxConfig.jurisdictions : [];
          setEditJurisdictions(list);
          const defJ = j?.config?.taxConfig?.defaultJurisdictionCode;
          if (typeof defJ === "string" && defJ) {
            setEditJurisdictionCode(defJ);
            const jur = list.find(x => x.code === defJ);
            const comps = Array.isArray(jur?.components) ? jur!.components : [];
            setEditSelectedComponents(comps.map(c => c.code));
          }
        } catch { }

        // Load split address and transactions
        try {
          const balRes = await fetch("/api/reserve/balances", {
            headers: { "x-wallet": account?.address || "" },
            cache: "no-store",
          });
          const balData = await balRes.json().catch(() => ({}));
          const splitAddr = typeof balData?.splitAddressUsed === "string" ? balData.splitAddressUsed : "";

          if (splitAddr && /^0x[a-f0-9]{40}$/i.test(splitAddr)) {
            setSplitAddress(splitAddr);
            setTxLoading(true);

            // Fetch recent transactions from the split
            const txRes = await fetch(`/api/split/transactions?splitAddress=${encodeURIComponent(splitAddr)}&limit=50`, {
              cache: "no-store",
            });
            const txData = await txRes.json().catch(() => ({}));
            const txs = Array.isArray(txData?.transactions) ? txData.transactions : [];
            // Filter to only payment transactions (exclude releases and unsupported tokens)
            const paymentTxs = txs.filter((tx: any) => tx?.type === 'payment');
            setSplitTransactions(paymentTxs);
          }
        } catch { }
        finally {
          setTxLoading(false);
        }
      })();
      setEditOpen(true);
    } catch {
      setEditOpen(true);
    }
  }
  function closeEdit() {
    setEditOpen(false);
    setEditDraft(null);
    setSelected(null);
    setEditError("");
    setEditLoading(false);
  }
  async function saveEdit() {
    try {
      if (!selected?.receiptId || !editDraft) return;
      setEditLoading(true);
      setEditError("");
      const body: any = { items: editDraft.items };

      // Decide taxRate to send:
      // 1) If override percent provided -> convert to fraction
      // 2) Else if a jurisdiction is selected -> compute from selected components if any, else jurisdiction rate
      // 3) Else send without taxRate to let backend infer/default
      let taxRateToSend: number | undefined = undefined;
      const pctStr = String(editTaxOverridePct || "").trim();
      if (pctStr !== "") {
        const pct = Number(pctStr);
        if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
          taxRateToSend = Math.max(0, Math.min(1, pct / 100));
        } else {
          setEditError("Invalid override percent. Use 0 - 100.");
          setEditLoading(false);
          return;
        }
      } else if (editJurisdictionCode) {
        const jur = (editJurisdictions || []).find(j => j.code === editJurisdictionCode);
        if (jur) {
          let rate = 0;
          const comps = Array.isArray(jur.components) ? jur.components : [];
          if ((editSelectedComponents || []).length && comps.length) {
            const compMap = new Map<string, number>(comps.map((c) => [String(c.code || ""), Math.max(0, Math.min(1, Number(c.rate || 0)))]));
            rate = (editSelectedComponents || []).reduce((sum, code) => sum + (compMap.get(code) || 0), 0);
          } else {
            rate = Math.max(0, Math.min(1, Number(jur.rate || 0)));
          }
          taxRateToSend = Math.max(0, Math.min(1, rate));
        }
      }

      if (typeof taxRateToSend === "number") {
        body.taxRate = taxRateToSend;
      }

      // Add transaction hash if provided
      const txHash = String(editTransactionHash || "").trim();
      if (txHash && /^0x[a-fA-F0-9]{64}$/i.test(txHash)) {
        body.transactionHash = txHash;
      }

      const r = await fetch(`/api/receipts/${encodeURIComponent(selected.receiptId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet": account?.address || "",
        },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setEditError(j?.error || "Failed to update receipt");
        return;
      }
      await loadReceipts();
      closeEdit();
    } catch (e: any) {
      setEditError(e?.message || "Failed to update receipt");
    } finally {
      setEditLoading(false);
    }
  }

  function openRefund(rec: any) {
    try {
      setSelected(rec);
      const baseItems = Array.isArray(rec?.lineItems)
        ? rec.lineItems.filter((it: any) => !/processing fee/i.test(String(it?.label || "")) && !/tax/i.test(String(it?.label || "")))
        : [];
      const sel: Record<number, boolean> = {};
      baseItems.forEach((_it: any, idx: number) => { sel[idx] = true; });
      const refundUsd = baseItems.reduce((s: number, it: any) => s + Number(it?.priceUsd || 0), 0);
      setRefundDraft({ selected: sel, buyerWallet: "", refundUsd });
      setRefundError("");
      setRefundOpen(true);
    } catch {
      setRefundOpen(true);
    }
  }
  function closeRefund() {
    setRefundOpen(false);
    setRefundDraft({ selected: {}, buyerWallet: "", refundUsd: 0 });
    setSelected(null);
    setRefundError("");
    setRefundLoading(false);
  }
  async function initiateRefund() {
    try {
      if (!selected?.receiptId || !refundDraft) return;
      setRefundLoading(true);
      setRefundError("");
      const buyer = String(refundDraft.buyerWallet || "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/i.test(buyer)) {
        setRefundError("Enter a valid buyer wallet address (0x...)");
        return;
      }
      const baseItems = Array.isArray(selected?.lineItems)
        ? selected!.lineItems.filter((it: any) => !/processing fee/i.test(String(it?.label || "")) && !/tax/i.test(String(it?.label || "")))
        : [];
      const selectedItems = baseItems
        .map((it: any, idx: number) => ({ ...it, idx }))
        .filter((it: any) => refundDraft.selected[it.idx]);
      const refundUsd = selectedItems.reduce((s: number, it: any) => s + Number(it?.priceUsd || 0), 0);
      if (refundUsd <= 0) {
        setRefundError("Select at least one item to refund");
        return;
      }
      // Convert USD -> ETH using live rate (fallback if unavailable)
      let usdPerEth = 0;
      try {
        const rates = await fetchEthRates();
        usdPerEth = Number(rates?.USD || 0);
      } catch { }
      if (!usdPerEth || usdPerEth <= 0) {
        setRefundError("ETH rates unavailable");
        return;
      }
      const ethAmount = refundUsd / usdPerEth;
      const wei = BigInt(Math.floor(ethAmount * 1e18));
      if (!account?.address) {
        setRefundError("Connect your wallet");
        return;
      }
      const prepared = await prepareTransaction({
        client,
        chain,
        to: buyer as `0x${string}`,
        value: wei,
      });
      const tx = await sendTransaction({
        account: account as any,
        transaction: prepared,
      });
      const txHash = (tx as any)?.transactionHash || (tx as any)?.hash || undefined;

      // Log refund in backend
      const r = await fetch("/api/receipts/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          receiptId: selected.receiptId,
          wallet: (account?.address || "").toLowerCase(),
          buyer,
          usd: +Number(refundUsd).toFixed(2),
          items: selectedItems.map((it: any) => ({ label: it.label, priceUsd: it.priceUsd, qty: it.qty })),
          txHash,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setRefundError(j?.error || "Failed to log refund");
        return;
      }
      await loadReceipts();
      closeRefund();
    } catch (e: any) {
      setRefundError(e?.message || "Refund failed");
    } finally {
      setRefundLoading(false);
    }
  }

  function statusLabel(s?: string) {
    const v = (s || "").toLowerCase();
    switch (v) {
      case "generated":
        return "Generated";
      case "link_opened":
        return "Link Opened";
      case "buyer_logged_in":
        return "Buyer Logged In";
      case "checkout_initialized":
        return "Checkout Ready";
      case "checkout_success":
        return "Checkout Success";
      case "paid":
        return "Paid";
      case "tx_mined":
        return "Tx Mined";
      case "recipient_validated":
        return "Recipient Validated";
      case "reconciled":
        return "Reconciled";
      case "tx_mismatch":
        return "Tx Mismatch";
      case "failed":
        return "Failed";
      default:
        return s || "—";
    }
  }
  function statusClass(s?: string) {
    const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs border";
    const v = (s || "").toLowerCase();
    if (v === "paid" || v === "reconciled" || v === "checkout_success" || v === "tx_mined" || v === "recipient_validated") {
      return base + " bg-green-100 text-green-700 border-green-200";
    }
    if (v === "generated") {
      return base + " bg-gray-100 text-gray-700 border-gray-200";
    }
    if (v === "link_opened" || v === "buyer_logged_in" || v === "checkout_initialized") {
      return base + " bg-blue-100 text-blue-700 border-blue-200";
    }
    if (v === "tx_mismatch" || v === "failed") {
      return base + " bg-red-100 text-red-700 border-red-200";
    }
    return base + " bg-foreground/5 text-foreground/80 border-foreground/10";
  }

  function isBlockedStatus(s?: string) {
    const v = String(s || "").toLowerCase();
    return (
      v === "paid" ||
      v === "partial_refund" ||
      v.includes("refund") ||
      v === "checkout_success" ||
      v === "reconciled" ||
      v === "tx_mined" ||
      v === "recipient_validated"
    );
  }

  function openPortalWindow(url: string) {
    try {
      const width = 428;
      const height = 780;
      const dualScreenLeft = (window.screenLeft !== undefined) ? window.screenLeft : (window as any).screenX || 0;
      const dualScreenTop = (window.screenTop !== undefined) ? window.screenTop : (window as any).screenY || 0;
      const sw = window.innerWidth || document.documentElement.clientWidth || screen.width || 1280;
      const sh = window.innerHeight || document.documentElement.clientHeight || screen.height || 800;
      const left = Math.max(0, Math.floor((sw - width) / 2) + dualScreenLeft);
      const top = Math.max(0, Math.floor((sh - height) / 2) + dualScreenTop);

      const features = [
        "toolbar=0",
        "menubar=0",
        "location=0",
        "status=0",
        "scrollbars=1",
        "resizable=1",
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`
      ].join(",");

      const win = window.open("", "portalpay_receipt", features);
      if (win) {
        try { (win as any).opener = null; } catch { }
        try { win.location.href = url; } catch { }
        try { win.focus(); } catch { }
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }


  function getPortalLink(receiptId: string) {
    const tParams = new URLSearchParams();
    if (operatorWallet) tParams.set("recipient", operatorWallet);
    tParams.set("t_text", String(themeConfig?.textColor || "#ffffff"));
    if (themeConfig?.primaryColor) tParams.set("t_primary", themeConfig.primaryColor);
    if (themeConfig?.secondaryColor) tParams.set("t_secondary", themeConfig.secondaryColor);
    if (themeConfig?.fontFamily) tParams.set("t_font", themeConfig.fontFamily);
    if (themeConfig?.brandName) tParams.set("t_brand", themeConfig.brandName);
    if (themeConfig?.brandLogoUrl) tParams.set("t_logo", themeConfig.brandLogoUrl);

    // Hardcode production domain as requested
    return `https://pay.ledger1.ai/portal/${encodeURIComponent(receiptId)}?${tParams.toString()}`;
  }

  const portalUrl = selected ? getPortalLink(selected.receiptId) : "";
  const items = Array.isArray(selected?.lineItems) ? selected!.lineItems : [];
  const itemsSubtotalUsd = React.useMemo(() => {
    try {
      const base = items
        .filter((it) => !/processing fee/i.test(it.label || ""))
        .filter((it) => !/tax/i.test(it.label || ""))
        .reduce((s, it) => s + Number(it.priceUsd || 0), 0);
      return +base.toFixed(2);
    } catch {
      return +Number(selected?.totalUsd || 0).toFixed(2);
    }
  }, [items, selected?.totalUsd]);
  const taxUsd = React.useMemo(() => {
    try {
      const tax = items.find((it) => /tax/i.test(it.label || ""));
      return tax ? +Number(tax.priceUsd || 0).toFixed(2) : 0;
    } catch {
      return 0;
    }
  }, [items]);
  const processingFeeUsd = React.useMemo(() => {
    try {
      const fee = items.find((it) => /processing fee/i.test(it.label || ""));
      return fee ? +Number(fee.priceUsd || 0).toFixed(2) : 0;
    } catch {
      return 0;
    }
  }, [items]);
  const totalUsd = +Number(selected?.totalUsd || 0).toFixed(2);

  return (
    <div className="glass-pane rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Receipts</h2>
        <div className="flex items-center gap-2">
          {isSuperadminRecipient && (
            <>
              <button onClick={seed} disabled={seeding || (receipts && receipts.length > 0)} className="px-3 py-1.5 rounded-md border text-sm">
                {seeding ? "Seeding…" : "Seed Receipt"}
              </button>
              <button onClick={purge} disabled={purging || loading} className="px-3 py-1.5 rounded-md border text-sm">
                {purging ? "Purging…" : "Purge Receipts"}
              </button>
            </>
          )}
          <button onClick={loadReceipts} disabled={loading} className="px-3 py-1.5 rounded-md border text-sm">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {testHidden && (
            <button onClick={() => setTestHidden(false)} className="px-3 py-1.5 rounded-md border text-sm" title="Restore TEST receipt to list">
              Restore TEST
            </button>
          )}
        </div>
      </div>
      {error && <div className="microtext text-amber-600">{error}</div>}

      <div className="overflow-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-foreground/5">
              <th className="text-left px-3 py-2 font-medium">Receipt ID</th>
              <th className="text-left px-3 py-2 font-medium">Brand</th>
              <th className="text-left px-3 py-2 font-medium">Total (USD)</th>
              <th className="text-left px-3 py-2 font-medium">Created</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Jurisdiction</th>
              <th className="text-left px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(receipts || [])
              .filter((r: any) => !(testHidden && String(r?.receiptId || "").toUpperCase() === "TEST"))
              .map((rec: any) => (
                <tr key={rec.receiptId} className="border-t">
                  <td className="px-3 py-2 font-mono">{rec.receiptId}</td>
                  <td className="px-3 py-2">{rec.brandName || "—"}</td>
                  <td className="px-3 py-2">${Number(rec.totalUsd || 0).toFixed(2)}</td>
                  <td className="px-3 py-2">{new Date(Number(rec.createdAt || 0)).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className={statusClass(rec.status)}>{statusLabel(rec.status)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {rec.jurisdictionCode ? (
                      <span className="microtext">{rec.jurisdictionCode} • {Math.round(Number(rec.taxRate || 0) * 10000) / 100}%</span>
                    ) : (
                      <span className="microtext text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openQR(rec)}
                        className="px-2 py-1 rounded-md border text-xs"
                        disabled={isBlockedStatus(rec.status)}
                        title={isBlockedStatus(rec.status) ? "QR disabled for settled/refunded receipts" : "QR Code"}
                      >
                        QR Code
                      </button>
                      <button
                        onClick={() => {
                          try {
                            openPortalWindow(getPortalLink(rec.receiptId));
                          } catch { }
                        }}
                        className="px-2 py-1 rounded-md border text-xs"
                        title="Open portal in a new window"
                      >
                        Open Portal
                      </button>
                      <button
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(getPortalLink(rec.receiptId));
                          } catch { }
                        }}
                        className="px-2 py-1 rounded-md border text-xs"
                        title="Copy portal link"
                      >
                        Copy Link
                      </button>
                      <button
                        onClick={() => openEdit(rec)}
                        className="px-2 py-1 rounded-md border text-xs"
                        title="Edit Order"
                      >
                        ✎ Edit
                      </button>
                      <button
                        onClick={() => openRefund(rec)}
                        className="px-2 py-1 rounded-md border text-xs"
                        title="Refund"
                      >
                        ↺ Refund
                      </button>
                      {String(rec.receiptId || "").toUpperCase() === "TEST" ? (
                        <button
                          onClick={() => setTestHidden(true)}
                          className="px-2 py-1 rounded-md border text-xs"
                          title="Hide TEST receipt from list"
                        >
                          🙈 Hide
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              const url = `${window.location.origin}/api/receipts/${encodeURIComponent(rec.receiptId)}`;
                              const r = await fetch(url, { method: "DELETE", headers: { "x-wallet": (account?.address || "") }, credentials: "include", cache: "no-store" });
                              const j = await r.json().catch(() => ({}));
                              if (r.ok && j?.ok) {
                                await loadReceipts();
                              } else {
                                showInfo("Delete blocked", String(j?.error || "Delete blocked"), [
                                  { label: "Receipt", value: String(rec.receiptId || "") },
                                  { label: "Status", value: String(rec.status || "") },
                                ]);
                              }
                            } catch { }
                          }}
                          className="px-2 py-1 rounded-md border text-xs"
                          title="Delete"
                          disabled={isBlockedStatus(rec.status)}
                        >
                          🗑 Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            {(!receipts || receipts.length === 0) && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No receipts yet. Use "Seed Receipt" to generate a demo receipt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {qrOpen && selected && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4 print-no-bg print-static">
            <div className="w-full max-w-sm relative">

              <div className="thermal-paper relative mx-auto">
                <button
                  onClick={closeQR}
                  className="print-hidden absolute -right-3 -top-3 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                  title="Close"
                  aria-label="Close receipt modal"
                >
                  ✕
                </button>
                <div className="grid place-items-center mb-1">
                  <img src={brandLogoUrl || "/ppsymbol.png"} alt="Logo" className="h-8 logo object-contain" />
                </div>
                <div className="text-center text-sm font-semibold">
                  {selected.brandName || "PortalPay"}
                </div>
                <div className="thermal-footer">
                  {new Date(Number(selected.createdAt || 0)).toLocaleString()}
                </div>

                <div className="space-y-1 mt-1">
                  <div className="thermal-row"><span>Receipt #</span><span>{selected.receiptId}</span></div>
                  <div className="thermal-row"><span>Merchant</span><span>{selected.brandName || "PortalPay"}</span></div>
                  <div className="thermal-row"><span>Operator</span><span>{shortWallet}</span></div>
                  <div className="thermal-row"><span>Site</span><span>{origin.replace(/^https?:\/\/(www\.)?/, "")}</span></div>
                  <div className="thermal-row"><span>Terminal</span><span>ADMIN-PORTAL</span></div>
                  {selected?.jurisdictionCode ? (
                    <div className="thermal-row"><span>Jurisdiction</span><span>{selected.jurisdictionCode}</span></div>
                  ) : null}
                  {typeof (selected as any)?.taxRate === "number" ? (
                    <div className="thermal-row"><span>Tax Rate</span><span>{Math.round(Number((selected as any).taxRate || 0) * 10000) / 100}%</span></div>
                  ) : null}
                  {Array.isArray((selected as any)?.taxComponents) && (selected as any).taxComponents.length ? (
                    <div className="thermal-row"><span>Tax Components</span><span>{(selected as any).taxComponents.join(", ")}</span></div>
                  ) : null}
                </div>

                <div className="thermal-rule" />
                <div className="space-y-1">
                  {items.map((it, idx) => (
                    <div key={idx} className="thermal-row">
                      <span>
                        {it.label}
                        {typeof it.qty === "number" && it.qty > 1 ? ` × ${it.qty}` : ""}
                      </span>
                      <span>${Number(it.priceUsd || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="thermal-rule" />
                <div className="thermal-row">
                  <span>Subtotal</span>
                  <span>${itemsSubtotalUsd.toFixed(2)}</span>
                </div>
                {taxUsd > 0 && (
                  <div className="thermal-row">
                    <span>Tax</span>
                    <span>${taxUsd.toFixed(2)}</span>
                  </div>
                )}
                {processingFeeUsd > 0 && (
                  <div className="thermal-row">
                    <span>Processing Fee</span>
                    <span>${processingFeeUsd.toFixed(2)}</span>
                  </div>
                )}
                <div className="thermal-row" style={{ fontWeight: 600 }}>
                  <span>Total (USD)</span>
                  <span>${totalUsd.toFixed(2)}</span>
                </div>

                <div className="thermal-rule" />
                {Array.isArray((selected as any)?.refunds) && (selected as any).refunds.length > 0 && (
                  <div className="space-y-1 my-2">
                    <div className="thermal-row"><span>Refunds</span><span /></div>
                    {(selected as any).refunds.map((rf: any, i: number) => (
                      <div key={i} className="thermal-row">
                        <span>Refund {rf.usd ? `($${Number(rf.usd || 0).toFixed(2)})` : ""}</span>
                        <span>{rf.txHash ? String(rf.txHash).slice(0, 10) + "…" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
                {isBlockedStatus(selected?.status) ? (
                  <div className="microtext text-muted-foreground text-center my-2">
                    Payment QR is hidden for settled/refunded receipts.
                  </div>
                ) : (
                  <>
                    <div className="grid place-items-center my-2">
                      <QRCodeCanvas
                        value={portalUrl}
                        size={120}
                        includeMargin
                        fgColor="#000000"
                        bgColor="#ffffff"
                      />
                    </div>
                    <div className="thermal-footer">Scan to pay or visit</div>
                    <div className="thermal-footer" style={{ wordBreak: "break-all" }}>
                      {portalUrl}
                    </div>
                  </>
                )}

                <div className="thermal-rule" />
                <div className="thermal-footer">THANK YOU FOR YOUR BUSINESS!</div>
              </div>

              <div className="thermal-actions print-hidden">
                <button onClick={() => { try { window.print(); } catch { } }} className="receipt-button">Print Receipt</button>
                {!isBlockedStatus(selected?.status) && (
                  <>
                    <button onClick={() => { try { navigator.clipboard.writeText(portalUrl); } catch { } }} className="receipt-button">Copy Link</button>
                    <button onClick={() => { try { openPortalWindow(portalUrl); } catch { } }} className="receipt-button">Open Portal</button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {editOpen && selected && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4">
            <div className="w-full max-w-lg rounded-md border bg-background p-4 relative">
              <button
                onClick={closeEdit}
                className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                title="Close"
                aria-label="Close edit modal"
              >
                ✕
              </button>
              <div className="text-lg font-semibold mb-2">Edit Order — {selected.receiptId}</div>
              <div className="space-y-2">
                {(editDraft?.items || []).map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Thumbnail src={(it as any)?.thumb} alt="" size={32} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{it.label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="h-8 w-16 px-2 py-1 border rounded-md bg-background text-sm text-center"
                        value={Number(it.qty || 1)}
                        onChange={(e) => {
                          const q = Math.max(0, Math.floor(Number(e.target.value || 0)));
                          setEditDraft((prev) => {
                            if (!prev) return prev;
                            const next = { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, qty: q || undefined } : x) };
                            return next;
                          });
                        }}
                        placeholder="qty"
                        title="Quantity"
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="h-8 w-24 px-2 py-1 border rounded-md bg-background text-sm text-center"
                        value={Number(it.priceUsd || 0)}
                        onChange={(e) => {
                          const p = Math.max(0, Number(e.target.value || 0));
                          setEditDraft((prev) => {
                            if (!prev) return prev;
                            const next = { ...prev, items: prev.items.map((x, i) => i === idx ? { ...x, priceUsd: p } : x) };
                            return next;
                          });
                        }}
                        placeholder="price"
                        title="Price (USD)"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="microtext text-muted-foreground">Jurisdiction (optional)</label>
                  <select
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    value={editJurisdictionCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setEditJurisdictionCode(code);
                      const jur = (editJurisdictions || []).find(j => j.code === code);
                      const comps = Array.isArray(jur?.components) ? jur!.components : [];
                      setEditSelectedComponents(comps.map(c => c.code));
                    }}
                  >
                    <option value="">Use default/inferred</option>
                    {(editJurisdictions || []).map((j) => (
                      <option key={j.code} value={j.code}>
                        {j.name} ({Math.round((j.rate || 0) * 10000) / 100}%)
                      </option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const jur = (editJurisdictions || []).find(j => j.code === editJurisdictionCode);
                  const comps = Array.isArray(jur?.components) ? jur!.components : [];
                  if (!comps.length || !editJurisdictionCode) return null;
                  return (
                    <div>
                      <label className="microtext text-muted-foreground">Apply Tax Components</label>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {comps.map((c) => {
                          const checked = editSelectedComponents.includes(c.code);
                          return (
                            <label key={c.code} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const on = e.target.checked;
                                  setEditSelectedComponents((prev) => {
                                    if (on) return Array.from(new Set([...(prev || []), c.code]));
                                    return (prev || []).filter((x) => x !== c.code);
                                  });
                                }}
                              />
                              <span className="truncate">
                                {c.name} ({Math.round((c.rate || 0) * 10000) / 100}%)
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="microtext text-muted-foreground mt-1">
                        Selected rate: {(() => {
                          try {
                            const compMap = new Map<string, number>(comps.map((c) => [String(c.code || ""), Math.max(0, Math.min(1, Number(c.rate || 0)))]));
                            const sum = (editSelectedComponents || []).reduce((s, code) => s + (compMap.get(code) || 0), 0);
                            return `${Math.round(sum * 10000) / 100}%`;
                          } catch {
                            return "—";
                          }
                        })()}
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <label className="microtext text-muted-foreground">Override Tax Rate (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    placeholder="e.g., 8.4 for 8.4%"
                    value={editTaxOverridePct}
                    onChange={(e) => setEditTaxOverridePct(e.target.value)}
                  />
                  <div className="microtext text-muted-foreground mt-1">
                    If provided, this percent override takes precedence over the jurisdiction selection.
                  </div>
                </div>

                <div>
                  <label className="microtext text-muted-foreground">Transaction Hash (from Split)</label>
                  {txLoading ? (
                    <div className="mt-1 text-sm text-muted-foreground">Loading transactions...</div>
                  ) : (
                    <>
                      <select
                        className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background font-mono text-xs"
                        value={editTransactionHash}
                        onChange={(e) => setEditTransactionHash(e.target.value)}
                      >
                        <option value="">No transaction assigned</option>
                        {(() => {
                          try {
                            // Smart recommendation: score transactions based on amount and time
                            const orderTotal = Number(selected?.totalUsd || 0);
                            const orderTime = Number(selected?.createdAt || 0);

                            const scored = (splitTransactions || []).map((tx: any) => {
                              const txValue = Number(tx.value || 0);
                              const txTime = Number(tx.timestamp || 0);

                              // Score factors:
                              // 1. Amount match (0-100 points)
                              const amountDiff = Math.abs(txValue - orderTotal);
                              const amountScore = amountDiff < 0.01 ? 100 : Math.max(0, 100 - (amountDiff / orderTotal) * 100);

                              // 2. Time proximity (0-100 points) - within 1 hour is best
                              const timeDiff = Math.abs(txTime - orderTime);
                              const hourInMs = 3600000;
                              const timeScore = timeDiff < hourInMs ? 100 - (timeDiff / hourInMs) * 50 : Math.max(0, 50 - (timeDiff / hourInMs) * 10);

                              // 3. Combined score (weighted: 70% amount, 30% time)
                              const score = (amountScore * 0.7) + (timeScore * 0.3);

                              return {
                                ...tx,
                                score,
                                amountMatch: amountScore,
                                timeMatch: timeScore,
                              };
                            });

                            // Sort by score (highest first)
                            scored.sort((a, b) => (b.score || 0) - (a.score || 0));

                            return scored.map((tx: any, idx: number) => {
                              const isRecommended = idx === 0 && (tx.score || 0) > 50;
                              const label = `${String(tx.hash || "").slice(0, 10)}...${String(tx.hash || "").slice(-8)} • $${Number(tx.value || 0).toFixed(4)} ETH • ${new Date(Number(tx.timestamp || 0)).toLocaleString()}${isRecommended ? " ⭐ RECOMMENDED" : ""}`;
                              return (
                                <option key={tx.hash} value={tx.hash}>
                                  {label}
                                </option>
                              );
                            });
                          } catch {
                            return null;
                          }
                        })()}
                      </select>
                      {editTransactionHash && (
                        <div className="mt-1 flex items-center gap-2">
                          <a
                            href={`https://base.blockscout.com/tx/${editTransactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline inline-flex items-center gap-1"
                          >
                            View on Blockscout <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            className="text-xs underline"
                            onClick={() => {
                              try {
                                navigator.clipboard.writeText(editTransactionHash);
                              } catch { }
                            }}
                          >
                            Copy Hash
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  <div className="microtext text-muted-foreground mt-1">
                    {splitTransactions.length > 0
                      ? `Found ${splitTransactions.length} transaction(s) in your split. Top matches shown first based on amount and time. Assigning a valid transaction will mark this order as "Paid".`
                      : splitAddress
                        ? "No transactions found in split contract."
                        : "Split address not configured."}
                  </div>
                </div>
              </div>
              {editError && <div className="microtext text-red-500 mt-2">{editError}</div>}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={closeEdit} className="px-3 py-1.5 rounded-md border text-sm">Cancel</button>
                <button onClick={saveEdit} disabled={editLoading} className="px-3 py-1.5 rounded-md border text-sm">
                  {editLoading ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      {refundOpen && selected && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4">
            <div className="w-full max-w-lg rounded-md border bg-background p-4 relative">
              <button
                onClick={closeRefund}
                className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                title="Close"
                aria-label="Close refund modal"
              >
                ✕
              </button>
              <div className="text-lg font-semibold mb-2">Refund — {selected.receiptId}</div>
              <div className="space-y-2">
                {Array.isArray(selected?.lineItems)
                  ? selected!.lineItems
                    .filter((it: any) => !/processing fee/i.test(String(it?.label || "")) && !/tax/i.test(String(it?.label || "")))
                    .map((it: any, idx: number) => {
                      const checked = !!refundDraft.selected[idx];
                      return (
                        <label key={idx} className="flex items-center justify-between rounded-md border p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setRefundDraft((prev) => {
                                  const nextSel = { ...prev.selected };
                                  nextSel[idx] = on;
                                  const baseItems = Array.isArray(selected?.lineItems)
                                    ? selected!.lineItems.filter((x: any) => !/processing fee/i.test(String(x?.label || "")) && !/tax/i.test(String(x?.label || "")))
                                    : [];
                                  const refundUsd = baseItems
                                    .map((x: any, i: number) => ({ ...x, i }))
                                    .filter((x: any) => nextSel[x.i])
                                    .reduce((s: number, x: any) => s + Number(x.priceUsd || 0), 0);
                                  return { ...prev, selected: nextSel, refundUsd };
                                });
                              }}
                            />
                            <Thumbnail src={(it as any)?.thumb} alt="" size={32} />
                            <span className="truncate">{it.label}</span>
                          </div>
                          <span>${Number(it.priceUsd || 0).toFixed(2)}</span>
                        </label>
                      );
                    })
                  : null}
              </div>
              <div className="mt-3">
                <label className="microtext text-muted-foreground">Buyer Wallet (0x…)</label>
                <input
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  placeholder="0x…"
                  value={refundDraft.buyerWallet}
                  onChange={(e) => setRefundDraft((prev) => ({ ...prev, buyerWallet: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="microtext text-muted-foreground">Refund Amount (USD)</span>
                <span className="text-sm font-semibold">${Number(refundDraft.refundUsd || 0).toFixed(2)}</span>
              </div>
              {refundError && <div className="microtext text-red-500 mt-2">{refundError}</div>}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={closeRefund} className="px-3 py-1.5 rounded-md border text-sm">Cancel</button>
                <button onClick={initiateRefund} disabled={refundLoading} className="px-3 py-1.5 rounded-md border text-sm">
                  {refundLoading ? "Refunding…" : "Initiate Refund"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}

      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={modalTitle}
        description={modalDesc}
        microtexts={modalMicrotexts}
        actions={[
          { label: "Close", onClick: () => setInfoOpen(false), variant: "primary" },
        ]}
      />
    </div>
  );
}

/** ---------------- Branding Panel (Partner Admin) ---------------- */
function BrandingPanel() {
  const account = useActiveAccount();
  const brand = useBrand();
  const [appUrl, setAppUrl] = useState<string>("");
  const [partnerFeeBps, setPartnerFeeBps] = useState<number>(0);
  const [defaultMerchantFeeBps, setDefaultMerchantFeeBps] = useState<number>(0);
  const [partnerWallet, setPartnerWallet] = useState<string>("");
  // Theme controls
  const [brandDisplayName, setBrandDisplayName] = useState<string>("");
  const [primaryColor, setPrimaryColor] = useState<string>("#0ea5e9");
  const [accentColor, setAccentColor] = useState<string>("#22c55e");
  const [logoAppUrl, setLogoAppUrl] = useState<string>("");
  const [logoFaviconUrl, setLogoFaviconUrl] = useState<string>("");
  const [ogTitle, setOgTitle] = useState<string>("");
  const [ogDescription, setOgDescription] = useState<string>("");
  // Container status (read-only snapshot for Partners panel awareness)
  const [containerAppName, setContainerAppName] = useState<string>("");
  const [containerFqdn, setContainerFqdn] = useState<string>("");
  const [containerState, setContainerState] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      setInfo("");
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(brand.key)}/config`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const eff = j?.brand || {};
      const overrides = j?.overrides || {};
      setAppUrl(String(eff?.appUrl || ""));
      const pf = Number(eff?.partnerFeeBps || 0);
      const dm = Number(eff?.defaultMerchantFeeBps || 0);
      setPartnerFeeBps(Number.isFinite(pf) ? pf : 0);
      setDefaultMerchantFeeBps(Number.isFinite(dm) ? dm : 0);
      setPartnerWallet(String((eff as any)?.partnerWallet || ""));
      // Theme fields
      setBrandDisplayName(String(eff?.name || ""));
      try {
        const pc = String(eff?.colors?.primary || "").trim();
        const ac = String(eff?.colors?.accent || "").trim();
        setPrimaryColor(pc || "#0ea5e9");
        setAccentColor(ac || "#22c55e");
      } catch {
        setPrimaryColor("#0ea5e9");
        setAccentColor("#22c55e");
      }
      setLogoAppUrl(String(eff?.logos?.app || ""));
      setLogoFaviconUrl(String(eff?.logos?.favicon || ""));
      setOgTitle(String(eff?.meta?.ogTitle || ""));
      setOgDescription(String(eff?.meta?.ogDescription || ""));
      // Container status snapshot
      setContainerAppName(String(overrides?.containerAppName || ""));
      setContainerFqdn(String(overrides?.containerFqdn || ""));
      setContainerState(String(overrides?.containerState || ""));
    } catch (e: any) {
      setError(e?.message || "Failed to load brand");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [brand.key]);

  async function save() {
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const body: any = {};
      if (appUrl) body.appUrl = appUrl;
      body.partnerFeeBps = Math.max(0, Math.min(10000, Math.floor(Number(partnerFeeBps || 0))));
      body.defaultMerchantFeeBps = Math.max(0, Math.min(10000, Math.floor(Number(defaultMerchantFeeBps || 0))));
      if (partnerWallet) body.partnerWallet = partnerWallet;
      // Theme fields
      if (brandDisplayName.trim()) body.name = brandDisplayName.trim();
      body.colors = { primary: primaryColor || "#0ea5e9", accent: accentColor || undefined };
      body.logos = {
        ...(logoAppUrl ? { app: logoAppUrl } : {}),
        ...(logoFaviconUrl ? { favicon: logoFaviconUrl } : {}),
      };
      body.meta = {
        ...(ogTitle ? { ogTitle } : {}),
        ...(ogDescription ? { ogDescription } : {}),
      };
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(brand.key)}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        setError(j?.error || "Failed to save brand");
        return;
      }
      setInfo("Brand updated");
      // Refresh effective snapshot
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to save brand");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass-pane rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Branding</h2>
        <span className="microtext text-muted-foreground">Brand Key: {brand.key}</span>
      </div>
      {loading ? (
        <div className="microtext text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="microtext text-muted-foreground">App URL</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                placeholder="https://partner.example.com"
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
              />
              <div className="microtext text-muted-foreground mt-1">
                Custom domain base URL used in metadata, docs, and CTAs.
              </div>
            </div>
            <div>
              <label className="microtext text-muted-foreground">Partner Fee (bps)</label>
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                value={partnerFeeBps}
                onChange={(e) => setPartnerFeeBps(Math.max(0, Math.min(10000, Math.floor(Number(e.target.value || 0)))))}
              />
              <div className="microtext text-muted-foreground mt-1">
                Partner share in basis points (e.g., 25 = 0.25%). Platform default remains 80 bps.
              </div>
            </div>
            <div>
              <label className="microtext text-muted-foreground">Default Merchant Fee (bps)</label>
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                value={defaultMerchantFeeBps}
                onChange={(e) => setDefaultMerchantFeeBps(Math.max(0, Math.min(10000, Math.floor(Number(e.target.value || 0)))))}
              />
              <div className="microtext text-muted-foreground mt-1">
                Default add‑on charged by merchants when not explicitly configured.
              </div>
            </div>
            <div>
              <label className="microtext text-muted-foreground">Partner Wallet (optional)</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background font-mono"
                placeholder="0x…"
                value={partnerWallet}
                onChange={(e) => setPartnerWallet(e.target.value)}
              />
              <div className="microtext text-muted-foreground mt-1">
                Wallet to receive the partner share in split payouts (if applicable).
              </div>
            </div>

            {/* Theme Controls */}
            <div>
              <label className="microtext text-muted-foreground">Brand Name</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                placeholder="e.g., Acme Pay"
                value={brandDisplayName}
                onChange={(e) => setBrandDisplayName(e.target.value)}
              />
              <div className="microtext text-muted-foreground mt-1">
                Display name shown across receipts, portal, and admin surfaces.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="microtext text-muted-foreground">Primary Color</label>
                <input
                  type="color"
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
              </div>
              <div>
                <label className="microtext text-muted-foreground">Accent Color</label>
                <input
                  type="color"
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="microtext text-muted-foreground">App Logo URL</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                placeholder="/brands/acme/logo.png"
                value={logoAppUrl}
                onChange={(e) => setLogoAppUrl(e.target.value)}
              />
              <div className="microtext text-muted-foreground mt-1">
                Used in OG/Twitter/nav defaults and receipts headers.
              </div>
            </div>
            <div>
              <label className="microtext text-muted-foreground">Favicon URL</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                placeholder="/brands/acme/favicon.png"
                value={logoFaviconUrl}
                onChange={(e) => setLogoFaviconUrl(e.target.value)}
              />
              <div className="microtext text-muted-foreground mt-1">
                Used in manifest and icons.
              </div>
            </div>
            <div>
              <label className="microtext text-muted-foreground">OG Title</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                placeholder="Acme Pay"
                value={ogTitle}
                onChange={(e) => setOgTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="microtext text-muted-foreground">OG Description</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                placeholder="High‑risk payments & portals"
                value={ogDescription}
                onChange={(e) => setOgDescription(e.target.value)}
              />
            </div>

            {/* Container status snapshot */}
            <div className="md:col-span-2 rounded-md border p-3">
              <div className="text-sm font-medium">Container Deployment</div>
              <div className="microtext text-muted-foreground mt-1">
                Name: {containerAppName || "—"} • FQDN: {containerFqdn || "—"} • State: {containerState || "—"}
              </div>
              <div className="microtext text-muted-foreground mt-1">
                Use Partners panel to generate a provision plan or manage lifecycle actions (pause/restart/update).
              </div>
            </div>
          </div>
          {error && <div className="microtext text-red-500">{error}</div>}
          {info && <div className="microtext text-green-600">{info}</div>}
          <div className="flex items-center justify-end">
            <button className="px-3 py-1.5 rounded-md border text-sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Branding"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** ---------------- Partner Management (Superadmin) ---------------- */
function PartnerManagementPanel() {
  const account = useActiveAccount();
  const brand = useBrand();
  const [brandKey, setBrandKey] = useState<string>(brand.key);
  const [brandsList, setBrandsList] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [users, setUsers] = useState<Array<{ merchant: string; splitAddress?: string }>>([]);
  const [releaseInfo, setReleaseInfo] = useState<Record<string, string>>({});

  async function load() {
    try {
      setLoading(true);
      setError("");
      setInfo("");
      // Load brand config snapshot
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(brandKey)}/config`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setConfig(j?.brand || {});
      // Load brand-scoped merchants
      const ru = await fetch(`/api/admin/users?brandKey=${encodeURIComponent(brandKey)}`, { cache: "no-store", headers: { "x-wallet": account?.address || "" } });
      const ju = await ru.json().catch(() => ({}));
      const items = Array.isArray(ju?.items) ? ju.items : [];
      setUsers(items.map((it: any) => ({ merchant: String(it.merchant || ""), splitAddress: it.splitAddress })));
    } catch (e: any) {
      setError(e?.message || "Failed to load partner data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [brandKey]);

  // Fetch dynamic brand list from Cosmos
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/platform/brands", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const arr = Array.isArray(j?.brands) ? j.brands : [];
        setBrandsList(arr.map((k: any) => String(k || "").toLowerCase()).filter(Boolean));
      } catch { }
    })();
  }, []);

  async function saveConfig() {
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const body: any = {};
      if (config?.appUrl) body.appUrl = String(config.appUrl);
      if (typeof config?.partnerFeeBps === "number") body.partnerFeeBps = Math.max(0, Math.min(10000, Math.floor(Number(config.partnerFeeBps))));
      if (typeof config?.defaultMerchantFeeBps === "number") body.defaultMerchantFeeBps = Math.max(0, Math.min(10000, Math.floor(Number(config.defaultMerchantFeeBps))));
      if (config?.partnerWallet) body.partnerWallet = String(config.partnerWallet);
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(brandKey)}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        setError(j?.error || "Failed to save partner config");
        return;
      }
      setInfo("Partner config updated");
      await load();
    } catch (e: any) {
      setError(e?.message || "Failed to save partner config");
    } finally {
      setSaving(false);
    }
  }

  async function releasePlatformShareFor(merchantWallet: string) {
    try {
      setReleaseInfo((prev) => ({ ...prev, [merchantWallet]: "Working…" }));
      // Get split address
      const balRes = await fetch(`/api/reserve/balances?wallet=${encodeURIComponent(merchantWallet)}`, { cache: "no-store" });
      const bal = await balRes.json().catch(() => ({}));
      const split = String(bal?.splitAddressUsed || "").toLowerCase();
      const platformRecipient = String(process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "").toLowerCase();
      const isHex = (s: string) => /^0x[a-f0-9]{40}$/i.test(String(s || "").trim());
      if (!isHex(split) || !isHex(platformRecipient)) {
        setReleaseInfo((prev) => ({ ...prev, [merchantWallet]: "Split or recipient not configured" }));
        return;
      }
      // Token addresses from env
      const envTokens: Record<string, { address?: `0x${string}` }> = {
        ETH: { address: undefined },
        USDC: { address: (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").toLowerCase() as any },
        USDT: { address: (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").toLowerCase() as any },
        cbBTC: { address: (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").toLowerCase() as any },
        cbXRP: { address: (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").toLowerCase() as any },
      };
      // PaymentSplitter ABI
      const PAYMENT_SPLITTER_ABI = [
        { type: "function", name: "release", inputs: [{ name: "account", type: "address" }], outputs: [], stateMutability: "nonpayable" },
        { type: "function", name: "release", inputs: [{ name: "token", type: "address" }, { name: "account", type: "address" }], outputs: [], stateMutability: "nonpayable" },
      ] as const;
      const contract = getContract({ client, chain, address: split as `0x${string}`, abi: PAYMENT_SPLITTER_ABI as any });
      const preferred = ["ETH", "USDC", "USDT", "cbBTC", "cbXRP"];
      let successes = 0;
      let skipped = 0;
      for (const symbol of preferred) {
        try {
          let tx: any;
          if (symbol === "ETH") {
            tx = (prepareContractCall as any)({ contract: contract as any, method: "function release(address account)", params: [platformRecipient as `0x${string}`] });
          } else {
            const t = envTokens[symbol];
            const tokenAddr = t?.address as `0x${string}` | undefined;
            if (!tokenAddr || !isHex(String(tokenAddr))) {
              skipped++;
              continue;
            }
            tx = (prepareContractCall as any)({ contract: contract as any, method: "function release(address token, address account)", params: [tokenAddr, platformRecipient as `0x${string}`] });
          }
          await sendTransaction({ account: account as any, transaction: tx });
          successes++;
        } catch (err: any) {
          const raw = String(err?.message || err || "").toLowerCase();
          if (raw.includes("not due payment")) {
            skipped++;
          }
        }
      }
      const msg = successes > 0 ? `Submitted ${successes} tx${successes > 1 ? "s" : ""}${skipped ? `, ${skipped} skipped` : ""}` : skipped ? "Nothing releasable" : "No action";
      setReleaseInfo((prev) => ({ ...prev, [merchantWallet]: msg }));
    } catch (e: any) {
      setReleaseInfo((prev) => ({ ...prev, [merchantWallet]: e?.message || "Release failed" }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-pane rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Partner Management</h2>
          <div className="flex items-center gap-2">
            <select
              className="h-9 px-3 py-1 border rounded-md bg-background"
              value={brandKey}
              onChange={(e) => setBrandKey(e.target.value)}
              title="Select partner brand"
            >
              {brandsList.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className="h-9 px-3 py-1 border rounded-md bg-background font-mono"
              placeholder="or enter brand key…"
              value={brandKey}
              onChange={(e) => setBrandKey(e.target.value.toLowerCase())}
              title="Freeform brand key"
            />
            <button className="px-3 py-1.5 rounded-md border text-sm" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              className="px-3 py-1.5 rounded-md border text-sm"
              onClick={async () => {
                try {
                  const r = await fetch("/api/platform/brands", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                    body: JSON.stringify({ brandKey }),
                  });
                  const j = await r.json().catch(() => ({}));
                  if (!r.ok || j?.error) throw new Error(j?.error || "Failed to add brand");
                  setBrandsList((prev) => Array.from(new Set([...prev, brandKey])));
                } catch (e: any) {
                  setError(e?.message || "Failed to add brand");
                }
              }}
              title="Add brand"
            >
              Add
            </button>
            <button
              className="px-3 py-1.5 rounded-md border text-sm"
              onClick={async () => {
                try {
                  const r = await fetch("/api/platform/brands", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                    body: JSON.stringify({ brandKey }),
                  });
                  const j = await r.json().catch(() => ({}));
                  if (!r.ok || j?.error) throw new Error(j?.error || "Failed to remove brand");
                  setBrandsList((prev) => prev.filter((k) => k !== brandKey));
                } catch (e: any) {
                  setError(e?.message || "Failed to remove brand");
                }
              }}
              title="Remove brand"
            >
              Remove
            </button>
          </div>
        </div>
        <div className="microtext text-muted-foreground">Manage partner fees and brand settings; view merchants and release Platform Fee.</div>
      </div>

      <div className="glass-pane rounded-xl border p-5 space-y-3">
        <div className="text-sm font-medium">Brand Settings — {brandKey}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="microtext text-muted-foreground">App URL</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={String(config?.appUrl || "")}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, appUrl: e.target.value }))}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Partner Fee (bps)</label>
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={Number(config?.partnerFeeBps || 0)}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, partnerFeeBps: Math.max(0, Math.min(10000, Math.floor(Number(e.target.value || 0)))) }))}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Default Merchant Fee (bps)</label>
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={Number(config?.defaultMerchantFeeBps || 0)}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, defaultMerchantFeeBps: Math.max(0, Math.min(10000, Math.floor(Number(e.target.value || 0)))) }))}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Partner Wallet</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background font-mono"
              value={String(config?.partnerWallet || "")}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, partnerWallet: e.target.value }))}
            />
          </div>

          {/* Theme preview/edit (lightweight in Partners panel) */}
          <div>
            <label className="microtext text-muted-foreground">Brand Name</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={String(config?.name || "")}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="microtext text-muted-foreground">Primary</label>
              <input
                type="color"
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                value={String(config?.colors?.primary || "#0ea5e9")}
                onChange={(e) => setConfig((prev: any) => ({ ...prev, colors: { ...(prev?.colors || {}), primary: e.target.value } }))}
              />
            </div>
            <div>
              <label className="microtext text-muted-foreground">Accent</label>
              <input
                type="color"
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                value={String(config?.colors?.accent || "#22c55e")}
                onChange={(e) => setConfig((prev: any) => ({ ...prev, colors: { ...(prev?.colors || {}), accent: e.target.value } }))}
              />
            </div>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Logo URL</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={String(config?.logos?.app || "")}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, logos: { ...(prev?.logos || {}), app: e.target.value } }))}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Favicon URL</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={String(config?.logos?.favicon || "")}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, logos: { ...(prev?.logos || {}), favicon: e.target.value } }))}
            />
          </div>

          {/* Container status + actions */}
          <div className="md:col-span-2 rounded-md border p-3">
            <div className="text-sm font-medium">Container Deployment</div>
            <div className="microtext text-muted-foreground mt-1">
              Name: {String(config?.containerAppName || "—")} • FQDN: {String(config?.containerFqdn || "—")} • State: {String(config?.containerState || "—")}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                className="px-3 py-1.5 rounded-md border text-sm"
                onClick={async () => {
                  try {
                    const r = await fetch(`/api/platform/brands/${encodeURIComponent(brandKey)}/provision`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                      body: JSON.stringify({ target: "containerapps", image: process.env.NEXT_PUBLIC_CONTAINER_IMAGE || "myregistry.azurecr.io/portalpay:latest", name: `pp-${brandKey}` }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error || "Failed to get plan");
                    const plan = j?.plan || {};
                    setInfo(`Plan ready for ${String(plan?.name || `pp-${brandKey}`)} — see steps in console`);
                    console.log("[Provision Plan]", plan);
                  } catch (e: any) {
                    setError(e?.message || "Failed to generate plan");
                  }
                }}
                title="Generate azd provisioning plan"
              >
                Get Provision Plan
              </button>
              <button
                className="px-3 py-1.5 rounded-md border text-sm"
                onClick={async () => {
                  try {
                    const r = await fetch(`/api/platform/brands/${encodeURIComponent(brandKey)}/config`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                      body: JSON.stringify({ containerState: "paused" }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error || "Failed to update state");
                    setInfo("Requested pause");
                    await load();
                  } catch (e: any) {
                    setError(e?.message || "Failed to pause");
                  }
                }}
                title="Pause container (request)"
              >
                Pause
              </button>
              <button
                className="px-3 py-1.5 rounded-md border text-sm"
                onClick={async () => {
                  try {
                    const r = await fetch(`/api/platform/brands/${encodeURIComponent(brandKey)}/config`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                      body: JSON.stringify({ containerState: "running" }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error || "Failed to update state");
                    setInfo("Requested restart");
                    await load();
                  } catch (e: any) {
                    setError(e?.message || "Failed to restart");
                  }
                }}
                title="Restart container (request)"
              >
                Restart
              </button>
              <button
                className="px-3 py-1.5 rounded-md border text-sm"
                onClick={async () => {
                  try {
                    const r = await fetch(`/api/platform/brands/${encodeURIComponent(brandKey)}/config`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                      body: JSON.stringify({ containerState: "update_requested" }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error || "Failed to update state");
                    setInfo("Requested update");
                    await load();
                  } catch (e: any) {
                    setError(e?.message || "Failed to request update");
                  }
                }}
                title="Update container (request)"
              >
                Update
              </button>
            </div>
            <div className="microtext text-muted-foreground mt-1">
              Lifecycle requests update the brand config; execution uses the shared Container Apps image and script pipeline.
            </div>
          </div>
        </div>
        {error && <div className="microtext text-red-500">{error}</div>}
        {info && <div className="microtext text-green-600">{info}</div>}
        <div className="flex items-center justify-end">
          <button className="px-3 py-1.5 rounded-md border text-sm" onClick={saveConfig} disabled={saving}>
            {saving ? "Saving…" : "Save Partner Brand"}
          </button>
        </div>
      </div>

      <div className="glass-pane rounded-xl border p-5 space-y-3">
        <div className="text-sm font-medium">Merchants under {brandKey}</div>
        <div className="overflow-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-foreground/5">
                <th className="text-left px-3 py-2 font-medium">Merchant Wallet</th>
                <th className="text-left px-3 py-2 font-medium">Split</th>
                <th className="text-left px-3 py-2 font-medium">Actions</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.merchant} className="border-t">
                  <td className="px-3 py-2 font-mono">{u.merchant}</td>
                  <td className="px-3 py-2 font-mono">{u.splitAddress || "—"}</td>
                  <td className="px-3 py-2">
                    <button className="px-2 py-1 rounded-md border text-xs" onClick={() => releasePlatformShareFor(u.merchant)}>
                      Release Platform Share
                    </button>
                  </td>
                  <td className="px-3 py-2 microtext text-muted-foreground">
                    {releaseInfo[u.merchant] || ""}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No merchants found for this brand.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** ---------------- Superadmin Users Panel ---------------- */
function UsersPanel() {
  const account = useActiveAccount();
  const brand = useBrand();
  const containerTypeEnv = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || process.env.CONTAINER_TYPE || "platform").toLowerCase();
  const [items, setItems] = useState<Array<{
    merchant: string;
    displayName?: string;
    tags?: string[];
    totalEarnedUsd: number;
    customers: number;
    totalCustomerXp: number;
    platformFeeUsd: number;
    shopSlug?: string;
    kioskEnabled?: boolean;
    terminalEnabled?: boolean;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [indexing, setIndexing] = useState(false);

  // Client-side search/filter/sort/pagination for Users list
  const [q, setQ] = useState("");
  const [tagFilter, setTagFilter] = useState<"any" | "merchant" | "buyer" | "connected">("any");
  const [sortField, setSortField] = useState<"earned" | "customers" | "xp" | "fee" | "display" | "wallet">("earned");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState<number>(50);
  const [page, setPage] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [shopSlugs, setShopSlugs] = useState<Map<string, string | undefined>>(new Map<string, string | undefined>());
  // Superadmin: per-merchant reserve accordion state/cache
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [balancesCache, setBalancesCache] = useState<Map<string, ReserveBalancesResponse | null>>(new Map());
  const [resLoading, setResLoading] = useState<Record<string, boolean>>({});
  const [resError, setResError] = useState<Record<string, string>>({});
  // Transaction tracking state
  const [transactionsCache, setTransactionsCache] = useState<Map<string, any[]>>(new Map());
  const [cumulativeCache, setCumulativeCache] = useState<Map<string, { payments: Record<string, number>; merchantReleases: Record<string, number>; platformReleases: Record<string, number> }>>(new Map());
  const [txLoading, setTxLoading] = useState<Record<string, boolean>>({});
  const [txError, setTxError] = useState<Record<string, string>>({});
  const [releaseLoading, setReleaseLoading] = useState<Record<string, boolean>>({});
  const [releaseError, setReleaseError] = useState<Record<string, string>>({});
  const [releaseResults, setReleaseResults] = useState<Map<string, any[]>>(new Map());
  const [brandKeyFilter, setBrandKeyFilter] = useState<string>("__none__");
  const [brandsList, setBrandsList] = useState<string[]>([]);
  // Friendly formatter for platform release messages
  function formatPlatformMessage(rr: { symbol?: string; status?: string; transactionHash?: string; reason?: string }): string {
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
  function statusClassPlatform(rr: { status?: string }): string {
    const st = String(rr?.status || "");
    return st === "failed" ? "text-red-500" : st === "skipped" ? "text-amber-600" : "text-muted-foreground";
  }
  // Batch release modal (platform)
  const [releaseModal, setReleaseModal] = useState<{
    open: boolean;
    wallet?: string;
    queue: string[];
    processed: number;
    statuses: Record<string, { status: string; tx?: string; reason?: string }>;
  }>({ open: false, queue: [], processed: 0, statuses: {} });

  // Cache of releasable amounts per merchant per token
  const [releasableCache, setReleasableCache] = useState<Map<string, Record<string, { units: number }>>>(new Map());

  async function fetchReleasable(wallet: string) {
    try {
      const w = String(wallet || "").toLowerCase();
      const b = balancesCache.get(w) || null;
      if (!b || !b.splitAddressUsed) return;

      const split = String(b.splitAddressUsed || "").toLowerCase();
      const isHex = (s: string) => /^0x[a-f0-9]{40}$/i.test(String(s || "").trim());
      const platformRecipient = String(process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "").toLowerCase();
      if (!isHex(split) || !isHex(platformRecipient)) return;

      const envTokens: Record<string, { address?: `0x${string}`; decimals?: number }> = {
        ETH: { address: undefined, decimals: 18 },
        USDC: {
          address: (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6),
        },
        USDT: {
          address: (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6),
        },
        cbBTC: {
          address: (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8),
        },
        cbXRP: {
          address: (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6),
        },
      };

      const PAYMENT_SPLITTER_READ_ABI = [
        {
          type: "function",
          name: "releasable",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "releasable",
          inputs: [
            { name: "token", type: "address" },
            { name: "account", type: "address" },
          ],
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
        },
      ] as const;

      const contract = getContract({
        client,
        chain,
        address: split as `0x${string}`,
        abi: PAYMENT_SPLITTER_READ_ABI as any,
      });

      const symbols = Object.keys((b.balances || {}) as Record<string, any>);
      const nextRecord: Record<string, { units: number }> = {};

      for (const symbol of symbols) {
        try {
          let raw: bigint = BigInt(0);
          if (symbol === "ETH") {
            raw = await readContract({
              contract: contract as any,
              method: "function releasable(address account) view returns (uint256)",
              params: [platformRecipient as `0x${string}`],
            });
          } else {
            const t = envTokens[symbol];
            const tokenAddr = t?.address as `0x${string}` | undefined;
            if (!tokenAddr || !isHex(String(tokenAddr))) continue;
            raw = await readContract({
              contract: contract as any,
              method: "function releasable(address token, address account) view returns (uint256)",
              params: [tokenAddr, platformRecipient as `0x${string}`],
            });
          }
          const decimals = Number(envTokens[symbol]?.decimals || 18);
          const denom = 10 ** Math.max(0, decimals);
          const units = Number(raw) / denom;
          nextRecord[symbol] = { units: Number.isFinite(units) ? units : 0 };
        } catch {
          // skip on read failure
        }
      }

      setReleasableCache((prev) => {
        const next = new Map(prev);
        next.set(w, nextRecord);
        return next;
      });
    } catch {
      // no-op
    }
  }

  // Helper to fetch users data (without reindexing)
  async function fetchUsersData() {
    try {
      let itemsArr: any[] = [];
      let usedUnassignedApi = false;

      if (brandKeyFilter && brandKeyFilter !== "__none__") {
        // Explicit brand scope
        const r = await fetch(`/api/admin/users?brandKey=${encodeURIComponent(brandKeyFilter)}`, {
          headers: { "x-wallet": account?.address || "" },
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) throw new Error(j?.error || "Forbidden");
        itemsArr = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
      } else {
        // Platform view: try server-side unassigned first (if supported); fallback to client-side exclusion
        const rNone = await fetch(`/api/admin/users?brandKey=${encodeURIComponent("__none__")}`, {
          headers: { "x-wallet": account?.address || "" },
          cache: "no-store",
        });
        const jNone = await rNone.json().catch(() => ({}));
        if (rNone.ok && Array.isArray(jNone?.items) && jNone.items.length > 0) {
          itemsArr = jNone.items;
          usedUnassignedApi = true;
        }

        if (!usedUnassignedApi) {
          // Fallback: load all, then exclude merchants that belong to any partner brand
          const rAll = await fetch(`/api/admin/users`, {
            headers: { "x-wallet": account?.address || "" },
            cache: "no-store",
          });
          const jAll = await rAll.json().catch(() => ({}));
          if (!rAll.ok || jAll?.error) throw new Error(jAll?.error || "Forbidden");
          const allArr: any[] = Array.isArray(jAll?.items)
            ? jAll.items
            : Array.isArray(jAll) ? jAll : [];

          // Build a set of partner-assigned merchant wallets
          let partnerWallets = new Set<string>();
          try {
            const rb = await fetch(`/api/platform/brands`, { cache: "no-store" });
            const jb = await rb.json().catch(() => ({}));
            const brandKeys: string[] = Array.isArray(jb?.brands) ? jb.brands.map((b: any) => String(b || "").toLowerCase()).filter(Boolean) : [];
            if (brandKeys.length) {
              const perBrandLists = await Promise.all(
                brandKeys.map(async (bk) => {
                  try {
                    const r = await fetch(`/api/admin/users?brandKey=${encodeURIComponent(bk)}`, {
                      headers: { "x-wallet": account?.address || "" },
                      cache: "no-store",
                    });
                    const j = await r.json().catch(() => ({}));
                    const arr = Array.isArray(j?.items) ? j.items : [];
                    return arr.map((it: any) => String(it?.merchant || "").toLowerCase());
                  } catch {
                    return [] as string[];
                  }
                })
              );
              partnerWallets = new Set(perBrandLists.flat());
            }
          } catch { }


          // itemsArr = allArr.filter((it: any) => !partnerWallets.has(String(it?.merchant || "").toLowerCase()));
          // SHOW ALL for now to ensure admin wallets are visible even if they are linked to a partner
          itemsArr = allArr;
        }
      }

      setItems(itemsArr);
      setTotal(itemsArr.length);

      // Prefetch shop slugs for quick "View Shop" links
      try {
        const wallets: string[] = itemsArr.map((it: any) => String(it.merchant || "").toLowerCase());
        const unique: string[] = Array.from(new Set<string>(wallets));
        const entries: Array<[string, string | undefined]> = await Promise.all(
          unique.map(async (w: string) => {
            try {
              const r2 = await fetch(`/api/shop/config?wallet=${encodeURIComponent(w)}`, { cache: "no-store" });
              const j2 = await r2.json().catch(() => ({}));
              const slug = typeof j2?.config?.slug === "string" && j2.config.slug ? j2.config.slug : undefined;
              const reserved = new Set<string>(["partners"]);
              const safeSlug = slug && !reserved.has(String(slug).toLowerCase()) ? slug : undefined;
              return [w, safeSlug] as [string, string | undefined];
            } catch {
              return [w, undefined] as [string, undefined];
            }
          })
        );
        setShopSlugs(new Map(entries));
      } catch { }
    } catch (e: any) {
      setError(e?.message || "Forbidden");
      setItems([]);
    }
  }

  async function reindexAll() {
    try {
      setLoading(true);
      setError("");

      // STEP 1: Fetch cached data FIRST to show immediately
      console.log('[ADMIN UI] Fetching cached users data...');
      await fetchUsersData();
      setLoading(false);

      // STEP 2: Trigger background reindexing (non-blocking)
      setIndexing(true);
      console.log('[ADMIN UI] Triggering background reindex...');

      // Start reindex in background - don't await it before showing data
      (async () => {
        try {
          const reindexRes = await fetch("/api/split/reindex-all", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-wallet": account?.address || ""
            },
            cache: "no-store",
          });
          const reindexData = await reindexRes.json().catch(() => ({}));

          if (reindexRes.ok && reindexData.ok) {
            console.log(`[ADMIN UI] Reindex completed: ${reindexData.successCount} success, ${reindexData.errorCount} errors`);
          } else {
            console.warn('[ADMIN UI] Reindex had issues:', reindexData);
          }

          // STEP 3: Refresh data after indexing completes to show updated values
          console.log('[ADMIN UI] Refreshing data after reindex...');
          await fetchUsersData();
        } catch (e: any) {
          console.error('[ADMIN UI] Background reindex failed:', e?.message);
        } finally {
          setIndexing(false);
        }
      })();

    } catch (e: any) {
      setError(e?.message || "Failed to load users");
      setLoading(false);
      setIndexing(false);
    }
  }

  useEffect(() => { fetchUsersData(); }, [account?.address]);

  // Load brand list for filter
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/platform/brands", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const arr = Array.isArray(j?.brands) ? j.brands : [];
        setBrandsList(arr.map((k: any) => String(k || "").toLowerCase()).filter(Boolean));
      } catch { }
    })();
  }, []);

  // Brand filter is fixed by container; no auto reindex
  useEffect(() => {
    // no-op to avoid auto reindexing
  }, [brandKeyFilter]);

  async function toggleMerchantFeature(merchant: string, feature: 'kioskEnabled' | 'terminalEnabled', value: boolean) {
    // Optimistic update
    setItems(prev => prev.map(u => {
      if (u.merchant === merchant) {
        return {
          ...u,
          [feature]: value
        };
      }
      return u;
    }));

    try {
      const payload: any = {};
      payload[feature] = value;

      const r = await fetch(`/api/merchants/${merchant}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error("Failed to update");
    } catch (e) {
      // Revert on error
      console.error("Failed to update feature setting", e);
      // Revert optimistic update
      setItems(prev => prev.map(u => {
        if (u.merchant === merchant) {
          return {
            ...u,
            [feature]: !value
          };
        }
        return u;
      }));
    }
  }

  // Load reserve balances for a merchant (uses split if configured)
  async function fetchMerchantBalances(wallet: string) {
    try {
      const w = String(wallet || "").toLowerCase();
      setResLoading(prev => ({ ...prev, [w]: true }));
      setResError(prev => ({ ...prev, [w]: "" }));
      const r = await fetch(`/api/reserve/balances?wallet=${encodeURIComponent(w)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        setResError(prev => ({ ...prev, [w]: j?.error || "Failed to load balances" }));
        setBalancesCache(prev => {
          const next = new Map(prev);
          next.set(w, null);
          return next;
        });
      } else {
        setBalancesCache(prev => {
          const next = new Map(prev);
          next.set(w, j as ReserveBalancesResponse);
          return next;
        });
      }
    } catch (e: any) {
      const w = String(wallet || "").toLowerCase();
      setResError(prev => ({ ...prev, [w]: e?.message || "Failed to load balances" }));
      setBalancesCache(prev => {
        const next = new Map(prev);
        next.set(w, null);
        return next;
      });
    } finally {
      const w = String(wallet || "").toLowerCase();
      setResLoading(prev => ({ ...prev, [w]: false }));
    }
  }

  // Fetch split transactions for a merchant
  async function fetchMerchantTransactions(wallet: string) {
    try {
      const w = String(wallet || "").toLowerCase();
      const b = balancesCache.get(w);
      const splitAddress = b?.splitAddressUsed;

      if (!splitAddress || !/^0x[a-f0-9]{40}$/i.test(splitAddress)) {
        setTxError(prev => ({ ...prev, [w]: "No split address configured" }));
        return;
      }

      setTxLoading(prev => ({ ...prev, [w]: true }));
      setTxError(prev => ({ ...prev, [w]: "" }));

      const r = await fetch(`/api/split/transactions?splitAddress=${encodeURIComponent(splitAddress)}&merchantWallet=${encodeURIComponent(w)}&limit=1000`, {
        cache: "no-store"
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || j?.error) {
        setTxError(prev => ({ ...prev, [w]: j?.error || "Failed to load transactions" }));
        setTransactionsCache(prev => {
          const next = new Map(prev);
          next.set(w, []);
          return next;
        });
        setCumulativeCache(prev => {
          const next = new Map(prev);
          next.set(w, { payments: {}, merchantReleases: {}, platformReleases: {} });
          return next;
        });
      } else {
        const txs = Array.isArray(j?.transactions) ? j.transactions : [];
        const cumulative = j?.cumulative || { payments: {}, merchantReleases: {}, platformReleases: {} };
        setTransactionsCache(prev => {
          const next = new Map(prev);
          next.set(w, txs);
          return next;
        });
        setCumulativeCache(prev => {
          const next = new Map(prev);
          next.set(w, cumulative);
          return next;
        });
      }
    } catch (e: any) {
      const w = String(wallet || "").toLowerCase();
      setTxError(prev => ({ ...prev, [w]: e?.message || "Failed to load transactions" }));
      setTransactionsCache(prev => {
        const next = new Map(prev);
        next.set(w, []);
        return next;
      });
    } finally {
      const w = String(wallet || "").toLowerCase();
      setTxLoading(prev => ({ ...prev, [w]: false }));
    }
  }

  async function toggleAccordion(wallet: string) {
    const w = String(wallet || "").toLowerCase();
    const wasExpanded = !!expanded[w];
    setExpanded(prev => ({ ...prev, [w]: !prev[w] }));

    // Always refresh data when expanding (not when collapsing)
    if (!wasExpanded) {
      try {
        // Always fetch balances first
        await fetchMerchantBalances(w);

        // Then fetch releasable and transactions
        const balanceData = balancesCache.get(w);
        if (balanceData && balanceData.splitAddressUsed) {
          // Run these in parallel
          await Promise.all([
            fetchReleasable(w),
            fetchMerchantTransactions(w)
          ]);
        }
      } catch (e) {
        console.error('Error loading merchant data:', e);
      }
    }
  }

  async function releasePlatformShare(wallet: string, onlySymbol?: string) {
    const w = String(wallet || "").toLowerCase();
    try {
      if (!account?.address) {
        setReleaseError((prev) => ({ ...prev, [w]: "Connect your wallet" }));
        return;
      }

      // Ensure balances loaded to filter tokens with balances
      let b = balancesCache.get(w) || null;
      if (!b) {
        await fetchMerchantBalances(w);
        b = balancesCache.get(w) || null;
      }

      const split = String(b?.splitAddressUsed || "").toLowerCase();
      const isHex = (s: string) => /^0x[a-f0-9]{40}$/i.test(String(s || "").trim());
      if (!isHex(split)) {
        setReleaseError((prev) => ({ ...prev, [w]: "split_address_not_configured" }));
        return;
      }

      const preferred = ["ETH", "USDC", "USDT", "cbBTC", "cbXRP"];
      // Build queue based on platform releasable amounts (not split balances)
      const relMap = releasableCache.get(w) || {};
      const positiveRel = preferred.filter((sym) => {
        try {
          const u = Number(((relMap as any)[sym]?.units || 0));
          return u > 0;
        } catch {
          return false;
        }
      });

      let queue: string[] = positiveRel.length ? positiveRel : preferred;
      if (onlySymbol) queue = [onlySymbol];

      const containerTypeEnv = String(process.env.CONTAINER_TYPE || "platform").toLowerCase();
      // In partner containers, release the Partner's share; in platform containers, release the Platform's share
      const recipientWallet = String(
        containerTypeEnv === "partner"
          ? (process.env.NEXT_PUBLIC_PARTNER_WALLET || process.env.PARTNER_WALLET || "")
          : (process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "")
      ).toLowerCase();
      if (!isHex(recipientWallet)) {
        setReleaseError((prev) => ({ ...prev, [w]: "recipient_not_configured" }));
        return;
      }

      // Resolve token addresses from env
      const envTokens: Record<string, { address?: `0x${string}`; decimals?: number }> = {
        ETH: { address: undefined, decimals: 18 },
        USDC: {
          address: (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6),
        },
        USDT: {
          address: (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6),
        },
        cbBTC: {
          address: (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8),
        },
        cbXRP: {
          address: (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").toLowerCase() as any,
          decimals: Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6),
        },
      };

      // Minimal ABI for PaymentSplitter
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

      setReleaseLoading((prev) => ({ ...prev, [w]: true }));
      setReleaseError((prev) => ({ ...prev, [w]: "" }));

      if (!onlySymbol) {
        setReleaseResults((prev) => {
          const next = new Map(prev);
          next.set(w, []);
          return next;
        });
        setReleaseModal({ open: true, wallet: w, queue, processed: 0, statuses: {} });
      }

      // Contract handle
      const contract = getContract({
        client,
        chain,
        address: split as `0x${string}`,
        abi: PAYMENT_SPLITTER_ABI as any,
      });

      // Execute releases with the connected wallet
      for (const symbol of queue) {
        try {
          let tx: any;
          if (symbol === "ETH") {
            tx = (prepareContractCall as any)({
              contract: contract as any,
              method: "function release(address account)",
              params: [recipientWallet as `0x${string}`],
            });
          } else {
            const t = envTokens[symbol];
            const tokenAddr = t?.address as `0x${string}` | undefined;
            if (!tokenAddr || !isHex(String(tokenAddr))) {
              const rr = { symbol, status: "skipped", reason: "token_address_not_configured" };
              if (!onlySymbol) {
                setReleaseModal((prev) => ({
                  ...prev,
                  statuses: { ...prev.statuses, [symbol]: { status: rr.status, reason: rr.reason } },
                }));
              }
              setReleaseResults((prev) => {
                const next = new Map(prev);
                const arr = Array.isArray(next.get(w)) ? next.get(w)! : [];
                arr.push(rr as any);
                next.set(w, arr);
                return next;
              });
              continue;
            }
            tx = (prepareContractCall as any)({
              contract: contract as any,
              method: "function release(address token, address account)",
              params: [tokenAddr, recipientWallet as `0x${string}`],
            });
          }

          const sent = await sendTransaction({
            account: account as any,
            transaction: tx,
          });
          const transactionHash = (sent as any)?.transactionHash || (sent as any)?.hash || undefined;

          const rr = { symbol, transactionHash, status: "submitted" as const };
          if (!onlySymbol) {
            setReleaseModal((prev) => ({
              ...prev,
              statuses: { ...prev.statuses, [symbol]: { status: rr.status, tx: rr.transactionHash } },
            }));
          }
          setReleaseResults((prev) => {
            const next = new Map(prev);
            const arr = Array.isArray(next.get(w)) ? next.get(w)! : [];
            arr.push(rr as any);
            next.set(w, arr);
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
            setReleaseModal((prev) => ({
              ...prev,
              statuses: { ...prev.statuses, [symbol]: { status: rr.status, reason: rr.reason } },
            }));
          }
          setReleaseResults((prev) => {
            const next = new Map(prev);
            const arr = Array.isArray(next.get(w)) ? next.get(w)! : [];
            arr.push(rr as any);
            next.set(w, arr);
            return next;
          });
        } finally {
          if (!onlySymbol) {
            setReleaseModal((prev) => ({ ...prev, processed: prev.processed + 1 }));
          }
        }
      }

      // Refresh balances after releasing
      await fetchMerchantBalances(w);
      try { await fetchReleasable(w); } catch { }
    } catch (e: any) {
      setReleaseError((prev) => ({ ...prev, [w]: e?.message || "Release failed" }));
    } finally {
      setReleaseLoading((prev) => ({ ...prev, [w]: false }));
    }
  }

  // Derived lists with search/filter/sort/pagination
  const filteredItems = React.useMemo(() => {
    const qTrim = (q || "").trim().toLowerCase();
    return (items || []).filter((it) => {
      const tagsLower = (Array.isArray(it.tags) ? it.tags : []).map((t) => String(t || "").toLowerCase());
      const tagOk =
        tagFilter === "any"
          ? true
          : tagFilter === "connected"
            ? tagsLower.includes("connected")
            : tagsLower.includes(tagFilter);
      const matchQ =
        qTrim
          ? String(it.merchant || "").toLowerCase().includes(qTrim) ||
          String(it.displayName || "").toLowerCase().includes(qTrim)
          : true;
      return tagOk && matchQ;
    });
  }, [items, q, tagFilter]);

  const sortedItems = React.useMemo(() => {
    const arr = filteredItems.slice();
    const cmp = (a: any, b: any) => {
      switch (sortField) {
        case "earned": return Number(a.totalEarnedUsd || 0) - Number(b.totalEarnedUsd || 0);
        case "customers": return Number(a.customers || 0) - Number(b.customers || 0);
        case "xp": return Number(a.totalCustomerXp || 0) - Number(b.totalCustomerXp || 0);
        case "fee": return Number(a.platformFeeUsd || 0) - Number(b.platformFeeUsd || 0);
        case "display": return String(a.displayName || "").localeCompare(String(b.displayName || ""));
        case "wallet": return String(a.merchant || "").localeCompare(String(b.merchant || ""));
        default: return 0;
      }
    };
    arr.sort((a, b) => {
      const d = cmp(a, b);
      return sortOrder === "asc" ? d : -d;
    });
    return arr;
  }, [filteredItems, sortField, sortOrder]);

  const paginatedItems = React.useMemo(() => {
    const start = page * limit;
    const end = start + limit;
    return sortedItems.slice(start, end);
  }, [sortedItems, page, limit]);

  React.useEffect(() => {
    // Reset page and update total when data or filters change
    setPage(0);
    setTotal(sortedItems.length);
  }, [sortedItems, limit]);

  return (
    <div className="glass-pane rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Merchants (Platform)</h2>
        <div className="flex items-center gap-2">
          {indexing && (
            <span className="microtext text-muted-foreground animate-pulse flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              Indexing in background…
            </span>
          )}
          <button className="px-3 py-1.5 rounded-md border text-sm" onClick={reindexAll} disabled={loading || indexing}>
            {loading ? "Loading…" : indexing ? "Indexing…" : "Reindex"}
          </button>
        </div>
      </div>

      {/* Controls: search/filter/sort/pagination */}
      <div className="mb-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        <div>
          <label className="microtext text-muted-foreground">Search</label>
          <input
            className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
            placeholder="Wallet or display name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div>
          <label className="microtext text-muted-foreground">Tag Filter</label>
          <select
            className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value as any)}
          >
            <option value="any">Any</option>
            <option value="merchant">merchant</option>
            <option value="buyer">buyer</option>
            <option value="connected">Connected</option>
          </select>
        </div>
        <div>
          <label className="microtext text-muted-foreground">Sort Field</label>
          <select
            className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as any)}
          >
            <option value="earned">Total Earned</option>
            <option value="customers">Customers</option>
            <option value="xp">Total Customer XP</option>
            <option value="fee">Platform Fee</option>
            <option value="display">Display Name</option>
            <option value="wallet">Wallet</option>
          </select>
        </div>
        <div>
          <label className="microtext text-muted-foreground">Order</label>
          <select
            className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
        </div>
        <div>
          <label className="microtext text-muted-foreground">Page Size</label>
          <input
            type="number"
            min={1}
            step={1}
            className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.floor(Number(e.target.value || 1))))}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            className="w-full h-9 rounded-md border text-sm"
            onClick={() => {
              setQ("");
              setTagFilter("any");
              setSortField("earned");
              setSortOrder("desc");
              setLimit(50);
              setPage(0);
              setBrandKeyFilter("__none__");
            }}
          >
            Reset Filters
          </button>
        </div>
      </div>

      {error && <div className="microtext text-amber-600">{error}</div>}

      {/* Loading shimmer */}
      {loading && (
        <div className="mb-2">
          <div className="h-3 w-32 bg-foreground/10 rounded animate-pulse" />
        </div>
      )}
      <div className="overflow-auto rounded-md border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-foreground/5">
              <th className="text-left px-3 py-2 font-medium">Merchant Wallet</th>
              <th className="text-left px-3 py-2 font-medium">Display Name</th>
              <th className="text-left px-3 py-2 font-medium">Tags</th>
              <th className="text-left px-3 py-2 font-medium">Total Earned (USD)</th>
              <th className="text-left px-3 py-2 font-medium">Customers</th>
              <th className="text-left px-3 py-2 font-medium">Total Customer XP</th>
              <th className="text-left px-3 py-2 font-medium">Platform Fee (USD)</th>
              <th className="text-left px-3 py-2 font-medium">Mode</th>
              <th className="text-left px-3 py-2 font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {(paginatedItems || []).map((it) => {
              const w = String(it.merchant || "").toLowerCase();
              const b = balancesCache.get(w) || null;
              const isExpanded = !!expanded[w];
              const relLoading = !!releaseLoading[w];
              const relError = String(releaseError[w] || "");
              const resLoad = !!resLoading[w];
              const resErr = String(resError[w] || "");
              const relResults = releaseResults.get(w) || [];
              const transactions = transactionsCache.get(w) || [];
              const cumulative = cumulativeCache.get(w) || { payments: {}, merchantReleases: {}, platformReleases: {} };
              const txLoad = !!txLoading[w];
              const txErr = String(txError[w] || "");
              return (
                <React.Fragment key={it.merchant}>
                  <tr className="border-t">
                    <td className="px-3 py-2"><TruncatedAddress address={it.merchant} /></td>
                    <td className="px-3 py-2">{it.displayName || "—"}</td>
                    <td className="px-3 py-2">{Array.isArray(it.tags) && it.tags.length ? it.tags.join(", ") : "—"}</td>
                    <td className="px-3 py-2">${Number(it.totalEarnedUsd || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">{Number(it.customers || 0)}</td>
                    <td className="px-3 py-2">{Number(it.totalCustomerXp || 0)}</td>
                    <td className="px-3 py-2">${Number(it.platformFeeUsd || 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <button
                              role="switch"
                              aria-checked={!!it.kioskEnabled}
                              onClick={() => toggleMerchantFeature(it.merchant, 'kioskEnabled', !it.kioskEnabled)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${it.kioskEnabled ? "bg-emerald-500" : "bg-neutral-200 dark:bg-neutral-700"
                                }`}
                            >
                              <span
                                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${it.kioskEnabled ? "translate-x-4" : "translate-x-0.5"
                                  }`}
                              />
                            </button>
                            <span className="text-xs font-medium">Kiosk</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              role="switch"
                              aria-checked={!!it.terminalEnabled}
                              onClick={() => toggleMerchantFeature(it.merchant, 'terminalEnabled', !it.terminalEnabled)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${it.terminalEnabled ? "bg-blue-500" : "bg-neutral-200 dark:bg-neutral-700"
                                }`}
                            >
                              <span
                                className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${it.terminalEnabled ? "translate-x-4" : "translate-x-0.5"
                                  }`}
                              />
                            </button>
                            <span className="text-xs font-medium">Term</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <a href={`/u/${encodeURIComponent(it.merchant)}`} className="underline">Profile</a>
                        {(() => {
                          try {
                            const slug = shopSlugs.get(String(it.merchant || "").toLowerCase());
                            return slug
                              ? <a href={`/shop/${encodeURIComponent(slug)}`} className="underline">Shop</a>
                              : <span className="microtext text-muted-foreground">Shop —</span>;
                          } catch {
                            return <span className="microtext text-muted-foreground">Shop —</span>;
                          }
                        })()}
                        <button
                          className="px-2 py-1 rounded-md border text-xs"
                          onClick={() => toggleAccordion(w)}
                          title={isExpanded ? "Hide Reserve" : "Show Reserve"}
                        >
                          {isExpanded ? "Hide Reserve" : "Show Reserve"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-t bg-foreground/5">
                      <td className="px-3 py-3" colSpan={8}>
                        <div className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="microtext text-muted-foreground">
                              Split: {b && b.splitAddressUsed
                                ? <TruncatedAddress address={b.splitAddressUsed || ""} />
                                : "Not configured"}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                className="px-2 py-1 rounded-md border text-xs"
                                onClick={() => releasePlatformShare(w)}
                                disabled={
                                  relLoading ||
                                  !(b && b.splitAddressUsed) ||
                                  (() => {
                                    try {
                                      const relMap = releasableCache.get(w) || {};
                                      const syms = Object.keys((b?.balances || {}));
                                      for (const s of syms) {
                                        const u = Number(((relMap as any)[s]?.units || 0));
                                        if (u > 0) return false; // at least one token has releasable > 0
                                      }
                                      return true; // all tokens have no releasable -> disable
                                    } catch {
                                      return true; // conservative disable on error/undefined
                                    }
                                  })()
                                }
                                title={String(process.env.CONTAINER_TYPE || "platform").toLowerCase() === "partner" ? "Release partner share from merchant's split" : "Release platform share from merchant's split"}
                              >
                                {relLoading ? "Releasing…" : (String(process.env.CONTAINER_TYPE || "platform").toLowerCase() === "partner" ? "Release Partner Share" : "Release Platform Share")}
                              </button>
                              {relError && <span className="microtext text-red-500">{relError}</span>}
                            </div>
                          </div>
                          <div className="space-y-1 mb-2">
                            <div className="microtext text-muted-foreground">
                              Platform fee (from receipts): ${Number(it.platformFeeUsd || 0).toFixed(2)}
                            </div>
                            {transactions.length > 0 && (
                              <div className="microtext text-muted-foreground">
                                Recent transactions: {transactions.length} • Total volume: {(() => {
                                  const total = transactions.reduce((sum, tx) => sum + Number(tx.value || 0), 0);
                                  return `${total.toFixed(4)} ETH`;
                                })()}
                              </div>
                            )}
                          </div>

                          {relResults.length > 0 && (
                            <div className="microtext">
                              {relResults.map((rr: any, idx: number) => (
                                <div key={idx} className={statusClassPlatform(rr)}>
                                  {formatPlatformMessage(rr)}
                                </div>
                              ))}
                            </div>
                          )}

                          {resLoad ? (
                            <div className="microtext text-muted-foreground">Loading balances…</div>
                          ) : resErr ? (
                            <div className="microtext text-red-500">Error: {resErr}</div>
                          ) : b && b.balances ? (
                            <>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {Object.entries(b.balances).map(([symbol, info]: [string, any]) => {
                                  const totalGenerated = (() => {
                                    try {
                                      const payments = Number(cumulative.payments?.[symbol] || 0);
                                      const merchantReleases = Number(cumulative.merchantReleases?.[symbol] || 0);
                                      return payments;
                                    } catch {
                                      return 0;
                                    }
                                  })();

                                  return (
                                    <div key={symbol} className="p-3 rounded-md border glass-pane space-y-2">
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground">{symbol}</div>
                                        <div className="text-sm font-semibold">{Number(info.units || 0).toFixed(6)}</div>
                                        <div className="microtext text-muted-foreground">${Number(info.usd || 0).toFixed(2)}</div>
                                      </div>

                                      {/* Show total generated - compact format */}
                                      {totalGenerated > 0 && (
                                        <div className="text-xs text-blue-600 font-medium border-t pt-1">
                                          ↑ {totalGenerated.toFixed(4)}
                                        </div>
                                      )}

                                      {b && b.splitAddressUsed && (() => {
                                        try {
                                          const relMap = releasableCache.get(w) || {};
                                          const rel = (relMap as any)[symbol];
                                          if (rel && typeof rel.units === "number") {
                                            const unitVal = Number(rel.units || 0);
                                            if (unitVal > 0) {
                                              return (
                                                <div className="microtext text-amber-600 border-t pt-1">
                                                  ⚡ {unitVal.toFixed(4)} releasable
                                                </div>
                                              );
                                            }
                                          }
                                          return null;
                                        } catch {
                                          return null;
                                        }
                                      })()}

                                      <div>
                                        <button
                                          className="px-2 py-1 rounded-md border text-xs"
                                          onClick={() => releasePlatformShare(w, symbol)}
                                          disabled={
                                            relLoading ||
                                            !(b && b.splitAddressUsed) ||
                                            (() => {
                                              try {
                                                const relMap = releasableCache.get(w) || {};
                                                const rel = (relMap as any)[symbol];
                                                const u = Number(rel?.units || 0);
                                                return !(u > 0); // disable if no releasable for this token
                                              } catch {
                                                return true; // conservative disable on error/undefined
                                              }
                                            })()
                                          }
                                          title="Release platform share for this token"
                                        >
                                          {relLoading ? "Working…" : `Release ${symbol}`}
                                        </button>
                                        {(() => {
                                          try {
                                            const arr = releaseResults.get(w) || [];
                                            const rr = (arr || []).find((x: any) => String(x?.symbol || "") === String(symbol));
                                            return rr ? (
                                              <div className={`microtext mt-1 ${statusClassPlatform(rr)}`}>
                                                {formatPlatformMessage(rr)}
                                              </div>
                                            ) : null;
                                          } catch {
                                            return null;
                                          }
                                        })()}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="microtext text-muted-foreground">
                                Total Reserve Value (USD): ${Number(b.totalUsd || 0).toFixed(2)}
                              </div>

                              {/* Transaction History */}
                              {b && b.splitAddressUsed && (
                                <div className="mt-3 rounded-md border p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm font-medium">Recent Transactions</div>
                                    <button
                                      className="px-2 py-1 rounded-md border text-xs"
                                      onClick={() => fetchMerchantTransactions(w)}
                                      disabled={txLoad}
                                    >
                                      {txLoad ? "Loading…" : "Refresh"}
                                    </button>
                                  </div>
                                  {txLoad ? (
                                    <div className="microtext text-muted-foreground">Loading transactions…</div>
                                  ) : txErr ? (
                                    <div className="microtext text-red-500">{txErr}</div>
                                  ) : transactions.length > 0 ? (
                                    <>
                                      <div className="microtext text-muted-foreground mb-2">
                                        Showing last {transactions.length} transactions to split
                                      </div>
                                      <div className="max-h-60 overflow-y-auto space-y-1">
                                        {transactions.map((tx: any, idx: number) => {
                                          const txType = tx?.type || 'unknown';
                                          const releaseType = tx?.releaseType;
                                          const isPayment = txType === 'payment';
                                          const isRelease = txType === 'release';

                                          return (
                                            <div key={idx} className={`p-2 rounded border text-xs ${isRelease ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                                              <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="font-mono">
                                                    <a
                                                      href={`https://base.blockscout.com/tx/${tx.hash}`}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="underline"
                                                    >
                                                      {String(tx.hash || "").slice(0, 10)}…{String(tx.hash || "").slice(-8)}
                                                    </a>
                                                  </span>
                                                  {isPayment && <span className="px-1 py-0.5 rounded text-[10px] bg-green-100 text-green-700">Payment</span>}
                                                  {isRelease && releaseType === 'merchant' && <span className="px-1 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">Merchant Release</span>}
                                                  {isRelease && releaseType === 'platform' && <span className="px-1 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700">Platform Release</span>}
                                                </div>
                                                <span className="font-semibold">{Number(tx.value || 0).toFixed(4)} {String(tx.token || 'ETH').toUpperCase()}</span>
                                              </div>
                                              <div className="flex items-center justify-between microtext text-muted-foreground">
                                                <span>{isPayment ? 'From' : 'To'}: {String(isPayment ? tx.from : tx.to || "").slice(0, 8)}…</span>
                                                <span>{new Date(Number(tx.timestamp || 0)).toLocaleString()}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <div className="mt-2 space-y-1">
                                        <div className="microtext text-muted-foreground">
                                          Payments: {(() => {
                                            const payments = transactions.filter((tx: any) => tx?.type === 'payment');
                                            const total = payments.reduce((sum: number, tx: any) => sum + Number(tx.value || 0), 0);
                                            return `${payments.length} tx • ${total.toFixed(4)} ETH`;
                                          })()}
                                        </div>
                                        <div className="microtext text-muted-foreground">
                                          Merchant Releases: {(() => {
                                            const releases = transactions.filter((tx: any) => tx?.type === 'release' && tx?.releaseType === 'merchant');
                                            const total = releases.reduce((sum: number, tx: any) => sum + Number(tx.value || 0), 0);
                                            return `${releases.length} tx • ${total.toFixed(4)} ETH`;
                                          })()}
                                        </div>
                                        <div className="microtext text-muted-foreground">
                                          Platform Releases: {(() => {
                                            const releases = transactions.filter((tx: any) => tx?.type === 'release' && tx?.releaseType === 'platform');
                                            const total = releases.reduce((sum: number, tx: any) => sum + Number(tx.value || 0), 0);
                                            return `${releases.length} tx • ${total.toFixed(4)} ETH`;
                                          })()}
                                        </div>
                                        <div className="microtext text-muted-foreground">
                                          View on{" "}
                                          <a
                                            href={`https://base.blockscout.com/address/${b.splitAddressUsed}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="underline"
                                          >
                                            Blockscout
                                          </a>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="microtext text-muted-foreground">No transactions found</div>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="microtext text-muted-foreground">No balance data</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {(!paginatedItems || paginatedItems.length === 0) && !loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination summary and controls */}
      <div className="microtext text-muted-foreground mt-2 flex items-center justify-between">
        <span>
          {(() => {
            const start = page * limit + (paginatedItems.length ? 1 : 0);
            const end = page * limit + paginatedItems.length;
            return `Showing ${paginatedItems.length ? `${start}-${end}` : "0"} of ${total}`;
          })()}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="px-2 py-1 rounded-md border text-xs"
            onClick={() => {
              const np = Math.max(0, page - 1);
              setPage(np);
            }}
            disabled={page <= 0 || loading}
          >
            Prev
          </button>
          <span>Page {page + 1}</span>
          <button
            className="px-2 py-1 rounded-md border text-xs"
            onClick={() => setPage(page + 1)}
            disabled={(page + 1) * limit >= total || loading}
          >
            Next
          </button>
        </div>
      </div>
      {releaseModal.open && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4">
            <div className="w-full max-w-sm rounded-md border bg-background p-4">
              <div className="text-sm font-medium mb-2">{String(process.env.CONTAINER_TYPE || "platform").toLowerCase() === "partner" ? "Releasing Partner Share" : "Releasing Platform Share"}</div>
              <div className="microtext text-muted-foreground mb-2">
                {releaseModal.processed} / {Math.max(0, releaseModal.queue.length)} processed
              </div>
              <div className="h-2 w-full bg-foreground/10 rounded">
                <div
                  className="h-2 bg-blue-500 rounded"
                  style={{
                    width: `${Math.min(100, Math.floor((releaseModal.processed / Math.max(1, releaseModal.queue.length)) * 100))}%`,
                  }}
                />
              </div>
              <div className="mt-3 max-h-40 overflow-auto microtext">
                {releaseModal.queue.map((sym) => {
                  const st = releaseModal.statuses[sym];
                  const cls = st
                    ? st.status === "failed"
                      ? "text-red-500"
                      : st.status === "skipped"
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    : "text-muted-foreground";
                  const fallback =
                    releaseModal.processed <= releaseModal.queue.indexOf(sym) ? "queued" : "working…";
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
                  onClick={() => setReleaseModal((prev) => ({ ...prev, open: false }))}
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

/* ---------------- Inventory Tab ---------------- */
type InventoryItem = {
  id: string;
  wallet: string;
  sku: string;
  name: string;
  priceUsd: number;
  currency?: string;
  stockQty: number;
  category?: string;
  description?: string;
  tags?: string[];
  images?: string[]; // image URLs (up to 3) — stored high‑res (WebP, max 1500x1500); UI uses 256x256 thumbnail for preview
  attributes?: Record<string, any>;
  costUsd?: number;
  taxable?: boolean;
  jurisdictionCode?: string;
  industryPack?: 'general' | 'restaurant' | 'retail' | 'hotel' | 'freelancer';
  createdAt: number;
  updatedAt: number;
};

function InventoryPanel() {
  const account = useActiveAccount();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // View mode state (List vs Grid) - default to Grid on mobile
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode("grid");
      }
    };
    // Initial check
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Industry pack detection - default to 'general' so fields always render
  const [activeIndustryPack, setActiveIndustryPack] = useState<string>('general');

  // Store currency for display conversion
  const [storeCurrency, setStoreCurrency] = useState<string>("USD");
  const [rates, setRates] = useState<Record<string, number>>({});
  const [usdRates, setUsdRates] = useState<Record<string, number>>({});

  // Load active industry pack and storeCurrency from shop/site config
  useEffect(() => {
    (async () => {
      try {
        const [shopRes, siteRes] = await Promise.all([
          fetch("/api/shop/config", { headers: { "x-wallet": account?.address || "" } }),
          fetch("/api/site/config", { headers: { "x-wallet": account?.address || "" } }),
        ]);
        const shopData = await shopRes.json().catch(() => ({}));
        const siteData = await siteRes.json().catch(() => ({}));

        setActiveIndustryPack(shopData?.config?.industryPack || 'general');
        const sc = typeof siteData?.config?.storeCurrency === "string" ? siteData.config.storeCurrency : "USD";
        setStoreCurrency(sc);
      } catch { }
    })();
  }, [account?.address]);

  // Fetch FX rates when storeCurrency changes
  useEffect(() => {
    (async () => {
      try {
        const [ethRatesData, usdRatesData] = await Promise.all([
          fetchEthRates().catch(() => ({})),
          fetchUsdRates().catch(() => ({})),
        ]);
        setRates(ethRatesData);
        setUsdRates(usdRatesData);
      } catch { }
    })();
  }, [storeCurrency]);

  // Form state
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [priceUsd, setPriceUsd] = useState<number>(0);
  const [currency, setCurrency] = useState<string>("USD");
  const [stockQty, setStockQty] = useState<number>(0);
  const [infiniteStock, setInfiniteStock] = useState<boolean>(false);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [attributesJson, setAttributesJson] = useState("{}");
  const [costUsd, setCostUsd] = useState<number | undefined>(undefined);
  const [taxable, setTaxable] = useState<boolean>(true);
  const [jurisdictionCode, setJurisdictionCode] = useState("");
  const [siteMeta, setSiteMeta] = useState<{ processingFeePct: number; basePlatformFeePct: number; taxRate: number; hasDefault: boolean }>({ processingFeePct: 0, basePlatformFeePct: 0.5, taxRate: 0, hasDefault: false });
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imagesError, setImagesError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [toastImportOpen, setToastImportOpen] = useState(false);
  const [editOpenInv, setEditOpenInv] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editStockQty, setEditStockQty] = useState<number>(0);
  const [editInfinite, setEditInfinite] = useState<boolean>(false);
  const [editSaving, setEditSaving] = useState(false);

  // NEW: Edit modal comprehensive state (parity with Add modal)
  const [editSku, setEditSku] = useState<string>("");
  const [editWallet, setEditWallet] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editPriceUsd, setEditPriceUsd] = useState<number>(0);
  const [editCurrency, setEditCurrency] = useState<string>("USD");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editTags, setEditTags] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editAttributesJson, setEditAttributesJson] = useState<string>("{}");
  const [editCostUsd, setEditCostUsd] = useState<number | undefined>(undefined);
  const [editImages, setEditImages] = useState<string[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [editIsDragging, setEditIsDragging] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editImagesError, setEditImagesError] = useState("");

  // Industry-specific state for Add modal
  // Restaurant
  const [modifierGroups, setModifierGroups] = useState<Array<{
    id: string;
    name: string;
    required: boolean;
    minSelect?: number;
    maxSelect?: number;
    modifiers: Array<{ id: string; name: string; priceAdjustment: number }>;
  }>>([]);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [spiceLevel, setSpiceLevel] = useState<number>(0);
  const [prepTime, setPrepTime] = useState<string>("");
  const [calories, setCalories] = useState<number | undefined>(undefined);
  const [ingredients, setIngredients] = useState<string>("");

  // Retail
  const [variationGroups, setVariationGroups] = useState<Array<{
    id: string;
    name: string;
    type: 'preset' | 'custom';
    required: boolean;
    values: string[];
  }>>([]);
  const [variants, setVariants] = useState<Array<{
    sku: string;
    attributes: Record<string, string>;
    stockQty: number;
    priceAdjustment: number;
  }>>([]);

  // Hotel
  const [isRoomType, setIsRoomType] = useState<boolean>(false);
  const [pricePerNight, setPricePerNight] = useState<number | undefined>(undefined);
  const [maxOccupancy, setMaxOccupancy] = useState<number | undefined>(undefined);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  // Freelancer
  const [pricingType, setPricingType] = useState<'hourly' | 'project' | 'package' | 'retainer'>('hourly');
  const [pricingAmount, setPricingAmount] = useState<number>(0);
  const [minHours, setMinHours] = useState<number | undefined>(undefined);
  const [billingCycle, setBillingCycle] = useState<string>("");
  const [deliveryTime, setDeliveryTime] = useState<string>("");
  const [revisionsIncluded, setRevisionsIncluded] = useState<number | undefined>(undefined);
  const [skillLevel, setSkillLevel] = useState<string>("");
  const [serviceCategory, setServiceCategory] = useState<string>("");
  const [deliverables, setDeliverables] = useState<string[]>([]);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [addOns, setAddOns] = useState<Array<{ id: string; name: string; price: number; description: string }>>([]);

  // Industry-specific state for Edit modal
  // Restaurant
  const [editModifierGroups, setEditModifierGroups] = useState<Array<{
    id: string;
    name: string;
    required: boolean;
    minSelect?: number;
    maxSelect?: number;
    modifiers: Array<{ id: string; name: string; priceAdjustment: number }>;
  }>>([]);
  const [editDietaryTags, setEditDietaryTags] = useState<string[]>([]);
  const [editSpiceLevel, setEditSpiceLevel] = useState<number>(0);
  const [editPrepTime, setEditPrepTime] = useState<string>("");
  const [editCalories, setEditCalories] = useState<number | undefined>(undefined);
  const [editIngredients, setEditIngredients] = useState<string>("");

  // Retail
  const [editVariationGroups, setEditVariationGroups] = useState<Array<{
    id: string;
    name: string;
    type: 'preset' | 'custom';
    required: boolean;
    values: string[];
  }>>([]);
  const [editVariants, setEditVariants] = useState<Array<{
    sku: string;
    attributes: Record<string, string>;
    stockQty: number;
    priceAdjustment: number;
  }>>([]);

  // Hotel
  const [editIsRoomType, setEditIsRoomType] = useState<boolean>(false);
  const [editPricePerNight, setEditPricePerNight] = useState<number | undefined>(undefined);
  const [editMaxOccupancy, setEditMaxOccupancy] = useState<number | undefined>(undefined);
  const [editAmenities, setEditAmenities] = useState<string[]>([]);
  const [editRooms, setEditRooms] = useState<Room[]>([]);

  // Freelancer
  const [editPricingType, setEditPricingType] = useState<'hourly' | 'project' | 'package' | 'retainer'>('hourly');
  const [editPricingAmount, setEditPricingAmount] = useState<number>(0);
  const [editMinHours, setEditMinHours] = useState<number | undefined>(undefined);
  const [editBillingCycle, setEditBillingCycle] = useState<string>("");
  const [editDeliveryTime, setEditDeliveryTime] = useState<string>("");
  const [editRevisionsIncluded, setEditRevisionsIncluded] = useState<number | undefined>(undefined);
  const [editSkillLevel, setEditSkillLevel] = useState<string>("");
  const [editServiceCategory, setEditServiceCategory] = useState<string>("");
  const [editDeliverables, setEditDeliverables] = useState<string[]>([]);
  const [editRequirements, setEditRequirements] = useState<string[]>([]);
  const [editAddOns, setEditAddOns] = useState<Array<{ id: string; name: string; price: number; description: string }>>([]);

  // Publishing
  const [pubTitle, setPubTitle] = useState("");
  const [pubAuthor, setPubAuthor] = useState("");
  const [pubPublisher, setPubPublisher] = useState("");
  const [pubIsbn, setPubIsbn] = useState("");
  const [pubDate, setPubDate] = useState("");
  const [pubFormat, setPubFormat] = useState<PublishingFormat | "">("");
  const [pubPageCount, setPubPageCount] = useState<number>(0);
  const [pubLanguage, setPubLanguage] = useState("");
  const [pubEdition, setPubEdition] = useState("");
  const [pubGenres, setPubGenres] = useState<string[]>([]);
  const [pubCondition, setPubCondition] = useState<BookCondition | "">("");
  const [pubDownloadUrl, setPubDownloadUrl] = useState("");
  const [pubPreviewUrl, setPubPreviewUrl] = useState("");
  const [pubDrm, setPubDrm] = useState(false);

  // Edit Publishing
  const [editPubTitle, setEditPubTitle] = useState("");
  const [editPubAuthor, setEditPubAuthor] = useState("");
  const [editPubPublisher, setEditPubPublisher] = useState("");
  const [editPubIsbn, setEditPubIsbn] = useState("");
  const [editPubDate, setEditPubDate] = useState("");
  const [editPubFormat, setEditPubFormat] = useState<PublishingFormat | "">("");
  const [editPubPageCount, setEditPubPageCount] = useState<number>(0);
  const [editPubLanguage, setEditPubLanguage] = useState("");
  const [editPubEdition, setEditPubEdition] = useState("");
  const [editPubGenres, setEditPubGenres] = useState<string[]>([]);
  const [editPubCondition, setEditPubCondition] = useState<BookCondition | "">("");
  const [editPubDownloadUrl, setEditPubDownloadUrl] = useState("");
  const [editPubPreviewUrl, setEditPubPreviewUrl] = useState("");
  const [editPubDrm, setEditPubDrm] = useState(false);
  const [editIsBook, setEditIsBook] = useState(false);

  // Edit modal: industry pack override
  const [editIndustryPack, setEditIndustryPack] = useState<'general' | 'restaurant' | 'retail' | 'hotel' | 'freelancer' | 'publishing'>('general');

  // Inventory query/search/filter/sort/pagination state
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [taxableFilter, setTaxableFilter] = useState<"any" | "true" | "false">("any");
  const [stockFilter, setStockFilter] = useState<"any" | "in" | "out">("any");
  const [packFilter, setPackFilter] = useState<string>("any");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [tagsFilter, setTagsFilter] = useState("");
  const [tagsMode, setTagsMode] = useState<"any" | "all">("any");
  const [sortField, setSortField] = useState<string>("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState<number>(50);
  const [page, setPage] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const fetchDebounceRef = useRef<number | null>(null);

  function randomSku9(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 9; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }
  function generateUniqueSku(): string {
    let attempt = 0;
    let sku = randomSku9();
    const existing = new Set((items || []).map((it) => String(it.sku || "").toUpperCase()));
    while (existing.has(sku) && attempt < 200) {
      sku = randomSku9();
      attempt++;
    }
    return sku;
  }
  function openAdd() {
    try {
      setSku(generateUniqueSku());
      setName("");
      setPriceUsd(0);
      setCurrency(storeCurrency); // Default to store currency
      setStockQty(0);
      setCategory("");
      setDescription("");
      setTags("");
      setAttributesJson("{}");
      setCostUsd(undefined);
      setTaxable(true);
      setJurisdictionCode("");
      setImages([]);
      setImageUrl("");
      setImagesError("");
      setInfiniteStock(false);
      setPubTitle(""); setPubAuthor(""); setPubPublisher(""); setPubIsbn("");
      setPubDate(""); setPubFormat(""); setPubPageCount(0); setPubLanguage("");
      setPubEdition(""); setPubGenres([]); setPubCondition("");
      setPubDownloadUrl(""); setPubPreviewUrl(""); setPubDrm(false);
      setAddOpen(true);
    } catch {
      setAddOpen(true);
    }
  }
  function closeAdd() {
    setAddOpen(false);
  }

  function openEditItem(item: InventoryItem) {
    setEditTarget(item);
    const isInfinite = Number(item.stockQty) === -1;
    setEditInfinite(isInfinite);
    setEditStockQty(isInfinite ? 0 : Math.max(0, Number(item.stockQty || 0)));
    // hydrate comprehensive edit state
    setEditSku(String(item.sku || "").toUpperCase().slice(0, 16));
    setEditWallet(item.wallet || "");
    setEditName(item.name || "");
    setEditPriceUsd(Math.max(0, Number(item.priceUsd || 0)));
    setEditCurrency(String((item as any).currency || storeCurrency || "USD")); // Default to item currency or store currency
    setEditCategory(item.category || "");
    setEditTags(Array.isArray(item.tags) ? item.tags.join(", ") : "");
    setEditDescription(item.description || "");
    try {
      setEditAttributesJson(JSON.stringify(item.attributes || {}, null, 2));
    } catch {
      setEditAttributesJson("{}");
    }
    setEditCostUsd(typeof item.costUsd === "number" ? Math.max(0, item.costUsd) : undefined);
    setEditImages(Array.isArray(item.images) ? item.images.slice(0, 3) : []);
    setEditImageUrl("");
    setEditImagesError("");
    setError("");

    // Set editable industry pack
    const pack = item.industryPack || 'general';
    setEditIndustryPack(pack);

    // Hydrate industry-specific fields from attributes based on item's pack
    const attrs = item.attributes || {};

    if (pack === 'restaurant') {
      setEditModifierGroups(Array.isArray(attrs.modifierGroups) ? attrs.modifierGroups : []);
      setEditDietaryTags(Array.isArray(attrs.dietaryTags) ? attrs.dietaryTags : []);
      setEditSpiceLevel(typeof attrs.spiceLevel === 'number' ? attrs.spiceLevel : 0);
      setEditPrepTime(typeof attrs.prepTime === 'string' ? attrs.prepTime : '');
      setEditCalories(typeof attrs.calories === 'number' ? attrs.calories : undefined);
      setEditIngredients(typeof attrs.ingredients === 'string' ? attrs.ingredients : '');
    } else if (pack === 'retail') {
      setEditVariationGroups(Array.isArray(attrs.variationGroups) ? attrs.variationGroups : []);
      setEditVariants(Array.isArray(attrs.variants) ? attrs.variants : []);
    } else if (pack === 'hotel') {
      setEditIsRoomType(attrs.isRoomType === true);
      setEditPricePerNight(typeof attrs.pricePerNight === 'number' ? attrs.pricePerNight : undefined);
      setEditMaxOccupancy(typeof attrs.maxOccupancy === 'number' ? attrs.maxOccupancy : undefined);
      setEditAmenities(Array.isArray(attrs.amenities) ? attrs.amenities : []);
      setEditRooms(Array.isArray(attrs.rooms) ? attrs.rooms : []);
    } else if (pack === 'freelancer') {
      setEditPricingType(attrs.pricingType || 'hourly');
      setEditPricingAmount(typeof attrs.pricingAmount === 'number' ? attrs.pricingAmount : 0);
      setEditMinHours(typeof attrs.minHours === 'number' ? attrs.minHours : undefined);
      setEditBillingCycle(typeof attrs.billingCycle === 'string' ? attrs.billingCycle : '');
      setEditDeliveryTime(typeof attrs.deliveryTime === 'string' ? attrs.deliveryTime : '');
      setEditRevisionsIncluded(typeof attrs.revisionsIncluded === 'number' ? attrs.revisionsIncluded : undefined);
      setEditSkillLevel(typeof attrs.skillLevel === 'string' ? attrs.skillLevel : '');
      setEditServiceCategory(typeof attrs.serviceCategory === 'string' ? attrs.serviceCategory : '');
      setEditDeliverables(Array.isArray(attrs.deliverables) ? attrs.deliverables : []);
      setEditRequirements(Array.isArray(attrs.requirements) ? attrs.requirements : []);
      setEditAddOns(Array.isArray(attrs.addOns) ? attrs.addOns : []);
    } else if ((pack as string) === 'publishing') {
      // Handle both flat and nested publishing attributes (for backward compatibility)
      const pubAttrs = attrs.data && typeof attrs.data === 'object' ? attrs.data : attrs;
      const details = (item as any).contentDetails || {};

      setEditPubTitle(typeof pubAttrs.title === 'string' ? pubAttrs.title : (item.name || ""));
      setEditPubAuthor(typeof pubAttrs.author === 'string' ? pubAttrs.author : (details.author || ""));
      setEditPubPublisher(typeof pubAttrs.publisher === 'string' ? pubAttrs.publisher : (details.publisher || ""));
      setEditPubIsbn(typeof pubAttrs.isbn === 'string' ? pubAttrs.isbn : (details.isbn || ""));
      setEditPubDate(typeof pubAttrs.publicationDate === 'string' ? pubAttrs.publicationDate : (details.releaseDate || ""));
      setEditPubFormat(typeof pubAttrs.format === 'string' ? pubAttrs.format : "Ebook"); // Default to Ebook if missing
      setEditPubPageCount(typeof pubAttrs.pageCount === 'number' ? pubAttrs.pageCount : (details.pages || 0));
      setEditPubLanguage(typeof pubAttrs.language === 'string' ? pubAttrs.language : (details.language || ""));
      setEditPubEdition(typeof pubAttrs.edition === 'string' ? pubAttrs.edition : (details.edition ? String(details.edition) : ""));
      setEditPubGenres(Array.isArray(pubAttrs.genre) ? pubAttrs.genre : (Array.isArray(details.categories) ? details.categories : []));
      setEditPubCondition(typeof pubAttrs.condition === 'string' ? pubAttrs.condition : "New");
      setEditPubDownloadUrl(typeof pubAttrs.downloadUrl === 'string' ? pubAttrs.downloadUrl : ((item as any).bookFileUrl || ""));
      setEditPubPreviewUrl(typeof pubAttrs.previewUrl === 'string' ? pubAttrs.previewUrl : ((item as any).previewUrl || ""));
      setEditPubDrm(pubAttrs.drmEnabled === true || details.drmEnabled === true);
    }

    setEditIsBook((item as any).isBook === true);
    setEditOpenInv(true);
  }

  function closeEditItem() {
    setEditOpenInv(false);
    setEditTarget(null);
    setEditSaving(false);
  }

  async function saveEditItem() {
    try {
      if (!editTarget) return;
      setEditSaving(true);
      setError("");

      // parse attributes JSON
      const parsedAttrs = (() => {
        try {
          const obj = JSON.parse(editAttributesJson || "{}");
          return obj && typeof obj === "object" ? obj : {};
        } catch {
          return {};
        }
      })();

      // Package industry-specific data into attributes based on selected pack
      const industryAttrs: Record<string, any> = {};
      const itemPack = editIndustryPack || 'general';

      if (itemPack === 'restaurant') {
        if (editModifierGroups.length) industryAttrs.modifierGroups = editModifierGroups;
        if (editDietaryTags.length) industryAttrs.dietaryTags = editDietaryTags;
        if (editSpiceLevel > 0) industryAttrs.spiceLevel = editSpiceLevel;
        if (editPrepTime) industryAttrs.prepTime = editPrepTime;
        if (editCalories !== undefined) industryAttrs.calories = editCalories;
        if (editIngredients) industryAttrs.ingredients = editIngredients;
      } else if (itemPack === 'retail') {
        if (editVariationGroups.length) industryAttrs.variationGroups = editVariationGroups;
        if (editVariants.length) industryAttrs.variants = editVariants;
      } else if (itemPack === 'hotel') {
        industryAttrs.isRoomType = editIsRoomType;
        if (editPricePerNight !== undefined) industryAttrs.pricePerNight = editPricePerNight;
        if (editMaxOccupancy !== undefined) industryAttrs.maxOccupancy = editMaxOccupancy;
        if (editAmenities.length) industryAttrs.amenities = editAmenities;
        if (editRooms.length) industryAttrs.rooms = editRooms;
      } else if (itemPack === 'freelancer') {
        industryAttrs.pricingType = editPricingType;
        industryAttrs.pricingAmount = editPricingAmount;
        if (editMinHours !== undefined) industryAttrs.minHours = editMinHours;
        if (editBillingCycle) industryAttrs.billingCycle = editBillingCycle;
        if (editDeliveryTime) industryAttrs.deliveryTime = editDeliveryTime;
        if (editRevisionsIncluded !== undefined) industryAttrs.revisionsIncluded = editRevisionsIncluded;
        if (editSkillLevel) industryAttrs.skillLevel = editSkillLevel;
        if (editServiceCategory) industryAttrs.serviceCategory = editServiceCategory;
        if (editDeliverables.length) industryAttrs.deliverables = editDeliverables;
        if (editRequirements.length) industryAttrs.requirements = editRequirements;
        if (editAddOns.length) industryAttrs.addOns = editAddOns;
      } else if (itemPack === 'publishing') {
        if (editPubTitle) industryAttrs.title = editPubTitle;
        if (editPubAuthor) industryAttrs.author = editPubAuthor;
        if (editPubPublisher) industryAttrs.publisher = editPubPublisher;
        if (editPubIsbn) industryAttrs.isbn = editPubIsbn;
        if (editPubDate) industryAttrs.publicationDate = editPubDate;
        if (editPubFormat) industryAttrs.format = editPubFormat;
        if (editPubPageCount) industryAttrs.pageCount = editPubPageCount;
        if (editPubLanguage) industryAttrs.language = editPubLanguage;
        if (editPubEdition) industryAttrs.edition = editPubEdition;
        if (editPubGenres.length) industryAttrs.genre = editPubGenres;
        if (editPubCondition) industryAttrs.condition = editPubCondition;
        if (editPubDownloadUrl) industryAttrs.downloadUrl = editPubDownloadUrl;
        if (editPubPreviewUrl) industryAttrs.previewUrl = editPubPreviewUrl;
        industryAttrs.drmEnabled = editPubDrm;
      }

      const payload = {
        ...editTarget, // Preserve all existing fields (isBook, bookFileUrl, approvalStatus, etc.)
        id: editTarget.id,
        wallet: editWallet,
        isBook: editIsBook,
        sku: String(editSku || "").toUpperCase().slice(0, 16),
        name: editName,
        priceUsd: Math.max(0, Number(editPriceUsd || 0)),
        currency: editCurrency,
        stockQty: editInfinite ? -1 : Math.max(0, Math.floor(Number(editStockQty || 0))),
        category: editCategory || undefined,
        description: editDescription || undefined,
        tags: (editTags || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 12),
        images: (editImages || []).slice(0, 3),
        attributes: { ...parsedAttrs, ...industryAttrs },
        costUsd: typeof editCostUsd === "number" ? Math.max(0, editCostUsd) : undefined,
        taxable: editTarget.taxable === true,
        industryPack: itemPack,
      };

      const r = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to update item");
        setEditSaving(false);
        return;
      }
      await refresh();
      closeEditItem();
    } catch (e: any) {
      setError(e?.message || "Failed to update item");
    } finally {
      setEditSaving(false);
    }
  }

  function moveToFront<T>(arr: T[], idx: number): T[] {
    if (idx <= 0 || idx >= arr.length) return arr.slice();
    const copy = arr.slice();
    const [item] = copy.splice(idx, 1);
    copy.unshift(item);
    return copy;
  }

  // Pretty toggle with infinity icon
  function InfinitySwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`inline-flex items-center gap-1 px-2 h-8 rounded-full border transition ${checked ? "bg-foreground/10 border-foreground/30" : "bg-background"}`}
        title="Infinite stock"
        aria-label="Infinite stock"
      >
        <span
          className={`inline-block h-4 w-7 rounded-full border relative transition ${checked ? "bg-green-500/20 border-green-500/50" : "bg-foreground/5 border-foreground/20"}`}
        >
          <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transform transition ${checked ? "translate-x-3.5" : ""}`} />
        </span>
        <InfinityIcon className={`h-4 w-4 ${checked ? "text-green-600" : "text-foreground/60"}`} />
      </button>
    );
  }

  async function fetchSiteMeta(): Promise<{ processingFeePct: number; basePlatformFeePct: number; taxRate: number; hasDefault: boolean }> {
    try {
      const r = await fetch("/api/site/config", { headers: { "x-wallet": account?.address || "" } });
      const j = await r.json().catch(() => ({}));
      const cfg: any = j?.config || {};
      const processingFeePct = Math.max(0, Number(cfg?.processingFeePct || 0));
      const taxCfg: any = cfg?.taxConfig || {};
      const defCode = typeof taxCfg?.defaultJurisdictionCode === "string" ? taxCfg.defaultJurisdictionCode : "";
      const list: any[] = Array.isArray(taxCfg?.jurisdictions) ? taxCfg.jurisdictions : [];
      let rate = 0;
      const hasDefault = !!defCode;
      if (defCode) {
        const jur: any = list.find((x: any) => x.code === defCode);
        if (jur) {
          const comps: any[] = Array.isArray(jur.components) ? jur.components : [];
          if (comps.length) rate = comps.reduce((s, c) => s + Math.max(0, Math.min(1, Number(c.rate || 0))), 0);
          else rate = Math.max(0, Math.min(1, Number(jur.rate || 0)));
        }
      }
      const basePlatformFeePct = typeof cfg?.basePlatformFeePct === "number" ? cfg.basePlatformFeePct : 0.5;
      return { processingFeePct, basePlatformFeePct, taxRate: rate, hasDefault };
    } catch {
      return { processingFeePct: 0, basePlatformFeePct: 0.5, taxRate: 0, hasDefault: false };
    }
  }

  async function addUploadedImages(urls: string[]) {
    try {
      if (!Array.isArray(urls) || urls.length === 0) return;
      const merged = [...images, ...urls].filter(Boolean);
      const limited = merged.slice(0, 3);
      setImages(limited);
      setImagesError("");
    } catch (e: any) {
      setImagesError(e?.message || "Failed to add images");
    }
  }

  async function uploadRemoteUrl(url: string): Promise<{ hi: string; thumb: string } | null> {
    try {
      const fd = new FormData();
      fd.append("url", url);
      const r = await fetch("/api/inventory/images", { method: "POST", credentials: "include", cache: "no-store", headers: { "x-wallet": account?.address || "" }, body: fd });
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j?.images) ? j.images : [];
      if (!arr.length) return null;
      const first = arr[0];
      return { hi: String(first.url || ""), thumb: String(first.thumbUrl || "") };
    } catch {
      return null;
    }
  }

  function handleDeleteImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSetPrimary(idx: number) {
    setImages((prev) => moveToFront(prev, idx));
  }

  function openFilePicker() {
    try { fileInputRef.current?.click(); } catch { }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dt = e.dataTransfer;
    const files = dt?.files;
    if (files && files.length) {
      await handleImageFiles(files as any);
      return;
    }
    const uri = dt?.getData("text/uri-list") || dt?.getData("text/plain");
    const url = (uri || "").trim();
    if (url) {
      try {
        const up = await uploadRemoteUrl(url);
        if (!up) throw new Error("Upload failed");
        await addUploadedImages([up.hi]);
      } catch (err: any) {
        setImagesError(err?.message || "Failed to add image from URL");
      }
    }
  }

  async function handleAddUrl() {
    const url = (imageUrl || "").trim();
    if (!url) return;
    try {
      const up = await uploadRemoteUrl(url);
      if (!up) throw new Error("Upload failed");
      await addUploadedImages([up.hi]);
      setImageUrl("");
    } catch (err: any) {
      setImagesError(err?.message || "Failed to add image from URL");
    }
  }


  async function handleImageFiles(files: FileList | null) {
    try {
      const existing = images || [];
      const capacity = Math.max(0, 3 - existing.length);
      const list = Array.from(files || []).slice(0, capacity);
      if (!list.length) return;
      const fd = new FormData();
      for (const f of list) fd.append("file", f);
      const r = await fetch("/api/inventory/images", { method: "POST", credentials: "include", cache: "no-store", headers: { "x-wallet": account?.address || "" }, body: fd });
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j?.images) ? j.images : [];
      const urls = arr.map((x: any) => String(x?.url || "")).filter(Boolean);
      if (!urls.length) throw new Error(j?.error || "Upload failed");
      await addUploadedImages(urls);
    } catch (e: any) {
      setImagesError(e?.message || "Failed to upload images");
    }
  }

  // EDIT modal image helpers
  async function addUploadedImagesEdit(urls: string[]) {
    try {
      if (!Array.isArray(urls) || urls.length === 0) return;
      const merged = [...(editImages || []), ...urls].filter(Boolean);
      const limited = merged.slice(0, 3);
      setEditImages(limited);
      setEditImagesError("");
    } catch (e: any) {
      setEditImagesError(e?.message || "Failed to add images");
    }
  }
  async function uploadRemoteUrlEdit(url: string): Promise<{ hi: string; thumb: string } | null> {
    try {
      const fd = new FormData();
      fd.append("url", url);
      const r = await fetch("/api/inventory/images", { method: "POST", credentials: "include", cache: "no-store", headers: { "x-wallet": account?.address || "" }, body: fd });
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j?.images) ? j.images : [];
      if (!arr.length) return null;
      const first = arr[0];
      return { hi: String(first.url || ""), thumb: String(first.thumbUrl || "") };
    } catch {
      return null;
    }
  }
  function openEditFilePicker() {
    try { editFileInputRef.current?.click(); } catch { }
  }
  function handleEditDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setEditIsDragging(true);
  }
  function handleEditDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setEditIsDragging(false);
  }
  async function handleEditDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setEditIsDragging(false);
    const dt = e.dataTransfer;
    const files = dt?.files;
    if (files && files.length) {
      await handleEditImageFiles(files as any);
      return;
    }
    const uri = dt?.getData("text/uri-list") || dt?.getData("text/plain");
    const url = (uri || "").trim();
    if (url) {
      try {
        const up = await uploadRemoteUrlEdit(url);
        if (!up) throw new Error("Upload failed");
        await addUploadedImagesEdit([up.hi]);
      } catch (err: any) {
        setEditImagesError(err?.message || "Failed to add image from URL");
      }
    }
  }
  async function handleEditAddUrl() {
    const url = (editImageUrl || "").trim();
    if (!url) return;
    try {
      const up = await uploadRemoteUrlEdit(url);
      if (!up) throw new Error("Upload failed");
      await addUploadedImagesEdit([up.hi]);
      setEditImageUrl("");
    } catch (err: any) {
      setEditImagesError(err?.message || "Failed to add image from URL");
    }
  }
  async function handleEditImageFiles(files: FileList | null) {
    try {
      const existing = editImages || [];
      const capacity = Math.max(0, 3 - existing.length);
      const list = Array.from(files || []).slice(0, capacity);
      if (!list.length) return;
      const fd = new FormData();
      for (const f of list) fd.append("file", f);
      const r = await fetch("/api/inventory/images", { method: "POST", credentials: "include", cache: "no-store", headers: { "x-wallet": account?.address || "" }, body: fd });
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j?.images) ? j.images : [];
      const urls = arr.map((x: any) => String(x?.url || "")).filter(Boolean);
      if (!urls.length) throw new Error(j?.error || "Upload failed");
      await addUploadedImagesEdit(urls);
    } catch (e: any) {
      setEditImagesError(e?.message || "Failed to upload images");
    }
  }
  function handleEditDeleteImage(idx: number) {
    setEditImages((prev) => (prev || []).filter((_, i) => i !== idx));
  }
  function handleEditSetPrimary(idx: number) {
    setEditImages((prev) => moveToFront(prev || [], idx));
  }

  async function refresh(opts?: { resetPage?: boolean; pageOverride?: number }) {
    try {
      setLoading(true);
      setError("");
      const url = new URL("/api/inventory", window.location.origin);
      // Apply query params if provided
      const qpPage = typeof opts?.pageOverride === "number" ? Math.max(0, Math.floor(opts!.pageOverride!)) : (opts?.resetPage ? 0 : Math.max(0, Math.floor(page)));
      const qTrim = (q || "").trim();
      const catTrim = (categoryFilter || "").trim();
      const tagsTrim = (tagsFilter || "").trim();

      if (qTrim) url.searchParams.set("q", qTrim);
      if (catTrim) url.searchParams.set("category", catTrim);
      if (taxableFilter !== "any") url.searchParams.set("taxable", taxableFilter);
      if (stockFilter !== "any") url.searchParams.set("stock", stockFilter);
      if (priceMin !== "") {
        const v = Number(priceMin);
        if (Number.isFinite(v) && v >= 0) url.searchParams.set("priceMin", String(v));
      }
      if (priceMax !== "") {
        const v = Number(priceMax);
        if (Number.isFinite(v) && v >= 0) url.searchParams.set("priceMax", String(v));
      }
      if (tagsTrim) url.searchParams.set("tags", tagsTrim);
      url.searchParams.set("tagsMode", tagsMode);
      if (packFilter && packFilter !== "any") url.searchParams.set("pack", packFilter);
      url.searchParams.set("sort", sortField || "updatedAt");
      url.searchParams.set("order", sortOrder || "desc");
      url.searchParams.set("limit", String(Math.max(1, Math.floor(limit || 1))));
      url.searchParams.set("page", String(qpPage));

      const r = await fetch(url.toString(), { headers: { "x-wallet": account?.address || "" }, credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
      setItems(arr);
      setTotal(Number.isFinite(Number(j?.total)) ? Number(j.total) : arr.length);
      if (Number.isFinite(Number(j?.page))) setPage(Math.max(0, Math.floor(Number(j.page))));
      if (Number.isFinite(Number(j?.pageSize))) setLimit(Math.max(1, Math.floor(Number(j.pageSize))));
      if (j?.degraded) setError(j?.reason || "Degraded; using in-memory data");
    } catch (e: any) {
      setError(e?.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

  function goToPage(next: number) {
    const np = Math.max(0, Math.floor(next));
    setPage(np);
    // Use override to avoid stale state race
    refresh({ pageOverride: np });
  }

  useEffect(() => {
    refresh();
  }, [account?.address]);

  // Debounced refresh when filters change
  useEffect(() => {
    try {
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current as any);
      }
      fetchDebounceRef.current = window.setTimeout(() => {
        refresh({ resetPage: true });
      }, 300) as any;
    } catch { }
    return () => {
      try {
        if (fetchDebounceRef.current) {
          clearTimeout(fetchDebounceRef.current as any);
        }
      } catch { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categoryFilter, taxableFilter, stockFilter, priceMin, priceMax, tagsFilter, tagsMode, sortField, sortOrder, limit, account?.address]);

  useEffect(() => {
    if (addOpen) {
      (async () => setSiteMeta(await fetchSiteMeta()))();
    }
  }, [addOpen, account?.address]);

  useEffect(() => {
    if (editOpenInv) {
      (async () => setSiteMeta(await fetchSiteMeta()))();
    }
  }, [editOpenInv, account?.address]);

  async function addItem() {
    try {
      setError("");
      const attrs = (() => {
        try {
          const obj = JSON.parse(attributesJson || "{}");
          return obj && typeof obj === "object" ? obj : {};
        } catch {
          return {};
        }
      })();

      // Package industry-specific data into attributes based on active pack
      const industryAttrs: Record<string, any> = {};

      if (activeIndustryPack === 'restaurant') {
        if (modifierGroups.length) industryAttrs.modifierGroups = modifierGroups;
        if (dietaryTags.length) industryAttrs.dietaryTags = dietaryTags;
        if (spiceLevel > 0) industryAttrs.spiceLevel = spiceLevel;
        if (prepTime) industryAttrs.prepTime = prepTime;
        if (calories !== undefined) industryAttrs.calories = calories;
        if (ingredients) industryAttrs.ingredients = ingredients;
      } else if (activeIndustryPack === 'retail') {
        if (variationGroups.length) industryAttrs.variationGroups = variationGroups;
        if (variants.length) industryAttrs.variants = variants;
      } else if (activeIndustryPack === 'hotel') {
        industryAttrs.isRoomType = isRoomType;
        if (pricePerNight !== undefined) industryAttrs.pricePerNight = pricePerNight;
        if (maxOccupancy !== undefined) industryAttrs.maxOccupancy = maxOccupancy;
        if (amenities.length) industryAttrs.amenities = amenities;
        if (rooms.length) industryAttrs.rooms = rooms;
      } else if (activeIndustryPack === 'freelancer') {
        industryAttrs.pricingType = pricingType;
        industryAttrs.pricingAmount = pricingAmount;
        if (minHours !== undefined) industryAttrs.minHours = minHours;
        if (billingCycle) industryAttrs.billingCycle = billingCycle;
        if (deliveryTime) industryAttrs.deliveryTime = deliveryTime;
        if (revisionsIncluded !== undefined) industryAttrs.revisionsIncluded = revisionsIncluded;
        if (skillLevel) industryAttrs.skillLevel = skillLevel;
        if (serviceCategory) industryAttrs.serviceCategory = serviceCategory;
        if (deliverables.length) industryAttrs.deliverables = deliverables;
        if (requirements.length) industryAttrs.requirements = requirements;
        if (addOns.length) industryAttrs.addOns = addOns;
      } else if (activeIndustryPack === 'publishing') {
        if (pubTitle) industryAttrs.title = pubTitle;
        if (pubAuthor) industryAttrs.author = pubAuthor;
        if (pubPublisher) industryAttrs.publisher = pubPublisher;
        if (pubIsbn) industryAttrs.isbn = pubIsbn;
        if (pubDate) industryAttrs.publicationDate = pubDate;
        if (pubFormat) industryAttrs.format = pubFormat;
        if (pubPageCount) industryAttrs.pageCount = pubPageCount;
        if (pubLanguage) industryAttrs.language = pubLanguage;
        if (pubEdition) industryAttrs.edition = pubEdition;
        if (pubGenres.length) industryAttrs.genre = pubGenres;
        if (pubCondition) industryAttrs.condition = pubCondition;
        if (pubDownloadUrl) industryAttrs.downloadUrl = pubDownloadUrl;
        if (pubPreviewUrl) industryAttrs.previewUrl = pubPreviewUrl;
        industryAttrs.drmEnabled = pubDrm;
      }

      const payload = {
        sku, name,
        priceUsd: Math.max(0, Number(priceUsd || 0)),
        currency,
        stockQty: infiniteStock ? -1 : Math.max(0, Number(stockQty || 0)),
        category: category || undefined,
        description: description || undefined,
        tags: (tags || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 12),
        images: (images || []).slice(0, 3),
        attributes: { ...attrs, ...industryAttrs },
        costUsd: typeof costUsd === "number" ? Math.max(0, costUsd) : undefined,
        taxable,
        industryPack: activeIndustryPack || 'general',
      };
      const r = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to add item");
        return;
      }
      setSku(""); setName(""); setPriceUsd(0); setCurrency("USD"); setStockQty(0);
      setCategory(""); setDescription(""); setTags(""); setAttributesJson("{}");
      setCostUsd(undefined); setTaxable(true); setJurisdictionCode(""); setImages([]);
      setAddOpen(false);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to add item");
    }
  }

  async function deleteItem(id: string) {
    try {
      setError("");
      const url = new URL("/api/inventory", window.location.origin);
      url.searchParams.set("id", id);
      const r = await fetch(url.toString(), { method: "DELETE", headers: { "x-wallet": account?.address || "" }, credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to delete item");
        return;
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to delete item");
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-pane rounded-xl border p-5 space-y-4 hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Add Inventory Item</h2>
          <button className="px-3 py-1.5 rounded-md border text-sm" onClick={() => refresh({ resetPage: true })} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="microtext text-muted-foreground">SKU</label>
            <div className="mt-1 flex items-center gap-2">
              <input className="flex-1 h-9 px-3 py-1 border rounded-md bg-background" value={sku} onChange={(e) => setSku(String(e.target.value || "").toUpperCase().slice(0, 16))} />
              <button
                type="button"
                onClick={() => setSku(generateUniqueSku())}
                className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                title="Auto-generate SKU"
                aria-label="Auto-generate SKU"
              >
                <Wand2 className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Name</label>
            <input className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Price (USD)</label>
            <input type="number" min={0} step={0.01} className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={priceUsd} onChange={(e) => setPriceUsd(Number(e.target.value || 0))} />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Stock Qty</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                className="h-9 w-40 px-3 py-1 border rounded-md bg-background"
                value={infiniteStock ? "" : Number(stockQty || 0)}
                onChange={(e) => setStockQty(Math.max(0, Math.floor(Number(e.target.value || 0))))}
                disabled={infiniteStock}
                placeholder={infiniteStock ? "∞" : ""}
                title={infiniteStock ? "Infinite stock" : "Stock quantity"}
              />
              <InfinitySwitch checked={infiniteStock} onChange={setInfiniteStock} />
            </div>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Category</label>
            <input className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Tags (comma‑separated)</label>
            <input className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="microtext text-muted-foreground">Description</label>
            <textarea className="mt-1 w-full h-20 px-3 py-2 border rounded-md bg-background" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="microtext text-muted-foreground">Attributes (JSON)</label>
            <textarea className="mt-1 w-full h-24 px-3 py-2 border rounded-md bg-background font-mono text-xs" value={attributesJson} onChange={(e) => setAttributesJson(e.target.value)} />
            <div className="microtext text-muted-foreground mt-1">Include analytics‑ready fields (e.g., {`{"size":"L","color":"Blue","bundle":"B1"}`})</div>
          </div>
          <div className="md:col-span-2">
            <label className="microtext text-muted-foreground">Images (up to 3)</label>

            {/* Hidden file input */}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleImageFiles(e.target.files)}
            />

            {/* Toolbar: pick files + paste URL */}
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={openFilePicker}
                className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                title="Choose files"
                aria-label="Choose files"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-1">
                <input
                  className="h-9 w-56 px-3 py-1 border rounded-md bg-background"
                  placeholder="Paste image URL…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddUrl();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddUrl}
                  className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                  title="Add from URL"
                  aria-label="Add from URL"
                >
                  <LinkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Drag & drop area */}
            <div
              className={`mt-2 rounded-md border border-dashed p-3 text-xs ${isDragging ? "bg-foreground/5" : "bg-background"}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              Drag & drop up to 3 images here, click the icon to select files, or add via URL above.
            </div>

            {/* Thumbnails with controls */}
            <div className="mt-2 flex items-center gap-3">
              {(images || []).map((src, idx) => (
                <div key={idx} className="relative">
                  <Thumbnail src={src} alt={`thumb-${idx}`} size={56} />
                  <div className="mt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(idx)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                      title={idx === 0 ? "Primary image" : "Set as primary"}
                      aria-label={idx === 0 ? "Primary image" : "Set as primary"}
                    >
                      {idx === 0 ? <Star className="h-4 w-4 text-amber-500" /> : <StarOff className="h-4 w-4 text-foreground/60" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(idx)}
                      className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                      title="Remove"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
              {(images || []).length === 0 && (
                <div className="text-xs text-muted-foreground">No images added yet.</div>
              )}
            </div>

            {imagesError && <div className="microtext text-red-500 mt-1">{imagesError}</div>}
            <div className="microtext text-muted-foreground mt-1">
              Images are optimized to WebP and capped at 1500x1500. A 256x256 thumbnail is used for previews. First image is primary.
            </div>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Cost (USD)</label>
            <input type="number" min={0} step={0.01} className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={typeof costUsd === "number" ? costUsd : "" as any} onChange={(e) => setCostUsd(e.target.value === "" ? undefined : Number(e.target.value || 0))} />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Taxable</label>
            <div className="mt-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" role="switch" aria-checked={taxable} checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
                <span>{taxable ? "Taxable" : "Non-taxable"}</span>
              </label>
            </div>
          </div>
        </div>
        {error && <div className="microtext text-red-500">{error}</div>}
        <div className="flex items-center justify-end">
          <button className="px-3 py-1.5 rounded-md border text-sm" onClick={addItem}>Add Item</button>
        </div>
      </div>

      <div className="glass-pane rounded-xl border p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Inventory</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-muted/20 rounded-lg border p-1 mr-2">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-background shadow text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-background shadow text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={openAdd}
              className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
              title="Add item"
              aria-label="Add item"
            >
              <Plus className="h-5 w-5" />
            </button>
            {activeIndustryPack === 'restaurant' && (
              <button
                type="button"
                onClick={() => setToastImportOpen(true)}
                className="px-3 py-1.5 rounded-md border text-sm flex items-center gap-2 hover:bg-foreground/5"
                title="Import from Toast POS"
              >
                <Download className="h-4 w-4" />
                Import from Toast
              </button>
            )}
            <button className="px-3 py-1.5 rounded-md border text-sm" onClick={() => refresh()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Search / Filter / Sort controls */}
        <div className="mb-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="microtext text-muted-foreground">Search</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              placeholder="SKU, name, description, tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Category</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              placeholder="e.g., Apparel"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Taxable</label>
            <select
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={taxableFilter}
              onChange={(e) => setTaxableFilter(e.target.value as any)}
            >
              <option value="any">Any</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Stock</label>
            <select
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
            >
              <option value="any">Any</option>
              <option value="in">In Stock</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Industry Pack</label>
            <select
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={packFilter}
              onChange={(e) => setPackFilter(e.target.value)}
            >
              <option value="any">Any</option>
              <option value="general">General</option>
              <option value="restaurant">Restaurant</option>
              <option value="retail">Retail</option>
              <option value="hotel">Hotel</option>
              <option value="freelancer">Freelancer</option>
              <option value="publishing">Publishing</option>
            </select>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Price Min</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Price Max</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Tags</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              placeholder="comma-separated (e.g., blue,summer)"
              value={tagsFilter}
              onChange={(e) => setTagsFilter(e.target.value)}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Tags Mode</label>
            <select
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={tagsMode}
              onChange={(e) => setTagsMode(e.target.value as any)}
            >
              <option value="any">Any match</option>
              <option value="all">Require all</option>
            </select>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Sort Field</label>
            <select
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
            >
              <option value="updatedAt">Updated</option>
              <option value="createdAt">Created</option>
              <option value="priceUsd">Price</option>
              <option value="stockQty">Stock</option>
              <option value="name">Name</option>
              <option value="sku">SKU</option>
              <option value="category">Category</option>
            </select>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Order</label>
            <select
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Page Size</label>
            <input
              type="number"
              min={1}
              step={1}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.floor(Number(e.target.value || 1))))}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="w-full h-9 rounded-md border text-sm"
              onClick={() => {
                setQ("");
                setCategoryFilter("");
                setTaxableFilter("any");
                setStockFilter("any");
                setPackFilter("any");
                setPriceMin("");
                setPriceMax("");
                setTagsFilter("");
                setTagsMode("any");
                setSortField("updatedAt");
                setSortOrder("desc");
                setPage(0);
                refresh({ resetPage: true });
              }}
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Pagination summary and controls */}
        <div className="microtext text-muted-foreground mb-2 flex items-center justify-between">
          <span>
            {(() => {
              const start = page * limit + (items.length ? 1 : 0);
              const end = page * limit + items.length;
              return `Showing ${items.length ? `${start}-${end}` : "0"} of ${total}`;
            })()}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded-md border text-xs"
              onClick={() => goToPage(Math.max(0, page - 1))}
              disabled={page <= 0 || loading}
            >
              Prev
            </button>
            <span>Page {page + 1}</span>
            <button
              className="px-2 py-1 rounded-md border text-xs"
              onClick={() => goToPage(page + 1)}
              disabled={(page + 1) * limit >= total || loading}
            >
              Next
            </button>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {(items || []).map((it) => (
              <div key={it.id} className="group relative bg-muted/40 backdrop-blur-md rounded-xl border p-3 hover:shadow-lg hover:border-primary/20 transition-all flex flex-col">
                <div className="aspect-square w-full bg-muted/20 rounded-lg mb-2 overflow-hidden relative border flex items-center justify-center">
                  <Thumbnail src={(Array.isArray(it.images) && it.images.length ? it.images[0] : undefined)} alt="" size={400} style={{ width: "100%", height: "100%" }} className="w-full h-full object-contain transition-transform group-hover:scale-105" />
                  {Number(it.stockQty) === 0 && !Number(it.stockQty) && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-500/90 text-white text-xs font-bold rounded-full">Out of Stock</div>
                  )}
                </div>
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <h3 className="font-bold text-sm line-clamp-1" title={it.name}>{it.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{it.sku}</p>
                  </div>
                  <button
                    onClick={() => openEditItem(it)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-background border rounded-md shadow-sm hover:text-primary"
                    title="Edit"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
                <div className="mt-auto pt-2 border-t flex justify-between items-center text-sm">
                  <span className="font-bold">
                    {(() => {
                      const usdPrice = Number(it.priceUsd || 0);
                      const itemCurrency = it.currency || storeCurrency;
                      if (itemCurrency === "USD") return `$${usdPrice.toFixed(2)}`;
                      // ... simpler conversion display for grid
                      return `$${usdPrice.toFixed(2)}`;
                    })()}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${Number(it.stockQty) > 0 || Number(it.stockQty) === -1 ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-red-500/10 text-red-600 border-red-500/20"}`}>
                    {Number(it.stockQty) === -1 ? "∞" : `${it.stockQty} Left`}
                  </span>
                </div>
              </div>
            ))}
            {(items || []).length === 0 && (
              <div className="col-span-full py-20 text-center text-muted-foreground">
                No items found.
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-background/40 backdrop-blur-md transition-colors hover:bg-muted/60 data-[state=selected]:bg-muted">
                  <th className="text-left px-3 py-2 font-medium">SKU</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Price ({storeCurrency})</th>
                  <th className="text-left px-3 py-2 font-medium">Stock</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-left px-3 py-2 font-medium">Pack</th>
                  <th className="text-left px-3 py-2 font-medium">Taxable</th>
                  <th className="text-left px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(items || []).map((it) => (
                  <tr key={it.id} className="border-b transition-colors hover:bg-primary/5 data-[state=selected]:bg-muted group">
                    <td className="px-3 py-2 font-mono">{it.sku}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Thumbnail src={(Array.isArray(it.images) && it.images.length ? it.images[0] : undefined)} alt="" size={40} />
                        <span>{it.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">{(() => {
                      const usdPrice = Number(it.priceUsd || 0);
                      const itemCurrency = it.currency || storeCurrency;
                      if (itemCurrency === "USD") return `$${usdPrice.toFixed(2)}`;
                      const usdRate = Number(usdRates[itemCurrency] || 0);
                      const converted = usdRate > 0
                        ? roundForCurrency(usdPrice * usdRate, itemCurrency)
                        : convertFromUsd(usdPrice, itemCurrency, rates);
                      const display = converted > 0 ? formatCurrency(converted, itemCurrency) : `$${usdPrice.toFixed(2)}`;
                      return itemCurrency !== "USD" ? (
                        <span title={`USD equivalent: $${usdPrice.toFixed(2)}`}>{display}</span>
                      ) : display;
                    })()}</td>
                    <td className="px-3 py-2">{Number(it.stockQty) === -1 ? "∞" : Number(it.stockQty || 0)}</td>
                    <td className="px-3 py-2">{it.category || "—"}</td>
                    <td className="px-3 py-2">
                      {(() => {
                        const pack = String(it.industryPack || "general");
                        const colors: Record<string, string> = {
                          general: "bg-gray-100 text-gray-700 border-gray-200",
                          restaurant: "bg-orange-100 text-orange-700 border-orange-200",
                          retail: "bg-blue-100 text-blue-700 border-blue-200",
                          hotel: "bg-purple-100 text-purple-700 border-purple-200",
                          freelancer: "bg-green-100 text-green-700 border-green-200",
                          publishing: "bg-pink-100 text-pink-700 border-pink-200",
                        };
                        const colorClass = colors[pack] || colors.general;
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${colorClass}`}>
                            {pack}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">{it.taxable ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button className="px-2 py-1 rounded-md border text-xs" onClick={() => openEditItem(it)}>Edit</button>
                        <button className="px-2 py-1 rounded-md border text-xs" onClick={() => deleteItem(it.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!items || items.length === 0) && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                      No inventory items yet. Use the form above to add items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {addOpen && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4">
            <div className="w-full max-w-3xl md:max-w-4xl max-h-[90vh] overflow-y-auto rounded-md border bg-background p-4 relative z-[100001]">
              <button
                onClick={closeAdd}
                className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                title="Close"
                aria-label="Close add item modal"
              >
                ✕
              </button>
              <div className="text-lg font-semibold mb-2">Add Inventory Item</div>
              <div className="mb-2 rounded-md border p-2 bg-foreground/5">
                <div className="text-sm font-medium">Industry Pack: <span className="text-blue-600">{activeIndustryPack || 'general'}</span></div>
                <div className="microtext text-muted-foreground">Fields below are tailored for the {activeIndustryPack || 'general'} industry pack</div>
              </div>
              <div className="mb-2">
                <label className="microtext text-muted-foreground">Currency</label>
                <select
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="microtext text-muted-foreground">SKU</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input className="flex-1 h-9 px-3 py-1 border rounded-md bg-background" value={sku} onChange={(e) => setSku(String(e.target.value || "").toUpperCase().slice(0, 16))} />
                    <button
                      type="button"
                      onClick={() => setSku(generateUniqueSku())}
                      className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                      title="Auto-generate SKU"
                      aria-label="Auto-generate SKU"
                    >
                      <Wand2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Name</label>
                  <input className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Price (USD)</label>
                  <input type="number" min={0} step={0.01} className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={priceUsd} onChange={(e) => setPriceUsd(Number(e.target.value || 0))} />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Stock Qty</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="h-9 w-40 px-3 py-1 border rounded-md bg-background"
                      value={infiniteStock ? "" as any : Number(stockQty || 0)}
                      onChange={(e) => setStockQty(Math.max(0, Math.floor(Number(e.target.value || 0))))}
                      disabled={infiniteStock}
                      placeholder={infiniteStock ? "∞" : ""}
                      title={infiniteStock ? "Infinite stock" : "Stock quantity"}
                    />
                    <InfinitySwitch checked={infiniteStock} onChange={setInfiniteStock} />
                  </div>
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Category</label>
                  <input className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Tags (comma‑separated)</label>
                  <input className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={tags} onChange={(e) => setTags(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Description</label>
                  <textarea className="mt-1 w-full h-20 px-3 py-2 border rounded-md bg-background" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Attributes (JSON)</label>
                  <textarea className="mt-1 w-full h-24 px-3 py-2 border rounded-md bg-background font-mono text-xs" value={attributesJson} onChange={(e) => setAttributesJson(e.target.value)} />
                  <div className="microtext text-muted-foreground mt-1">Include analytics‑ready fields (e.g., {"{"}"size":"L","color":"Blue","bundle":"B1"{"}"})</div>
                </div>
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Images (up to 3)</label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleImageFiles(e.target.files)}
                  />

                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                      title="Choose files"
                      aria-label="Choose files"
                    >
                      <ImagePlus className="h-5 w-5" />
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        className="h-9 w-56 px-3 py-1 border rounded-md bg-background"
                        placeholder="Paste image URL…"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddUrl();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddUrl}
                        className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                        title="Add from URL"
                        aria-label="Add from URL"
                      >
                        <LinkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`mt-2 rounded-md border border-dashed p-3 text-xs ${isDragging ? "bg-foreground/5" : "bg-background"}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    Drag & drop up to 3 images here, click the icon to select files, or add via URL above.
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    {(images || []).map((src, idx) => (
                      <div key={idx} className="relative">
                        <Thumbnail src={src} alt={`thumb-${idx}`} size={56} />
                        <div className="mt-1 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(idx)}
                            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                            title={idx === 0 ? "Primary image" : "Set as primary"}
                            aria-label={idx === 0 ? "Primary image" : "Set as primary"}
                          >
                            {idx === 0 ? <Star className="h-4 w-4 text-amber-500" /> : <StarOff className="h-4 w-4 text-foreground/60" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteImage(idx)}
                            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                            title="Remove"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(images || []).length === 0 && (
                      <div className="text-xs text-muted-foreground">No images added yet.</div>
                    )}
                  </div>

                  {imagesError && <div className="microtext text-red-500 mt-1">{imagesError}</div>}
                  <div className="microtext text-muted-foreground mt-1">
                    Images are optimized to WebP and capped at 1500x1500. A 256x256 thumbnail is used for previews. First image is primary.
                  </div>
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Cost (USD)</label>
                  <input type="number" min={0} step={0.01} className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background" value={typeof costUsd === "number" ? costUsd : "" as any} onChange={(e) => setCostUsd(e.target.value === "" ? undefined : Number(e.target.value || 0))} />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Taxable</label>
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" role="switch" aria-checked={taxable} checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />
                      <span>{taxable ? "Taxable" : "Non-taxable"}</span>
                    </label>
                  </div>
                </div>

                {/* Industry-Specific Fields */}
                {activeIndustryPack === 'restaurant' && (
                  <RestaurantFields
                    modifierGroups={modifierGroups}
                    setModifierGroups={setModifierGroups}
                    dietaryTags={dietaryTags}
                    setDietaryTags={setDietaryTags}
                    spiceLevel={spiceLevel}
                    setSpiceLevel={setSpiceLevel}
                    prepTime={prepTime}
                    setPrepTime={setPrepTime}
                    calories={calories}
                    setCalories={setCalories}
                    ingredients={ingredients}
                    setIngredients={setIngredients}
                  />
                )}

                {activeIndustryPack === 'retail' && (
                  <RetailFields
                    baseSku={sku}
                    variationGroups={variationGroups}
                    setVariationGroups={setVariationGroups}
                    variants={variants}
                    setVariants={setVariants}
                  />
                )}

                {activeIndustryPack === 'hotel' && (
                  <HotelFields
                    isRoomType={isRoomType}
                    setIsRoomType={setIsRoomType}
                    pricePerNight={pricePerNight}
                    setPricePerNight={setPricePerNight}
                    maxOccupancy={maxOccupancy}
                    setMaxOccupancy={setMaxOccupancy}
                    amenities={amenities}
                    setAmenities={setAmenities}
                    rooms={rooms}
                    setRooms={setRooms}
                  />
                )}

                {activeIndustryPack === 'freelancer' && (
                  <FreelancerFields
                    pricingType={pricingType}
                    setPricingType={setPricingType}
                    pricingAmount={pricingAmount}
                    setPricingAmount={setPricingAmount}
                    minHours={minHours}
                    setMinHours={setMinHours}
                    billingCycle={billingCycle}
                    setBillingCycle={setBillingCycle}
                    deliveryTime={deliveryTime}
                    setDeliveryTime={setDeliveryTime}
                    revisionsIncluded={revisionsIncluded}
                    setRevisionsIncluded={setRevisionsIncluded}
                    skillLevel={skillLevel}
                    setSkillLevel={setSkillLevel}
                    serviceCategory={serviceCategory}
                    setServiceCategory={setServiceCategory}
                    deliverables={deliverables}
                    setDeliverables={setDeliverables}
                    requirements={requirements}
                    setRequirements={setRequirements}
                    addOns={addOns}
                    setAddOns={setAddOns}
                  />
                )}

                {activeIndustryPack === 'publishing' && (
                  <PublishingFields
                    title={pubTitle} setTitle={setPubTitle}
                    author={pubAuthor} setAuthor={setPubAuthor}
                    publisher={pubPublisher} setPublisher={setPubPublisher}
                    isbn={pubIsbn} setIsbn={setPubIsbn}
                    publicationDate={pubDate} setPublicationDate={setPubDate}
                    format={pubFormat as PublishingFormat} setFormat={(v) => setPubFormat(v)}
                    pageCount={pubPageCount} setPageCount={setPubPageCount}
                    language={pubLanguage} setLanguage={setPubLanguage}
                    edition={pubEdition} setEdition={setPubEdition}
                    genres={pubGenres} setGenres={setPubGenres}
                    condition={pubCondition as BookCondition} setCondition={(v) => setPubCondition(v)}
                    downloadUrl={pubDownloadUrl} setDownloadUrl={setPubDownloadUrl}
                    previewUrl={pubPreviewUrl} setPreviewUrl={setPubPreviewUrl}
                    drmEnabled={pubDrm} setDrmEnabled={setPubDrm}
                  />
                )}
              </div>
              {(() => {
                const price = Math.max(0, Number(priceUsd || 0));
                const hasDefault = !!siteMeta.hasDefault;
                const taxRate = taxable && hasDefault ? Math.max(0, Math.min(1, Number(siteMeta.taxRate || 0))) : 0;
                const tax = price * taxRate;
                const feePctFraction = Math.max(0, ((Number(siteMeta.basePlatformFeePct || 0.5) + Number(siteMeta.processingFeePct || 0)) / 100));
                const processingFee = (price + tax) * feePctFraction;
                const total = price + tax + processingFee;
                const hasCost = typeof costUsd === "number";
                const cost = hasCost ? Math.max(0, Number(costUsd || 0)) : 0;
                const netProfit = hasCost ? (total - cost) : null;
                return (
                  <div className="mt-3 rounded-md border p-3">
                    <div className="text-sm font-medium mb-2">Totals</div>
                    {!hasDefault && (
                      <div className="microtext text-amber-600 mb-2">
                        Please set tax domain to calculate taxes
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="microtext text-muted-foreground">Price (before taxes/fees)</span>
                        <span className="text-sm font-medium">{formatCurrency(price, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="microtext text-muted-foreground">
                          Tax {taxable && hasDefault ? `(${(Math.round(taxRate * 10000) / 100).toFixed(2)}%)` : ""}
                        </span>
                        <span className="text-sm font-medium">{formatCurrency(tax, currency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="microtext text-muted-foreground">
                          Processing Fee ({(Number(siteMeta.basePlatformFeePct || 0.5) + Number(siteMeta.processingFeePct || 0)).toFixed(2)}%)
                        </span>
                        <span className="text-sm font-medium">{formatCurrency(processingFee, currency)}</span>
                      </div>
                      <div className="h-px bg-border my-1" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Total (after taxes & fees)</span>
                        <span className="text-sm font-semibold">{formatCurrency(total, currency)}</span>
                      </div>
                      {hasCost && (
                        <div className="flex items-center justify-between">
                          <span className="microtext text-muted-foreground">Net Profit</span>
                          <span className="text-sm font-medium">{formatCurrency(Number(netProfit || 0), currency)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {error && <div className="microtext text-red-500 mt-2">{error}</div>}
              <div className="mt-3 flex items-center justify-end">
                <button className="px-3 py-1.5 rounded-md border text-sm" onClick={addItem}>Add Item</button>
              </div>
            </div>
          </div>,
          document.body
        ) : null}
      {toastImportOpen && typeof window !== "undefined"
        ? createPortal(
          <ToastImportModal
            open={toastImportOpen}
            onClose={() => setToastImportOpen(false)}
            onImport={async (imported: any[]) => {
              try {
                setLoading(true);
                const results = await Promise.allSettled(
                  (imported || []).map(async (it: any) => {
                    const attrs = (it?.industryAttributes?.restaurant || {}) as Record<string, any>;
                    const payload = {
                      sku: String(it?.sku || "").toUpperCase().slice(0, 16),
                      name: String(it?.name || ""),
                      priceUsd: Math.max(0, Number(it?.price || 0)),
                      currency: storeCurrency || "USD",
                      stockQty: -1,
                      category: it?.category || undefined,
                      description: it?.description || undefined,
                      tags: [],
                      images: [],
                      attributes: attrs,
                      taxable: true,
                      industryPack: "restaurant" as const,
                    };
                    const r = await fetch("/api/inventory", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
                      credentials: "include",
                      cache: "no-store",
                      body: JSON.stringify(payload),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to add item");
                  })
                );
                const failed = results.filter((res: any) => res.status === "rejected");
                if (failed.length) {
                  setError(`Imported with ${failed.length} error(s).`);
                } else {
                  setError("");
                }
              } catch (e: any) {
                setError(e?.message || "Import failed");
              } finally {
                try { await refresh({ resetPage: true }); } catch { }
                setToastImportOpen(false);
                setLoading(false);
              }
            }}
          />,
          document.body
        )
        : null}
      {editOpenInv && editTarget && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4">
            <div className="w-full max-w-3xl md:max-w-4xl max-h-[90vh] overflow-y-auto rounded-md border bg-background p-4 relative z-[100001]">
              <button
                onClick={closeEditItem}
                className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                title="Close"
                aria-label="Close edit item modal"
              >
                ✕
              </button>
              <div className="text-lg font-semibold mb-2">Edit Inventory Item — {editSku}</div>
              <div className="mb-2">
                <label className="microtext text-muted-foreground">Industry Pack</label>
                <select
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  value={editIndustryPack}
                  onChange={(e) => setEditIndustryPack(e.target.value as any)}
                >
                  <option value="general">General</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="retail">Retail</option>
                  <option value="hotel">Hotel</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="publishing">Publishing</option>
                </select>
                <div className="microtext text-muted-foreground mt-1">
                  Change the industry pack to reclassify this item. Fields below will update accordingly.
                </div>
              </div>
              <div className="mb-2">
                <label className="microtext text-muted-foreground">Currency</label>
                <select
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  value={editCurrency}
                  onChange={(e) => setEditCurrency(e.target.value)}
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="microtext text-muted-foreground">SKU</label>
                  <input
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    value={editSku}
                    onChange={(e) => setEditSku(String(e.target.value || "").toUpperCase().slice(0, 16))}
                  />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Name</label>
                  <input
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Price (USD)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    value={editPriceUsd}
                    onChange={(e) => setEditPriceUsd(Math.max(0, Number(e.target.value || 0)))}
                  />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Stock Qty</label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="h-9 w-40 px-3 py-1 border rounded-md bg-background"
                      value={editInfinite ? ("" as any) : Number(editStockQty || 0)}
                      onChange={(e) => setEditStockQty(Math.max(0, Math.floor(Number(e.target.value || 0))))}
                      disabled={editInfinite}
                      placeholder={editInfinite ? "∞" : ""}
                      title={editInfinite ? "Infinite stock" : "Stock quantity"}
                    />
                    <InfinitySwitch checked={editInfinite} onChange={setEditInfinite} />
                  </div>
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Category</label>
                  <input
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                  />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Tags (comma‑separated)</label>
                  <input
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Owner Wallet (Admin Override)</label>
                  <input
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background font-mono text-xs"
                    value={editWallet}
                    onChange={(e) => setEditWallet(e.target.value)}
                    placeholder="0x..."
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Changing this transfers ownership.</p>
                </div>
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Description</label>
                  <textarea
                    className="mt-1 w-full h-20 px-3 py-2 border rounded-md bg-background"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Attributes (JSON)</label>
                  <textarea
                    className="mt-1 w-full h-24 px-3 py-2 border rounded-md bg-background font-mono text-xs"
                    value={editAttributesJson}
                    onChange={(e) => setEditAttributesJson(e.target.value)}
                  />
                  <div className="microtext text-muted-foreground mt-1">
                    Include analytics‑ready fields (e.g., {"{"}"size":"L","color":"Blue","bundle":"B1"{"}"})
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="microtext text-muted-foreground">Images (up to 3)</label>
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleEditImageFiles(e.target.files)}
                  />
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openEditFilePicker}
                      className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                      title="Choose files"
                      aria-label="Choose files"
                    >
                      <ImagePlus className="h-5 w-5" />
                    </button>
                    <div className="flex items-center gap-1">
                      <input
                        className="h-9 w-56 px-3 py-1 border rounded-md bg-background"
                        placeholder="Paste image URL…"
                        value={editImageUrl}
                        onChange={(e) => setEditImageUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleEditAddUrl();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleEditAddUrl}
                        className="h-9 w-9 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                        title="Add from URL"
                        aria-label="Add from URL"
                      >
                        <LinkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`mt-2 rounded-md border border-dashed p-3 text-xs ${editIsDragging ? "bg-foreground/5" : "bg-background"}`}
                    onDragOver={handleEditDragOver}
                    onDragLeave={handleEditDragLeave}
                    onDrop={handleEditDrop}
                  >
                    Drag & drop up to 3 images here, click the icon to select files, or add via URL above.
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    {(editImages || []).map((src, idx) => (
                      <div key={idx} className="relative">
                        <Thumbnail src={src} alt={`thumb-${idx}`} size={56} />
                        <div className="mt-1 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleEditSetPrimary(idx)}
                            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                            title={idx === 0 ? "Primary image" : "Set as primary"}
                            aria-label={idx === 0 ? "Primary image" : "Set as primary"}
                          >
                            {idx === 0 ? <Star className="h-4 w-4 text-amber-500" /> : <StarOff className="h-4 w-4 text-foreground/60" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditDeleteImage(idx)}
                            className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-foreground/5"
                            title="Remove"
                            aria-label="Remove"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(editImages || []).length === 0 && (
                      <div className="text-xs text-muted-foreground">No images added yet.</div>
                    )}
                  </div>

                  {editImagesError && <div className="microtext text-red-500 mt-1">{editImagesError}</div>}
                  <div className="microtext text-muted-foreground mt-1">
                    Images are optimized to WebP and capped at 1500x1500. A 256x256 thumbnail is used for previews. First image is primary.
                  </div>
                </div>

                <div>
                  <label className="microtext text-muted-foreground">Cost (USD)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                    value={typeof editCostUsd === "number" ? editCostUsd : "" as any}
                    onChange={(e) => setEditCostUsd(e.target.value === "" ? undefined : Number(e.target.value || 0))}
                  />
                </div>
                <div>
                  <label className="microtext text-muted-foreground">Taxable</label>
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked={!!editTarget?.taxable}
                        checked={!!editTarget?.taxable}
                        onChange={(e) =>
                          setEditTarget((prev) => (prev ? { ...prev, taxable: e.target.checked } : prev))
                        }
                      />
                      <span>{editTarget?.taxable ? "Taxable" : "Non-taxable"}</span>
                    </label>
                  </div>
                </div>

                {/* Industry-Specific Fields */}
                {editIndustryPack === 'restaurant' && (
                  <RestaurantFields
                    modifierGroups={editModifierGroups}
                    setModifierGroups={setEditModifierGroups}
                    dietaryTags={editDietaryTags}
                    setDietaryTags={setEditDietaryTags}
                    spiceLevel={editSpiceLevel}
                    setSpiceLevel={setEditSpiceLevel}
                    prepTime={editPrepTime}
                    setPrepTime={setEditPrepTime}
                    calories={editCalories}
                    setCalories={setEditCalories}
                    ingredients={editIngredients}
                    setIngredients={setEditIngredients}
                  />
                )}

                {editIndustryPack === 'retail' && (
                  <RetailFields
                    baseSku={editSku}
                    variationGroups={editVariationGroups}
                    setVariationGroups={setEditVariationGroups}
                    variants={editVariants}
                    setVariants={setEditVariants}
                  />
                )}

                {editIndustryPack === 'hotel' && (
                  <HotelFields
                    isRoomType={editIsRoomType}
                    setIsRoomType={setEditIsRoomType}
                    pricePerNight={editPricePerNight}
                    setPricePerNight={setEditPricePerNight}
                    maxOccupancy={editMaxOccupancy}
                    setMaxOccupancy={setEditMaxOccupancy}
                    amenities={editAmenities}
                    setAmenities={setEditAmenities}
                    rooms={editRooms}
                    setRooms={setEditRooms}
                  />
                )}

                {editIndustryPack === 'freelancer' && (
                  <FreelancerFields
                    pricingType={editPricingType}
                    setPricingType={setEditPricingType}
                    pricingAmount={editPricingAmount}
                    setPricingAmount={setEditPricingAmount}
                    minHours={editMinHours}
                    setMinHours={setEditMinHours}
                    billingCycle={editBillingCycle}
                    setBillingCycle={setEditBillingCycle}
                    deliveryTime={editDeliveryTime}
                    setDeliveryTime={setEditDeliveryTime}
                    revisionsIncluded={editRevisionsIncluded}
                    setRevisionsIncluded={setEditRevisionsIncluded}
                    skillLevel={editSkillLevel}
                    setSkillLevel={setEditSkillLevel}
                    serviceCategory={editServiceCategory}
                    setServiceCategory={setEditServiceCategory}
                    deliverables={editDeliverables}
                    setDeliverables={setEditDeliverables}
                    requirements={editRequirements}
                    setRequirements={setEditRequirements}
                    addOns={editAddOns}
                    setAddOns={setEditAddOns}
                  />
                )}

                {editIndustryPack === 'publishing' && (<>
                  <PublishingFields
                    title={editPubTitle} setTitle={setEditPubTitle}
                    author={editPubAuthor} setAuthor={setEditPubAuthor}
                    publisher={editPubPublisher} setPublisher={setEditPubPublisher}
                    isbn={editPubIsbn} setIsbn={setEditPubIsbn}
                    publicationDate={editPubDate} setPublicationDate={setEditPubDate}
                    format={editPubFormat as PublishingFormat} setFormat={(v) => setEditPubFormat(v)}
                    pageCount={editPubPageCount} setPageCount={setEditPubPageCount}
                    language={editPubLanguage} setLanguage={setEditPubLanguage}
                    edition={editPubEdition} setEdition={setEditPubEdition}
                    genres={editPubGenres} setGenres={setEditPubGenres}
                    condition={editPubCondition as BookCondition} setCondition={(v) => setEditPubCondition(v)}
                    downloadUrl={editPubDownloadUrl} setDownloadUrl={setEditPubDownloadUrl}
                    previewUrl={editPubPreviewUrl} setPreviewUrl={setEditPubPreviewUrl}
                    drmEnabled={editPubDrm} setDrmEnabled={setEditPubDrm}
                  />
                  <div className="mt-4 border-t pt-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editIsBook}
                        onChange={e => setEditIsBook(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-medium text-sm">Is Book / E-book</span>
                    </label>
                    <p className="text-xs text-muted-foreground ml-5 mt-1">Check this to ensure it appears in Writer's Workshop.</p>
                  </div>
                </>
                )}
              </div>

              {(() => {
                const price = Math.max(0, Number(editPriceUsd || 0));
                const hasDefault = !!siteMeta.hasDefault;
                const isTaxable = !!editTarget?.taxable;
                const taxRate = isTaxable && hasDefault ? Math.max(0, Math.min(1, Number(siteMeta.taxRate || 0))) : 0;
                const tax = price * taxRate;
                const feePctFraction = Math.max(0, ((Number(siteMeta.basePlatformFeePct || 0.5) + Number(siteMeta.processingFeePct || 0)) / 100));
                const processingFee = (price + tax) * feePctFraction;
                const total = price + tax + processingFee;
                const hasCost = typeof editCostUsd === "number";
                const cost = hasCost ? Math.max(0, Number(editCostUsd || 0)) : 0;
                const netProfit = hasCost ? (total - cost) : null;
                return (
                  <div className="mt-3 rounded-md border p-3">
                    <div className="text-sm font-medium mb-2">Totals</div>
                    {!hasDefault && (
                      <div className="microtext text-amber-600 mb-2">
                        Please set tax domain to calculate taxes
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="microtext text-muted-foreground">Price (before taxes/fees)</span>
                        <span className="text-sm font-medium">{formatCurrency(price, editCurrency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="microtext text-muted-foreground">
                          Tax {isTaxable && hasDefault ? `(${(Math.round(taxRate * 10000) / 100).toFixed(2)}%)` : ""}
                        </span>
                        <span className="text-sm font-medium">{formatCurrency(tax, editCurrency)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="microtext text-muted-foreground">
                          Processing Fee ({(Number(siteMeta.basePlatformFeePct || 0.5) + Number(siteMeta.processingFeePct || 0)).toFixed(2)}%)
                        </span>
                        <span className="text-sm font-medium">{formatCurrency(processingFee, editCurrency)}</span>
                      </div>
                      <div className="h-px bg-border my-1" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Total (after taxes & fees)</span>
                        <span className="text-sm font-semibold">{formatCurrency(total, editCurrency)}</span>
                      </div>
                      {hasCost && (
                        <div className="flex items-center justify-between">
                          <span className="microtext text-muted-foreground">Net Profit</span>
                          <span className="text-sm font-medium">{formatCurrency(Number(netProfit || 0), editCurrency)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {error && <div className="microtext text-red-500 mt-2">{error}</div>}
              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={closeEditItem} className="px-3 py-1.5 rounded-md border text-sm">Cancel</button>
                <button onClick={saveEditItem} disabled={editSaving} className="px-3 py-1.5 rounded-md border text-sm">
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        ) : null
      }
    </div >
  );
}

/** ---------------- Terminal Panel ---------------- */
function TerminalPanel() {
  const account = useActiveAccount();
  const operatorWallet = (account?.address || "").toLowerCase();
  const shortWallet = React.useMemo(() => {
    const w = operatorWallet;
    return w ? `${w.slice(0, 6)}…${w.slice(-4)}` : "(not connected)";
  }, [operatorWallet]);

  // Wizard state
  const [itemLabel, setItemLabel] = useState<string>("");
  const [amountStr, setAmountStr] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [terminalCurrency, setTerminalCurrency] = useState<string>("USD");

  // FX rates for conversion
  const [rates, setRates] = useState<Record<string, number>>({});
  const [usdRates, setUsdRates] = useState<Record<string, number>>({});

  // Site meta for tax & fee
  const [siteMeta, setSiteMeta] = useState<{ processingFeePct: number; basePlatformFeePct: number; taxRate: number; hasDefault: boolean; storeCurrency?: string }>({
    processingFeePct: 0,
    basePlatformFeePct: 0.5,
    taxRate: 0,
    hasDefault: false,
  });

  async function fetchSiteMeta(): Promise<{ processingFeePct: number; basePlatformFeePct: number; taxRate: number; hasDefault: boolean; storeCurrency?: string }> {
    try {
      const r = await fetch("/api/site/config", { headers: { "x-wallet": account?.address || "" } });
      const j = await r.json().catch(() => ({}));
      const cfg: any = j?.config || {};
      const processingFeePct = Math.max(0, Number(cfg?.processingFeePct || 0));
      const taxCfg: any = cfg?.taxConfig || {};
      const defCode = typeof taxCfg?.defaultJurisdictionCode === "string" ? taxCfg.defaultJurisdictionCode : "";
      const list: any[] = Array.isArray(taxCfg?.jurisdictions) ? taxCfg.jurisdictions : [];
      let rate = 0;
      const hasDefault = !!defCode;
      if (defCode) {
        const jur: any = list.find((x: any) => x.code === defCode);
        if (jur) {
          const comps: any[] = Array.isArray(jur.components) ? jur.components : [];
          if (comps.length) rate = comps.reduce((s, c) => s + Math.max(0, Math.min(1, Number(c.rate || 0))), 0);
          else rate = Math.max(0, Math.min(1, Number(jur.rate || 0)));
        }
      }
      const storeCurrency = typeof cfg?.storeCurrency === "string" ? cfg.storeCurrency : undefined;
      const basePlatformFeePct = typeof cfg?.basePlatformFeePct === "number" ? cfg.basePlatformFeePct : 0.5;
      return { processingFeePct, basePlatformFeePct, taxRate: rate, hasDefault, storeCurrency };
    } catch {
      return { processingFeePct: 0, basePlatformFeePct: 0.5, taxRate: 0, hasDefault: false };
    }
  }

  useEffect(() => {
    (async () => setSiteMeta(await fetchSiteMeta()))();
  }, [account?.address]);

  useEffect(() => {
    try {
      const sc = String((siteMeta as any)?.storeCurrency || "");
      if (sc) setTerminalCurrency(sc);
    } catch { }
  }, [siteMeta?.storeCurrency]);

  // Fetch FX rates when currency changes
  useEffect(() => {
    (async () => {
      try {
        const [ethRatesData, usdRatesData] = await Promise.all([
          fetchEthRates().catch(() => ({})),
          fetchUsdRates().catch(() => ({})),
        ]);
        setRates(ethRatesData);
        setUsdRates(usdRatesData);
      } catch { }
    })();
  }, [terminalCurrency]);

  // Amount helpers
  function parseAmount(): number {
    const v = Number(amountStr || "0");
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }
  function appendDigit(d: string) {
    setAmountStr((prev) => {
      const next = (prev || "") + d;
      // Clamp to two decimals
      const parts = next.split(".");
      if (parts.length > 2) return prev || "";
      if (parts.length === 2 && parts[1].length > 2) return prev || "";
      return next.replace(/[^\d.]/g, "");
    });
  }
  function backspace() {
    setAmountStr((prev) => (prev || "").slice(0, -1));
  }
  function clearAmount() {
    setAmountStr("");
  }

  // Totals computation in USD (canonical)
  const baseUsd = parseAmount();
  const taxRate = siteMeta.hasDefault ? Math.max(0, Math.min(1, siteMeta.taxRate || 0)) : 0;
  const taxUsd = +(baseUsd * taxRate).toFixed(2);
  const feePctFraction = Math.max(0, ((Number(siteMeta.basePlatformFeePct || 0.5) + Number(siteMeta.processingFeePct || 0)) / 100));
  const processingFeeUsd = +((baseUsd + taxUsd) * feePctFraction).toFixed(2);
  const totalUsd = +((baseUsd + taxUsd + processingFeeUsd)).toFixed(2);

  // Convert to display currency
  const baseConverted = React.useMemo(() => {
    if (terminalCurrency === "USD") return baseUsd;
    const usdRate = Number(usdRates[terminalCurrency] || 0);
    if (usdRate > 0) return roundForCurrency(baseUsd * usdRate, terminalCurrency);
    const converted = convertFromUsd(baseUsd, terminalCurrency, rates);
    return converted > 0 ? roundForCurrency(converted, terminalCurrency) : baseUsd;
  }, [baseUsd, terminalCurrency, usdRates, rates]);

  const taxConverted = React.useMemo(() => {
    if (terminalCurrency === "USD") return taxUsd;
    const usdRate = Number(usdRates[terminalCurrency] || 0);
    if (usdRate > 0) return roundForCurrency(taxUsd * usdRate, terminalCurrency);
    const converted = convertFromUsd(taxUsd, terminalCurrency, rates);
    return converted > 0 ? roundForCurrency(converted, terminalCurrency) : taxUsd;
  }, [taxUsd, terminalCurrency, usdRates, rates]);

  const processingFeeConverted = React.useMemo(() => {
    if (terminalCurrency === "USD") return processingFeeUsd;
    const usdRate = Number(usdRates[terminalCurrency] || 0);
    if (usdRate > 0) return roundForCurrency(processingFeeUsd * usdRate, terminalCurrency);
    const converted = convertFromUsd(processingFeeUsd, terminalCurrency, rates);
    return converted > 0 ? roundForCurrency(converted, terminalCurrency) : processingFeeUsd;
  }, [processingFeeUsd, terminalCurrency, usdRates, rates]);

  const totalConverted = React.useMemo(() => {
    if (terminalCurrency === "USD") return totalUsd;
    const usdRate = Number(usdRates[terminalCurrency] || 0);
    if (usdRate > 0) return roundForCurrency(totalUsd * usdRate, terminalCurrency);
    const converted = convertFromUsd(totalUsd, terminalCurrency, rates);
    return converted > 0 ? roundForCurrency(converted, terminalCurrency) : totalUsd;
  }, [totalUsd, terminalCurrency, usdRates, rates]);

  // Generated receipt + QR modal + polling
  const [qrOpen, setQrOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<number | null>(null);
  function terminalIsSettled(s?: string) {
    const v = String(s || "").toLowerCase();
    return (
      v === "paid" ||
      v === "checkout_success" ||
      v === "reconciled" ||
      v === "tx_mined" ||
      v === "recipient_validated" ||
      v.includes("refund")
    );
  }
  function stopPolling() {
    try {
      if (pollRef.current) {
        clearInterval(pollRef.current as any);
        pollRef.current = null;
      }
    } catch { }
    setPolling(false);
  }
  async function startPolling(receiptId: string) {
    stopPolling();
    setPolling(true);
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}`, { cache: "no-store", credentials: "include" });
        const j = await r.json().catch(() => ({}));
        const rec = j?.receipt;
        if (rec) {
          setSelected(rec);
          if (terminalIsSettled(rec.status)) {
            stopPolling();
            setCompleteOpen(true);
          }
        }
      } catch { }
    }, 2000) as any;
  }
  useEffect(() => {
    return () => stopPolling();
  }, []);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const portalUrl = selected ? `${origin}/portal/${encodeURIComponent(selected.receiptId)}?recipient=${encodeURIComponent(operatorWallet)}&t_text=%23ffffff` : "";

  // Completion modal
  const [completeOpen, setCompleteOpen] = useState(false);

  async function generateTerminalReceipt() {
    try {
      setLoading(true);
      setError("");
      const amt = parseAmount();
      if (!operatorWallet || !/^0x[a-f0-9]{40}$/i.test(operatorWallet)) {
        setError("Connect your wallet");
        return;
      }
      if (!(amt > 0)) {
        setError("Enter an amount");
        return;
      }
      const payload = {
        amountUsd: +amt.toFixed(2),
        label: (itemLabel || "").trim() || "Terminal Payment",
        currency: terminalCurrency,
      };
      const r = await fetch("/api/receipts/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": operatorWallet },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to generate receipt");
        return;
      }
      const rec = j.receipt;
      setSelected(rec);
      setQrOpen(true);
      startPolling(String(rec?.receiptId || ""));
    } catch (e: any) {
      setError(e?.message || "Failed to generate receipt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-pane rounded-xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Terminal</h2>
        <span className="microtext text-muted-foreground">Wizard: amount → QR → pay → print</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-md border p-3">
          <div className="text-sm font-medium mb-2">Enter Details</div>
          <div className="space-y-2">
            <div>
              <label className="microtext text-muted-foreground">Item name (optional)</label>
              <input
                className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                placeholder="e.g., Custom Charge"
                value={itemLabel}
                onChange={(e) => setItemLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="microtext text-muted-foreground">Amount ({terminalCurrency})</label>
              <div className="mt-1 rounded-md border p-3">
                <div className="text-2xl font-bold text-center">{formatCurrency(parseAmount(), terminalCurrency)}</div>
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", ".", "⌫"].map((d, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="h-10 rounded-md border text-sm hover:bg-foreground/5"
                      onClick={() => {
                        if (d === "⌫") backspace();
                        else if (d === ".") appendDigit(".");
                        else appendDigit(d);
                      }}
                    >
                      {d}
                    </button>
                  ))}
                  <button type="button" className="col-span-3 h-9 rounded-md border text-xs" onClick={clearAmount}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="microtext text-muted-foreground mt-1">Tap to enter quickly. Max 2 decimal places.</div>
            </div>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="text-sm font-medium mb-2">Summary</div>
          <div>
            <label className="microtext text-muted-foreground">Currency</label>
            <select
              className="mt-1 mb-2 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={terminalCurrency}
              onChange={(e) => setTerminalCurrency(e.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          {!siteMeta.hasDefault && (
            <div className="microtext text-amber-600 mb-2">Set a default tax jurisdiction to apply taxes.</div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="microtext text-muted-foreground">Base</span>
              <span className="text-sm font-medium">{formatCurrency(baseConverted, terminalCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="microtext text-muted-foreground">Tax {siteMeta.hasDefault ? `(${(Math.round(taxRate * 10000) / 100).toFixed(2)}%)` : ""}</span>
              <span className="text-sm font-medium">{formatCurrency(taxConverted, terminalCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="microtext text-muted-foreground">Processing Fee ({(Number(siteMeta.basePlatformFeePct || 0.5) + Number(siteMeta.processingFeePct || 0)).toFixed(2)}%)</span>
              <span className="text-sm font-medium">{formatCurrency(processingFeeConverted, terminalCurrency)}</span>
            </div>
            <div className="h-px bg-border my-1" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-semibold">{formatCurrency(totalConverted, terminalCurrency)}</span>
            </div>
            {terminalCurrency !== "USD" && (
              <div className="flex items-center justify-between">
                <span className="microtext text-muted-foreground">Equivalent (USD)</span>
                <span className="microtext text-muted-foreground">${totalUsd.toFixed(2)}</span>
              </div>
            )}
          </div>
          {error && <div className="microtext text-red-500 mt-2">{error}</div>}
          <div className="mt-3">
            <button
              className="w-full px-3 py-2 rounded-md border text-sm"
              onClick={generateTerminalReceipt}
              disabled={loading || !(baseUsd > 0) || !operatorWallet}
              title="Generate QR and receipt"
            >
              {loading ? "Generating…" : "Next — Generate QR"}
            </button>
          </div>
        </div>
      </div>

      {qrOpen && selected && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4 print-no-bg print-static">
            <div className="w-full max-w-sm rounded-md border bg-background p-4 relative">
              <button
                onClick={() => { setQrOpen(false); }}
                className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                title="Close"
                aria-label="Close terminal QR"
              >
                ✕
              </button>
              <div className="text-lg font-semibold mb-2">Present to Buyer</div>
              <div className="thermal-paper relative mx-auto">
                <div className="grid place-items-center my-2">
                  <QRCodeCanvas value={portalUrl} size={140} includeMargin fgColor="#000000" bgColor="#ffffff" />
                </div>
                <div className="thermal-footer">Scan to pay or visit</div>
                <div className="thermal-footer" style={{ wordBreak: "break-all" }}>{portalUrl}</div>
                <div className="thermal-rule" />
                <div className="space-y-1">
                  <div className="thermal-row"><span>Receipt #</span><span>{selected.receiptId}</span></div>
                  <div className="thermal-row"><span>Operator</span><span>{shortWallet}</span></div>
                  <div className="thermal-row">
                    <span>Total ({selected.currency || "USD"})</span>
                    <span>{(() => {
                      const curr = selected.currency || "USD";
                      const total = Number(selected.totalUsd || 0);
                      if (curr === "USD") return `$${total.toFixed(2)}`;
                      const usdRate = Number(usdRates[curr] || 0);
                      const converted = usdRate > 0
                        ? roundForCurrency(total * usdRate, curr)
                        : convertFromUsd(total, curr, rates);
                      return converted > 0 ? formatCurrency(converted, curr) : `$${total.toFixed(2)}`;
                    })()}</span>
                  </div>
                  {selected.currency && selected.currency !== "USD" && (
                    <div className="thermal-row microtext">
                      <span>Equivalent (USD)</span>
                      <span>${Number(selected.totalUsd || 0).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="thermal-actions print-hidden">
                <button onClick={() => { try { window.print(); } catch { } }} className="receipt-button">Print Receipt</button>
                <button onClick={() => { try { navigator.clipboard.writeText(portalUrl); } catch { } }} className="receipt-button">Copy Link</button>
                <button onClick={() => { try { const w = window.open(portalUrl, "_blank", "noopener,noreferrer"); w?.focus(); } catch { } }} className="receipt-button">Open Portal</button>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}

      {completeOpen && selected && typeof window !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[100000] bg-black/50 grid place-items-center p-4">
            <div className="w-full max-w-sm rounded-md border bg-background p-4 relative">
              <button
                onClick={() => setCompleteOpen(false)}
                className="absolute right-2 top-2 h-8 w-8 rounded-full border bg-white text-black shadow-sm flex items-center justify-center"
                title="Close"
                aria-label="Close payment complete modal"
              >
                ✕
              </button>
              <div className="text-lg font-semibold mb-2">Payment Complete</div>
              <div className="microtext text-muted-foreground mb-2">
                Receipt {selected.receiptId} has been settled.
              </div>
              <div className="flex items-center justify-end gap-2">
                <button className="px-3 py-1.5 rounded-md border text-sm" onClick={() => { try { window.print(); } catch { } }}>
                  Print Receipt
                </button>
                <button className="px-3 py-1.5 rounded-md border text-sm" onClick={() => { try { navigator.clipboard.writeText(portalUrl); } catch { } }}>
                  Copy Link
                </button>
                <button className="px-3 py-1.5 rounded-md border text-sm" onClick={() => { try { const w = window.open(portalUrl, "_blank", "noopener,noreferrer"); w?.focus(); } catch { } }}>
                  Open Portal
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

// ---------------- Orders Tab ----------------
function OrdersPanel() {
  const account = useActiveAccount();
  const brand = useBrand();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [jurisdictionCode, setJurisdictionCode] = useState("");
  const [taxRateOverride, setTaxRateOverride] = useState<string>("");
  const [brandName, setBrandName] = useState<string>(() => getDefaultBrandName((brand as any)?.key));
  const [jurisdictions, setJurisdictions] = useState<TaxCatalogEntry[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [processingFeePct, setProcessingFeePct] = useState<number>(0);
  const [basePlatformFeePct, setBasePlatformFeePct] = useState<number>(0.5);

  // Filter and view state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [stockFilter, setStockFilter] = useState<"all" | "in" | "out">("all");
  const [sortBy, setSortBy] = useState<"name" | "price" | "stock">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"list" | "details" | "categories">("list");

  // Filtered and sorted available items
  const availableItems = useMemo(() => {
    let items = (inventory || []).filter((it) => Number(selectedQty[it.id] || 0) === 0);

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((it) =>
        it.name.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        (it.description || "").toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoryFilter) {
      items = items.filter((it) => it.category === categoryFilter);
    }

    // Stock filter
    if (stockFilter === "in") {
      items = items.filter((it) => {
        const stock = Number(it.stockQty);
        return stock === -1 || stock > 0;
      });
    } else if (stockFilter === "out") {
      items = items.filter((it) => {
        const stock = Number(it.stockQty);
        return stock !== -1 && stock <= 0;
      });
    }

    // Sort
    items.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === "price") {
        comparison = Number(a.priceUsd || 0) - Number(b.priceUsd || 0);
      } else if (sortBy === "stock") {
        const aStock = Number(a.stockQty) === -1 ? 999999 : Number(a.stockQty || 0);
        const bStock = Number(b.stockQty) === -1 ? 999999 : Number(b.stockQty || 0);
        comparison = aStock - bStock;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return items;
  }, [inventory, selectedQty, searchQuery, categoryFilter, stockFilter, sortBy, sortOrder]);

  // Cart items (unchanged)
  const cartItems = useMemo(
    () => (inventory || []).filter((it) => Number(selectedQty[it.id] || 0) > 0),
    [inventory, selectedQty]
  );

  // Get unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set<string>();
    inventory.forEach((it) => {
      if (it.category) cats.add(it.category);
    });
    return Array.from(cats).sort();
  }, [inventory]);

  // Group items by category for categories view
  const itemsByCategory = useMemo(() => {
    const grouped = new Map<string, InventoryItem[]>();
    availableItems.forEach((it) => {
      const cat = it.category || "Uncategorized";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(it);
    });
    return grouped;
  }, [availableItems]);

  async function loadInventory() {
    try {
      const r = await fetch("/api/inventory", { headers: { "x-wallet": account?.address || "" }, credentials: "include", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setInventory(Array.isArray(j?.items) ? j.items : []);
    } catch { }
  }

  async function loadBrand() {
    try {
      const r = await fetch("/api/site/config", { headers: { "x-wallet": account?.address || "" } });
      const j = await r.json().catch(() => ({}));
      setBrandName(j?.config?.theme?.brandName || getDefaultBrandName((brand as any)?.key));
      setProcessingFeePct(Math.max(0, Number(j?.config?.processingFeePct || 0)));
      setBasePlatformFeePct(typeof j?.config?.basePlatformFeePct === "number" ? Number(j.config.basePlatformFeePct) : 0.5);
      const list: TaxCatalogEntry[] = Array.isArray(j?.config?.taxConfig?.jurisdictions) ? j.config.taxConfig.jurisdictions : [];
      setJurisdictions(list);
      const defJ = j?.config?.taxConfig?.defaultJurisdictionCode;
      if (typeof defJ === "string" && defJ) {
        setJurisdictionCode(defJ);
        const jur = list.find(x => x.code === defJ);
        const comps = Array.isArray(jur?.components) ? jur!.components : [];
        setSelectedComponents(comps.map(c => c.code));
      }
    } catch { }
  }

  useEffect(() => {
    loadInventory();
    loadBrand();
  }, [account?.address]);

  // Default-select all components when jurisdiction changes
  useEffect(() => {
    const jur = (jurisdictions || []).find(j => j.code === jurisdictionCode);
    const comps = Array.isArray(jur?.components) ? jur!.components : [];
    setSelectedComponents(comps.map(c => c.code));
  }, [jurisdictionCode, jurisdictions]);

  function toggleItem(id: string, qty: number) {
    const inv = inventory.find((x) => x.id === id);
    const rawStock = Number(inv?.stockQty);
    const maxQty = rawStock === -1 ? 999999 : Math.max(0, Number(inv?.stockQty || 0));
    const q = Math.max(0, Math.min(maxQty, Math.floor(Number(qty || 0))));
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
  }

  async function generateOrder() {
    try {
      setLoading(true);
      setError("");
      setResult(null);
      const items = Object.entries(selectedQty).map(([id, qty]) => ({ id, qty }));
      if (items.length === 0) {
        setError("Select at least one item");
        return;
      }
      const payload: any = { items };
      if (jurisdictionCode) payload.jurisdictionCode = jurisdictionCode;
      if (Array.isArray(selectedComponents) && selectedComponents.length) {
        payload.taxComponents = selectedComponents;
      }
      if (taxRateOverride !== "") {
        const v = Number(taxRateOverride);
        if (Number.isFinite(v) && v >= 0 && v <= 1) payload.taxRate = v;
      }
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setError(j?.error || "Failed to generate order");
        return;
      }
      setResult(j?.receipt);
      setSelectedQty({});
      // Optionally refresh receipts admin through event; user can refresh there
    } catch (e: any) {
      setError(e?.message || "Failed to generate order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-pane rounded-xl border p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Build Order</h2>
          <button className="px-3 py-1.5 rounded-md border text-sm" onClick={loadInventory}>
            Refresh Inventory
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Left: Inventory list with enhanced controls */}
          <div className="rounded-md border p-3">
            {/* Header with view mode toggles */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Inventory</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`h-8 w-8 rounded-md border flex items-center justify-center ${viewMode === "list" ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
                  title="List view"
                  aria-label="List view"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("details")}
                  className={`h-8 w-8 rounded-md border flex items-center justify-center ${viewMode === "details" ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
                  title="Details view"
                  aria-label="Details view"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("categories")}
                  className={`h-8 w-8 rounded-md border flex items-center justify-center ${viewMode === "categories" ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
                  title="Categories view"
                  aria-label="Categories view"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Search & Filter Controls */}
            <div className="space-y-2 mb-3">
              <input
                type="text"
                placeholder="Search items..."
                className="w-full h-9 px-3 py-1 border rounded-md bg-background text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  className="h-9 px-2 py-1 border rounded-md bg-background text-xs"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  title="Filter by category"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <select
                  className="h-9 px-2 py-1 border rounded-md bg-background text-xs"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  title="Sort by"
                >
                  <option value="name">Name</option>
                  <option value="price">Price</option>
                  <option value="stock">Stock</option>
                </select>
                <select
                  className="h-9 px-2 py-1 border rounded-md bg-background text-xs"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as any)}
                  title="Stock filter"
                >
                  <option value="all">All Stock</option>
                  <option value="in">In Stock</option>
                  <option value="out">Out of Stock</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="h-8 px-2 rounded-md border text-xs hover:bg-foreground/5"
                  title={sortOrder === "asc" ? "Sort descending" : "Sort ascending"}
                >
                  {sortOrder === "asc" ? "↑" : "↓"}
                </button>
                {(searchQuery || categoryFilter || stockFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setCategoryFilter("");
                      setStockFilter("all");
                    }}
                    className="h-8 px-2 rounded-md border text-xs hover:bg-foreground/5"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable inventory list with height limit */}
            <div className="max-h-[500px] overflow-y-auto space-y-2">
              {viewMode === "list" && (
                <>
                  {availableItems.map((it) => {
                    const rawStock = Number(it.stockQty);
                    const maxQty = rawStock === -1 ? 999999 : Math.max(0, rawStock);
                    const disabled = maxQty === 0;
                    return (
                      <div key={it.id} className="flex items-center justify-between rounded-md border p-2 hover:bg-foreground/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Thumbnail src={(Array.isArray(it.images) && it.images.length ? it.images[0] : undefined)} alt="" size={40} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{it.name}</div>
                            <div className="microtext text-muted-foreground">
                              {it.sku} • ${Number(it.priceUsd || 0).toFixed(2)} • Stock: {rawStock === -1 ? "∞" : maxQty}
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={maxQty}
                          step={1}
                          className="h-8 w-20 px-2 py-1 border rounded-md bg-background text-sm"
                          disabled={disabled}
                          placeholder="0"
                          onChange={(e) => toggleItem(it.id, Number(e.target.value || 0))}
                        />
                      </div>
                    );
                  })}
                </>
              )}

              {viewMode === "details" && (
                <>
                  {availableItems.map((it) => {
                    const rawStock = Number(it.stockQty);

                    const maxQty = rawStock === -1 ? 999999 : Math.max(0, rawStock);
                    const disabled = maxQty === 0;
                    return (
                      <div key={it.id} className="flex items-center justify-between rounded-md border p-2 hover:bg-foreground/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Thumbnail src={(Array.isArray(it.images) && it.images.length ? it.images[0] : undefined)} alt="" size={32} />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{it.name}</div>
                            <div className="microtext text-muted-foreground">
                              ${Number(it.priceUsd || 0).toFixed(2)} • Stock: {rawStock === -1 ? "∞" : maxQty}
                            </div>
                          </div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={maxQty}
                          step={1}
                          className="h-8 w-16 px-2 py-1 border rounded-md bg-background text-sm"
                          disabled={disabled}
                          placeholder="0"
                          onChange={(e) => toggleItem(it.id, Number(e.target.value || 0))}
                        />
                      </div>
                    );
                  })}

                </>
              )}

              {availableItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="text-sm">No items found</div>
                  <div className="microtext mt-1">
                    {searchQuery || categoryFilter || stockFilter !== "all"
                      ? "Try adjusting your filters"
                      : "No inventory items available"}
                  </div>
                </div>
              )}
            </div>

            {/* Footer with count */}
            <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {availableItems.length} of {(inventory || []).filter((it) => Number(selectedQty[it.id] || 0) === 0).length} items
              </span>
              {availableItems.length > 10 && (
                <span className="microtext text-muted-foreground">Scroll for more</span>
              )}
            </div>
          </div>

          {/* Right: Cart */}
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Cart</div>
            <div className="space-y-2">
              {(cartItems || []).map((it) => {
                const qty = Number(selectedQty[it.id] || 0);
                const rawStock = Number(it.stockQty);
                const maxQty = rawStock === -1 ? 999999 : Math.max(0, Number(it.stockQty || 0));
                const lineTotal = Number(it.priceUsd || 0) * qty;
                return (
                  <div key={it.id} className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Thumbnail src={(Array.isArray(it.images) && it.images.length ? it.images[0] : undefined)} alt="" size={40} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{it.name}</div>
                        <div className="microtext text-muted-foreground">
                          {it.sku} • ${Number(it.priceUsd || 0).toFixed(2)} • Stock: {rawStock === -1 ? "∞" : maxQty}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="h-8 w-8 rounded-md border"
                        onClick={() => toggleItem(it.id, qty - 1)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={maxQty}
                        step={1}
                        className="h-8 w-16 px-2 py-1 border rounded-md bg-background text-sm text-center"
                        value={qty}
                        onChange={(e) => toggleItem(it.id, Number(e.target.value || 0))}
                      />
                      <button
                        className="h-8 w-8 rounded-md border"
                        onClick={() => toggleItem(it.id, qty + 1)}
                        aria-label="Increase quantity"
                        disabled={qty >= maxQty}
                      >
                        +
                      </button>
                      <button
                        className="h-8 px-2 rounded-md border text-xs"
                        onClick={() => toggleItem(it.id, 0)}
                        aria-label="Remove from cart"
                      >
                        Remove
                      </button>
                      <span className="microtext text-muted-foreground ml-2 whitespace-nowrap">
                        ${lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {(cartItems || []).length === 0 && (
                <div className="microtext text-muted-foreground">Cart is empty. Add items from the left.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Taxes & Checkout row (separate row; stacks on mobile) */}
      <div className="glass-pane rounded-xl border p-5">
        <div className="text-sm font-medium mb-2">Taxes & Checkout</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border p-3">
            <div className="space-y-2">
              <div>
                <label className="microtext text-muted-foreground">Jurisdiction</label>
                <select
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  value={jurisdictionCode}
                  onChange={(e) => setJurisdictionCode(e.target.value)}
                >
                  <option value="">Use Default</option>
                  {(jurisdictions || []).map((j) => (
                    <option key={j.code} value={j.code}>
                      {j.name} ({Math.round((j.rate || 0) * 10000) / 100}%)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="microtext text-muted-foreground">Apply Taxes</label>
                {(() => {
                  const jur = (jurisdictions || []).find((j) => j.code === jurisdictionCode);
                  const comps = Array.isArray(jur?.components) ? jur!.components : [];
                  if (!comps.length) {
                    return (
                      <div className="microtext text-muted-foreground mt-1">
                        No component breakdown available for selected jurisdiction.
                      </div>
                    );
                  }
                  return (
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {comps.map((c) => {
                        const checked = selectedComponents.includes(c.code);
                        return (
                          <label key={c.code} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setSelectedComponents((prev) => {
                                  if (on) return Array.from(new Set([...prev, c.code]));
                                  return prev.filter((x) => x !== c.code);
                                });
                              }}
                            />
                            <span className="truncate">
                              {c.name} ({Math.round((c.rate || 0) * 10000) / 100}%)
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="microtext text-muted-foreground">Override Tax Rate (0..1)</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.0001}
                  className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
                  placeholder="Leave empty to use preset"
                  value={taxRateOverride}
                  onChange={(e) => setTaxRateOverride(e.target.value)}
                />
                <div className="microtext text-muted-foreground mt-1">
                  If set, overrides jurisdiction/component selection. Leave empty to use selected components.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3 flex flex-col">
            <div className="text-sm font-medium mb-2">Summary</div>
            {(() => {
              try {
                const itemsSubtotal = (cartItems || []).reduce((s, it) => s + Number(it.priceUsd || 0) * Number(selectedQty[it.id] || 0), 0);
                const taxableSubtotal = (cartItems || []).reduce((s, it) => s + (it.taxable ? Number(it.priceUsd || 0) * Number(selectedQty[it.id] || 0) : 0), 0);
                let taxRate = 0;
                if (taxRateOverride !== "") {
                  const v = Number(taxRateOverride);
                  if (Number.isFinite(v) && v >= 0 && v <= 1) taxRate = v;
                } else {
                  const jur = (jurisdictions || []).find((j) => j.code === jurisdictionCode);
                  const comps = Array.isArray(jur?.components) ? jur!.components : [];
                  if ((selectedComponents || []).length && comps.length) {
                    const compMap = new Map<string, number>(comps.map((c) => [String(c.code || ""), Math.max(0, Math.min(1, Number(c.rate || 0)))]));
                    taxRate = (selectedComponents || []).reduce((sum, code) => sum + (compMap.get(code) || 0), 0);
                  } else {
                    const r = Number(jur?.rate || 0);
                    if (Number.isFinite(r) && r >= 0 && r <= 1) taxRate = r;
                  }
                }
                const tax = taxableSubtotal * Math.max(0, Math.min(1, taxRate));
                const feePctFraction = Math.max(0, ((Number(basePlatformFeePct || 0.5) + Number(processingFeePct || 0)) / 100));
                const processingFee = (itemsSubtotal + tax) * feePctFraction;
                const total = itemsSubtotal + tax + processingFee;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="microtext text-muted-foreground">Items Subtotal</span>
                      <span className="text-sm font-medium">${itemsSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="microtext text-muted-foreground">Tax</span>
                      <span className="text-sm font-medium">${tax.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="microtext text-muted-foreground">Processing Fee ({(Number(basePlatformFeePct || 0.5) + Number(processingFeePct || 0)).toFixed(2)}%)</span>
                      <span className="text-sm font-medium">${processingFee.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-border my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Total</span>
                      <span className="text-sm font-semibold">${total.toFixed(2)}</span>
                    </div>
                  </div>
                );
              } catch {
                return <div className="microtext text-muted-foreground">Summary unavailable</div>;
              }
            })()}
            <div className="mt-3">
              <button
                className="w-full px-3 py-2 rounded-md border text-sm"
                onClick={generateOrder}
                disabled={
                  loading ||
                  Object.values(selectedQty || {}).reduce((s, v) => s + Number(v || 0), 0) === 0
                }
              >
                {loading ? "Generating…" : "Generate Order"}
              </button>
              {error && <div className="microtext text-red-500 mt-2">{error}</div>}
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="glass-pane rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Generated Receipt</h2>
            <span className="microtext text-muted-foreground">Brand: {brandName}</span>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-1">Receipt #{result?.receiptId}</div>
            <div className="microtext text-muted-foreground">Total: ${Number(result?.totalUsd || 0).toFixed(2)}</div>
            <div className="h-px bg-border my-2" />
            <div className="space-y-1">
              {(result?.lineItems || []).map((li: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span>{li.label}{typeof li.qty === "number" && li.qty > 1 ? ` × ${li.qty}` : ""}</span>
                  </div>
                  <span>${Number(li.priceUsd || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 microtext">
              <div>
                Jurisdiction: {result?.jurisdictionCode ? result.jurisdictionCode : "—"}
              </div>
              <div>
                Applied Tax Rate: {(() => {
                  try { return `${Math.round(Number(result?.taxRate || 0) * 10000) / 100}%`; } catch { return "—"; }
                })()}
              </div>
              {Array.isArray(result?.taxComponents) && (result?.taxComponents || []).length > 0 ? (
                <div>
                  Tax Components: {(result?.taxComponents || []).join(", ")}
                </div>
              ) : null}
            </div>
          </div>
          <div className="microtext text-muted-foreground mt-2">
            Receipt is also listed below. Use Receipts table to open QR/Portal for checkout.
          </div>
        </div>
      )
      }

      <ReceiptsAdmin />
    </div>
  );
}

// ---------------- Page ----------------
export default function AdminPage() {
  const account = useActiveAccount();
  const isConnected = !!account?.address;
  const wallet = (account?.address || "").toLowerCase();
  const isPlatform = isPlatformCtx();
  const isPartner = isPartnerCtx();
  const isSuperadmin = isPlatformSuperAdmin(wallet);
  const canMerchants = canAccessPanel("merchants", wallet);
  const canPartners = canAccessPanel("partners", wallet);
  const canBranding = canAccessPanel("branding", wallet);
  const canAdmins = canAccessPanel("admins", wallet);
  const [activeTab, setActiveTab] = useState<
    | "reserve"
    | "inventory"
    | "orders"
    | "purchases"
    | "messages"
    | "messages-buyer"
    | "messages-merchant"
    | "rewards"
    | "terminal"
    | "devices"
    | "kitchen"
    | "pms"
    | "shopSetup"
    | "profileSetup"
    | "whitelabel"
    | "withdrawal"
    | "loyalty"
    | "loyaltyConfig"
    | "users"
    | "branding"
    | "splitConfig"
    | "applications"
    | "partners"
    | "contracts"
    | "admins"
    | "seoPages"
    | "integrations"
    | "shopifyPartner"
    | "shopifyPlatform"
    | "support"
    | "supportAdmin"
    | "globalArt"
    | "delivery"
    | "writersWorkshop"
    | "publications"
    | "endpoints"
    | "team"
  >("reserve");
  const [industryPack, setIndustryPack] = useState<string | null>(null);
  const containerType = String(process.env.NEXT_PUBLIC_CONTAINER_TYPE || "platform").toLowerCase();

  // When user lands on /admin without a valid auth session but with a connected wallet,
  // proactively prompt authentication to avoid “dead clicks” or silent failures.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!wallet) return;
        const me = await fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.ok ? r.json() : { authed: false }).catch(() => ({ authed: false }));
        if (!cancelled && !me?.authed) {
          try {
            // Signal Navbar/AuthModal to open
            window.dispatchEvent(new CustomEvent("pp:auth:prompt", { detail: { preferSocial: false } }));
          } catch { }
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [wallet]);

  // Fetch industry pack to conditionally show Kitchen tab
  useEffect(() => {
    if (account?.address) {
      (async () => {
        try {
          const r = await fetch("/api/shop/config", { headers: { "x-wallet": account.address } });
          const j = await r.json().catch(() => ({}));
          setIndustryPack(j?.config?.industryPack || null);
        } catch { }
      })();
    }
  }, [account?.address]);


  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  if (!isConnected) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="glass-pane rounded-xl border p-6">
          <h1 className="text-2xl font-semibold mb-2">Admin</h1>
          <p className="microtext text-muted-foreground">
            Connect your wallet to access this page.
          </p>
          <div className="mt-3 p-3 rounded-md border microtext">
            <div className="text-muted-foreground">Wallet connection required</div>
            <div>
              Connected wallet:{" "}
              {account?.address ? (
                <TruncatedAddress address={(account?.address || "").toLowerCase()} />
              ) : (
                <code className="text-xs">(not connected)</code>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isSupportTab = activeTab === 'support' || activeTab === 'supportAdmin';

  return (
    <div className={`mx-auto pl-4 pr-4 space-y-6 pt-[204px] md:pt-[148px] pb-10 transition-all duration-300 ${isSidebarCollapsed ? 'md:pl-24' : 'md:pl-72'
      } ${isSupportTab ? '' : 'max-w-full'}`}>
      <AdminHero />
      <AdminSidebar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        industryPack={industryPack || ""}
        canBranding={canBranding}
        canMerchants={canMerchants}
        isSuperadmin={isSuperadmin}
        canAdmins={canAdmins}
        onCollapseChange={setIsSidebarCollapsed}
      />
      <div className="hidden">
        <h1 className="text-3xl font-bold">Admin</h1>
        <span className="microtext badge-soft">Admin access</span>
      </div>

      {/* Tab Navigation */}
      <div className="glass-pane rounded-xl border hidden">
        <nav className="admin-nav p-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* General */}
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "terminal" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("terminal")}
            >
              Terminal
            </button>
            {industryPack === 'restaurant' && (
              <button
                className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "kitchen" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
                onClick={() => setActiveTab("kitchen")}
              >
                Kitchen
              </button>
            )}
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "reserve" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("reserve")}
            >
              Reserve
            </button>
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "inventory" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("inventory")}
            >
              Inventory
            </button>
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "orders" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("orders")}
            >
              Orders
            </button>
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "purchases" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("purchases")}
            >
              My Purchases
            </button>
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "messages" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("messages")}
            >
              Messages
            </button>
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "loyalty" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("loyalty")}
            >
              Loyalty
            </button>
            <button
              className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm flex items-center gap-1 ${activeTab === "pms" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("pms")}
            >
              PMS
              {industryPack !== 'hotel' && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-500/20 text-gray-500 border border-gray-500/30">
                  inactive
                </span>
              )}
            </button>

            {/* Divider between General and Partner/Admin */}
            <div className="h-6 w-px bg-border mx-1" />

            {/* Partner/Admin */}
            {canBranding && (
              <button
                className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "branding" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
                onClick={() => setActiveTab("branding")}
              >
                Branding
              </button>
            )}

            {/* Divider between Partner/Admin and Platform/SuperAdmin */}
            <div className="h-6 w-px bg-border mx-1" />

            {/* Platform/SuperAdmin */}
            {canMerchants && (
              <button
                className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "users" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
                onClick={() => setActiveTab("users")}
              >
                Merchants
              </button>
            )}
            {isSuperadmin && (
              <button
                className={`px-3 py-2 md:py-1.5 min-h-[36px] whitespace-nowrap rounded-md border text-sm ${activeTab === "partners" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
                onClick={() => setActiveTab("partners")}
              >
                Partners
              </button>
            )}
          </div>

          {/* Manuals row unchanged */}
          <div className="mt-2 flex items-center gap-2">
            <span className="microtext text-muted-foreground">Manuals:</span>
            <button
              className={`px-3 py-1.5 min-h-[28px] whitespace-nowrap rounded-md border microtext text-muted-foreground ${activeTab === "shopSetup" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("shopSetup")}
              title="Shop Setup Instructions"
            >
              Shop Setup
            </button>
            <button
              className={`px-3 py-1.5 min-h-[28px] whitespace-nowrap rounded-md border microtext text-muted-foreground ${activeTab === "profileSetup" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("profileSetup")}
              title="Profile Setup Instructions"
            >
              Profile Setup
            </button>
            <button
              className={`px-3 py-1.5 min-h-[28px] whitespace-nowrap rounded-md border microtext text-muted-foreground ${activeTab === "whitelabel" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("whitelabel")}
              title="Whitelabel Instructions"
            >
              Whitelabel
            </button>
            <button
              className={`px-3 py-1.5 min-h-[28px] whitespace-nowrap rounded-md border microtext text-muted-foreground ${activeTab === "withdrawal" ? "bg-foreground/10 border-foreground/20" : "hover:bg-foreground/5"}`}
              onClick={() => setActiveTab("withdrawal")}
              title="Withdrawal Instructions"
            >
              Withdrawal Instructions
            </button>
          </div>
        </nav>
      </div>

      {/* Tabs Content */}
      {activeTab === "devices" && (
        <div className="glass-pane rounded-xl border p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Installer Packages</h2>
            <span className="microtext text-muted-foreground">
              Download branded installer ZIPs; first run registers installs
            </span>
          </div>
          <div className="microtext text-muted-foreground">
            Download the ZIP for your brand, run the included Windows .bat (adb install -r), then launch the app.
            The APK phones home on first launch to record the install in Devices.
          </div>
          <InstallerPackagesPanel />
        </div>
      )}
      {activeTab === "reserve" && <ReserveTabs />}
      {activeTab === "delivery" && <DeliveryPanel />}

      {activeTab === "withdrawal" && (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Withdrawal Instructions</h2>
            <span className="microtext text-muted-foreground">How funds flow and how to cash out</span>
          </div>
          <WithdrawalInstructionsPanel />
        </div>
      )}

      {activeTab === "shopSetup" && (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Shop Setup</h2>
            <span className="microtext text-muted-foreground">Claim slug → add inventory → share link</span>
          </div>
          <ShopSetupInstructionsPanel />
        </div>
      )}

      {activeTab === "profileSetup" && (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Profile Setup</h2>
            <span className="microtext text-muted-foreground">Customize identity & roles</span>
          </div>
          <ProfileSetupInstructionsPanel />
        </div>
      )}

      {activeTab === "whitelabel" && (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Whitelabel</h2>
            <span className="microtext text-muted-foreground">Customize the entire experience</span>
          </div>
          <WhitelabelInstructionsPanel />
        </div>
      )}

      {activeTab === "loyalty" && (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Loyalty</h2>
            <span className="microtext text-muted-foreground">Manage Rewards</span>
          </div>
          <LoyaltyPanel />
        </div>
      )}

      {activeTab === "loyaltyConfig" && (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Loyalty Configuration</h2>
            <span className="microtext text-muted-foreground">{isPlatform ? 'Platform Admin' : 'Partner Admin'}</span>
          </div>
          {isPartner ? (
            <LoyaltyPanelPartner />
          ) : (
            <LoyaltyPanelPlatform />
          )}
        </div>
      )}
      {activeTab === "integrations" && (
        <IntegrationsPanel />
      )}
      {activeTab === "branding" && (
        <BrandingPanelExt />
      )}
      {activeTab === "splitConfig" && ((canBranding && containerType === "partner") || (isPlatform && isSuperadmin)) && (
        <SplitConfigPanelExt />
      )}
      {activeTab === "applications" && isPlatform && isSuperadmin && (
        <ApplicationsPanelExt />
      )}
      {activeTab === "partners" && isPlatform && isSuperadmin && (
        <PartnerManagementPanelExt />
      )}

      {activeTab === "inventory" && (
        <InventoryPanel />
      )}

      {activeTab === "orders" && (
        <OrdersPanel />
      )}

      {activeTab === "purchases" && (
        <MyPurchasesPanelExt />
      )}

      {activeTab === "messages" && (
        <MessagesPanelExt />
      )}
      {activeTab === "messages-buyer" && (
        <MessagesPanelExt role="buyer" />
      )}
      {activeTab === "messages-merchant" && (
        <MessagesPanelExt role="merchant" />
      )}
      {activeTab === "rewards" && (
        <RewardsPanel />
      )}

      {activeTab === "terminal" && (
        <TerminalPanel />
      )}

      {activeTab === "users" && (canMerchants || canBranding || isSuperadmin) && (
        <UsersPanel />
      )}

      {activeTab === "kitchen" && industryPack === 'restaurant' && (
        <KitchenDisplayPanel />
      )}

      {activeTab === "pms" && industryPack === 'hotel' && (
        <PMSPanel />
      )}

      {activeTab === "admins" && canAdmins && (
        <AdminManagementPanel />
      )}

      {activeTab === "seoPages" && (canBranding || isSuperadmin) && (
        <SEOLandingPagesPanel />
      )}
      {activeTab === "shopifyPartner" && (canBranding || isSuperadmin) && (
        <PartnerShopifyPanel />
      )}
      {activeTab === "shopifyPlatform" && isPlatform && isSuperadmin && (
        <ShopifyIntegrationPanel />
      )}
      {activeTab === "support" && (
        <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-120px)] -mt-4 -mx-4">
          <div className="h-full bg-background/50 backdrop-blur-sm border rounded-xl overflow-hidden p-6">
            <GetSupportPanel />
          </div>
        </div>
      )}
      {activeTab === "supportAdmin" && canAdmins && (
        <div className="h-[calc(100vh-180px)] md:h-[calc(100vh-120px)] -mt-4 -mx-4">
          <div className="h-full bg-background/50 backdrop-blur-sm border rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-muted/20 shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Support Admin</h2>
                <span className="microtext text-muted-foreground">Manage support tickets</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <SupportAdminPanel />
            </div>
          </div>
        </div>
      )}
      {activeTab === "globalArt" && (
        <GlobalArtPanel />
      )}
      {activeTab === "contracts" && isPlatform && isSuperadmin && (
        <ContractsPanel />
      )}
      {activeTab === "writersWorkshop" && (
        <WritersWorkshopPanelExt />
      )}
      {activeTab === "publications" && (
        <PublicationsPanelExt />
      )}
      {activeTab === "endpoints" && (
        <EndpointsPanel />
      )}
      {activeTab === "team" && (
        <TeamPanel />
      )}
    </div>
  );
}
