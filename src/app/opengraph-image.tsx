import { ImageResponse } from 'next/og';
import { DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_TITLE } from '@/lib/server/share';

export const runtime = 'nodejs';
export const alt = DEFAULT_SITE_TITLE;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #fff7ed 0%, #f8fafc 38%, #111827 100%)',
          color: '#111827',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: -140,
            width: 520,
            height: 520,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(249,115,22,0.32) 0%, rgba(249,115,22,0) 68%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -80,
            bottom: -180,
            width: 480,
            height: 480,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, rgba(14,165,233,0) 72%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '56px 64px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#111827',
                  color: '#ffffff',
                  fontSize: 28,
                  fontWeight: 800,
                }}
              >
                F
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 18, letterSpacing: 4, color: '#ea580c' }}>FLOWFIC</span>
                <span style={{ fontSize: 18, color: '#334155' }}>Interactive fiction platform</span>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 18px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.72)',
                border: '1px solid rgba(15,23,42,0.08)',
                color: '#0f172a',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Horror • Mystery
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              maxWidth: 760,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: 64,
                  height: 4,
                  borderRadius: 999,
                  background: '#f97316',
                }}
              />
              <span style={{ fontSize: 22, color: '#475569' }}>Read. Choose. Continue.</span>
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 68,
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: -3,
                color: '#0f172a',
              }}
            >
              {DEFAULT_SITE_TITLE}
            </div>
            <div
              style={{
                display: 'flex',
                maxWidth: 740,
                fontSize: 28,
                lineHeight: 1.45,
                color: '#334155',
              }}
            >
              {DEFAULT_SITE_DESCRIPTION}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
