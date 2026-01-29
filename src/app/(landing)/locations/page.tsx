import type { Metadata } from 'next';
import Link from 'next/link';
import LocationsClient from './LocationsClient';
import { getBrandConfig } from '@/config/brands';
import { getBaseUrl } from '@/lib/base-url';
import { isPartnerContext } from '@/lib/env';
import BrandText from '@/components/brand-text';
import GeometricBackground from '@/components/landing/GeometricBackground';

export async function generateMetadata(): Promise<Metadata> {
  const brand = getBrandConfig();
  const BASE_URL = isPartnerContext() ? getBaseUrl() : 'https://surge.basalthq.com';
  const isPartner = isPartnerContext();
  const brandName = brand.name;

  const title = isPartner ? `Locations | ${brandName}` : `Locations | BasaltSurge`;
  const description = isPartner
    ? `Browse crypto payment landing pages by city. Explore local context, relevant industries, and how ${brandName} helps businesses accept digital payments worldwide.`
    : 'Browse crypto payment landing pages by city. Explore local context, relevant industries, and how BasaltSurge helps businesses accept digital payments worldwide.';
  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/locations`,
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/locations`,
      type: 'website',
      siteName: brand.name,
    },
  };
}

export default function LocationsIndexPage() {
  return (
    <div className="min-h-screen">
      {/* HERO: Commerce Without Borders */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white">
        <GeometricBackground theme="blue" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent opacity-50" />
        <div className="absolute inset-0 bg-[url('/world-dots.svg')] opacity-5" />

        <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-4xl">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/5 text-sm font-medium mb-8 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Global Commerce, Local Impact
            </span>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight">
              Commerce
              <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent pb-2">
                Without Borders
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-slate-300 mb-8 max-w-2xl leading-relaxed">
              From <strong className="text-white">Tokyo to Toronto</strong>, <strong className="text-white">Lagos to London</strong> —
              businesses are accepting payments without permission from legacy banks.
              <span className="block mt-4 text-white font-semibold">One wallet. Every customer. Instant settlement.</span>
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Link
                href="/admin"
                className="px-8 py-4 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-lg font-bold hover:scale-105 transition-transform shadow-2xl shadow-blue-500/30"
              >
                Go Global Today →
              </Link>
              <Link
                href="#map"
                className="px-8 py-4 rounded-lg border-2 border-white/30 text-lg font-semibold hover:bg-white/10 transition backdrop-blur-sm"
              >
                Explore the Map
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* GLOBAL PROSPERITY */}
      <section className="py-16 md:py-24 bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Global Prosperity Starts Local
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              Every city has unique commerce patterns. <BrandText /> adapts to local industries
              while connecting you to a global customer base.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition text-center">
              <div className="text-4xl mb-3">🌍</div>
              <h3 className="text-lg font-bold mb-2">190+ Countries</h3>
              <p className="text-sm text-slate-400">
                Accept payments from customers anywhere on Earth
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition text-center">
              <div className="text-4xl mb-3">💱</div>
              <h3 className="text-lg font-bold mb-2">Any Currency</h3>
              <p className="text-sm text-slate-400">
                Settle in stablecoins or local fiat equivalents
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition text-center">
              <div className="text-4xl mb-3">🏪</div>
              <h3 className="text-lg font-bold mb-2">Local Industries</h3>
              <p className="text-sm text-slate-400">
                Tailored solutions for your city's key sectors
              </p>
            </div>
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 hover:border-blue-500/50 transition text-center">
              <div className="text-4xl mb-3">🚫</div>
              <h3 className="text-lg font-bold mb-2">No Banks Required</h3>
              <p className="text-sm text-slate-400">
                Financial sovereignty for the unbanked and underserved
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FREEDOM STORIES */}
      <section className="py-16 md:py-24 bg-gradient-to-b from-slate-950 to-black text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Economic Freedom is a
                <span className="block text-blue-400">Human Right</span>
              </h2>
              <p className="text-lg text-slate-400 mb-6 leading-relaxed">
                In many regions, traditional banking excludes more people than it serves.
                Currency controls, account restrictions, and high fees keep prosperity out of reach.
              </p>
              <p className="text-lg text-slate-400 mb-6 leading-relaxed">
                <BrandText /> doesn't ask for permission. With just a wallet address, any business —
                from a coffee shop in Nairobi to a dispensary in Denver — can accept payments
                from customers worldwide.
              </p>
              <p className="text-lg text-white font-semibold">
                This is what financial inclusion actually looks like.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-gradient-to-r from-emerald-900/30 to-emerald-950/30 border border-emerald-800/50 rounded-xl p-6">
                <div className="text-2xl font-bold text-emerald-400 mb-1">$0 account minimum</div>
                <div className="text-sm text-slate-400">No bank account required. Ever.</div>
              </div>
              <div className="bg-gradient-to-r from-blue-900/30 to-blue-950/30 border border-blue-800/50 rounded-xl p-6">
                <div className="text-2xl font-bold text-blue-400 mb-1">Instant global reach</div>
                <div className="text-sm text-slate-400">Accept payments from day one, from anywhere.</div>
              </div>
              <div className="bg-gradient-to-r from-purple-900/30 to-purple-950/30 border border-purple-800/50 rounded-xl p-6">
                <div className="text-2xl font-bold text-purple-400 mb-1">Your keys, your funds</div>
                <div className="text-sm text-slate-400">Self-custody. No freezes. No holds.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LOCATIONS MAP & GRID */}
      <section id="map" className="py-16 md:py-24 bg-black">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Find Your City
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Explore city-focused landing pages with local context, popular industries,
              and specific guidance for businesses in your area.
            </p>
          </div>

          <LocationsClient />
        </div>
      </section>
    </div>
  );
}
