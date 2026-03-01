'use client';

import { ChatMessage, Character } from '@/types/chat';
import { motion } from 'framer-motion';
import styles from './chat-bubble.module.css';

interface ChatBubbleProps {
    message: ChatMessage;
    character?: Character;
}

export function ChatBubble({ message, character }: ChatBubbleProps) {
    const isPlayer = message.sender === 'player';
    const isSystem = message.sender === 'system';

    if (isSystem) {
        return (
            <div className={styles.systemMessage}>
                <span>{message.text}</span>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className={`${styles.messageWrapper} ${isPlayer ? styles.playerWrapper : styles.characterWrapper}`}
        >
            {!isPlayer && character && (
                <img
                    src={character.avatarUrl}
                    alt={character.name}
                    className={styles.avatar}
                />
            )}

            <div className={`${styles.bubble} ${isPlayer ? styles.playerBubble : styles.characterBubble}`}>
                <div className={styles.text}>{message.text}</div>
                {message.emotion && !isPlayer && (
                    <div className={styles.emotionTag}>{message.emotion}</div>
                )}
            </div>
        </motion.div>
    );
}
