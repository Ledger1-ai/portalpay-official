import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getLocationData } from '@/lib/landing-pages/locations';
import { getFlagColors } from '@/lib/flags';
import { createFlagMeshGradient, escapeForSvg, truncateText, wrapTextToLines, OG_LAYOUT, TEXT_SHADOWS, renderLineWithEmphasis, wrapTitleToLines, WATERMARK } from '@/lib/og-image-utils';
import { loadTwemojiPng, loadPPSymbol, loadPublicImageBuffer } from '@/lib/og-asset-loader';
import { getBrandConfig } from '@/config/brands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const brand = getBrandConfig();
  try {
    const { slug } = await params;

    // Get location data
    const locationData = getLocationData(slug);

    if (!locationData) {
      return new NextResponse('Location not found', { status: 404 });
    }

    const { name, country, localContext } = locationData;

    // Map country to flag emoji
    const countryToFlag: Record<string, string> = {
      // Africa & Asia
      'Kenya': '🇰🇪',
      'Nigeria': '🇳🇬',
      'Ghana': '🇬🇭',
      'Philippines': '🇵🇭',
      'Colombia': '🇨🇴',
      'Bangladesh': '🇧🇩',
      'Nepal': '🇳🇵',
      'India': '🇮🇳',
      'Pakistan': '🇵🇰',
      'Sri Lanka': '🇱🇰',
      'Indonesia': '🇮🇩',
      'Vietnam': '🇻🇳',
      'Thailand': '🇹🇭',
      'Malaysia': '🇲🇾',
      'Singapore': '🇸🇬',
      'United Arab Emirates': '🇦🇪',
      'Turkey': '🇹🇷',
      'Israel': '🇮🇱',
      'Saudi Arabia': '🇸🇦',
      // Americas
      'United States': '🇺🇸',
      'USA': '🇺🇸',
      'Canada': '🇨🇦',
      'Mexico': '🇲🇽',
      'Brazil': '🇧🇷',
      'Argentina': '🇦🇷',
      'Chile': '🇨🇱',
      'Peru': '🇵🇪',
      'Ecuador': '🇪🇨',
      'Bolivia': '🇧🇴',
      // Europe
      'United Kingdom': '🇬🇧',
      'UK': '🇬🇧',
      'Germany': '🇩🇪',
      'France': '🇫🇷',
      'Spain': '🇪🇸',
      'Italy': '🇮🇹',
      'Netherlands': '🇳🇱',
      'Portugal': '🇵🇹',
      'Sweden': '🇸🇪',
      'Norway': '🇳🇴',
      'Denmark': '🇩🇰',
      'Finland': '🇫🇮',
      'Ireland': '🇮🇪',
      // Oceania
      'Australia': '🇦🇺',
      'New Zealand': '🇳🇿',
      'Fiji': '🇫🇯',
      'Papua New Guinea': '🇵🇬',
      'Samoa': '🇼🇸',
      'Tonga': '🇹🇴',
      'Vanuatu': '🇻🇺',
      // Middle East extend
      'Qatar': '🇶🇦',
      'Oman': '🇴🇲',
      'Kuwait': '🇰🇼',
      'Bahrain': '🇧🇭',
      'Jordan': '🇯🇴',
      'Lebanon': '🇱🇧',
      'Iraq': '🇮🇶',
      'Palestine': '🇵🇸',
      'Yemen': '🇾🇪',
      'Syria': '🇸🇾',
      'Iran': '🇮🇷',
      // Africa continued
      'South Africa': '🇿🇦',
      'Morocco': '🇲🇦',
      'Egypt': '🇪🇬',
      'Uganda': '🇺🇬',
      'Cameroon': '🇨🇲',
      'Tanzania': '🇹🇿',
      'Algeria': '🇩🇿',
      'Ethiopia': '🇪🇹',
      'Senegal': '🇸🇳',
      'Ivory Coast': '🇨🇮',
      'Angola': '🇦🇴',
      'Rwanda': '🇷🇼',
      'Zambia': '🇿🇲',
      'Zimbabwe': '🇿🇼',
      'Botswana': '🇧🇼',
      'Mozambique': '🇲🇿',
      'Sudan': '🇸🇩',
      'Tunisia': '🇹🇳',
      'Somalia': '🇸🇴',
      'Gambia': '🇬🇲',
      'Libya': '🇱🇾',
      'DR Congo': '🇨🇩',
      'Congo': '🇨🇬',
      'Liberia': '🇱🇷',
      'Sierra Leone': '🇸🇱',
      'Mauritius': '🇲🇺',
      'Seychelles': '🇸🇨',
      'Namibia': '🇳🇦',
      'Malawi': '🇲🇼',
      'Burkina Faso': '🇧🇫',
      'Mali': '🇲🇱',
      'Niger': '🇳🇪',
      'Chad': '🇹🇩',
      'Benin': '🇧🇯',
      'Togo': '🇹🇬',
      'Central African Republic': '🇨🇫',
      'Guinea': '🇬🇳',
      'Guinea-Bissau': '🇬🇼',
      'Equatorial Guinea': '🇬🇶',
      'Gabon': '🇬🇦',
      'Madagascar': '🇲🇬',
      'Lesotho': '🇱🇸',
      'Swaziland': '🇸🇿',
      'Eritrea': '🇪🇷',
      'Burundi': '🇧🇮',
      'Djibouti': '🇩🇯',
      'Comoros': '🇰🇲',
      'Sao Tome and Principe': '🇸🇹',
      'South Sudan': '🇸🇸',
      // Europe completed
      'Switzerland': '🇨🇭',
      'Austria': '🇦🇹',
      'Belgium': '🇧🇪',
      'Greece': '🇬🇷',
      'Poland': '🇵🇱',
      'Czech Republic': '🇨🇿',
      'Czechia': '🇨🇿',
      'Slovakia': '🇸🇰',
      'Hungary': '🇭🇺',
      'Romania': '🇷🇴',
      'Bulgaria': '🇧🇬',
      'Croatia': '🇭🇷',
      'Slovenia': '🇸🇮',
      'Serbia': '🇷🇸',
      'Montenegro': '🇲🇪',
      'Bosnia and Herzegovina': '🇧🇦',
      'North Macedonia': '🇲🇰',
      'Albania': '🇦🇱',
      'Estonia': '🇪🇪',
      'Latvia': '🇱🇻',
      'Lithuania': '🇱🇹',
      'Ukraine': '🇺🇦',
      'Belarus': '🇧🇾',
      'Moldova': '🇲🇩',
      'Luxembourg': '🇱🇺',
      'Liechtenstein': '🇱🇮',
      'Andorra': '🇦🇩',
      'San Marino': '🇸🇲',
      'Monaco': '🇲🇨',
      'Vatican City': '🇻🇦',
      'Malta': '🇲🇹',
      'Iceland': '🇮🇸',
      'Georgia': '🇬🇪',
      'Armenia': '🇦🇲',
      'Azerbaijan': '🇦🇿',
      // Asia completed
      'China': '🇨🇳',
      'Hong Kong': '🇭🇰',
      'Taiwan': '🇹🇼',
      'Japan': '🇯🇵',
      'South Korea': '🇰🇷',
      'North Korea': '🇰🇵',
      'Myanmar': '🇲🇲',
      'Cambodia': '🇰🇭',
      'Laos': '🇱🇦',
      'Mongolia': '🇲🇳',
      'Brunei': '🇧🇳',
      // South Asia additions
      'Afghanistan': '🇦🇫',
      'Maldives': '🇲🇻',
      'Bhutan': '🇧🇹',
      // Caribbean & Americas completed
      'Jamaica': '🇯🇲',
      'Cuba': '🇨🇺',
      'Dominican Republic': '🇩🇴',
      'Haiti': '🇭🇹',
      'Trinidad and Tobago': '🇹🇹',
      'Barbados': '🇧🇧',
      'Bahamas': '🇧🇸',
      'Grenada': '🇬🇩',
      'Saint Lucia': '🇱🇨',
      'Saint Vincent and the Grenadines': '🇻🇨',
      'Antigua and Barbuda': '🇦🇬',
      'Saint Kitts and Nevis': '🇰🇳',
      'Dominica': '🇩🇲',
      'Belize': '🇧🇿',
      'Panama': '🇵🇦',
      'Costa Rica': '🇨🇷',
      'El Salvador': '🇸🇻',
      'Guatemala': '🇬🇹',
      'Honduras': '🇭🇳',
      'Nicaragua': '🇳🇮',
      'Paraguay': '🇵🇾',
      'Uruguay': '🇺🇾',
      'Suriname': '🇸🇷',
      'Guyana': '🇬🇾',
      'Venezuela': '🇻🇪',
      'Puerto Rico': '🇵🇷',
      'Greenland': '🇬🇱',
      // Others
      'Western Sahara': '🇪🇭',
      // Micronesia
      'Micronesia': '🇫🇲',
      'Marshall Islands': '🇲🇭',
      'Palau': '🇵🇼',
      'Kiribati': '🇰🇮',
      'Nauru': '🇳🇷',
      'Tuvalu': '🇹🇻',
      // Caribbean (continued)
      'Aruba': '🇦🇼',
      'Curacao': '🇨🇼',
      'Sint Maarten': '🇸🇽',
      'Saint Martin': '🇲🇫',
      'Saint Barthelemy': '🇧🇱',
      'Saint Pierre and Miquelon': '🇵🇲',
      'Bermuda': '🇧🇲',
      'Cayman Islands': '🇰🇾',
      'Turks and Caicos Islands': '🇹🇨',
      'British Virgin Islands': '🇻🇬',
      'US Virgin Islands': '🇻🇮',
      'Montserrat': '🇲🇸',
      'Anguilla': '🇦🇮',
      'Sint Eustatius': '🇧🇶',
      'Bonaire': '🇧🇶',
      'Saba': '🇧🇶',
      'Saint Helena': '🇸🇭',
      // French overseas territories
      'Guadeloupe': '🇬🇵',
      'Martinique': '🇲🇶',
      'French Guiana': '🇬🇫',
      'Reunion': '🇷🇪',
      'Mayotte': '🇾🇹',
      'New Caledonia': '🇳🇨',
      'French Polynesia': '🇵🇫',
      'Wallis and Futuna': '🇼🇫',
      // More others
      'Timor-Leste': '🇹🇱',
      'Faroe Islands': '🇫🇴',
      'Kosovo': '🇽🇰',
      'Vatican': '🇻🇦',
      'Western Samoa': '🇼🇸',
      'Canary Islands': '🇮🇨',
    };

    const flag = countryToFlag[country] || '🌍';

    // Get flag colors based on country name (ensures accurate palette)
    const flagColors = getFlagColors(country);

    // Create flag mesh gradient background
    const backgroundSvg = createFlagMeshGradient(flagColors);
    let imageBuffer = await sharp(Buffer.from(backgroundSvg))
      .resize(1200, 630)
      .png()
      .toBuffer();

    // Load PortalPay symbol (local preferred, remote fallback)
    const ppSymbolOverlay: Buffer | null = await loadPPSymbol(OG_LAYOUT.ppSymbol.size);

    // Create text overlay with beautiful hierarchy: eyebrow + massive hero + description
    const eyebrowText = 'Accept Crypto Payments in';
    const heroText = name; // The location name as the star
    const subtitleText = localContext || 'Low-fee payment processing for local businesses';
    const maxTextWidth = OG_LAYOUT.canvas.width - OG_LAYOUT.text.x - OG_LAYOUT.margin;

    // Wrap hero if needed (rare, but handles long city names)
    const heroLines = wrapTitleToLines(heroText, maxTextWidth, 92, 2);
    const descFontSize = 24;
    const descLines = wrapTextToLines(subtitleText, maxTextWidth, descFontSize, 3);
    const descStartY = 360 + (heroLines.length - 1) * 50; // Adjust based on hero line count, moved down
    const linesSvg = descLines
      .map((ln, idx) => `<text x="${OG_LAYOUT.text.x}" y="${descStartY + idx * 30}" font-family="Arial, sans-serif" font-size="${descFontSize}" fill="rgba(255,255,255,0.90)" style="text-shadow: ${TEXT_SHADOWS.desc};">${renderLineWithEmphasis(ln)}</text>`)
      .join('\n');

    // Add industry pills below description
    const industryLabels: Record<string, string> = {
      'internet-cafes': 'Internet Cafés',
      'mobile-phone-repair': 'Phone Repair',
      'artisan-potters': 'Artisans',
      'village-savings-groups': 'Savings Groups',
      'community-radio-stations': 'Community Radio',
      'small-ferry-operators': 'Ferries',
      'street-food-vendors': 'Street Food',
      'market-stall-vendors': 'Markets',
      'cafes': 'Cafés',
      'bakeries': 'Bakeries',
      'hardware-shops': 'Hardware',
      'sari-sari-stores': 'Sari-Sari',
      'restaurants': 'Restaurants',
      'freelancers': 'Freelancers',
      'ecommerce': 'E-Commerce',
      'hotels': 'Hotels',
      // New industries from the industries directory
      'auto-repair': 'Auto Repair',
      'bars': 'Bars',
      'boda-boda-operators': 'Boda Boda',
      'butcher-shops': 'Butcher Shops',
      'community-pharmacies': 'Pharmacies',
      'community-tailors': 'Tailors',
      'cryptid-tour-operators': 'Cryptid Tours',
      'fisherfolk-cooperatives': 'Fisherfolk',
      'food-trucks': 'Food Trucks',
      'gyms': 'Gyms',
      'kirana-stores': 'Kirana Stores',
      'matatu-operators': 'Matatu',
      'medical': 'Medical',
      'micro-grid-operators': 'Micro-Grids',
      'mobile-money-agents': 'Mobile Money',
      'retail': 'Retail',
      'salons': 'Salons',
      'smallholder-farmers': 'Farmers',
      'street-barbers': 'Barbers',
      'street-musicians': 'Musicians',
      'tuk-tuk-operators': 'Tuk-Tuk',
      'veterinarians': 'Veterinarians',
      'waste-pickers': 'Waste Pickers',
      'water-kiosk-operators': 'Water Kiosks',
    };
    const pillsY = descStartY + (descLines.length * 30) + 40;
    const pillsSvg = locationData.popularIndustries
      .slice(0, 4)
      .map((ind, idx) => {
        const label = industryLabels[ind] || ind;
        const x = OG_LAYOUT.text.x + (idx * 125);
        return `
          <rect x="${x}" y="${pillsY}" width="115" height="28" rx="14" ry="14" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
          <text x="${x + 57.5}" y="${pillsY + 19}" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.95)" text-anchor="middle" letter-spacing="0.3">${escapeForSvg(label)}</text>
        `;
      })
      .join('');

    const textSvg = `
      <svg width="${OG_LAYOUT.canvas.width}" height="${OG_LAYOUT.canvas.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <!-- Eyebrow text (small, above hero) -->
        <text x="${OG_LAYOUT.text.x}" y="200" font-family="Arial, sans-serif" font-size="26" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="1" style="text-shadow: 1px 1px 3px rgba(0,0,0,0.3);">
          ${escapeForSvg(eyebrowText).toUpperCase()}
        </text>
        <!-- Hero: Massive location name -->
        ${heroLines.map((ln, idx) => `<text x="${OG_LAYOUT.text.x}" y="${300 + idx * 70}" font-family="Arial, sans-serif" font-size="92" font-weight="900" fill="white" filter="url(#glow)" style="text-shadow: 3px 3px 12px rgba(0,0,0,0.5);">${escapeForSvg(ln)}</text>`).join('')}
        <!-- Description lines -->
        ${linesSvg}
        <!-- Industry pills label -->
        <text x="${OG_LAYOUT.text.x}" y="${pillsY - 8}" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.75)" letter-spacing="0.5">
          MAJOR INDUSTRIES IN ${escapeForSvg(name.toUpperCase())}:
        </text>
        <!-- Industry pills -->
        ${pillsSvg}
        <!-- Bottom branding -->
        <text x="${OG_LAYOUT.text.x}" y="${OG_LAYOUT.brandingY}" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="2">
          ${escapeForSvg(`POWERED BY ${String(brand.name || '').toUpperCase()}`)}
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

    // Add Twemoji-rendered flag image to avoid black box rendering
    // Position flag emoji aligned with hero text
    const flagEmojiPng = await loadTwemojiPng(flag, 180);
    if (flagEmojiPng) {
      composites.push({ input: flagEmojiPng, top: 235, left: 50 });
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
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
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
            <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
        <text x="600" y="315" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="white" text-anchor="middle" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.3);">
          ${escapeForSvg(brand.name)}
        </text>
        <text x="600" y="380" font-family="Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.9)" text-anchor="middle">
          Global Crypto Payment Processing
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
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  }
}
