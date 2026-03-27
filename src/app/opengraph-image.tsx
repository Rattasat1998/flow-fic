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
            position: 'absolute',
            right: 56,
            top: 78,
            width: 332,
            height: 474,
            borderRadius: 30,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.24)',
            boxShadow: '0 32px 64px rgba(2,6,23,0.38)',
            background: 'linear-gradient(155deg, #111827 0%, #0f172a 56%, #7c2d12 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '24px 22px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle at 72% 10%, rgba(249,115,22,0.34) 0%, rgba(249,115,22,0) 42%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(15,23,42,0.26) 46%, rgba(2,6,23,0.44) 100%)',
            }}
          />
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 999,
              alignSelf: 'flex-start',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              fontSize: 15,
              color: '#f8fafc',
              fontWeight: 700,
            }}
          >
            Interactive Story
          </div>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                lineHeight: 1.08,
                letterSpacing: -1,
                color: '#f8fafc',
                fontWeight: 800,
              }}
            >
              Choose the next path.
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 17,
                lineHeight: 1.45,
                color: 'rgba(226,232,240,0.92)',
              }}
            >
              Read chapters, make decisions, and unlock different endings.
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: '#fb923c',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  fontSize: 14,
                  color: '#fdba74',
                  fontWeight: 700,
                }}
              >
                FlowFic Preview Card
              </div>
            </div>
          </div>
        </div>
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
              maxWidth: 690,
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
