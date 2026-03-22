import Link from 'next/link';

import styles from './SiteFooter.module.css';

const FOOTER_LINKS = [
  { href: '/legal-contact-and-versioning', label: 'เกี่ยวกับเรา' },
  { href: '/terms', label: 'ข้อกำหนดการใช้งาน' },
  { href: '/privacy', label: 'นโยบายความเป็นส่วนตัว' },
  { href: '/billing-policies', label: 'ศูนย์ช่วยเหลือ' },
] as const;

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.brandName}>FlowFic</span>
          <p className={styles.copy}>© {new Date().getFullYear()} FlowFic Anthology. สงวนลิขสิทธิ์ทั้งหมด</p>
        </div>

        <div className={styles.links}>
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
