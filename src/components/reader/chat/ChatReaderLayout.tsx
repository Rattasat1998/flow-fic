import { type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, Heart, List, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './chat-reader.module.css';

interface ChatReaderLayoutProps {
  storyTitle: string;
  chapterLabel: string;
  backgroundImageUrl: string | null;
  isLiked: boolean;
  likeCount: number;
  hideHeartCount: boolean;
  onToggleLike: () => void;
  commentCount: number;
  canOpenComments: boolean;
  onOpenComments: () => void;
  onOpenToc?: () => void;
  children: ReactNode;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: PointerEvent<HTMLDivElement>) => void;
}

const fallbackBackgroundImage =
  'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=900&q=80';

export function ChatReaderLayout({
  storyTitle,
  chapterLabel,
  backgroundImageUrl,
  isLiked,
  likeCount,
  hideHeartCount,
  onToggleLike,
  commentCount,
  canOpenComments,
  onOpenComments,
  onOpenToc,
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
}: ChatReaderLayoutProps) {
  const router = useRouter();
  const backgroundUrl = backgroundImageUrl || fallbackBackgroundImage;
  const shouldShowCommentAction = commentCount >= 0;
  const visibleCommentCount = Math.max(0, commentCount);

  return (
    <div className={styles.main}>
      <div
        className={styles.backgroundOverlay}
        style={{ backgroundImage: `url(${backgroundUrl})` }}
      />
      <div className={styles.backgroundDarken} />

      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <div className={styles.topBarLeft}>
            <button
              type="button"
              onClick={() => router.back()}
              className={`${styles.actionBtn} ${styles.backBtn}`}
              aria-label="ย้อนกลับ"
            >
              <ChevronLeft size={18} />
            </button>
            <div className={styles.topBarCopy}>
              <p className={styles.topBarTitle}>{storyTitle || 'กำลังอ่านเรื่อง'}</p>
              <p className={styles.topBarMeta}>{chapterLabel || 'ไม่พบตอน'}</p>
            </div>
          </div>
          <div className={styles.topBarActions}>
            {onOpenToc && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={onOpenToc}
                aria-label="เปิดสารบัญ"
              >
                <List size={16} />
              </button>
            )}
            <button
              type="button"
              className={`${styles.actionBtn} ${isLiked ? styles.actionBtnActive : ''}`}
              onClick={onToggleLike}
              aria-label="กดหัวใจ"
            >
              <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
              <span>{hideHeartCount ? 'หัวใจ' : likeCount.toLocaleString('th-TH')}</span>
            </button>
            {shouldShowCommentAction && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={onOpenComments}
                disabled={!canOpenComments}
                aria-label="เปิดคอมเมนต์"
              >
                <MessageCircle size={16} />
                <span>{visibleCommentCount.toLocaleString('th-TH')}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={styles.chatViewport}>
        <div
          className={styles.chatContainer}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
