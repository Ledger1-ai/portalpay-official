import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import {
  createMeshGradient,
  escapeForSvg,
  wrapTextToLines,
  OG_LAYOUT,
  TEXT_SHADOWS,
} from '@/lib/og-image-utils';
import { loadPPSymbol, loadPublicImageBuffer } from '@/lib/og-asset-loader';
import { getBrandConfig } from '@/config/brands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Developers (browse) OG image
 * Distinct visual: neon code card with monospaced syntax styling, grid overlay, and scanning glow.
 */
export async function GET(_req: NextRequest) {
  const brand = getBrandConfig();
  try {
    // Deep indigo + cyan + violet neon palette
    const colors = ['#0b1f3f', '#06b6d4', '#8b5cf6'];
    const backgroundSvg = createMeshGradient(colors);
    let imageBuffer = await sharp(Buffer.from(backgroundSvg)).resize(1200, 630).png().toBuffer();

    // Subtle watermark texture
    const watermarkBuf = await loadPublicImageBuffer('watermark.png');
    if (watermarkBuf) {
      imageBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuf, top: 0, left: 0 }])
        .png()
        .toBuffer();
    }

    // PortalPay symbol (top-right)
    const ppSymbolOverlay: Buffer | null = await loadPPSymbol(OG_LAYOUT.ppSymbol.size);

    // Copy (left pane)
    const eyebrowText = 'WEB2 & WEB3 DEVELOPERS';
    const heroText = `Build with ${brand.name}`;
    const subtitleText =
      'Trustless, permissionless payments with wallet auth and on-chain splits. Complete API, guides, and code examples.';
    const leftX = 64;
    const maxTextWidth = 520;

    const titleFontSize = 72;
    const titleLines = wrapTextToLines(heroText, maxTextWidth, titleFontSize, 2);
    const descFontSize = 21;
    const descLines = wrapTextToLines(subtitleText, maxTextWidth, descFontSize, 3);

    const titleStartY = 250;
    const descStartY = titleStartY + (titleLines.length - 1) * 64 + 100;

    const descLinesSvg = descLines
      .map(
        (ln, idx) =>
          `<text x="${leftX}" y="${descStartY + idx * 26}" font-family="Arial, sans-serif" font-size="${descFontSize}" fill="rgba(255,255,255,0.92)" style="text-shadow: ${TEXT_SHADOWS.desc};">${escapeForSvg(
            ln
          )}</text>`
      )
      .join('\n');

    // Right-side neon code card geometry (fill more of the container)
    const cardX = 570;
    const cardY = 90;   // moved up to start higher
    const cardW = 560;  // widened
    const cardH = 444;  // taller

    // More code examples to fill the card
    const codeLines = [
      // Orig 7 lines
      `<tspan fill="#93c5fd">import</tspan> <tspan fill="#e5e7eb">{</tspan> Client <tspan fill="#e5e7eb">}</tspan> <tspan fill="#93c5fd">from</tspan> <tspan fill="#22d3ee">'@portalpay/sdk'</tspan>;`,
      `<tspan fill="#93c5fd">const</tspan> client <tspan fill="#e5e7eb">=</tspan> <tspan fill="#93c5fd">new</tspan> Client(<tspan fill="#22d3ee">{ wallet:</tspan> <tspan fill="#22d3ee">'0xYourWallet'</tspan> <tspan fill="#22d3ee">}</tspan>);`,
      `<tspan fill="#93c5fd">await</tspan> client.split.deploy(<tspan fill="#22d3ee">{ wallet:</tspan> <tspan fill="#22d3ee">'0xYourWallet'</tspan> <tspan fill="#22d3ee">}</tspan>);`,
      `<tspan fill="#93c5fd">await</tspan> client.inventory.create(<tspan fill="#22d3ee">{</tspan> sku: <tspan fill="#22d3ee">'ITEM-001'</tspan>, name: <tspan fill="#22d3ee">'Sample'</tspan>, priceUsd: <tspan fill="#a7f3d0">25.00</tspan> <tspan fill="#22d3ee">}</tspan>);`,
      `<tspan fill="#93c5fd">const</tspan> order <tspan fill="#e5e7eb">=</tspan> <tspan fill="#93c5fd">await</tspan> client.orders.create(<tspan fill="#22d3ee">{</tspan> items: <tspan fill="#22d3ee">[{ sku: </tspan><tspan fill="#22d3ee">'ITEM-001'</tspan><tspan fill="#22d3ee">, qty: </tspan><tspan fill="#a7f3d0">1</tspan><tspan fill="#22d3ee"> }] }</tspan>);`,
      `<tspan fill="#93c5fd">await</tspan> client.receipts.capture(order);`,
      // New lines
      `<tspan fill="#93c5fd">const</tspan> invoices <tspan fill="#e5e7eb">=</tspan> <tspan fill="#93c5fd">await</tspan> client.invoices.list();`,
      `<tspan fill="#93c5fd">await</tspan> client.invoices.sendEmail({ id: <tspan fill="#e5e7eb">'INV-123'</tspan> });`,
    ];

    // Y position for code lines (space them more to fill height)
    const codeStartY = cardY + 80;
    const lineSpacing = 34; // larger than before
    // There will be lines mapped with increasing y

    // Grid overlay pattern and code gradient
    const codeLinesSvg = codeLines
      .map(
        (line, idx) =>
          `<text x="${cardX + 20}" y="${codeStartY + idx * lineSpacing
          }" font-family="Courier New, monospace" font-size="17" fill="rgba(255,255,255,0.95)">${line}</text>`
      )
      .join('\n');

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
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
          </pattern>
          <linearGradient id="codeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(6,182,212,0.20)"/>
            <stop offset="100%" style="stop-color:rgba(139,92,246,0.20)"/>
          </linearGradient>
          <linearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0)"/>
            <stop offset="40%" style="stop-color:rgba(255,255,255,0.12)"/>
            <stop offset="60%" style="stop-color:rgba(255,255,255,0.02)"/>
            <stop offset="100%" style="stop-color:rgba(255,255,255,0)"/>
          </linearGradient>
          <filter id="cardShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.45"/>
          </filter>
        </defs>

        <!-- LEFT PANE -->
        <text x="${leftX}" y="170" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="rgba(255,255,255,0.88)" letter-spacing="1.2">
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

        ${descLinesSvg}

        <!-- Bottom branding -->
        <text x="${leftX}" y="${OG_LAYOUT.brandingY}" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.88)" letter-spacing="1.5">
          ${escapeForSvg(`POWERED BY ${String(brand.name || '').toUpperCase()}`)}
        </text>

        <!-- RIGHT PANE: Neon Code Card -->
        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="24" ry="24" fill="url(#codeGrad)" stroke="rgba(255,255,255,0.16)" stroke-width="2" filter="url(#cardShadow)"/>
        <!-- Grid overlay clipped to card -->
        <clipPath id="cardClip">
          <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="24" ry="24"/>
        </clipPath>
        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" fill="url(#grid)" clip-path="url(#cardClip)"/>

        <!-- RIGHT PANE CONTENT clipped to card -->
        <g clip-path="url(#cardClip)">
          <!-- Scanning glow bar (move further down to middle) -->
          <rect x="${cardX + 24}" y="${cardY + 180}" width="${cardW - 48}" height="32" fill="url(#scanGrad)" clip-path="url(#cardClip)" />

          <!-- Header label -->
          <text x="${cardX + 20}" y="${cardY + 40}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="rgba(255,255,255,0.85)" letter-spacing="1.0">
            sdk/examples.ts
          </text>

          <!-- Monospaced code lines (expanded)-->
          ${codeLinesSvg}

          <!-- Feature badges row (neon chips) -->
          <g>
            <rect x="${cardX + 40}" y="${cardY + cardH - 108}" width="150" height="32" rx="16" ry="16" fill="rgba(6,182,212,0.18)" stroke="rgba(6,182,212,0.55)" stroke-width="1.5"/>
            <text x="${cardX + 115}" y="${cardY + cardH - 87}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="rgba(255,255,255,0.96)" text-anchor="middle">Wallet Auth</text>

            <rect x="${cardX + 210}" y="${cardY + cardH - 108}" width="170" height="32" rx="16" ry="16" fill="rgba(139,92,246,0.18)" stroke="rgba(139,92,246,0.55)" stroke-width="1.5"/>
            <text x="${cardX + 295}" y="${cardY + cardH - 87}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="rgba(255,255,255,0.96)" text-anchor="middle">On-chain Splits</text>

            <rect x="${cardX + 400}" y="${cardY + cardH - 108}" width="120" height="32" rx="16" ry="16" fill="rgba(34,197,94,0.22)" stroke="rgba(34,197,94,0.55)" stroke-width="1.5"/>
            <text x="${cardX + 460}" y="${cardY + cardH - 87}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="rgba(255,255,255,0.96)" text-anchor="middle">SDKs</text>
          </g>

          <!-- Footer microtext in card -->
          <text x="${cardX + 20}" y="${cardY + cardH - 24}" font-family="Arial, sans-serif" font-size="13" fill="rgba(255,255,255,0.72)">
            Examples: Quick Start · API Reference · Security · Guides
          </text>
        </g>
      </svg>
    `;

    const composites: any[] = [{ input: Buffer.from(textSvg), top: 0, left: 0 }];

    // Compose PP symbol top-right
    if (ppSymbolOverlay) {
      composites.push({ input: ppSymbolOverlay, top: OG_LAYOUT.ppSymbol.y, left: OG_LAYOUT.ppSymbol.x });
    }

    // Final composite
    imageBuffer = await sharp(imageBuffer).composite(composites).jpeg({ quality: 90 }).toBuffer();

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    console.error('OG image generation error (developers browse):', error);
    const fallbackSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0b1f3f;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
        <text x="600" y="320" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle">
          ${escapeForSvg(`${brand.name} Developers`)}
        </text>
        <text x="600" y="380" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.9)" text-anchor="middle">
          Build fast with wallet auth & on-chain splits
        </text>
      </svg>
    `;
    const fb = await sharp(Buffer.from(fallbackSvg)).resize(1200, 630).jpeg({ quality: 85 }).toBuffer();
    return new NextResponse(new Uint8Array(fb), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  }
}
