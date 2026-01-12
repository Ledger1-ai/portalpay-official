import type { Metadata } from "next";
import Link from "next/link";
import { getBrandConfig } from "@/config/brands";
import BrandText from "@/components/brand-text";

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrandConfig();
  const title = `BasaltSurge vs WooCommerce — Headless Payments Comparison`;
  const description =
    `Compare BasaltSurge and WooCommerce for modern, API-first payments. See differences across developer experience, extensibility, B2B workflows, headless use-cases, and more.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      // Use BasaltSurge image primarily
      images: ["/BasaltSurge.png"],
      type: "website",
    },
    alternates: {
      // Retain the NEW canonical since the route changed
      canonical: "/woocommerce",
    },
  };
}

type Row = {
  feature: string;
  portalpay: string;
  woocommerce: string;
  note?: string;
};

const rows: Row[] = [
  {
    feature: "Architecture",
    portalpay: "API-first, headless by design",
    woocommerce: "WordPress plugin-based ecommerce",
  },
  {
    feature: "Developer Experience",
    portalpay: "REST + GraphQL APIs, typed objects",
    woocommerce: "PHP/WordPress plugin ecosystem",
  },
  {
    feature: "B2B Workflows",
    portalpay: "Receipts, reserve, users, split, tax APIs",
    woocommerce: "Requires multiple add‑ons or custom plugins",
  },
  {
    feature: "Headless / Omnichannel",
    portalpay: "First-class (POS, kiosks, custom apps)",
    woocommerce: "Primarily web storefront, headless via plugins",
  },
  {
    feature: "Payment Methods",
    portalpay: "Card + alternative methods (varies by gateway)",
    woocommerce: "Depends on installed gateway plugins",
  },
  {
    feature: "Surcharging / Routing",
    portalpay: "Programmable policies via APIs",
    woocommerce: "Typically custom or plugin-dependent",
  },
  {
    feature: "Compliance & Tax",
    portalpay: "Tax API + audit-friendly primitives",
    woocommerce: "3rd‑party tax plugins recommended",
  },
  {
    feature: "Security Model",
    portalpay: "Keyed access via API Management",
    woocommerce: "WordPress auth + plugin permissions",
  },
  {
    feature: "Scalability",
    portalpay: "Cloud-native, edge-friendly API surface",
    woocommerce: "Varies by host, caching, and plugins",
  },
  {
    feature: "Extensibility",
    portalpay: "Compose domain APIs for bespoke flows",
    woocommerce: "Large plugin marketplace",
  },
];

export default function Page() {
  const brand = getBrandConfig();
  const title = (
    <>
      <BrandText /> vs WooCommerce
    </>
  );
  const description =
    "A practical comparison for teams choosing between a headless, API-first payments platform and a traditional plugin-based ecommerce stack.";

  // For JSON-LD we must be static or accept platform default for now since it's inside script tag
  // We'll use BasaltSurge for the structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `When should I choose BasaltSurge?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Choose BasaltSurge when you need an API-first, headless payments surface to power custom apps, POS, kiosks, or B2B flows with receipts, reserve, split, tax, and inventory/order APIs.`,
        },
      },
      {
        "@type": "Question",
        name: "When should I choose WooCommerce?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Choose WooCommerce if you want a WordPress-based storefront with a large plugin marketplace and are comfortable managing PHP, hosting, and plugin updates.",
        },
      },
    ],
  };

  return (
    <main>
      {/* JSON-LD for rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 pt-12 md:pt-16">
        <div className="flex flex-col gap-4 md:gap-6">
          <span className="inline-flex w-fit items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs tracking-wide text-neutral-600">
            Comparison
          </span>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            {title}
          </h1>
          <p className="text-neutral-600 text-base md:text-lg max-w-3xl">
            {description}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-2">
            <Link
              href="/docs/quickstart"
              className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2.5 text-white text-sm font-medium hover:bg-neutral-800 transition"
            >
              Get started
            </Link>
            <Link
              href="/docs/pricing"
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50 transition"
            >
              View pricing
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-6 mt-8">
            <div className="rounded-lg border border-neutral-200 p-4 bg-white">
              <h3 className="font-semibold mb-1">API-first</h3>
              <p className="text-sm text-neutral-600">
                Build with REST and GraphQL—compose domain primitives like
                receipts, reserve, users, split, tax, inventory, and orders.
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4 bg-white">
              <h3 className="font-semibold mb-1">Headless by default</h3>
              <p className="text-sm text-neutral-600">
                Power custom storefronts, POS, kiosks, backoffice tools, and
                workflows without plugin coupling.
              </p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4 bg-white">
              <h3 className="font-semibold mb-1">B2B & Ops friendly</h3>
              <p className="text-sm text-neutral-600">
                Programmatic controls for routing, reconciliation, and
                compliance with audit-friendly objects.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 py-10 md:py-14">
        <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
          <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50">
            <h2 className="text-lg md:text-xl font-semibold">
              Feature-by-feature comparison
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50">
                <tr className="border-b border-neutral-200">
                  <th className="px-4 py-3 font-medium text-neutral-700 w-[38%]">
                    Feature
                  </th>
                  <th className="px-4 py-3 font-semibold"><BrandText /></th>
                  <th className="px-4 py-3 font-semibold">WooCommerce</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.feature} className="border-b last:border-b-0">
                    <td className="px-4 py-3 align-top">{r.feature}</td>
                    <td className="px-4 py-3 align-top text-neutral-800">
                      {r.portalpay}
                      {r.note ? (
                        <div className="text-xs text-neutral-500 mt-1">
                          {r.note}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top text-neutral-800">
                      {r.woocommerce}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-neutral-200 text-xs text-neutral-500">
            “WooCommerce” is a trademark of Automattic Inc. This page is for
            informational comparison only.
          </div>
        </div>
      </section>

      {/* Guidance */}
      <section className="max-w-6xl mx-auto px-6 md:px-8 pb-14">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-lg border border-neutral-200 p-5 bg-white">
            <h3 className="text-base md:text-lg font-semibold mb-1">
              Choose <BrandText /> if you need:
            </h3>
            <ul className="text-sm text-neutral-700 list-disc pl-5 space-y-1.5">
              <li>Headless, API-first payments for custom channels</li>
              <li>Composable domain APIs (receipts, split, tax, reserve, etc.)</li>
              <li>Operational tooling for B2B and multi-channel scenarios</li>
              <li>Cloud-native scalability and edge-friendly integrations</li>
            </ul>
          </div>
          <div className="rounded-lg border border-neutral-200 p-5 bg-white">
            <h3 className="text-base md:text-lg font-semibold mb-1">
              Choose WooCommerce if you need:
            </h3>
            <ul className="text-sm text-neutral-700 list-disc pl-5 space-y-1.5">
              <li>WordPress-based storefront and CMS integration</li>
              <li>Large plugin marketplace and themes</li>
              <li>Traditional ecommerce website with rapid theming</li>
              <li>Comfort with PHP, hosting, and plugin management</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2.5 text-white text-sm font-medium hover:bg-neutral-800 transition"
          >
            Build with the APIs
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50 transition"
          >
            Read the docs
          </Link>
        </div>
      </section>
    </main>
  );
}
