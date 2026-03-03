'use client';

import { ChevronRight } from 'lucide-react';
import styles from './chat-action-bar.module.css';

interface ChatActionBarProps {
    onNextLine: () => void;
    hasMore: boolean;
}

export function ChatActionBar({ onNextLine, hasMore }: ChatActionBarProps) {
    return (
        <div className={styles.container}>
            <div className={styles.inputArea}>
                <button
                    className={styles.nextBtn}
                    onClick={onNextLine}
                    disabled={!hasMore}
                >
                    {hasMore ? (
                        <>แตะเพื่ออ่านต่อ <ChevronRight size={20} /></>
                    ) : (
                        'จบตอน'
                    )}
                </button>
            </div>
        </div>
    );
}
