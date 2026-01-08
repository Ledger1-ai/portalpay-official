
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

    const { name, flagColors, countryCode } = location;

    const bgSvg = createFlagMeshGradient(flagColors, 2400, 1260);
    const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();
    const bgDataUri = `data:image/png;base64,${bgBuffer.toString('base64')}`;

    const getFlagEmoji = (cc: string) => {
        const codePoints = cc
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    }

    const flagEmoji = getFlagEmoji(countryCode);
    const emojiBuffer = await loadTwemojiPng(flagEmoji, 500);
    const medallionDataUri = emojiBuffer ? `data:image/png;base64,${emojiBuffer.toString('base64')}` : undefined;

    return await generateBasaltOG({
        bgImage: bgDataUri,
        medallionImage: medallionDataUri,
        primaryColor: flagColors[0] || '#ffffff',
        leftWing: (
            <>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 20 }}>CRYPTO PAYMENTS IN</div>
                <div style={{ fontSize: 72, color: 'white', fontWeight: 800, textAlign: 'right', lineHeight: 1.1, textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                    {name.toUpperCase()}
                </div>
            </>
        ),
        rightWing: (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {['Local Currency Support', 'Instant Settlement', 'Compliant', 'No Border Fees'].map((feat, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: flagColors[1] || 'white', boxShadow: '0 0 10px white' }} />
                            <div style={{ fontSize: 36, color: 'white', fontWeight: 600 }}>{feat}</div>
                        </div>
                    ))}
                </div>
            </>
        )
    });
}
