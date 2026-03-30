'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCookieConsent } from '@/contexts/CookieConsentContext';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type GaPageViewTrackerProps = {
  measurementId: string;
};

export function GaPageViewTracker({ measurementId }: GaPageViewTrackerProps) {
  const { canTrackAnalytics } = useCookieConsent();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const pagePath = search ? `${pathname}?${search}` : pathname;
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (!canTrackAnalytics || !measurementId || !pagePath) return;

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }

    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

    window.gtag('event', 'page_view', {
      send_to: measurementId,
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [canTrackAnalytics, measurementId, pagePath]);

  return null;
}
