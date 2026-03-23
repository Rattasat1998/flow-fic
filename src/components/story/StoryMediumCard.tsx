'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { CoverTiltFrame } from './CoverTiltFrame';
import styles from './StoryMediumCard.module.css';

type StoryMediumCardAccent = 'default' | 'bookshelf' | 'loves';

type StoryMediumCardProps = {
    href: string;
    coverUrl?: string | null;
    title: string;
    author: string;
    tags?: string[];
    footer?: ReactNode;
    isCompleted?: boolean;
    completedLabel?: string;
    onRemove?: () => void;
    removeLabel?: string;
    removeDisabled?: boolean;
    accent?: StoryMediumCardAccent;
    enableTilt?: boolean;
    imageSizes?: string;
    className?: string;
    dataCard?: string;
};

export function StoryMediumCard({
    href,
    coverUrl,
    title,
    author,
    tags = [],
    footer = null,
    isCompleted = false,
    completedLabel = 'จบ',
    onRemove,
    removeLabel = 'นำออกจากรายการ',
    removeDisabled = false,
    accent = 'default',
    enableTilt = false,
    imageSizes = '(max-width: 767px) 46vw, (max-width: 1180px) 24vw, 180px',
    className,
    dataCard,
}: StoryMediumCardProps) {
    const visibleTags = tags.filter(Boolean).slice(0, 2);
    const accentClassName =
        accent === 'bookshelf'
            ? styles.accentBookshelf
            : accent === 'loves'
                ? styles.accentLoves
                : '';

    const cardClassName = [styles.card, accentClassName, className].filter(Boolean).join(' ');
    const coverContent = (
        <>
            {coverUrl ? (
                <Image
                    src={coverUrl}
                    alt={title}
                    className={styles.cover}
                    fill
                    sizes={imageSizes}
                />
            ) : (
                <div className={styles.coverFallback}>{title.slice(0, 2)}</div>
            )}

            {isCompleted && <span className={styles.completedBadge}>{completedLabel}</span>}
        </>
    );

    return (
        <article className={cardClassName} data-gsap-card={dataCard}>
            <Link href={href} className={styles.cardLink}>
                {enableTilt ? (
                    <CoverTiltFrame className={styles.coverWrap}>{coverContent}</CoverTiltFrame>
                ) : (
                    <div className={styles.coverWrap}>{coverContent}</div>
                )}

                <div className={styles.body}>
                    <h3 className={styles.title}>{title}</h3>
                    <p className={styles.author}>{author}</p>
                    {(footer || visibleTags.length > 0) && (
                        <div className={styles.footer}>
                            {footer || (
                                <div className={styles.tagList}>
                                    {visibleTags.map((tag) => (
                                        <span key={tag} className={styles.tag}>
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Link>

            {onRemove && (
                <button
                    type="button"
                    className={styles.removeBtn}
                    aria-label={removeLabel}
                    title={removeLabel}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemove();
                    }}
                    disabled={removeDisabled}
                >
                    <Trash2 size={14} />
                </button>
            )}
        </article>
    );
}
