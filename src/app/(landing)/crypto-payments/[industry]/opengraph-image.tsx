
import { generateBasaltOG } from '@/lib/og-template';
import { getIndustryData } from '@/lib/landing-pages/industries';
import { getEmojiColors, createMeshGradient, loadTwemojiPng } from '@/lib/og-image-utils';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const alt = 'Crypto Payment Solutions';
// Template uses 2400x1260. Ideally we match it.
// Next.js might resize it down if we export size = {1200, 630}.
// The template uses `size` export { width: 2400, height: 1260 }.
// Let's use the template's size for high res:
export const size = { width: 2400, height: 1260 };

export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ industry: string }> }) {
  const { industry } = await params;
  const industryData = getIndustryData(industry);

  if (!industryData) {
    // Fallback if industry not found (shouldn't happen on static paths really)
    return new Response('Not found', { status: 404 });
  }

  const { name, icon, heroHeadline, heroSubheadline } = industryData;

  // 1. Generate Background Gradient
  const colors = getEmojiColors(icon);
  // generateBasaltOG expects 2400x1260 background
  const bgSvg = createMeshGradient(colors, 2400, 1260);
  const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  const bgDataUri = `data:image/png;base64,${bgBuffer.toString('base64')}`;

  // 2. Generate Medallion (Emoji)
  // Template expects ~700x700 image in the center medallion, but with padding.
  // The actual image is rendered 700x700 with padding 30.
  // loadTwemojiPng rasterizes it. Let's ask for a decent size.
  const emojiBuffer = await loadTwemojiPng(icon, 500); // 500px should be crisp enough inside the 700px container
  const medallionDataUri = emojiBuffer ? `data:image/png;base64,${emojiBuffer.toString('base64')}` : undefined;

  return await generateBasaltOG({
    bgImage: bgDataUri,
    medallionImage: medallionDataUri, // If undefined, it falls back to 'Basalt.png' from template default, maybe acceptable or we pass empty string?
    // If emoji fails, medallionImage is undefined -> template uses 'Basalt.png'. That's a good fallback.
    primaryColor: colors[0], // Use dominant emoji color as primary
    leftWing: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 }}>CRYPTO PAYMENTS</div>
        <div style={{ fontSize: 60, color: '#35ff7c', fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1.1, textTransform: 'uppercase', textAlign: 'right' }}>
          {name.toUpperCase()}
        </div>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginTop: 4 }}>SOLUTIONS</div>
      </div>
    ),
    rightWing: (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {['0.5% Fees', 'Instant Settlement', 'No Chargebacks', 'Global Reach'].map((feat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors[1] || 'white', boxShadow: '0 0 10px white' }} />
              <div style={{ fontSize: 36, color: 'white', fontWeight: 600 }}>{feat}</div>
            </div>
          ))}
        </div>
      </>
    )
  });
}
