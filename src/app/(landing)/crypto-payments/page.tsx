import { Metadata } from 'next';
import Link from 'next/link';
import IndustriesClient from './IndustriesClient';
import { getAllIndustries } from '@/lib/landing-pages/industries';
import { getBrandConfig } from '@/config/brands';
import { getBaseUrl } from '@/lib/base-url';
import { isPartnerContext } from '@/lib/env';

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrandConfig();
  const BASE_URL = isPartnerContext() ? getBaseUrl() : 'https://pay.ledger1.ai';
  return {
    title: `Crypto Payments for Every Industry | ${brand.name}`,
    description: 'Accept crypto payments in your industry. Restaurant POS, retail inventory, hotel PMS, and more. Lower fees (0.5-1%), instant settlement, free enterprise features.',
    openGraph: {
      title: `Crypto Payments for Every Industry | ${brand.name}`,
      description: 'Industry-specific crypto payment solutions. Save 70%+ on fees.',
      url: `${BASE_URL}/crypto-payments`,
      siteName: brand.name,
      type: 'website',
    },
    alternates: {
      canonical: `${BASE_URL}/crypto-payments`,
    },
  };
}

export default function CryptoPaymentsIndexPage() {
  const industries = getAllIndustries();
  const brand = getBrandConfig();

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Hero Section */}
        <section className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Crypto Payments for Every Industry
          </h1>
          <p className="text-lg text-muted-foreground mb-6 max-w-3xl mx-auto">
            Industry-specific payment solutions with free POS/PMS systems. Accept both crypto and traditional
            payments with 70-85% lower fees than competitors.
          </p>

          <div className="glass-pane rounded-xl border p-6 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-[var(--primary)] mb-1">0.5-1%</div>
                <div className="text-sm text-muted-foreground">Processing Fees</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[var(--primary)] mb-1">Instant</div>
                <div className="text-sm text-muted-foreground">Settlement</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[var(--primary)] mb-1">Free</div>
                <div className="text-sm text-muted-foreground">Industry Features</div>
              </div>
            </div>
          </div>
        </section>

        {/* Industries Grid with Search, Sort, Filter, and View Controls */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Browse Industries</h2>
          <IndustriesClient />
        </section>

        {/* Features Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-center">Why Choose {brand.name}?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-pane rounded-xl border p-6 text-center">
              <div className="text-4xl mb-3">💰</div>
              <h3 className="font-semibold mb-2">Lower Fees</h3>
              <p className="text-sm text-muted-foreground">
                Pay 0.5-1% vs 2.9%+ with competitors. Save thousands annually.
              </p>
            </div>
            <div className="glass-pane rounded-xl border p-6 text-center">
              <div className="text-4xl mb-3">⚡</div>
              <h3 className="font-semibold mb-2">Instant Settlement</h3>
              <p className="text-sm text-muted-foreground">
                Get paid in seconds, not days. No waiting for batch processing.
              </p>
            </div>
            <div className="glass-pane rounded-xl border p-6 text-center">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="font-semibold mb-2">Industry-Specific</h3>
              <p className="text-sm text-muted-foreground">
                Built-in POS, PMS, or inventory systems for your industry.
              </p>
            </div>
            <div className="glass-pane rounded-xl border p-6 text-center">
              <div className="text-4xl mb-3">🌐</div>
              <h3 className="font-semibold mb-2">Accept Everything</h3>
              <p className="text-sm text-muted-foreground">
                Crypto + cards + Apple Pay. Customers choose how to pay.
              </p>
            </div>
          </div>
        </section>


        {/* CTA Section */}
        <section className="glass-pane rounded-2xl border p-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Transform Your Payment Processing?
          </h2>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            Get industry-specific features, lower fees, and instant settlement.
            No bank account required. Start accepting payments in minutes.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/admin"
              className="px-8 py-4 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-lg font-semibold hover:opacity-90 transition"
            >
              Get Started Free
            </Link>
            <Link
              href="/terminal"
              className="px-8 py-4 rounded-md border text-lg font-semibold hover:bg-accent transition"
            >
              View Pricing
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Free POS/PMS • 0.5-1% fees • Instant settlement • No monthly costs
          </p>
        </section>
      </div>
    </div>
  );
}
