"use client";

import React from "react";
import { useBrand } from "@/contexts/BrandContext";

type ShopifyTile = {
  brandKey: string;
  pluginName: string;
  tagline: string;
  status: string;
  listingUrl: string;
  iconUrl?: string;
  bannerUrl?: string;
};

type CatalogKey =
  | "shopify"
  | "woocommerce"
  | "stripe"
  | "paypal"
  | "square"
  | "clover"
  | "toast"
  | "flexa"
  | "bitpay"
  | "coinbase"
  | "nmi"
  | "nuvei"
  | "bluesnap"
  | "rapyd"
  | "worldpay"
  | "authnet"
  | "adyen"
  | "cybersource";

type CatalogPlugin = { key: CatalogKey; name: string; icon: string; description: string };

const catalog: CatalogPlugin[] = [
  { key: "shopify", name: "Shopify", icon: "/logos/shopify-payments.svg", description: "Shopify app & checkout extension" },
  { key: "woocommerce", name: "WooCommerce", icon: "/logos/woocommerce.svg", description: "WooCommerce plugin (coming soon)" },
  { key: "stripe", name: "Stripe", icon: "/logos/stripe.svg", description: "Card payments + wallets" },
  { key: "paypal", name: "PayPal", icon: "/logos/paypal.svg", description: "PayPal payments" },
  { key: "square", name: "Square", icon: "/logos/square.svg", description: "Square payments" },
  { key: "clover", name: "Clover (Fiserv)", icon: "/logos/clover-fiserv.svg", description: "Clover POS integration" },
  { key: "toast", name: "Toast POS", icon: "/logos/toast.svg", description: "Toast POS integration" },
  { key: "flexa", name: "Flexa", icon: "/logos/Untitled-2.png", description: "Crypto payments via Flexa" },
  { key: "bitpay", name: "BitPay", icon: "/logos/bitpay.svg", description: "Crypto payments via BitPay" },
  { key: "coinbase", name: "Coinbase Commerce", icon: "/logos/coinbase.svg", description: "Crypto payments via Coinbase" },
  { key: "nmi", name: "NMI", icon: "/logos/nmi.svg", description: "Gateway integration" },
  { key: "nuvei", name: "Nuvei", icon: "/logos/nuvei.svg", description: "Payments gateway" },
  { key: "bluesnap", name: "BlueSnap", icon: "/logos/bluesnap.svg", description: "Payments gateway" },
  { key: "rapyd", name: "Rapyd", icon: "/logos/rapyd.svg", description: "Global payments" },
  { key: "worldpay", name: "Worldpay", icon: "/logos/worldpay.svg", description: "Payments gateway" },
  { key: "authnet", name: "Authorize.Net", icon: "/logos/authorize-net.svg", description: "Gateway integration" },
  { key: "adyen", name: "Adyen", icon: "/logos/adyen.svg", description: "Global payments" },
  { key: "cybersource", name: "CyberSource", icon: "/logos/cybersource.svg", description: "Payments gateway" },
];

