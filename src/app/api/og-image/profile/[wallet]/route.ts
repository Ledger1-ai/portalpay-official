import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { request as httpsRequest } from 'node:https';
import sharp from 'sharp';
import { loadPPSymbol } from '@/lib/og-asset-loader';
import { getBrandKey } from '@/config/brands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// Azure helpers
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

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const srgb = [rgb.r, rgb.g, rgb.b].map(v => v / 255);
  const lin = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function shouldInvertSymbol(bgColor: string): boolean {
  const rgb = hexToRgb(bgColor);
  const L = relativeLuminance(rgb);
  return L < 0.5; // Invert if background is dark
}

function wrapTextWithHyphens(text: string, maxCharsPerLine: number, maxLines: number): { lines: string[]; truncated: boolean } {
  if (!text) return { lines: [], truncated: false };

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      // Check if we need to hyphenate the word
      if (word.length > maxCharsPerLine && currentLine.length > 0) {
        lines.push(currentLine);
        if (lines.length >= maxLines) {
          return { lines, truncated: true };
        }
        currentLine = word;
      } else if (word.length > maxCharsPerLine) {
        // Word itself is too long, need to hyphenate it
        let remainingWord = word;
        while (remainingWord.length > 0 && lines.length < maxLines) {
          const chunkSize = currentLine.length > 0 ? maxCharsPerLine : maxCharsPerLine - 1;
          if (remainingWord.length > chunkSize) {
            const chunk = remainingWord.substring(0, chunkSize - 1) + '-';
            if (currentLine.length > 0) {
              lines.push(currentLine);
              currentLine = chunk;
            } else {
              lines.push(chunk);
              currentLine = '';
            }
            remainingWord = remainingWord.substring(chunkSize - 1);
          } else {
            currentLine = remainingWord;
            remainingWord = '';
          }
        }
        if (lines.length >= maxLines && remainingWord.length > 0) {
          return { lines, truncated: true };
        }
      } else {
        // Start a new line
        if (currentLine) {
          lines.push(currentLine);
          if (lines.length >= maxLines) {
            return { lines, truncated: true };
          }
        }
        currentLine = word;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  } else if (currentLine && lines.length >= maxLines) {
    return { lines, truncated: true };
  }

  return { lines, truncated: false };
}

