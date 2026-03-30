'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearGaCookies,
  type CookieConsentState,
  createCookieConsentState,
  getInitialCookieConsentState,
  loadCookieConsentState,
  persistCookieConsentState,
  setGaTrackingEnabled,
} from '@/lib/cookie-consent';

type CookieConsentContextValue = {
  consent: CookieConsentState;
  isLoaded: boolean;
  hasStoredChoice: boolean;
  canTrackAnalytics: boolean;
  isPreferencesOpen: boolean;
  showBanner: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptAll: () => void;
  rejectAnalytics: () => void;
  savePreferences: (analyticsEnabled: boolean) => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | undefined>(undefined);

function applyTrackingSideEffects(analyticsEnabled: boolean) {
  setGaTrackingEnabled(analyticsEnabled);
  if (!analyticsEnabled) {
    clearGaCookies();
  }
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<CookieConsentState>(getInitialCookieConsentState());
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasStoredChoice, setHasStoredChoice] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  useEffect(() => {
    const stored = loadCookieConsentState();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate consent from persisted storage after mount.
      setConsent(stored);
      setHasStoredChoice(true);
      applyTrackingSideEffects(stored.analytics);
    } else {
      const fallback = getInitialCookieConsentState();
      setConsent(fallback);
      applyTrackingSideEffects(false);
    }
    setIsLoaded(true);
  }, []);

  const setConsentAndPersist = useCallback((analyticsEnabled: boolean) => {
    const next = createCookieConsentState(analyticsEnabled);
    setConsent(next);
    setHasStoredChoice(true);
    persistCookieConsentState(next);
    applyTrackingSideEffects(analyticsEnabled);
  }, []);

  const acceptAll = useCallback(() => {
    setConsentAndPersist(true);
    setIsPreferencesOpen(false);
  }, [setConsentAndPersist]);

  const rejectAnalytics = useCallback(() => {
    setConsentAndPersist(false);
    setIsPreferencesOpen(false);
  }, [setConsentAndPersist]);

  const savePreferences = useCallback((analyticsEnabled: boolean) => {
    setConsentAndPersist(analyticsEnabled);
    setIsPreferencesOpen(false);
  }, [setConsentAndPersist]);

  const openPreferences = useCallback(() => {
    setIsPreferencesOpen(true);
  }, []);

  const closePreferences = useCallback(() => {
    setIsPreferencesOpen(false);
  }, []);

  const value = useMemo<CookieConsentContextValue>(() => ({
    consent,
    isLoaded,
    hasStoredChoice,
    canTrackAnalytics: isLoaded && hasStoredChoice && consent.analytics,
    isPreferencesOpen,
    showBanner: isLoaded && !hasStoredChoice,
    openPreferences,
    closePreferences,
    acceptAll,
    rejectAnalytics,
    savePreferences,
  }), [
    acceptAll,
    closePreferences,
    consent,
    hasStoredChoice,
    isLoaded,
    isPreferencesOpen,
    openPreferences,
    rejectAnalytics,
    savePreferences,
  ]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsent must be used within CookieConsentProvider');
  }
  return context;
}
