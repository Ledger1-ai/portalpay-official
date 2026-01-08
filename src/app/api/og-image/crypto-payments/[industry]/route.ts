import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getIndustryData } from '@/lib/landing-pages/industries';
import { getEmojiColors, createMeshGradient, escapeForSvg, wrapTextToLines, loadTwemojiPng, OG_LAYOUT, TEXT_SHADOWS, loadPPSymbol, renderLineWithEmphasis, wrapTitleToLines, WATERMARK, loadPublicImageBuffer } from '@/lib/og-image-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ industry: string }> }
) {
  try {
    const { industry } = await params;

    // Get industry data
    const industryData = getIndustryData(industry);

    if (!industryData) {
      return new NextResponse('Industry not found', { status: 404 });
    }

    const { name, icon, heroHeadline, heroSubheadline } = industryData;

    // Get colors from emoji
    const colors = getEmojiColors(icon);

    // Create mesh gradient background
    const backgroundSvg = createMeshGradient(colors);
    let imageBuffer = await sharp(Buffer.from(backgroundSvg))
      .resize(1200, 630)
      .png()
      .toBuffer();

    // Load Surge shield for top right corner
    const surgeShieldBuf = await loadPublicImageBuffer('Surge.png');
    const ppSymbolOverlay: Buffer | null = surgeShieldBuf ? await sharp(surgeShieldBuf).resize(80, 80, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : null;

    // Create text overlay with beautiful hierarchy: eyebrow + massive industry + description + feature pills
    const eyebrowText = 'Accept Crypto Payments for';
    const heroText = name; // The industry name as the star
    const subtitleText = heroSubheadline || 'Pay only 0.5-1% vs 2.9%+. Instant settlement. Free POS included.';
    const maxTextWidth = OG_LAYOUT.canvas.width - OG_LAYOUT.text.x - OG_LAYOUT.margin;

    const heroLines = wrapTitleToLines(heroText, maxTextWidth, 92, 2);
    const descFontSize = 24;
    const descLines = wrapTextToLines(subtitleText, maxTextWidth, descFontSize, 3);
    const descStartY = 360 + (heroLines.length - 1) * 50;
    const linesSvg = descLines
      .map((ln, idx) => `<text x="${OG_LAYOUT.text.x}" y="${descStartY + idx * 30}" font-family="Arial, sans-serif" font-size="${descFontSize}" fill="rgba(255,255,255,0.90)" style="text-shadow: ${TEXT_SHADOWS.desc};">${renderLineWithEmphasis(ln)}</text>`)
      .join('\n');

    // Add feature pills
    const pillsY = descStartY + (descLines.length * 30) + 40;
    const features = ['0.5-1% Fees', 'Instant Settlement', 'Free POS', 'QR Receipts'];
    const pillsSvg = features
      .map((feat, idx) => {
        const x = OG_LAYOUT.text.x + (idx * 135);
        return `
          <rect x="${x}" y="${pillsY}" width="125" height="28" rx="14" ry="14" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
          <text x="${x + 62.5}" y="${pillsY + 19}" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.95)" text-anchor="middle" letter-spacing="0.3">${escapeForSvg(feat)}</text>
        `;
      })
      .join('');

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
        <!-- Eyebrow text -->
        <text x="${OG_LAYOUT.text.x}" y="200" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="1" style="text-shadow: 1px 1px 3px rgba(0,0,0,0.3);">
          ${escapeForSvg(eyebrowText).toUpperCase()}
        </text>
        <!-- Hero: Massive industry name -->
        ${heroLines.map((ln, idx) => `<text x="${OG_LAYOUT.text.x}" y="${300 + idx * 70}" font-family="Arial, sans-serif" font-size="92" font-weight="900" fill="white" filter="url(#glow)" style="text-shadow: 3px 3px 12px rgba(0,0,0,0.5);">${escapeForSvg(ln)}</text>`).join('')}
        <!-- Description lines -->
        ${linesSvg}
        <!-- Feature pills label -->
        <text x="${OG_LAYOUT.text.x}" y="${pillsY - 8}" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.75)" letter-spacing="0.5">
          KEY FEATURES:
        </text>
        <!-- Feature pills -->
        ${pillsSvg}
        <!-- Bottom branding -->
        <text x="${OG_LAYOUT.text.x}" y="${OG_LAYOUT.brandingY}" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="2">
          POWERED BY BASALTSURGE
        </text>
      </svg>
    `;

    // Composite watermark onto mesh gradient first
    const watermarkBuf = await loadPublicImageBuffer('watermark.png');
    if (watermarkBuf) {
      imageBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuf, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // Then composite text and other elements
    const composites: any[] = [{ input: Buffer.from(textSvg), top: 0, left: 0 }];
    // Add emoji image if loaded (Twemoji rasterized) to avoid black box rendering
    const emojiPng = await loadTwemojiPng(icon, 180);
    if (emojiPng) {
      composites.push({ input: emojiPng, top: 235, left: 50 });
    }

    // Add PortalPay symbol in top right if loaded
    if (ppSymbolOverlay) {
      composites.push({ input: ppSymbolOverlay, top: OG_LAYOUT.ppSymbol.y, left: OG_LAYOUT.ppSymbol.x });
    }

    imageBuffer = await sharp(imageBuffer)
      .composite(composites)
      .jpeg({ quality: 90 })
      .toBuffer();

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('OG image generation error:', error);

    // Fallback gradient
    const fallbackSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
        <text x="600" y="315" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="white" text-anchor="middle" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.3);">
          BasaltSurge
        </text>
        <text x="600" y="380" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.9)" text-anchor="middle">
          Crypto Payments Made Simple
        </text>
      </svg>
    `;

    const fallbackBuffer = await sharp(Buffer.from(fallbackSvg))
      .resize(1200, 630)
      .jpeg({ quality: 85 })
      .toBuffer();

    return new NextResponse(new Uint8Array(fallbackBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  }
}
