import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getComparisonData, getAllComparisons } from '@/lib/landing-pages/comparisons';
import LogoTile from '@/components/landing/LogoTile';
import PortalPayVideo from '@/components/landing/PortalPayVideo';
import { getBrandConfig } from '@/config/brands';
import { getBaseUrl } from '@/lib/base-url';
import { isPartnerContext } from '@/lib/env';

// Generate static params for all comparisons
export async function generateStaticParams() {
  const comparisons = getAllComparisons();
  return comparisons.map((comparison) => ({
    competitor: comparison.slug,
  }));
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitor: string }>;
}): Promise<Metadata> {
  const { competitor } = await params;
  const data = getComparisonData(competitor);
  const brand = getBrandConfig();
  const BASE_URL = isPartnerContext() ? getBaseUrl() : 'https://surge.basalthq.com';
  const isPartner = isPartnerContext();
  const dePortal = (s: any) =>
    typeof s === 'string'
      ? (isPartner ? s.replaceAll('PortalPay', brand.name) : s)
      : s;

  if (!data) {
    return {
      title: 'Comparison Not Found',
    };
  }

  return {
    title: dePortal(data.title),
    description: dePortal(data.metaDescription),
    openGraph: {
      title: dePortal(data.title),
      description: dePortal(data.metaDescription),
      url: `${BASE_URL}/vs/${data.slug}`,
      siteName: brand.name,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: dePortal(data.title),
      description: dePortal(data.metaDescription),
    },
    alternates: {
      canonical: `${BASE_URL}/vs/${data.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ competitor: string }>;
}) {
  const { competitor } = await params;
  const data = getComparisonData(competitor);
  const brand = getBrandConfig();
  const isPartner = isPartnerContext();
  const dePortal = (s: any) =>
    typeof s === 'string'
      ? (isPartner ? s.replaceAll('PortalPay', brand.name) : s)
      : s;

  if (!data) {
    notFound();
  }

  // Calculate example savings
  const exampleVolume = 10000;
  const competitorMonthlyCost = (exampleVolume * data.pricing.processingFee) +
    (200 * data.pricing.flatFee) + // Assume 200 transactions
    data.pricing.monthlyFee;
  const portalPayMonthlyCost = (exampleVolume * 0.0075); // 0.75% average
  const monthlySavings = competitorMonthlyCost - portalPayMonthlyCost;
  const annualSavings = monthlySavings * 12;

  return (
    <div className="min-h-screen">
      {/* Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: data.headline,
            description: data.metaDescription,
            author: {
              '@type': 'Organization',
              name: brand.name,
            },
          }),
        }}
      />

      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Breadcrumb */}
        <nav className="text-sm mb-6 text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Home</Link>
          {' / '}
          <Link href="/vs" className="hover:text-foreground">Comparisons</Link>
          {' / '}
          <span className="text-foreground">{data.name}</span>
        </nav>

        {/* Hero Section */}
        <section className="text-center mb-12">
          <div className="mb-4 flex justify-center">
            <LogoTile slug={data.slug} alt={`${data.name} logo`} size="lg" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            {dePortal(data.headline)}
          </h1>
          <p className="text-lg text-muted-foreground mb-6 max-w-3xl mx-auto">
            {dePortal(data.subheadline)}
          </p>

          {/* Quick Stats */}
          <div className="glass-pane rounded-xl border p-6 max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-[var(--primary)] mb-1">
                  {((1 - (0.0075 / data.pricing.processingFee)) * 100).toFixed(0)}%
                </div>
                <div className="text-sm text-muted-foreground">Lower Fees</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[var(--primary)] mb-1">
                  ${annualSavings.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground">Average Annual Savings</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[var(--primary)] mb-1">
                  Instant
                </div>
                <div className="text-sm text-muted-foreground">Settlement Time</div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6 text-center">Feature Comparison</h2>
          <div className="glass-pane rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-accent/50">
                    <th className="text-left p-4 font-semibold">Feature</th>
                    <th className="text-center p-4 font-semibold text-[var(--primary)]">{brand.name}</th>
                    <th className="text-center p-4 font-semibold">{data.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((feature, idx) => (
                    <tr key={idx} className={`border-b ${feature.advantage ? 'bg-green-500/5' : ''}`}>
                      <td className="p-4 font-medium">{feature.feature}</td>
                      <td className="p-4 text-center">
                        {typeof feature.basaltsurge === 'boolean' ? (
                          feature.basaltsurge ? (
                            <span className="text-green-500 text-xl">✓</span>
                          ) : (
                            <span className="text-red-500 text-xl">✗</span>
                          )
                        ) : (
                          <span className={feature.advantage ? 'font-semibold text-[var(--primary)]' : ''}>
                            {dePortal(feature.basaltsurge as any)}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center text-muted-foreground">
                        {typeof feature.competitor === 'boolean' ? (
                          feature.competitor ? (
                            <span className="text-green-500 text-xl">✓</span>
                          ) : (
                            <span className="text-red-500 text-xl">✗</span>
                          )
                        ) : (
                          feature.competitor
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Cost Comparison Examples */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6 text-center">Real-World Savings Examples</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.useCases.map((useCase, idx) => (
              <div key={idx} className="glass-pane rounded-xl border p-6">
                <h3 className="text-xl font-semibold mb-4">{useCase.scenario}</h3>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">With {data.name}:</span>
                    <span className="font-semibold">
                      ${useCase.competitorCost.toLocaleString()}/year
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">With {brand.name}:</span>
                    <span className="font-semibold text-[var(--primary)]">
                      ${useCase.basaltsurgeCost.toLocaleString()}/year
                    </span>
                  </div>
                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="font-semibold">You Save:</span>
                    <span className="text-2xl font-bold text-green-500">
                      ${useCase.savings.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {((useCase.savings / useCase.competitorCost) * 100).toFixed(0)}% annual savings
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Migration Steps */}
        {data.migrationSteps && (
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-6 text-center">
              How to Switch from {data.name} to {brand.name}
            </h2>
            <div className="glass-pane rounded-xl border p-6 max-w-3xl mx-auto">
              <ol className="space-y-4">
                {data.migrationSteps.map((step, idx) => (
                  <li key={idx} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-semibold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 pt-1">
                      <p>{step}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* Why Switch Section */}
        <section className="mb-12">
          <div className="glass-pane rounded-xl border p-8">
            <h2 className="text-2xl font-bold mb-6">Why Businesses Switch to {brand.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-3 text-red-500">Problems with {data.name}</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">✗</span>
                    <span>High processing fees ({(data.pricing.processingFee * 100).toFixed(2)}%{data.pricing.flatFee > 0 && ` + ${data.pricing.flatFee}¢`})</span>
                  </li>
                  {data.pricing.monthlyFee > 0 && (
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 mt-1">✗</span>
                      <span>Monthly software fees (${data.pricing.monthlyFee}+)</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">✗</span>
                    <span>Slow settlement (1-3 business days)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">✗</span>
                    <span>Chargeback losses</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">✗</span>
                    <span>Requires traditional bank account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-1">✗</span>
                    <span>Limited crypto support</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-3 text-green-500">Benefits of {brand.name}</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    <span>Ultra-low fees (0.5-1% total)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    <span>No monthly fees ever</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    <span>Instant settlement (seconds)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    <span>Zero chargebacks</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    <span>No bank account required</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    <span>Accept both crypto and cards</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500 mt-1">✓</span>
                    <span>Free enterprise features included</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Demo Video */}
        <section className="mb-12">
          <div className="glass-pane rounded-xl border p-6">
            <h2 className="text-2xl font-bold mb-4">See {brand.name} in Action</h2>
            <PortalPayVideo />
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold mb-6 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4 max-w-3xl mx-auto">
            <details className="glass-pane rounded-lg border p-5">
              <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                Is it hard to switch from {data.name} to {brand.name}?
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {dePortal(`No! Most businesses complete the switch in under an hour. You can export your data from ${data.name}, set up your PortalPay account, and start accepting payments the same day. Many merchants run both systems in parallel for a week to ensure a smooth transition. Our support team helps with the migration.`)}
              </p>
            </details>

            <details className="glass-pane rounded-lg border p-5">
              <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                Will my customers need crypto wallets?
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                No. While crypto enthusiasts can pay directly with their wallets, any customer can pay using
                credit/debit cards, Apple Pay, or Google Pay through our onramp. We handle the crypto conversion
                instantly. Your customers won't even know it's crypto - they just see a simple payment experience.
              </p>
            </details>

            <details className="glass-pane rounded-lg border p-5">
              <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                How much will I really save?
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                On average, businesses save 70-85% on total payment processing costs. The exact savings depend on
                your monthly volume and current {data.name} plan. Use our cost calculator above to see your specific
                savings. Most businesses save between $2,000-10,000 annually.
              </p>
            </details>

            <details className="glass-pane rounded-lg border p-5">
              <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                Do I need a bank account to use {brand.name}?
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                No! This is a major advantage over {data.name}. Payments go directly to your crypto wallet. You can
                hold as crypto, convert to stablecoins, or cash out to your local currency. Perfect for international
                businesses or new companies that struggle with traditional banking.
              </p>
            </details>

            <details className="glass-pane rounded-lg border p-5">
              <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                What about features I use in {data.name}?
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                {brand.name} includes all essential features for your industry - and they're all free. We have specialized
                POS systems for restaurants, retail, hotels, and more. Check the feature comparison table above to see
                specific capabilities. In most cases, you'll get more features than {data.name} offers, at no extra cost.
              </p>
            </details>

            <details className="glass-pane rounded-lg border p-5">
              <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                Is settlement really instant?
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Yes! Crypto transactions settle in seconds, not days. Compare this to {data.name}'s 1-3 business day
                wait. You have immediate access to your funds for restocking, payroll, or any other needs. No more
                waiting for batch processing or dealing with hold times.
              </p>
            </details>
          </div>
        </section>

        {/* Final CTA */}
        <section className="glass-pane rounded-2xl border p-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Save ${(annualSavings / 1000).toFixed(1)}k+ Per Year?
          </h2>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            Join thousands of businesses that switched from {data.name} to {brand.name} and never looked back.
            Lower fees, better features, instant settlement.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/admin"
              className="px-8 py-4 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-lg font-semibold hover:opacity-90 transition"
            >
              Start Saving Today
            </Link>
            <Link
              href="/terminal"
              className="px-8 py-4 rounded-md border text-lg font-semibold hover:bg-accent transition"
            >
              Try Demo Portal
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            No bank account required • No monthly fees • Switch in minutes
          </p>
        </section>
      </div>
    </div>
  );
}
