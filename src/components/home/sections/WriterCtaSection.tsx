import Link from 'next/link';
import { PenTool } from 'lucide-react';
import type { RefObject } from 'react';
import styles from '@/app/home.module.css';

type WriterCtaSectionProps = {
  sectionRef: RefObject<HTMLElement | null>;
  user: { id: string } | null;
  onOpenLogin: () => void;
};

export function WriterCtaSection({ sectionRef, user, onOpenLogin }: WriterCtaSectionProps) {
  return (
    <section className={styles.writerCtaSection} ref={sectionRef} data-gsap-section="writer-cta">
      <div className={styles.writerCtaCard}>
        <h2 className={styles.writerCtaTitle}>
          ทุกปริศนาต้องมี
          <br />
          <span className={styles.writerCtaAccent}>นักเขียนผู้วางเกม</span>
        </h2>
        <p className={styles.writerCtaText}>
          ถ้าคุณมีเรื่องลึกลับในหัว ถึงเวลาปล่อยให้ผู้อ่านทั่วแพลตฟอร์มได้ติดตามไปกับมัน
        </p>
        {user ? (
          <Link href="/story/create" className={styles.writerCtaButton}>
            เริ่มสร้างนิยายของคุณ
            <PenTool size={16} />
          </Link>
        ) : (
          <button type="button" className={styles.writerCtaButton} onClick={onOpenLogin}>
            เข้าสู่ระบบเพื่อเริ่มเขียน
            <PenTool size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
