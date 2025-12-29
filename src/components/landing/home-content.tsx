"use client";

import Link from "next/link";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildPortalUrlForTest } from "@/lib/receipts";
import { getRecipientAddress } from "@/lib/thirdweb/client";
import { PortalPreviewEmbedded } from "@/components/portal-preview-embedded";
import InteractiveChecklist from "@/components/ui/interactive-checklist";
import { useActiveAccount } from "thirdweb/react";
import { useTheme } from "@/contexts/ThemeContext";
import AcceptedServices from "@/components/landing/AcceptedServices";
import TechnologyPartners from "@/components/landing/TechnologyPartners";
import SiteFooter from "@/components/landing/SiteFooter";
import { useBrand } from "@/contexts/BrandContext";
import { resolveBrandSymbol, resolveBrandAppLogo, getEffectiveBrandKey } from "@/lib/branding";
import PortalPayVideo from "@/components/landing/PortalPayVideo";
import { cachedFetch } from "@/lib/client-api-cache";

type Metrics = {
  totalUsers: number;
  totalSeconds: number;
  totalSecondsAllTime?: number;
  totalSummarizedSecondsAllTime?: number;
  activeNowCount?: number;
  totalLiveSecondsNow?: number;
  topDomain: string;
  topLanguage: string;
  topPlatform?: string;
  topTopic?: string;
  sessionsCount?: number;
  averageSeconds?: number;
  sessionsCount24h?: number;
  averageSeconds24h?: number;
  xpTotal?: number;
  purchasedSecondsTotal?: number;
  p50Seconds7d?: number;
  p95Seconds7d?: number;
  receiptsCount?: number;
  receiptsTotalUsd?: number;
  receiptsCount24h?: number;
  receiptsTotalUsd24h?: number;
  averageReceiptUsd?: number;
  merchantsCount?: number;
  topCurrency?: string;
};

type SiteTheme = {
  primaryColor: string;
  secondaryColor: string;
  brandLogoUrl: string;
  brandFaviconUrl: string;
  brandName: string;
  fontFamily: string;
  receiptBackgroundUrl: string;
  brandLogoShape?: "round" | "square" | "unmasked";
  textColor?: string;
  headerTextColor?: string;
  bodyTextColor?: string;
  symbolLogoUrl?: string;
  brandKey?: string;
  navbarMode?: "symbol" | "logo";
};

type SiteConfigResponse = {
  config?: {
    theme?: Partial<SiteTheme>;
  };
  degraded?: boolean;
  reason?: string;
};

type DemoReceipt = {
  lineItems: { label: string; priceUsd: number; qty?: number }[];
  totalUsd: number;
} | null;

