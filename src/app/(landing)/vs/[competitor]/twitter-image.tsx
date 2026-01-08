
import { generateBasaltOG } from '@/lib/og-template';
import { getComparisonData } from '@/lib/landing-pages/comparisons';
import { createMeshGradient, loadPublicImageBuffer, fetchWithCache, escapeForSvg } from '@/lib/og-image-utils';
import { getBrandConfig } from '@/config/brands';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const alt = 'Feature Comparison';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

async function loadCompetitorLogo(slug: string, name: string): Promise<Buffer | null> {
    const logoSize = 512;
    const domainMap: Record<string, string> = {
        stripe: 'stripe.com', square: 'squareup.com', paypal: 'paypal.com', toast: 'toasttab.com',
        'coinbase-commerce': 'commerce.coinbase.com', adyen: 'adyen.com', worldpay: 'worldpay.com',
        razorpay: 'razorpay.com', paystack: 'paystack.com', flutterwave: 'flutterwave.com',
        'mercado-pago': 'mercadopago.com', mpesa: 'safaricom.co.ke', 'checkout-com': 'checkout.com',
        bitpay: 'bitpay.com', flexa: 'flexa.network', 'clover-fiserv': 'clover.com',
        'global-payments': 'globalpayments.com', elavon: 'elavon.com', braintree: 'braintreepayments.com',
        'authorize-net': 'authorize.net', wepay: 'wepay.com', stax: 'staxpayments.com',
        helcim: 'helcim.com', lightspeed: 'lightspeedhq.com', touchbistro: 'touchbistro.com',
        opennode: 'opennode.com', dutchie: 'dutchie.com', aeropay: 'aeropay.com',
        hypur: 'hypur.com', paymentcloud: 'paymentcloudinc.com', paykings: 'paykings.com',
        'durango-merchant-services': 'durangomerchantservices.com', 'shopify-payments': 'shopify.com',
        canpay: 'canpaydebit.com', 'cova-pos': 'covasoftware.com', flowhub: 'flowhub.com',
        treez: 'treez.io', rapyd: 'rapyd.net', bluesnap: 'bluesnap.com', nmi: 'nmi.com',
        nuvei: 'nuvei.com', paysafe: 'paysafe.com', cybersource: 'cybersource.com',
        '2checkout': '2checkout.com', moneris: 'moneris.com', 'evo-payments': 'evopayments.com'
    };

    const slugKey = String(slug || '').toLowerCase();
    const nameKey = String(name || '').toLowerCase().replace(/\s+/g, '-');
    const compDomain = domainMap[slugKey] || `${name.replace(/\s+/g, '').toLowerCase()}.com`;
    const compLogoUrl = `https://logo.clearbit.com/${compDomain}?size=512`;

    try {
        const localLogo =
            (await loadPublicImageBuffer(`logos/${slugKey}.webp`)) ||
            (await loadPublicImageBuffer(`logos/${slugKey}.png`)) ||
            (await loadPublicImageBuffer(`logos/${slugKey}.svg`)) ||
            (await loadPublicImageBuffer(`logos/${nameKey}.webp`)) ||
            (await loadPublicImageBuffer(`logos/${nameKey}.png`)) ||
            (await loadPublicImageBuffer(`logos/${nameKey}.svg`));

        let compLogoBuf: Buffer | null = localLogo;
        if (!compLogoBuf) compLogoBuf = await fetchWithCache(compLogoUrl);

        if (compLogoBuf) {
            return await sharp(compLogoBuf)
                .resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
                .png()
                .toBuffer();
        }

        const initials = name.split(/\s+/).map((w) => w[0]?.toUpperCase() || '').slice(0, 2).join('');
        const initialsSvg = Buffer.from(`
          <svg width="${logoSize}" height="${logoSize}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${logoSize}" height="${logoSize}" rx="64" ry="64" fill="rgba(255,255,255,0.1)"/>
            <text x="50%" y="58%" font-family="Arial, sans-serif" font-size="200" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">
              ${escapeForSvg(initials)}
            </text>
          </svg>
        `);
        return await sharp(initialsSvg).png().toBuffer();

    } catch (e) {
        return null;
    }
}

export default async function Image({ params }: { params: Promise<{ competitor: string }> }) {
    const { competitor } = await params;
    const comparisonData = getComparisonData(competitor);

    if (!comparisonData) {
        return new Response('Not found', { status: 404 });
    }

    const { name, pricing } = comparisonData;
    const brand = getBrandConfig();
    const brandPrimary = brand.colors?.primary || '#0ea5e9';
    const brandAccent = brand.colors?.accent || '#3b82f6';
    const colors = [brandPrimary, brandAccent, '#8b5cf6'];

    const bgSvg = createMeshGradient(colors, 2400, 1260);
    const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();
    const bgDataUri = `data:image/png;base64,${bgBuffer.toString('base64')}`;

    const logoBuffer = await loadCompetitorLogo(competitor, name);
    const medallionDataUri = logoBuffer ? `data:image/png;base64,${logoBuffer.toString('base64')}` : undefined;

    const getFees = () => {
        const percent = (pricing.processingFee * 100).toFixed(1).replace('.0', '') + '%';
        const fixed = pricing.flatFee > 0 ? ` + ${pricing.flatFee}¢` : '';
        return `${percent}${fixed}`;
    };

    return await generateBasaltOG({
        bgImage: bgDataUri,
        medallionImage: medallionDataUri, // Competitor logo in center
        primaryColor: colors[0],
        leftWing: (
            <>
                <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.8)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 20 }}>COMPARING</div>
                <div style={{ fontSize: 72, color: 'white', fontWeight: 800, textAlign: 'right', lineHeight: 1.1, textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                    BASALT<br />VS<br />{name.toUpperCase()}
                </div>
            </>
        ),
        rightWing: (
            <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.7)' }}>SAVES YOU</div>
                    <div style={{ fontSize: 64, color: '#22c55e', fontWeight: 800 }}>70% LESS</div>
                    <div style={{ fontSize: 32, color: 'white', fontWeight: 600 }}>Fees start at 0.5%</div>
                    <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.6)', marginTop: 10 }}>vs {getFees()}</div>
                </div>
            </>
        )
    });
}
