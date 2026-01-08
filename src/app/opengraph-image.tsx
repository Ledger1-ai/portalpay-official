import { generateBasaltOG } from '@/lib/og-template';

export const runtime = 'nodejs';
export const alt = 'Basalt Surge - Web3 Native Commerce & Payments';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

export default async function Image() {
    return await generateBasaltOG({
        bgPath: 'bsurgebg.png',
        primaryColor: '#35ff7c',
        leftWing: (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 }}>WEB3 NATIVE</div>
                <div style={{ fontSize: 60, color: '#35ff7c', fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1.1, textTransform: 'uppercase' }}>ECOMMERCE</div>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginTop: 4 }}>& PAYMENTS</div>
            </div>
        ),
        rightWing: (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ fontSize: 42, color: 'white', fontWeight: 700, lineHeight: 1.2 }}>
                    Forging the next
                </div>
                <div style={{ fontSize: 42, color: 'white', fontWeight: 700, lineHeight: 1.2 }}>
                    generation of payments.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
                    <div style={{ width: 4, height: 40, background: '#35ff7c' }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 20, color: '#35ff7c', fontWeight: 700, letterSpacing: '0.15em' }}>SANTA FE • NM</div>
                        <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>surge.basalthq.com</div>
                    </div>
                </div>
            </div>
        )
    });
}
