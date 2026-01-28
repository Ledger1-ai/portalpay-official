import { ImageResponse } from 'next/og';
import { getInternalBaseUrl } from '@/lib/base-url';

export const runtime = 'nodejs';
export const alt = 'Crypto Payments for Every Industry';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/jpeg';

export default async function Image() {
  const baseUrl = getInternalBaseUrl();

  try {
    // Fetch the generated OG image from the browse-level API route
    const ogImageRes = await fetch(`${baseUrl}/api/og-image/crypto-payments`, {
      cache: 'no-store',
    });

    if (ogImageRes.ok) {
      const imageBuffer = await ogImageRes.arrayBuffer();
      return new Response(imageBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }
  } catch (error) {
    console.error('OG image fetch error (crypto-payments browse):', error);
  }

  // Fallback: return a simple error response
  return new Response(null, {
    status: 404,
    statusText: 'OG Image Not Found',
  });
}
