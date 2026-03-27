import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { RefObject } from 'react';
import type { DiscoveryStory } from '@/types/discovery';
import styles from '@/app/home.module.css';

type HeroSectionProps = {
  sectionRef: RefObject<HTMLElement | null>;
  stories: DiscoveryStory[];
  heroStory: DiscoveryStory | null;
  heroInfoPills: string[];
  heroIndex: number;
  onDotClick: (index: number) => void;
};

export function HeroSection({
  sectionRef,
  stories,
  heroStory,
  heroInfoPills,
  heroIndex,
  onDotClick,
}: HeroSectionProps) {
  return (
    <section className={styles.heroSection} ref={sectionRef} data-gsap-section="hero">
      {heroStory ? (
        <div className={styles.heroFrame} data-gsap="hero-frame">
          {heroStory.cover_wide_url || heroStory.cover_url ? (
            <Image
              src={heroStory.cover_wide_url || heroStory.cover_url || ''}
              alt={heroStory.title}
              className={styles.heroBackdrop}
              fill
              priority={heroIndex === 0}
              sizes="100vw"
              data-gsap-hero-backdrop
            />
          ) : (
            <div className={styles.heroBackdropFallback} data-gsap-hero-backdrop>
              เรื่องเด่นประจำวัน
            </div>
          )}

          <div className={styles.heroOverlay} />

          <div className={styles.heroContent} data-gsap-hero-content>
            <span className={styles.heroBadge} data-gsap-intro>
              เรื่องเด่นวันนี้
            </span>
            <h1 className={styles.heroStoryTitle} data-gsap-intro>
              {heroStory.title}
            </h1>
            <p className={styles.heroStoryPen} data-gsap-intro>
              โดย {heroStory.pen_name}
            </p>
            {heroStory.synopsis && (
              <p className={styles.heroStorySynopsis} data-gsap-intro>
                {heroStory.synopsis}
              </p>
            )}
            {heroInfoPills.length > 0 && (
              <div className={styles.heroInfoPills} data-gsap-intro>
                {heroInfoPills.map((pill, index) => (
                  <span key={`${pill}-${index}`} className={styles.heroInfoPill}>
                    {pill}
                  </span>
                ))}
              </div>
            )}
            <div className={styles.heroActionRow} data-gsap-intro>
              <Link href={`/story/${heroStory.id}`} className={styles.heroCtaButton}>
                เริ่มอ่านเรื่องนี้
                <ArrowRight size={16} />
              </Link>
              <div className={styles.heroAuthorMeta}>
                <span>ผู้เขียน</span>
                <strong>{heroStory.pen_name}</strong>
              </div>
            </div>
          </div>

          {stories.length > 1 && (
            <div className={styles.heroDots}>
              {stories.map((story, index) => (
                <button
                  key={story.id}
                  type="button"
                  aria-label={`ดูเรื่องเด่นลำดับที่ ${index + 1}`}
                  className={`${styles.heroDot} ${index === heroIndex ? styles.activeHeroDot : ''}`}
                  onClick={() => onDotClick(index)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.heroEmpty}>กำลังโหลดเรื่องแนะนำ...</div>
      )}
    </section>
  );
}
