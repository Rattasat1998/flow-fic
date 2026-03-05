'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import styles from './CompactStoryCard.module.css';

type CompactStoryCardProps = {
    href: string;
    coverUrl: string;
    title: string;
    author: string;
    tags: string[];
    isCompleted: boolean;
    onRemove?: () => void;
    removeLabel?: string;
    removeDisabled?: boolean;
};

export function CompactStoryCard({
    href,
    coverUrl,
    title,
    author,
    tags,
    isCompleted,
    onRemove,
    removeLabel = 'นำออกจากรายการ',
    removeDisabled = false,
}: CompactStoryCardProps) {
    const visibleTags = tags.filter(Boolean).slice(0, 2);

    return (
        <article className={styles.card}>
            <Link href={href} className={styles.cardLink}>
                <div className={styles.coverWrap}>
                    {coverUrl ? (
                        <img src={coverUrl} alt={title} className={styles.cover} />
                    ) : (
                        <div className={styles.coverPlaceholder}>No Cover</div>
                    )}

                    {isCompleted && <span className={styles.completedBadge}>จบ</span>}
                </div>

                <div className={styles.info}>
                    <h3 className={styles.title}>{title}</h3>
                    <p className={styles.author}>{author}</p>
                    {visibleTags.length > 0 && (
                        <div className={styles.tags}>
                            {visibleTags.map((tag) => (
                                <span key={tag} className={styles.tag}>
                                    {tag}
                                </span>
                            ))}
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
