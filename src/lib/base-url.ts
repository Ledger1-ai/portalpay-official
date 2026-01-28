/**
 * Get the internal base URL for server-to-server calls during SSR.
 * This avoids external round-trips that can cause deadlocks during startup.
 * Uses INTERNAL_BASE_URL env (set in Dockerfile) to call localhost directly.
 */
export function getInternalBaseUrl(): string {
  // Prefer explicit internal URL (avoids external load balancer round-trip)
  const internal = process.env.INTERNAL_BASE_URL;
  if (internal) {
    return internal.replace(/\/$/, '');
  }

  // In production without INTERNAL_BASE_URL, use localhost:3000
  // Note: Server binds to 0.0.0.0:3000 but localhost/127.0.0.1 should work for internal calls
  if (process.env.NODE_ENV === 'production') {
    return 'http://localhost:3000';
  }

  // Development: use localhost with configured port
  return 'http://localhost:3001';
}

/**
 * Get the base URL for the application, respecting production environment
 * Returns the production URL if NODE_ENV is production, otherwise localhost
 * ALWAYS returns HTTPS in production for OG image compatibility
 * Falls back to request headers when NEXT_PUBLIC_APP_URL is not set in partner containers
 * 
 * NOTE: For server-side fetches to your own APIs during SSR, use getInternalBaseUrl()
 * to avoid deadlocks during container startup.
 * 
 * NOTE: This function returns localhost in development. For production metadata generation,
 * callers should use getProductionBaseUrl() or sanitize the result with isLocalhostUrl().
 */
export function getBaseUrl(): string {
  // In production, always use the production URL with HTTPS
  if (process.env.NODE_ENV === 'production') {
    let url = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

    // If no explicit URL configured, derive from request headers (partner container fallback)
    if (!url) {
      try {
        const { headers } = require('next/headers');
        const headersList = headers();
        const host = headersList.get('x-forwarded-host') || headersList.get('host');
        if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
          url = `https://${host}`;
        }
      } catch {
        // headers() may fail in some contexts (e.g., static generation); fall back to platform default
      }
    }

    // Final fallback: if headers and env are unavailable, avoid leaking platform defaults
    // Use a placeholder domain that indicates misconfiguration but won't leak localhost
    if (!url || isLocalhostUrl(url)) {
      // This signals an env configuration issue but won't cause broken localhost URLs
      url = 'https://surge.basalthq.com';
    }

    // Force HTTPS if somehow HTTP was provided
    return url.replace(/^http:\/\//, 'https://');
  }
  // In development, use localhost
  return 'http://localhost:3001';
}

/**
 * Get the production base URL asynchronously with proper header access.
 * This should be used in async contexts like generateMetadata() where headers() is available.
 * Returns a properly resolved production URL, never localhost in production.
 */
export async function getProductionBaseUrl(): Promise<string> {
  // First try environment variables
  let url = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;

  // If no env URL or it's localhost, try headers
  if (!url || isLocalhostUrl(url)) {
    try {
      const { headers } = await import('next/headers');
      const headersList = await headers();
      const host = headersList.get('x-forwarded-host') || headersList.get('host');
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        url = `https://${host}`;
      }
    } catch {
      // headers() may fail; continue with fallback
    }
  }

  // Final fallback for production - use a default domain that indicates misconfiguration
  if (!url || isLocalhostUrl(url)) {
    url = 'https://surge.basalthq.com';
  }

  // Force HTTPS
  return url.replace(/^http:\/\//, 'https://');
}

/**
 * Check if a URL is a localhost URL that should not be used in production metadata.
 * Returns true for localhost, 127.0.0.1, and any URL that looks like a development URL.
 */
export function isLocalhostUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(lower);
}

/**
 * Sanitize a URL for use in OG metadata - never return localhost in production.
 * If the URL is localhost and we're in production, return undefined to force
 * the caller to use an alternative source.
 */
export function sanitizeMetadataUrl(url: string | undefined, fallbackAppUrl?: string): string | undefined {
  if (!url) return fallbackAppUrl;

  // In production, never return localhost URLs for metadata
  if (process.env.NODE_ENV === 'production' && isLocalhostUrl(url)) {
    // Try to use the fallback app URL if provided
    if (fallbackAppUrl && !isLocalhostUrl(fallbackAppUrl)) {
      return fallbackAppUrl.replace(/^http:\/\//, 'https://');
    }
    // Return undefined to signal that the URL is invalid
    return undefined;
  }

  return url;
}
