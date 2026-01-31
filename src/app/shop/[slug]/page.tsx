import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getContainer } from "@/lib/cosmos";
import { getBrandConfig } from "@/config/brands";
import { getBaseUrl } from "@/lib/base-url";
import ShopClient, { ShopConfig } from "./ShopClient";
import { InventoryItem } from "@/types/inventory";

const BLOCKED_URL_PART = "a311dcf8";
const LEGACY_LOGO = "cblogod.png";

function sanitizeShopTheme(theme: any) {
  if (!theme) return theme;
  const t = { ...theme };

  // Sanitize URLs
  if (t.brandLogoUrl && (t.brandLogoUrl.includes(BLOCKED_URL_PART) || t.brandLogoUrl.includes(LEGACY_LOGO))) {
    t.brandLogoUrl = "/BasaltSurgeWideD.png";
  }
  if (t.brandFaviconUrl && (t.brandFaviconUrl.includes(BLOCKED_URL_PART) || t.brandFaviconUrl.includes(LEGACY_LOGO))) {
    t.brandFaviconUrl = "/Surge.png";
  }

  // Sanitize Colors (Legacy Teal -> Basalt Green)
  if (t.primaryColor === '#10b981' || t.primaryColor === '#14b8a6' || t.primaryColor === '#0d9488') {
    t.primaryColor = '#35ff7c';
  }
  if (t.secondaryColor === '#2dd4bf' || t.secondaryColor === '#22d3ee') {
    t.secondaryColor = '#FF6B35';
  }
  return t;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cleanSlug = slug.toLowerCase();
  const baseUrl = getBaseUrl();
  const brand = getBrandConfig();

  try {
    const container = await getContainer();
    const { resources: configs } = await container.items
      .query({
        query: "SELECT c.name, c.description, c.bio, c.theme FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true)",
        parameters: [{ name: "@slug", value: cleanSlug }]
      })
      .fetchAll();

    const config = configs[0] as {
      name?: string;
      description?: string;
      bio?: string;
      theme?: {
        brandLogoUrl?: string;
        brandFaviconUrl?: string;
        primaryColor?: string;
        logos?: { favicon?: string };
      };
    } | undefined;

    if (config?.theme) {
      config.theme = sanitizeShopTheme(config.theme);
    }

    if (config?.name) {
      // Use shop-specific favicon via query parameter
      const faviconUrl = `/api/favicon?shop=${encodeURIComponent(cleanSlug)}`;
      const shopUrl = `${baseUrl}/shop/${cleanSlug}`;
      const shopTitle = config.name;
      const shopDescription = config.description || config.bio || `Shop at ${config.name}`;
      const themeColor = config.theme?.primaryColor || brand.colors.primary || '#0ea5e9';

      // Force HTTPS for production URLs in metadata
      const safeBaseUrl = /localhost|127\.0\.0\.1/i.test(baseUrl)
        ? baseUrl
        : baseUrl.replace(/^http:\/\//, "https://");
      const safeShopUrl = /localhost|127\.0\.0\.1/i.test(shopUrl)
        ? shopUrl
        : shopUrl.replace(/^http:\/\//, "https://");

      return {
        title: shopTitle,
        description: shopDescription,
        icons: {
          icon: [{ url: faviconUrl }],
          shortcut: [faviconUrl],
          apple: [{ url: faviconUrl }],
        },
        metadataBase: new URL(safeBaseUrl),
        alternates: {
          canonical: safeShopUrl,
        },
        openGraph: {
          type: 'website',
          siteName: brand.name || 'PortalPay',
          title: shopTitle,
          description: shopDescription,
          url: safeShopUrl,
          locale: 'en_US',
          // Explicitly set images to use the generated opengraph-image route
          // This prevents inheritance from root layout's site-config images
          images: [
            {
              url: `${safeBaseUrl}/shop/${cleanSlug}/opengraph-image`,
              width: 1200,
              height: 630,
              alt: `${shopTitle} - Shop Preview`,
              type: 'image/png',
            },
          ],
        },
        twitter: {
          card: 'summary_large_image',
          title: `${shopTitle} • ${brand.name || 'Portalpay'}`,
          description: shopDescription,
          site: '@portalpay', // Can be customized per brand if needed
          // Explicitly set images to use the generated twitter-image route
          images: [
            {
              url: `${safeBaseUrl}/shop/${cleanSlug}/twitter-image`,
              width: 1200,
              height: 600,
              alt: 'Shop Preview',
              type: 'image/png',
            },
          ],
        },
        other: {
          'theme-color': themeColor,
          'msapplication-TileColor': themeColor,
        },
        robots: {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
          },
        },
      };
    }
  } catch {
    // Fall through to default
  }

  return {
    title: "Shop",
    description: "Browse products and checkout",
    openGraph: {
      type: 'website',
      siteName: brand.name || 'PortalPay',
      title: "Shop",
      description: "Browse products and checkout",
    },
    twitter: {
      card: 'summary_large_image',
      title: "Shop",
      description: "Browse products and checkout",
    },
  };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cleanSlug = slug.toLowerCase();

  // 1. Resolve Shop Config
  const container = await getContainer();

  const { resources: configs } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true)",
      parameters: [{ name: "@slug", value: cleanSlug }]
    })
    .fetchAll();

  const config = configs[0] as (ShopConfig & { wallet: string }) | undefined;

  // Merge site_config for payment preferences (defaultPaymentToken / accumulationMode)
  if (config && config.wallet) {
    const foundWallet = config.wallet.toLowerCase();
    // 1. Determine Brand Key
    const envBrandKey = (process.env.BRAND_KEY || process.env.NEXT_PUBLIC_BRAND_KEY || "basaltsurge").toLowerCase();
    const brandKey = (config as any).brandKey || envBrandKey;

    // 2. Resolve Doc IDs
    const docIdBase = "site:config";
    const brandDocId = (brandKey && brandKey !== "portalpay") ? `${docIdBase}:${brandKey}` : `${docIdBase}:portalpay`;

    let siteConf: any = null;
    try {
      // Try Brand-Specific
      const { resource } = await container.item(brandDocId, foundWallet).read<any>();
      siteConf = resource;
    } catch { }

    if (!siteConf && brandDocId !== "site:config:portalpay") {
      try {
        // Try Legacy Shared
        const { resource } = await container.item("site:config:portalpay", foundWallet).read<any>();
        siteConf = resource;
      } catch { }
    }

    if (!siteConf) {
      try {
        // Try Global Legacy
        const { resource } = await container.item("site:config", foundWallet).read<any>();
        siteConf = resource;
      } catch { }
    }

    if (siteConf) {
      if (siteConf.defaultPaymentToken) (config as any).defaultPaymentToken = siteConf.defaultPaymentToken;
      if (siteConf.accumulationMode) (config as any).accumulationMode = siteConf.accumulationMode;
    }
  }

  if (config?.theme) {
    config.theme = sanitizeShopTheme(config.theme);
  }

  if (!config) {
    return notFound();
  }

  // 2. Fetch Inventory (Reverted to Client-Side Fetching due to data issues)
  // We pass empty array to trigger ShopClient's useEffect to fetch from API
  const items: InventoryItem[] = [];

  // 3. Fetch Reviews
  const { resources: reviews } = await container.items
    .query({
      query: "SELECT * FROM c WHERE c.subjectType = 'shop' AND c.subjectId = @slug",
      parameters: [{ name: "@slug", value: config.slug || cleanSlug }]
    })
    .fetchAll();

  const resolvedWallet = config.wallet || configs.find((c: any) => c.wallet)?.wallet || "";

  return (
    <ShopClient
      config={config}
      items={items}
      reviews={reviews}
      merchantWallet={resolvedWallet}
      cleanSlug={config.slug || cleanSlug}
    />
  );
}
