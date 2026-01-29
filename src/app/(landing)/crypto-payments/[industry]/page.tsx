import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getIndustryData, getAllIndustries } from '@/lib/landing-pages/industries';
import { INDUSTRY_DEMO_RECEIPTS } from '@/lib/landing-pages/industry-demo-receipts';
import { isPageEnabled } from '@/lib/landing-pages/seo-settings';
import { CostCalculator } from '@/components/landing/CostCalculator';
import { IndustryPortalPreview } from '@/components/landing/IndustryPortalPreview';
import { getRecipientAddress } from '@/lib/thirdweb/client';
import InteractiveChecklist from '@/components/ui/interactive-checklist';
import { buildPortalUrlForTest } from '@/lib/receipts';
import AcceptedServices from '@/components/landing/AcceptedServices';
import PortalPayVideo from '@/components/landing/PortalPayVideo';
import { getBrandConfig } from '@/config/brands';
import { getBaseUrl } from '@/lib/base-url';
import { isPartnerContext } from '@/lib/env';

export const dynamic = 'force-dynamic';

// Generate static params for all industries (disabled for dynamic build)
async function generateStaticParamsInternal() {
  const industries = getAllIndustries();
  return industries.map((industry) => ({
    industry: industry.slug,
  }));
}

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: Promise<{ industry: string }> }): Promise<Metadata> {
  const { industry } = await params;
  const data = getIndustryData(industry);
  const brand = getBrandConfig();
  const isPartner = isPartnerContext();
  const BASE_URL = isPartner ? getBaseUrl() : 'https://surge.basalthq.com';
  const dePortal = (s: any) =>
    typeof s === 'string'
      ? (isPartner ? s.replaceAll('PortalPay', brand.name).replaceAll('BasaltSurge', brand.name) : s)
      : s;

  if (!data) {
    return {
      title: 'Industry Not Found',
    };
  }

  return {
    title: data.title,
    description: data.metaDescription,
    keywords: data.keywords.join(', '),
    openGraph: {
      title: data.title,
      description: data.metaDescription,
      url: `${BASE_URL}/crypto-payments/${data.slug}`,
      siteName: brand.name,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.metaDescription,
    },
    alternates: {
      canonical: `${BASE_URL}/crypto-payments/${data.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function IndustryLandingPage({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params;
  const data = getIndustryData(industry);
  const brand = getBrandConfig();
  const isPartner = isPartnerContext();
  const BASE_URL = isPartner ? getBaseUrl() : 'https://surge.basalthq.com';
  const dePortal = (s: any) =>
    typeof s === 'string'
      ? (isPartner ? s.replaceAll('PortalPay', brand.name).replaceAll('BasaltSurge', brand.name) : s)
      : s;

  // Check if the industry slug exists in our data
  if (!data) {
    notFound();
  }

  // Check if the page is enabled in SEO settings (respects admin panel toggles)
  const pageEnabled = await isPageEnabled('industry', industry);
  if (!pageEnabled) {
    notFound();
  }

  const recipient = getRecipientAddress();

  // Get industry-specific rotating receipts
  const industryReceipts = INDUSTRY_DEMO_RECEIPTS[industry] || [
    {
      lineItems: [
        { label: 'Sample Item', priceUsd: 25 },
        { label: 'Tax', priceUsd: 2 },
      ],
      totalUsd: 27,
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Structured Data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: `${brand.name} for ${data.name}`,
            applicationCategory: 'BusinessApplication',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
              description: '0.5-1% per transaction, no monthly fees',
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '4.8',
              reviewCount: '127',
            },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: (data.faqs || []).map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
              { "@type": "ListItem", position: 2, name: "Industries", item: `${BASE_URL}/crypto-payments` },
              { "@type": "ListItem", position: 3, name: data.name, item: `${BASE_URL}/crypto-payments/${data.slug}` },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "HowTo",
            name: `How to set up ${brand.name} for ${data.name}`,
            step: (data.setupSteps || []).map((s, i) => ({
              "@type": "HowToStep",
              position: i + 1,
              name: String(s),
            })),
            tool: [
              { "@type": "HowToTool", name: `${brand.name} Admin` },
              { "@type": "HowToTool", name: "Wallet/Onramp" },
            ],
            supply: [
              { "@type": "HowToSupply", name: "Business details" },
              { "@type": "HowToSupply", name: "Brand assets" },
            ],
          }),
        }}
      />

      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Breadcrumb Navigation */}
        <nav className="text-sm mb-6 text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          {' / '}
          <Link href="/crypto-payments" className="hover:text-foreground">
            Industries
          </Link>
          {' / '}
          <span className="text-foreground">{data.name}</span>
        </nav>

        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-12">
          <div>
            <div className="inline-flex items-center gap-2 text-4xl mb-4">
              <span>{data.icon}</span>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                {dePortal(data.heroHeadline)}
              </h1>
            </div>
            <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
              {dePortal(data.heroSubheadline)}
            </p>

            <div className="flex flex-wrap gap-3 mb-6">
              <Link
                href={data.heroCTA.primaryLink}
                className="px-6 py-3 rounded-md bg-pp-secondary text-[var(--primary-foreground)] font-semibold hover:opacity-90 transition"
              >
                {data.heroCTA.primary}
              </Link>
              <Link
                href={data.heroCTA.secondaryLink}
                className="px-6 py-3 rounded-md border font-semibold hover:bg-accent transition"
              >
                {data.heroCTA.secondary}
              </Link>
            </div>

            {/* Key Stats */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="rounded-md border p-3 bg-background/60">
                <div className="text-2xl font-bold text-[var(--primary)]">0.5-1%</div>
                <div className="text-muted-foreground">Processing Fee</div>
              </div>
              <div className="rounded-md border p-3 bg-background/60">
                <div className="text-2xl font-bold text-[var(--primary)]">$0</div>
                <div className="text-muted-foreground">Monthly Cost</div>
              </div>
              <div className="rounded-md border p-3 bg-background/60">
                <div className="text-2xl font-bold text-[var(--primary)]">70%+</div>
                <div className="text-muted-foreground">Savings</div>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <IndustryPortalPreview
            industryReceipts={industryReceipts}
            recipient={recipient}
          />
        </section>

        {/* Benefits Grid */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Why {data.name} Choose {brand.name}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.benefits.map((benefit, idx) => (
              <div key={idx} className="glass-pane rounded-xl border p-5">
                <div className="text-3xl mb-3">{benefit.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{dePortal(benefit.title)}</h3>
                <p className="text-sm text-muted-foreground mb-3">{dePortal(benefit.description)}</p>
                {benefit.stat && (
                  <div className="text-sm font-semibold text-[var(--primary)]">
                    {benefit.stat}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="mb-8">
          <AcceptedServices size="md" />
        </div>

        {/* Cost Calculator */}
        <section className="mb-12">
          <CostCalculator
            industry={data.name}
            defaultVolume={data.avgMonthlyVolume}
            competitors={data.competitorComparison}
          />
        </section>

        {/* Use Cases */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Real-World Examples</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.useCases.map((useCase, idx) => (
              <div key={idx} className="glass-pane rounded-xl border p-6">
                <h3 className="text-lg font-semibold mb-3">{useCase.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{useCase.description}</p>
                <div className="text-sm border-t pt-4">
                  <div className="font-medium mb-2">Example:</div>
                  <p className="text-muted-foreground mb-2">{useCase.example}</p>
                  {useCase.savings && (
                    <div className="text-lg font-bold text-green-500">{useCase.savings}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What's Included */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Everything Included Free</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.includedFeatures.map((feature, idx) => (
              <div key={idx} className="glass-pane rounded-lg border p-4 flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{feature.name}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
                {feature.usualCost && (
                  <div className="text-sm text-muted-foreground ml-4 whitespace-nowrap">
                    Usually {feature.usualCost}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Setup Steps */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Get Started in Minutes</h2>
          <div className="glass-pane rounded-xl border p-6">
            <InteractiveChecklist
              storageKey={`landing:${data.slug}:setup`}
              title={`Setup Checklist for ${data.name}`}
              steps={data.setupSteps}
            />
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
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {data.faqs.map((faq, idx) => (
              <details key={idx} className="glass-pane rounded-lg border p-5">
                <summary className="font-semibold cursor-pointer hover:text-[var(--primary)]">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        {data.testimonials && data.testimonials.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">What {data.name} Are Saying</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.testimonials.map((testimonial, idx) => (
                <div key={idx} className="glass-pane rounded-xl border p-6">
                  <p className="text-lg mb-4 italic">"{testimonial.quote}"</p>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="font-semibold">{testimonial.author}</div>
                      <div className="text-sm text-muted-foreground">{testimonial.business}</div>
                    </div>
                    {testimonial.savings && (
                      <div className="text-sm font-bold text-green-500">{testimonial.savings}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Final CTA */}
        <section className="glass-pane rounded-2xl border p-8 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Start Accepting Crypto Payments Today
          </h2>
          <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            Join thousands of {data.name.toLowerCase()} saving 70% on payment processing fees.
            Set up in minutes, no monthly costs, no hidden fees.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/admin"
              className="px-8 py-4 rounded-md bg-pp-secondary text-[var(--primary-foreground)] text-lg font-semibold hover:opacity-90 transition"
            >
              Get Started Free
            </Link>
            <a
              href={buildPortalUrlForTest(recipient)}
              className="px-8 py-4 rounded-md border text-lg font-semibold hover:bg-accent transition"
            >
              Try Demo Portal
            </a>
          </div>
        </section>

        {/* Related Industries */}
        {data.relatedIndustries.length > 0 && (
          <section className="mt-12">
            <h3 className="text-lg font-semibold mb-4">Related Industries</h3>
            <div className="flex flex-wrap gap-2">
              {data.relatedIndustries.map((slug) => (
                <Link
                  key={slug}
                  href={`/crypto-payments/${slug}`}
                  className="px-4 py-2 rounded-md border hover:bg-accent transition capitalize"
                >
                  {slug.replace('-', ' ')}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
