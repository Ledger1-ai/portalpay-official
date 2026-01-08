
import { generateBasaltOG } from '@/lib/og-template';
import { getContainer } from '@/lib/cosmos';
import { getBrandConfig } from '@/config/brands';
import { loadPPSymbol, fetchWithCache, loadBasaltDefaults } from '@/lib/og-asset-loader';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const alt = 'Shop';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cleanSlug = slug.toLowerCase();
  const defaults = await loadBasaltDefaults();

  let shopConfig: {
    name?: string;
    description?: string;
    bio?: string;
    theme?: {
      primaryColor?: string;
      secondaryColor?: string;
      brandLogoUrl?: string;
      coverPhotoUrl?: string;
    };
  } | null = null;

  let avgRating = 0;
  let reviewCount = 0;

  try {
    const container = await getContainer();
    const { resources: configs } = await container.items
      .query({
        query: "SELECT c.name, c.description, c.bio, c.theme FROM c WHERE c.slug = @slug OR (c.customDomain = @slug AND c.customDomainVerified = true)",
        parameters: [{ name: "@slug", value: cleanSlug }]
      })
      .fetchAll();
    shopConfig = configs[0] || null;

    const { resources: reviews } = await container.items
      .query({
        query: "SELECT c.rating FROM c WHERE c.subjectType = 'shop' AND c.subjectId = @slug",
        parameters: [{ name: "@slug", value: cleanSlug }]
      })
      .fetchAll();

    if (reviews.length > 0) {
      reviewCount = reviews.length;
      avgRating = reviews.reduce((sum: number, r: any) => sum + Number(r.rating || 0), 0) / reviews.length;
    }
  } catch (error) {
    console.error('[Shop OG Image] Database error:', error);
  }

  const shopName = shopConfig?.name || 'Shop';
  const shopDescription = shopConfig?.description || shopConfig?.bio || '';
  const primaryColor = shopConfig?.theme?.primaryColor || '#0ea5e9';
  const shopLogoUrl = shopConfig?.theme?.brandLogoUrl;
  const coverPhotoUrl = shopConfig?.theme?.coverPhotoUrl;

  const getParams = (url: string) => {
    if (url.startsWith('/')) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';
      return `${baseUrl}${url}`;
    }
    return url;
  }

  // Prepare assets
  // Valid URL for cover photo to pass to bgImage (if remote, Satori might handle it, but better to fetch and base64 if we want consistent processing in our template)
  // Actually our template logic for `bgImage` expects a Data URI if we want to bypass file loading, OR we can pass a remote URL if `bgImage` is just passed to `src`.
  // But `generateBasaltOG` treats `bgImage` as the source.
  // For reliability, let's fetch and base64.

  let bgDataUri: string | undefined;
  if (coverPhotoUrl) {
    const absUrl = getParams(coverPhotoUrl);
    const buffer = await fetchWithCache(absUrl);
    if (buffer) {
      // Resize cover to reasonable size for BG to avoid massive payload
      const resized = await sharp(buffer).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
      bgDataUri = `data:image/jpeg;base64,${resized.toString('base64')}`;
    }
  }

  let blurredBgDataUri: string | undefined;
  if (coverPhotoUrl) {
    const absUrl = getParams(coverPhotoUrl);
    const buffer = await fetchWithCache(absUrl);
    if (buffer) {
      const blurred = await sharp(buffer).resize(1200, 630, { fit: 'cover' }).blur(20).jpeg({ quality: 80 }).toBuffer();
      blurredBgDataUri = `data:image/jpeg;base64,${blurred.toString('base64')}`;
    }
  }

  let medallionDataUri: string | undefined;
  if (shopLogoUrl) {
    const absUrl = getParams(shopLogoUrl);
    const buffer = await fetchWithCache(absUrl);
    if (buffer) {
      const resized = await sharp(buffer).resize(500, 500, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
      medallionDataUri = `data:image/png;base64,${resized.toString('base64')}`;
    }
  }

  return await generateBasaltOG({
    bgImage: bgDataUri || defaults.bgBase64,
    blurredBgImage: blurredBgDataUri || defaults.blurredBgBase64 || defaults.bgBase64,
    medallionImage: medallionDataUri || defaults.medallionBase64,
    cornerShieldImage: defaults.shieldBase64,
    primaryColor: primaryColor,
    leftWing: (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
          <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 }}>NO-KYC CRYPTO SHOP</div>
          <div style={{ fontSize: 60, color: '#35ff7c', fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1.1, textTransform: 'uppercase', textAlign: 'right', wordBreak: 'break-word', maxWidth: '100%' }}>
            {shopName.toUpperCase()}
          </div>
        </div>
        {reviewCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 32, color: '#fbbf24', marginRight: 10 }}>★</div>
            <div style={{ fontSize: 32, color: 'white', fontWeight: 600 }}>{avgRating.toFixed(1)}</div>
            <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.6)', marginLeft: 10 }}>({reviewCount})</div>
          </div>
        )}
      </>
    ),
    rightWing: (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {shopDescription ? (
            <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4, maxHeight: 120, overflow: 'hidden' }}>
              {shopDescription.length > 80 ? shopDescription.slice(0, 80) + '...' : shopDescription}
            </div>
          ) : (
            <div style={{ fontSize: 36, color: 'white', fontWeight: 600 }}>Verified Merchant</div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: primaryColor, padding: '16px 40px', borderRadius: 12, marginTop: 20
          }}>
            <div style={{ fontSize: 32, color: 'white', fontWeight: 700 }}>SHOP NOW</div>
          </div>
        </div>
      </>
    )
  });
}
