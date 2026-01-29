import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllLocations, getLocationData } from '@/lib/landing-pages/locations';
import FlagMeshCard from '@/components/landing/FlagMeshCard';
import { getFlagColors } from '@/lib/flags';
import IndustryTabs from '@/components/landing/IndustryTabs';
import PortalPayVideo from '@/components/landing/PortalPayVideo';
import { getBrandConfig } from '@/config/brands';
import { getBaseUrl } from '@/lib/base-url';
import { isPartnerContext } from '@/lib/env';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllLocations().map((loc) => ({ slug: loc.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = getLocationData(slug);
  const brand = getBrandConfig();
  const BASE_URL = isPartnerContext() ? getBaseUrl() : 'https://surge.basalthq.com';
  const dePortal = (s: string) => (isPartnerContext() ? s.replaceAll('PortalPay', brand.name).replaceAll('BasaltSurge', brand.name) : s);
  if (!data) {
    return {
      title: 'Location Not Found',
      description: 'The requested location does not exist.',
    };
  }
  const title = dePortal(data.title);
  const description = dePortal(data.metaDescription || '');
  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/locations/${data.slug}`,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BASE_URL}/locations/${data.slug}`,
      siteName: brand.name,
    },
  };
}

export default async function LocationPage({ params }: PageProps) {
  const { slug } = await params;
  const data = getLocationData(slug);
  if (!data) {
    notFound();
  }
  if (!data) return null;
  const brand = getBrandConfig();
  const isPartner = isPartnerContext();
  const dePortal = (s: any) =>
    typeof s === 'string' ? (isPartner ? s.replaceAll('PortalPay', brand.name).replaceAll('BasaltSurge', brand.name) : s) : s;

  const flagColors = getFlagColors(data.country);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <nav className="text-sm mb-6 text-muted-foreground">
        <a href="/" className="hover:text-foreground">Home</a> {' / '}
        <a href="/locations" className="hover:text-foreground">Locations</a> {' / '}
        <span className="text-foreground">{data.name}</span>
      </nav>

      <div className="mb-6">
        <FlagMeshCard colors={flagColors} className="w-full" />
      </div>

      <h1 className="text-3xl font-bold mb-2">
        {data.name}{data.country ? `, ${data.country}` : ''}
      </h1>

      {data.localContext && (
        <p className="text-muted-foreground mb-6">{dePortal(data.localContext as any)}</p>
      )}

      <div className="grid gap-3 mb-8 text-sm">
        {typeof data.population === 'number' && (
          <div className="rounded-md border p-3 bg-background/60">
            Population: {data.population.toLocaleString()}
          </div>
        )}
        {typeof data.businessCount === 'number' && (
          <div className="rounded-md border p-3 bg-background/60">
            Businesses: {data.businessCount.toLocaleString()}
          </div>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Explore Industries</h2>
        <IndustryTabs slugs={data.popularIndustries} />
      </section>

      <section className="mt-16">
        <PortalPayVideo />
      </section>
    </div>
  );
}
