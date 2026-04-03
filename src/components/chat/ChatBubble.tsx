'use client';

import { useState } from 'react';
import { ChatMessage, Character } from '@/types/chat';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import styles from './chat-bubble.module.css';

interface ChatBubbleProps {
    message: ChatMessage;
    character?: Character;
}

export function ChatBubble({ message, character }: ChatBubbleProps) {
    const isPlayer = message.sender === 'player';
    const isSystem = message.sender === 'system';
    const isImageMessage = message.type === 'image' && !!message.imageUrl;
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    const renderAvatar = (speaker: Character) => {
        if (speaker.avatarUrl) {
            return (
                <img
                    src={speaker.avatarUrl}
                    alt={speaker.name}
                    className={styles.avatar}
                />
            );
        }

        return (
            <div className={`${styles.avatar} ${styles.avatarPlaceholder}`} aria-hidden="true">
                <User size={16} />
            </div>
        );
    };

    if (isSystem) {
        return (
            <>
                <div className={styles.systemMessage}>
                    {message.type === 'image' && message.imageUrl ? (
                        <button
                            type="button"
                            className={styles.imageWrapper}
                            onClick={() => setLightboxUrl(message.imageUrl!)}
                            aria-label="ดูรูปภาพขนาดใหญ่"
                        >
                            <img src={message.imageUrl} alt="System Image" className={`${styles.systemImage} ${styles.blurredImage}`} />
                            <span className={styles.imageRevealHint}>แตะเพื่อดู</span>
                        </button>
                    ) : (
                        <span>{message.text}</span>
                    )}
                </div>
                {lightboxUrl && (
                    <div className={styles.lightbox} role="dialog" aria-modal="true">
                        <button type="button" className={styles.lightboxImageWrap} onClick={() => setLightboxUrl(null)} aria-label="ปิด">
                            <img src={lightboxUrl} alt="รูปภาพขนาดใหญ่" className={styles.lightboxImage} />
                            <span className={styles.lightboxCloseHint}>แตะเพื่อปิด</span>
                        </button>
                    </div>
                )}
            </>
        );
    }

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className={`${styles.messageWrapper} ${isPlayer ? styles.playerWrapper : styles.characterWrapper}`}
            >
                {!isPlayer && character && (
                    renderAvatar(character)
                )}

                <div
                    className={[
                        styles.bubbleContainer,
                        isPlayer ? styles.playerContainer : styles.characterContainer,
                        isImageMessage ? styles.imageBubbleContainer : '',
                    ].join(' ')}
                >
                    {character && (
                        <div className={styles.characterName} style={isPlayer ? { textAlign: 'right' } : undefined}>{character.name}</div>
                    )}
                    <div
                        className={[
                            styles.bubble,
                            isPlayer ? styles.playerBubble : styles.characterBubble,
                            isImageMessage ? styles.imageBubble : '',
                        ].join(' ')}
                    >
                        {isImageMessage ? (
                            <button
                                type="button"
                                className={styles.imageWrapper}
                                onClick={() => setLightboxUrl(message.imageUrl!)}
                                aria-label="ดูรูปภาพขนาดใหญ่"
                            >
                                <img src={message.imageUrl} alt="Chat Image" className={`${styles.chatImage} ${styles.blurredImage}`} />
                                <span className={styles.imageRevealHint}>แตะเพื่อดู</span>
                            </button>
                        ) : (
                            <div className={styles.text}>{message.text}</div>
                        )}
                        {message.emotion && !isPlayer && (
                            <div className={styles.emotionTag}>{message.emotion}</div>
                        )}
                    </div>
                </div>

                {isPlayer && character && (
                    renderAvatar(character)
                )}
            </motion.div>
            {lightboxUrl && (
                <div className={styles.lightbox} role="dialog" aria-modal="true">
                    <button type="button" className={styles.lightboxImageWrap} onClick={() => setLightboxUrl(null)} aria-label="ปิด">
                        <img src={lightboxUrl} alt="รูปภาพขนาดใหญ่" className={styles.lightboxImage} />
                        <span className={styles.lightboxCloseHint}>แตะเพื่อปิด</span>
                    </button>
                </div>
            )}
        </>
    );
}
