import { generateBasaltOG } from '@/lib/og-template';

import { loadBasaltDefaults } from '@/lib/og-asset-loader';

export const runtime = 'nodejs';
export const alt = 'Web3 Native Commerce & Payments';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

export default async function Image() {
    const {
        bgBase64,
        blurredBgBase64,
        medallionBase64,
        shieldBase64,
        logoBase64,
        brand
    } = await loadBasaltDefaults(); // Actually calling the new logic aliased/shimmed

    const primaryColor = brand.colors.primary || '#35ff7c';
    const isBasalt = String(brand.key).toLowerCase() === 'basaltsurge';

    const titleLine1 = isBasalt ? 'WEB3 NATIVE' : (brand.name || 'WEB3 NATIVE').toUpperCase();
    const titleLine2 = isBasalt ? 'ECOMMERCE' : 'PAYMENTS';
    const titleLine3 = isBasalt ? '& PAYMENTS' : '& COMMERCE';

    const tagline1 = isBasalt ? 'Forging the next' : 'The future of';
    const tagline2 = isBasalt ? 'generation of payments.' : 'digital payments.';

    return await generateBasaltOG({
        bgImage: bgBase64,
        blurredBgImage: blurredBgBase64,
        medallionImage: medallionBase64,
        // Only show corner shield for Basalt
        cornerShieldImage: shieldBase64,
        primaryColor: primaryColor,
        // Show logo at bottom if partner, otherwise just consistent style
        poweredByImage: logoBase64,

        leftWing: (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 }}>{titleLine1}</div>
                <div style={{ fontSize: 60, color: primaryColor, fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1.1, textTransform: 'uppercase' }}>{titleLine2}</div>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginTop: 4 }}>{titleLine3}</div>
            </div>
        ),
        rightWing: (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ fontSize: 42, color: 'white', fontWeight: 700, lineHeight: 1.2 }}>
                    {tagline1}
                </div>
                <div style={{ fontSize: 42, color: 'white', fontWeight: 700, lineHeight: 1.2 }}>
                    {tagline2}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
                    <div style={{ width: 4, height: 40, background: primaryColor }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 20, color: primaryColor, fontWeight: 700, letterSpacing: '0.15em' }}>{isBasalt ? 'SANTA FE • NM' : 'POWERED BY WEB3'}</div>
                        <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{isBasalt ? 'surge.basalthq.com' : (brand.appUrl?.replace(/^https?:\/\//, '') || 'WEB3 PAYMENTS')}</div>
                    </div>
                </div>
            </div>
        )
    });
}
