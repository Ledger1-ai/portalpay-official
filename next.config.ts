// @ts-nocheck
// Types are noisy in Next config across versions; disable TS checks for this file.

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig = {
  // Externalize problematic deep deps so Turbopack doesn't crawl their tests
  serverExternalPackages: ['pino', '@walletconnect/logger', 'thread-stream'],

  // Suppress source map warnings in development (Turbopack)
  experimental: {
    /* 
       turbo key removed as it is invalid in this next version.
       See: https://nextjs.org/docs/messages/invalid-next-config
    */
  },

  // Ignore TypeScript errors during production builds (e.g., in Docker)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Emit a minimal standalone server for Docker runtime stage
  output: "standalone",
  images: {
    // Allow loading product and profile images from Azure Blob or Front Door
    remotePatterns: (() => {
      const blobHost = process.env.NEXT_PUBLIC_BLOB_HOSTNAME;
      const afdHost = process.env.NEXT_PUBLIC_AFD_HOSTNAME;
      const arr: { protocol: "https"; hostname: string; pathname: string }[] = [];
      if (blobHost) arr.push({ protocol: "https", hostname: blobHost, pathname: "/**" });
      if (afdHost) arr.push({ protocol: "https", hostname: afdHost, pathname: "/**" });
      // Add wildcard pattern for all Azure Front Door endpoints
      arr.push({ protocol: "https", hostname: "*.azurefd.net", pathname: "/**" });
      arr.push({ protocol: "https", hostname: "*.blob.core.windows.net", pathname: "/**" });
      return arr;
    })(),
    dangerouslyAllowSVG: true,
    // Limit image CSP to image/media directives only to avoid framing/popup blocks
    contentSecurityPolicy:
      "img-src 'self' data: blob: https:; media-src 'self' data: blob: https:",
  },
  // Add global headers for CSP and COOP to support embedded wallet flows
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-src https://embedded-wallet.thirdweb.com https://*.thirdweb.com; child-src https://embedded-wallet.thirdweb.com https://*.thirdweb.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.thirdweb.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:;",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
  webpack: (config, { dev }) => {
    // Ignore test-only deps pulled in by deep logger deps (thread-stream tests)
    const IgnorePlugin = (require('webpack') as any).IgnorePlugin;
    config.plugins.push(new IgnorePlugin({
      resourceRegExp: /(tap|tape|fastbench|why-is-node-running|pino-elasticsearch|desm)$/,
    }));
    config.resolve = config.resolve || {} as any;
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      tap: false,
      tape: false,
      'why-is-node-running': false,
      fastbench: false,
      desm: false,
      'pino-elasticsearch': false,
    } as any;

    // Suppress source map warnings in development
    if (dev) {
      config.devtool = false;
    }

    return config;
  },

  async redirects() {
    // No redirects for /pricing; it now serves the Terminal experience directly
    return [];
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/farcaster.json",
        destination: "/api/farcaster/manifest",
      },
      {
        source: "/opengraph-image.png",
        destination: "/opengraph-image",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
