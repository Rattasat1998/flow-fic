import Image from 'next/image';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import type { RefObject } from 'react';
import { CoverTiltFrame } from '@/components/story/CoverTiltFrame';
import type { DiscoveryStory } from '@/types/discovery';
import styles from '@/app/home.module.css';

type EditorPicksSectionProps = {
  sectionRef: RefObject<HTMLElement | null>;
  featuredStory: DiscoveryStory | null;
  sideStories: DiscoveryStory[];
};

export function EditorPicksSection({ sectionRef, featuredStory, sideStories }: EditorPicksSectionProps) {
  return (
    <section className={styles.editorSection} ref={sectionRef} data-gsap-section="editor">
      <h2 className={styles.editorSectionTitle}>คัดพิเศษจากบรรณาธิการ</h2>
      {featuredStory ? (
        <div className={styles.editorGrid}>
          <Link href={`/story/${featuredStory.id}`} className={styles.editorFeaturedCard} data-gsap-card="editor">
            {featuredStory.cover_wide_url || featuredStory.cover_url ? (
              <Image
                src={featuredStory.cover_wide_url || featuredStory.cover_url || ''}
                alt={featuredStory.title}
                className={styles.editorFeaturedImage}
                fill
                sizes="(max-width: 1023px) 100vw, 58vw"
              />
            ) : (
              <div className={styles.editorFeaturedFallback}>{featuredStory.title}</div>
            )}
            <div className={styles.editorFeaturedOverlay}>
              <span className={styles.editorFeaturedBadge}>เรื่องคัดพิเศษ</span>
              <h3 className={styles.editorFeaturedTitle}>{featuredStory.title}</h3>
              <p className={styles.editorFeaturedSummary}>
                {featuredStory.synopsis || 'เรื่องเด่นที่บรรณาธิการอยากแนะนำให้คุณเปิดอ่านทันที'}
              </p>
            </div>
          </Link>

          <div className={styles.editorSideList}>
            {sideStories.map((story) => (
              <Link key={`editor-side-${story.id}`} href={`/story/${story.id}`} className={styles.editorSideCard} data-gsap-card="editor">
                <CoverTiltFrame className={styles.editorSideCoverWrap}>
                  {story.cover_url || story.cover_wide_url ? (
                    <Image
                      src={story.cover_url || story.cover_wide_url || ''}
                      alt={story.title}
                      className={styles.editorSideCover}
                      fill
                      sizes="220px"
                    />
                  ) : (
                    <div className={styles.editorSideFallback}>{story.title.slice(0, 2)}</div>
                  )}
                </CoverTiltFrame>
                <div className={styles.editorSideBody}>
                  <h4 className={styles.editorSideTitle}>{story.title}</h4>
                  <p className={styles.editorSideDesc}>{story.synopsis || `${story.pen_name} · เรื่องที่ไม่อยากให้พลาด`}</p>
                  <span className={styles.editorSideLink}>อ่านรีวิวเรื่องนี้</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.railStateCard}>
          <Inbox size={18} />
          <div>
            <p className={styles.railStateTitle}>ยังไม่มีเรื่องแนะนำ</p>
            <p className={styles.railStateText}>กำลังรวบรวมเรื่องเด่นสำหรับบล็อกคัดพิเศษจากบรรณาธิการ</p>
          </div>
        </div>
      )}
    </section>
  );
}
