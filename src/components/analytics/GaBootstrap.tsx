'use client';

import { useEffect, useRef } from 'react';
import { useCookieConsent } from '@/contexts/CookieConsentContext';
import { setGaTrackingEnabled } from '@/lib/cookie-consent';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type GaBootstrapProps = {
  measurementId: string;
};

function ensureGaScript(measurementId: string) {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector(`script[data-ga-id="${measurementId}"]`);
  if (existing) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.dataset.gaId = measurementId;
  document.head.appendChild(script);
}

function initializeGtag(measurementId: string) {
  if (typeof window === 'undefined') return;
  if (!window.dataLayer) window.dataLayer = [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  }

  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
  window.gtag('event', 'page_view', {
    send_to: measurementId,
    page_path: window.location.pathname + window.location.search,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function GaBootstrap({ measurementId }: GaBootstrapProps) {
  const { canTrackAnalytics, isLoaded } = useCookieConsent();
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!measurementId || !isLoaded) return;

    if (!canTrackAnalytics) {
      setGaTrackingEnabled(false);
      hasInitializedRef.current = false;
      return;
    }

    setGaTrackingEnabled(true);
    ensureGaScript(measurementId);

    if (hasInitializedRef.current) {
      return;
    }

    initializeGtag(measurementId);
    hasInitializedRef.current = true;
  }, [canTrackAnalytics, isLoaded, measurementId]);

  return null;
}
