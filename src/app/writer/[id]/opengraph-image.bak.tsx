import { ImageResponse } from 'next/og';
import { getWriterShareMeta } from '@/lib/server/share';

export const runtime = 'nodejs';
export const alt = 'FlowFic writer profile preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const revalidate = 300;

type WriterOpenGraphImageProps = {
  params: Promise<{ id: string }>;
};

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

export default async function WriterOpenGraphImage({ params }: WriterOpenGraphImageProps) {
  const { id } = await params;
  const writer = await getWriterShareMeta(id);

  if (!writer) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #fff7ed 0%, #f8fafc 42%, #111827 100%)',
            color: '#0f172a',
            fontSize: 64,
            fontWeight: 800,
          }}
        >
          FlowFic
        </div>
      ),
      size
    );
  }

  const authorInitial = writer.penName.trim().charAt(0).toUpperCase() || 'W';
  const bio = truncateText(writer.bio || 'ดูโปรไฟล์นักเขียนบน FlowFic', 160);
  const storyCountLabel = `${writer.publishedStoryCount.toLocaleString('th-TH')} เรื่องที่เผยแพร่`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #ffffff 0%, #fff7ed 38%, #111827 100%)',
          color: '#0f172a',
        }}
      >
        {writer.latestStoryCoverUrl && (
          <img
            src={writer.latestStoryCoverUrl}
            alt={writer.penName}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '46%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.3,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,247,237,0.92) 46%, rgba(15,23,42,0.28) 100%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            height: '100%',
            padding: '52px 58px',
            alignItems: 'center',
            gap: 40,
          }}
        >
          <div
            style={{
              width: 220,
              height: 220,
              flexShrink: 0,
              borderRadius: 42,
              overflow: 'hidden',
              border: '1px solid rgba(15,23,42,0.08)',
              boxShadow: '0 20px 40px rgba(15,23,42,0.12)',
              background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {writer.avatarUrl ? (
              <img
                src={writer.avatarUrl}
                alt={writer.penName}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%',
                  color: '#c2410c',
                  fontSize: 104,
                  fontWeight: 800,
                  letterSpacing: -4,
                }}
              >
                {authorInitial}
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              maxWidth: 720,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(249,115,22,0.2)',
                  background: '#fff7ed',
                  color: '#c2410c',
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                }}
              >
                WRITER PROFILE
              </div>
              <div
                style={{
                  display: 'flex',
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(15,23,42,0.08)',
                  background: 'rgba(255,255,255,0.72)',
                  color: '#334155',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {storyCountLabel}
              </div>
            </div>

            <div
            style={{
              display: 'flex',
              fontSize: 66,
              lineHeight: 1.04,
              letterSpacing: -2.4,
              fontWeight: 800,
              color: '#111827',
            }}
          >
              {writer.penName}
            </div>

            <div
              style={{
                display: 'flex',
                maxWidth: 700,
                fontSize: 24,
                lineHeight: 1.58,
                color: '#475569',
              }}
            >
              {bio}
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 22,
                color: '#ea580c',
                fontWeight: 700,
              }}
            >
              Discover published stories on FlowFic
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
