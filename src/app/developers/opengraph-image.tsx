
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 }}>BASALT</div>
        <div style={{ fontSize: 60, color: '#35ff7c', fontWeight: 800, letterSpacing: '0.05em', lineHeight: 1.1, textTransform: 'uppercase' }}>SURGE</div>
        <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.1em', marginTop: 4 }}>DEVELOPERS</div>
      </div>
    ),
    rightWing: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 42, color: 'white', fontWeight: 700, lineHeight: 1.2 }}>
          Build the Future of
        </div>
        <div style={{ fontSize: 42, color: 'white', fontWeight: 700, lineHeight: 1.2 }}>
          Agentic Commerce
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>• API Reference</div>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>• SDKs & Libraries</div>
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>• Neuromimetic OS</div>
        </div>
        <div style={{ marginTop: 16, fontSize: 20, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>surge.basalthq.com/docs</div>
      </div>
    )
  });
}
