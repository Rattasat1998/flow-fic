import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Heart, Inbox, List, Star } from 'lucide-react';
import type { RefObject } from 'react';
import { CoverTiltFrame } from '@/components/story/CoverTiltFrame';
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
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <h2 className={styles.sectionHeadline}>กำลังมาแรง</h2>
          <p className={styles.sectionSubhead}>เรื่องที่ผู้อ่านกำลังพูดถึงและเปิดอ่านมากที่สุดในตอนนี้</p>
        </div>
        <Link href="/trending" className={styles.sectionActionLink} target="_blank">
          ดูอันดับทั้งหมด
          <ArrowRight size={16} />
        </Link>
      </div>

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
          {stories.slice(0, 10).map((story, index) => {
            const isInteractiveStory = story.path_mode === 'branching';
            const likes = story.total_like_count ?? 0;
            const views = Math.max(1, story.total_view_count ?? 0);
            const score = Math.min(5, 4 + (likes / views) * 12).toFixed(1);

            return (
              <Link
                key={`trending-${story.id}`}
                href={`/story/${story.id}`}
                className={styles.trendingCard}
                data-gsap-card="trending"
              >
                <CoverTiltFrame className={styles.trendingCoverWrap}>
                  {story.cover_url || story.cover_wide_url ? (
                    <Image
                      src={story.cover_url || story.cover_wide_url || ''}
                      alt={story.title}
                      className={styles.trendingCover}
                      fill
                      sizes="(max-width: 767px) 47vw, (max-width: 1180px) 31vw, 320px"
                    />
                  ) : (
                    <div className={styles.trendingCoverFallback}>{story.title.slice(0, 2)}</div>
                  )}

                  {index < 4 && <span className={styles.trendingRankBadge}>#{index + 1}</span>}
                </CoverTiltFrame>

                <div className={styles.trendingBody}>
                  <h3 className={styles.trendingTitle}>{story.title}</h3>
                  <p className={styles.trendingAuthor}>{story.pen_name}</p>
                  <div className={styles.trendingStats}>
                    <span className={styles.trendingScore}>
                      <Star size={12} />
                      {score}
                    </span>
                    <span className={styles.trendingReads}>{(story.total_view_count ?? 0).toLocaleString('th-TH')} อ่าน</span>
                  </div>
                  <div className={styles.trendingMetaRow}>
                    {isInteractiveStory ? (
                      <span className={styles.posterModeChip}>Interactive</span>
                    ) : (
                      <span className={styles.posterMetric}>
                        <List size={12} className={styles.posterMetricIcon} />
                        {story.published_chapter_count.toLocaleString('th-TH')} ตอน
                      </span>
                    )}
                    <span className={styles.posterMetric}>
                      <Heart size={12} className={styles.posterMetricIcon} />
                      {(story.total_like_count ?? 0).toLocaleString('th-TH')}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
