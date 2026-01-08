import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createMeshGradient, escapeForSvg, truncateText, wrapTextToLines, OG_LAYOUT, TEXT_SHADOWS, renderLineWithEmphasis, wrapTitleToLines, WATERMARK } from '@/lib/og-image-utils';
import { loadTwemojiPng, loadPPSymbol, loadPublicImageBuffer } from '@/lib/og-asset-loader';
import { getBrandConfig } from '@/config/brands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Industries (browse) OG image
 * Distinct visual: sweeping arc of large industry emojis on glass backplates with warm gradient palette and motion arcs.
 */
export async function GET(_req: NextRequest) {
  const brand = getBrandConfig();
  try {
    // Warm, energetic palette distinct from other pages
    const colors = ['#ff7e5f', '#ff3d77', '#8b5cf6'];
    const backgroundSvg = createMeshGradient(colors);
    let imageBuffer = await sharp(Buffer.from(backgroundSvg)).resize(1200, 630).png().toBuffer();

    // Subtle watermark texture
    const watermarkBuf = await loadPublicImageBuffer('watermark.png');
    if (watermarkBuf) {
      imageBuffer = await sharp(imageBuffer).composite([{ input: watermarkBuf, top: 0, left: 0 }]).png().toBuffer();
    }

    // PortalPay symbol (top-right)
    const ppSymbolOverlay: Buffer | null = await loadPPSymbol(OG_LAYOUT.ppSymbol.size);

    // Copy (left pane)
    const eyebrowText = 'Accept Crypto Payments';
    const heroText = 'Across All Industries';
    const subtitleText = 'Delight customers in retail, dining, hospitality, luxury, logistics, and more with instant settlement and 0.5–1% fees.';
    const leftX = 50;
    const centerX = 600;
    const maxTextWidth = 520;

    const titleFontSize = 66;
    const titleLines = wrapTextToLines(heroText, maxTextWidth, titleFontSize, 2);
    const descFontSize = 21;
    const descLines = wrapTextToLines(subtitleText, maxTextWidth, descFontSize, 3);

    const titleStartY = 280;
    const descStartY = 380;

    const linesSvg = descLines
      .map(
        (ln, idx) =>
          `<text x="${centerX}" y="${descStartY + idx * 24}" font-family="Arial, sans-serif" font-size="${descFontSize}" fill="rgba(255,255,255,0.92)" text-anchor="middle" style="text-shadow: ${TEXT_SHADOWS.desc};">${escapeForSvg(
            ln
          )}</text>`
      )
      .join('\n');

    // Right-half composition: sweeping arc of emojis on glass backplates
    const arcCenterX = 600;
    const arcCenterY = 470;
    const arcRadius = 420;

    // Industry emoji set (retail, dining, hospitality, luxury, art, logistics)
    const emojiList = ['🛍️', '🍽️', '🏨', '💎', '🎨', '🚚', '🏬', '🏭', '✈️', '🏦', '🧪', '⚕️'];
    const N = emojiList.length;
    const startDeg = 140; // degrees
    const endDeg = 400; // degrees
    const step = (endDeg - startDeg) / Math.max(1, N - 1);

    const plateSize = 120;
    const emojiSize = 88;

    // Prebuild a glass backplate buffer (blurred translucent circle with stroke)
    const glassPlateSvg = Buffer.from(`
      <svg width="${plateSize}" height="${plateSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="glassGrad" cx="50%" cy="40%" r="70%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0.28)"/>
            <stop offset="100%" style="stop-color:rgba(255,255,255,0.14)"/>
          </radialGradient>
        </defs>
        <circle cx="${plateSize / 2}" cy="${plateSize / 2}" r="${(plateSize / 2) - 2}" fill="url(#glassGrad)" />
        <circle cx="${plateSize / 2}" cy="${plateSize / 2}" r="${(plateSize / 2) - 2}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
      </svg>
    `);
    const glassPlateBuf = await sharp(glassPlateSvg).png().toBuffer();

    const composites: any[] = [];

    // Text, labels, arcs, and labels on left pane
    const textSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="9" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id="arcStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0.05)"/>
            <stop offset="50%" style="stop-color:rgba(255,255,255,0.12)"/>
            <stop offset="100%" style="stop-color:rgba(255,255,255,0.05)"/>
          </linearGradient>
        </defs>

        <!-- Eyebrow -->
        <text x="${centerX}" y="225" font-family="Arial, sans-serif" font-size="23" font-weight="800" fill="rgba(255,255,255,0.9)" letter-spacing="1.5" text-anchor="middle">
          ${escapeForSvg(eyebrowText)}
        </text>

        <!-- Title -->
        ${titleLines
        .map(
          (ln, idx) =>
            `<text x="${centerX}" y="${titleStartY + 18 + idx * 78}" font-family="Arial, sans-serif" font-size="${titleFontSize + 18}" font-weight="900" fill="#FFFFFF" filter="url(#glow)" text-anchor="middle" style="text-shadow: 4px 4px 15px rgba(0,0,0,0.55);">${escapeForSvg(
              ln
            )}</text>`
        )
        .join('')}

        <!-- Description -->
        ${descLines
        .map(
          (ln, idx) =>
            `<text x="${centerX}" y="${descStartY + 48 + idx * 34}" font-family="Arial, sans-serif" font-size="${descFontSize + 8}" fill="rgba(255,255,255,0.95)" text-anchor="middle" style="text-shadow: ${TEXT_SHADOWS.desc};">${escapeForSvg(
              ln
            )}</text>`
        )
        .join('\n')
      }

        <!-- Motion guide arcs behind emoji orbit -->
        <path d="M ${arcCenterX - arcRadius} ${arcCenterY} A ${arcRadius} ${arcRadius} 0 0 1 ${arcCenterX + arcRadius} ${arcCenterY}" stroke="url(#arcStroke)" stroke-width="2" fill="none" />
        <path d="M ${arcCenterX - arcRadius + 30} ${arcCenterY - 28} A ${arcRadius - 30} ${arcRadius - 30} 0 0 1 ${arcCenterX + arcRadius - 30} ${arcCenterY - 28}" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" fill="none" />
        <path d="M ${arcCenterX - arcRadius + 60} ${arcCenterY - 54} A ${arcRadius - 60} ${arcRadius - 60} 0 0 1 ${arcCenterX + arcRadius - 60} ${arcCenterY - 54}" stroke="rgba(255,255,255,0.06)" stroke-width="1.2" fill="none" />

        <!-- Bottom branding -->
        <text x="600" y="610" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="rgba(255,255,255,0.92)" letter-spacing="2" text-anchor="middle">
          ${escapeForSvg(`POWERED BY ${String(brand.name || '').toUpperCase()}`)}
        </text>
      </svg>
    `;
    composites.push({ input: Buffer.from(textSvg), top: 0, left: 0 });

    // Compose PP symbol top-right
    if (ppSymbolOverlay) {
      composites.push({ input: ppSymbolOverlay, top: OG_LAYOUT.ppSymbol.y, left: OG_LAYOUT.ppSymbol.x });
    }

    // Place emoji plates along the arc
    for (let i = 0; i < N; i++) {
      const deg = startDeg + i * step;
      const rad = (deg * Math.PI) / 180;
      const plateLeft = Math.round(arcCenterX + arcRadius * Math.cos(rad) - plateSize / 2);
      const plateTop = Math.round(arcCenterY + arcRadius * Math.sin(rad) - plateSize / 2);

      // Backplate first
      composites.push({ input: glassPlateBuf, top: plateTop, left: plateLeft });

      // Emoji png
      const emojiPng = await loadTwemojiPng(emojiList[i], emojiSize);
      if (emojiPng) {
        const emojiLeft = plateLeft + Math.round((plateSize - emojiSize) / 2);
        const emojiTop = plateTop + Math.round((plateSize - emojiSize) / 2);
        composites.push({ input: emojiPng, top: emojiTop, left: emojiLeft });
      }
    }

    // Final composite
    imageBuffer = await sharp(imageBuffer).composite(composites).jpeg({ quality: 90 }).toBuffer();

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('OG image generation error (crypto-payments browse):', error);
    const fallbackSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#ff7e5f;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
        <text x="600" y="320" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle">
          Crypto Payments
        </text>
        <text x="600" y="380" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.9)" text-anchor="middle">
          Across Every Industry
        </text>
      </svg>
    `;
    const fb = await sharp(Buffer.from(fallbackSvg)).resize(1200, 630).jpeg({ quality: 85 }).toBuffer();
    return new NextResponse(new Uint8Array(fb), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  }
}
