"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, LayoutDashboard, KeyRound, Copy, RefreshCw, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTOC } from "@/components/dashboard/dashboard-toc";
import { Modal } from "@/components/ui/modal";
import { useBrand } from "@/contexts/BrandContext";
import { resolveBrandAppLogo } from "@/lib/branding";


type ApiKey = {
  id: string; // key_...
  label: string;
  prefix: string;
  maskedKey: string;
  plan: "starter" | "pro" | "enterprise";
  isActive: boolean;
  createdAt: number;
  rateLimit: { requests: number; window: number };
  migratedFrom?: { subscriptionId: string };
};

const tocSections = [
  {
    title: "Subscriptions & Keys",
    items: [
      { text: "Each subscription has an associated API Key" },
      { text: "Keys are displayed masked for security" },
    ],
  },
  {
    title: "Security",
    items: [
      { text: "Regenerate keys if compromised" },
      { text: "Keys are stored as secure hashes" },
    ],
  },
];

function APIKeysContent() {
  const brand = useBrand();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [secretOpen, setSecretOpen] = useState(false); // To show raw key


  // State for actions
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyPlan, setNewKeyPlan] = useState<"starter" | "pro">("starter");
  const [displayedSecret, setDisplayedSecret] = useState(""); // The raw key
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/developers/api-keys");
      if (res.status === 401) {
        window.location.href = "/developers";
        return;
      }
      if (!res.ok) throw new Error("Failed to load keys");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setProcessing(true);
    try {
      const res = await fetch("/api/developers/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newKeyLabel || "My Subscription", plan: newKeyPlan }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      const data = await res.json();

      setDisplayedSecret(data.apiKey); // Show raw key
      setSecretOpen(true);
      setCreateOpen(false);
      setNewKeyLabel("");
      fetchKeys(); // Refresh list
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setProcessing(false);
    }
  }

  function confirmRegenerate(key: ApiKey) {
    setSelectedKey(key);
    setRegenerateOpen(true);
  }

  async function doRegenerate() {
    if (!selectedKey) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/developers/api-keys/${selectedKey.id}/rotate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to regenerate key");
      const data = await res.json();
      setDisplayedSecret(data.apiKey);
      setSecretOpen(true); // Show new key
      setRegenerateOpen(false);
      fetchKeys();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleShowKey(key: ApiKey) {
    setSelectedKey(key);
    setProcessing(true);
    try {
      const res = await fetch(`/api/developers/api-keys/${key.id}/reveal`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to reveal key");
      }
      const data = await res.json();
      setDisplayedSecret(data.apiKey);
      setSecretOpen(true);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setProcessing(false);
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(displayedSecret);
    alert("Copied to clipboard!");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-[84px] left-0 right-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center">
              <Image
                src={resolveBrandAppLogo(brand?.logos?.app, brand?.key || "portalpay")}
                alt={brand?.name || "PortalPay"}
                width={160}
                height={40}
                className="object-contain h-10 w-auto max-w-[200px]"
              />
            </Link>
            <div className="h-6 w-px bg-border ml-4" />
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/developers/docs" className="px-3 py-2 rounded-md text-muted-foreground hover:text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> <span>Documentation</span>
              </Link>
              <span className="mx-1 text-muted-foreground">|</span>
              <Link href="/developers/dashboard" className="px-3 py-2 rounded-md bg-foreground text-background flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> <span>Dashboard</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <DashboardSidebar currentPath="/developers/dashboard/api-keys" />

      <main className="pt-[148px] transition-all duration-300">
        <div className="mx-auto max-w-5xl px-8 py-12 md:ml-64 xl:mr-64">
          {/* Breadcrumb */}
          <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/developers/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Subscriptions & Keys</span>
          </nav>


          {/* Subscription Selector */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold mb-2">Subscriptions & Keys</h1>
              <p className="text-muted-foreground">Manage your API subscriptions and access keys.</p>
            </div>

            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <KeyRound className="w-4 h-4" /> Add Subscription
            </button>
          </div>

          {error && <div className="p-4 mb-6 text-red-600 bg-red-100 rounded-md">{error}</div>}

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 border rounded-xl bg-muted/20">
              <KeyRound className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p>No active subscriptions. Add one to get an API key.</p>
            </div>
          ) : (
            <SubscriptionView keys={keys} onRegenerate={confirmRegenerate} onShow={handleShowKey} />
          )}

        </div>
      </main>

      <DashboardTOC sections={tocSections} />

      {/* Create Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Subscription"
        description="Create a new subscription to access the API."
        microtexts={[]}
        actions={[
          { label: "Cancel", onClick: () => setCreateOpen(false), variant: "secondary" },
          { label: processing ? "Creating..." : "Create", onClick: handleCreate, variant: "primary" },
        ]}
      >
        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              className="w-full px-3 py-2 bg-background border rounded-md focus:ring-2 focus:ring-primary outline-none"
              placeholder="e.g. My App"
              value={newKeyLabel}
              onChange={e => setNewKeyLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Plan</label>
            <select
              className="w-full px-3 py-2 bg-background border rounded-md focus:ring-2 focus:ring-primary outline-none"
              value={newKeyPlan}
              onChange={e => setNewKeyPlan(e.target.value as any)}
            >
              <option value="starter">Starter (100 req/min)</option>
              <option value="pro">Pro (1,000 req/min)</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Secret Display Modal */}
      <Modal
        open={secretOpen}
        onClose={() => setSecretOpen(false)}
        title="API Key Secret"
        description="Copy this key to your clipboard. Treat it like a password."
        microtexts={[]}
        actions={[
          { label: "Done", onClick: () => setSecretOpen(false), variant: "primary" }
        ]}
      >
        <div className="p-4 bg-muted/30 border rounded-md my-4 flex items-center gap-2">
          <code className="text-lg font-mono flex-1 break-all text-primary">{displayedSecret}</code>
          <button onClick={copySecret} className="p-2 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
            <Copy className="w-5 h-5" />
          </button>
        </div>
      </Modal>

      {/* Confirm Regenerate Modal */}
      <Modal
        open={regenerateOpen}
        onClose={() => setRegenerateOpen(false)}
        title="Regenerate Key?"
        description="This will invalidate the current key immediately. Your applications will need to be updated."
        microtexts={[]}
        actions={[
          { label: "Cancel", onClick: () => setRegenerateOpen(false), variant: "secondary" },
          { label: processing ? "Processing..." : "Regenerate", onClick: doRegenerate, variant: "danger" },
        ]}
      />

    </div>
  );
}

