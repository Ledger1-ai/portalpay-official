import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getComparisonData } from '@/lib/landing-pages/comparisons';
import { createMeshGradient, escapeForSvg, wrapTextToLines, renderLineWithEmphasis } from '@/lib/og-image-utils';
import { loadPPSymbol, fetchWithCache, loadPublicImageBuffer } from '@/lib/og-asset-loader';
import { getBrandConfig } from '@/config/brands';
import { isPartnerContext } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';



export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ competitor: string }> }
) {
  const brand = getBrandConfig();
  try {
    const { competitor } = await params;

    const comparisonData = getComparisonData(competitor);
    if (!comparisonData) {
      return new NextResponse('Competitor not found', { status: 404 });
    }

    const { name, subheadline, pricing, features } = comparisonData;

    // Brand mesh background - use brand colors for partner branding
    const brandPrimary = brand.colors?.primary || '#0ea5e9';
    const brandAccent = brand.colors?.accent || '#3b82f6';
    // Generate complementary third color by blending primary and accent
    const colors = [brandPrimary, brandAccent, '#8b5cf6'];
    const backgroundSvg = createMeshGradient(colors);
    let imageBuffer = await sharp(Buffer.from(backgroundSvg)).resize(1200, 630).png().toBuffer();

    const ppSymbolOverlay: Buffer | null = await loadPPSymbol(80);
    // Brand primary color for table highlights (use primary green)
    const BRAND_ACCENT = brand.colors?.primary || '#35ff7c';

    // Two-pane geometry
    const PANE_DIVIDER = 600;
    const TABLE_MARGIN = 30;
    const tableX = PANE_DIVIDER + TABLE_MARGIN; // 630
    const tableY = 130;
    const colWidth = 210; // Wider columns for balance
    const containerPadding = 20;
    const tableContainerWidth = colWidth * 2 + containerPadding * 2; // 460
    const tableContainerHeight = 418; // fixed card height
    const rowHeight = 58;
    // Header above logos (outside card)
    const headerY = tableY - 96;

    // Left pane content
    const eyebrowText = `${String(brand.name || '').toUpperCase()} VS`;
    const heroText = name;

    const portalPayFee = '0.5-1%';
    const competitorFeePercent = (pricing.processingFee * 100).toFixed(1).replace('.0', '');
    const competitorFlatFee = pricing.flatFee > 0 ? ` + ${pricing.flatFee.toFixed(0)}¢` : '';
    const competitorMonthly = pricing.monthlyFee > 0 ? ` + $${pricing.monthlyFee}/mo` : '';
    const pricingMicrotext = `${portalPayFee} vs ${competitorFeePercent}%${competitorFlatFee}${competitorMonthly}`;

    const subtitleText = subheadline || 'Lower fees, instant settlement, and free enterprise features';
    const descFontSize = 18;
    const descStartY = 348;
    const descLines = wrapTextToLines(subtitleText, 500, descFontSize, 6);
    const descLinesSvg = descLines
      .map(
        (ln, idx) =>
          `<text x="50" y="${descStartY + idx * 24}" font-family="Arial, sans-serif" font-size="${descFontSize}" fill="rgba(255,255,255,0.92)" style="text-shadow: 1px 1px 3px rgba(0,0,0,0.4);">${renderLineWithEmphasis(
            ln
          )}</text>`
      )
      .join('\n');

    const topAdvantages = features
      .filter((f) => f.advantage)
      .slice(0, 4)
      .map((f) => {
        if (f.feature === 'Processing Fee') return `${portalPayFee} Fees`;
        if (['Settlement Time', 'Settlement Speed', 'Settlement'].includes(f.feature)) return 'Instant';
        if (['Monthly Fee', 'Monthly POS Fee', 'Monthly Software Fee'].includes(f.feature)) return '$0 Monthly';
        if (f.feature === 'Annual Software Cost') return 'No Annual Software';
        if (f.feature === 'Chargebacks') return 'Zero Chargebacks';
        if (f.feature === 'Bank Account Required') return 'No Bank';
        if (f.feature === 'Accept Crypto') return 'Accept Crypto';
        if (['International Payments', 'International Fees', 'FX Fees'].includes(f.feature)) return 'No FX Fees';
        if (['POS System', 'Restaurant POS', 'Retail POS'].includes(f.feature)) return 'Free POS';
        return f.feature; // no truncation; pills resize to fit
      });

    // Dynamic pills: auto width per label, multi-row flow, and stay clear of footer
    const pillFontSize = 12;
    const pillPadX = 16;
    const pillHeight = 28;
    const pillGapX = 12;
    const pillRowGap = 12;
    const leftMargin = 50;
    const rightMargin = 50;
    const maxPillRowWidth = PANE_DIVIDER - leftMargin - rightMargin;

    const estimateTextWidth = (t: string, fontSize = pillFontSize) => Math.ceil(t.length * fontSize * 0.58 + 2);

    const descEndBaselineY = descStartY + (Math.max(1, descLines.length) - 1) * 24;
    let desiredPillsStartY = descEndBaselineY + 18;

    function layoutPills(startY: number) {
      let x = leftMargin;
      let row = 0;
      const nodes: { label: string; x: number; row: number; w: number }[] = [];
      for (const label of topAdvantages) {
        const textW = estimateTextWidth(label, pillFontSize);
        const w = Math.min(maxPillRowWidth, Math.max(110, textW + pillPadX * 2));
        if (x + w > leftMargin + maxPillRowWidth) {
          row += 1;
          x = leftMargin;
        }
        nodes.push({ label, x, row, w });
        x += w + pillGapX;
      }
      const totalRows = nodes.length ? nodes[nodes.length - 1].row + 1 : 0;
      const totalHeight = totalRows * pillHeight + (totalRows - 1) * pillRowGap;
      return { nodes, totalRows, totalHeight };
    }

    const maxBottom = 556; // keep clear of footer at y=595
    let { nodes: pillNodes, totalRows, totalHeight } = layoutPills(desiredPillsStartY);
    if (desiredPillsStartY + totalHeight > maxBottom) {
      desiredPillsStartY = maxBottom - totalHeight;
      ({ nodes: pillNodes, totalRows, totalHeight } = layoutPills(desiredPillsStartY));
    }

    const pillsSvg = pillNodes
      .map(({ label, x, row, w }) => {
        const y = desiredPillsStartY + row * (pillHeight + pillRowGap);
        const textX = x + w / 2;
        return `
          <rect x="${x}" y="${y}" width="${w}" height="${pillHeight}" rx="${pillHeight / 2}" ry="${pillHeight / 2}" fill="rgba(34,197,94,0.22)" stroke="rgba(34,197,94,0.55)" stroke-width="1.5"/>
          <text x="${textX}" y="${y + 19}" font-family="Arial, sans-serif" font-size="${pillFontSize}" font-weight="700" fill="rgba(255,255,255,0.96)" text-anchor="middle" letter-spacing="0.3">${escapeForSvg(label)}</text>
        `;
      })
      .join('');

    // Right pane table features
    const tableFeatures = features
      .filter((f) => f.advantage)
      .slice(0, 6)
      .map((f) => ({
        feature: f.feature,
        basaltsurge: typeof f.basaltsurge === 'boolean' ? (f.basaltsurge ? '✓' : '✗') : String(f.basaltsurge),
        competitor: typeof f.competitor === 'boolean' ? (f.competitor ? '✓' : '✗') : String(f.competitor),
      }));

    /**
     * Fixed-height rows. Shrink text to fit up to 2 lines per cell.
     * Left column: Competitor. Right column: PortalPay.
     */
    const labelFontSize = 13;
    const baseValueSize = 14;
    const maxLines = 2;
    const lineGap = 14;
    const colInnerWidth = colWidth - 24;

    function fitTextToCell(text: string, baseSize: number) {
      let size = baseSize;
      let lines = wrapTextToLines(String(text), colInnerWidth, size, 10);
      while (lines.length > maxLines && size > 10) {
        size -= 1;
        lines = wrapTextToLines(String(text), colInnerWidth, size, 10);
      }
      return { size, lines };
    }

    const tableRowsSvg = tableFeatures
      .map((row, idx) => {
        const y = tableY + 50 + idx * rowHeight; // fixed spacing
        const isEven = idx % 2 === 0;

        const leftXText = tableX + containerPadding + 12; // competitor column
        const rightXText = tableX + containerPadding + colWidth + 12; // PortalPay column

        const featureLabelY = y + 18;
        const valuesStartY = y + 36;

        const compFit = fitTextToCell(row.competitor, baseValueSize);
        const portalFit = fitTextToCell(row.basaltsurge, baseValueSize);

        const competitorValueSvg = `<text x="${leftXText}" y="${valuesStartY}" font-family="Arial, sans-serif" font-size="${compFit.size}" font-weight="700" fill="rgba(255,255,255,0.85)">
      ${compFit.lines.map((ln, i) => `<tspan x="${leftXText}" dy="${i === 0 ? 0 : lineGap}">${escapeForSvg(ln)}</tspan>`).join('')}
    </text>`;

        const portalValueSvg = `<text x="${rightXText}" y="${valuesStartY}" font-family="Arial, sans-serif" font-size="${portalFit.size}" font-weight="800" fill="${BRAND_ACCENT}" filter="url(#softShadow)">
      ${portalFit.lines.map((ln, i) => `<tspan x="${rightXText}" dy="${i === 0 ? 0 : lineGap}">${escapeForSvg(ln)}</tspan>`).join('')}
    </text>`;

        return `
      <!-- Row background inside container -->
      <rect x="${tableX + containerPadding}" y="${y}" width="${colWidth * 2}" height="${rowHeight}" fill="rgba(255,255,255,${isEven ? '0.08' : '0.05'})" rx="12"/>
      <!-- Vertical column divider -->
      <line x1="${tableX + containerPadding + colWidth}" y1="${y + 8}" x2="${tableX + containerPadding + colWidth}" y2="${y + rowHeight - 8}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>

      <!-- Feature name -->
      <text x="${leftXText}" y="${featureLabelY}" font-family="Arial, sans-serif" font-size="${labelFontSize}" font-weight="600" fill="rgba(255,255,255,0.85)">
        ${escapeForSvg(row.feature)}
      </text>

      ${competitorValueSvg}
      ${portalValueSvg}
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
          <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0.18)" />
            <stop offset="100%" style="stop-color:rgba(255,255,255,0.10)" />
          </linearGradient>
          <filter id="softShadow">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.45"/>
          </filter>
        </defs>

        <!-- Vertical pane divider -->
        <line x1="${PANE_DIVIDER}" y1="40" x2="${PANE_DIVIDER}" y2="590" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>

        <!-- LEFT PANE: Text content -->
        <text x="50" y="150" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="rgba(255,255,255,0.78)" letter-spacing="2">
          ${escapeForSvg(eyebrowText)}
        </text>

        <text x="50" y="255" font-family="Arial, sans-serif" font-size="92" font-weight="900" fill="white" filter="url(#glow)" style="text-shadow: 3px 3px 12px rgba(0,0,0,0.5);">
          ${escapeForSvg(heroText)}
        </text>

        <text x="50" y="300" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="rgba(255,255,255,0.80)" letter-spacing="0.4">
          ${escapeForSvg(pricingMicrotext.toUpperCase())}
        </text>

        ${descLinesSvg}
        ${pillsSvg}

        <!-- RIGHT PANE: Table Card -->
        <rect x="${tableX}" y="${tableY}" width="${tableContainerWidth}" height="${tableContainerHeight}" rx="22" ry="22" fill="url(#cardGrad)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
        <!-- Table title removed (header moved above logos) -->
<!-- Right pane header above logos -->
<text x="${tableX + tableContainerWidth / 2}" y="${headerY}" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="rgba(255,255,255,0.92)" letter-spacing="1.2" text-anchor="middle">
  FEATURE COMPARISON
</text>
<!-- Column headers (Left: Competitor, Right: PortalPay) -->
<text x="${tableX + containerPadding}" y="${tableY + 46}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="rgba(255,255,255,0.85)" letter-spacing="0.8">
  ${escapeForSvg(name.toUpperCase())}
</text>
<text x="${tableX + containerPadding + colWidth + 12}" y="${tableY + 46}" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="${BRAND_ACCENT}" letter-spacing="0.8" filter="url(#softShadow)">
  ${escapeForSvg(String(brand.name || '').toUpperCase())}
</text>

        ${tableRowsSvg}

        <!-- Bottom branding -->
        <text x="50" y="595" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.80)" letter-spacing="1.5">
          ${escapeForSvg(`POWERED BY ${String(brand.name || '').toUpperCase()}`)}
        </text>
        <text x="1150" y="595" font-family="Arial, sans-serif" font-size="10" fill="rgba(255,255,255,0.68)" text-anchor="end">
          Comparison for informational purposes
        </text>
      </svg>
    `;

    // Composite watermark first
    const watermarkBuf = await loadPublicImageBuffer('watermark.png');
    if (watermarkBuf) {
      imageBuffer = await sharp(imageBuffer).composite([{ input: watermarkBuf, top: 0, left: 0 }]).png().toBuffer();
    }

    // Compose text and elements
    const composites: any[] = [{ input: Buffer.from(textSvg), top: 0, left: 0 }];

    // Logos: rounded square containers, repositioned away from footer for clean alignment
    const logoSize = 86;
    const logoContainerSize = 96;
    const logoTop = tableY - 76;

    // Brand logo (Partner/Basalt Symbol) positioned near right column header
    // Use loadPPSymbol to respect partner branding (auto-fallback to Surge.png for platform)
    const portalLogo = await loadPPSymbol(logoContainerSize);
    if (portalLogo) {
      // For transparent logos, use directly without rectangular background
      const portalLogoLeft = tableX + containerPadding + colWidth + (colWidth - logoContainerSize) / 2;
      composites.push({ input: portalLogo, top: logoTop, left: Math.round(portalLogoLeft) });
    }

    // Competitor logo positioned high on right pane for visual balance
    const domainMap: Record<string, string> = {
      stripe: 'stripe.com',
      square: 'squareup.com',
      paypal: 'paypal.com',
      toast: 'toasttab.com',
      'coinbase-commerce': 'commerce.coinbase.com',
      adyen: 'adyen.com',
      worldpay: 'worldpay.com',
      razorpay: 'razorpay.com',
      paystack: 'paystack.com',
      flutterwave: 'flutterwave.com',
      'mercado-pago': 'mercadopago.com',
      mpesa: 'safaricom.co.ke',
      'checkout-com': 'checkout.com',
      bitpay: 'bitpay.com',
      flexa: 'flexa.network',

      // Newly added processors and platforms
      'clover-fiserv': 'clover.com',
      'global-payments': 'globalpayments.com',
      elavon: 'elavon.com',
      braintree: 'braintreepayments.com',
      'authorize-net': 'authorize.net',
      wepay: 'wepay.com',
      stax: 'staxpayments.com',
      helcim: 'helcim.com',
      lightspeed: 'lightspeedhq.com',
      touchbistro: 'touchbistro.com',
      opennode: 'opennode.com',
      dutchie: 'dutchie.com',
      aeropay: 'aeropay.com',
      hypur: 'hypur.com',
      paymentcloud: 'paymentcloudinc.com',
      paykings: 'paykings.com',
      'durango-merchant-services': 'durangomerchantservices.com',
      'shopify-payments': 'shopify.com',
      canpay: 'canpaydebit.com',
      'cova-pos': 'covasoftware.com',
      flowhub: 'flowhub.com',
      treez: 'treez.io',
      rapyd: 'rapyd.net',
      bluesnap: 'bluesnap.com',
      nmi: 'nmi.com',
      nuvei: 'nuvei.com',
      paysafe: 'paysafe.com',
      cybersource: 'cybersource.com',
      '2checkout': '2checkout.com',
      moneris: 'moneris.com',
      'evo-payments': 'evopayments.com'
    };
    const slugKey = String(competitor || '').toLowerCase();
    const nameKey = String(name || '').toLowerCase().replace(/\s+/g, '-');
    const compDomain = domainMap[slugKey] || `${name.replace(/\s+/g, '').toLowerCase()}.com`;
    const compLogoUrl = `https://logo.clearbit.com/${compDomain}?size=256`;

    try {
      const localLogo =
        (await loadPublicImageBuffer(`logos/${slugKey}.webp`)) ||
        (await loadPublicImageBuffer(`logos/${slugKey}.png`)) ||
        (await loadPublicImageBuffer(`logos/${slugKey}.svg`)) ||
        (await loadPublicImageBuffer(`logos/${nameKey}.webp`)) ||
        (await loadPublicImageBuffer(`logos/${nameKey}.png`)) ||
        (await loadPublicImageBuffer(`logos/${nameKey}.svg`));

      let compLogoBuf: Buffer | null = localLogo;
      if (!compLogoBuf) compLogoBuf = await fetchWithCache(compLogoUrl);

      if (!compLogoBuf) {
        const initials = name
          .split(/\s+/)
          .map((w) => w[0]?.toUpperCase() || '')
          .slice(0, 2)
          .join('');
        const initialsSvg = Buffer.from(`
          <svg width="${logoSize}" height="${logoSize}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${logoSize}" height="${logoSize}" rx="12" ry="12" fill="rgba(255,255,255,0.18)"/>
            <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">
              ${escapeForSvg(initials)}
            </text>
          </svg>
        `);
        compLogoBuf = await sharp(initialsSvg).png().toBuffer();
      }

      // Build masked rounded-square tile with the image clipped to rounded corners
      let compTile = await sharp({
        create: { width: logoContainerSize, height: logoContainerSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      }).png().toBuffer();

      // Ensure white base behind any transparent portions of the logo
      const compWhiteBgSvg = `<svg width="${logoContainerSize}" height="${logoContainerSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${logoContainerSize}" height="${logoContainerSize}" rx="16" ry="16" fill="#ffffff"/>
      </svg>`;
      compTile = await sharp(compTile).composite([{ input: Buffer.from(compWhiteBgSvg) }]).png().toBuffer();

      const resizedComp = await sharp(compLogoBuf)
        .resize(logoContainerSize, logoContainerSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();

      compTile = await sharp(compTile).composite([{ input: resizedComp, top: 0, left: 0 }]).png().toBuffer();

      const compClipSvg = `<svg width="${logoContainerSize}" height="${logoContainerSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${logoContainerSize}" height="${logoContainerSize}" rx="16" ry="16" fill="#fff"/>
      </svg>`;
      compTile = await sharp(compTile).composite([{ input: Buffer.from(compClipSvg), blend: 'dest-in' }]).png().toBuffer();

      const compStrokeSvg = `<svg width="${logoContainerSize}" height="${logoContainerSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${logoContainerSize}" height="${logoContainerSize}" rx="16" ry="16" fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="2"/>
      </svg>`;
      compTile = await sharp(compTile).composite([{ input: Buffer.from(compStrokeSvg) }]).png().toBuffer();

      const compLogoLeft = tableX + containerPadding + (colWidth - logoContainerSize) / 2;
      composites.push({ input: compTile, top: logoTop, left: Math.round(compLogoLeft) });
    } catch (e) {
      console.warn('Competitor logo load failed:', e);
    }

    if (ppSymbolOverlay) {
      // Place the larger PortalPay symbol above the "PORTALPAY VS" eyebrow on the left pane
      const ppSize = 80; // matches loadPPSymbol(80)
      const ppTop = 150 - ppSize - 14; // move up a bit more above the eyebrow baseline
      const ppLeft = 50; // align with left text edge of the eyebrow
      composites.push({ input: ppSymbolOverlay, top: ppTop, left: ppLeft });
    }

    imageBuffer = await sharp(imageBuffer).composite(composites).jpeg({ quality: 90 }).toBuffer();

    return new NextResponse(new Uint8Array(imageBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('OG image generation error:', error);

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
          ${escapeForSvg(brand.name)}
        </text>
        <text x="600" y="380" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.9)" text-anchor="middle">
          Save 70% on Payment Processing
        </text>
      </svg>
    `;

    const fallbackBuffer = await sharp(Buffer.from(fallbackSvg)).resize(1200, 630).jpeg({ quality: 85 }).toBuffer();

    return new NextResponse(new Uint8Array(fallbackBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  }
}
