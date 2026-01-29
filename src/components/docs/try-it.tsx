'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useBrand } from '@/contexts/BrandContext';

type QueryParam = {
  name: string;
  type?: 'string' | 'number' | 'boolean';
  required?: boolean;
  placeholder?: string;
  default?: string | number | boolean;
};

export type TryItConfig = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // e.g. /api/inventory or /healthz
  baseUrl?: string; // optional explicit base URL (defaults to APIM custom domain)
  title?: string;
  description?: string;
  query?: QueryParam[];
  headerName?: string; // default: 'Ocp-Apim-Subscription-Key'
  sampleBody?: any; // JSON template for body
  contentType?: 'application/json' | 'application/x-www-form-urlencoded';
};

function toStringValue(v: any) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === undefined || v === null) return '';
  return String(v);
}

function parseValue(v: string, type?: QueryParam['type']) {
  if (type === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'boolean') {
    const t = v.trim().toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;
    return undefined;
  }
  return v;
}

export function TryIt({ config }: { config: TryItConfig }) {
  const brand = useBrand();
  const brandKey = brand.key || 'basaltsurge';

  const {
    method,
    path,
    title,
    description,
    query = [],
    headerName = 'Ocp-Apim-Subscription-Key',
    sampleBody,
    contentType = 'application/json',
    baseUrl: configBaseUrl,
  } = config;

  // Compute dynamic base URL from browser origin
  const [browserOrigin, setBrowserOrigin] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBrowserOrigin(window.location.origin);
    }
  }, []);

  // Use browser origin as the base URL, applying brand key replacement to any config baseUrl
  const effectiveBaseUrl = useMemo(() => {
    const origin = browserOrigin || process.env.NEXT_PUBLIC_APP_URL || '';
    if (configBaseUrl) {
      // Replace any hardcoded portalpay references with the current origin/brand
      return configBaseUrl
        .replace(/https?:\/\/api\.pay\.ledger1\.ai\/portalpay/gi, `${origin}/${brandKey}`)
        .replace(/https?:\/\/pay\.ledger1\.ai/gi, origin)
        .replace(/\/portalpay(?=\/|$)/gi, `/${brandKey}`);
    }
    return origin;
  }, [configBaseUrl, browserOrigin, brandKey]);

  const [baseUrl, setBaseUrl] = useState(effectiveBaseUrl);

  // Sync baseUrl when effectiveBaseUrl changes (e.g., after browser origin is detected)
  useEffect(() => {
    if (effectiveBaseUrl && effectiveBaseUrl !== baseUrl) {
      setBaseUrl(effectiveBaseUrl);
    }
  }, [effectiveBaseUrl]);

  const [useProxy, setUseProxy] = useState(
    process.env.NEXT_PUBLIC_TRYIT_USE_PROXY === 'false' ? false : true
  );
  const [apiKey, setApiKey] = useState('');
  const [wallet, setWallet] = useState('');
  const [includeTrace, setIncludeTrace] = useState(false);
  const [queryState, setQueryState] = useState<Record<string, string>>(
    Object.fromEntries(query.map(q => [q.name, toStringValue(q.default ?? '')])),
  );
  const [bodyText, setBodyText] = useState(
    sampleBody ? JSON.stringify(sampleBody, null, 2) : ''
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [respHeaders, setRespHeaders] = useState<Record<string, string>>({});
  const [respBody, setRespBody] = useState<string>('');
  const [error, setError] = useState<string>('');

  const urlWithParams = useMemo(() => {
    try {
      const pathForUrl = (() => {
        try {
          const u = new URL(baseUrl);
          const host = u.hostname.toLowerCase();
          const pathname = u.pathname;
          // Always route developer API calls through /{brandKey} for /api/* and /healthz
          if (path.startsWith('/api/') || path === '/healthz') {
            return '/' + brandKey + path;
          }
        } catch { }
        return path;
      })();
      const url = new URL(pathForUrl, baseUrl);
      for (const q of query) {
        const raw = queryState[q.name];
        if (raw === undefined || raw === '') continue;
        url.searchParams.set(q.name, toStringValue(raw));
      }
      return url.toString();
    } catch {
      return `${baseUrl}${path}`;
    }
  }, [baseUrl, path, query, queryState]);

  async function handleSend() {
    setLoading(true);
    setError('');
    setStatus(null);
    setRespHeaders({});
    setRespBody('');

    try {
      let res: Response;

      if (useProxy) {
        // Use server-side proxy to avoid CORS and ensure AFD origin enforcement
        // Compute APIM route when targeting AFD → APIM (prefix /portalpay for /api/* paths)
        let effectivePath = path;
        try {
          const u = new URL(baseUrl);
          const host = u.hostname.toLowerCase();
          const pathname = u.pathname;
          // Always route developer API calls through /{brandKey} for /api/* and /healthz
          if (path.startsWith('/api/') || path === '/healthz') {
            effectivePath = '/' + brandKey + path;
          }
        } catch { }
        const headersObj: Record<string, string> = apiKey ? { [headerName]: apiKey } : {};
        if (includeTrace) {
          headersObj['Ocp-Apim-Trace'] = 'true';
        }
        if (wallet) {
          headersObj['x-wallet'] = wallet.toLowerCase();
        }
        const proxyPayload: any = {
          method,
          path: effectivePath,
          baseUrl,
          query: Object.fromEntries(
            Object.entries(queryState).filter(([_, v]) => v !== undefined && v !== '')
          ),
          headers: headersObj,
        };

        // Add body for methods that support it
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && bodyText.trim().length) {
          if (contentType === 'application/json') {
            try {
              proxyPayload.body = JSON.parse(bodyText);
            } catch (e: any) {
              throw new Error('Body is not valid JSON');
            }
          } else {
            proxyPayload.body = bodyText;
          }
        }

        res = await fetch('/api/tryit-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(proxyPayload),
        });
      } else {
        // Direct fetch to baseUrl (original behavior)
        const headers: Record<string, string> = {};
        if (apiKey) headers[headerName] = apiKey;
        if (includeTrace) headers['Ocp-Apim-Trace'] = 'true';
        if (wallet) headers['x-wallet'] = wallet.toLowerCase();
        let body: BodyInit | undefined;

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          if (contentType === 'application/json') {
            headers['Content-Type'] = 'application/json';
            if (bodyText.trim().length) {
              try {
                const parsed = JSON.parse(bodyText);
                body = JSON.stringify(parsed);
              } catch (e: any) {
                throw new Error('Body is not valid JSON');
              }
            } else {
              body = undefined;
            }
          } else {
            headers['Content-Type'] = contentType;
            body = bodyText;
          }
        }

        res = await fetch(urlWithParams, {
          method,
          headers,
          body,
        });
      }

      setStatus(res.status);

      const h: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        h[key] = value;
      });
      setRespHeaders(h);

      const contentTypeResp = res.headers.get('content-type') || '';
      let text = await res.text();
      if (contentTypeResp.includes('application/json')) {
        try {
          const obj = JSON.parse(text);
          text = JSON.stringify(obj, null, 2);
        } catch {
          // leave as-is
        }
      }
      setRespBody(text);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const curlSnippet = useMemo(() => {
    const parts = ['curl', '-X', method, `"${urlWithParams}"`];
    if (apiKey) {
      parts.push('-H', `"${headerName}: ${apiKey}"`);
    }
    if (includeTrace) {
      parts.push('-H', `"Ocp-Apim-Trace: true"`);
    }
    if (wallet) {
      parts.push('-H', `"x-wallet: ${wallet.toLowerCase()}"`);
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && bodyText.trim().length) {
      parts.push('-H', `"Content-Type: ${contentType}"`);
      if (contentType === 'application/json') {
        parts.push('-d', `'${bodyText.replace(/'/g, "'\\''")}'`);
      } else {
        parts.push('-d', `'${bodyText.replace(/'/g, "'\\''")}'`);
      }
    }
    return parts.join(' ');
  }, [method, urlWithParams, apiKey, headerName, bodyText, contentType, includeTrace, wallet]);

  return (
    <div className="my-6 rounded-lg border border-border border-l-4 border-[var(--primary)] shadow-sm ring-1 ring-[var(--primary)]/20 relative max-w-full">
      <div className="absolute inset-x-0 top-0 h-1 bg-[var(--primary)]/40" />
      <div className="p-4 md:p-5 max-w-full">
        <div className="flex items-start justify-between gap-3 max-w-full">
          <div className="min-w-0 flex-1 max-w-full">
            <div className="flex flex-wrap items-center gap-2 mb-1 max-w-full">
              <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium flex-shrink-0">
                {method}
              </span>
              <code className="text-sm break-all min-w-0 max-w-full inline-block">{path}</code>
            </div>
            {title && <h3 className="text-lg font-semibold break-words overflow-wrap-anywhere max-w-full">{title}</h3>}
            {description && <p className="text-sm text-muted-foreground mt-1 break-words overflow-wrap-anywhere max-w-full">{description}</p>}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="use-proxy"
              checked={useProxy}
              onChange={(e) => setUseProxy(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="use-proxy" className="text-sm text-muted-foreground cursor-pointer flex-1 min-w-0 overflow-wrap-anywhere leading-snug">
              Use server-side proxy (recommended for local/container to avoid CORS)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include-trace"
              checked={includeTrace}
              onChange={(e) => setIncludeTrace(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="include-trace" className="text-sm text-muted-foreground cursor-pointer flex-1 min-w-0 overflow-wrap-anywhere leading-snug">
              Include Ocp-Apim-Trace header (APIM diagnostics)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="min-w-0">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder={process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.example.com'}
              />
              <p className="mt-1 text-xs text-muted-foreground overflow-wrap-anywhere">
                Default is APP_URL. For AFD, enter only the AFD endpoint host (e.g., https://afd-endpoint-...) without any path; the /{brandKey} prefix is added automatically for /api/* and /healthz.
              </p>
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-medium text-muted-foreground mb-1 break-words overflow-wrap-anywhere">
                {headerName} (not stored)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Enter your subscription key"
              />
              <p className="mt-1 text-xs text-muted-foreground overflow-wrap-anywhere">
                The key is kept only in memory while this page is open. Do not paste secrets on shared machines.
              </p>

              <div className="mt-3 min-w-0">
                <label className="block text-xs font-medium text-muted-foreground mb-1 break-words overflow-wrap-anywhere">
                  x-wallet (optional merchant wallet for public GET inventory/shop)
                </label>
                <input
                  type="text"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="0x..... (40 hex chars)"
                />
                <p className="mt-1 text-xs text-muted-foreground overflow-wrap-anywhere">
                  For public reads (GET /api/inventory, GET /api/shop/config), include the merchant wallet (0x-prefixed 40-hex). Non-GET requests should use JWT and will ignore this header.
                </p>
              </div>
            </div>
          </div>
        </div>

        {query.length > 0 && (
          <div className="mt-4 max-w-full">
            <div className="text-sm font-medium mb-2 break-words">Query Parameters</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0 max-w-full">
              {query.map((q) => (
                <div key={q.name}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {q.name} {q.required ? <span className="text-red-500">*</span> : null}
                  </label>
                  <input
                    type="text"
                    value={queryState[q.name] ?? ''}
                    onChange={(e) =>
                      setQueryState((prev) => ({ ...prev, [q.name]: e.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder={q.placeholder || ''}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && (
          <div className="mt-4 max-w-full">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Request Body</div>
              <div className="text-xs text-muted-foreground">{contentType}</div>
            </div>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="mt-2 w-full h-40 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
              placeholder={contentType === 'application/json' ? '{ }' : ''}
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <button
            onClick={handleSend}
            disabled={loading}
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex-shrink-0"
          >
            {loading ? 'Sending…' : 'Send Request'}
          </button>
          <span className="text-xs text-muted-foreground min-w-0 leading-snug overflow-wrap-anywhere" style={{ flex: '1 1 0' }}>
            {useProxy
              ? 'Using server-side proxy to avoid CORS. Requests go through /api/tryit-proxy to AFD/APIM.'
              : 'Direct requests to AFD. May be blocked by CORS from local/container. Enable proxy if needed.'}
          </span>
        </div>

        <div className="mt-4 min-w-0 max-w-full">
          <div className="text-sm font-medium mb-2 break-words">cURL</div>
          <div className="rounded-md border border-border bg-muted p-2 overflow-x-auto">
            <pre className="text-xs whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0">
              <code className="break-words overflow-wrap-anywhere">{curlSnippet}</code>
            </pre>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 break-words overflow-wrap-anywhere whitespace-pre-wrap max-w-full">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0 max-w-full">
          <div className="min-w-0 max-w-full">
            <div className="text-sm font-medium mb-2">Response Status</div>
            <div className="rounded-md border border-border bg-muted p-2 text-sm">
              {status === null ? '—' : status}
            </div>
          </div>
          <div className="min-w-0 max-w-full">
            <div className="text-sm font-medium mb-2 break-words">Response Headers</div>
            <div className="rounded-md border border-border bg-muted p-2 text-xs overflow-x-auto max-h-40 overflow-y-auto">
              <pre className="whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0">
                {Object.keys(respHeaders).length > 0
                  ? Object.entries(respHeaders)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n')
                  : '—'}
              </pre>
            </div>
          </div>
        </div>

        <div className="mt-4 min-w-0 max-w-full">
          <div className="text-sm font-medium mb-2 break-words">Response Body</div>
          <div className="rounded-md border border-border bg-muted p-2 overflow-x-auto max-h-80 overflow-y-auto">
            <pre className="text-xs whitespace-pre-wrap break-words overflow-wrap-anywhere min-w-0">
              <code className="break-words">{respBody || '—'}</code>
            </pre>
          </div>
        </div>

        {status === 200 && !respBody && (
          <div className="mt-4 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 break-words overflow-wrap-anywhere max-w-full">
            200 OK but no response body. This may indicate an empty result set (e.g., no inventory items for this wallet). Try creating data first with the POST endpoint, or check that you're using the correct Base URL and subscription key.
          </div>
        )}

        {status === 401 && (
          <div className="mt-4 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-700 break-words overflow-wrap-anywhere max-w-full">
            {useProxy ? (
              <>
                401 Unauthorized from APIM. Ensure you provide a valid subscription key in the "{headerName}" header.
                Local requests do not carry APIM gateway headers (x-subscription-id, x-resolved-wallet); the server-side proxy forwards your key to AFD/APIM.
              </>
            ) : (
              <>
                401 Unauthorized or CORS/origin blocked. Direct calls from localhost may be blocked by AFD/APIM origin policies.
                Enable "Use server-side proxy" and include your subscription key in the "{headerName}" header.
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TryIt;
