import Link from 'next/link';
import type { CSSProperties, MouseEventHandler } from 'react';

import styles from './BrandLogo.module.css';

type BrandLogoSize = 'sm' | 'md' | 'lg' | number;
type BrandLogoVariant = 'wordmark' | 'mark' | 'lockup';
type BrandLogoTone = 'light' | 'dark' | 'mono';

type BrandLogoProps = {
  className?: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  size?: BrandLogoSize;
  tone?: BrandLogoTone;
  variant?: BrandLogoVariant;
};

const resolveSize = (size: BrandLogoSize): number => {
  if (typeof size === 'number') return size;
  if (size === 'sm') return 24;
  if (size === 'lg') return 34;
  return 28;
};

const buildClassName = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(' ');

const TONE_CLASS_MAP: Record<BrandLogoTone, string> = {
  light: styles.toneLight,
  dark: styles.toneDark,
  mono: styles.toneMono,
};

const VARIANT_CLASS_MAP: Record<BrandLogoVariant, string> = {
  wordmark: styles.variantWordmark,
  mark: styles.variantMark,
  lockup: styles.variantLockup,
};

function BrandMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect className={styles.markBadge} x="4" y="4" width="56" height="56" rx="14" />
      <path
        className={styles.markGlyph}
        d="M18 16h6v32h-6zM18 16h18v6H18zM18 29h14v6H18zM38 16h6v32h-6zM38 16h12v6H38zM38 29h10v6H38z"
      />
    </svg>
  );
}

export function BrandLogo({
  className,
  href,
  onClick,
  size = 'md',
  tone = 'light',
  variant = 'wordmark',
}: BrandLogoProps) {
  const resolvedSize = resolveSize(size);
  const style = {
    '--brand-logo-size': `${resolvedSize}px`,
  } as CSSProperties;

  const content = (
    <>
      {(variant === 'mark' || variant === 'lockup') && <BrandMark />}
      {(variant === 'wordmark' || variant === 'lockup') && <span className={styles.wordmark}>FlowFic</span>}
    </>
  );

  const rootClassName = buildClassName(
    styles.root,
    TONE_CLASS_MAP[tone],
    VARIANT_CLASS_MAP[variant],
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label="FlowFic"
        onClick={onClick}
        className={buildClassName(rootClassName, styles.link)}
        style={style}
      >
        {content}
      </Link>
    );
  }

  return (
    <span className={rootClassName} style={style}>
      {content}
    </span>
  );
}
