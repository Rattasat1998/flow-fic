'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Share2 } from 'lucide-react';

type ShareFeedbackState = 'idle' | 'shared' | 'copied' | 'error';

type ShareButtonProps = {
  title: string;
  text: string;
  urlPath: string;
  idleLabel: string;
  className?: string;
  sharedLabel?: string;
  copiedLabel?: string;
  errorLabel?: string;
};

const FEEDBACK_RESET_MS = 2200;

const isAbortError = (error: unknown): boolean => {
  return error instanceof DOMException && error.name === 'AbortError';
};

const resolveShareUrl = (urlPath: string): string => {
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  return new URL(urlPath, window.location.origin).toString();
};

export function ShareButton({
  title,
  text,
  urlPath,
  idleLabel,
  className,
  sharedLabel = 'แชร์แล้ว',
  copiedLabel = 'คัดลอกลิงก์แล้ว',
  errorLabel = 'แชร์ไม่สำเร็จ',
}: ShareButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [feedbackState, setFeedbackState] = useState<ShareFeedbackState>('idle');

  useEffect(() => {
    if (feedbackState === 'idle') return;

    const timer = window.setTimeout(() => {
      setFeedbackState('idle');
    }, FEEDBACK_RESET_MS);

    return () => window.clearTimeout(timer);
  }, [feedbackState]);

  const label = useMemo(() => {
    if (feedbackState === 'shared') return sharedLabel;
    if (feedbackState === 'copied') return copiedLabel;
    if (feedbackState === 'error') return errorLabel;
    return idleLabel;
  }, [copiedLabel, errorLabel, feedbackState, idleLabel, sharedLabel]);

  const handleShare = async () => {
    const url = resolveShareUrl(urlPath);
    setIsPending(true);

    try {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title, text, url });
          setFeedbackState('shared');
          return;
        } catch (error) {
          if (isAbortError(error)) {
            setFeedbackState('idle');
            return;
          }
        }
      }

      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable');
      }

      await navigator.clipboard.writeText(url);
      setFeedbackState('copied');
    } catch {
      setFeedbackState('error');
    } finally {
      setIsPending(false);
    }
  };

  const Icon = feedbackState === 'error' ? AlertCircle : feedbackState === 'idle' ? Share2 : Check;

  return (
    <button
      type="button"
      className={className}
      onClick={handleShare}
      disabled={isPending}
      aria-live="polite"
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}
