import { Metadata } from 'next';
import Link from 'next/link';
import IndustriesClient from './IndustriesClient';
import { getBrandConfig } from '@/config/brands';
import { getBaseUrl } from '@/lib/base-url';
import { isPartnerContext } from '@/lib/env';
import BrandText from '@/components/brand-text';
import GeometricBackground from '@/components/landing/GeometricBackground';

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrandConfig();
  const BASE_URL = isPartnerContext() ? getBaseUrl() : 'https://surge.basalthq.com';
  return {
    title: `Crypto Payments for Every Industry | BasaltSurge`,
    description: 'Accept crypto payments in your industry. Restaurant POS, retail inventory, hotel PMS, and more. Lower fees (0.5-1%), instant settlement, free enterprise features.',
    openGraph: {
      title: `Crypto Payments for Every Industry | BasaltSurge`,
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
  return (
    <div className="min-h-screen">
      {/* HERO: The Financial Revolution */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-950 via-orange-950 to-black text-white">
        <GeometricBackground theme="orange" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-500/20 via-transparent to-transparent opacity-50" />
        <div className="absolute inset-0 bg-[url('/hex-pattern.svg')] opacity-5" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/5 text-sm font-medium mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              Industry Solutions
            </span>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight">
              The Financial
              <span className="block bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent pb-2">
                Revolution
              </span>
              <span className="block text-3xl md:text-4xl font-bold text-white/80 mt-2">For Your Industry</span>
            </h1>

            <p className="text-xl md:text-2xl text-orange-100/80 mb-8 max-w-2xl leading-relaxed">
              Legacy payment processors weren't built for you. They were built to <strong className="text-white">extract from you</strong>.
              <span className="block mt-4 text-white font-semibold">It's time to own your payment infrastructure.</span>
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Link
                href="/admin"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-lg font-bold hover:scale-105 transition-transform shadow-2xl shadow-orange-500/30"
              >
                Start the Revolution →
              </Link>
              <Link
                href="#industries"
                className="px-8 py-4 rounded-lg border-2 border-white/30 text-lg font-semibold hover:bg-white/10 transition backdrop-blur-sm"
              >
                Find Your Industry
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* THE OLD WAY vs THE NEW WAY */}
      <section className="py-16 md:py-24 bg-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Stop Renting Your Payment Stack
            </h2>
            <p className="text-xl text-neutral-400 max-w-3xl mx-auto">
              Every industry has been conditioned to accept exploitative payment fees.
              <BrandText /> breaks that conditioning.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* THE OLD WAY */}
            <div className="bg-red-950/20 border border-red-900/30 rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-red-400 mb-6 flex items-center gap-3">
                <span className="text-4xl">❌</span> The Old Way
              </h3>
              <ul className="space-y-4 text-lg">
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span className="text-neutral-300"><strong className="text-red-400">2.9% + $0.30</strong> per transaction</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span className="text-neutral-300">Wait <strong className="text-red-400">3-7 days</strong> for your own money</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span className="text-neutral-300">Account freezes with <strong className="text-red-400">no warning</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span className="text-neutral-300">Industry-specific tools cost <strong className="text-red-400">extra</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-400 mt-1">•</span>
                  <span className="text-neutral-300">You're at their mercy. <strong className="text-red-400">Always.</strong></span>
                </li>
              </ul>
            </div>

            {/* THE NEW WAY */}
            <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-2xl p-8">
              <h3 className="text-2xl font-bold text-emerald-400 mb-6 flex items-center gap-3">
                <span className="text-4xl">✓</span> The <BrandText /> Way
              </h3>
              <ul className="space-y-4 text-lg">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span className="text-neutral-300"><strong className="text-emerald-400">0.5-1%</strong> flat fee. All-in.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span className="text-neutral-300"><strong className="text-emerald-400">Instant</strong> settlement to your wallet</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span className="text-neutral-300">Your keys, <strong className="text-emerald-400">your funds</strong>, always</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span className="text-neutral-300">Free POS, inventory, PMS — <strong className="text-emerald-400">included</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-1">•</span>
                  <span className="text-neutral-300">Permissionless. <strong className="text-emerald-400">Sovereign.</strong></span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PROSPERITY BY THE NUMBERS */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-neutral-950 to-black text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Prosperity by the Numbers
          </h2>
          <p className="text-xl text-neutral-400 mb-12 max-w-3xl mx-auto">
            This isn't about saving a little. It's about <span className="text-[var(--primary)] font-semibold">reclaiming your margins</span>.
          </p>

          <div className="grid md:grid-cols-4 gap-6 mb-12">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="text-5xl font-black text-[var(--primary)] mb-2">70%+</div>
              <div className="text-sm text-neutral-400">Lower processing fees</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="text-5xl font-black text-[var(--primary)] mb-2">$0</div>
              <div className="text-sm text-neutral-400">Monthly fees or minimums</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="text-5xl font-black text-[var(--primary)] mb-2">∞</div>
              <div className="text-sm text-neutral-400">Scalability included</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
              <div className="text-5xl font-black text-[var(--primary)] mb-2">24/7</div>
              <div className="text-sm text-neutral-400">Settlement. No holidays.</div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[var(--primary)]/20 via-[var(--primary)]/10 to-[var(--primary)]/20 rounded-2xl p-8 border border-[var(--primary)]/30 max-w-3xl mx-auto">
            <div className="text-3xl md:text-4xl font-bold mb-2">$24,000+ saved per year</div>
            <div className="text-lg text-neutral-400">
              On $1M in transactions. That's profit you're leaving on the table with legacy processors.
            </div>
          </div>
        </div>
      </section>

      {/* INDUSTRIES GRID */}
      <section id="industries" className="py-16 md:py-24 bg-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Built for Your Industry
            </h2>
            <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
              Every industry has unique needs. Explore solutions tailored to your sector —
              with free POS, inventory, and management tools included.
            </p>
          </div>

          <IndustriesClient />

          {/* CTA */}
          <div className="text-center mt-16">
            <div className="bg-gradient-to-br from-orange-950/50 to-amber-950/50 rounded-2xl p-8 border border-orange-900/30 max-w-4xl mx-auto">
              <h3 className="text-3xl font-bold text-white mb-4">
                Ready to Join the Revolution?
              </h3>
              <p className="text-lg text-orange-100/70 mb-6 max-w-2xl mx-auto">
                Set up your store in minutes. No bank account required. No approval process.
                Just connect your wallet and start accepting payments.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link
                  href="/admin"
                  className="px-8 py-4 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-lg font-bold hover:scale-105 transition-transform"
                >
                  Get Started Free
                </Link>
                <Link
                  href="/terminal"
                  className="px-8 py-4 rounded-lg border-2 border-white/30 text-white text-lg font-semibold hover:bg-white/10 transition"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
