
import { generateBasaltOG } from '@/lib/og-template';
import { getIndustryData } from '@/lib/landing-pages/industries';
import { getEmojiColors, createMeshGradient } from '@/lib/og-image-utils';
import { loadTwemojiPng } from '@/lib/og-asset-loader';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const alt = 'Crypto Payment Solutions';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ industry: string }> }) {
    const { industry } = await params;
    const industryData = getIndustryData(industry);

    if (!industryData) {
        return new Response('Not found', { status: 404 });
    }

    const { name, icon } = industryData;

    const colors = getEmojiColors(icon);
    const bgSvg = createMeshGradient(colors, 2400, 1260);
    const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();
    const bgDataUri = `data:image/png;base64,${bgBuffer.toString('base64')}`;

    const emojiBuffer = await loadTwemojiPng(icon, 500);
    const medallionDataUri = emojiBuffer ? `data:image/png;base64,${emojiBuffer.toString('base64')}` : undefined;

    return await generateBasaltOG({
        bgImage: bgDataUri,
        blurredBgImage: bgDataUri,
        medallionImage: medallionDataUri,
        primaryColor: colors[0],
        leftWing: (
            <>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 20 }}>CRYPTO PAYMENTS FOR</div>
                <div style={{ fontSize: 72, color: 'white', fontWeight: 800, textAlign: 'right', lineHeight: 1.1, textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                    {name.toUpperCase()}
                </div>
            </>
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
