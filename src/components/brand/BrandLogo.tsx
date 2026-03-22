import Link from 'next/link';
import type { CSSProperties } from 'react';

import styles from './BrandLogo.module.css';

type BrandLogoSize = 'sm' | 'md' | 'lg' | number;

type BrandLogoProps = {
  className?: string;
  href?: string;
  size?: BrandLogoSize;
  variant?: 'wordmark' | 'mark';
};

const resolveSize = (size: BrandLogoSize): number => {
  if (typeof size === 'number') return size;
  if (size === 'sm') return 24;
  if (size === 'lg') return 34;
  return 28;
};

const buildClassName = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(' ');

export function BrandLogo({
  className,
  href,
  size = 'md',
  variant = 'wordmark',
}: BrandLogoProps) {
  const resolvedSize = resolveSize(size);
  const style = {
    '--brand-logo-size': `${resolvedSize}px`,
  } as CSSProperties;

  const content = variant === 'mark'
    ? <span className={styles.monogram}>FF</span>
    : <span className={styles.wordmark}>FlowFic</span>;

  if (href) {
    return (
      <Link
        href={href}
        aria-label="FlowFic"
        className={buildClassName(styles.root, styles.link, className)}
        style={style}
      >
        {content}
      </Link>
    );
  }

  return (
    <span className={buildClassName(styles.root, className)} style={style}>
      {content}
    </span>
  );
}
