
import { generateBasaltOG } from '@/lib/og-template';
import { getLocationData } from '@/lib/landing-pages/locations';
import { createFlagMeshGradient, loadTwemojiPng } from '@/lib/og-image-utils';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const alt = 'Crypto Payment Locations';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const location = getLocationData(slug);

  if (!location) {
    return new Response('Not found', { status: 404 });
  }

  const { name, country } = location;

  // 1. Get Flag Colors from Source of Truth
  const { getFlagColors } = await import('@/lib/flags');
  const primaryColors = getFlagColors(country);

  // 2. Generate Flag Gradient Background
  const bgSvg = createFlagMeshGradient(primaryColors, 2400, 1260); // Use generated flag colors for the mesh
  const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  const bgDataUri = `data:image/png;base64,${bgBuffer.toString('base64')}`;

  // 3. Medallion - Load Twemoji for the actual flag
  // Map full country names to ISO codes for flag emoji generation
  const countryToIso: Record<string, string> = {
    'Nigeria': 'NG',
    'Brazil': 'BR',
    'United Kingdom': 'GB',
    'UK': 'GB',
    'United States': 'US',
    'USA': 'US',
    'Germany': 'DE',
    'France': 'FR',
    'Italy': 'IT',
    'Spain': 'ES',
    'Canada': 'CA',
    'Australia': 'AU',
    'Japan': 'JP',
    'South Korea': 'KR',
    'India': 'IN',
    'China': 'CN',
    'Russia': 'RU',
    'South Africa': 'ZA',
    'Mexico': 'MX',
    'Argentina': 'AR',
    'Colombia': 'CO',
    'Peru': 'PE',
    'Chile': 'CL',
    'Ecuador': 'EC',
    'Venezuela': 'VE',
    'Bolivia': 'BO',
    'Paraguay': 'PY',
    'Uruguay': 'UY',
    'Turkey': 'TR',
    'Saudi Arabia': 'SA',
    'UAE': 'AE',
    'Singapore': 'SG',
    'Vietnam': 'VN',
    'Thailand': 'TH',
    'Indonesia': 'ID',
    'Malaysia': 'MY',
    'Philippines': 'PH',
    'Kenya': 'KE',
    'Ghana': 'GH',
    'Egypt': 'EG',
    'Morocco': 'MA',
    'Ethiopia': 'ET',
    'Rwanda': 'RW',
    'Tanzania': 'TZ',
    'Uganda': 'UG'
  };

  const getFlagEmoji = (nameOrCode: string) => {
    if (!nameOrCode) return '🇺🇳';
    // Use mapped ISO code if available, otherwise assume it's already a code if length is 2
    let code = countryToIso[nameOrCode] || (nameOrCode.length === 2 ? nameOrCode : 'UN');

    if (code === 'UN') return '🇺🇳';

    const codePoints = code
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  const flagEmoji = country ? getFlagEmoji(country) : '🇺🇳';
  const flagBuffer = await loadTwemojiPng(flagEmoji, 700);

  // 4. Format Industries
  const industries = location.popularIndustries || [];
  const formatIndustry = (ind: string) => ind.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const medallionDataUri = flagBuffer
    ? `data:image/png;base64,${flagBuffer.toString('base64')}`
    : bgDataUri;

  return await generateBasaltOG({
    bgImage: bgDataUri,
    medallionImage: medallionDataUri, // Pass the actual flag image (or mesh fallback)
    primaryColor: primaryColors[0],
    leftWing: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', height: '100%', gap: 0 }}>
        <div style={{ display: 'flex', fontSize: 32, color: 'rgba(255,255,255,0.7)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 8 }}>ACCEPT PAYMENTS IN</div>
        {/* Using a system font that mimics "Vox" bold condensed style if unavailable, or assuming Satori has access to fonts loaded in template */}
        <div style={{ display: 'flex', fontSize: 80, color: 'white', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, textTransform: 'uppercase', textAlign: 'right', textShadow: `0 4px 20px rgba(0,0,0,0.8), 0 0 60px ${primaryColors[0]}80` }}>
          {name}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.9)', fontWeight: 500, letterSpacing: '0.05em', marginTop: 16, textAlign: 'right', maxWidth: 400 }}>
          {location.localContext ? location.localContext.split('.')[0] + '.' : 'Instant settlement and offline support.'}
        </div>

        {/* Powered by label below medallion area (visually, though structurally here) or pass as prop to template */}
      </div>
    ),
    // Pass Powered By text and Shield to template if it supports it, or overlay them
    // Template needs update to support "Powered By" text below medallion and corner shield.
    // For now, let's inject them absolutely into the wings or use a custom template prop if I added one?
    // Checking OGTemplateProps... it doesn't have "poweredBy" or "cornerShield".
    // I will add them to the templateProps in the generatesBasaltOG call after updating the template, 
    // OR simply overlay them here if the template allows absolute children? 
    // The template wraps children in a relative div.
    // Actually, createFlagMeshGradient result is already used as medallionImage. 
    // The user wants "Powered by BasaltSurge" right below the medallion.
    // The template has a specific slot for medallion. I might need to edit the template to allow content BELOW the medallion.
    // Let's UPDATE the template first to support these new slots.
    rightWing: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', fontSize: 20, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          MAJOR INDUSTRIES IN {name}:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, maxWidth: 480, justifyContent: 'flex-start' }}>
          {industries.slice(0, 6).map((ind, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 12, // Slightly less rounded for a "tech tag" feel
              padding: '8px 20px',
              color: 'white',
              fontSize: 20, // Slightly smaller
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}>
              {formatIndustry(ind)}
            </div>
          ))}
        </div>
      </div>
    ),
    poweredBy: 'POWERED BY BASALTSURGE',
    cornerShieldPath: 'Surge.png' // Utilizing the uploaded/requested "Surge.png" shield
  });
}
