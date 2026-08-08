import { ImageResponse } from 'next/og';

export const alt = 'Enforcee — which of your rules did your AI actually follow?';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#FAF8F4',
          padding: '68px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 14,
              background: '#1A1917',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            E
          </div>
          <div style={{ fontSize: 34, color: '#1A1917', letterSpacing: -0.5 }}>Enforcee</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, lineHeight: 1.1, color: '#1A1917', letterSpacing: -2, maxWidth: 980 }}>
            Which of your rules did it
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
            <div
              style={{
                fontSize: 68,
                lineHeight: 1.1,
                color: '#1A1917',
                letterSpacing: -2,
                background: '#FEF3C7',
                padding: '2px 14px',
              }}
            >
              actually follow?
            </div>
          </div>
          <div style={{ fontSize: 29, color: '#5C574E', marginTop: 26, maxWidth: 900, lineHeight: 1.4 }}>
            A verdict for every rule you wrote, with the exact quote it was decided on.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {['4 of 5 decided by code', 'every judged verdict carries a located quote', 'no account to try it'].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 21,
                color: '#5C574E',
                border: '1px solid #E5E0D8',
                borderRadius: 999,
                padding: '9px 20px',
                background: '#fff',
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