function fmtUSD(n?: number): string {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function HomeContent() {
  const [story, setStory] = React.useState("");
  const [storyHtml, setStoryHtml] = React.useState("");
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);
  const [containerBrandKey, setContainerBrandKey] = React.useState<string>("");
  const [containerType, setContainerType] = React.useState<string>("");
  const account = useActiveAccount();
  const brand = useBrand();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleAdminClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.authed) {
        router.push("/admin");
        return;
      }
    } catch { }

    const onLogin = () => {
      router.push("/admin");
      window.removeEventListener("pp:auth:logged_in", onLogin as any);
    };
    window.addEventListener("pp:auth:logged_in", onLogin as any);
    window.dispatchEvent(new CustomEvent("pp:auth:prompt"));
  };

  const { theme: rawTheme } = useTheme();

  // CRITICAL: When logged out on BasaltSurge, use static defaults for Live Preview
  const siteTheme = React.useMemo(() => {
    const t = rawTheme;
    const effectiveBrandKey = (t.brandKey || (brand as any)?.key || getEffectiveBrandKey()).toLowerCase();
    const isBasalt = effectiveBrandKey === "basaltsurge";
    const isLoggedIn = Boolean(account?.address);

    if (isBasalt && !isLoggedIn) {
      return {
        ...t,
        brandLogoUrl: "/BasaltSurgeWideD.png",
        brandFaviconUrl: t.brandFaviconUrl || "/favicon-32x32.png",
        symbolLogoUrl: "/BasaltSurgeD.png",
        brandName: "BasaltSurge",
        brandKey: "basaltsurge",
        navbarMode: "logo" as const,
      };
    }
    return t;
  }, [rawTheme, (brand as any)?.key, account?.address]);

  // Fetch container identity to get brandKey for partner containers
  React.useEffect(() => {
    let cancelled = false;
    cachedFetch("/api/site/container", { cache: "no-store" })
      .then((ci: any) => {
        if (cancelled) return;
        setContainerBrandKey(String(ci?.brandKey || "").trim());
        setContainerType(String(ci?.containerType || "").trim());
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  // Detect if this is a partner container
  const isPartnerContainer = React.useMemo(() => {
    const ctFromState = containerType.toLowerCase();
    const ctFromAttr = typeof document !== "undefined"
      ? (document.documentElement.getAttribute("data-pp-container-type") || "").toLowerCase()
      : "";
    return ctFromState === "partner" || ctFromAttr === "partner";
  }, [containerType]);

  const displayBrandName = React.useMemo(() => {
    try {
      const raw = String(siteTheme?.brandName || "").trim();
      const generic = /^ledger\d*$/i.test(raw) || /^partner\d*$/i.test(raw) || /^default$/i.test(raw);
      // In partner containers, also treat "PortalPay" as generic to force using the brand key
      const treatAsGeneric = generic || (isPartnerContainer && /^portalpay$/i.test(raw));
      // Prefer container brand key over context brand key
      const key = containerBrandKey || String((brand as any)?.key || "").trim();
      const titleizedKey = key ? key.charAt(0).toUpperCase() + key.slice(1) : "PortalPay";
      return (!raw || treatAsGeneric) ? titleizedKey : raw;
    } catch {
      const key = containerBrandKey || String((brand as any)?.key || "").trim();
      return key ? key.charAt(0).toUpperCase() + key.slice(1) : "PortalPay";
    }
  }, [siteTheme?.brandName, containerBrandKey, (brand as any)?.key, isPartnerContainer]);

  React.useEffect(() => {
    const headers: Record<string, string> = {};
    const w = (account?.address || "").toLowerCase();
    if (w) headers["x-wallet"] = w;
    fetch("/api/site/config", { cache: "no-store", headers })
      .then((r) => r.json())
      .then((j: SiteConfigResponse & any) => {
        try {
          setStory(String(j?.config?.story || ""));
          setStoryHtml(String(j?.config?.storyHtml || ""));
        } catch { }
      })
      .catch(() => { });
    fetch("/api/site/metrics")
      .then((r) => r.json())
      .then((j) => setMetrics(j?.metrics || null))
      .catch(() => { });
  }, [account?.address]);

  React.useEffect(() => {
    const loginParam = searchParams.get("login");
    if (loginParam === "admin") {
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (data?.authed) {
            router.push("/admin");
          } else {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete("login");
            window.history.replaceState({}, "", newUrl.toString());

            const onLogin = () => {
              router.push("/admin");
              window.removeEventListener("pp:auth:logged_in", onLogin as any);
            };
            window.addEventListener("pp:auth:logged_in", onLogin as any);
            window.dispatchEvent(new CustomEvent("pp:auth:prompt"));
          }
        })
        .catch(() => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete("login");
          window.history.replaceState({}, "", newUrl.toString());
          window.dispatchEvent(new CustomEvent("pp:auth:prompt"));
        });
    }
  }, [searchParams, router]);

  const previewStyle = React.useMemo(() => {
    return {
      ["--pp-primary" as any]: siteTheme.primaryColor,
      ["--pp-secondary" as any]: siteTheme.secondaryColor,
      ["--pp-text" as any]: siteTheme.headerTextColor || siteTheme.textColor || "#ffffff",
      ["--pp-text-header" as any]:
        siteTheme.headerTextColor || siteTheme.textColor || "#ffffff",
      ["--pp-text-body" as any]: siteTheme.bodyTextColor || "#e5e7eb",
      fontFamily: siteTheme.fontFamily,
      backgroundImage: siteTheme.receiptBackgroundUrl
        ? `url(${siteTheme.receiptBackgroundUrl})`
        : "none",
      backgroundSize: "cover",
      backgroundPosition: "center",
    } as React.CSSProperties;
  }, [siteTheme]);

  const demoReceipts: DemoReceipt[] = React.useMemo(
    () => [
      {
        lineItems: [
          { label: "Chicken Bowl", priceUsd: 10.99 },
          { label: "Tax", priceUsd: 1.0 },
        ],
        totalUsd: 11.99,
      },
      {
        lineItems: [
          { label: "Cappuccino", priceUsd: 4.50 },
          { label: "Tax", priceUsd: 0.40 },
        ],
        totalUsd: 4.90,
      },
      {
        lineItems: [
          { label: "Yoga Class", priceUsd: 22.00 },
          { label: "Tax", priceUsd: 2.00 },
        ],
        totalUsd: 24.00,
      },
      {
        lineItems: [
          { label: "Haircut & Style", priceUsd: 45.00 },
          { label: "Tax", priceUsd: 4.05 },
        ],
        totalUsd: 49.05,
      },
      {
        lineItems: [
          { label: "Concert Ticket", priceUsd: 85.00 },
          { label: "Tax", priceUsd: 7.65 },
        ],
        totalUsd: 92.65,
      },
      {
        lineItems: [
          { label: "Handcrafted Soap", priceUsd: 12.00 },
          { label: "Tax", priceUsd: 1.08 },
        ],
        totalUsd: 13.08,
      },
      {
        lineItems: [
          { label: "Pizza Margherita", priceUsd: 16.00 },
          { label: "Tax", priceUsd: 1.44 },
        ],
        totalUsd: 17.44,
      },
      {
        lineItems: [
          { label: "Car Wash", priceUsd: 28.00 },
          { label: "Tax", priceUsd: 2.52 },
        ],
        totalUsd: 30.52,
      },
      {
        lineItems: [
          { label: "Massage (60 min)", priceUsd: 75.00 },
          { label: "Tax", priceUsd: 6.75 },
        ],
        totalUsd: 81.75,
      },
      {
        lineItems: [
          { label: "Art Print", priceUsd: 35.00 },
          { label: "Tax", priceUsd: 3.15 },
        ],
        totalUsd: 38.15,
      },
    ],
    []
  );

  const [receiptIndex, setReceiptIndex] = React.useState(0);
  const demoReceipt = demoReceipts[receiptIndex];

  React.useEffect(() => {
    const intervalId = setInterval(() => {
      setReceiptIndex((prev) => (prev + 1) % demoReceipts.length);
    }, 8000);

    return () => clearInterval(intervalId);
  }, [demoReceipts.length]);

  const recipient = getRecipientAddress();

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes bg-pan {
            0% { background-position: 0% 50%; }
            100% { background-position: 100% 50%; }
          }
        `}} />

        {/* Hero: Value Prop + Live Preview */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-stretch">
          {/* Left: Messaging + CTAs */}
          <div className="glass-pane rounded-2xl border p-8 lg:p-10 flex flex-col">
            <div className="mb-6">
              <Link href="/" className="block" aria-label={`${brand.name} Home`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveBrandAppLogo(brand.logos?.symbol || brand.logos?.app, (brand as any)?.key)}
                  alt={`${brand.name} Logo`}
                  className="h-16 w-auto max-w-[340px] object-contain rounded-xl"
                  style={{ backgroundColor: 'transparent' }}
                />
              </Link>
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
              Accept crypto at the point of sale
            </h1>
            <p className="text-muted-foreground mb-6 text-base md:text-lg leading-relaxed">
              Scan. Pay. Settled. Give customers a secure web3‑native checkout and get instant,
              programmable settlement in stablecoins or tokens—wrapped in your brand, with analytics,
              splits, and reserve controls built‑in.
            </p>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-6">
              <li className="rounded-md border p-3 bg-background/60">
                <span className="font-semibold">Lower fees</span>
                <span className="microtext text-muted-foreground block">
                  Avoid legacy card rails and reduce FX friction
                </span>
              </li>
              <li className="rounded-md border p-3 bg-background/60">
                <span className="font-semibold">Brand control</span>
                <span className="microtext text-muted-foreground block">
                  White‑label portal, colors, logo, and receipt backdrop
                </span>
              </li>
              <li className="rounded-md border p-3 bg-background/60">
                <span className="font-semibold">Multi‑token</span>
                <span className="microtext text-muted-foreground block">
                  USDC, USDT, cbBTC, cbXRP, or ETH on Base
                </span>
              </li>
              <li className="rounded-md border p-3 bg-background/60">
                <span className="font-semibold">Real‑time insight</span>
                <span className="microtext text-muted-foreground block">
                  Live receipts, USD volume, and trends
                </span>
              </li>
            </ul>

            <div className="mt-auto pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={handleAdminClick}
                className="group relative overflow-hidden px-5 py-3 rounded-md bg-pp-secondary text-[var(--primary-foreground)] font-medium transition-all hover:opacity-100 shadow-lg hover:shadow-xl"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    backgroundImage: `radial-gradient(circle at 75% 10%, ${siteTheme.primaryColor}, transparent 55%), radial-gradient(circle at 25% 90%, ${siteTheme.primaryColor}, transparent 55%)`,
                    backgroundColor: "#000000",
                    backgroundSize: "400% 400%",
                    animation: "bg-pan 15s ease infinite alternate",
                  }}
                />
                {/* Deep Glow Overlay (Subtle) */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none mix-blend-screen"
                  style={{
                    background: `radial-gradient(circle at 60% -10%, ${siteTheme.primaryColor}40, transparent 70%), radial-gradient(circle at 0% 100%, ${siteTheme.primaryColor}20, transparent 60%)`
                  }}
                />

                <span className="relative z-10 flex items-center gap-2">
                  Start accepting crypto
                </span>
              </button>
              <Link href="/terminal" className="px-5 py-3 rounded-md border hover:bg-foreground/5 transition-colors">
                Try the portal
              </Link>
              <a
                href={buildPortalUrlForTest(recipient)}
                className="px-5 py-3 rounded-md border hover:bg-foreground/5 transition-colors"
              >
                Scan a demo receipt
              </a>
            </div>
          </div>

          {/* Right: Embedded live preview */}
          <div className="glass-pane rounded-2xl border p-4 md:p-5">
            <div className="text-sm font-semibold mb-3">Live Portal Preview</div>
            <PortalPreviewEmbedded
              key={`${siteTheme.brandLogoUrl}-${siteTheme.primaryColor}`}
              theme={siteTheme}
              demoReceipt={demoReceipt}
              recipient={recipient as any}
              className="max-w-[428px] mx-auto"
              style={{
                ...previewStyle,
                maxHeight: "calc(100vh - 220px)",
              }}
            />
            <div className="microtext text-muted-foreground text-center mt-3">
              Connect a wallet to simulate checkout. Preview inherits your theme.
            </div>
          </div>
        </section>

        {/* Social Proof: Stats */}
        <section className="mt-6">
          <div className="glass-pane rounded-xl border p-4 md:p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-sm">
              <div className="rounded-md border p-3 bg-background/60">
                <div className="microtext text-muted-foreground">Transactions (all‑time)</div>
                <div className="text-lg font-semibold">{metrics?.receiptsCount ?? "—"}</div>
              </div>
              <div className="rounded-md border p-3 bg-background/60">
                <div className="microtext text-muted-foreground">Total volume (USD)</div>
                <div className="text-lg font-semibold">
                  {metrics ? fmtUSD(metrics.receiptsTotalUsd) : "—"}
                </div>
              </div>
              <div className="rounded-md border p-3 bg-background/60">
                <div className="microtext text-muted-foreground">Avg receipt</div>
                <div className="text-lg font-semibold">
                  {metrics ? fmtUSD(metrics.averageReceiptUsd) : "—"}
                </div>
              </div>
              <div className="rounded-md border p-3 bg-background/60">
                <div className="microtext text-muted-foreground">Transactions (24h)</div>
                <div className="text-lg font-semibold">{metrics?.receiptsCount24h ?? "—"}</div>
              </div>
              <div className="rounded-md border p-3 bg-background/60">
                <div className="microtext text-muted-foreground">Volume (24h)</div>
                <div className="text-lg font-semibold">
                  {metrics ? fmtUSD(metrics.receiptsTotalUsd24h) : "—"}
                </div>
              </div>
              <div className="rounded-md border p-3 bg-background/60">
                <div className="microtext text-muted-foreground">Merchants onboarded</div>
                <div className="text-lg font-semibold">{metrics?.merchantsCount ?? "—"}</div>
              </div>
            </div>
          </div>
        </section>

        <AcceptedServices />

        {/* What we do */}
        <section className="mt-8">
          <div className="glass-pane rounded-xl border p-6">
            <h2 className="text-xl font-semibold mb-2">What We Do</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-4 bg-background/60">
                <div className="font-semibold">QR Code Payments</div>
                <div className="microtext text-muted-foreground mt-1">
                  Print QR codes on POS receipts; customers scan and pay on mobile.
                </div>
              </div>
              <div className="rounded-md border p-4 bg-background/60">
                <div className="font-semibold">Multi‑Token Support</div>
                <div className="microtext text-muted-foreground mt-1">
                  Accept USDC, USDT, cbBTC, cbXRP, or ETH. Base supported.
                </div>
              </div>
              <div className="rounded-md border p-4 bg-background/60">
                <div className="font-semibold">Web3‑Native Checkout</div>
                <div className="microtext text-muted-foreground mt-1">
                  Secure wallet connect and on‑chain settlement with AA gas sponsorship.
                </div>
              </div>
              <div className="rounded-md border p-4 bg-background/60">
                <div className="font-semibold">Branding & Themes</div>
                <div className="microtext text-muted-foreground mt-1">
                  White‑label portal with your logo, colors, font, and receipt background.
                </div>
              </div>
              <div className="rounded-md border p-4 bg-background/60">
                <div className="font-semibold">Reserve & Splits</div>
                <div className="microtext text-muted-foreground mt-1">
                  Configure token mix, smart rotation, and on‑chain revenue splits.
                </div>
              </div>
              <div className="rounded-md border p-4 bg-background/60">
                <div className="font-semibold">Analytics</div>
                <div className="microtext text-muted-foreground mt-1">
                  Track transactions, USD volume, fees, and trends in real time.
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <button
                onClick={handleAdminClick}
                className="px-4 py-2 rounded-md bg-pp-secondary text-[var(--primary-foreground)] font-medium transition-opacity hover:opacity-90"
              >
                Open Admin
              </button>
              <Link href="/terminal" className="px-4 py-2 rounded-md border hover:bg-foreground/5 transition-colors">
                Portal Preview
              </Link>
              <a
                href={buildPortalUrlForTest(recipient)}
                className="px-4 py-2 rounded-md border hover:bg-foreground/5 transition-colors"
              >
                Scan Demo Receipt
              </a>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-6">
          <div className="glass-pane rounded-xl border p-6">
            <h2 className="text-xl font-semibold mb-3">How {displayBrandName} Works</h2>
            <ol className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm list-decimal pl-5">
              <li>
                <div className="font-semibold">Configure</div>
                <div className="microtext text-muted-foreground">
                  Set brand, colors, logo, reserve wallet, and token ratios in Admin.
                </div>
              </li>
              <li>
                <div className="font-semibold">Generate</div>
                <div className="microtext text-muted-foreground">
                  Create receipt IDs and print QR codes from your POS.
                </div>
              </li>
              <li>
                <div className="font-semibold">Scan & Pay</div>
                <div className="microtext text-muted-foreground">
                  Customers scan the QR, connect wallet, and complete payment.
                </div>
              </li>
              <li>
                <div className="font-semibold">Reconcile</div>
                <div className="microtext text-muted-foreground">
                  Transactions post to your dashboard with real‑time analytics.
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Demo Video - Only show for platform container, not for partner containers */}
        {!isPartnerContainer && (
          <section className="mt-6">
            <div className="glass-pane rounded-xl border p-6">
              <h2 className="text-xl font-semibold mb-4">See {displayBrandName} in Action</h2>
              <PortalPayVideo />
            </div>
          </section>
        )}

        <TechnologyPartners />
        {/* Get Started: Interactive Checklist */}
        <section className="mt-6">
          <div className="glass-pane rounded-xl border p-6">
            <h2 className="text-xl font-semibold mb-3">Get Started</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Follow these steps to start accepting crypto in minutes.
                </p>
                <InteractiveChecklist
                  storageKey="landing:get-started"
                  title="Step-by-step Checklist"
                  steps={[
                    "Open Admin and connect your wallet",
                    "Set your brand, colors, logo, and font",
                    "Configure token acceptance and reserve ratios",
                    "Set tax defaults and (optionally) revenue splits",
                    "Generate a test receipt and scan it on your phone",
                    "Print QR codes or use the POS Terminal for live payments",
                    "Review Analytics to monitor volume and trends",
                  ]}
                />
              </div>
              <div className="space-y-3">
                <button
                  onClick={handleAdminClick}
                  className="block w-full text-center px-4 py-3 rounded-md bg-pp-secondary text-[var(--primary-foreground)] font-medium transition-opacity hover:opacity-90"
                >
                  Open Admin
                </button>
                <Link href="/terminal" className="block text-center px-4 py-3 rounded-md border hover:bg-foreground/5 transition-colors">
                  Try the Portal Preview
                </Link>
                <a
                  href={buildPortalUrlForTest(recipient)}
                  className="block text-center px-4 py-3 rounded-md border hover:bg-foreground/5 transition-colors"
                >
                  Scan a Demo Receipt
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* About / Story */}
        <section className="mt-8">
          <div className="glass-pane rounded-xl border p-6">
            <h2 className="text-xl font-semibold mb-2">About {displayBrandName}</h2>
            {storyHtml ? (
              <div
                className="prose prose-invert text-sm leading-relaxed story-body"
                dangerouslySetInnerHTML={{ __html: storyHtml }}
              />
            ) : story ? (
              <div className="story-body text-sm leading-relaxed">
                {story.split(/\n\s*\n+/).map((para, idx) => (
                  <p key={idx} className="mb-4 whitespace-pre-wrap">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <div className="story-body text-sm leading-relaxed">
                <h3 className="text-lg font-semibold mb-2">The {displayBrandName} Story</h3>
                <p className="mb-4">
                  {displayBrandName} makes crypto-native payments practical at the point of sale. Customers
                  scan the QR code on their receipt and pay with stablecoins or tokens using a
                  secure checkout experience. Merchants get a white‑label experience with branding,
                  loyalty, and real‑time analytics.
                </p>
                <h4 className="font-semibold mt-2 mb-1">Transformative benefits for small businesses</h4>
                <ul className="list-disc pl-5 space-y-2 mb-4">
                  <li>Faster settlement with lower processing costs than legacy card rails.</li>
                  <li>
                    Local‑currency reconciliation via local merchant providers, minimizing FX spread
                    and fees.
                  </li>
                  <li>Programmable loyalty and receipts with optional account registration.</li>
                  <li>Flexible token acceptance with reserve management and smart rotation.</li>
                </ul>
                <h4 className="font-semibold mt-2 mb-1">Benefits for consumers</h4>
                <ul className="list-disc pl-5 space-y-2 mb-4">
                  <li>
                    Pay with stablecoins (USDC, USDT) or tokens (cbBTC, cbXRP, ETH) directly from
                    your wallet.
                  </li>
                  <li>Transparent pricing and fewer foreign exchange fees when paying abroad.</li>
                  <li>Own your receipts history and unlock rewards across participating merchants.</li>
                </ul>
                <p className="mb-0">
                  By reconciling in local currency and settling via local merchant providers,
                  {displayBrandName} reduces foreign exchange friction while keeping payments simple, secure,
                  and fast.
                </p>
              </div>
            )}
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
