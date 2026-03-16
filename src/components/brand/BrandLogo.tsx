import Link from 'next/link';
import { useId } from 'react';

import styles from './BrandLogo.module.css';

type BrandLogoSize = 'sm' | 'md' | 'lg' | number;

type BrandLogoProps = {
  className?: string;
  href?: string;
  size?: BrandLogoSize;
  variant?: 'wordmark' | 'mark';
  withStudioLabel?: boolean;
};

const resolveHeight = (size: BrandLogoSize): number => {
  if (typeof size === 'number') return size;
  if (size === 'sm') return 24;
  if (size === 'lg') return 34;
  return 28;
};

const buildClassName = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(' ');

function LogoMarkSvg({ height }: { height: number }) {
  const gradientId = useId().replace(/:/g, '');

  return (
    <svg
      aria-hidden="true"
      className={styles.svg}
      viewBox="0 0 44 44"
      width={height}
      height={height}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="14" y1="10" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand-logo-glow)" />
          <stop offset="1" stopColor="var(--brand-logo-accent)" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="38" height="38" rx="13" fill="#fff7ed" />
      <path
        d="M22 9L31.5 13.4V22C31.5 29.6 27.1 34.3 22 36.3C16.9 34.3 12.5 29.6 12.5 22V13.4L22 9Z"
        fill="var(--brand-logo-ink)"
      />
      <path
        d="M22 14.3L27 16.7V21.4C27 25.9 24.5 28.9 22 30.2C19.5 28.9 17 25.9 17 21.4V16.7L22 14.3Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M22 15.8V28.7"
        stroke="var(--brand-logo-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M19.5 21.9C20.7 20.9 21.6 20.4 22 20.4C22.4 20.4 23.3 20.9 24.5 21.9"
        stroke="var(--brand-logo-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WordmarkSvg({ height }: { height: number }) {
  const gradientId = useId().replace(/:/g, '');
  const width = Math.round(height * 5.5);

  return (
    <svg
      aria-hidden="true"
      className={styles.svg}
      viewBox="0 0 242 44"
      width={width}
      height={height}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="14" y1="10" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--brand-logo-glow)" />
          <stop offset="1" stopColor="var(--brand-logo-accent)" />
        </linearGradient>
      </defs>
      <g transform="translate(0 0)">
        <rect x="3" y="3" width="38" height="38" rx="13" fill="#fff7ed" />
        <path
          d="M22 9L31.5 13.4V22C31.5 29.6 27.1 34.3 22 36.3C16.9 34.3 12.5 29.6 12.5 22V13.4L22 9Z"
          fill="var(--brand-logo-ink)"
        />
        <path
        d="M22 14.3L27 16.7V21.4C27 25.9 24.5 28.9 22 30.2C19.5 28.9 17 25.9 17 21.4V16.7L22 14.3Z"
        fill={`url(#${gradientId})`}
      />
        <path
          d="M22 15.8V28.7"
          stroke="var(--brand-logo-ink)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M19.5 21.9C20.7 20.9 21.6 20.4 22 20.4C22.4 20.4 23.3 20.9 24.5 21.9"
          stroke="var(--brand-logo-ink)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
      <text
        x="56"
        y="24"
        fill="var(--brand-logo-ink)"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.03em"
      >
        Flow
      </text>
      <text
        x="112"
        y="24"
        fill="var(--brand-logo-accent)"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.03em"
      >
        Fic
      </text>
      <path d="M56 31.5H150" stroke="var(--brand-logo-accent)" strokeWidth="2.2" strokeLinecap="round" opacity="0.88" />
      <text
        x="56"
        y="39"
        fill="#64748b"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="7.4"
        fontWeight="800"
        letterSpacing="0.28em"
      >
        MYSTERY PATH STORIES
      </text>
    </svg>
  );
}

export function BrandLogo({
  className,
  href,
  size = 'md',
  variant = 'wordmark',
  withStudioLabel = false,
}: BrandLogoProps) {
  const height = resolveHeight(size);
  const content = (
    <>
      {variant === 'mark' ? <LogoMarkSvg height={height} /> : <WordmarkSvg height={height} />}
      {withStudioLabel && <span className={styles.studioLabel}>Studio</span>}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label="FlowFic" className={buildClassName(styles.root, styles.link, className)}>
        {content}
      </Link>
    );
  }

  return (
    <span className={buildClassName(styles.root, className)}>
      {content}
    </span>
  );
}
