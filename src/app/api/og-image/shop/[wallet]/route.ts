import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { request as httpsRequest } from 'node:https';
import sharp from 'sharp';
import { getBrandConfig } from '@/config/brands';
import { loadPPSymbol } from '@/lib/og-asset-loader';

function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ShopTheme = {
  primaryColor?: string;
  secondaryColor?: string;
  brandLogoUrl?: string;
  coverPhotoUrl?: string;
  logoShape?: "square" | "circle";
};

type ShopConfig = {
  name: string;
  description?: string;
  bio?: string;
  theme: ShopTheme;
  industryPack?: 'restaurant' | 'retail' | 'hotel' | 'freelancer';
};

// Azure helpers (copied from media/upload route pattern)
function parseAzureConnString(conn?: string): { accountName?: string; accountKey?: string } {
  try {
    const s = String(conn || '');
    const parts = s.split(';').map((p) => p.trim());
    const out: Record<string, string> = {};
    for (const p of parts) {
      const [k, v] = p.split('=');
      if (k && v) out[k] = v;
    }
    return { accountName: out['AccountName'], accountKey: out['AccountKey'] };
  } catch {
    return {};
  }
}

function getAccountCreds(): { accountName: string; accountKey: string } {
  const fromConn = parseAzureConnString(process.env.AZURE_BLOB_CONNECTION_STRING);
  const accountName = process.env.AZURE_BLOB_ACCOUNT_NAME || fromConn.accountName || '';
  const accountKey = process.env.AZURE_BLOB_ACCOUNT_KEY || fromConn.accountKey || '';
  if (!accountName || !accountKey) {
    throw new Error('azure_creds_missing');
  }
  return { accountName, accountKey };
}

function buildBlobUrl(accountName: string, container: string, blobName: string): string {
  return `https://${accountName}.blob.core.windows.net/${container}/${blobName}`;
}

