/**
 * OG Image Generation Utilities
 * Shared utilities for generating beautiful OG images for landing pages
 */

import { getBrandConfig } from '@/config/brands';
import { isPartnerContext } from '@/lib/env';
import { getBaseUrl as getAppBaseUrl } from '@/lib/base-url';

/**
 * Get the base URL for the application, respecting production environment
 * Returns the production URL if NODE_ENV is production, otherwise localhost
 */
export function getBaseUrl(): string {
  // Delegate to central helper which respects Host header and enforces https in prod
  return getAppBaseUrl();
}

/**
 * Extract emoji colors to create gradients
 * Maps common emojis to their dominant colors
 */
export function getEmojiColors(emoji: string): string[] {
  const emojiColorMap: Record<string, string[]> = {
    // Food & Restaurant
    '🍽️': ['#E74C3C', '#F39C12', '#E67E22'],
    '☕': ['#6F4E37', '#D2691E', '#8B4513'],
    '🍺': ['#F39C12', '#E67E22', '#D68910'],
    '🍰': ['#FFB6C1', '#FFC0CB', '#FF69B4'],
    '🚚': ['#3498DB', '#E74C3C', '#F39C12'],
    '💇': ['#9B59B6', '#8E44AD', '#E91E63'],

    // Retail & Services
    '🛍️': ['#E91E63', '#9C27B0', '#673AB7'],
    '🏪': ['#2196F3', '#00BCD4', '#009688'],
    '🏋️': ['#FF5722', '#F44336', '#E91E63'],
    '🏨': ['#0ea5e9', '#3b82f6', '#8b5cf6'],
    '💼': ['#607D8B', '#455A64', '#37474F'],

    // Transportation
    '🏍️': ['#FF5722', '#F44336', '#E91E63'],
    '🚕': ['#FFEB3B', '#FFC107', '#FF9800'],
    '🚤': ['#03A9F4', '#00BCD4', '#009688'],

    // Tech & Services
    '📱': ['#2196F3', '#03A9F4', '#00BCD4'],
    '📻': ['#9C27B0', '#673AB7', '#3F51B5'],
    '💡': ['#FFEB3B', '#FFC107', '#FF9800'],

    // Agriculture & Nature
    '🌾': ['#FDD835', '#FBC02D', '#F9A825'],
    '🎣': ['#03A9F4', '#00BCD4', '#009688'],
    '🎨': ['#E91E63', '#9C27B0', '#FF5722'],

    // Community Services
    '💊': ['#F44336', '#E91E63', '#9C27B0'],
    '🔧': ['#607D8B', '#546E7A', '#455A64'],
    '✂️': ['#FF5722', '#F44336', '#E91E63'],
    '♻️': ['#4CAF50', '#8BC34A', '#CDDC39'],
    '🥩': ['#D32F2F', '#C62828', '#B71C1C'],
    '💰': ['#4CAF50', '#66BB6A', '#81C784'],
    '🧱': ['#FF6F00', '#FF8F00', '#FFA000'],
    '🎵': ['#9C27B0', '#AB47BC', '#BA68C8'],
    '🎭': ['#E91E63', '#F06292', '#F48FB1'],
    '🏺': ['#D84315', '#BF360C', '#8D6E63'],
    '💵': ['#558B2F', '#689F38', '#7CB342'],

    // Default gradients
    'default': ['#0ea5e9', '#3b82f6', '#8b5cf6'],
  };

  return emojiColorMap[emoji] || emojiColorMap['default'];
}

/**
 * Create a mesh gradient SVG background
 */
