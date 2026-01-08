
import { generateBasaltOG } from '@/lib/og-template';

export const runtime = 'nodejs';
export const alt = 'Basalt Developers';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

export default async function Image() {
    return await generateBasaltOG({
        bgPath: 'bsurgebg.png',
        primaryColor: '#8b5cf6', // Violet for devs
        leftWing: (
            <>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 20 }}>BASALT</div>
                <div style={{ fontSize: 72, color: 'white', fontWeight: 800, textAlign: 'right', lineHeight: 1.1, textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                    DEVELOPER<br />PLATFORM
                </div>
            </>
        ),
        rightWing: (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ fontSize: 36, color: 'white', fontWeight: 600 }}>• API Reference</div>
                    <div style={{ fontSize: 36, color: 'white', fontWeight: 600 }}>• SDKs & Libraries</div>
                    <div style={{ fontSize: 36, color: 'white', fontWeight: 600 }}>• Integration Guides</div>
                    <div style={{ fontSize: 36, color: 'white', fontWeight: 600 }}>• Sandbox Access</div>
                </div>
            </>
        )
    });
}
