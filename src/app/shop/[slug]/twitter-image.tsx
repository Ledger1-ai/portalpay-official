import { ImageResponse } from 'next/og';
import { getContainer } from '@/lib/cosmos';
import { getBrandConfig } from '@/config/brands';
import {
  escapeForSvg,
  wrapTextToLines,
  hexToRgb,
  getContrastingColor,
} from '@/lib/og-image-utils';
import { loadPPSymbol, fetchWithCache } from '@/lib/og-asset-loader';

export const runtime = 'nodejs';
export const alt = 'Shop';
export const size = { width: 1200, height: 600 }; // Twitter summary_large_image ratio
export const contentType = 'image/png';

// Layout constants
const CANVAS = { width: 1200, height: 600 };

/**
 * Generate star rating display
 */
function generateStars(rating: number, x: number, y: number, size: number = 18, color: string = '#fbbf24'): string {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  let stars = '';

  for (let i = 0; i < 5; i++) {
    const starX = x + i * (size + 3);
    const isFilled = i < fullStars || (i === fullStars && hasHalf);
    stars += `
      <text x="${starX}" y="${y}" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="${size}" 
            fill="${isFilled ? color : 'rgba(255,255,255,0.2)'}">★</text>
    `;
  }

  return stars;
}

/**
 * Generate the base gradient background
 */
