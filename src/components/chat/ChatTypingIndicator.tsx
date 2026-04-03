'use client';

import { User } from 'lucide-react';
import styles from './chat-bubble.module.css';

type ChatTypingIndicatorProps = {
  sender: 'character' | 'player' | 'system';
  character?: {
    name: string;
    avatarUrl: string | null;
  } | null;
};

export function ChatTypingIndicator({ sender, character }: ChatTypingIndicatorProps) {
  const isPlayer = sender === 'player';
  const isSystem = sender === 'system';

  const renderAvatar = () => {
    if (!character) return null;
    if (character.avatarUrl) {
      return (
        <img
          src={character.avatarUrl}
          alt={character.name}
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
      <div className={styles.systemMessage} aria-live="polite">
        <span className={styles.typingSystemBubble}>
          <span className={styles.typingDots}>
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.messageWrapper} ${isPlayer ? styles.playerWrapper : styles.characterWrapper}`}
      aria-live="polite"
    >
      {!isPlayer && character && (
        renderAvatar()
      )}

      <div className={`${styles.bubbleContainer} ${isPlayer ? styles.playerContainer : styles.characterContainer}`}>
        {character && (
          <div className={styles.characterName} style={isPlayer ? { textAlign: 'right' } : undefined}>
            {character.name}
          </div>
        )}
        <div className={`${styles.bubble} ${isPlayer ? styles.playerBubble : styles.characterBubble} ${styles.typingBubble}`}>
          <span className={styles.typingDots}>
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
          </span>
        </div>
      </div>

      {isPlayer && character && (
        renderAvatar()
      )}
    </div>
  );
}
