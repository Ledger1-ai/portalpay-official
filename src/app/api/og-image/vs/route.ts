import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createMeshGradient, escapeForSvg, wrapTextToLines, OG_LAYOUT, TEXT_SHADOWS } from '@/lib/og-image-utils';
import { loadPPSymbol, loadPublicImageBuffer } from '@/lib/og-asset-loader';
import { getBrandConfig } from '@/config/brands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Comparisons (browse) OG image
 * Distinct visual: bold left hero + right-side mosaic grid of competitor logos with a vertical split and light sweep.
 */
export async function GET(_req: NextRequest) {
  const brand = getBrandConfig();
  const poweredByText = `POWERED BY ${String(brand.name || '').toUpperCase()}`;
  try {
    // Palette tuned for comparisons (cool tech blues + violet)
    const colors = ['#0ea5e9', '#3b82f6', '#8b5cf6'];
    const backgroundSvg = createMeshGradient(colors);
    let imageBuffer = await sharp(Buffer.from(backgroundSvg)).resize(1200, 630).png().toBuffer();

    // Subtle watermark texture
    const watermarkBuf = await loadPublicImageBuffer('watermark.png');
    if (watermarkBuf) {
      imageBuffer = await sharp(imageBuffer).composite([{ input: watermarkBuf, top: 0, left: 0 }]).png().toBuffer();
    }

    // PortalPay symbol top-right
    const ppSymbolOverlay: Buffer | null = await loadPPSymbol(OG_LAYOUT.ppSymbol.size);

    // Copy
    const eyebrowText = 'COMPARE PROCESSORS';
    // -- Force hero onto three lines, "Processor" on the third line:
    // Instead of automatic line wrapping, we specify 3 lines manually.
    const heroLine1 = "Find the Best";
    const heroLine2 = "Payment";
    const heroLine3 = "Processor";
    const titleLines = [heroLine1, heroLine2, heroLine3];
    let titleFontSize = 62; // Can be tuned for fit

    const subtitleText = 'Compare fees, settlement speed, chargebacks, and enterprise features across leading platforms.';

    // Layout tuning for better vertical centering
    const leftX = 50;

    // Y Positions (header, title, description)
    // Calculate vertical area between eyebrow and desc block, then center title block in it
    const eyebrowY = 185; // LOWERED from 150 → 185
    const descFontSize = 20;
    const descLineHeight = 26;
    const descMaxLines = 3;
    const titleLineGap = 56;
    const numTitleLines = titleLines.length;

    // Estimate description block height
    const descLines = wrapTextToLines(subtitleText, 640, descFontSize, descMaxLines);
    const descBlockHeight = descLines.length * descLineHeight;

    // New top Y for the description (push down a bit more)
    const descStartY = 435;

    // Vertical block between eyebrow and desc
    const blockTop = eyebrowY;
    const blockBottom = descStartY;
    const blockHeight = blockBottom - blockTop;

    // Title block height and startY (center between eyebrow and desc)
    // Instead of centering, start a bit lower by adding an offset
    // We'll add a 20px downward shift
    const titleBlockHeight = numTitleLines * titleLineGap;
    const titleStartY = Math.round(blockTop + (blockHeight - titleBlockHeight) / 2) + 20;

    const linesSvg = descLines
      .map(
        (ln, idx) =>
          `<text x="${leftX}" y="${descStartY + idx * descLineHeight}" font-family="Arial, sans-serif" font-size="${descFontSize}" fill="rgba(255,255,255,0.92)" style="text-shadow: ${TEXT_SHADOWS.desc};">${escapeForSvg(ln)}</text>`
      )
      .join('\n');

    // Vertical pane divider between text and mosaic
    const dividerX = 600;

    // Grid of competitor logos (center the grid vertically)
    const logoContainerSize = 96;
    const gridCols = 4;
    const gridRows = 3;
    const cellW = 120;
    const cellH = 120;

    // Compute total grid height
    const gridTotalHeight = gridRows * cellH;
    // Center the grid between vertical bounds (say, container height 630, allow some margin above and below)
    // Right pane Y: let’s center the 360px grid in (630-40)px height (top+bottom margins)
    const rightPaneAvailY = 630 - 80; // 40px margin on top & bottom
    const gridStartY = Math.round((630 - gridTotalHeight) / 2); // Now centered in 630px

    const gridStartX = dividerX + 30; // 630

    // Curated set of logos (local files under public/logos/)
    const logoKeys = [
      'stripe', 'square', 'paypal', 'adyen',
      'worldpay', 'razorpay', 'paystack', 'flutterwave',
      'shopify-payments', 'braintree', 'authorize-net', 'bluesnap'
    ];

    // Helper to create a rounded tile with white base and stroke, composited with given logo buffer
    async function buildLogoTile(logoBuf: Buffer): Promise<Buffer> {
      // base transparent
      let tile = await sharp({
        create: { width: logoContainerSize, height: logoContainerSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      }).png().toBuffer();

      // white background
      const whiteBgSvg = `<svg width="${logoContainerSize}" height="${logoContainerSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${logoContainerSize}" height="${logoContainerSize}" rx="16" ry="16" fill="#ffffff"/>
      </svg>`;
      tile = await sharp(tile).composite([{ input: Buffer.from(whiteBgSvg) }]).png().toBuffer();

      // logo resized
      const resizedLogo = await sharp(logoBuf)
        .resize(logoContainerSize, logoContainerSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();

      tile = await sharp(tile).composite([{ input: resizedLogo, top: 0, left: 0 }]).png().toBuffer();

      // clip to rounded rect
      const clipSvg = `<svg width="${logoContainerSize}" height="${logoContainerSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${logoContainerSize}" height="${logoContainerSize}" rx="16" ry="16" fill="#fff"/>
      </svg>`;
      tile = await sharp(tile).composite([{ input: Buffer.from(clipSvg), blend: 'dest-in' }]).png().toBuffer();

      // stroke
      const strokeSvg = `<svg width="${logoContainerSize}" height="${logoContainerSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${logoContainerSize}" height="${logoContainerSize}" rx="16" ry="16" fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="2"/>
      </svg>`;
      tile = await sharp(tile).composite([{ input: Buffer.from(strokeSvg) }]).png().toBuffer();

      return tile;
    }

    // Load mosaics
    const composites: any[] = [];

    // Text and divider + light sweep overlay on right pane
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
          <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0);"/>
            <stop offset="30%" style="stop-color:rgba(255,255,255,0.07);"/>
            <stop offset="60%" style="stop-color:rgba(255,255,255,0.02);"/>
            <stop offset="100%" style="stop-color:rgba(255,255,255,0);"/>
          </linearGradient>
        </defs>

        <!-- Vertical divider -->
        <line x1="${dividerX}" y1="60" x2="${dividerX}" y2="590" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>

        <!-- LEFT PANE -->
        <text x="${leftX}" y="${eyebrowY}" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="rgba(255,255,255,0.85)" letter-spacing="1.2">
          ${escapeForSvg(eyebrowText)}
        </text>
        ${(() => {
        // Map the three hard-coded title lines at new centered position
        return titleLines
          .map(
            (ln, idx) =>
              `<text x="${leftX}" y="${titleStartY + idx * titleLineGap}" font-family="Arial, sans-serif" font-size="${titleFontSize}" font-weight="900" fill="#FFFFFF" filter="url(#glow)" style="text-shadow: 3px 3px 12px rgba(0,0,0,0.5);">${escapeForSvg(
                ln
              )}</text>`
          )
          .join('');
      })()}
        ${linesSvg}

        <!-- Bottom branding -->
        <text x="${leftX}" y="595" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="1.5">
          ${escapeForSvg(poweredByText)}
        </text>

        <!-- Right pane light sweep -->
        <rect x="${dividerX + 20}" y="80" width="${1200 - (dividerX + 40)}" height="470" fill="url(#sweepGrad)" />
      </svg>
    `;
    composites.push({ input: Buffer.from(textSvg), top: 0, left: 0 });

    // Compose PP symbol top-right
    if (ppSymbolOverlay) {
      composites.push({ input: ppSymbolOverlay, top: OG_LAYOUT.ppSymbol.y, left: OG_LAYOUT.ppSymbol.x });
    }

    // Build and place the mosaic grid tiles (now vertically centered)
    for (let i = 0; i < gridRows * gridCols && i < logoKeys.length; i++) {
      const r = Math.floor(i / gridCols);
      const c = i % gridCols;
      const left = gridStartX + c * cellW + Math.round((cellW - logoContainerSize) / 2);
      const top = gridStartY + r * cellH + Math.round((cellH - logoContainerSize) / 2);

      const key = logoKeys[i];
      // Try local formats
      const localBuf =
        (await loadPublicImageBuffer(`logos/${key}.webp`)) ||
        (await loadPublicImageBuffer(`logos/${key}.png`)) ||
        (await loadPublicImageBuffer(`logos/${key}.svg`));

      if (localBuf) {
        const tile = await buildLogoTile(localBuf);
        composites.push({ input: tile, top, left });
      } else {
        // If missing, draw a placeholder tile with initials
        const initials = key
          .split(/[-\s]+/)
          .map(w => w[0]?.toUpperCase() || '')
          .slice(0, 2)
          .join('');
        const placeholderSvg = Buffer.from(`
          <svg width="${logoContainerSize}" height="${logoContainerSize}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${logoContainerSize}" height="${logoContainerSize}" rx="16" ry="16" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.30)" stroke-width="2"/>
            <text x="50%" y="56%" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">
              ${escapeForSvg(initials)}
            </text>
          </svg>
        `);
        composites.push({ input: await sharp(placeholderSvg).png().toBuffer(), top, left });
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
    console.error('OG image generation error (comparisons browse):', error);
    const fallbackSvg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
        <text x="600" y="330" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle">
          ${escapeForSvg(`${brand.name} Comparisons`)}
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
