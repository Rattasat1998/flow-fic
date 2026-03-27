'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────
type Block = {
    id: string;
    type: 'paragraph' | 'image' | 'scene';
    text: string;
    characterId: string | null;
    imageUrl?: string;
    isFlashback?: boolean;
    layoutMode?: 'stage' | 'split' | 'solo';
    backgroundUrl?: string | null;
    leftCharacterId?: string | null;
    rightCharacterId?: string | null;
    soloCharacterId?: string | null;
    speakerCharacterId?: string | null;
    leftSceneImageUrl?: string | null;
    rightSceneImageUrl?: string | null;
    soloSceneImageUrl?: string | null;
    focusSide?: 'left' | 'right' | 'none';
};

export interface AutoSaveDraft {
    title: string;
    blocks: Block[];
    povCharacterId: string | null;
    chatTheme: string;
    backgroundSound: string | null;
    backgroundSoundMeta?: unknown;
    isPremium: boolean;
    coinPrice: number;
    chapterChoices?: unknown;
    isEndingChapter?: boolean;
    choiceTimerSeconds?: number;
    savedAt: string;        // ISO timestamp of auto-save
    serverSavedAt: string;  // lastSavedAt from server when editor loaded
}

interface AutoSaveState {
    title: string;
    blocks: Block[];
    povCharacterId: string | null;
    chatTheme: string;
    backgroundSound: string | null;
    backgroundSoundMeta?: unknown;
    isPremium: boolean;
    coinPrice: number;
    chapterChoices?: unknown;
    isEndingChapter?: boolean;
    choiceTimerSeconds?: number;
}

interface UseAutoSaveOptions {
    chapterId: string;
    /** lastSavedAt from Supabase — used to compare with draft age */
    serverSavedAt: string | null;
    /** Whether the editor data has been loaded from server */
    isReady: boolean;
}

interface UseAutoSaveReturn {
    /** Whether a recoverable draft was found */
    hasRecovery: boolean;
    /** The recoverable draft data */
    recoveryDraft: AutoSaveDraft | null;
    /** Timestamp of the recoverable draft */
    recoveryTimestamp: string | null;
    /** Accept recovery → returns the draft data for the editor to apply */
    acceptRecovery: () => AutoSaveDraft | null;
    /** Dismiss recovery → deletes the stored draft */
    dismissRecovery: () => void;
    /** Call this whenever editor state changes */
    onEditorChange: (state: AutoSaveState) => void;
    /** Call this after a successful save to clear the draft */
    clearDraft: () => void;
    /** Disable beforeunload warning permanently (call before intentional navigation) */
    disableNavigationLock: () => void;
    /** Auto-save status indicator */
    autoSaveStatus: 'idle' | 'pending' | 'saved';
}

// ─── Constants ────────────────────────────────────────
const AUTOSAVE_DEBOUNCE_MS = 5_000;  // 5 seconds
const STORAGE_PREFIX = 'flowfic_autosave_';

function serializeState(state: AutoSaveState): string {
    return JSON.stringify({
        title: state.title,
        blocks: state.blocks,
        povCharacterId: state.povCharacterId,
        chatTheme: state.chatTheme,
        backgroundSound: state.backgroundSound,
        backgroundSoundMeta: state.backgroundSoundMeta,
        isPremium: state.isPremium,
        coinPrice: state.coinPrice,
        chapterChoices: state.chapterChoices,
        isEndingChapter: state.isEndingChapter,
        choiceTimerSeconds: state.choiceTimerSeconds,
    });
}

function serializeDraft(draft: AutoSaveDraft): string {
    return JSON.stringify({
        title: draft.title,
        blocks: draft.blocks,
        povCharacterId: draft.povCharacterId,
        chatTheme: draft.chatTheme,
        backgroundSound: draft.backgroundSound,
        backgroundSoundMeta: draft.backgroundSoundMeta,
        isPremium: draft.isPremium,
        coinPrice: draft.coinPrice,
        chapterChoices: draft.chapterChoices,
        isEndingChapter: draft.isEndingChapter,
        choiceTimerSeconds: draft.choiceTimerSeconds,
    });
}

function getStorageKey(chapterId: string): string {
    return `${STORAGE_PREFIX}${chapterId}`;
}

function loadDraft(chapterId: string): AutoSaveDraft | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(getStorageKey(chapterId));
        if (!raw) return null;
        return JSON.parse(raw) as AutoSaveDraft;
    } catch {
        return null;
    }
}

function saveDraft(chapterId: string, draft: AutoSaveDraft): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(getStorageKey(chapterId), JSON.stringify(draft));
    } catch (e) {
        console.warn('[AutoSave] Failed to write to localStorage:', e);
    }
}

function deleteDraft(chapterId: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(getStorageKey(chapterId));
}

