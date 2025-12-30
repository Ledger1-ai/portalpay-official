"use client";

import React from "react";
import { useActiveAccount } from "thirdweb/react";

/**
 * Partner Admin: Plugins Catalog (brand-scoped)
 * - Shows all available plugins as cards/rows with view modes (Full Grid, Compact Grid, List)
 * - Clearly greys out plugins that are not enabled for the partner brand
 * - Shopify can be enabled per-brand (others default disabled for now)
 * - Selecting Shopify opens the brand-scoped workspace below (copy/assets/extension/actions)
 * - Bottom microtext CTA asks partners to contact PortalPay LLC to enable additional plugins
 */
export default function PartnerShopifyPanel() {
  const account = useActiveAccount();

  // Helper to resolve effective brand key (basaltsurge -> portalpay)
  const getEffectiveBrandKey = (key: string) => {
    const k = key.trim().toLowerCase();
    return k === "basaltsurge" ? "portalpay" : k;
  };

  // Brand selection (partners typically know their brand key)
  const [brandKey, setBrandKey] = React.useState<string>("");

  // Enabled states (today: only Shopify is wired; others default disabled)
  const [shopifyEnabled, setShopifyEnabled] = React.useState<boolean>(false);

  // Workspace state
  type CatalogKey =
    | 'shopify'
    | 'woocommerce'
    | 'stripe'
    | 'paypal'
    | 'square'
    | 'clover'
    | 'toast'
    | 'flexa'
    | 'bitpay'
    | 'coinbase'
    | 'nmi'
    | 'nuvei'
    | 'bluesnap'
    | 'rapyd'
    | 'worldpay'
    | 'authnet'
    | 'adyen'
    | 'cybersource';
  const [selectedPlugin, setSelectedPlugin] = React.useState<CatalogKey | null>(null);

  type CatalogPlugin = { key: CatalogKey; name: string; icon: string; description: string; tags: string[] };
  const catalog: CatalogPlugin[] = [
    { key: 'shopify', name: 'Shopify', icon: '/logos/shopify-payments.svg', description: 'Shopify app & checkout extension', tags: ['Commerce'] },
    { key: 'woocommerce', name: 'WooCommerce', icon: '/logos/woocommerce.svg', description: 'WooCommerce plugin (coming soon)', tags: ['Commerce'] },
    { key: 'stripe', name: 'Stripe', icon: '/logos/stripe.svg', description: 'Card payments + wallets', tags: ['Payments'] },
    { key: 'paypal', name: 'PayPal', icon: '/logos/paypal.svg', description: 'PayPal payments', tags: ['Payments'] },
    { key: 'square', name: 'Square', icon: '/logos/square.svg', description: 'Square payments', tags: ['Payments'] },
    { key: 'clover', name: 'Clover (Fiserv)', icon: '/logos/clover-fiserv.svg', description: 'Clover POS integration', tags: ['POS'] },
    { key: 'toast', name: 'Toast POS', icon: '/logos/toast.svg', description: 'Toast POS integration', tags: ['POS'] },
    { key: 'flexa', name: 'Flexa', icon: '/logos/Untitled-2.png', description: 'Crypto payments via Flexa', tags: ['Crypto', 'Payments'] },
    { key: 'bitpay', name: 'BitPay', icon: '/logos/bitpay.svg', description: 'Crypto payments via BitPay', tags: ['Crypto', 'Payments'] },
    { key: 'coinbase', name: 'Coinbase Commerce', icon: '/logos/coinbase.svg', description: 'Crypto payments via Coinbase', tags: ['Crypto', 'Payments'] },
    { key: 'nmi', name: 'NMI', icon: '/logos/nmi.svg', description: 'Gateway integration', tags: ['Gateway'] },
    { key: 'nuvei', name: 'Nuvei', icon: '/logos/nuvei.svg', description: 'Payments gateway', tags: ['Gateway'] },
    { key: 'bluesnap', name: 'BlueSnap', icon: '/logos/bluesnap.svg', description: 'Payments gateway', tags: ['Gateway'] },
    { key: 'rapyd', name: 'Rapyd', icon: '/logos/rapyd.svg', description: 'Global payments', tags: ['Payments'] },
    { key: 'worldpay', name: 'Worldpay', icon: '/logos/worldpay.svg', description: 'Payments gateway', tags: ['Gateway'] },
    { key: 'authnet', name: 'Authorize.Net', icon: '/logos/authorize-net.svg', description: 'Gateway integration', tags: ['Gateway'] },
    { key: 'adyen', name: 'Adyen', icon: '/logos/adyen.svg', description: 'Global payments', tags: ['Payments'] },
    { key: 'cybersource', name: 'CyberSource', icon: '/logos/cybersource.svg', description: 'Payments gateway', tags: ['Gateway'] },
  ];

  // Shopify plugin config state (partner-editable subset)
  const [plugin, setPlugin] = React.useState<any>({
    pluginName: "",
    tagline: "",
    shortDescription: "",
    longDescription: "",
    features: [] as string[],
    categories: [] as string[],
    assets: { iconUrl: "", squareIconUrl: "", bannerUrl: "", screenshots: [] as string[] },
    urls: { supportUrl: "", privacyUrl: "", docsUrl: "", termsUrl: "" },
    oauth: { redirectUrls: [] as string[], scopes: [] as string[] },
    extension: { enabled: true, buttonLabel: "Pay with Crypto", eligibility: { minTotal: 0, currency: "USD" }, palette: { primary: "#0ea5e9", accent: "#22c55e" } },
    status: "draft",
    listingUrl: "",
    shopifyAppId: "",
    shopifyAppSlug: "",
    partnerOrgId: "",
    verification: {
      domainVerified: false,
      businessVerified: false,
      appReviewSubmitted: false,
      gdprWebhooks: false,
      lighthouseScore: false,
      demoUrl: "",
      screencastUrl: "",
    },
  });

  // UX state
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [statusDoc, setStatusDoc] = React.useState<any>(null);

  // View mode controls (match Platform Plugin Studio)
  type ViewMode = 'grid-full' | 'grid-compact' | 'list';
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid-full');
  const isList = (v: ViewMode) => v === 'list';

  function parseCsvInput(s?: string): string[] { return (s || "").split(/[\n,]/).map(x => x.trim()).filter(Boolean); }
  function stringifyCsv(arr?: string[]): string { return Array.isArray(arr) ? arr.join(", ") : ""; }

  function configBadge(configured: boolean) {
    return (
      <span className={`microtext ${configured ? 'text-purple-700 font-semibold' : 'text-orange-700 font-semibold'}`}>
        {configured ? 'Configured' : 'Not Configured'}
      </span>
    );
  }

  async function loadConfig() {
    setError(""); setInfo(""); setLoading(true);
    try {
      if (!brandKey) { setError("Enter brandKey"); return; }
      const targetBrand = getEffectiveBrandKey(brandKey);
      const r = await fetch(`/api/admin/shopify/brands/${encodeURIComponent(targetBrand)}/plugin-config`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const ok = r.ok && j?.plugin;
      setShopifyEnabled(!!ok);
      if (ok) {
        const conf = j.plugin || {};
        setPlugin({
          pluginName: conf.pluginName || "",
          tagline: conf.tagline || "",
          shortDescription: conf.shortDescription || "",
          longDescription: conf.longDescription || "",
          features: Array.isArray(conf.features) ? conf.features : [],
          categories: Array.isArray(conf.categories) ? conf.categories : [],
          assets: {
            iconUrl: conf?.assets?.iconUrl || "",
            squareIconUrl: conf?.assets?.squareIconUrl || "",
            bannerUrl: conf?.assets?.bannerUrl || "",
            screenshots: Array.isArray(conf?.assets?.screenshots) ? conf.assets.screenshots : [],
          },
          urls: {
            supportUrl: conf?.urls?.supportUrl || "",
            privacyUrl: conf?.urls?.privacyUrl || "",
            docsUrl: conf?.urls?.docsUrl || "",
            termsUrl: conf?.urls?.termsUrl || "",
          },
          oauth: {
            redirectUrls: Array.isArray(conf?.oauth?.redirectUrls) ? conf.oauth.redirectUrls : [],
            scopes: Array.isArray(conf?.oauth?.scopes) ? conf.oauth.scopes : [],
          },
          extension: {
            enabled: typeof conf?.extension?.enabled === "boolean" ? conf.extension.enabled : true,
            buttonLabel: conf?.extension?.buttonLabel || "Pay with Crypto",
            eligibility: { minTotal: Number(conf?.extension?.eligibility?.minTotal ?? 0), currency: conf?.extension?.eligibility?.currency || "USD" },
            palette: { primary: conf?.extension?.palette?.primary || "#0ea5e9", accent: conf?.extension?.palette?.accent || "#22c55e" },
          },
          status: conf?.status || "draft",
          listingUrl: conf?.listingUrl || "",
          shopifyAppId: conf?.shopifyAppId || "",
          shopifyAppSlug: conf?.shopifyAppSlug || "",
          partnerOrgId: conf?.partnerOrgId || "",
          verification: {
            domainVerified: !!conf?.verification?.domainVerified,
            businessVerified: !!conf?.verification?.businessVerified,
            appReviewSubmitted: !!conf?.verification?.appReviewSubmitted,
            gdprWebhooks: !!conf?.verification?.gdprWebhooks,
            lighthouseScore: !!conf?.verification?.lighthouseScore,
            demoUrl: conf?.verification?.demoUrl || "",
            screencastUrl: conf?.verification?.screencastUrl || "",
          },
        });
      } else {
        setPlugin((prev: any) => ({
          ...prev,
          pluginName: "",
          tagline: "",
          shortDescription: "",
          longDescription: "",
          features: [],
          categories: [],
          assets: { iconUrl: "", squareIconUrl: "", bannerUrl: "", screenshots: [] },
          urls: { supportUrl: "", privacyUrl: "", docsUrl: "", termsUrl: "" },
          oauth: { redirectUrls: [], scopes: [] },
          extension: { enabled: true, buttonLabel: "Pay with Crypto", eligibility: { minTotal: 0, currency: "USD" }, palette: { primary: "#0ea5e9", accent: "#22c55e" } },
          status: "draft",
          listingUrl: "",
          shopifyAppId: "",
          shopifyAppSlug: "",
          partnerOrgId: "",
          verification: {
            domainVerified: false,
            businessVerified: false,
            appReviewSubmitted: false,
            gdprWebhooks: false,
            lighthouseScore: false,
            demoUrl: "",
            screencastUrl: "",
          },
        }));
      }
      setInfo("Loaded.");
    } catch (e: any) {
      setShopifyEnabled(false);
      setError(e?.message || "Failed to load");
    } finally { setLoading(false); }
  }

  const autoPopulateUrls = () => {
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;

    setPlugin((prev: any) => ({
      ...prev,
      appUrl: origin,
      oauth: {
        ...prev.oauth,
        redirectUrls: [`${origin}/api/integrations/shopify/brands/${brandKey}/auth/callback`]
      },
      appProxyUrl: `${origin}/api/integrations/shopify/proxy`,
      urls: {
        ...prev.urls,
        supportUrl: `${origin}/support`,
        docsUrl: `${origin}/docs`,
        privacyUrl: `${origin}/legal/privacy`,
        termsUrl: `${origin}/legal/terms`
      }
    }));
    setInfo("URLs auto-populated based on current domain.");
  };

  async function saveConfig() {
    setError(""); setInfo(""); setSaving(true);
    try {
      if (!brandKey) { setError("Enter brandKey"); return; }
      const targetBrand = getEffectiveBrandKey(brandKey);
      const r = await fetch(`/api/admin/shopify/brands/${encodeURIComponent(targetBrand)}/plugin-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plugin)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j?.error || "Failed to save"); return; }
      setInfo("Saved.");
      setShopifyEnabled(true);
    } catch (e: any) { setError(e?.message || "Failed to save"); }
    finally { setSaving(false); }
  }

  async function generatePackage() {
    setError(""); setInfo("");
    try {
      if (!brandKey) { setError("Enter brandKey"); return; }
      const targetBrand = getEffectiveBrandKey(brandKey);
      const r = await fetch(`/api/admin/shopify/apps/package`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandKey: targetBrand, palette: plugin?.extension?.palette }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error || "Package failed"); return; }
      setInfo(`Package ready: ${j?.sasUrl || j?.packageUrl || "blob"}`);
    } catch (e: any) { setError(e?.message || "Package failed"); }
  }

  async function deploy() {
    setError(""); setInfo("");
    try {
      if (!brandKey) { setError("Enter brandKey"); return; }
      const targetBrand = getEffectiveBrandKey(brandKey);
      const r = await fetch(`/api/admin/shopify/apps/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandKey: targetBrand }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error || "Deploy failed"); return; }
      setInfo("Deploy initiated.");
      await getStatus();
    } catch (e: any) { setError(e?.message || "Deploy failed"); }
  }

  async function getStatus() {
    setError("");
    try {
      const targetBrand = getEffectiveBrandKey(brandKey);
      const r = await fetch(`/api/admin/shopify/apps/status?brandKey=${encodeURIComponent(targetBrand)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error || "Status failed"); return; }
      setStatusDoc(j);
    } catch (e: any) { setError(e?.message || "Status failed"); }
  }

  async function publish() {
    setError(""); setInfo("");
    try {
      if (!brandKey) { setError("Enter brandKey"); return; }
      const targetBrand = getEffectiveBrandKey(brandKey);
      const r = await fetch(`/api/admin/shopify/apps/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandKey: targetBrand, listingUrl: plugin?.listingUrl || undefined, shopifyAppId: plugin?.shopifyAppId || undefined, shopifyAppSlug: plugin?.shopifyAppSlug || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) { setError(j?.error || "Publish failed"); return; }
      setInfo("Published.");
      await getStatus();
    } catch (e: any) { setError(e?.message || "Publish failed"); }
  }

  // Catalog Item renderers with prominent disabled styling
  function enabledCornerBadge(enabled: boolean) {
    return (
      <span className={`absolute top-2 right-2 microtext ${enabled ? 'text-emerald-700' : 'text-rose-700'} font-semibold`}>
        {enabled ? 'Enabled' : 'Disabled'}
      </span>
    );
  }
  function configuredCornerBadge(configured: boolean) {
    return (
      <span className={`absolute top-6 right-2 microtext ${configured ? 'text-purple-700' : 'text-orange-700'} font-semibold`}>
        {configured ? 'Configured' : 'Not Configured'}
      </span>
    );
  }
  const disabledCardCls = "border-dashed bg-foreground/5";

  function CatalogItemFull({ plugin, enabled, configured, onSelect }: { plugin: CatalogPlugin; enabled: boolean; configured: boolean; onSelect: (key: CatalogKey) => void }) {
    return (
      <button
        type="button"
        className={`relative text-left rounded-lg border p-4 flex items-start gap-3 transition select-none ${enabled ? 'hover:bg-foreground/5' : disabledCardCls}`}
        onClick={() => { if (enabled) onSelect(plugin.key); }}
        title={enabled ? plugin.name : `${plugin.name} (Disabled)`}
        aria-disabled={!enabled}
      >
        {enabledCornerBadge(enabled)}
        {configuredCornerBadge(configured)}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="h-12 w-12 rounded-md border bg-background flex items-center justify-center overflow-hidden">
          <img src={plugin.icon} alt={plugin.name} className={`h-8 w-8 object-contain rounded-md ${enabled ? '' : 'grayscale'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold">{plugin.name}</div>
          </div>
          <div className="microtext text-muted-foreground whitespace-normal break-words">{plugin.description}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {plugin.tags.map(tag => (
              <span key={tag} className={`microtext ${enabled ? 'text-blue-700' : 'text-slate-500'}`}>{tag}</span>
            ))}
          </div>
        </div>
      </button>
    );
  }

  function CatalogItemCompact({ plugin, enabled, configured, onSelect }: { plugin: CatalogPlugin; enabled: boolean; configured: boolean; onSelect: (key: CatalogKey) => void }) {
    return (
      <button
        type="button"
        className={`relative text-left rounded-md border p-2 flex items-center gap-2 transition select-none ${enabled ? 'hover:bg-foreground/5' : disabledCardCls}`}
        onClick={() => { if (enabled) onSelect(plugin.key); }}
        title={enabled ? plugin.name : `${plugin.name} (Disabled)`}
        aria-disabled={!enabled}
      >
        {enabledCornerBadge(enabled)}
        {configuredCornerBadge(configured)}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="h-9 w-9 rounded-md border bg-background flex items-center justify-center overflow-hidden">
          <img src={plugin.icon} alt={plugin.name} className={`h-6 w-6 object-contain rounded-md ${enabled ? '' : 'grayscale'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold truncate">{plugin.name}</div>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {plugin.tags.slice(0, 2).map(tag => (
              <span key={tag} className={`microtext ${enabled ? 'text-blue-700' : 'text-slate-500'}`}>{tag}</span>
            ))}
          </div>
        </div>
      </button>
    );
  }

  function CatalogItemList({ plugin, enabled, configured, onSelect }: { plugin: CatalogPlugin; enabled: boolean; configured: boolean; onSelect: (key: CatalogKey) => void }) {
    return (
      <button
        type="button"
        className={`relative w-full text-left border-b py-2 px-2 flex items-center gap-3 transition select-none ${enabled ? 'hover:bg-foreground/5' : 'bg-foreground/5'}`}
        onClick={() => { if (enabled) onSelect(plugin.key); }}
        title={enabled ? plugin.name : `${plugin.name} (Disabled)`}
        aria-disabled={!enabled}
      >
        {enabledCornerBadge(enabled)}
        {configuredCornerBadge(configured)}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="h-8 w-8 rounded-md border bg-background flex items-center justify-center overflow-hidden">
          <img src={plugin.icon} alt={plugin.name} className={`h-6 w-6 object-contain rounded-md ${enabled ? '' : 'grayscale'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold truncate">{plugin.name}</div>
          </div>
          <div className="microtext text-muted-foreground truncate">{plugin.description}</div>
        </div>
        <div className="hidden sm:flex items-center gap-2 flex-wrap">
          {plugin.tags.map(tag => (
            <span key={tag} className={`microtext ${enabled ? 'text-blue-700' : 'text-slate-500'}`}>{tag}</span>
          ))}
        </div>
      </button>
    );
  }

  const selectedName = selectedPlugin ? (catalog.find(c => c.key === selectedPlugin)?.name || 'Plugin') : '';

  function renderCatalog() {
    const gridClass = viewMode === 'grid-compact'
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'
      : 'grid grid-cols-1 sm:grid-cols-2 gap-3';

    return (
      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Available Plugins</div>
          <div className="flex items-center gap-2">
            <button
              className={`microtext px-2 py-1 rounded-md border ${viewMode === 'grid-full' ? 'bg-foreground/10 border-foreground/30' : 'hover:bg-foreground/5'}`}
              onClick={() => setViewMode('grid-full')}
            >Full Grid</button>
            <button
              className={`microtext px-2 py-1 rounded-md border ${viewMode === 'grid-compact' ? 'bg-foreground/10 border-foreground/30' : 'hover:bg-foreground/5'}`}
              onClick={() => setViewMode('grid-compact')}
            >Compact Grid</button>
            <button
              className={`microtext px-2 py-1 rounded-md border ${isList(viewMode) ? 'bg-foreground/10 border-foreground/30' : 'hover:bg-foreground/5'}`}
              onClick={() => setViewMode('list')}
            >List</button>
          </div>
        </div>

        {isList(viewMode) ? (
          <div className="rounded-md border">
            <div>
              {catalog.map((p) => {
                const enabled = p.key === 'shopify' ? shopifyEnabled : false;
                const configured = p.key === 'shopify' ? (!!plugin.pluginName && String(plugin.status || '').toLowerCase() !== 'draft') : false;
                return (
                  <CatalogItemList key={p.key} plugin={p} enabled={enabled} configured={configured} onSelect={(key) => setSelectedPlugin(key)} />
                );
              })}
            </div>
          </div>
        ) : (
          <div className={gridClass}>
            {catalog.map((p) => {
              const enabled = p.key === 'shopify' ? shopifyEnabled : false;
              const configured = p.key === 'shopify' ? (!!plugin.pluginName && String(plugin.status || '').toLowerCase() !== 'draft') : false;
              return viewMode === 'grid-compact'
                ? <CatalogItemCompact key={p.key} plugin={p} enabled={enabled} configured={configured} onSelect={(key) => setSelectedPlugin(key)} />
                : <CatalogItemFull key={p.key} plugin={p} enabled={enabled} configured={configured} onSelect={(key) => setSelectedPlugin(key)} />;
            })}
          </div>
        )}

        <div className="microtext text-muted-foreground mt-3">
          Want to enable additional plugins? Please reach out to PortalPay LLC to request activation for your brand.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Plugins</div>
          <div className="microtext text-muted-foreground">Manage plugins for your partner brand. Shopify may be enabled for your brand; other integrations can be activated upon request.</div>
        </div>
        <div className="text-xs text-muted-foreground">Admin Wallet: {account?.address || "(not connected)"}</div>
      </div>

      <div className="flex items-center gap-2">
        <input className="h-9 px-3 border rounded-md bg-background w-60" placeholder="brandKey" value={brandKey} onChange={(e) => setBrandKey(e.target.value.toLowerCase())} />
        <button className="px-3 py-1.5 border rounded-md text-sm" onClick={loadConfig} disabled={loading}>{loading ? "Loading…" : "Load"}</button>
      </div>

      {/* Catalog with view mode controls */}
      {renderCatalog()}

      {/* Workspace: Only Shopify for now */}
      {selectedPlugin === 'shopify' && (
        <div className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={catalog.find(c => c.key === 'shopify')?.icon || '/logos/crypto.svg'} alt={selectedPlugin} className="h-6 w-6 object-contain rounded-md" />
              <div className="text-sm font-semibold">Shopify Workspace — {brandKey || '—'}</div>
            </div>
            <div className="text-xs text-muted-foreground">State: {shopifyEnabled ? 'Enabled' : 'Disabled'}</div>
          </div>

          {!shopifyEnabled ? (
            <div className="rounded-md border p-3 bg-foreground/5 microtext text-muted-foreground">
              This plugin is not yet enabled for your brand. Please reach out to PortalPay LLC to request activation.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="microtext">Plugin Name</label>
                  <input className="mt-1 h-9 w-full px-3 border rounded-md bg-background" value={plugin.pluginName} onChange={(e) => setPlugin({ ...plugin, pluginName: e.target.value })} />
                </div>
                <div>
                  <label className="microtext">Tagline</label>
                  <input className="mt-1 h-9 w-full px-3 border rounded-md bg-background" value={plugin.tagline} onChange={(e) => setPlugin({ ...plugin, tagline: e.target.value })} />
                </div>
                <div>
                  <label className="microtext">Short Description</label>
                  <input className="mt-1 h-9 w-full px-3 border rounded-md bg-background" value={plugin.shortDescription} onChange={(e) => setPlugin({ ...plugin, shortDescription: e.target.value })} />
                </div>
                <div>
                  <label className="microtext">Features (comma separated)</label>
                  <input className="mt-1 h-9 w-full px-3 border rounded-md bg-background" value={stringifyCsv(plugin.features)} onChange={(e) => setPlugin({ ...plugin, features: parseCsvInput(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="microtext">Long Description</label>
                <textarea className="mt-1 w-full h-24 px-3 py-2 border rounded-md bg-background" value={plugin.longDescription} onChange={(e) => setPlugin({ ...plugin, longDescription: e.target.value })} />
              </div>

              <div className="rounded-md border p-3 bg-background">
                <div className="text-sm font-medium mb-2">Verification Status</div>
                <div className="space-y-4">

                  {/* Business & Legal */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business & Legal</div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={plugin.verification.domainVerified} onChange={(e) => setPlugin({ ...plugin, verification: { ...plugin.verification, domainVerified: e.target.checked } })} />
                      <span className="microtext">Domain Ownership Verified</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={plugin.verification.businessVerified} onChange={(e) => setPlugin({ ...plugin, verification: { ...plugin.verification, businessVerified: e.target.checked } })} />
                      <span className="microtext">Business Verification Complete</span>
                    </div>
                  </div>

                  {/* Technical */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Technical</div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={plugin.verification.gdprWebhooks} onChange={(e) => setPlugin({ ...plugin, verification: { ...plugin.verification, gdprWebhooks: e.target.checked } })} />
                      <span className="microtext">GDPR Webhooks Implemented</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={plugin.verification.lighthouseScore} onChange={(e) => setPlugin({ ...plugin, verification: { ...plugin.verification, lighthouseScore: e.target.checked } })} />
                      <span className="microtext">Lighthouse Performance Check</span>
                    </div>
                  </div>

                  {/* Listing */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Listing Details</div>
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        className="h-8 w-full px-2 border rounded-md bg-background text-xs"
                        value={plugin.verification.demoUrl}
                        onChange={(e) => setPlugin({ ...plugin, verification: { ...plugin.verification, demoUrl: e.target.value } })}
                        placeholder="Demo Store URL"
                      />
                      <input
                        className="h-8 w-full px-2 border rounded-md bg-background text-xs"
                        value={plugin.verification.screencastUrl}
                        onChange={(e) => setPlugin({ ...plugin, verification: { ...plugin.verification, screencastUrl: e.target.value } })}
                        placeholder="Screencast URL"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" checked={plugin.verification.appReviewSubmitted} onChange={(e) => setPlugin({ ...plugin, verification: { ...plugin.verification, appReviewSubmitted: e.target.checked } })} />
                      <span className="microtext">App Submitted for Review</span>
                    </div>
                  </div>

                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="px-3 py-1.5 border rounded-md text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" onClick={autoPopulateUrls}>Auto-populate URLs</button>
                <button type="button" className="px-3 py-1.5 border rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90" onClick={saveConfig} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button className="px-3 py-1.5 border rounded-md text-sm" onClick={generatePackage}>Generate Package</button>
                <button className="px-3 py-1.5 border rounded-md text-sm" onClick={deploy}>Deploy</button>
                <button className="px-3 py-1.5 border rounded-md text-sm" onClick={getStatus}>Status</button>
                <button className="px-3 py-1.5 border rounded-md text-sm" onClick={publish}>Publish</button>
              </div>

              {(info || error) && (
                <div className={`rounded-md border p-2 text-sm ${error ? "text-red-600" : "text-emerald-600"}`}>{error || info}</div>
              )}

              {statusDoc && (
                <div className="rounded-md border p-3 bg-foreground/5">
                  <div className="text-sm font-medium mb-2">Deployment Status</div>
                  <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(statusDoc, null, 2)}</pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
