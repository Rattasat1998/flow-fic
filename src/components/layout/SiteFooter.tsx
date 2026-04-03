'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCookieConsent } from '@/contexts/CookieConsentContext';
import { BrandLogo } from '@/components/brand/BrandLogo';

import styles from './SiteFooter.module.css';

const FOOTER_LINKS = [
  { href: '/about', label: 'เกี่ยวกับเรา' },
  { href: '/terms', label: 'ข้อกำหนดการใช้งาน' },
  { href: '/privacy', label: 'นโยบายความเป็นส่วนตัว' },
  { href: '/help', label: 'ศูนย์ช่วยเหลือ' },
] as const;

export function SiteFooter() {
  const { openPreferences } = useCookieConsent();
  const pathname = usePathname();
  const pathSegments = (typeof pathname === 'string' ? pathname : '')
    .split('/')
    .filter(Boolean);
  const isStoryDetailRoute = pathSegments.length === 2
    && pathSegments[0] === 'story'
    && pathSegments[1] !== 'create'
    && pathSegments[1] !== 'manage';
  const isStoryReaderRoute = pathSegments.length === 3
    && pathSegments[0] === 'story'
    && pathSegments[2] === 'read';
  const isStoryCreateRoute = pathSegments.length >= 2
    && pathSegments[0] === 'story'
    && pathSegments[1] === 'create';
  const isStoryManageRoute = pathSegments.length >= 2
    && pathSegments[0] === 'story'
    && pathSegments[1] === 'manage';

  if (isStoryDetailRoute || isStoryReaderRoute || isStoryCreateRoute || isStoryManageRoute) {
    return null;
  }

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <BrandLogo href="/" variant="lockup" tone="dark" size="sm" className={styles.brandName} />
          <p className={styles.copy}>© {new Date().getFullYear()} FlowFic Anthology. สงวนลิขสิทธิ์ทั้งหมด</p>
        </div>

        <div className={styles.links}>
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <button type="button" onClick={openPreferences} className={styles.cookieButton}>
            ตั้งค่าคุกกี้
          </button>
        </div>
      </div>
    </footer>
  );
}
