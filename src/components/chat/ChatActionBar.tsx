'use client';

import { ChevronRight } from 'lucide-react';
import styles from './chat-action-bar.module.css';

interface ChatActionBarProps {
    onNextLine: () => void;
    hasMore: boolean;
    onCloseChapter?: () => void;
}

export function ChatActionBar({ onNextLine, hasMore, onCloseChapter }: ChatActionBarProps) {
    return (
        <div className={styles.container}>
            <div className={styles.inputArea}>
                {hasMore ? (
                    <button
                        className={styles.nextBtn}
                        onClick={onNextLine}
                    >
                        <>แตะเพื่ออ่านต่อ <ChevronRight size={20} /></>
                    </button>
                ) : (
                    <button
                        className={styles.nextBtn}
                        onClick={onCloseChapter}
                        disabled={!onCloseChapter}
                    >
                        ปิดตอน
                    </button>
                )}
            </div>
        </div>
    );
}