export function createMeshGradient(colors: string[], width = 1200, height = 630): string {
  const [color1, color2, color3] = colors.length >= 3 ? colors : [...colors, ...colors, colors[0]];

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="grad1" cx="20%" cy="30%" r="50%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:${color1};stop-opacity:0" />
        </radialGradient>
        <radialGradient id="grad2" cx="80%" cy="70%" r="50%">
          <stop offset="0%" style="stop-color:${color2};stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:0" />
        </radialGradient>
        <radialGradient id="grad3" cx="50%" cy="50%" r="60%">
          <stop offset="0%" style="stop-color:${color3};stop-opacity:0.6" />
          <stop offset="100%" style="stop-color:${color3};stop-opacity:0" />
        </radialGradient>
        <linearGradient id="baseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:0.3" />
          <stop offset="50%" style="stop-color:${color2};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${color3};stop-opacity:0.3" />
        </linearGradient>
      </defs>
      
      <!-- Base gradient background -->
      <rect width="${width}" height="${height}" fill="url(#baseGrad)" />
      
      <!-- Mesh gradient overlays -->
      <rect width="${width}" height="${height}" fill="url(#grad1)" />
      <rect width="${width}" height="${height}" fill="url(#grad2)" />
      <rect width="${width}" height="${height}" fill="url(#grad3)" />
      
      <!-- Subtle noise texture overlay -->
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="${width}" height="${height}" fill="white" opacity="0.03" filter="url(#noise)" />
    </svg>
  `;
}

/**
 * Create a flag mesh gradient SVG (for location pages)
 */
export function createFlagMeshGradient(flagColors: string[], width = 1200, height = 630): string {
  // Use the flag colors to create a beautiful mesh gradient
  const safeColors = flagColors || ['#ffffff', '#cccccc', '#999999'];
  const colors = safeColors.length >= 3 ? safeColors.slice(0, 3) : [...safeColors, ...safeColors, safeColors[0]];
  return createMeshGradient(colors, width, height);
}

// Shared OG layout constants for consistent alignment across templates
export const OG_LAYOUT = {
  canvas: { width: 1200, height: 630 },
  margin: 40,
  icon: { x: 80, y: 80, size: 150 },
  text: { x: 260, titleY: 260, descStartY: 320, lineStep: 28 },
  // PortalPay symbol positioned equidistant from the top and right edges
  // Right margin = top margin = OG_LAYOUT.margin (40). For a 96px symbol on a 1200px canvas: x = 1200 - 40 - 96 = 1064, y = 40
  ppSymbol: { x: 1064, y: 40, size: 96 },
  brandingY: 585
};

// Standard text shadows
export const TEXT_SHADOWS = {
  title: '2px 2px 8px rgba(0,0,0,0.45)',
  desc: '1px 1px 4px rgba(0,0,0,0.45)',
  label: '1px 1px 4px rgba(0,0,0,0.5)'
};

// Emphasis patterns for description lines (bold important phrases/numbers)
export const EMPHASIS_PATTERNS: RegExp[] = [
  /\b\d{1,3}%\b/gi, // percentages like 70%
  /\binstant settlement\b/gi,
  /\blower fees\b/gi,
  /\bfree pms\b/gi,
  /\bfree enterprise features\b/gi,
  /\broom management\b/gi,
  /\bbooking\b/gi,
];

// Split title at colon to avoid truncation after ":" (returns main and optional lead)
export function splitTitleAtColon(title: string): { mainTitle: string; subLead: string | null } {
  const t = String(title || '').trim();
  const idx = t.indexOf(':');
  if (idx === -1) return { mainTitle: t, subLead: null };
  const main = t.slice(0, idx).trim();
  const lead = t.slice(idx + 1).trim();
  return { mainTitle: main, subLead: lead || null };
}

// Wrap title to max 2 lines using width heuristic (bigger font defaults)
export function wrapTitleToLines(title: string, maxWidth: number, fontSize = 56, maxLines = 2): string[] {
  return wrapTextToLines(title, maxWidth, fontSize, maxLines);
}

// Render a line with emphasis by splitting around matches and composing <tspan>s
export function renderLineWithEmphasis(line: string): string {
  const raw = String(line || '');
  if (!raw) return '';
  // Find all matches with positions
  let segments: { text: string; bold: boolean }[] = [];
  let cursor = 0;
  const allMatches: { start: number; end: number }[] = [];
  for (const re of EMPHASIS_PATTERNS) {
    const regex = new RegExp(re.source, re.flags); // clone to reset lastIndex
    let m: RegExpExecArray | null;
    while ((m = regex.exec(raw))) {
      allMatches.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  // Merge overlaps
  allMatches.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const m of allMatches) {
    if (!merged.length || m.start > merged[merged.length - 1].end) {
      merged.push({ ...m });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, m.end);
    }
  }
  // Build segments
  for (const m of merged) {
    if (m.start > cursor) {
      segments.push({ text: raw.slice(cursor, m.start), bold: false });
    }
    segments.push({ text: raw.slice(m.start, m.end), bold: true });
    cursor = m.end;
  }
  if (cursor < raw.length) {
    segments.push({ text: raw.slice(cursor), bold: false });
  }

  // Compose tspans with escaping and proper spacing, carefully handling spaces
  const tspans = segments
    .map((seg, idx) => {
      let txt = seg.text;
      // Preserve spaces at start and end by putting them outside the <tspan>
      let leadingSpaces = '';
      let trailingSpaces = '';
      const matchLeading = txt.match(/^\s+/);
      if (matchLeading) {
        leadingSpaces = matchLeading[0];
        txt = txt.slice(leadingSpaces.length);
      }
      const matchTrailing = txt.match(/\s+$/);
      if (matchTrailing) {
        trailingSpaces = matchTrailing[0];
        txt = txt.slice(0, txt.length - trailingSpaces.length);
      }
      const content = escapeForSvg(txt);
      const tspanContent = seg.bold
        ? `<tspan font-weight="700">${content}</tspan>`
        : `<tspan>${content}</tspan>`;
      // Always return leadingSpaces + tspan + trailingSpaces to guarantee correct spacing
      return `${leadingSpaces}${tspanContent}${trailingSpaces}`;
    })
    .join('');

  return tspans;
}

// Watermark config - oversized for subtle cropped background presence
export const WATERMARK = {
  opacity: 0.06,
  size: 900, // oversized to extend beyond canvas edges for dramatic crop effect
  position: { top: -150, left: 150 } // position to get cropped aesthetically
};

/**
 * Escape text for SVG
 */
export function escapeForSvg(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Truncate text to fit within a certain length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Hex to RGB conversion
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return { r, g, b };
}

/**
 * Get contrasting text color (black or white) based on background
 */
export function getContrastingColor(backgroundColor: string): string {
  const rgb = hexToRgb(backgroundColor);
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#FFFFFF';
}

/**
 * Wrap plain text into multiple lines based on approximate character width.
 * - maxWidth: width in pixels available for text
 * - fontSize: font size in pixels
 * - maxLines: maximum number of lines to return (ellipsis added to the last line if overflowing)
 */
export function wrapTextToLines(text: string, maxWidth: number, fontSize: number, maxLines = 5): string[] {
  const clean = String(text || '').trim();
  if (!clean) return [];
  // Approximate characters per line using typical sans-serif width
  const approxCharWidth = fontSize * 0.6;
  const maxChars = Math.max(4, Math.floor(maxWidth / approxCharWidth));
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      current = w;
      continue;
    }
    if ((current.length + 1 + w.length) <= maxChars) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
      if (lines.length === maxLines) {
        // Already reached max lines; truncate immediately
        break;
      }
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  // If there is overflow (i.e. there were more words), add ellipsis to the last line
  // Heuristic: if the original text is longer than joined lines, mark overflow
  const joined = lines.join(' ');
  if (clean.length > joined.length) {
    const last = lines[lines.length - 1] || '';
    if (last.length >= maxChars - 1) {
      lines[lines.length - 1] = last.slice(0, Math.max(0, maxChars - 3)) + '...';
    } else {
      lines[lines.length - 1] = (last + '...').trim();
    }
  }

  return lines;
}

// Simple in-memory asset cache with TTL
const assetCache = new Map<string, { buffer: Buffer; expires: number }>();

/**
 * Fetch a remote image as Buffer (PNG/JPEG/SVG) with timeout.
 * Returns null if fetch fails or times out.
 */
export async function fetchImageAsBuffer(url: string, timeoutMs = 5000): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/**
 * Fetch with cache/TTL wrapper
 */
export async function fetchWithCache(url: string, ttlMs = 3600_000): Promise<Buffer | null> {
  const now = Date.now();
  const cached = assetCache.get(url);
  if (cached && cached.expires > now) return cached.buffer;

  const buf = await fetchImageAsBuffer(url);
  if (buf) {
    assetCache.set(url, { buffer: buf, expires: now + ttlMs });
  }
  return buf;
}

/**
 * Load a file from /public
 */
export async function loadPublicImageBuffer(relativePath: string): Promise<Buffer | null> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const full = path.default.join(process.cwd(), 'public', relativePath.replace(/^[/\\]+/, ''));
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

/**
 * Load brand-specific symbol for partner containers; keep PortalPay symbol on platform.
 * - Partner: try brand.logos.symbol, then brand.logos.app - supports both full URLs and local paths
 * - Platform: load /public/ppsymbol.png, then remote https://pay.ledger1.ai/ppsymbol.png.
 * Resizes to requested size with transparent background.
 */
export async function loadPPSymbol(size = 60): Promise<Buffer | null> {
  let src: Buffer | null = null;

  try {
    const brand = getBrandConfig();
    const isPlatformBrand = String((brand as any)?.key || '').toLowerCase() === 'portalpay' || String((brand as any)?.key || '').toLowerCase() === 'basaltsurge';
    const isPartner = isPartnerContext() || !isPlatformBrand;

    if (isPartner) {
      // Prefer brand-specific compact symbol (or app logo) in partner containers
      const logoPath = String(brand?.logos?.symbol || brand?.logos?.app || '');
      console.log('[loadPPSymbol] Partner context - logoPath:', logoPath, 'brand:', {
        key: brand?.key,
        name: brand?.name,
        hasSymbol: !!brand?.logos?.symbol,
        hasApp: !!brand?.logos?.app,
        appUrl: brand?.appUrl
      });

      if (logoPath) {
        // Check if it's a full URL (starts with http:// or https://)
        if (/^https?:\/\//i.test(logoPath)) {
          // Direct URL - fetch it
          console.log('[loadPPSymbol] Fetching from URL:', logoPath);
          src = await fetchWithCache(logoPath);
          if (src) {
            console.log('[loadPPSymbol] Successfully fetched from URL, size:', src.length);
          } else {
            console.log('[loadPPSymbol] Failed to fetch from URL');
          }
        } else {
          // Local path - try loading from public directory
          const rel = logoPath.replace(/^[/\\]+/, '');
          console.log('[loadPPSymbol] Trying local path:', rel);
          src = await loadPublicImageBuffer(rel);
          if (src) {
            console.log('[loadPPSymbol] Successfully loaded from local, size:', src.length);
          } else {
            console.log('[loadPPSymbol] Local not found, trying remote fallback');
            // Fallback to remote brand asset if local not present and brand.appUrl known
            if (brand?.appUrl) {
              const base = String(brand.appUrl).replace(/\/+$/, '');
              const url = `${base}/${rel}`;
              console.log('[loadPPSymbol] Fetching from brand appUrl:', url);
              src = await fetchWithCache(url);
              if (src) {
                console.log('[loadPPSymbol] Successfully fetched from appUrl, size:', src.length);
              } else {
                console.log('[loadPPSymbol] Failed to fetch from appUrl');
              }
            }
          }
        }
      }
    }

    if (!src) {
      // Platform default symbol (local preferred, remote fallback)
      console.log('[loadPPSymbol] Using platform default symbol (Surge.png)');
      const isBasalt = true; // Always default to Basalt
      const local = await loadPublicImageBuffer('Surge.png');
      src = local || await fetchWithCache('https://surge.basalthq.com/bssymbol.png');
    }

    if (!src) {
      console.log('[loadPPSymbol] No symbol loaded - returning null');
      return null;
    }

    const sharpMod = await import('sharp');
    return await sharpMod.default(src)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch (error) {
    console.error('[loadPPSymbol] Error:', error);
    return null;
  }
}

/**
 * Convert an emoji character(s) into a Twemoji PNG buffer using the public CDN.
 * This renders full-color emoji reliably in Sharp by rasterizing Twemoji SVGs.
 * Falls back to variant without FE0F if needed. Returns null on failure.
 */
export async function loadTwemojiPng(emoji: string, size = 96): Promise<Buffer | null> {
  // Convert emoji string into hyphen-separated lowercase hex codepoints
  const toCodepoints = (str: string): string => {
    const out: string[] = [];
    for (let i = 0; i < str.length;) {
      const cp = str.codePointAt(i)!;
      out.push(cp.toString(16));
      i += cp > 0xffff ? 2 : 1;
    }
    return out.join('-');
  };
  const removeFe0f = (cp: string) => cp.split('-').filter((p) => p !== 'fe0f').join('-');

  const rawCp = toCodepoints(emoji);
  const cacheKey = `twemoji:${rawCp}:${size}`;
  const now = Date.now();
  const cached = assetCache.get(cacheKey);
  if (cached && cached.expires > now) return cached.buffer;

  const candidates: string[] = [];
  const cpVariants = Array.from(new Set([rawCp, removeFe0f(rawCp)]));
  for (const cp of cpVariants) {
    // Try multiple CDNs for robustness - jsdelivr is reliable for this
    candidates.push(`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg`);
    candidates.push(`https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${cp}.svg`);
    candidates.push(`https://unpkg.com/twemoji@14.0.2/assets/svg/${cp}.svg`);
  }

  for (const url of candidates) {
    try {
      const svgBuf = await fetchImageAsBuffer(url);
      if (!svgBuf) continue;

      const sharp = (await import('sharp')).default;
      const png = await sharp(svgBuf)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      assetCache.set(cacheKey, { buffer: png, expires: now + 86_400_000 }); // 24h
      return png;
    } catch (e) {
      // try next candidate
      // console.error(`Failed to load twemoji from ${url}`, e);
    }
  }
  return null;
}
