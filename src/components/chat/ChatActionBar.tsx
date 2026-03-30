'use client';

import { ChevronRight, MoreHorizontal } from 'lucide-react';
import styles from './chat-action-bar.module.css';

interface ChatActionBarProps {
    onNextLine: () => void;
    hasMore: boolean;
    showMenuButton?: boolean;
    onOpenMenu?: () => void;
}

export function ChatActionBar({
    onNextLine,
    hasMore,
    showMenuButton = false,
    onOpenMenu,
}: ChatActionBarProps) {
    if (!hasMore) return null;

    return (
        <div className={styles.container}>
            <div className={styles.inputArea}>
                <button
                    className={styles.nextBtn}
                    onClick={onNextLine}
                >
                    <>แตะเพื่ออ่านต่อ <ChevronRight size={20} /></>
                </button>
                {showMenuButton && (
                    <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={onOpenMenu}
                        aria-label="เปิดเมนูการอ่าน"
                    >
                        <MoreHorizontal size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}
