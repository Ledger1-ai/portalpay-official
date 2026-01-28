import { MetadataRoute } from 'next';

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://surge.basalthq.com').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/admin/',
    '/api/',
    '/pms/*/settings',
    '/pms/*/setup',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      // Explicitly allow major AI crawlers while keeping sensitive paths disallowed
      { userAgent: 'GPTBot', allow: '/', disallow },
      { userAgent: 'ChatGPT-User', allow: '/', disallow },
      { userAgent: 'anthropic-ai', allow: '/', disallow },
      { userAgent: 'Claude-Web', allow: '/', disallow },
      { userAgent: 'PerplexityBot', allow: '/', disallow },
      { userAgent: 'Google-Extended', allow: '/', disallow },
      { userAgent: 'CCBot', allow: '/', disallow },
      { userAgent: 'Applebot-Extended', allow: '/', disallow },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