function generateBaseBackground(primaryColor: string, secondaryColor: string): string {
  const primary = primaryColor || '#0ea5e9';
  const secondary = secondaryColor || '#22c55e';

  const pRgb = hexToRgb(primary);
  const sRgb = hexToRgb(secondary);

  const blend = {
    r: Math.round((pRgb.r + sRgb.r) / 2),
    g: Math.round((pRgb.g + sRgb.g) / 2),
    b: Math.round((pRgb.b + sRgb.b) / 2),
  };
  const blendColor = `rgb(${blend.r}, ${blend.g}, ${blend.b})`;

  return `
    <defs>
      <radialGradient id="meshGrad1" cx="0%" cy="0%" r="70%">
        <stop offset="0%" style="stop-color:${primary};stop-opacity:0.45" />
        <stop offset="100%" style="stop-color:${primary};stop-opacity:0" />
      </radialGradient>
      <radialGradient id="meshGrad2" cx="100%" cy="100%" r="70%">
        <stop offset="0%" style="stop-color:${secondary};stop-opacity:0.45" />
        <stop offset="100%" style="stop-color:${secondary};stop-opacity:0" />
      </radialGradient>
      <radialGradient id="meshGrad3" cx="50%" cy="50%" r="60%">
        <stop offset="0%" style="stop-color:${blendColor};stop-opacity:0.2" />
        <stop offset="100%" style="stop-color:${blendColor};stop-opacity:0" />
      </radialGradient>
      <linearGradient id="baseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#0f0f14" />
        <stop offset="50%" style="stop-color:#0a0a0f" />
        <stop offset="100%" style="stop-color:#050508" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:${primary}" />
        <stop offset="50%" style="stop-color:${blendColor}" />
        <stop offset="100%" style="stop-color:${secondary}" />
      </linearGradient>
      <filter id="logoGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="18" result="blur"/>
        <feFlood flood-color="${primary}" flood-opacity="0.35"/>
        <feComposite in2="blur" operator="in"/>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <!-- Overlay gradients for cover photo -->
      <linearGradient id="coverOverlay" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
        <stop offset="60%" style="stop-color:#000000;stop-opacity:0.3" />
        <stop offset="100%" style="stop-color:#000000;stop-opacity:0.8" />
      </linearGradient>
      <linearGradient id="sidepaneOverlay" x1="100%" y1="0%" x2="0%" y2="0%">
        <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
        <stop offset="70%" style="stop-color:#000000;stop-opacity:0.5" />
        <stop offset="100%" style="stop-color:#0a0a0f;stop-opacity:1" />
      </linearGradient>
    </defs>
    
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#baseGrad)" />
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#meshGrad1)" />
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#meshGrad2)" />
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="url(#meshGrad3)" />
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="white" opacity="0.012" filter="url(#noise)" />
  `;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cleanSlug = slug.toLowerCase();

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
    console.error('[Shop Twitter Image] Database error:', error);
  }

  const brand = getBrandConfig();
  const sharp = (await import('sharp')).default;

  const primaryColor = shopConfig?.theme?.primaryColor || '#0ea5e9';
  const secondaryColor = shopConfig?.theme?.secondaryColor || '#22c55e';
  const shopName = shopConfig?.name || 'Shop';
  const shopDescription = shopConfig?.description || shopConfig?.bio || '';
  const shopLogoUrl = shopConfig?.theme?.brandLogoUrl || '';
  const coverPhotoUrl = shopConfig?.theme?.coverPhotoUrl || '';

  const textColor = '#ffffff';
  const mutedColor = 'rgba(255, 255, 255, 0.6)';

  // Load cover photo and determine layout
  let coverPhotoBuffer: Buffer | null = null;
  let useFullWidthLayout = false; // false = sidepane, true = full-width top

  // Cover photo target dimensions for Twitter
  const COVER_FULL_WIDTH = { width: CANVAS.width, height: 280 };
  const COVER_SIDEPANE = { width: 450, height: CANVAS.height };
  const COVER_CORNER_RADIUS = 14;
  const COVER_PADDING = 10; // Padding inside the matte area

  if (coverPhotoUrl) {
    try {
      let absoluteCoverUrl = coverPhotoUrl;
      if (coverPhotoUrl.startsWith('/')) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
        absoluteCoverUrl = `${baseUrl}${coverPhotoUrl}`;
      }

      console.log('[Shop Twitter Image] Loading cover photo from:', absoluteCoverUrl);
      const rawCover = await fetchWithCache(absoluteCoverUrl);

      if (rawCover) {
        const meta = await sharp(rawCover).metadata();
        const aspectRatio = (meta.width || 1) / (meta.height || 1);
        useFullWidthLayout = aspectRatio >= 1.5; // Wide/landscape → full-width top

        console.log('[Shop Twitter Image] Cover photo aspect ratio:', aspectRatio.toFixed(2),
          useFullWidthLayout ? '→ full-width layout' : '→ sidepane layout');

        const targetDims = useFullWidthLayout ? COVER_FULL_WIDTH : COVER_SIDEPANE;

        // Use 'inside' to preserve aspect ratio without cropping
        // Calculate the inner area (accounting for padding)
        const innerWidth = targetDims.width - (COVER_PADDING * 2);
        const innerHeight = targetDims.height - (COVER_PADDING * 2);

        // Resize image to fit within inner area
        const resizedImage = await sharp(rawCover)
          .resize(innerWidth, innerHeight, {
            fit: 'inside', // Fits within dimensions, preserving aspect ratio
            withoutEnlargement: false
          })
          .png()
          .toBuffer();

        // Get actual dimensions after resize
        const resizedMeta = await sharp(resizedImage).metadata();
        const imgW = resizedMeta.width || innerWidth;
        const imgH = resizedMeta.height || innerHeight;

        // Create rounded corners mask
        const roundedMask = Buffer.from(`
          <svg width="${imgW}" height="${imgH}">
            <rect x="0" y="0" width="${imgW}" height="${imgH}" 
                  rx="${COVER_CORNER_RADIUS}" ry="${COVER_CORNER_RADIUS}" 
                  fill="white"/>
          </svg>
        `);

        // Apply rounded corners to the image
        const roundedImage = await sharp(resizedImage)
          .composite([{
            input: roundedMask,
            blend: 'dest-in'
          }])
          .png()
          .toBuffer();

        // Create the matte background: blurred version of the same image
        // First, resize the original image to cover the target area
        const blurredBackground = await sharp(rawCover)
          .resize(targetDims.width, targetDims.height, {
            fit: 'cover', // Fill entire area (may crop)
            position: 'center'
          })
          .blur(30) // Heavy blur for frosted glass effect
          .modulate({ brightness: 0.5 }) // Darken so sharp image pops
          .png()
          .toBuffer();

        const matteBuffer = blurredBackground;

        // Calculate centering position for the image within the matte
        const offsetX = Math.round((targetDims.width - imgW) / 2);
        const offsetY = Math.round((targetDims.height - imgH) / 2);

        // Composite rounded image centered on matte
        coverPhotoBuffer = await sharp(matteBuffer)
          .composite([{
            input: roundedImage,
            top: offsetY,
            left: offsetX
          }])
          .png()
          .toBuffer();

        console.log('[Shop Twitter Image] Cover photo processed: target', targetDims.width, 'x', targetDims.height,
          '| image', imgW, 'x', imgH, '| offset', offsetX, ',', offsetY);
      }
    } catch (err) {
      console.error('[Shop Twitter Image] Error loading cover photo:', err);
      coverPhotoBuffer = null;
    }
  }

  // Calculate layout positions based on cover photo layout
  const layout = useFullWidthLayout || !coverPhotoBuffer
    ? {
      // Full-width layout OR no cover: content below cover area
      shopLogo: { x: 50, y: coverPhotoBuffer ? 310 : 160, size: 120 },
      text: {
        x: 190,
        titleY: coverPhotoBuffer ? 350 : 200,
        descStartY: coverPhotoBuffer ? 420 : 280,
        lineHeight: 26,
        maxWidth: 850,
      },
      platformBadge: { symbolSize: 26 },
    }
    : {
      // Sidepane layout: content on left, cover on right
      shopLogo: { x: 45, y: 130, size: 110 },
      text: {
        x: 170,
        titleY: 160,
        descStartY: 240,
        lineHeight: 26,
        maxWidth: 420, // Narrower to leave room for cover
      },
      platformBadge: { symbolSize: 26 },
    };

  // Wrap description based on layout
  const descLines = wrapTextToLines(shopDescription, layout.text.maxWidth, 18, 3);

  // Load platform symbol
  const platformSymbol = await loadPPSymbol(layout.platformBadge.symbolSize);

  // Load shop logo
  let shopLogoBuffer: Buffer | null = null;
  if (shopLogoUrl) {
    try {
      let absoluteLogoUrl = shopLogoUrl;
      if (shopLogoUrl.startsWith('/')) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';
        absoluteLogoUrl = `${baseUrl}${shopLogoUrl}`;
      }

      const rawLogo = await fetchWithCache(absoluteLogoUrl);
      if (rawLogo) {
        shopLogoBuffer = await sharp(rawLogo)
          .resize(layout.shopLogo.size, layout.shopLogo.size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer();
      }
    } catch (err) {
      console.error('[Shop Twitter Image] Error loading shop logo:', err);
      shopLogoBuffer = null;
    }
  }

  // Build SVG content
  const svgContent = `
    <svg width="${CANVAS.width}" height="${CANVAS.height}" xmlns="http://www.w3.org/2000/svg">
      ${generateBaseBackground(primaryColor, secondaryColor)}
      
      <!-- Accent bar at top -->
      <rect x="0" y="0" width="${CANVAS.width}" height="5" fill="url(#accentGrad)" />
      
      ${useFullWidthLayout && coverPhotoBuffer ? `
        <!-- Cover photo overlay gradient (for full-width layout) -->
        <rect x="0" y="0" width="${CANVAS.width}" height="280" fill="url(#coverOverlay)" />
      ` : ''}
      
      ${!useFullWidthLayout && coverPhotoBuffer ? `
        <!-- Sidepane overlay gradient (for sidepane layout) -->
        <rect x="${CANVAS.width - 450}" y="0" width="450" height="${CANVAS.height}" fill="url(#sidepaneOverlay)" />
      ` : ''}
      
      <!-- Shop logo placeholder if no logo -->
      ${!shopLogoBuffer ? `
        <circle cx="${layout.shopLogo.x + layout.shopLogo.size / 2}" 
                cy="${layout.shopLogo.y + layout.shopLogo.size / 2}" 
                r="${layout.shopLogo.size / 2}" 
                fill="${primaryColor}" 
                opacity="0.2"
                filter="url(#logoGlow)" />
        <text x="${layout.shopLogo.x + layout.shopLogo.size / 2}" 
              y="${layout.shopLogo.y + layout.shopLogo.size / 2 + 28}" 
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="56" 
              font-weight="700" 
              fill="${primaryColor}"
              text-anchor="middle">${escapeForSvg(shopName.charAt(0).toUpperCase())}</text>
      ` : ''}
      
      <!-- Shop name -->
      <text x="${layout.text.x}" y="${layout.text.titleY}" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="${useFullWidthLayout || !coverPhotoBuffer ? 44 : 36}" 
            font-weight="700" 
            fill="${textColor}"
            style="text-shadow: 0 2px 6px rgba(0,0,0,0.5);">
        ${escapeForSvg(shopName.length > 30 ? shopName.slice(0, 28) + '...' : shopName)}
      </text>
      
      <!-- Rating stars -->
      ${reviewCount > 0 ? `
        <g transform="translate(${layout.text.x}, ${layout.text.titleY + 22})">
          ${generateStars(avgRating, 0, 16, 14, '#fbbf24')}
          <text x="90" y="16" 
                font-family="system-ui, -apple-system, sans-serif" 
                font-size="13" 
                fill="${mutedColor}">
            ${avgRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'})
          </text>
        </g>
      ` : ''}
      
      <!-- Decorative line below title -->
      <line x1="${layout.text.x}" y1="${layout.text.titleY + 50}" 
            x2="${layout.text.x + Math.min(layout.text.maxWidth, 500)}" y2="${layout.text.titleY + 50}" 
            stroke="${primaryColor}" stroke-width="1" opacity="0.25" />
      
      <!-- Description lines -->
      ${descLines.map((line, idx) => `
        <text x="${layout.text.x}" y="${layout.text.descStartY + idx * layout.text.lineHeight}" 
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="17" 
              fill="${mutedColor}"
              style="text-shadow: 0 1px 3px rgba(0,0,0,0.4);">
          ${escapeForSvg(line)}
        </text>
      `).join('')}
      
      <!-- "Shop Now" CTA - positioned after description -->
      <rect x="${layout.text.x}" y="${layout.text.descStartY + descLines.length * layout.text.lineHeight + 16}" 
            width="130" height="38" rx="6" 
            fill="${primaryColor}" />
      <text x="${layout.text.x + 65}" y="${layout.text.descStartY + descLines.length * layout.text.lineHeight + 16 + 25}" 
            font-family="system-ui, -apple-system, sans-serif" 
            font-size="15" 
            font-weight="600" 
            fill="${getContrastingColor(primaryColor)}"
            text-anchor="middle">
        Shop Now
      </text>
      
      <!-- Platform branding badge (bottom - position based on layout) -->
      <g transform="translate(${!useFullWidthLayout && coverPhotoBuffer ? 45 : CANVAS.width - 210}, ${CANVAS.height - 42})">
        <text x="${layout.platformBadge.symbolSize + 6}" y="15" 
              font-family="system-ui, -apple-system, sans-serif" 
              font-size="12" 
              fill="rgba(255,255,255,0.4)"
              letter-spacing="0.05em">
          POWERED BY ${escapeForSvg(brand.name.toUpperCase())}
        </text>
      </g>
    </svg>
  `;

  // Start with SVG base
  let composite = sharp(Buffer.from(svgContent))
    .resize(CANVAS.width, CANVAS.height);

  const composites: Array<{ input: Buffer; top: number; left: number }> = [];

  // Add cover photo
  if (coverPhotoBuffer) {
    if (useFullWidthLayout) {
      composites.push({
        input: coverPhotoBuffer,
        top: 0,
        left: 0,
      });
    } else {
      composites.push({
        input: coverPhotoBuffer,
        top: 0,
        left: CANVAS.width - 450,
      });
    }
  }

  // Add shop logo
  if (shopLogoBuffer) {
    composites.push({
      input: shopLogoBuffer,
      top: layout.shopLogo.y,
      left: layout.shopLogo.x,
    });
  }

  // Add platform symbol (position based on layout - bottom left for sidepane, bottom right for full-width)
  if (platformSymbol) {
    const platformSymbolLeft = !useFullWidthLayout && coverPhotoBuffer ? 45 : CANVAS.width - 210;
    composites.push({
      input: platformSymbol,
      top: CANVAS.height - 42 + 1,
      left: platformSymbolLeft,
    });
  }

  if (composites.length > 0) {
    composite = sharp(Buffer.from(svgContent))
      .resize(CANVAS.width, CANVAS.height)
      .composite(composites);
  }

  const buffer = await composite.png().toBuffer();

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${buffer.toString('base64')}`}
          alt={shopName}
          width={CANVAS.width}
          height={CANVAS.height}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
