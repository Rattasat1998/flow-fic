import Image from 'next/image';
import Link from 'next/link';

import styles from '@/app/home.module.css';
import { getMainCategoryLabel, getSubCategoryLabel } from '@/lib/categories';
import type { DiscoveryStory } from '@/types/discovery';

type StorySearchPanelProps = {
  stories: DiscoveryStory[];
  query: string;
  isLoading?: boolean;
};

function resolveSearchPanelCategoryLabel(story: DiscoveryStory): string {
  return getSubCategoryLabel(story.sub_category) || getMainCategoryLabel(story.main_category) || 'เรื่องแนะนำ';
}

function resolveSearchPanelCompletionLabel(story: DiscoveryStory): string {
  return story.completion_status === 'completed' ? 'จบแล้ว' : 'กำลังอัปเดต';
}

export function StorySearchPanel({
  stories,
  query,
  isLoading = false,
}: StorySearchPanelProps) {
  const searchQuery = query.trim();
  const hasSearch = searchQuery.length > 0;
  const title = hasSearch ? 'ผลลัพธ์ที่ตรงกัน' : 'แนะนำตอนนี้';

  if (isLoading && stories.length === 0) {
    return (
      <div className={styles.navSearchPanelSection}>
        <div className={styles.navSearchPanelHeader}>{title}</div>
        <div className={styles.navSearchPanelState}>
          <p className={styles.navSearchPanelStateTitle}>
            {hasSearch ? 'กำลังค้นหาเรื่อง...' : 'กำลังโหลดเรื่องแนะนำ...'}
          </p>
          <p className={styles.navSearchPanelStateText}>
            {hasSearch ? 'รอสักครู่ ระบบกำลังค้นหาเรื่องที่ตรงกับคำค้นนี้' : 'รอสักครู่ ระบบกำลังเตรียมรายการสำหรับคุณ'}
          </p>
        </div>
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className={styles.navSearchPanelSection}>
        <div className={styles.navSearchPanelHeader}>{title}</div>
        <div className={styles.navSearchPanelState}>
          <p className={styles.navSearchPanelStateTitle}>
            {hasSearch ? 'ไม่พบเรื่องที่ตรงกับคำค้นนี้' : 'ยังไม่มีเรื่องแนะนำตอนนี้'}
          </p>
          <p className={styles.navSearchPanelStateText}>
            {hasSearch
              ? `ลองค้นหาด้วยคำอื่นแทน "${searchQuery}"`
              : 'เมื่อมีเรื่องเด่นในระบบ รายการแนะนำจะปรากฏที่นี่'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.navSearchPanelSection}>
      <div className={styles.navSearchPanelHeader}>{title}</div>
      <div className={styles.navSearchPanelGrid}>
        {stories.map((story) => {
          const coverUrl = story.cover_url || story.cover_wide_url;
          const categoryLabel = resolveSearchPanelCategoryLabel(story);

          return (
            <Link key={`nav-search-${story.id}`} href={`/story/${story.id}`} className={styles.navSearchPanelCard}>
              <div className={styles.navSearchPanelCoverWrap}>
                {coverUrl ? (
                  <Image
                    src={coverUrl}
                    alt={story.title}
                    className={styles.navSearchPanelCover}
                    fill
                    sizes="(max-width: 1079px) 72px, 88px"
                  />
                ) : (
                  <div className={styles.navSearchPanelCoverFallback}>
                    {story.title.slice(0, 2)}
                  </div>
                )}
              </div>

              <div className={styles.navSearchPanelBody}>
                <div className={styles.navSearchPanelTags}>
                  <span className={styles.navSearchPanelTag}>{categoryLabel}</span>
                  {story.path_mode === 'branching' && (
                    <span className={styles.navSearchPanelInteractive}>Interactive</span>
                  )}
                </div>
                <h3 className={styles.navSearchPanelTitle}>{story.title}</h3>
                <p className={styles.navSearchPanelAuthor}>{story.pen_name}</p>
                <p className={styles.navSearchPanelStatus}>
                  {story.published_chapter_count.toLocaleString('th-TH')} ตอน
                  <span className={styles.navSearchPanelStatusDot} />
                  {resolveSearchPanelCompletionLabel(story)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
