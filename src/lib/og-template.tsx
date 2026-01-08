import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const alt = 'BasaltHQ - Neuromimetic Business Architecture';
export const size = { width: 2400, height: 1260 };
export const contentType = 'image/png';

export type OGTemplateProps = {
    leftWing: React.ReactNode;
    rightWing: React.ReactNode;
    primaryColor?: string;
    medallionPath?: string;
    bgPath?: string;
    blurredBgPath?: string;
    bgImage?: string;
    medallionImage?: string;
    poweredBy?: string;
    cornerShieldPath?: string;
};

const assetCache = new Map<string, string>();

function loadAsset(filename: string): string {
    const filePath = join(process.cwd(), 'public', filename);
    if (assetCache.has(filePath)) {
        return assetCache.get(filePath)!;
    }
    try {
        const data = readFileSync(filePath);
        const base64 = `data:image/png;base64,${data.toString('base64')}`;
        assetCache.set(filePath, base64);
        return base64;
    } catch (e) {
        return '';
    }
}

export async function generateBasaltOG({
    leftWing,
    rightWing,
    primaryColor = '#35ff7c',
    medallionPath = 'BasaltSurgeM.png',
    bgPath = 'bsurgebg.png',
    blurredBgPath = 'bsurgebg-blurred.png',
    bgImage,
    medallionImage,
    cornerShieldPath,
}: OGTemplateProps) {

    const bgBase64 = bgImage || loadAsset(bgPath);
    const blurredBgBase64 = bgImage || loadAsset(blurredBgPath);
    const medallionBase64 = medallionImage || loadAsset(medallionPath);
    const shieldBase64 = cornerShieldPath ? loadAsset(cornerShieldPath) : '';

    const element = (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
            position: 'relative',
            fontFamily: 'Helvetica, Arial, sans-serif'
        }}>
            <img src={bgBase64} width={2400} height={1260} style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover',
            }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />

            {/* Left Wing */}
            <div style={{
                position: 'absolute', left: 200, top: 480, width: 800, height: 320,
                borderRadius: '40px 0 0 40px', overflow: 'hidden', display: 'flex',
                flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
                padding: '40px 260px 40px 40px', boxShadow: 'inset 2px 2px 20px rgba(255,255,255,0.2)',
            }}>
                <img src={blurredBgBase64} width={2400} height={1260} style={{
                    position: 'absolute', left: -200, top: -480, width: 2400, height: 1260,
                    objectFit: 'cover', transform: 'scale(1.05)',
                }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
                <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.1)', borderRight: 'none', borderRadius: '40px 0 0 40px' }} />
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    {leftWing}
                </div>
            </div>

            {/* Right Wing */}
            <div style={{
                position: 'absolute', right: 200, top: 480, width: 800, height: 320,
                borderRadius: '0 40px 40px 0', overflow: 'hidden', display: 'flex',
                flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
                padding: '40px 40px 40px 260px', boxShadow: 'inset -2px 2px 20px rgba(255,255,255,0.2)',
            }}>
                <img src={blurredBgBase64} width={2400} height={1260} style={{
                    position: 'absolute', right: -200, top: -480, width: 2400, height: 1260,
                    objectFit: 'cover', transform: 'scale(1.05)',
                }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
                <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,0.3)', borderLeft: 'none', borderRadius: '0 40px 40px 0' }} />
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    {rightWing}
                </div>
            </div>

            {/* Glass Frame - Left */}
            <div style={{ position: 'absolute', left: 40, top: 80, width: 40, height: 1100, display: 'flex', background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 10px rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', borderTop: 'none', borderBottom: 'none', overflow: 'hidden' }}>
                <img src={blurredBgBase64} width={2400} height={1260} style={{ position: 'absolute', left: -40, top: -80, width: 2400, height: 1260, objectFit: 'cover', transform: 'scale(1.05)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.1)' }} />
            </div>

            {/* Glass Frame - Right */}
            <div style={{ position: 'absolute', left: 2320, top: 80, width: 40, height: 1100, display: 'flex', background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 10px rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', borderTop: 'none', borderBottom: 'none', overflow: 'hidden' }}>
                <img src={blurredBgBase64} width={2400} height={1260} style={{ position: 'absolute', left: -2320, top: -80, width: 2400, height: 1260, objectFit: 'cover', transform: 'scale(1.05)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.1)' }} />
            </div>

            {/* Glass Frame - Top */}
            <div style={{ position: 'absolute', left: 40, top: 40, width: 2320, height: 40, borderRadius: '24px 24px 0 0', display: 'flex', background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 10px rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', borderBottom: 'none', overflow: 'hidden' }}>
                <img src={blurredBgBase64} width={2400} height={1260} style={{ position: 'absolute', left: -40, top: -40, width: 2400, height: 1260, objectFit: 'cover', transform: 'scale(1.05)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.1)' }} />
            </div>

            {/* Glass Frame - Bottom */}
            <div style={{ position: 'absolute', left: 40, top: 1180, width: 2320, height: 40, borderRadius: '0 0 24px 24px', display: 'flex', background: 'rgba(255,255,255,0.1)', boxShadow: 'inset 0 0 10px rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', borderTop: 'none', overflow: 'hidden' }}>
                <img src={blurredBgBase64} width={2400} height={1260} style={{ position: 'absolute', left: -40, top: -1180, width: 2400, height: 1260, objectFit: 'cover', transform: 'scale(1.05)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.1)' }} />
            </div>

            {/* HUD Corners */}
            <div style={{ position: 'absolute', top: 60, left: 60, width: 80, height: 80, borderTop: `8px solid ${primaryColor}`, borderLeft: `8px solid ${primaryColor}`, borderRadius: '24px 0 0 0' }} />
            <div style={{ position: 'absolute', top: 60, right: 60, width: 80, height: 80, borderTop: `8px solid ${primaryColor}`, borderRight: `8px solid ${primaryColor}`, borderRadius: '0 24px 0 0' }} />
            <div style={{ position: 'absolute', bottom: 60, left: 60, width: 80, height: 80, borderBottom: `8px solid ${primaryColor}`, borderLeft: `8px solid ${primaryColor}`, borderRadius: '0 0 0 24px' }} />
            <div style={{ position: 'absolute', bottom: 60, right: 60, width: 80, height: 80, borderBottom: `8px solid ${primaryColor}`, borderRight: `8px solid ${primaryColor}`, borderRadius: '0 0 24px 0' }} />



            {/* Center Medallion Ring (Blurred glass behind) */}
            <div style={{ position: 'absolute', left: 810, top: 240, width: 780, height: 780, borderRadius: '50%', overflow: 'hidden', display: 'flex', boxShadow: 'inset 0 0 20px rgba(255,255,255,0.3)', border: `4px solid ${primaryColor}` }}>
                <img src={blurredBgBase64} width={2400} height={1260} style={{ position: 'absolute', left: -810, top: -240, width: 2400, height: 1260, objectFit: 'cover', transform: 'scale(1.05)' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.05)' }} />
            </div>

            {/* Center Medallion */}
            {medallionImage ? (
                /* Location pages: Flag with white background */
                <div style={{ position: 'absolute', left: 850, top: 280, width: 700, height: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden', background: 'white' }}>
                    <img src={medallionBase64} width={980} height={980} style={{
                        position: 'absolute',
                        width: 980,
                        height: 980,
                        objectFit: 'cover',
                        objectPosition: 'center',
                    }} />
                </div>
            ) : (
                /* Main page: Original medallion with logo fills circle */
                <div style={{ position: 'absolute', left: 850, top: 280, width: 700, height: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', overflow: 'hidden' }}>
                    <img src={medallionBase64} width={700} height={700} style={{
                        objectFit: 'contain',
                    }} />
                </div>
            )}

            {/* 3D Gleam overlay - separate element for location pages only */}
            {medallionImage && (
                <div style={{
                    position: 'absolute',
                    left: 850,
                    top: 280,
                    width: 700,
                    height: 700,
                    borderRadius: '50%',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 20%, transparent 40%, rgba(0,0,0,0.15) 65%, rgba(0,0,0,0.45) 100%)',
                    pointerEvents: 'none',
                }} />
            )}

            {/* Outer glow ring around medallion */}
            <div style={{ position: 'absolute', left: 846, top: 276, width: 708, height: 708, borderRadius: '50%', border: `4px solid ${primaryColor}`, boxShadow: `0 0 40px ${primaryColor}60` }} />

            {/* Powered By Logo */}
            <div style={{ position: 'absolute', top: 1040, left: 0, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>
                <img src={loadAsset('BasaltSurgeWide.png')} height={120} style={{ objectFit: 'contain', opacity: 1 }} />
            </div>

            {/* Corner Shield */}
            {shieldBase64 && (
                <div style={{ position: 'absolute', top: 80, right: 80, display: 'flex' }}>
                    <img src={shieldBase64} width={120} height={140} style={{ objectFit: 'contain', opacity: 0.9, filter: 'drop-shadow(0 0 20px rgba(53,255,124,0.4))' }} />
                </div>
            )}
        </div>
    );

    return new ImageResponse(element, { ...size });
}
