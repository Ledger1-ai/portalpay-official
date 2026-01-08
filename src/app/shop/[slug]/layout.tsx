import { Metadata } from 'next';
import { getBrandConfig } from '@/config/brands';

type ShopConfig = {
  name: string;
  description?: string;
  bio?: string;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  // 1. Resolve Brand Identity (Platform vs Partner))
  const { getContainerIdentity, getBrandConfigFromCosmos } = await import('@/lib/brand-config');
  const { brandKey } = getContainerIdentity();
  const { brand } = await getBrandConfigFromCosmos(brandKey);

  try {
    const { slug } = await params;

    // Fetch directly from Cosmos DB (avoid self-fetch issues)
    const { getContainer } = await import('@/lib/cosmos');
    const container = await getContainer();

    // Resolve slug to wallet using Cosmos query (matches /api/shop/slug pattern)
    let wallet: string | null = null;
    try {
      const { resources } = await container.items
        .query({
          query: "SELECT TOP 1 c.wallet, c.slug FROM c WHERE c.type='shop_config' AND c.slug=@slug",
          parameters: [{ name: '@slug', value: slug }]
        })
        .fetchAll();

      if (resources && resources.length > 0) {
        wallet = resources[0]?.wallet || null;
      }
    } catch (err) {
      console.error('Failed to resolve shop slug:', err);
      return {
        title: `Shop Not Found • ${brand.name}`,
        description: `This shop could not be found on ${brand.name}`,
      };
    }

    if (!wallet) {
      return {
        title: `Shop Not Found • ${brand.name}`,
        description: `This shop could not be found on ${brand.name}`,
      };
    }

    // Fetch shop config
    let config: ShopConfig & { theme?: { brandLogoUrl?: string; brandFaviconUrl?: string; appleTouchIconUrl?: string } } = { name: 'Shop' };
    try {
      const { resource } = await container.item('shop:config', wallet).read<any>();
      if (resource) {
        config = {
          name: resource.name || 'Shop',
          description: resource.description,
          bio: resource.bio,
          theme: resource.theme,
        };
      }
    } catch { }

    const name = config.name || 'Shop';
    const description = config.description || config.bio || `Visit ${name} on ${brand.name}`;
    const truncatedDescription = description.length > 160 ? description.slice(0, 157) + '...' : description;

    // Priority: Shop Specific -> /api/favicon (Brand Dynamic)
    // We do NOT fallback to the logo for the favicon, as that causes the issue where the logo is used instead of the favicon.
    // /api/favicon will automatically serve the correct brand favicon.
    const logoRaw = config.theme?.brandLogoUrl || brand.logos.app;
    const isLogoBlocked = logoRaw && (logoRaw.includes("a311dcf8") || logoRaw.includes("cblogod.png"));
    const logo = isLogoBlocked ? "/BasaltSurgeWideD.png" : logoRaw;

    const shopFaviconRaw = config.theme?.brandFaviconUrl;
    const isFaviconBlocked = shopFaviconRaw && (shopFaviconRaw.includes("a311dcf8") || shopFaviconRaw.includes("cblogod.png"));
    const shopFavicon = isFaviconBlocked ? undefined : shopFaviconRaw;
    const faviconUrl = shopFavicon || "/api/favicon";

    const shopApple = config.theme?.appleTouchIconUrl;
    const appleUrl = shopApple || "/apple-touch-icon.png";

    return {
      title: `${name} • ${brand.name}`,
      description: truncatedDescription,
      applicationName: brand.name,
      keywords: [brand.name, 'crypto', 'payments', 'shop', name, 'blockchain', 'commerce'],
      category: 'commerce',
      icons: {
        icon: faviconUrl,
        apple: appleUrl,
        shortcut: faviconUrl,
      },
      openGraph: {
        type: 'website',
        siteName: brand.name,
        title: `${name} • ${brand.name}`,
        description: truncatedDescription,
        images: logo ? [{ url: logo }] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${name} • ${brand.name}`,
        description: truncatedDescription,
        images: logo ? [logo] : undefined,
      },
    };
  } catch (error) {
    return {
      title: `Shop • ${brand.name}`,
      description: `Discover shops on ${brand.name} - Accept crypto payments with ease.`,
      applicationName: brand.name,
      keywords: [brand.name, 'crypto', 'payments', 'shop'],
      openGraph: {
        type: 'website',
        siteName: brand.name,
      },
      twitter: {
        card: 'summary_large_image',
      },
    };
  }
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
