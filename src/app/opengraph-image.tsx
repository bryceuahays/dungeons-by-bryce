import { ImageResponse } from 'next/og';

// The picture shown when the site is shared (drawn here: no artwork is borrowed).
export const alt = 'Dungeons by Bryce: run the campaign your players never see coming';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 42%, #12343a 0%, #06141a 45%, #010508 100%)', color: '#e6eff1', fontFamily: 'serif' }}>
        <div style={{ display: 'flex', width: 220, height: 300, borderRadius: '110px 110px 8px 8px', border: '6px solid #2b6c70', background: 'radial-gradient(circle at 50% 70%, #4fd1c5 0%, #12343a 60%, #06141a 100%)', boxShadow: '0 0 90px rgba(79,209,197,.55)', marginBottom: 36 }} />
        <div style={{ display: 'flex', fontSize: 78, letterSpacing: 6, color: '#cfe9ea' }}>Dungeons by Bryce</div>
        <div style={{ display: 'flex', fontSize: 34, marginTop: 14, color: '#8fbfc6' }}>Run the campaign your players never see coming.</div>
        <div style={{ display: 'flex', fontSize: 24, marginTop: 26, color: '#6f9aa0' }}>Secrets and reveals · Story timeline · Maps · Homebrew · Fifth edition compatible</div>
      </div>
    ),
    size,
  );
}
