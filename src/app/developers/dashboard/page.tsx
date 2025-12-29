import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthenticatedWallet } from "@/lib/auth";
import { BookOpen, LayoutDashboard, Box, KeyRound, ScrollText } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTOC } from "@/components/dashboard/dashboard-toc";
import { getBrandConfig } from "@/config/brands";
import { getBaseUrl } from "@/lib/base-url";
import { resolveBrandAppLogo } from "@/lib/branding";

export const metadata = {
  title: "Developer Dashboard",
  description: "Manage APIM products, subscriptions, and API keys.",
};

const tocSections = [
  {
    title: "Getting Started",
    items: [
      { text: "Browse available products and tiers" },
      { text: "Subscribe to a product (Starter, Pro, Enterprise)" },
      { text: "Retrieve your API keys from subscriptions" },
      { text: "Use keys in Ocp-Apim-Subscription-Key header" },
    ],
  },
  {
    title: "Quick Links",
    items: [
      { text: "View Products", href: "/developers/dashboard/products" },
      { text: "Manage Subscriptions", href: "/developers/dashboard/subscriptions" },
      { text: "API Keys & Secrets", href: "/developers/dashboard/api-keys" },
      { text: "Documentation", href: "/developers/docs/auth" },
    ],
  },
  {
    title: "Resources",
    items: [
      { text: "Authentication Guide", href: "/developers/docs/auth" },
      { text: "Rate Limits & Quotas", href: "/developers/docs/limits" },
      { text: "Pricing Details", href: "/developers/docs/pricing" },
    ],
  },
];

export default async function DashboardPage() {
  const wallet = await getAuthenticatedWallet();
  if (!wallet) {
    redirect("/developers");
  }

  // Resolve runtime brand (server-side) similar to RootLayout
  let brandKeyFromHost: string | undefined;
  try {
    const hostUrl = getBaseUrl();
    const u = new URL(hostUrl);
    const host = u.hostname || "";
    const parts = host.split(".");
    if (parts.length >= 3 && host.endsWith(".azurewebsites.net")) {
      brandKeyFromHost = parts[0].toLowerCase();
    }
  } catch { }
  const baseBrand = getBrandConfig(brandKeyFromHost);
  let brand = baseBrand;
  try {
    const res = await fetch(`/api/platform/brands/${encodeURIComponent(baseBrand.key)}/config`, { cache: "no-store" });
    const j = await res.json().catch(() => ({} as any));
    const b = j?.brand || null;
    if (b && typeof b === "object") {
      brand = {
        ...baseBrand,
        name: typeof b.name === "string" && b.name ? b.name : baseBrand.name,
        logos: b.logos && typeof b.logos === "object" ? { ...baseBrand.logos, ...b.logos } : baseBrand.logos,
        appUrl: typeof b.appUrl === "string" && b.appUrl ? b.appUrl : baseBrand.appUrl,
        meta: b.meta && typeof b.meta === "object" ? b.meta : baseBrand.meta,
      };
    }
  } catch { }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Documentation | Dashboard tabs */}
      <header className="fixed top-[84px] left-0 right-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center">
              <Image
                src={resolveBrandAppLogo(brand?.logos?.app, brand?.key || baseBrand.key)}
                alt={brand?.name || "Brand"}
                width={160}
                height={40}
                className="object-contain h-10 w-auto max-w-[200px]"
              />
            </Link>
            <div className="h-6 w-px bg-border ml-4" />
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/developers/docs"
                className="px-3 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                <span>Documentation</span>
              </Link>
              <span className="mx-1 text-muted-foreground">|</span>
              <Link
                href="/developers/dashboard"
                className="px-3 py-2 rounded-md bg-foreground text-background transition-colors flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
            </nav>
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="hidden md:inline">Signed in as</span>{" "}
            <span className="font-mono">{wallet}</span>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <DashboardSidebar currentPath="/developers/dashboard" />

      {/* Main Content - centered with equal sidebar spacing */}
      <main className="pt-[148px] transition-all duration-300">
        <div className="mx-auto max-w-4xl px-8 py-12 md:ml-64 xl:mr-64">
          <div className="mb-10">
            <h1 className="text-4xl font-bold mb-2">Developer Dashboard</h1>
            <p className="text-muted-foreground">
              Manage your product access, subscriptions, and API keys for {brand?.name || "PortalPay"}.
            </p>
          </div>

          {/* Overview Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            <Link
              href="/developers/dashboard/products"
              className="glass-pane rounded-xl border p-6 hover:bg-foreground/5 transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold group-hover:text-[var(--primary)] transition-colors">
                  Products
                </h3>
                <Box className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <p className="text-sm text-muted-foreground">
                View available APIM products (Starter, Pro, Enterprise) and pricing.
              </p>
            </Link>

            <Link
              href="/developers/dashboard/subscriptions"
              className="glass-pane rounded-xl border p-6 hover:bg-foreground/5 transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold group-hover:text-[var(--primary)] transition-colors">
                  Subscriptions
                </h3>
                <ScrollText className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <p className="text-sm text-muted-foreground">
                View and manage your APIM subscriptions. Subscribe to products.
              </p>
            </Link>

            <Link
              href="/developers/dashboard/api-keys"
              className="glass-pane rounded-xl border p-6 hover:bg-foreground/5 transition-colors group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold group-hover:text-[var(--primary)] transition-colors">
                  API Keys
                </h3>
                <KeyRound className="w-6 h-6 text-[var(--primary)]" />
              </div>
              <p className="text-sm text-muted-foreground">
                View and regenerate your APIM subscription keys. Copy to clipboard.
              </p>
            </Link>
          </div>

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t border-border">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Image
                  src={brand?.logos?.symbol || brand?.logos?.app || brand?.logos?.favicon || "/ppsymbol.png"}
                  alt={brand?.name || "Brand"}
                  width={20}
                  height={20}
                />
                <span>© {new Date().getFullYear()} {brand?.name || "PortalPay"}. All rights reserved.</span>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="https://github.com/GenRevo89/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
                <Link href="/developers/docs" className="hover:text-foreground transition-colors">
                  Documentation
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </main>

      {/* Table of Contents */}
      <DashboardTOC sections={tocSections} />
    </div>
  );
}