// ─── Hook ─────────────────────────────────────────────
export function useAutoSave(options: UseAutoSaveOptions): UseAutoSaveReturn {
    const { chapterId, serverSavedAt, isReady } = options;

    const [hasRecovery, setHasRecovery] = useState(false);
    const [recoveryDraft, setRecoveryDraft] = useState<AutoSaveDraft | null>(null);
    const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saved'>('idle');

    // Refs for debounce
    const latestStateRef = useRef<AutoSaveState | null>(null);
    const latestSignatureRef = useRef<string | null>(null);
    const baselineSignatureRef = useRef<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDirtyRef = useRef(false);
    const navigationLockDisabledRef = useRef(false);
    const serverSavedAtRef = useRef(serverSavedAt);
    const hasCheckedRecovery = useRef(false);
    const recoveryCandidateRef = useRef<AutoSaveDraft | null>(null);

    // Keep serverSavedAt ref in sync
    useEffect(() => {
        serverSavedAtRef.current = serverSavedAt;
    }, [serverSavedAt]);

    // ── Check for existing recovery draft on mount ──
    useEffect(() => {
        if (!isReady || hasCheckedRecovery.current) return;
        hasCheckedRecovery.current = true;

        const existing = loadDraft(chapterId);
        if (!existing) return;

        // Check if the draft is newer than server data
        const draftTime = new Date(existing.savedAt).getTime();
        const serverTime = serverSavedAt ? new Date(serverSavedAt).getTime() : 0;

        // Draft is valuable if it was saved AFTER the last server save
        if (draftTime > serverTime) {
            recoveryCandidateRef.current = existing;
        } else {
            // Draft is older than server → clean up
            deleteDraft(chapterId);
        }
    }, [chapterId, serverSavedAt, isReady]);

    // ── Flush pending auto-save (called by timer) ──
    const flushDraft = useCallback(() => {
        const state = latestStateRef.current;
        if (!state || !isDirtyRef.current) return;

        const draft: AutoSaveDraft = {
            ...state,
            savedAt: new Date().toISOString(),
            serverSavedAt: serverSavedAtRef.current || '',
        };

        saveDraft(chapterId, draft);
        isDirtyRef.current = false;
        setAutoSaveStatus('saved');

        // Reset status back to idle after 2s
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
    }, [chapterId]);

    // ── Called by editor on every change ──
    const onEditorChange = useCallback((state: AutoSaveState) => {
        const signature = serializeState(state);
        latestStateRef.current = state;
        latestSignatureRef.current = signature;

        // First state after editor data is loaded = baseline (not a user edit yet).
        if (baselineSignatureRef.current === null) {
            baselineSignatureRef.current = signature;
            // Legacy cleanup: remove stale local drafts that are identical to current editor state.
            const candidate = recoveryCandidateRef.current ?? recoveryDraft;
            if (candidate) {
                if (serializeDraft(candidate) === signature) {
                    setHasRecovery(false);
                    setRecoveryDraft(null);
                    deleteDraft(chapterId);
                } else {
                    setHasRecovery(true);
                    setRecoveryDraft(candidate);
                }
                recoveryCandidateRef.current = null;
            }
            setAutoSaveStatus('idle');
            return;
        }

        // No actual changes from baseline -> keep idle and do not auto-save.
        if (signature === baselineSignatureRef.current) {
            isDirtyRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
            setAutoSaveStatus('idle');
            return;
        }

        isDirtyRef.current = true;
        setAutoSaveStatus('pending');

        // Debounce
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flushDraft, AUTOSAVE_DEBOUNCE_MS);
    }, [flushDraft, recoveryDraft, chapterId]);

    // ── Accept recovery ──
    const acceptRecovery = useCallback((): AutoSaveDraft | null => {
        const draft = recoveryDraft;
        setHasRecovery(false);
        setRecoveryDraft(null);
        // Keep draft in storage until the user actually saves
        return draft;
    }, [recoveryDraft]);

    // ── Dismiss recovery ──
    const dismissRecovery = useCallback(() => {
        setHasRecovery(false);
        setRecoveryDraft(null);
        deleteDraft(chapterId);
    }, [chapterId]);

    // ── Clear draft (after successful save) ──
    const clearDraft = useCallback(() => {
        isDirtyRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        deleteDraft(chapterId);
        baselineSignatureRef.current = latestSignatureRef.current;
        setHasRecovery(false);
        setRecoveryDraft(null);
        setAutoSaveStatus('idle');
    }, [chapterId]);

    // ── beforeunload warning ──
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (navigationLockDisabledRef.current) return;
            if (isDirtyRef.current) {
                // Flush immediately before leaving
                flushDraft();
                e.preventDefault();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Flush on unmount if dirty
            if (isDirtyRef.current) flushDraft();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [flushDraft]);

    const disableNavigationLock = useCallback(() => {
        navigationLockDisabledRef.current = true;
        isDirtyRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    return {
        hasRecovery,
        recoveryDraft,
        recoveryTimestamp: recoveryDraft?.savedAt || null,
        acceptRecovery,
        dismissRecovery,
        onEditorChange,
        clearDraft,
        disableNavigationLock,
        autoSaveStatus,
    };
}
