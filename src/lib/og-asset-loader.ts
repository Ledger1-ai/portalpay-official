
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
 * Load assets for dynamic Brand OG template
 */
/**
 * Load assets for dynamic Brand OG template
 */
export async function loadBrandOGAssets(explicitBrandConfig?: any): Promise<{
    bgBase64: string;
    blurredBgBase64: string;
    medallionBase64: string;
    logoBase64: string;
    shieldBase64: string;
    brand: any;
}> {
    const brand = explicitBrandConfig || getBrandConfig();
    const isPlatform = String(brand?.key || '').toLowerCase() === 'basaltsurge' || String(brand?.key || '').toLowerCase() === 'portalpay';

    // 1. Backgrounds: Use Brand-specific if available (future), otherwise default BasaltBG
    // We can stick to BasaltBG for now as it's high quality, or use a neutral one.
    const [bg, blurred] = await Promise.all([
        loadPublicImageBuffer('bsurgebg.png'),
        loadPublicImageBuffer('bsurgebg-blurred.png')
    ]);

    // 2. Medallion (Center Image)
    // For platform: BasaltSurgeM.png
    // For partner: Try brand.logos.symbol -> brand.logos.app -> fallback to blank or platform
    let medallion: Buffer | null = null;
    if (isPlatform) {
        medallion = await loadPublicImageBuffer('BasaltSurgeM.png');
    } else {
        // Try to load partner symbol using our robust loader
        // Use 450px to ensure it fits within the 700px circle (and 4px border) without clipping corners of a square logo
        // Pass the explicit brand context to loadPPSymbol helper if needed? 
        // Actually loadPPSymbol calls getBrandConfig() internally. We should probably refactor it or just duplicate logic here roughly.
        // Let's rely on the brand properties we have in `brand` object.

        let logoPath = String(brand?.logos?.symbol || brand?.logos?.app || '');
        if (logoPath) {
            if (/^https?:\/\//i.test(logoPath)) {
                medallion = await fetchWithCache(logoPath);
            } else {
                const rel = logoPath.replace(/^[/\\]+/, '');
                medallion = await loadPublicImageBuffer(rel);
                if (!medallion && brand?.appUrl) {
                    const base = String(brand.appUrl).replace(/\/+$/, '');
                    medallion = await fetchWithCache(`${base}/${rel}`);
                }
            }
        }

        // If still null, try using loadPPSymbol logic but we can't easily injection into loadPPSymbol without changing its signature too.
        // For now, if we provided explicit config, assume it has the paths we need.
        if (!medallion) {
            // Fallback to platform symbol only if we really can't find anything
            // But for partner we usually want their logo or nothing/initials? 
            // Existing logic fell back to platform.
            // Let's try to stick to existing logic:
            // loadPPSymbol tried to load "brand specific" or "Surge.png".
            // If we are a partner, we want partner symbol.
        }
    }

    // If medallion is still null and we are platform, ensure we load platform default
    if (!medallion && isPlatform) {
        medallion = await loadPublicImageBuffer('BasaltSurgeM.png');
    }

    // 3. Logo (Bottom/Footer Logo or "Powered By")
    // For platform: BasaltSurgeWide.png
    // For partner: Try brand.logos.footer -> brand.logos.app
    let logo: Buffer | null = null;
    if (isPlatform) {
        logo = await loadPublicImageBuffer('BasaltSurgeWide.png');
    } else {
        const logoPath = brand.logos.footer || brand.logos.app;
        if (logoPath) {
            if (/^https?:\/\//i.test(logoPath)) {
                logo = await fetchWithCache(logoPath);
            } else {
                const rel = logoPath.replace(/^[/\\]+/, '');
                logo = await loadPublicImageBuffer(rel);
                if (!logo && brand.appUrl) {
                    logo = await fetchWithCache(`${brand.appUrl.replace(/\/+$/, '')}/${rel}`);
                }
            }
        }
    }

    // 4. Shield (Corner) - Only for Basalt/Platform
    let shield: Buffer | null = null;
    if (isPlatform) {
        shield = await loadPublicImageBuffer('Shield.png');
    }

    const toBase64 = (buf: Buffer | null) => buf && buf.length > 0 ? `data:image/png;base64,${buf.toString('base64')}` : '';
    const resize = async (buf: Buffer | null, w: number, h?: number, fit: 'contain' | 'cover' = 'contain') => {
        if (!buf) return null;
        try {
            return await sharp(buf)
                .resize(w, h, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png()
                .toBuffer();
        } catch (e) {
            console.error('Resize error', e);
            return null;
        }
    };

    const bgResized = await resize(bg, 1200);
    const blurredResized = await resize(blurred, 1200);
    const medallionResized = await resize(medallion, 600, 600, 'contain');
    const logoResized = await resize(logo, 600, 150, 'contain');
    const shieldResized = await resize(shield, 200);

    return {
        bgBase64: toBase64(bgResized),
        blurredBgBase64: toBase64(blurredResized),
        medallionBase64: toBase64(medallionResized),
        logoBase64: toBase64(logoResized),
        shieldBase64: toBase64(shieldResized),
        brand
    };
}

/**
 * Load default assets for Basalt OG template
 * @deprecated Use loadBrandOGAssets instead
 */
export async function loadBasaltDefaults(explicitBrandConfig?: any) {
    return loadBrandOGAssets(explicitBrandConfig);
}
