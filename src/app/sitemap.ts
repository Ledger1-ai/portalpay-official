import { MetadataRoute } from 'next';
import { getAllIndustries } from '@/lib/landing-pages/industries';
import { getAllComparisons } from '@/lib/landing-pages/comparisons';
import { getAllLocations } from '@/lib/landing-pages/locations';

export default function sitemap(): MetadataRoute.Sitemap {
  const industries = getAllIndustries();
  const comparisons = getAllComparisons();
  const locations = getAllLocations();
  const baseUrl = 'https://pay.ledger1.ai';
  const currentDate = new Date();

  return [
    // Main pages
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/admin`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/terminal`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/shop`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/developers`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },

    // Industry landing pages
    ...industries.map((industry) => ({
      url: `${baseUrl}/crypto-payments/${industry.slug}`,
      lastModified: currentDate,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),

    // Location pages
    ...locations.map((location) => ({
      url: `${baseUrl}/locations/${location.slug}`,
      lastModified: currentDate,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),

    // Comparison pages (high-intent traffic!)
    ...comparisons.map((comparison) => ({
      url: `${baseUrl}/vs/${comparison.slug}`,
      lastModified: currentDate,
      changeFrequency: 'monthly' as const,
      priority: 0.85, // High priority - people searching for alternatives are ready to switch
    })),

    // Future routes to add:
    // - Use case pages: /qr-code-payments, /low-fee-processing, etc.
    // - Token pages: /accept/usdc, /accept/bitcoin, etc.
    // - Location pages: /crypto-payments/new-york-ny, etc.
    // - Guide pages: /guides/accept-crypto-no-bank-account, etc.
  ];
}
