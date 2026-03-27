import Link from 'next/link';
import { ChevronRight, Inbox } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import type { DiscoveryStory } from '@/types/discovery';
import styles from '@/app/home.module.css';

export type MainCategoryShelf = {
  id: string;
  label: string;
  stories: DiscoveryStory[];
};

export type SelectedGridCategory = {
  id: string;
  label: string;
  stories: DiscoveryStory[];
};

type CategoryShelvesSectionProps = {
  sectionRef: RefObject<HTMLElement | null>;
  shelves: MainCategoryShelf[];
  isGridMode: boolean;
  selectedCategory: SelectedGridCategory | null;
  onSetMainCategoryRailRef: (mainCategoryId: string, node: HTMLDivElement | null) => void;
  onScrollMainCategoryRail: (mainCategoryId: string) => void;
  renderHomeMediumCard: (
    story: DiscoveryStory,
    className: string,
    dataCard: string,
    imageSizes: string
  ) => ReactNode;
};

export function CategoryShelvesSection({
  sectionRef,
  shelves,
  isGridMode,
  selectedCategory,
  onSetMainCategoryRailRef,
  onScrollMainCategoryRail,
  renderHomeMediumCard,
}: CategoryShelvesSectionProps) {
  return (
    <section className={styles.mainCategoryMapSection} ref={sectionRef} data-gsap-section="main-category-map">
      {isGridMode ? (
        selectedCategory ? (
          <div className={styles.shelfGridModeSection} data-gsap-grid-mode>
            <div className={styles.shelfGridModeHeader}>
              <h3 className={styles.shelfGridModeTitle}>{selectedCategory.label}</h3>
            </div>
            {selectedCategory.stories.length === 0 ? (
              <div className={styles.railStateCard}>
                <Inbox size={18} />
                <div>
                  <p className={styles.railStateTitle}>ยังไม่มีเรื่องในหมวดนี้</p>
                  <p className={styles.railStateText}>หมวดที่เลือกยังไม่มีเรื่องที่ตรงกับคำค้นปัจจุบัน</p>
                </div>
              </div>
            ) : (
              <div className={styles.shelfGrid}>
                {selectedCategory.stories.map((story) =>
                  renderHomeMediumCard(
                    story,
                    `${styles.mainCategoryShelfCard} ${styles.shelfGridCard}`,
                    'grid-category',
                    '(max-width: 767px) 46vw, (max-width: 1180px) 23vw, 16vw'
                  )
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.railStateCard}>
            <Inbox size={18} />
            <div>
              <p className={styles.railStateTitle}>ไม่พบหมวดที่เลือก</p>
              <p className={styles.railStateText}>กรุณาตรวจสอบลิงก์ แล้วลองเปิดใหม่อีกครั้ง</p>
            </div>
          </div>
        )
      ) : shelves.length === 0 ? (
        <div className={styles.railStateCard}>
          <Inbox size={18} />
          <div>
            <p className={styles.railStateTitle}>ยังไม่มีเรื่องในหมวดหลักตอนนี้</p>
            <p className={styles.railStateText}>ลองค้นหาด้วยคำอื่น แล้วระบบจะแสดงรายการเรื่องที่เกี่ยวข้องให้ทันที</p>
          </div>
        </div>
      ) : (
        <div className={styles.mainCategoryGroups}>
          {shelves.map((group) => (
            <section key={`category-group-${group.id}`} className={styles.mainCategoryGroup} data-gsap-shelf-group>
              <header className={styles.mainCategoryShelfRowHeader}>
                <h3 className={styles.mainCategoryGroupTitle}>{group.label}</h3>
                <Link
                  href={`/category/${encodeURIComponent(group.id)}`}
                  className={styles.mainCategoryShelfViewAll}
                  target="_blank"
                  rel="noreferrer"
                >
                  ดูทั้งหมด
                </Link>
              </header>

              <div className={styles.mainCategoryShelfRailWrap}>
                <div ref={(node) => onSetMainCategoryRailRef(group.id, node)} className={styles.mainCategoryShelfRail}>
                  {group.stories.map((story) =>
                    renderHomeMediumCard(
                      story,
                      styles.mainCategoryShelfCard,
                      'main-category',
                      '(max-width: 767px) 48vw, (max-width: 1180px) 24vw, 16vw'
                    )
                  )}
                </div>

                <button
                  type="button"
                  className={styles.mainCategoryShelfArrowButton}
                  onClick={() => onScrollMainCategoryRail(group.id)}
                  aria-label={`เลื่อนไปขวาในหมวด ${group.label}`}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