async function uploadBlobSharedKey(
  accountName: string,
  accountKey: string,
  container: string,
  blobName: string,
  contentType: string,
  body: Uint8Array
): Promise<void> {
  const xmsVersion = '2021-12-02';
  const xmsDate = new Date().toUTCString();
  const contentLength = body.byteLength;

  const canonHeaders =
    `x-ms-blob-type:BlockBlob\n` +
    `x-ms-date:${xmsDate}\n` +
    `x-ms-version:${xmsVersion}\n`;

  const canonResource = `/${accountName}/${container}/${blobName}`;

  const stringToSign =
    `PUT\n` +
    `\n` +
    `\n` +
    `${contentLength}\n` +
    `\n` +
    `${contentType}\n` +
    `\n` +
    `\n` +
    `\n` +
    `\n` +
    `\n` +
    `\n` +
    `${canonHeaders}` +
    `${canonResource}`;

  const key = Buffer.from(accountKey, 'base64');
  const sig = crypto.createHmac('sha256', key).update(stringToSign, 'utf8').digest('base64');
  const auth = `SharedKey ${accountName}:${sig}`;

  await new Promise<void>((resolve, reject) => {
    const options = {
      hostname: `${accountName}.blob.core.windows.net`,
      path: `/${container}/${blobName}`,
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-date': xmsDate,
        'x-ms-version': xmsVersion,
        'Content-Type': contentType,
        'Content-Length': contentLength,
        Authorization: auth,
      },
    };
    const req = httpsRequest(options, (res) => {
      const status = res.statusCode || 0;
      if (status >= 200 && status < 300) {
        resolve();
      } else {
        reject(new Error(`azure_put_failed_${status}`));
      }
    });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

async function fetchImageAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return { r, g, b };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const brand = getBrandConfig();
  try {
    const { wallet } = await params;
    const containerName = process.env.AZURE_BLOB_CONTAINER || 'portalpay';

    // Generate blob key based on wallet
    const blobName = `og-shop-${wallet}.jpg`;

    // Fetch shop config directly from Cosmos DB (avoid self-fetch)
    const { getContainer } = await import('@/lib/cosmos');
    const container = await getContainer();

    let config: ShopConfig = { name: 'Shop', theme: {} };
    try {
      const { resource } = await container.item('shop:config', wallet).read<any>();
      if (resource) {
        config = {
          name: resource.name || 'Shop',
          description: resource.description,
          bio: resource.bio,
          theme: resource.theme || {},
          industryPack: resource.industryPack,
        };
      }
    } catch (cosmosError) {
      console.warn('Failed to fetch shop config from Cosmos, using defaults:', cosmosError);
    }

    const primaryColor = config.theme?.primaryColor || '#0ea5e9';
    const secondaryColor = config.theme?.secondaryColor || '#22c55e';
    const coverPhotoUrl = config.theme?.coverPhotoUrl;
    const logoUrl = config.theme?.brandLogoUrl;
    const logoShape = config.theme?.logoShape || 'square';
    const name = config.name || 'Shop';
    const aboutText = config.bio || config.description || '';
    const aboutExcerpt = aboutText.length > 140 ? aboutText.slice(0, 137) + '...' : aboutText;

    // Create gradient background as SVG
    const gradientSvg = `
      <svg width="1200" height="630">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${primaryColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${secondaryColor};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
      </svg>
    `;

    // Cover photo should only fill top portion (leaving room for bottom bar)
    const coverHeight = 400; // Top portion for cover photo
    const bottomBarHeight = 230; // Bottom bar height
    const cornerRadius = 48; // More pronounced rounded corners

    let coverImageBuffer: Buffer;

    if (coverPhotoUrl) {
      const coverBuffer = await fetchImageAsBuffer(coverPhotoUrl);
      if (coverBuffer) {
        try {
          // Resize cover photo to fit top portion only
          let tempCover = await sharp(coverBuffer)
            .resize(1200, coverHeight, { fit: 'cover' })
            .png()
            .toBuffer();

          // Add inner shadow BEFORE applying rounded corners
          const innerShadowSvg = Buffer.from(
            `<svg width="1200" height="${coverHeight}">
              <defs>
                <linearGradient id="innerShadow" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:rgb(0,0,0);stop-opacity:0.15" />
                  <stop offset="10%" style="stop-color:rgb(0,0,0);stop-opacity:0" />
                  <stop offset="90%" style="stop-color:rgb(0,0,0);stop-opacity:0" />
                  <stop offset="100%" style="stop-color:rgb(0,0,0);stop-opacity:0.3" />
                </linearGradient>
              </defs>
              <rect width="1200" height="${coverHeight}" fill="url(#innerShadow)"/>
            </svg>`
          );

          tempCover = await sharp(tempCover)
            .composite([{ input: innerShadowSvg, blend: 'over' }])
            .png()
            .toBuffer();

          // Now apply rounded corners to bottom (this will clip the shadow correctly)
          const roundedBottomMask = Buffer.from(
            `<svg width="1200" height="${coverHeight}">
              <path d="M 0 0 L 1200 0 L 1200 ${coverHeight - cornerRadius} Q 1200 ${coverHeight} ${1200 - cornerRadius} ${coverHeight} L ${cornerRadius} ${coverHeight} Q 0 ${coverHeight} 0 ${coverHeight - cornerRadius} Z" fill="white"/>
            </svg>`
          );

          coverImageBuffer = await sharp(tempCover)
            .composite([{ input: roundedBottomMask, blend: 'dest-in' }])
            .png()
            .toBuffer();
        } catch (e) {
          // Fall back to gradient if cover fails
          console.warn('Cover photo failed, using gradient:', e);
          coverImageBuffer = await sharp(Buffer.from(gradientSvg))
            .resize(1200, coverHeight)
            .png()
            .toBuffer();
        }
      } else {
        coverImageBuffer = await sharp(Buffer.from(gradientSvg))
          .resize(1200, coverHeight)
          .png()
          .toBuffer();
      }
    } else {
      coverImageBuffer = await sharp(Buffer.from(gradientSvg))
        .resize(1200, coverHeight)
        .png()
        .toBuffer();
    }

    // Create colored bottom bar (using primaryColor)
    const rgb = hexToRgb(primaryColor);
    const bottomBarSvg = `
      <svg width="1200" height="${bottomBarHeight}">
        <rect width="1200" height="${bottomBarHeight}" fill="rgb(${rgb.r},${rgb.g},${rgb.b})" fill-opacity="0.95"/>
      </svg>
    `;

    // Create base canvas with primaryColor background (not black)
    let imageBuffer = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1 }
      }
    })
      .composite([
        { input: coverImageBuffer, top: 0, left: 0 },
        { input: Buffer.from(bottomBarSvg), top: coverHeight, left: 0 },
      ])
      .png()
      .toBuffer();

    // Fetch and process logo if available
    let logoBuffer: Buffer | null = null;
    if (logoUrl) {
      logoBuffer = await fetchImageAsBuffer(logoUrl);
    }

    // Create logo overlay respecting logoShape (BIGGER - 100x100)
    let logoOverlay: Buffer | null = null;
    if (logoBuffer) {
      try {
        const logoSize = 92;
        const borderSize = 4;
        const totalSize = logoSize + (borderSize * 2);

        // Create shape mask based on logoShape
        const shapeMask = logoShape === 'circle'
          ? `<svg width="${totalSize}" height="${totalSize}">
              <circle cx="${totalSize / 2}" cy="${totalSize / 2}" r="${totalSize / 2}" fill="white"/>
            </svg>`
          : `<svg width="${totalSize}" height="${totalSize}">
              <rect x="0" y="0" width="${totalSize}" height="${totalSize}" rx="16" ry="16" fill="white"/>
            </svg>`;

        // Create white background with shape
        const shapeBg = await sharp(Buffer.from(shapeMask))
          .png()
          .toBuffer();

        // Resize logo and composite on white background
        const resizedLogo = await sharp(logoBuffer)
          .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
          .png()
          .toBuffer();

        logoOverlay = await sharp(shapeBg)
          .resize(totalSize, totalSize)
          .composite([{
            input: resizedLogo,
            top: borderSize,
            left: borderSize,
          }])
          .png()
          .toBuffer();
      } catch (e) {
        console.warn('Logo processing failed:', e);
      }
    }

    // Load brand-appropriate symbol (partner: brand symbol/app; platform: ppsymbol.png)
    const ppSymbolOverlay: Buffer | null = await loadPPSymbol(60);

    // Create text overlay - only 2 lines max for description
    const maxTextWidth = 950;
    const nameSize = name.length > 25 ? 32 : 40;
    const descSize = 19;

    // Smart text wrapping: break at word boundaries, add hyphen if word is split
    const wrapText = (text: string, maxChars: number): { line1: string; line2: string; needsHyphen: boolean } => {
      if (text.length <= maxChars) {
        return { line1: text, line2: '', needsHyphen: false };
      }

      // Try to break at last space before maxChars
      let breakPoint = text.lastIndexOf(' ', maxChars);
      if (breakPoint === -1 || breakPoint < maxChars * 0.7) {
        // No good break point or too early - break mid-word with hyphen
        breakPoint = maxChars - 1;
        const line1 = text.substring(0, breakPoint) + '-';
        const line2 = text.substring(breakPoint);
        return { line1, line2, needsHyphen: true };
      }

      // Break at space
      const line1 = text.substring(0, breakPoint);
      const line2 = text.substring(breakPoint + 1);
      return { line1, line2, needsHyphen: false };
    };

    const wrapped = wrapText(aboutExcerpt, 70);
    const line1 = wrapped.line1;
    const line2Wrapped = wrapped.line2.length > 70 ? wrapText(wrapped.line2, 70) : { line1: wrapped.line2, line2: '', needsHyphen: false };
    const line2 = line2Wrapped.line1;
    const needsReadMore = aboutText.length > 140 || line2Wrapped.line2.length > 0;

    // Escape text properly for SVG (preserve apostrophes, escape only XML special chars)
    const escapeForSvg = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const textSvg = `
      <svg width="${maxTextWidth}" height="200">
        <text x="0" y="45" font-family="Arial, sans-serif" font-size="${nameSize}" font-weight="bold" fill="white">${escapeForSvg(name)}</text>
        ${line1 ? `<text x="0" y="78" font-family="Arial, sans-serif" font-size="${descSize}" fill="rgba(255,255,255,0.9)">${escapeForSvg(line1)}</text>` : ''}
        ${line2 ? `<text x="0" y="103" font-family="Arial, sans-serif" font-size="${descSize}" fill="rgba(255,255,255,0.9)">${escapeForSvg(line2)}${needsReadMore ? '...' : ''}</text>` : ''}
        ${needsReadMore && line2 ? `<text x="0" y="125" font-family="Arial, sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" font-style="italic">read more</text>` : ''}
        <text x="0" y="${line2 ? (needsReadMore ? '160' : '138') : (line1 ? '113' : '78')}" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="rgba(255,255,255,0.8)" letter-spacing="2">${escapeForSvg(`POWERED BY ${String(brand.name || '').toUpperCase()}`)}</text>
      </svg>
    `;

    // Get industry pack data - clean icons with brand color strokes only
    const industryPackInfo = config.industryPack ? {
      'general': {
        icon: '<circle cx="12" cy="12" r="10" stroke="rgb(14,165,233)" stroke-width="2.5" fill="none"/><circle cx="12" cy="12" r="3" fill="rgb(14,165,233)"/>',
        primaryColor: '#0ea5e9',
        label: 'General'
      },
      'restaurant': {
        icon: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" stroke="rgb(220,38,38)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
        primaryColor: '#DC2626',
        label: 'Restaurant'
      },
      'retail': {
        icon: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="rgb(99,102,241)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
        primaryColor: '#6366F1',
        label: 'Retail'
      },
      'hotel': {
        icon: '<rect x="4" y="2" width="16" height="20" rx="2" stroke="rgb(14,165,233)" stroke-width="2.5" fill="none"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M8 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" stroke="rgb(14,165,233)" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        primaryColor: '#0EA5E9',
        label: 'Hotel'
      },
      'freelancer': {
        icon: '<rect x="4" y="10" width="16" height="10" rx="2" stroke="rgb(124,58,237)" stroke-width="2.5" fill="none"/><path d="M8 10V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4" stroke="rgb(124,58,237)" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
        primaryColor: '#7C3AED',
        label: 'Freelancer'
      }
    }[config.industryPack] : null;

    // Create industry pack badge with light background and colored border
    let industryPackBadge: Buffer | null = null;
    if (industryPackInfo) {
      const packRgb = hexToRgb(industryPackInfo.primaryColor);
      const badgeSvg = `
        <svg width="140" height="170" viewBox="0 0 140 170">
          <rect x="20" y="5" width="100" height="100" rx="20" ry="20" fill="rgb(${packRgb.r},${packRgb.g},${packRgb.b})" fill-opacity="0.15" stroke="rgb(${packRgb.r},${packRgb.g},${packRgb.b})" stroke-width="4"/>
          <g transform="translate(45, 30)">
            <svg width="50" height="50" viewBox="0 0 24 24">
              ${industryPackInfo.icon}
            </svg>
          </g>
          <text x="70" y="135" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="rgba(255,255,255,0.9)" text-anchor="middle" letter-spacing="1">${industryPackInfo.label.toUpperCase()}</text>
        </svg>
      `;
      try {
        industryPackBadge = await sharp(Buffer.from(badgeSvg))
          .png()
          .toBuffer();
      } catch (e) {
        console.warn('Industry pack badge failed:', e);
      }
    }

    // Reduce text width if industry pack badge exists to prevent overlap
    const textWidth = industryPackBadge ? 800 : 950;

    // Composite all layers
    const composites: any[] = [];

    // Add PortalPay symbol if loaded
    if (ppSymbolOverlay) {
      composites.push({ input: ppSymbolOverlay, top: 30, left: 1110 }); // Top right corner
    }

    if (logoOverlay) {
      composites.push({ input: logoOverlay, top: 435, left: 40 }); // Logo in bottom bar (lowered to align with text)
    }

    composites.push({ input: Buffer.from(textSvg), top: 420, left: logoOverlay ? 160 : 40 }); // Text next to logo

    // Add industry pack badge on right side with same margin as left (40px from right edge)
    if (industryPackBadge) {
      composites.push({ input: industryPackBadge, top: 435, left: 1020 }); // 40px margin from right (1200 - 140 - 40 = 1020)
    }

    const compositeBuffer = await sharp(imageBuffer)
      .composite(composites)
      .toBuffer();

    // Generate final image as JPEG
    const finalImage = await sharp(compositeBuffer)
      .jpeg({ quality: 85 })
      .toBuffer();

    // Upload to Azure Blob
    const { accountName, accountKey } = getAccountCreds();

    try {
      await uploadBlobSharedKey(
        accountName,
        accountKey,
        containerName,
        blobName,
        'image/jpeg',
        new Uint8Array(finalImage)
      );
    } catch (e) {
      console.error('Azure upload failed:', e);
      // Continue anyway and return the image
    }

    // Construct public URL
    const storageUrl = buildBlobUrl(accountName, containerName, blobName);
    const publicBase = process.env.AZURE_BLOB_PUBLIC_BASE_URL;
    const publicUrl = (() => {
      try {
        if (publicBase) {
          const u = new URL(storageUrl);
          return `${publicBase}${u.pathname}`;
        }
      } catch { }
      return storageUrl;
    })();

    // Return the generated image directly (convert Buffer to Uint8Array for NextResponse)
    return new NextResponse(new Uint8Array(finalImage), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-OG-Image-Url': publicUrl,
      },
    });
  } catch (error) {
    console.error('OG image generation error:', error);

    // Return a simple fallback gradient
    const fallbackSvg = `
      <svg width="1200" height="630">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#22c55e;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#grad)" />
        <text x="600" y="315" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="white" text-anchor="middle">${escapeXml(`Shop on ${brand.name}`)}</text>
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
