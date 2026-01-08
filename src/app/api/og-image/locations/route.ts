import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  createMeshGradient,
  escapeForSvg,
  wrapTextToLines,
  OG_LAYOUT,
  TEXT_SHADOWS,
} from '@/lib/og-image-utils';
import { loadPPSymbol, loadPublicImageBuffer, loadTwemojiPng } from '@/lib/og-asset-loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Locations (browse) OG image
 * Distinct visual: cooler world palette, geodesic arcs, center globe, and circular ring of region flags.
 */
export async function GET(_req: NextRequest) {
  try {
    // Cool "global" palette distinct from others
    const colors = ['#0ea5e9', '#22d3ee', '#1e40af']; // sky -> cyan -> deep indigo
    const backgroundSvg = createMeshGradient(colors);
    let imageBuffer = await sharp(Buffer.from(backgroundSvg)).resize(1200, 630).png().toBuffer();

    // Watermark overlay for subtle texture
    const watermarkBuf = await loadPublicImageBuffer('watermark.png');
    if (watermarkBuf) {
      imageBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuf, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // PortalPay symbol
    const ppSymbolOverlay: Buffer | null = await loadPPSymbol(OG_LAYOUT.ppSymbol.size);

    // Copy/text content (left)
    const eyebrowText = 'EXPLORE LOCATIONS';
    const heroText = 'Global Coverage';
    const subtitleText =
      'Find local currency support, fees, and instant settlement options across regions worldwide.';
    const leftX = 50;
    const maxTextWidth = 520;

    const titleFontSize = 70;
    const titleLines = wrapTextToLines(heroText, maxTextWidth, titleFontSize, 2);
    const descFontSize = 21;
    const descLines = wrapTextToLines(subtitleText, maxTextWidth, descFontSize, 3);

    const titleStartY = 255;
    const descStartY = 340 + (titleLines.length - 1) * 44;

    const linesSvg = descLines
      .map(
        (ln, idx) =>
          `<text x="${leftX}" y="${descStartY + idx * 26}" font-family="Arial, sans-serif" font-size="${descFontSize}" fill="rgba(255,255,255,0.92)" style="text-shadow: ${TEXT_SHADOWS.desc};">${escapeForSvg(
            ln
          )}</text>`
      )
      .join('\n');

    // Right-half composition center
    const cx = 840;
    const cy = 315;

    // Geodesic arcs (lat/long curves)
    const arcsSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="geoStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0.05)"/>
            <stop offset="50%" style="stop-color:rgba(255,255,255,0.14)"/>
            <stop offset="100%" style="stop-color:rgba(255,255,255,0.05)"/>
          </linearGradient>
        </defs>
        <!-- Longitudes -->
        <path d="M ${cx - 260} ${cy - 260} C ${cx - 120} ${cy} ${cx - 120} ${cy} ${cx - 260} ${cy + 260}" stroke="url(#geoStroke)" stroke-width="1.4" fill="none" opacity="0.6"/>
        <path d="M ${cx} ${cy - 280} C ${cx} ${cy - 80} ${cx} ${cy + 80} ${cx} ${cy + 280}" stroke="url(#geoStroke)" stroke-width="1.4" fill="none" opacity="0.5"/>
        <path d="M ${cx + 260} ${cy - 260} C ${cx + 120} ${cy} ${cx + 120} ${cy} ${cx + 260} ${cy + 260}" stroke="url(#geoStroke)" stroke-width="1.4" fill="none" opacity="0.6"/>
        <!-- Latitudes -->
        <path d="M ${cx - 280} ${cy - 140} C ${cx - 80} ${cy - 220} ${cx + 80} ${cy - 220} ${cx + 280} ${cy - 140}" stroke="url(#geoStroke)" stroke-width="1.4" fill="none" opacity="0.5"/>
        <path d="M ${cx - 300} ${cy} C ${cx - 120} ${cy - 40} ${cx + 120} ${cy - 40} ${cx + 300} ${cy}" stroke="url(#geoStroke)" stroke-width="1.4" fill="none" opacity="0.45"/>
        <path d="M ${cx - 280} ${cy + 140} C ${cx - 80} ${cy + 220} ${cx + 80} ${cy + 220} ${cx + 280} ${cy + 140}" stroke="url(#geoStroke)" stroke-width="1.4" fill="none" opacity="0.5"/>
      </svg>
    `;

    const composites: any[] = [];

    // Text + arcs + labels
    const textSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <!-- LEFT PANE -->
        <text x="${leftX}" y="170" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="rgba(255,255,255,0.86)" letter-spacing="1.2">
          ${escapeForSvg(eyebrowText)}
        </text>
        ${titleLines
        .map(
          (ln, idx) =>
            `<text x="${leftX}" y="${titleStartY + idx * 64}" font-family="Arial, sans-serif" font-size="${titleFontSize}" font-weight="900" fill="#FFFFFF" filter="url(#glow)" style="text-shadow: 3px 3px 12px rgba(0,0,0,0.55);">${escapeForSvg(
              ln
            )}</text>`
        )
        .join('')}
        ${linesSvg}
        <!-- Bottom branding -->
        <text x="${leftX}" y="595" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.86)" letter-spacing="1.5">
          POWERED BY PORTALPAY
        </text>
      </svg>
    `;

    composites.push({ input: Buffer.from(textSvg), top: 0, left: 0 });
    composites.push({ input: Buffer.from(arcsSvg), top: 0, left: 0 });

    // Center globe mark (from /public/globe.svg if present)
    try {
      const globe = await loadPublicImageBuffer('globe.svg');
      if (globe) {
        const globePng = await sharp(globe).resize(180, 180, { fit: 'contain' }).png().toBuffer();
        composites.push({ input: globePng, top: cy - 90, left: cx - 90 });
      } else {
        // Fallback: draw a subtle circle
        const fallbackGlobe = Buffer.from(`
          <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="98" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
          </svg>
        `);
        const fgBuf = await sharp(fallbackGlobe).png().toBuffer();
        composites.push({ input: fgBuf, top: cy - 100, left: cx - 100 });
      }
    } catch { }

    // PP symbol in top-right
    if (ppSymbolOverlay) {
      composites.push({ input: ppSymbolOverlay, top: OG_LAYOUT.ppSymbol.y, left: OG_LAYOUT.ppSymbol.x });
    }

    // Ring of flags around the center (12 flags)
    const flags = ['🇺🇸', '🇬🇧', '🇮🇳', '🇵🇭', '🇧🇷', '🇳🇬', '🇰🇪', '🇨🇦', '🇲🇽', '🇸🇬', '🇦🇺', '🇿🇦'];
    const N = flags.length;
    const ringRadius = 260;
    const flagSize = 64;
    for (let i = 0; i < N; i++) {
      const theta = (Math.PI * 2 * i) / N - Math.PI / 2; // start at top
      const x = Math.round(cx + ringRadius * Math.cos(theta) - flagSize / 2);
      const y = Math.round(cy + ringRadius * Math.sin(theta) - flagSize / 2);
      const png = await loadTwemojiPng(flags[i], flagSize);
      if (png) {
        // Add glass chip behind flag for cohesion
        const chipSvg = Buffer.from(`
          <svg width="${flagSize + 24}" height="${flagSize + 24}" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="chipGrad" cx="50%" cy="40%" r="70%">
                <stop offset="0%" style="stop-color:rgba(255,255,255,0.24)"/>
                <stop offset="100%" style="stop-color:rgba(255,255,255,0.12)"/>
              </radialGradient>
            </defs>
            <circle cx="${(flagSize + 24) / 2}" cy="${(flagSize + 24) / 2}" r="${(flagSize + 24) / 2 - 2}" fill="url(#chipGrad)" />
            <circle cx="${(flagSize + 24) / 2}" cy="${(flagSize + 24) / 2}" r="${(flagSize + 24) / 2 - 2}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"/>
          </svg>
        `);
        const chipBuf = await sharp(chipSvg).png().toBuffer();
        composites.push({ input: chipBuf, top: y - 12, left: x - 12 });
        composites.push({ input: png, top: y, left: x });
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
    console.error('OG image generation error (locations browse):', error);
    const fallbackSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1e40af;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
        <text x="600" y="320" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle">
          Global Locations
        </text>
        <text x="600" y="380" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.9)" text-anchor="middle">
          Regional support and instant settlement
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
