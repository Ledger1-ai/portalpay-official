"use client";

import React, { useEffect, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useBrand } from "@/contexts/BrandContext";
import TruncatedAddress from "@/components/truncated-address";
import { isPartnerContextClient } from "@/lib/env";

type SplitVersion = {
  version: number;
  versionId: string;
  createdAt: number;
  createdBy?: string;
  notes?: string;
  partnerWallet?: string;
  platformFeeBps: number;
  partnerFeeBps: number;
  defaultMerchantFeeBps?: number;
  effectiveAt: number;
  published: boolean;
};

type VersionsResponse = {
  brandKey: string;
  versions: SplitVersion[];
  currentVersion?: number | null;
  forceRedeployOlder?: boolean;
  requireRedeployOnWalletChange?: boolean;
  synthesized?: boolean;
  error?: string;
};

function bps(v?: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.floor(n)));
}

function isHexAddress(s?: string): boolean {
  return !!s && /^0x[a-fA-F0-9]{40}$/.test(String(s).trim());
}

function formatDate(ts?: number): string {
  try {
    if (!ts || !Number.isFinite(Number(ts))) return "—";
    return new Date(Number(ts)).toLocaleString();
  } catch {
    return "—";
  }
}

export default function SplitConfigPanel() {
  const account = useActiveAccount();
  const brand = useBrand();

  const isPlatform = !isPartnerContextClient();

  const [brandKey, setBrandKey] = useState<string>(isPlatform ? "basaltsurge" : (brand?.key || "basaltsurge"));
  const [versions, setVersions] = useState<SplitVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [forceRedeployOlder, setForceRedeployOlder] = useState<boolean>(false);
  const [requireRedeployOnWalletChange, setRequireRedeployOnWalletChange] = useState<boolean>(false);
  const [brandsList, setBrandsList] = useState<string[]>([]);

  // Form state for creating a new version
  const [newPartnerWallet, setNewPartnerWallet] = useState<string>("");
  const [newPlatformFeeBps, setNewPlatformFeeBps] = useState<number>(50);
  const [newPartnerFeeBps, setNewPartnerFeeBps] = useState<number>(0);
  const [newDefaultMerchantFeeBps, setNewDefaultMerchantFeeBps] = useState<number | "">("");
  const [newNotes, setNewNotes] = useState<string>("");
  const [publishOnCreate, setPublishOnCreate] = useState<boolean>(false);

  // UX state
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  // Lock to current brand; no cross-brand selection
  useEffect(() => {
    try {
      setBrandsList([]);
      if (brand?.key) setBrandKey(brand.key);
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Partner containers: lock brandKey to site config theme.brandKey
  useEffect(() => {
    if (isPlatform) return;
    (async () => {
      try {
        const r = await fetch(`/api/site/config`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const themeBrandKey = String(j?.config?.theme?.brandKey || "").toLowerCase();
        if (themeBrandKey && themeBrandKey !== String(brandKey || "").toLowerCase()) {
          setBrandKey(themeBrandKey);
        }
      } catch { }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatform]);

  // Platform: populate brands dropdown with deployed partners + portalpay
  useEffect(() => {
    if (!isPlatform) return;
    (async () => {
      try {
        const r = await fetch("/api/platform/brands", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const arr: string[] = Array.isArray(j?.brands)
          ? j.brands.map((k: any) => String(k || "").toLowerCase()).filter(Boolean)
          : [];
        const deployed: string[] = [];
        for (const k of arr) {
          if (k === "basaltsurge") continue;
          try {
            const cr = await fetch(`/api/platform/brands/${encodeURIComponent(k)}/config`, { cache: "no-store" });
            const cj = await cr.json().catch(() => ({}));
            const ov = cj?.overrides || {};
            const isDeployed =
              Boolean(ov?.containerAppName) ||
              Boolean(ov?.containerFqdn) ||
              Boolean(ov?.containerState);
            if (isDeployed) deployed.push(k);
          } catch { }
        }
        const list = ["basaltsurge", ...Array.from(new Set(deployed))];
        setBrandsList(list);
        const current = String(brandKey || "").toLowerCase();
        if (!list.includes(current)) {
          setBrandKey("basaltsurge");
        }
      } catch {
        setBrandsList(["basaltsurge"]);
        if (String(brandKey || "").toLowerCase() !== "basaltsurge") setBrandKey("basaltsurge");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatform]);

  // Load split versions for selected brand
  async function loadVersions(key: string) {
    try {
      setLoading(true);
      setError("");
      setInfo("");
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(key)}/split-versions`, { cache: "no-store" });
      const j: VersionsResponse = await r.json().catch(() => ({ brandKey: key, versions: [] }));
      if (!r.ok || j.error) {
        setError(j?.error || "Failed to load split versions");
        setVersions([]);
        setCurrentVersion(null);
        setForceRedeployOlder(false);
        setRequireRedeployOnWalletChange(false);
        return;
      }
      setVersions(Array.isArray(j.versions) ? j.versions : []);
      setCurrentVersion(typeof j.currentVersion === "number" ? j.currentVersion : null);
      setForceRedeployOlder(!!j.forceRedeployOlder);
      setRequireRedeployOnWalletChange(!!j.requireRedeployOnWalletChange);
      if (j.synthesized) {
        setInfo("No registry found; showing synthesized current config.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load split versions");
      setVersions([]);
      setCurrentVersion(null);
      setForceRedeployOlder(false);
      setRequireRedeployOnWalletChange(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const key = String(brandKey || "").toLowerCase();
    if (!key) {
      setVersions([]);
      setCurrentVersion(null);
      setForceRedeployOlder(false);
      setRequireRedeployOnWalletChange(false);
      setInfo("No brand selected.");
      return;
    }
    loadVersions(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey]);

  // Sync form defaults to effective brand config.
  // On Partner containers, platform bps is locked to env/effective config.
  useEffect(() => {
    const key = String(brandKey || "").toLowerCase();
    if (!key) return;

    (async () => {
      try {
        const r = await fetch(`/api/platform/brands/${encodeURIComponent(key)}/config`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const eff = j?.brand || {};
        // Lock platform bps to effective value for partner containers
        if (!isPlatform) {
          const plat = Number(eff?.platformFeeBps);
          if (Number.isFinite(plat)) {
            setNewPlatformFeeBps(Math.max(0, Math.min(10000, Math.floor(plat))));
          }
        }
        // Keep partner bps in sync with effective defaults as a convenience
        const part = Number(eff?.partnerFeeBps);
        if (Number.isFinite(part)) {
          setNewPartnerFeeBps(Math.max(0, Math.min(10000, Math.floor(part))));
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey, isPlatform]);

  async function createVersion() {
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const key = String(brandKey || "").toLowerCase();
      if (!key) {
        setError("Missing brand key");
        return;
      }
      const payload: any = {
        partnerFeeBps: bps(newPartnerFeeBps),
        notes: newNotes || undefined,
        publish: !!publishOnCreate,
      };
      // Only platform container may set platformFeeBps explicitly; partners are locked to effective/env value.
      if (isPlatform) {
        payload.platformFeeBps = bps(newPlatformFeeBps);
      }
      if (newDefaultMerchantFeeBps !== "") {
        payload.defaultMerchantFeeBps = bps(Number(newDefaultMerchantFeeBps));
      }
      if (String(brandKey || "").toLowerCase() !== "basaltsurge" && newPartnerWallet && isHexAddress(newPartnerWallet)) {
        payload.partnerWallet = newPartnerWallet;
      }
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(key)}/split-versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        setError(j?.error || "Failed to create version");
        return;
      }
      setInfo("Version created");
      // reset form
      setNewNotes("");
      setPublishOnCreate(false);
      // reload
      await loadVersions(key);
    } catch (e: any) {
      setError(e?.message || "Failed to create version");
    } finally {
      setSaving(false);
    }
  }

  async function publishVersion(ver: number) {
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const key = String(brandKey || "").toLowerCase();
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(key)}/split-versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        credentials: "include",
        body: JSON.stringify({ publishVersion: ver }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        setError(j?.error || "Failed to publish version");
        return;
      }
      setInfo("Version published");
      await loadVersions(key);
    } catch (e: any) {
      setError(e?.message || "Failed to publish version");
    } finally {
      setSaving(false);
    }
  }

  async function savePolicyFlags(next: { forceRedeployOlder?: boolean; requireRedeployOnWalletChange?: boolean }) {
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const key = String(brandKey || "").toLowerCase();
      const body: any = {};
      if (typeof next.forceRedeployOlder === "boolean") body.forceRedeployOlder = next.forceRedeployOlder;
      if (typeof next.requireRedeployOnWalletChange === "boolean") body.requireRedeployOnWalletChange = next.requireRedeployOnWalletChange;
      const r = await fetch(`/api/platform/brands/${encodeURIComponent(key)}/split-versions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-wallet": account?.address || "" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) {
        setError(j?.error || "Failed to save policy flags");
        return;
      }
      setInfo("Policy updated");
      await loadVersions(key);
    } catch (e: any) {
      setError(e?.message || "Failed to save policy flags");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-pane rounded-xl border p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Split Config</h2>
          <div className="flex items-center gap-2">
            {isPlatform ? (
              <select
                className="h-9 px-3 py-1 border rounded-md bg-background"
                value={brandKey}
                onChange={(e) => setBrandKey(e.target.value)}
                title="Select deployed partner brand or portalpay"
              >
                {(brandsList.length ? brandsList : ["basaltsurge"]).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            ) : (
              <span
                className="h-9 px-3 py-1 rounded-md border bg-muted text-sm flex items-center"
                title="Brand key (locked to current container)"
              >
                {brandKey}
              </span>
            )}
            <button
              className="px-3 py-1.5 rounded-md border text-sm"
              onClick={() => loadVersions(brandKey)}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="microtext text-muted-foreground">
          {isPlatform
            ? "Manage versioned splits for the main Platform split. Each version updates platform fee bps and notes."
            : "Manage versioned splits for partner brands. Each version freezes partner wallet and fee bps. New merchants bind to the current version."}
        </div>
      </div>

      {/* Policy flags */}
      <div className="glass-pane rounded-xl border p-5 space-y-3">
        <div className="text-sm font-medium">Version Policy</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={forceRedeployOlder}
              onChange={(e) => {
                const on = e.target.checked;
                setForceRedeployOlder(on);
                savePolicyFlags({ forceRedeployOlder: on });
              }}
            />
            <span>Force redeploy older merchants to current version</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requireRedeployOnWalletChange}
              onChange={(e) => {
                const on = e.target.checked;
                setRequireRedeployOnWalletChange(on);
                savePolicyFlags({ requireRedeployOnWalletChange: on });
              }}
            />
            <span>Require redeploy when partner wallet changes</span>
          </label>
        </div>
        <div className="microtext text-muted-foreground">
          Defaults are off. Toggle as needed. When off, older merchants may continue on their existing split; they can withdraw fees from previous splits.
        </div>
      </div>

      {/* Versions list */}
      <div className="glass-pane rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Versions — {brandKey}</div>
          <div className="microtext text-muted-foreground">
            Current: {typeof currentVersion === "number" ? currentVersion : "None"}
          </div>
        </div>
        {versions.length === 0 ? (
          <div className="microtext text-muted-foreground">No versions yet.</div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-foreground/5">
                  <th className="text-left px-3 py-2 font-medium">Version</th>
                  <th className="text-left px-3 py-2 font-medium">Partner Wallet</th>
                  <th className="text-left px-3 py-2 font-medium">Platform bps</th>
                  <th className="text-left px-3 py-2 font-medium">Partner bps</th>
                  <th className="text-left px-3 py-2 font-medium">Merchant bps (derived)</th>
                  <th className="text-left px-3 py-2 font-medium">Published</th>
                  <th className="text-left px-3 py-2 font-medium">Created</th>
                  <th className="text-left px-3 py-2 font-medium">Effective</th>
                  <th className="text-left px-3 py-2 font-medium">Notes</th>
                  <th className="text-left px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => {
                  const plat = bps(v.platformFeeBps);
                  const part = bps(v.partnerFeeBps);
                  const merch = Math.max(0, 10000 - plat - part);
                  const isCurrent = currentVersion === v.version;
                  return (
                    <tr key={v.versionId} className="border-t">
                      <td className="px-3 py-2">{v.version}</td>
                      <td className="px-3 py-2 font-mono">
                        {v.partnerWallet ? <TruncatedAddress address={String(v.partnerWallet).toLowerCase()} /> : "—"}
                      </td>
                      <td className="px-3 py-2">{plat}</td>
                      <td className="px-3 py-2">{part}</td>
                      <td className="px-3 py-2">{merch}</td>
                      <td className="px-3 py-2">{v.published ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">{formatDate(v.createdAt)}</td>
                      <td className="px-3 py-2">{formatDate(v.effectiveAt)}</td>
                      <td className="px-3 py-2">{v.notes || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {!isCurrent && (
                            <button
                              className="px-2 py-1 rounded-md border text-xs"
                              onClick={() => publishVersion(v.version)}
                              disabled={saving}
                              title="Publish this version"
                            >
                              Publish
                            </button>
                          )}
                          {isCurrent && (
                            <span className="px-2 py-1 rounded-md border text-xs bg-green-100 text-green-700">Current</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="microtext text-red-500">{error}</div>}
        {info && <div className="microtext text-green-600">{info}</div>}
      </div>

      {/* Create new version */}
      <div className="glass-pane rounded-xl border p-5 space-y-3">
        <div className="text-sm font-medium">Create New Version</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="microtext text-muted-foreground">Partner Wallet (optional)</label>
            <input
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background font-mono"
              placeholder="0x…"
              value={newPartnerWallet}
              onChange={(e) => setNewPartnerWallet(e.target.value)}
            />
            <div className="microtext text-muted-foreground mt-1">If provided, must be a valid 0x address.</div>
          </div>
          <div>
            <label className="microtext text-muted-foreground">Platform Fee (bps)</label>
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={newPlatformFeeBps}
              onChange={(e) => setNewPlatformFeeBps(Math.max(0, Math.min(10000, Math.floor(Number(e.target.value || 0)))))}
              disabled={!isPlatform}
              title={isPlatform ? "Editable on Platform" : "Locked to Platform bps (env) in Partner container"}
            />
            {!isPlatform && (
              <div className="microtext text-muted-foreground mt-1">
                Locked to Platform bps from this partner container&apos;s environment.
              </div>
            )}
          </div>
          <div>
            <label className="microtext text-muted-foreground">Partner Fee (bps)</label>
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={newPartnerFeeBps}
              onChange={(e) => setNewPartnerFeeBps(Math.max(0, Math.min(10000, Math.floor(Number(e.target.value || 0)))))}
            />
          </div>
          <div>
            <label className="microtext text-muted-foreground">Default Merchant Fee (bps, optional)</label>
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              className="mt-1 w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={newDefaultMerchantFeeBps as any}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setNewDefaultMerchantFeeBps("");
                else setNewDefaultMerchantFeeBps(Math.max(0, Math.min(10000, Math.floor(Number(v || 0)))));
              }}
            />
            <div className="microtext text-muted-foreground mt-1">Optional field for metadata/reference.</div>
          </div>
          <div className="md:col-span-2">
            <label className="microtext text-muted-foreground">Notes</label>
            <textarea
              className="mt-1 w-full h-20 px-3 py-2 border rounded-md bg-background"
              placeholder="Describe changes in this split version…"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publishOnCreate}
              onChange={(e) => setPublishOnCreate(e.target.checked)}
            />
            <span>Publish immediately</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-md border text-sm"
            onClick={createVersion}
            disabled={saving || !brandKey}
          >
            {saving ? "Saving…" : "Create Version"}
          </button>
        </div>
      </div>
    </div>
  );
}
