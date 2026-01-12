'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAllComparisons } from '@/lib/landing-pages/comparisons';
import LogoTile from '@/components/landing/LogoTile';

export default function ComparisonsClient() {
  const [pageStatuses, setPageStatuses] = useState<Record<string, { enabled: boolean }>>({});

  // Load SEO page statuses to filter enabled pages only
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/seo-pages', { cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.ok && data?.settings?.pageStatuses) {
          setPageStatuses(data.settings.pageStatuses as Record<string, { enabled: boolean }>);
        }
      } catch { }
    })();
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => getAllComparisons(), []);
  const comps = useMemo(() => all.filter(c => (pageStatuses[`comparison-${c.slug}`]?.enabled ?? true)), [all, pageStatuses]);

  // Group comparisons by category
  const majorCompetitors = useMemo(() => comps.filter(c => ['stripe', 'square', 'paypal', 'toast', 'coinbase-commerce'].includes(c.slug)), [comps]);
  const globalProcessors = useMemo(() => comps.filter(c => ['adyen', 'worldpay', 'checkout-com'].includes(c.slug)), [comps]);
  const regionalEmerging = useMemo(() => comps.filter(c => ['razorpay', 'paystack', 'flutterwave', 'mercado-pago', 'mpesa'].includes(c.slug)), [comps]);
  const cryptoFocused = useMemo(() => comps.filter(c => ['bitpay', 'flexa', 'opennode'].includes(c.slug)), [comps]);
  const highRiskCannabis = useMemo(() => comps.filter(c => ['dutchie', 'aeropay', 'hypur', 'paymentcloud', 'paykings', 'durango-merchant-services', 'canpay'].includes(c.slug)), [comps]);
  const merchantServices = useMemo(() => comps.filter(c => ['clover-fiserv', 'global-payments', 'elavon', 'authorize-net', 'wepay', 'stax', 'helcim', 'braintree', 'shopify-payments', 'rapyd', 'bluesnap', 'nmi', 'nuvei', 'paysafe', 'cybersource', '2checkout', 'moneris', 'evo-payments'].includes(c.slug)), [comps]);
  const posPlatforms = useMemo(() => comps.filter(c => ['lightspeed', 'touchbistro', 'cova-pos', 'flowhub', 'treez'].includes(c.slug)), [comps]);
  const ecommercePlatforms = useMemo(() => comps.filter(c => ['woocommerce'].includes(c.slug)), [comps]);

  const Section = ({ title, items }: { title: string; items: typeof comps }) => (
    items.length === 0 ? null : (
      <section className="mb-12">
        <h3 className="text-2xl font-bold mb-6 text-white">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((comparison) => (
            <Link
              key={comparison.slug}
              href={`/vs/${comparison.slug}`}
              className="glass-pane rounded-xl border border-white/10 p-6 hover:border-[var(--primary)] transition-all group bg-white/5 hover:bg-white/10"
            >
              <div className="mb-3 flex justify-center">
                <LogoTile slug={comparison.slug} alt={`${comparison.name} logo`} size="md" />
              </div>
              <h4 className="text-xl font-semibold mb-2 text-white group-hover:text-[var(--primary)] transition">vs {comparison.name}</h4>
              <p className="text-sm text-neutral-400 mb-4 line-clamp-2">
                {comparison.subheadline}
              </p>
              <div className="flex items-center text-[var(--primary)] text-sm font-medium group-hover:translate-x-1 transition-transform">
                Compare now →
              </div>
            </Link>
          ))}
        </div>
      </section>
    )
  );

  return (
    <div className="text-white">
      <Section title="Major Competitors" items={majorCompetitors} />
      <Section title="Global Payment Processors" items={globalProcessors} />
      <Section title="Regional & Emerging Markets" items={regionalEmerging} />
      <Section title="Crypto-Focused Processors" items={cryptoFocused} />
      <Section title="Cannabis & High-Risk Payments" items={highRiskCannabis} />
      <Section title="Merchant Services & Gateways" items={merchantServices} />
      <Section title="POS Platforms" items={posPlatforms} />
      <Section title="E-commerce Platforms" items={ecommercePlatforms} />
    </div>
  );
}