function generateGradientFromWallet(wallet: string): string {
  let hash = 0;
  for (let i = 0; i < wallet.length; i++) {
    hash = ((hash << 5) - hash) + wallet.charCodeAt(i);
    hash = hash & hash;
  }

  const hue1 = Math.abs(hash % 360);
  const hue2 = Math.abs((hash * 137) % 360);

  return `<svg width="1200" height="630">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${hue1}, 70%, 50%);stop-opacity:1" />
        <stop offset="100%" style="stop-color:hsl(${hue2}, 70%, 50%);stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#grad)" />
  </svg>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;
    const containerName = process.env.AZURE_BLOB_CONTAINER || 'portalpay';

    // Generate blob key based on wallet
    const blobName = `og-profile-${wallet}.jpg`;

    // Fetch profile from Cosmos DB
    const { getContainer } = await import('@/lib/cosmos');
    const container = await getContainer();

    let profile: Profile = {};
    try {
      let brandKey: string | undefined = undefined;
      try { brandKey = getBrandKey(); } catch { brandKey = undefined; }
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
    const bio = profile.bio || '';
    const pfpUrl = profile.pfpUrl;
    const backgroundUrl = profile.profileConfig?.backgroundUrl;
    const themeColor = profile.profileConfig?.themeColor || '#3b82f6'; // User's primary color
    const isMerchant = profile.roles?.merchant || false;
    const isBuyer = profile.roles?.buyer || false;

    // Create gradient background
    const gradientSvg = generateGradientFromWallet(wallet);

    // Start with gradient or background photo
    let baseImage = sharp(Buffer.from(gradientSvg))
      .resize(1200, 630);

    if (backgroundUrl) {
      const bgBuffer = await fetchImageAsBuffer(backgroundUrl);
      if (bgBuffer) {
        try {
          baseImage = sharp(bgBuffer)
            .resize(1200, 630, { fit: 'cover' });
        } catch (e) {
          console.warn('Background photo failed, using gradient:', e);
        }
      }
    }

    let imageBuffer = await baseImage.png().toBuffer();

    // Add blurred glass overlay in user's primary color
    const themeRgb = hexToRgb(themeColor);
    const glassOverlaySvg = `
      <svg width="1200" height="630">
        <rect width="1200" height="630" fill="rgb(${themeRgb.r},${themeRgb.g},${themeRgb.b})" fill-opacity="0.4"/>
      </svg>
    `;

    imageBuffer = await sharp(imageBuffer)
      .blur(8)
      .composite([{ input: Buffer.from(glassOverlaySvg), blend: 'over' }])
      .png()
      .toBuffer();

    // Create business card with glassmorphism effect (centered with larger corners)
    const cardWidth = 900;
    const cardHeight = 500;
    const cardX = (1200 - cardWidth) / 2;
    const cardY = (630 - cardHeight) / 2;

    // Glassmorphism card with border - more opaque white
    const cardSvg = `
      <svg width="${cardWidth}" height="${cardHeight}">
        <defs>
          <linearGradient id="cardGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(255,255,255,0.92);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(255,255,255,0.88);stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${cardWidth}" height="${cardHeight}" rx="48" ry="48" fill="url(#cardGradient)"/>
        <rect width="${cardWidth - 4}" height="${cardHeight - 4}" x="2" y="2" rx="46" ry="46" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="2"/>
      </svg>
    `;

    imageBuffer = await sharp(imageBuffer)
      .composite([{
        input: Buffer.from(cardSvg),
        top: cardY,
        left: cardX
      }])
      .png()
      .toBuffer();

    // Load brand-appropriate symbol (partner: brand symbol/app; platform: ppsymbol.png) and apply theme color
    let ppSymbolOverlay: Buffer | null = null;
    try {
      const ppSymbolRaw = await loadPPSymbol(50);
      if (ppSymbolRaw) {
        const symbolThemeRgb = hexToRgb(themeColor);
        // Create a solid color rectangle with the theme color
        const colorRect = await sharp({
          create: {
            width: 50,
            height: 50,
            channels: 4,
            background: { r: symbolThemeRgb.r, g: symbolThemeRgb.g, b: symbolThemeRgb.b, alpha: 1 }
          }
        })
          .png()
          .toBuffer();
        // Use the symbol as an alpha mask to create colored version (like Photoshop color overlay)
        const symbolProcessed = await sharp(colorRect)
          .composite([{ input: ppSymbolRaw, blend: 'dest-in' }])
          .png()
          .toBuffer();
        ppSymbolOverlay = symbolProcessed;
      }
    } catch (e) {
      console.warn('Symbol processing failed:', e);
    }

    // Fetch and process profile picture with theme color border
    const pfpBorderColor = themeColor;
    let pfpOverlay: Buffer | null = null;
    if (pfpUrl) {
      const pfpBuffer = await fetchImageAsBuffer(pfpUrl);
      if (pfpBuffer) {
        try {
          const pfpSize = 140;
          const circleMask = Buffer.from(
            `<svg width="${pfpSize}" height="${pfpSize}">
              <circle cx="${pfpSize / 2}" cy="${pfpSize / 2}" r="${pfpSize / 2}" fill="white"/>
            </svg>`
          );

          const resizedPfp = await sharp(pfpBuffer)
            .resize(pfpSize, pfpSize, { fit: 'cover' })
            .composite([{ input: circleMask, blend: 'dest-in' }])
            .png()
            .toBuffer();

          // Add border with theme color
          const borderRgb = hexToRgb(pfpBorderColor);
          const borderSvg = Buffer.from(
            `<svg width="${pfpSize + 8}" height="${pfpSize + 8}">
              <circle cx="${(pfpSize + 8) / 2}" cy="${(pfpSize + 8) / 2}" r="${(pfpSize + 8) / 2}" fill="rgb(${borderRgb.r},${borderRgb.g},${borderRgb.b})"/>
            </svg>`
          );

          pfpOverlay = await sharp(borderSvg)
            .composite([{
              input: resizedPfp,
              top: 4,
              left: 4
            }])
            .png()
            .toBuffer();
        } catch (e) {
          console.warn('PFP processing failed:', e);
        }
      }
    }

    // Create text content with improved bio handling
    const escapeForSvg = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Wrap bio text to 4 lines with hyphenation
    const { lines: bioLines, truncated } = wrapTextWithHyphens(bio, 85, 4);

    // Generate bio text elements
    let bioTextElements = '';
    if (bioLines.length > 0) {
      const bioStartY = 330;
      const lineHeight = 24;
      bioLines.forEach((line, index) => {
        const isLastLine = index === bioLines.length - 1;
        const displayLine = truncated && isLastLine ? line.substring(0, Math.max(0, line.length - 12)) + '... read more' : line;
        bioTextElements += `<text x="${cardWidth / 2}" y="${bioStartY + (index * lineHeight)}" font-family="Arial, sans-serif" font-size="18" fill="#374151" text-anchor="middle">${escapeForSvg(displayLine)}</text>`;
      });
    }

    const textSvg = `
      <svg width="${cardWidth}" height="${cardHeight}">
        <text x="${cardWidth / 2}" y="250" font-family="Arial, sans-serif" font-size="52" font-weight="bold" fill="#111827" text-anchor="middle">${escapeForSvg(displayName)}</text>
        <text x="${cardWidth / 2}" y="295" font-family="Arial, sans-serif" font-size="20" fill="#6b7280" text-anchor="middle">${wallet.slice(0, 6)}...${wallet.slice(-4)}</text>
        ${bioTextElements}
        <text x="${cardWidth / 2}" y="${cardHeight - 30}" font-family="Arial, sans-serif" font-size="14" font-weight="600" fill="#9ca3af" text-anchor="middle" letter-spacing="2">PORTALPAY PROFILE</text>
      </svg>
    `;

    // Create role badges for top right
    let roleBadgesSvg = '';
    if (isMerchant || isBuyer) {
      const badges: string[] = [];
      if (isMerchant) badges.push('<rect x="0" y="0" width="100" height="36" rx="18" fill="#10b981"/><text x="50" y="24" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="white" text-anchor="middle">Merchant</text>');
      if (isBuyer) {
        const xOffset = isMerchant ? 110 : 0;
        badges.push(`<rect x="${xOffset}" y="0" width="80" height="36" rx="18" fill="#3b82f6"/><text x="${xOffset + 40}" y="24" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="white" text-anchor="middle">Buyer</text>`);
      }

      const badgeWidth = (isMerchant && isBuyer) ? 190 : (isMerchant ? 100 : 80);
      roleBadgesSvg = `<svg width="${badgeWidth}" height="36">${badges.join('')}</svg>`;
    }

    // Composite all elements
    const composites: any[] = [];

    // PortalPay symbol in top left of card
    if (ppSymbolOverlay) {
      composites.push({ input: ppSymbolOverlay, top: cardY + 30, left: cardX + 30 });
    }

    // Role badges in top right of card
    if (roleBadgesSvg) {
      const badgeWidth = (isMerchant && isBuyer) ? 190 : (isMerchant ? 100 : 80);
      composites.push({ input: Buffer.from(roleBadgesSvg), top: cardY + 30, left: cardX + cardWidth - badgeWidth - 30 });
    }

    // Profile picture centered near top
    if (pfpOverlay) {
      composites.push({ input: pfpOverlay, top: cardY + 60, left: cardX + (cardWidth - 148) / 2 });
    }

    // Text content
    composites.push({ input: Buffer.from(textSvg), top: cardY, left: cardX });

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

    return new NextResponse(new Uint8Array(finalImage), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'X-OG-Image-Url': publicUrl,
      },
    });
  } catch (error) {
    console.error('Profile OG image error:', error);

    // Fallback
    const { wallet } = await params;
    const fallbackSvg = generateGradientFromWallet(wallet);
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