// ----------------------------------------------------------------------------
// Subscription View Component
// ----------------------------------------------------------------------------

function SubscriptionView({ keys, onRegenerate, onShow }: { keys: ApiKey[]; onRegenerate: (k: ApiKey) => void; onShow: (k: ApiKey) => void }) {
  // Group keys by subscription
  // Subscription is defined by `migratedFrom.subscriptionId` OR for native keys, the `id` (1-to-1).
  const groups = keys.reduce((acc, key) => {
    const subId = key.migratedFrom?.subscriptionId || key.id;
    if (!acc[subId]) {
      // Determine a label.
      // For migrated keys, label is "Migrated Primary (Sub Name)". We want "Sub Name".
      let name = key.label;
      if (key.migratedFrom) {
        // try extracting from parens
        const match = key.label.match(/\((.*?)\)$/);
        if (match) name = match[1];
      }
      acc[subId] = { id: subId, name, keys: [] };
    }
    acc[subId].keys.push(key);
    return acc;
  }, {} as Record<string, { id: string, name: string, keys: ApiKey[] }>);

  const groupList = Object.values(groups);
  const [selectedSubId, setSelectedSubId] = useState<string>(groupList[0]?.id || "");

  // Ensure selection is valid if list changes
  useEffect(() => {
    if (!groupList.find(g => g.id === selectedSubId) && groupList.length > 0) {
      setSelectedSubId(groupList[0].id);
    }
  }, [groupList, selectedSubId]);

  const activeGroup = groups[selectedSubId];

  return (
    <div className="space-y-6">
      {/* Dropdown Selector */}
      <div className="w-full max-w-sm">
        <label className="block text-sm font-medium mb-1.5 text-muted-foreground">Select Subscription</label>
        <select
          className="w-full p-2.5 bg-background border rounded-lg shadow-sm focus:ring-2 focus:ring-primary outline-none"
          value={selectedSubId}
          onChange={e => setSelectedSubId(e.target.value)}
        >
          {groupList.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      <div className="border-t pt-6"></div>

      {activeGroup && (
        <div className="glass-pane rounded-xl border overflow-hidden animate-in fade-in duration-300">
          <div className="p-6 border-b bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-xl">{activeGroup.id.startsWith("key_") ? activeGroup.name : activeGroup.id}</h3>
              {/* Show plan from first key (assuming shared plan for sub) */}
              {activeGroup.keys[0] && (
                <span className={`text-xs px-2 py-0.5 rounded-full border border-primary/20 bg-primary/5 text-primary`}>
                  {activeGroup.keys[0].plan.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {activeGroup.keys.map(key => (
              <div key={key.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg border bg-background/50">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-bold">
                      {key.migratedFrom ? (key.label.includes("Primary") ? "Primary Key" : "Secondary Key") : "Primary Key"}
                    </div>
                    <div className={`text-[10px] px-1.5 rounded uppercase font-bold tracking-wider ${key.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                      {key.isActive ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-muted-foreground">
                    {key.prefix}••••••••••••••••••••••••
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">ID: {key.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onShow(key)} className="px-3 py-1.5 bg-background hover:bg-muted border rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Show
                  </button>
                  <button onClick={() => onRegenerate(key)} className="px-3 py-1.5 bg-background hover:bg-muted border rounded-md text-sm font-medium transition-colors flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" /> Regenerate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export default function APIKeysPage() {
  return <Suspense fallback={<div>Loading...</div>}><APIKeysContent /></Suspense>;
}
