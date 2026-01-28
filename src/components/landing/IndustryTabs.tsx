'use client';

import * as Tabs from '@radix-ui/react-tabs';
import Link from 'next/link';
import { PortalPreviewEmbedded } from '@/components/portal-preview-embedded';
import { useTheme } from "@/contexts/ThemeContext";
import { CostCalculator } from '@/components/landing/CostCalculator';
import InteractiveChecklist from '@/components/ui/interactive-checklist';
import { getRecipientAddress } from '@/lib/thirdweb/client';
import { buildPortalUrlForTest } from '@/lib/receipts';
import { getIndustryData } from '@/lib/landing-pages/industries';

interface IndustryTabsProps {
  slugs: string[];
  initialSlug?: string;
  className?: string;
}

/**
 * IndustryTabs
 * Renders tabs for the provided industry slugs and shows the full industry landing content
 * beneath the triggers. Mirrors the sections from the standalone industry landing page
 * for consistency.
 */
export default function IndustryTabs({ slugs, initialSlug, className = '' }: IndustryTabsProps) {
  const validSlugs = slugs.filter(Boolean);
  const defaultSlug = initialSlug && validSlugs.includes(initialSlug) ? initialSlug : validSlugs[0];

  const recipient = getRecipientAddress();
  const { theme: siteTheme } = useTheme();

  if (!validSlugs.length) {
    return (
      <div className="text-sm text-muted-foreground">
        No industries available for this location.
      </div>
    );
  }

  return (
    <Tabs.Root defaultValue={defaultSlug} className={className}>
      {/* Triggers */}
      <Tabs.List className="flex flex-wrap gap-2 mb-6">
        {validSlugs.map((slug) => {
          const data = getIndustryData(slug);
          const label = data ? data.name : slug.replace(/-/g, ' ');
          return (
            <Tabs.Trigger
              key={slug}
              value={slug}
              className="px-4 py-2 rounded-md border hover:bg-accent transition capitalize data-[state=active]:bg-accent data-[state=active]:border-foreground"
            >
              {label}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      {/* Contents */}
      {validSlugs.map((slug) => {
        const data = getIndustryData(slug);
        if (!data) {
          return (
            <Tabs.Content key={slug} value={slug} className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Industry not found.</div>
            </Tabs.Content>
          );
        }

        // Demo receipt tailored to industry
        const demoReceipt = {
          lineItems: [
            { label: 'Sample Item', priceUsd: 25 },
            { label: 'Tax', priceUsd: 2 },
          ],
          totalUsd: 27,
        };


        return (
          <Tabs.Content key={slug} value={slug} className="space-y-12">
            {/* Hero Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 text-4xl mb-4">
                  <span>{data.icon}</span>
                  <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                    {data.heroHeadline}
                  </h2>
                </div>
                <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                  {data.heroSubheadline}
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
                    <div className="text-2xl font-bold text-[var(--pp-secondary)]">0.5-1%</div>
                    <div className="text-muted-foreground">Processing Fee</div>
                  </div>
                  <div className="rounded-md border p-3 bg-background/60">
                    <div className="text-2xl font-bold text-[var(--pp-secondary)]">$0</div>
                    <div className="text-muted-foreground">Monthly Cost</div>
                  </div>
                  <div className="rounded-md border p-3 bg-background/60">
                    <div className="text-2xl font-bold text-[var(--pp-secondary)]">70%+</div>
                    <div className="text-muted-foreground">Savings</div>
                  </div>
                </div>
              </div>

              {/* Live Preview */}
              <div className="glass-pane rounded-2xl border p-4">
                <div className="text-sm font-semibold mb-3">Live Payment Portal Preview</div>
                <PortalPreviewEmbedded
                  theme={siteTheme}
                  demoReceipt={demoReceipt}
                  recipient={recipient as any}
                  className="max-w-[428px] mx-auto"
                  style={{
                    ["--pp-primary" as any]: siteTheme.primaryColor,
                    ["--pp-secondary" as any]: siteTheme.secondaryColor,
                    ["--pp-text" as any]: siteTheme.headerTextColor || siteTheme.textColor || "#ffffff",
                    ["--pp-text-header" as any]: siteTheme.headerTextColor || siteTheme.textColor || "#ffffff",
                    ["--pp-text-body" as any]: siteTheme.bodyTextColor || "#e5e7eb",
                    fontFamily: siteTheme.fontFamily,
                    backgroundImage: siteTheme.receiptBackgroundUrl ? `url(${siteTheme.receiptBackgroundUrl})` : "none",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div className="text-xs text-muted-foreground text-center mt-3">
                  Connect wallet to simulate checkout. Preview inherits your brand theme.
                </div>
              </div>
            </section>

            {/* Benefits Grid */}
            <section>
              <h3 className="text-2xl font-bold mb-6">Why {data.name} Choose {siteTheme.brandName || "BasaltSurge"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.benefits.map((benefit, idx) => (
                  <div key={idx} className="glass-pane rounded-xl border p-5">
                    <div className="text-3xl mb-3">{benefit.icon}</div>
                    <h4 className="text-lg font-semibold mb-2">{benefit.title}</h4>
                    <p className="text-sm text-muted-foreground mb-3">{benefit.description}</p>
                    {benefit.stat && (
                      <div className="text-sm font-semibold text-[var(--pp-secondary)]">
                        {benefit.stat}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Cost Calculator */}
            <section>
              <CostCalculator
                industry={data.name}
                defaultVolume={data.avgMonthlyVolume}
                competitors={data.competitorComparison}
              />
            </section>

            {/* Use Cases */}
            <section>
              <h3 className="text-2xl font-bold mb-6">Real-World Examples</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {data.useCases.map((useCase, idx) => (
                  <div key={idx} className="glass-pane rounded-xl border p-6">
                    <h4 className="text-lg font-semibold mb-3">{useCase.title}</h4>
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
            <section>
              <h3 className="text-2xl font-bold mb-6">Everything Included Free</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.includedFeatures.map((feature, idx) => (
                  <div key={idx} className="glass-pane rounded-lg border p-4 flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-1">{feature.name}</h4>
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
            <section>
              <h3 className="text-2xl font-bold mb-6">Get Started in Minutes</h3>
              <div className="glass-pane rounded-xl border p-6">
                <InteractiveChecklist
                  storageKey={`landing:${data.slug}:setup`}
                  title={`Setup Checklist for ${data.name}`}
                  steps={data.setupSteps}
                />
              </div>
            </section>

            {/* FAQ Section */}
            <section>
              <h3 className="text-2xl font-bold mb-6">Frequently Asked Questions</h3>
              <div className="space-y-4">
                {data.faqs.map((faq, idx) => (
                  <details key={idx} className="glass-pane rounded-lg border p-5">
                    <summary className="font-semibold cursor-pointer hover:text-[var(--pp-secondary)]">
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
              <section>
                <h3 className="text-2xl font-bold mb-6">What {data.name} Are Saying</h3>
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
              <h3 className="text-3xl font-bold mb-4">
                Start Accepting Crypto Payments Today
              </h3>
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
              <section className="mt-4">
                <h4 className="text-lg font-semibold mb-4">Related Industries</h4>
                <div className="flex flex-wrap gap-2">
                  {data.relatedIndustries.map((riSlug) => (
                    <Link
                      key={riSlug}
                      href={`/crypto-payments/${riSlug}`}
                      className="px-4 py-2 rounded-md border hover:bg-accent transition capitalize"
                    >
                      {riSlug.replace('-', ' ')}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </Tabs.Content>
        );
      })}
    </Tabs.Root>
  );
}
