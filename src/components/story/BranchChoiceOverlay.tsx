'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock } from 'lucide-react';
import styles from './BranchChoiceOverlay.module.css';

export type OverlayChoice = {
  id: string;
  choiceText: string;
  outcomeText: string;
  orderIndex: number;
  toChapterId: string | null;
  toTitle: string;
  toOrderIndex: number;
  isPremium: boolean;
  coinPrice: number;
  canRead: boolean;
  accessSource: string;
};

type BranchChoiceOverlayProps = {
  choices: OverlayChoice[];
  onSelect: (choice: OverlayChoice) => void;
  /** Timer duration in seconds, 0 = no timer */
  timerSeconds?: number;
  /** Current remaining seconds for the active countdown */
  remainingSeconds?: number;
  /** Current countdown progress percentage (100 -> 0) */
  progressPercent?: number;
  /** Prompt text shown above choices */
  promptText?: string;
};

const HOVER_PREVIEW_DELAY_MS = 1800;
const SELECTION_DISMISS_DELAY_MS = 800;

export function BranchChoiceOverlay({
  choices,
  onSelect,
  timerSeconds = 0,
  remainingSeconds = timerSeconds,
  progressPercent = 100,
  promptText = 'เลือกเส้นทางของคุณ',
}: BranchChoiceOverlayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [previewVisibleId, setPreviewVisibleId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionLockedRef = useRef(false);

  // ── Hover preview ──
  useEffect(() => {
    if (!hoveredId) {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      return;
    }

    const choice = choices.find((c) => c.id === hoveredId);
    const hasOutcome = choice?.outcomeText && choice.outcomeText.trim().length > 0;
    if (!hasOutcome) {
      return;
    }

    hoverTimerRef.current = setTimeout(() => {
      setPreviewVisibleId(hoveredId);
    }, HOVER_PREVIEW_DELAY_MS);

    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, [hoveredId, choices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleSelect = useCallback(
    (choice: OverlayChoice) => {
      if (selectionLockedRef.current) return;
      if (!choice.toChapterId) return;

      selectionLockedRef.current = true;
      setSelectedId(choice.id);

      // Delay to show selection animation before navigating
      exitTimerRef.current = setTimeout(() => {
        setIsExiting(true);
        // Let exit animation play, then fire callback
        setTimeout(() => {
          onSelect(choice);
        }, 400);
      }, SELECTION_DISMISS_DELAY_MS);
    },
    [onSelect]
  );

  const safeProgressPercent = Math.max(0, Math.min(100, progressPercent));
  const safeRemainingSeconds = Math.max(0, Math.ceil(remainingSeconds));
  const isDangerZone = timerSeconds > 0 && safeProgressPercent < 25;

  return (
    <div className={`${styles.overlay} ${isExiting ? styles.overlayExit : ''}`}>
      <div className={styles.content}>
        {/* Prompt */}
        <div className={styles.prompt}>
          <span className={styles.promptIcon}>⚡</span>
          <h2 className={styles.promptTitle}>{promptText}</h2>
          <p className={styles.promptSub}>
            {choices.length} ทางเลือก — ชะตาของคุณขึ้นอยู่กับตรงนี้
          </p>
        </div>

        {/* Timer */}
        {timerSeconds > 0 && !selectedId && (
          <div
            className={`${styles.timerWrapper} ${isDangerZone ? styles.timerDanger : ''}`}
          >
            <span className={styles.timerLabel}>
              {isDangerZone ? `⚠ เหลือ ${safeRemainingSeconds} วิ` : `เวลาจำกัด • เหลือ ${safeRemainingSeconds} วิ`}
            </span>
            <div className={styles.timerTrack}>
              <div
                className={styles.timerFill}
                style={{ width: `${safeProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Choice List */}
        <div className={styles.choiceList}>
          {choices.map((choice, index) => {
            const isSelected = selectedId === choice.id;
            const isDismissed = selectedId !== null && selectedId !== choice.id;
            const isLocked = !choice.canRead;
            const isUnavailable = !choice.toChapterId;

            const cardClasses = [
              styles.choiceCard,
              isSelected ? styles.choiceCardSelected : '',
              isDismissed ? styles.choiceCardDismissed : '',
              isUnavailable ? styles.choiceCardDisabled : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={choice.id}
                type="button"
                className={cardClasses}
                onClick={() => {
                  if (selectedId || isUnavailable) return;
                  handleSelect(choice);
                }}
                onMouseEnter={() => {
                  setHoveredId(choice.id);
                  setPreviewVisibleId(null);
                }}
                onMouseLeave={() => {
                  setHoveredId(null);
                  setPreviewVisibleId(null);
                }}
                disabled={!!selectedId || isUnavailable}
                style={{
                  animationDelay: `${0.4 + index * 0.2}s`,
                }}
              >
                <span className={styles.choiceIndex}>{index + 1}</span>
                <span className={styles.choiceText}>{choice.choiceText}</span>
                {isLocked && (
                  <span className={styles.choiceMeta}>
                    <span className={styles.choiceLockBadge}>
                      <Lock size={12} />
                      {choice.coinPrice > 0
                        ? `${choice.coinPrice.toLocaleString('th-TH')} เหรียญ`
                        : 'ต้องปลดล็อก'}
                    </span>
                  </span>
                )}

                {/* Consequence preview (shown after hover delay) */}
                {previewVisibleId === choice.id &&
                  choice.outcomeText &&
                  choice.outcomeText.trim().length > 0 && (
                    <div className={styles.consequencePreview}>
                      💭 {choice.outcomeText}
                    </div>
                  )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
