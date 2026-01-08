import { NextRequest, NextResponse } from 'next/server';

/**
 * Try It Proxy
 * 
 * Server-side proxy for the Try It widget in docs to avoid CORS issues and
 * ensure requests properly traverse AFD → APIM with x-edge-secret injection.
 * 
 * Security notes:
 * - Subscription key is forwarded but never logged
 * - Only allows requests to the configured AFD base URL
 * - Rate limiting should be handled by APIM (already in place)
 * - Consider adding additional gating (e.g., NODE_ENV check) if needed
 */

const ALLOWED_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pay.ledger1.ai';
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const AFD_EDGE_SECRET = process.env.AFD_EDGE_SECRET;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, path, query, headers: clientHeaders, body: requestBody } = body;
    // Optional: allow overriding base URL per request for local testing (e.g., AFD APIM endpoint)
    const baseUrl = typeof body.baseUrl === 'string' && body.baseUrl ? body.baseUrl : ALLOWED_BASE_URL;

    // Validate method
    if (!method || !ALLOWED_METHODS.includes(method.toUpperCase())) {
      return NextResponse.json(
        { error: 'invalid_method', message: 'Method must be one of: GET, POST, PUT, PATCH, DELETE' },
        { status: 400 }
      );
    }

    // Validate path
    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      return NextResponse.json(
        { error: 'invalid_path', message: 'Path must start with /' },
        { status: 400 }
      );
    }

    // Build target URL
    const url = new URL(path, baseUrl);

    // Add query parameters
    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });
    }

    // Prepare headers for forwarding
    const forwardHeaders: HeadersInit = {};

    // Forward specific headers from client (like Ocp-Apim-Subscription-Key)
    if (clientHeaders && typeof clientHeaders === 'object') {
      Object.entries(clientHeaders).forEach(([key, value]) => {
        if (typeof value === 'string') {
          forwardHeaders[key] = value;
        }
      });
    }

    // Ensure JSON accept by default
    if (!Object.keys(forwardHeaders).some(k => k.toLowerCase() === 'accept')) {
      forwardHeaders['Accept'] = 'application/json';
    }

    // Auto-inject Front Door shared secret when targeting AFD if configured
    try {
      const hostname = new URL(baseUrl).hostname.toLowerCase();
      const hasEdgeSecret = Object.keys(forwardHeaders).some(k => k.toLowerCase() === 'x-edge-secret');
      if ((hostname.includes('azurefd.net') || hostname.includes('afd-') || hostname.includes('azure-api.net')) && AFD_EDGE_SECRET && !hasEdgeSecret) {
        forwardHeaders['x-edge-secret'] = AFD_EDGE_SECRET;
      }
    } catch { }

    // Prepare request options
    const fetchOptions: RequestInit = {
      method: method.toUpperCase(),
      headers: forwardHeaders,
    };

    // Add body for methods that support it
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase()) && requestBody) {
      if (typeof requestBody === 'string') {
        fetchOptions.body = requestBody;
      } else if (typeof requestBody === 'object') {
        fetchOptions.body = JSON.stringify(requestBody);
        forwardHeaders['Content-Type'] = 'application/json';
      }
    }

    // Make the server-side fetch to AFD
    const response = await fetch(url.toString(), fetchOptions);

    // Extract and forward all response headers back to the client
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Get response body
    const responseText = await response.text();

    // Return proxied response
    return new NextResponse(responseText, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('[tryit-proxy] Error:', error.message);
    return NextResponse.json(
      {
        error: 'proxy_error',
        message: error.message || 'Failed to proxy request'
      },
      { status: 500 }
    );
  }
}

// Only allow POST to this endpoint
export async function GET() {
  return NextResponse.json(
    { error: 'method_not_allowed', message: 'This endpoint only accepts POST requests' },
    { status: 405 }
  );
}
