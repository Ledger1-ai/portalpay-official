
import { generateBasaltOG } from '@/lib/og-template';
import { getContainer } from '@/lib/cosmos';
import { getBrandKey } from '@/config/brands';
import { fetchWithCache, loadBasaltDefaults } from '@/lib/og-asset-loader';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const alt = 'User Profile';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

function getColorsFromWallet(wallet: string): string[] {
  let hash = 0;
  for (let i = 0; i < wallet.length; i++) {
    hash = ((hash << 5) - hash) + wallet.charCodeAt(i);
    hash = hash & hash;
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = Math.abs((hash * 137) % 360);
  // Convert HSL to Hex or just return HSL strings (Satori supports HSL)
  return [`hsl(${hue1}, 70%, 50%)`, `hsl(${hue2}, 70%, 50%)`];
}

type Profile = {
  displayName?: string;
  pfpUrl?: string;
  bio?: string;
  profileConfig?: {
    backgroundUrl?: string;
    themeColor?: string;
  };
  roles?: {
    merchant?: boolean;
    buyer?: boolean;
  };
};

export default async function Image({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await params;

  // Fetch Profile
  let profile: Profile = {};
  try {
    const container = await getContainer();
    let brandKey: string | undefined = undefined;
    try { brandKey = getBrandKey(); } catch { brandKey = undefined; }

    // Logic ported from route.ts
    const isPlatform = String(process.env.CONTAINER_TYPE || process.env.NEXT_PUBLIC_CONTAINER_TYPE || 'platform').toLowerCase() === 'platform';
    const legacyId = `${wallet}:user`;
    const brandId = brandKey ? `${wallet}:user:${String(brandKey).toLowerCase()}` : legacyId;

    let primary: any | undefined;
    let legacy: any | undefined;

    try {
      const { resource } = await container.item(brandId, wallet).read<any>();
      primary = resource || undefined;
    } catch { }

    try {
      const { resource } = await container.item(legacyId, wallet).read<any>();
      legacy = resource || undefined;
    } catch { }

    const merged = isPlatform ? { ...(legacy || {}), ...(primary || {}) } : (primary ?? legacy);

    if (merged) {
      profile = {
        displayName: merged.displayName,
        pfpUrl: merged.pfpUrl,
        bio: merged.bio,
        profileConfig: merged.profileConfig,
        roles: merged.roles,
      };
    }
  } catch (err) {
    console.warn('Failed to fetch profile:', err);
  }

  const displayName = profile.displayName || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  const pfpUrl = profile.pfpUrl;
  const bio = profile.bio;
  const backgroundUrl = profile.profileConfig?.backgroundUrl;
  // Default to blue if no theme color, or derive from wallet? Route uses #3b82f6
  const themeColor = profile.profileConfig?.themeColor || '#3b82f6';
  const isMerchant = profile.roles?.merchant;
  const isBuyer = profile.roles?.buyer;

  // Prepare Assets

  // 1. Background
  let bgDataUri: string | undefined;
  if (backgroundUrl) {
    // Fetch and resize
    const buffer = await fetchWithCache(backgroundUrl);
    if (buffer) {
      const resized = await sharp(buffer).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
      bgDataUri = `data:image/jpeg;base64,${resized.toString('base64')}`;
    }
  }

  if (!bgDataUri) {
    // Use wallet gradient if no background image
    const colors = getColorsFromWallet(wallet);
    // Create a simple gradient SVG buffer
    // generateBasaltOG can take a data URI. 
    // Let's create a gradient using sharp/svg or just pass colors? 
    // generateBasaltOG expects an image for glass effect.
    // We can generate an SVG gradient.
    const gradientSvg = `
      <svg width="2400" height="1260" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${colors[0]};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${colors[1]};stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="2400" height="1260" fill="url(#grad)" />
      </svg>`;
    const buffer = await sharp(Buffer.from(gradientSvg)).png().toBuffer();
    bgDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
  }

  // 2. Medallion (PFP)
  let medallionDataUri: string | undefined;
  if (pfpUrl) {
    const buffer = await fetchWithCache(pfpUrl);
    if (buffer) {
      // Resize PFP
      const resized = await sharp(buffer).resize(500, 500, { fit: 'cover' }).png().toBuffer();
      medallionDataUri = `data:image/png;base64,${resized.toString('base64')}`;
    }
  }

  // Fallback PFP? Maybe a generated avatar or default icon? 
  // If undefined, template uses Basalt logo. That's fine.


  const assets = await loadBasaltDefaults();

  return await generateBasaltOG({
    // Defaults from loader
    bgImage: bgDataUri || assets.bgBase64,
    blurredBgImage: assets.blurredBgBase64,
    medallionImage: medallionDataUri || assets.medallionBase64,
    poweredByImage: assets.logoBase64,
    cornerShieldImage: assets.shieldBase64,

    primaryColor: '#35ff7c',
    leftWing: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 }}>{(assets.brand.name || 'BASALT SURGE').toUpperCase()}</div>
        <div style={{ fontSize: 60, color: '#35ff7c', fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1.1, textTransform: 'uppercase', textAlign: 'right', wordBreak: 'break-word', maxWidth: '100%' }}>
          {displayName.toUpperCase()}
        </div>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginTop: 4 }}>PROFILE</div>
      </div>
    ),
    rightWing: (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {(isMerchant || isBuyer) && (
            <div style={{ display: 'flex', gap: 16 }}>
              {isMerchant && (
                <div style={{ padding: '8px 24px', borderRadius: 20, background: '#10b981', color: 'white', fontWeight: 700, fontSize: 24 }}>Merchant</div>
              )}
              {isBuyer && (
                <div style={{ padding: '8px 24px', borderRadius: 20, background: '#3b82f6', color: 'white', fontWeight: 700, fontSize: 24 }}>Buyer</div>
              )}
            </div>
          )}

          {bio ? (
            <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4, maxHeight: 180, overflow: 'hidden' }}>
              {bio.length > 120 ? bio.slice(0, 120) + '...' : bio}
            </div>
          ) : (
            <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>No bio available</div>
          )}
        </div>
      </>
    )
  });
}
