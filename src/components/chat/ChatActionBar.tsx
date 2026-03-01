'use client';

import { Send, Sparkles, ChevronRight } from 'lucide-react';
import styles from './chat-action-bar.module.css';

interface ChatActionBarProps {
    onNextLine: () => void;
    onSendPlayerMessage: (text: string) => void;
    isAiMode: boolean;
    toggleAiMode: () => void;
}

export function ChatActionBar({ onNextLine, onSendPlayerMessage, isAiMode, toggleAiMode }: ChatActionBarProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
            onSendPlayerMessage(e.currentTarget.value);
            e.currentTarget.value = '';
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.modeToggle}>
                <button
                    className={`${styles.toggleBtn} ${!isAiMode ? styles.active : ''}`}
                    onClick={toggleAiMode}
                >
                    Story Mode
                </button>
                <button
                    className={`${styles.toggleBtn} ${isAiMode ? styles.activeAi : ''}`}
                    onClick={toggleAiMode}
                >
                    <Sparkles size={14} className={styles.icon} /> AI Mode
                </button>
            </div>

            <div className={styles.inputArea}>
                {isAiMode ? (
                    <div className={styles.inputWrapper}>
                        <input
                            type="text"
                            placeholder="พิมพ์ตอบโต้กับตัวละคร..."
                            className={styles.input}
                            onKeyDown={handleKeyDown}
                        />
                        <button className={styles.sendBtn}>
                            <Send size={18} />
                        </button>
                    </div>
                ) : (
                    <button className={styles.nextBtn} onClick={onNextLine}>
                        แตะเพื่ออ่านต่อ <ChevronRight size={20} />
                    </button>
                )}
            </div>
        </div>
    );
}