export default function IntegrationsPanel() {
  const brand = useBrand();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [tile, setTile] = React.useState<ShopifyTile | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const rawBk = String(brand?.key || "").toLowerCase();
        const bk = rawBk === "basaltsurge" ? "portalpay" : rawBk;

        if (!bk) {
          setError("brandKey unavailable");
          setLoading(false);
          return;
        }
        // Load Shopify integration tile; others are not yet backed by API
        const r = await fetch(`/api/integrations/shopify/brands/${encodeURIComponent(bk)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) {
          if (!cancelled) setError(j?.error || "Failed to load Shopify integration");
        } else {
          if (!cancelled) setTile(j.tile as ShopifyTile);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load Shopify integration");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brand?.key]);

  function enabledBadge(enabled: boolean) {
    return <span className={`microtext ${enabled ? "text-emerald-700" : "text-rose-700"} font-semibold`}>{enabled ? "Enabled" : "Disabled"}</span>;
  }
  function configuredBadge(configured: boolean) {
    return <span className={`microtext ${configured ? "text-purple-700" : "text-orange-700"} font-semibold`}>{configured ? "Configured" : "Not Configured"}</span>;
  }

  function renderCard(p: CatalogPlugin) {
    const isShopify = p.key === "shopify";
    const statusLower = String(tile?.status || "").toLowerCase();
    const enabled = isShopify ? (statusLower === "published") : false;
    const configured = isShopify ? (!!tile?.listingUrl && statusLower !== "draft") : false;

    const tagline = isShopify ? (tile?.tagline || p.description) : p.description;
    const published = isShopify && statusLower === "published";

    return (
      <div key={p.key} className={`relative rounded-lg border p-4 bg-background`}>
        {/* Corner badges - show only one of each type; inline badges removed */}
        <span className={`absolute top-2 right-2 microtext ${enabled ? "text-emerald-700" : "text-rose-700"} font-semibold`}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
        <span className={`absolute top-6 right-2 microtext ${configured ? "text-purple-700" : "text-orange-700"} font-semibold`}>
          {configured ? "Configured" : "Not Configured"}
        </span>

        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="shrink-0 h-12 w-12 rounded-md border bg-white grid place-items-center overflow-hidden" aria-label={p.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.icon} alt={p.name} className={`h-9 w-9 object-contain ${enabled ? "" : "grayscale"}`} />
          </div>
          {/* Text */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold truncate">{p.name}</div>
            </div>
            <div className="microtext text-muted-foreground truncate">{tagline}</div>
            <div className="mt-3 flex items-center gap-2">
              {isShopify && published && tile?.listingUrl ? (
                <a
                  href={tile.listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-md border text-sm"
                  title="Open listing to install"
                >
                  Install on Shopify
                </a>
              ) : (
                <button className="px-3 py-1.5 rounded-md border text-sm text-muted-foreground" disabled>
                  Coming soon
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-pane rounded-xl border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Integrations</h2>
        <span className="microtext text-muted-foreground">Brand: {brand?.key || "—"}</span>
      </div>

      <div className="microtext text-muted-foreground">Connect your store and channels. Browse available plugins; Shopify supports brand-specific configuration.</div>

      {loading && <div className="microtext text-muted-foreground">Loading…</div>}
      {error && <div className="microtext text-red-500">{error}</div>}

      {/* Catalog of all available plugins - long list, one card per row with extra details */}
      <div className="space-y-3">
        {catalog.map((p) => (
          <div key={p.key} className="rounded-lg border p-4 bg-background">
            {renderCard(p)}
            {/* Additional details */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 microtext text-muted-foreground">
              <div>
                <div className="font-semibold text-foreground">Description</div>
                <div>{p.description}</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">Documentation</div>
                <div>
                  {p.key === "shopify" ? (
                    <a href="https://shopify.dev/docs/apps" target="_blank" rel="noopener noreferrer" className="underline">Shopify Apps Docs</a>
                  ) : p.key === "woocommerce" ? (
                    <a href="https://developer.woocommerce.com/" target="_blank" rel="noopener noreferrer" className="underline">WooCommerce Developer</a>
                  ) : p.key === "stripe" ? (
                    <a href="https://stripe.com/docs" target="_blank" rel="noopener noreferrer" className="underline">Stripe Docs</a>
                  ) : p.key === "paypal" ? (
                    <a href="https://developer.paypal.com/home" target="_blank" rel="noopener noreferrer" className="underline">PayPal Developer</a>
                  ) : p.key === "square" ? (
                    <a href="https://developer.squareup.com/docs" target="_blank" rel="noopener noreferrer" className="underline">Square Docs</a>
                  ) : p.key === "clover" ? (
                    <a href="https://docs.clover.com/" target="_blank" rel="noopener noreferrer" className="underline">Clover Docs</a>
                  ) : p.key === "toast" ? (
                    <a href="https://github.com/ToastTab" target="_blank" rel="noopener noreferrer" className="underline">Toast Resources</a>
                  ) : p.key === "flexa" ? (
                    <a href="https://flexa.network/" target="_blank" rel="noopener noreferrer" className="underline">Flexa</a>
                  ) : p.key === "bitpay" ? (
                    <a href="https://bitpay.com/docs/" target="_blank" rel="noopener noreferrer" className="underline">BitPay Docs</a>
                  ) : p.key === "coinbase" ? (
                    <a href="https://docs.cloud.coinbase.com/commerce/docs/" target="_blank" rel="noopener noreferrer" className="underline">Coinbase Commerce Docs</a>
                  ) : p.key === "nmi" ? (
                    <a href="https://developer.nmi.com/" target="_blank" rel="noopener noreferrer" className="underline">NMI Developer</a>
                  ) : p.key === "nuvei" ? (
                    <a href="https://docs.nuvei.com/" target="_blank" rel="noopener noreferrer" className="underline">Nuvei Docs</a>
                  ) : p.key === "bluesnap" ? (
                    <a href="https://support.bluesnap.com/docs" target="_blank" rel="noopener noreferrer" className="underline">BlueSnap Docs</a>
                  ) : p.key === "rapyd" ? (
                    <a href="https://docs.rapyd.net/" target="_blank" rel="noopener noreferrer" className="underline">Rapyd Docs</a>
                  ) : p.key === "worldpay" ? (
                    <a href="https://developer.worldpay.com/" target="_blank" rel="noopener noreferrer" className="underline">Worldpay Developer</a>
                  ) : p.key === "authnet" ? (
                    <a href="https://developer.authorize.net/" target="_blank" rel="noopener noreferrer" className="underline">Authorize.Net Developer</a>
                  ) : p.key === "adyen" ? (
                    <a href="https://docs.adyen.com/" target="_blank" rel="noopener noreferrer" className="underline">Adyen Docs</a>
                  ) : (
                    <a href="https://developer.cybersource.com/" target="_blank" rel="noopener noreferrer" className="underline">CyberSource Developer</a>
                  )}
                </div>
              </div>
              <div>
                <div className="font-semibold text-foreground">Status</div>
                <div className="microtext">
                  <span className="text-muted-foreground">Enabled:</span> {(p.key === "shopify" ? (String(tile?.status || "").toLowerCase() === "published") : false) ? "Yes" : "No"} · <span className="text-muted-foreground">Configured:</span> {(p.key === "shopify" ? (!!tile?.listingUrl && String(tile?.status || "").toLowerCase() !== "draft") : false) ? "Yes" : "No"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
