import Link from 'next/link';
import { AlertCircle, ArrowRight, Eye, Ghost, Hash, Heart, Inbox } from 'lucide-react';
import type { RefObject } from 'react';
import { StoryMediumCard } from '@/components/story/StoryMediumCard';
import type { DiscoveryStory } from '@/types/discovery';
import styles from '@/app/home.module.css';

type TrendingSectionProps = {
  sectionRef: RefObject<HTMLElement | null>;
  stories: DiscoveryStory[];
  loading: boolean;
  error: string | null;
};

export function TrendingSection({ sectionRef, stories, loading, error }: TrendingSectionProps) {
  return (
    <section className={styles.trendingSection} ref={sectionRef} data-gsap-section="trending">


      {loading ? (
        <div className={styles.trendingGrid}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`trending-skeleton-${index}`} className={styles.storySkeleton} />
          ))}
        </div>
      ) : error ? (
        <div className={`${styles.railStateCard} ${styles.railStateError}`}>
          <AlertCircle size={18} />
          <div>
            <p className={styles.railStateTitle}>โหลดข้อมูลไม่สำเร็จ</p>
            <p className={styles.railStateText}>{error}</p>
          </div>
        </div>
      ) : stories.length === 0 ? (
        <div className={styles.railStateCard}>
          <Inbox size={18} />
          <div>
            <p className={styles.railStateTitle}>ยังไม่มีข้อมูล</p>
            <p className={styles.railStateText}>ยังไม่มีเรื่องกำลังมาแรงที่ตรงกับคำค้นปัจจุบัน</p>
          </div>
        </div>
      ) : (
        <div className={styles.trendingGrid}>
          {stories.slice(0, 10).map((story) => {
            const isNewStory = (story.published_chapter_count ?? 0) <= 16 && (story.total_view_count ?? 0) <= 350_000;

            return (
              <StoryMediumCard
                key={`trending-${story.id}`}
                href={`/story/${story.id}`}
                coverUrl={story.cover_url || story.cover_wide_url}
                title={story.title}
                author={story.pen_name}
                variant="case"
                className={styles.trendingCaseCard}
                dataCard="trending"
                enableTilt
                badgeLabel={isNewStory ? 'Case New' : null}
                imageSizes="(max-width: 767px) 47vw, (max-width: 1180px) 31vw, 320px"
                footer={(
                  <div className={styles.mainCategoryShelfMetaRow}>
                    <div className={styles.mainCategoryShelfMetaStats}>
                      <span className={styles.posterMetric}>
                        <Hash size={11} className={styles.posterMetricIcon} />
                        {story.published_chapter_count.toLocaleString('th-TH')}
                      </span>
                      <span className={styles.posterMetric}>
                        <Eye size={11} className={styles.posterMetricIcon} />
                        {(story.total_view_count ?? 0).toLocaleString('th-TH')}
                      </span>
                    </div>
                    <Heart size={12} className={`${styles.posterMetricIcon} ${styles.mainCategoryShelfHeartIcon}`} />
                  </div>
                )}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
