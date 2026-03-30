import { ImageResponse } from 'next/og';
import { getStoryShareMeta } from '@/lib/server/share';

export const runtime = 'nodejs';
export const alt = 'FlowFic story preview';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const revalidate = 300;

type StoryOpenGraphImageProps = {
  params: Promise<{ id: string }>;
};

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

export default async function StoryOpenGraphImage({ params }: StoryOpenGraphImageProps) {
  const { id } = await params;
  const story = await getStoryShareMeta(id);

  if (!story) {
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

  const completionLabel = story.completionStatus === 'completed' ? 'จบแล้ว' : 'ยังไม่จบ';
  const pathModeLabel = story.pathMode === 'branching' ? 'เลือกเส้นทาง' : 'เส้นเรื่องเดียว';
  const subtitle = truncateText(story.synopsis || 'อ่านเรื่องนี้บน FlowFic', 150);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0f172a 0%, #111827 46%, #1f2937 100%)',
          color: '#ffffff',
        }}
      >
        {story.coverUrl && (
          <img
            src={story.coverUrl}
            alt={story.title}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.38,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.76) 48%, rgba(15,23,42,0.68) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at top right, rgba(249,115,22,0.28) 0%, rgba(249,115,22,0) 36%)',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '52px 58px',
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
                gap: 14,
              }}
            >
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                FLOWFIC STORY
              </div>
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  background: 'rgba(249,115,22,0.16)',
                  border: '1px solid rgba(249,115,22,0.34)',
                  color: '#fdba74',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {pathModeLabel}
              </div>
            </div>
            <div
              style={{
                padding: '10px 16px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {completionLabel}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              maxWidth: 860,
            }}
          >
            <div
            style={{
              display: 'flex',
              fontSize: 66,
              lineHeight: 1.04,
              letterSpacing: -2.4,
              fontWeight: 800,
            }}
          >
              {story.title}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 28,
                color: 'rgba(255,255,255,0.9)',
                fontWeight: 600,
              }}
            >
              โดย {story.penName}
            </div>
            <div
              style={{
                display: 'flex',
                maxWidth: 780,
                fontSize: 24,
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.82)',
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
