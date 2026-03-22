'use client';

import { ChevronRight } from 'lucide-react';
import styles from './chat-action-bar.module.css';

interface ChatActionBarProps {
    onNextLine: () => void;
    hasMore: boolean;
    secondaryActions?: React.ReactNode;
}

export function ChatActionBar({ onNextLine, hasMore, secondaryActions }: ChatActionBarProps) {
    if (!hasMore) return null;

    return (
        <div className={styles.container}>
            {secondaryActions && (
                <div className={styles.secondaryActions}>
                    {secondaryActions}
                </div>
            )}
            <div className={styles.inputArea}>
                <button
                    className={styles.nextBtn}
                    onClick={onNextLine}
                >
                    <>แตะเพื่ออ่านต่อ <ChevronRight size={20} /></>
                </button>
            </div>
        </div>
    );
}
