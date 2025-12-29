"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, LayoutDashboard, ScrollText, CheckCircle, XCircle } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTOC } from "@/components/dashboard/dashboard-toc";
import { useBrand } from "@/contexts/BrandContext";
import { resolveBrandAppLogo } from "@/lib/branding";

type Subscription = {
  subscriptionId: string;
  label: string;
  plan: string;
  status: string;
  createdAt?: number;
  wallet: string;
  scopes: string[];
};

const tocSections = [
  {
    title: "Managing Subscriptions",
    items: [
      { text: "Subscriptions correspond to your API Keys" },
      { text: "Each plan has specific rate limits" },
      { text: "Active subscriptions allow API access" },
    ],
  },
  {
    title: "Next Steps",
    items: [
      { text: "Manage API Keys", href: "/developers/dashboard/api-keys" },
      { text: "View Documentation", href: "/developers/docs" },
    ],
  },
];

export default function SubscriptionsPage() {
  const brand = useBrand();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  async function fetchSubscriptions() {
    try {
      // Use new internal endpoint
      const res = await fetch("/api/developers/subscriptions");
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/developers";
          return;
        }
        throw new Error("Failed to fetch subscriptions");
      }
      const data = await res.json();
      setSubscriptions(data.subscriptions || []);
    } catch (e: any) {
      setError(e?.message || "Error loading subscriptions");
    } finally {
      setLoading(false);
    }
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

      <DashboardSidebar currentPath="/developers/dashboard/subscriptions" />

      <main className="pt-[148px] transition-all duration-300">
        <div className="mx-auto max-w-4xl px-8 py-12 md:ml-64 xl:mr-64">
          {/* Breadcrumb */}
          <nav className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/developers/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Subscriptions</span>
          </nav>

          <div className="mb-10 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">My Subscriptions</h1>
              <p className="text-muted-foreground">View your active plans and access levels.</p>
            </div>
            <Link
              href="/developers/dashboard/api-keys"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
            >
              Manage Keys
            </Link>
          </div>

          {loading && <div className="text-center py-12">Loading...</div>}
          {error && <div className="p-4 mb-6 text-red-600 bg-red-100 rounded-md">{error}</div>}

          {!loading && !error && subscriptions.length === 0 && (
            <div className="text-center py-12 border rounded-xl bg-muted/20">
              <ScrollText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p>No active subscriptions.</p>
            </div>
          )}

          {!loading && !error && subscriptions.length > 0 && (
            <div className="grid gap-4">
              {subscriptions.map((sub) => (
                <div key={sub.subscriptionId} className="glass-pane rounded-xl border p-6 hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold">{sub.label}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${sub.plan === 'enterprise' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' : sub.plan === 'pro' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                          {sub.plan.toUpperCase()} PLAN
                        </span>
                        {sub.status === "active" ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle className="w-3 h-3" /> Active</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="w-3 h-3" /> {sub.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground mb-4">
                    <div>ID: <span className="font-mono">{sub.subscriptionId}</span></div>
                    <div>Created: {new Date(sub.createdAt!).toLocaleDateString()}</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Scopes</div>
                    <div className="flex flex-wrap gap-2">
                      {sub.scopes.map((scope) => (
                        <span key={scope} className="text-xs px-2 py-1 rounded-md bg-muted border font-mono">{scope}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </main>
      <DashboardTOC sections={tocSections} />
    </div>
  );
}
