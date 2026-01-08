
import { join } from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { getBrandConfig } from '@/config/brands';
import { isPartnerContext } from '@/lib/env';

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
        const full = join(process.cwd(), 'public', relativePath.replace(/^[/\\]+/, ''));
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
            // Console logs removed for cleaner prod output, generally kept in dev if debugging

            if (logoPath) {
                // Check if it's a full URL (starts with http:// or https://)
                if (/^https?:\/\//i.test(logoPath)) {
                    // Direct URL - fetch it
                    src = await fetchWithCache(logoPath);
                } else {
                    // Local path - try loading from public directory
                    const rel = logoPath.replace(/^[/\\]+/, '');
                    src = await loadPublicImageBuffer(rel);
                    if (!src) {
                        // Fallback to remote brand asset if local not present and brand.appUrl known
                        if (brand?.appUrl) {
                            const base = String(brand.appUrl).replace(/\/+$/, '');
                            const url = `${base}/${rel}`;
                            src = await fetchWithCache(url);
                        }
                    }
                }
            }
        }

        if (!src) {
            // Platform default symbol (local preferred, remote fallback)
            const local = await loadPublicImageBuffer('Surge.png');
            src = local || await fetchWithCache('https://surge.basalthq.com/bssymbol.png');
        }

        if (!src) {
            return null;
        }

        return await sharp(src)
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

            const png = await sharp(svgBuf)
                .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();

            assetCache.set(cacheKey, { buffer: png, expires: now + 86_400_000 }); // 24h
            return png;
        } catch (e) {
            // try next candidate
        }
    }
    return null;
}

/**
 * Load default assets for Basalt OG template
 */
export async function loadBasaltDefaults(): Promise<{
    bgBase64: string;
    blurredBgBase64: string;
    medallionBase64: string;
    logoBase64: string;
    shieldBase64: string;
}> {
    const [bg, blurred, medallion, logo, shield] = await Promise.all([
        loadPublicImageBuffer('bsurgebg.png'),
        loadPublicImageBuffer('bsurgebg-blurred.png'),
        loadPublicImageBuffer('BasaltSurgeM.png'),
        loadPublicImageBuffer('BasaltSurgeWide.png'),
        loadPublicImageBuffer('Shield.png')
    ]);

    const toBase64 = (buf: Buffer | null) => buf ? `data:image/png;base64,${buf.toString('base64')}` : '';

    return {
        bgBase64: toBase64(bg),
        blurredBgBase64: toBase64(blurred),
        medallionBase64: toBase64(medallion),
        logoBase64: toBase64(logo),
        shieldBase64: toBase64(shield),
    };
}
