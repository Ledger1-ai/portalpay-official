import { Metadata } from 'next';
import Link from 'next/link';
import { getBrandConfig } from '@/config/brands';
import { getBaseUrl } from '@/lib/base-url';
import { isPartnerContext } from '@/lib/env';
import ComparisonsClient from './ComparisonsClient';
import BrandText from '@/components/brand-text';
import GeometricBackground from '@/components/landing/GeometricBackground';

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrandConfig();
  const BASE_URL = isPartnerContext() ? getBaseUrl() : 'https://surge.basalthq.com';
  const title = `BasaltSurge vs Competitors | Compare Payment Processors`;
  const description = `Compare BasaltSurge with Stripe, Square, PayPal, Toast, and other payment processors. See how you can save 70%+ on fees with instant settlement and crypto payments.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/vs`,
      siteName: brand.name,
      type: 'website',
    },
    alternates: {
      canonical: `${BASE_URL}/vs`,
    },
  };
}

export default function ComparisonsIndexPage() {
  return (
    <div className="min-h-screen">
      {/* HERO: Break Free from Legacy Payments */}
      <section className="relative overflow-hidden bg-gradient-to-br from-black via-neutral-900 to-neutral-800 text-white">
        <GeometricBackground theme="primary" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[var(--primary)]/20 via-transparent to-transparent opacity-60" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-32">
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/5 text-sm font-medium mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              The Payment Revolution
            </span>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight">
              Break Free from
              <span className="block bg-gradient-to-r from-[var(--primary)] via-amber-400 to-orange-500 bg-clip-text text-transparent pb-2">
                Legacy Gatekeepers
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-neutral-300 mb-8 max-w-2xl leading-relaxed">
              Traditional payment processors extract <strong className="text-white">2.9% + $0.30</strong> from every transaction.
              They hold your money for days. They can freeze your account without warning.
              <span className="block mt-4 text-white font-semibold">It's time to take back control.</span>
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Link
                href="/admin"
                className="px-8 py-4 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-lg font-bold hover:scale-105 transition-transform shadow-2xl shadow-[var(--primary)]/30"
              >
                Claim Your Freedom →
              </Link>
              <Link
                href="#comparisons"
                className="px-8 py-4 rounded-lg border-2 border-white/30 text-lg font-semibold hover:bg-white/10 transition backdrop-blur-sm"
              >
                See the Truth
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* MANIFESTO: The Cost of Captivity */}
      <section className="py-16 md:py-24 bg-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                They Call it "Processing."
                <span className="block text-[var(--primary)]">We Call it Extraction.</span>
              </h2>
              <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                Every swipe, every tap, every checkout — legacy processors take their cut.
                Not because they earned it. Because they positioned themselves as the only option.
              </p>
              <p className="text-lg text-neutral-400 mb-6 leading-relaxed">
                <BrandText /> exists to shatter that illusion. We're not a slightly better processor.
                We're the <strong className="text-white">great unbundling</strong> of financial infrastructure.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-6 text-center">
                <div className="text-4xl font-black text-red-400 mb-2">2.9%</div>
                <div className="text-sm text-red-300">Their Cut</div>
                <div className="text-xs text-neutral-500 mt-1">+ hidden fees</div>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-6 text-center">
                <div className="text-4xl font-black text-emerald-400 mb-2">0.5%</div>
                <div className="text-sm text-emerald-300">Our Fee</div>
                <div className="text-xs text-neutral-500 mt-1">All-in. Period.</div>
              </div>
              <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-6 text-center">
                <div className="text-4xl font-black text-red-400 mb-2">3-7</div>
                <div className="text-sm text-red-300">Days to Settle</div>
                <div className="text-xs text-neutral-500 mt-1">Your money, hostage</div>
              </div>
              <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-6 text-center">
                <div className="text-4xl font-black text-emerald-400 mb-2">⚡</div>
                <div className="text-sm text-emerald-300">Instant</div>
                <div className="text-xs text-neutral-500 mt-1">Your money, yours</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROSPERITY: What Freedom Looks Like */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-neutral-950 to-black text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Prosperity is Not a Feature.
          </h2>
          <p className="text-xl text-neutral-400 mb-12 max-w-3xl mx-auto">
            It's the <span className="text-[var(--primary)] font-semibold">inevitable outcome</span> when
            you stop paying tribute to legacy systems.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white/5 rounded-2xl p-8 border border-white/10 hover:border-[var(--primary)]/50 transition group">
              <div className="text-5xl mb-4">💰</div>
              <h3 className="text-xl font-bold mb-2 group-hover:text-[var(--primary)] transition">Keep More</h3>
              <p className="text-neutral-400">
                Save $2,400 per $100k processed. Every year. That's not a discount — that's your margin, reclaimed.
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-8 border border-white/10 hover:border-[var(--primary)]/50 transition group">
              <div className="text-5xl mb-4">🚀</div>
              <h3 className="text-xl font-bold mb-2 group-hover:text-[var(--primary)] transition">Move Faster</h3>
              <p className="text-neutral-400">
                Instant settlement means cash flow today, not next week. Scale without waiting on someone else's schedule.
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-8 border border-white/10 hover:border-[var(--primary)]/50 transition group">
              <div className="text-5xl mb-4">🛡️</div>
              <h3 className="text-xl font-bold mb-2 group-hover:text-[var(--primary)] transition">Own Your Stack</h3>
              <p className="text-neutral-400">
                No account freezes. No arbitrary holds. Your funds flow to <strong>your wallet</strong>, under <strong>your control</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISONS GRID */}
      <section id="comparisons" className="py-16 md:py-24 bg-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              See the Competition. See the Difference.
            </h2>
            <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
              We don't fear comparison. We welcome it. Explore how <BrandText /> stacks up against every major
              payment processor — and why thousands are making the switch.
            </p>
          </div>

          <ComparisonsClient />
        </div>
      </section>
    </div>
  );
}
