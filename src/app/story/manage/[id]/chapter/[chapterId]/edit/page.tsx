'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Plus, X, Trash2, GripVertical, Image as ImageIcon, Search, CheckCircle2, AlertCircle, RotateCcw, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoSave } from '@/hooks/useAutoSave';
import styles from './edit.module.css';
import blockStyles from './block-editor.module.css';



type Character = {
    id: string;
    name: string;
    image_url: string | null;
};

type Block = {
    id: string;
    type: 'paragraph' | 'image';
    text: string;
    characterId: string | null;
    imageUrl?: string;
};

type UnsplashImage = {
    id: string;
    alt: string;
    thumb: string;
    regular: string;
    full: string;
    author: string;
    authorUrl: string;
    unsplashUrl: string;
};

type NoticeState = {
    tone: 'success' | 'error';
    title: string;
    message: string;
};

type ChapterRevisionType = 'manual_save' | 'publish' | 'discard' | 'restore';

type ChapterContentPayload = {
    povCharacterId: string | null;
    chatTheme?: string;
    backgroundSound: null;
    blocks: Block[];
};

type ChapterRevision = {
    id: string;
    revision_type: ChapterRevisionType;
    title: string;
    content: unknown;
    is_premium: boolean;
    coin_price: number;
    created_at: string;
};

type RevisionDiffSummary = {
    highlights: string[];
    beforeText: string;
    afterText: string;
};

export default function EditChapterPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const storyId = params.id as string;
    const chapterId = params.chapterId as string;
    const cacheKey = `flowfic_chapter_${chapterId}`;
    const { user, isLoading: isLoadingAuth } = useAuth();

    const [isMounted, setIsMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [authError, setAuthError] = useState(false);

    const [title, setTitle] = useState('');
    const [povCharacterId, setPovCharacterId] = useState<string | null>(null);
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [status, setStatus] = useState<'draft' | 'published'>('draft');
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
    const [isPremium, setIsPremium] = useState(false);
    const [coinPrice, setCoinPrice] = useState(10);

    // Chat specific states
    const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
    const [chatInputValue, setChatInputValue] = useState('');
    const [isCharPopupOpen, setIsCharPopupOpen] = useState(false);
    const charPopupRef = useRef<HTMLDivElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const sendSoundContextRef = useRef<AudioContext | null>(null);
    const serverAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const serverDraftSignatureRef = useRef<string>('');
    const isServerAutoSavingRef = useRef(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [chatTheme, setChatTheme] = useState<string>('white');

    // Track which block has its character selector open (narrative mode)
    const [openCharSelectorId, setOpenCharSelectorId] = useState<string | null>(null);
    const charSelectorRef = useRef<HTMLDivElement>(null);

    // Quick Add Character Modal State
    const [showQuickAddChar, setShowQuickAddChar] = useState(false);
    const [quickCharForm, setQuickCharForm] = useState({ name: '', imageUrl: null as string | null });
    const [quickCharImageFile, setQuickCharImageFile] = useState<File | null>(null);
    const [isSavingQuickChar, setIsSavingQuickChar] = useState(false);
    const [showUnsplashModal, setShowUnsplashModal] = useState(false);
    const [unsplashTarget, setUnsplashTarget] = useState<'chat' | 'character' | 'narrative'>('chat');
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState<UnsplashImage[]>([]);
    const [isUnsplashLoading, setIsUnsplashLoading] = useState(false);
    const [unsplashError, setUnsplashError] = useState<string | null>(null);
    const [notice, setNotice] = useState<NoticeState | null>(null);
    const [revisions, setRevisions] = useState<ChapterRevision[]>([]);
    const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
    const [isRestoringRevision, setIsRestoringRevision] = useState(false);
    const [savedDraftSignature, setSavedDraftSignature] = useState('');

    const styleParam = searchParams.get('style');
    const editorStyle = styleParam === 'chat' || styleParam === 'thread' ? styleParam : 'narrative';
    const isChatStyle = editorStyle === 'chat';
    const styleLabel = isChatStyle ? 'แชท' : editorStyle === 'thread' ? 'กระทู้' : 'บรรยาย';

    // ── Auto-Save Hook ──
    const {
        hasRecovery,
        recoveryDraft,
        recoveryTimestamp,
        acceptRecovery,
        dismissRecovery,
        onEditorChange,
        clearDraft,
        autoSaveStatus,
    } = useAutoSave({
        chapterId,
        serverSavedAt: lastSavedAt,
        isReady: !isLoading && isMounted,
    });

    // ── Notify auto-save of state changes ──
    const notifyAutoSave = useCallback(() => {
        if (!isMounted || isLoading) return;
        onEditorChange({
            title,
            blocks,
            povCharacterId,
            chatTheme,
            backgroundSound: null,
            isPremium,
            coinPrice,
        });
    }, [title, blocks, povCharacterId, chatTheme, isPremium, coinPrice, isMounted, isLoading, onEditorChange]);

    useEffect(() => {
        notifyAutoSave();
    }, [notifyAutoSave]);

    useEffect(() => {
        if (!isMounted) return;

        sessionStorage.setItem(cacheKey, JSON.stringify({
            characters,
            title,
            status,
            lastSavedAt,
            blocks,
            povCharacterId,
            chatTheme,
            isPremium,
            coinPrice,
        }));
    }, [
        cacheKey,
        isMounted,
        characters,
        title,
        status,
        lastSavedAt,
        blocks,
        povCharacterId,
        chatTheme,
        isPremium,
        coinPrice,
    ]);

    // ── Handle recovery accept ──
    const handleAcceptRecovery = () => {
        const draft = acceptRecovery();
        if (!draft) return;
        setTitle(draft.title);
        setBlocks(draft.blocks);
        setPovCharacterId(draft.povCharacterId);
        setChatTheme(draft.chatTheme);
        setIsPremium(draft.isPremium);
        setCoinPrice(draft.coinPrice);
        showNotice('success', 'กู้คืนสำเร็จ', 'ฉบับร่างล่าสุดถูกกู้คืนแล้ว');
    };

    const handleDismissRecovery = () => {
        dismissRecovery();
        showNotice('success', 'ละทิ้งฉบับร่าง', 'ใช้ข้อมูลจากเซิร์ฟเวอร์แทน');
    };

    const showNotice = (tone: NoticeState['tone'], title: string, message: string) => {
        setNotice({ tone, title, message });
    };

    const updateSavedDraftSignature = useCallback((signature: string) => {
        serverDraftSignatureRef.current = signature;
        setSavedDraftSignature(signature);
    }, []);

    const parseStoredChapterContent = useCallback((rawContent: unknown): ChapterContentPayload => {
        let parsedBlocks: Block[] = [];
        let parsedPov: string | null = null;
        let parsedChatTheme = 'white';

        if (rawContent && typeof rawContent === 'object') {
            const contentObject = rawContent as Record<string, unknown>;
            if (Array.isArray(contentObject.blocks)) {
                parsedBlocks = contentObject.blocks
                    .map((item, index) => {
                        if (!item || typeof item !== 'object') return null;
                        const blockObject = item as Record<string, unknown>;
                        const type = blockObject.type === 'image' ? 'image' : 'paragraph';
                        const text = typeof blockObject.text === 'string' ? blockObject.text : '';
                        const characterId = typeof blockObject.characterId === 'string' ? blockObject.characterId : null;
                        const imageUrl = typeof blockObject.imageUrl === 'string' ? blockObject.imageUrl : undefined;
                        const id = typeof blockObject.id === 'string' && blockObject.id
                            ? blockObject.id
                            : `block-${Date.now()}-${index}`;

                        return {
                            id,
                            type,
                            text,
                            characterId,
                            imageUrl,
                        } as Block;
                    })
                    .filter((item): item is Block => item !== null);
            } else if (typeof contentObject.text === 'string') {
                parsedBlocks = contentObject.text
                    .split('\n')
                    .filter((line) => line.trim() !== '')
                    .map((line, index) => ({
                        id: `block-${Date.now()}-${index}`,
                        type: 'paragraph' as const,
                        text: line,
                        characterId: null,
                    }));
            }

            parsedPov = typeof contentObject.povCharacterId === 'string' ? contentObject.povCharacterId : null;
            parsedChatTheme = typeof contentObject.chatTheme === 'string' ? contentObject.chatTheme : 'white';
        } else if (typeof rawContent === 'string') {
            parsedBlocks = rawContent
                .split('\n')
                .filter((line) => line.trim() !== '')
                .map((line, index) => ({
                    id: `block-${Date.now()}-${index}`,
                    type: 'paragraph' as const,
                    text: line,
                    characterId: null,
                }));
        }

        if (parsedBlocks.length === 0) {
            parsedBlocks = [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }];
        }

        return {
            povCharacterId: parsedPov,
            chatTheme: parsedChatTheme,
            backgroundSound: null,
            blocks: parsedBlocks,
        };
    }, []);

    const applySnapshotToEditor = useCallback((snapshot: {
        title: string;
        content: ChapterContentPayload;
        isPremium: boolean;
        coinPrice: number;
    }) => {
        setTitle(snapshot.title);
        setBlocks(snapshot.content.blocks);
        setPovCharacterId(snapshot.content.povCharacterId);
        setChatTheme(snapshot.content.chatTheme || 'white');
        setIsPremium(snapshot.isPremium);
        setCoinPrice(snapshot.coinPrice > 0 ? snapshot.coinPrice : 10);
    }, []);

    const getRevisionTypeLabel = (revisionType: ChapterRevisionType) => {
        if (revisionType === 'publish') return 'เผยแพร่';
        if (revisionType === 'discard') return 'ยกเลิกฉบับร่าง';
        if (revisionType === 'restore') return 'กู้คืนเวอร์ชัน';
        return 'บันทึกร่าง';
    };

    const buildSignatureFromSnapshot = useCallback((snapshot: {
        title: string;
        content: ChapterContentPayload;
        isPremium: boolean;
        coinPrice: number;
        statusValue: 'draft' | 'published';
    }) => {
        return JSON.stringify({
            title: snapshot.title,
            draftContent: snapshot.content,
            isPremium: snapshot.isPremium,
            coinPrice: snapshot.coinPrice,
            status: snapshot.statusValue,
        });
    }, []);

    const chapterContentToText = useCallback((content: ChapterContentPayload) => {
        return content.blocks
            .map((block) => block.text || '')
            .join('\n')
            .trim();
    }, []);

    const playChatSendSound = useCallback(() => {
        if (!isChatStyle || typeof window === 'undefined') return;

        try {
            if (!sendSoundContextRef.current) {
                sendSoundContextRef.current = new AudioContext();
            }

            const ctx = sendSoundContextRef.current;
            const now = ctx.currentTime;
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();

            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(880, now);
            oscillator.frequency.exponentialRampToValueAtTime(1320, now + 0.06);

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

            oscillator.connect(gain);
            gain.connect(ctx.destination);

            oscillator.start(now);
            oscillator.stop(now + 0.1);
        } catch (error) {
            console.error('Failed to play send sound:', error);
        }
    }, [isChatStyle]);

    const buildDraftSnapshot = useCallback(() => {
        const draftBlocks = blocks.length > 0
            ? blocks
            : [{ id: 'block-empty', type: 'paragraph' as const, text: '', characterId: null }];
        const draftContent: ChapterContentPayload = {
            povCharacterId: isChatStyle ? povCharacterId : null,
            chatTheme: isChatStyle ? chatTheme : undefined,
            backgroundSound: null,
            blocks: draftBlocks,
        };
        const signature = buildSignatureFromSnapshot({
            title,
            content: draftContent,
            isPremium,
            coinPrice,
            statusValue: status,
        });

        return { draftContent, signature };
    }, [
        blocks,
        isChatStyle,
        povCharacterId,
        chatTheme,
        title,
        isPremium,
        coinPrice,
        status,
        buildSignatureFromSnapshot,
    ]);

    const currentDraftSignature = useMemo(() => buildDraftSnapshot().signature, [buildDraftSnapshot]);
    const isDraftDirty = currentDraftSignature !== savedDraftSignature;

    const flushServerDraftAutoSave = useCallback(async (force = false) => {
        if (!user || !chapterId || !storyId) return;
        if (isLoading || isSaving) return;
        if (isServerAutoSavingRef.current) return;

        const { draftContent, signature } = buildDraftSnapshot();
        if (!force && signature === serverDraftSignatureRef.current) return;

        isServerAutoSavingRef.current = true;
        const nowIso = new Date().toISOString();
        const payload: Record<string, unknown> = {
            draft_title: title,
            draft_content: draftContent,
            draft_updated_at: nowIso,
            updated_at: nowIso,
        };

        // Keep legacy columns aligned only while chapter is still unpublished.
        if (status !== 'published') {
            payload.title = title;
            payload.content = draftContent;
            payload.is_premium = isPremium;
            payload.coin_price = isPremium ? Math.max(1, coinPrice) : 0;
        }

        try {
            const { error } = await supabase
                .from('chapters')
                .update(payload)
                .eq('id', chapterId)
                .eq('story_id', storyId);

            if (error) throw error;

            updateSavedDraftSignature(signature);
            setLastSavedAt(nowIso);
        } catch (error) {
            console.error('Auto-save to server failed:', error);
        } finally {
            isServerAutoSavingRef.current = false;
        }
    }, [
        user,
        chapterId,
        storyId,
        isLoading,
        isSaving,
        buildDraftSnapshot,
        title,
        status,
        isPremium,
        coinPrice,
        updateSavedDraftSignature,
    ]);

    const loadRevisions = useCallback(async () => {
        if (!user || !chapterId) return;
        setIsLoadingRevisions(true);

        try {
            const { data, error } = await supabase
                .from('chapter_revisions')
                .select('id, revision_type, title, content, is_premium, coin_price, created_at')
                .eq('chapter_id', chapterId)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            const mappedRows = (data ?? []).map((row) => {
                const rowData = row as Record<string, unknown>;
                const revisionType = rowData.revision_type;
                const safeRevisionType: ChapterRevisionType = revisionType === 'publish'
                    || revisionType === 'discard'
                    || revisionType === 'restore'
                    || revisionType === 'manual_save'
                    ? revisionType
                    : 'manual_save';

                return {
                    id: String(rowData.id),
                    revision_type: safeRevisionType,
                    title: typeof rowData.title === 'string' ? rowData.title : '',
                    content: rowData.content ?? null,
                    is_premium: !!rowData.is_premium,
                    coin_price: Number(rowData.coin_price) || 0,
                    created_at: typeof rowData.created_at === 'string' ? rowData.created_at : new Date().toISOString(),
                } as ChapterRevision;
            });

            setRevisions(mappedRows);
        } catch (error) {
            console.error('Failed to load chapter revisions:', error);
        } finally {
            setIsLoadingRevisions(false);
        }
    }, [user, chapterId]);

    const saveRevisionSnapshot = useCallback(async (
        revisionType: ChapterRevisionType,
        snapshot?: {
            title: string;
            content: ChapterContentPayload;
            isPremium: boolean;
            coinPrice: number;
        },
    ) => {
        if (!user || !chapterId || !storyId) return;

        const currentDraft = buildDraftSnapshot();
        const sourceSnapshot = snapshot ?? {
            title,
            content: currentDraft.draftContent,
            isPremium,
            coinPrice,
        };

        try {
            const { error } = await supabase
                .from('chapter_revisions')
                .insert({
                    chapter_id: chapterId,
                    story_id: storyId,
                    user_id: user.id,
                    revision_type: revisionType,
                    title: sourceSnapshot.title,
                    content: sourceSnapshot.content,
                    is_premium: sourceSnapshot.isPremium,
                    coin_price: sourceSnapshot.isPremium ? Math.max(1, sourceSnapshot.coinPrice) : 0,
                });

            if (error) throw error;

            await loadRevisions();
        } catch (error) {
            console.error('Failed to save chapter revision:', error);
        }
    }, [
        user,
        chapterId,
        storyId,
        buildDraftSnapshot,
        title,
        isPremium,
        coinPrice,
        loadRevisions,
    ]);

    const persistSnapshotAsDraft = useCallback(async (snapshot: {
        title: string;
        content: ChapterContentPayload;
        isPremium: boolean;
        coinPrice: number;
    }) => {
        if (!user || !chapterId || !storyId) return false;

        const nowIso = new Date().toISOString();
        const payload: Record<string, unknown> = {
            draft_title: snapshot.title,
            draft_content: snapshot.content,
            draft_updated_at: nowIso,
            updated_at: nowIso,
        };

        if (status !== 'published') {
            payload.title = snapshot.title;
            payload.content = snapshot.content;
            payload.is_premium = snapshot.isPremium;
            payload.coin_price = snapshot.isPremium ? Math.max(1, snapshot.coinPrice) : 0;
        }

        const { error } = await supabase
            .from('chapters')
            .update(payload)
            .eq('id', chapterId)
            .eq('story_id', storyId);

        if (error) {
            console.error('Failed to persist snapshot as draft:', error);
            return false;
        }

        setLastSavedAt(nowIso);
        updateSavedDraftSignature(buildSignatureFromSnapshot({
            title: snapshot.title,
            content: snapshot.content,
            isPremium: snapshot.isPremium,
            coinPrice: snapshot.coinPrice,
            statusValue: status,
        }));
        return true;
    }, [user, chapterId, storyId, status, buildSignatureFromSnapshot, updateSavedDraftSignature]);

    const buildSnapshotFromRevision = useCallback((revision: ChapterRevision) => {
        const parsedContent = parseStoredChapterContent(revision.content);
        return {
            title: revision.title || 'ไม่มีชื่อ',
            content: parsedContent,
            isPremium: revision.is_premium,
            coinPrice: revision.coin_price > 0 ? revision.coin_price : 10,
        };
    }, [parseStoredChapterContent]);

    const buildRevisionDiffSummary = useCallback((
        currentRevision: ChapterRevision,
        previousRevision: ChapterRevision | null,
    ): RevisionDiffSummary => {
        const currentSnapshot = buildSnapshotFromRevision(currentRevision);
        const currentText = chapterContentToText(currentSnapshot.content);
        const currentCharLength = currentText.length;
        const currentBlocksLength = currentSnapshot.content.blocks.length;

        if (!previousRevision) {
            return {
                highlights: ['เวอร์ชันแรกที่บันทึก'],
                beforeText: '-',
                afterText: currentText || '-',
            };
        }

        const previousSnapshot = buildSnapshotFromRevision(previousRevision);
        const previousText = chapterContentToText(previousSnapshot.content);
        const previousCharLength = previousText.length;
        const previousBlocksLength = previousSnapshot.content.blocks.length;

        const highlights: string[] = [];

        if (currentSnapshot.title !== previousSnapshot.title) {
            highlights.push('แก้ชื่อเรื่อง');
        }
        if (currentSnapshot.isPremium !== previousSnapshot.isPremium) {
            highlights.push(currentSnapshot.isPremium ? 'เปิดตอนพิเศษ' : 'ปิดตอนพิเศษ');
        }
        if (currentSnapshot.coinPrice !== previousSnapshot.coinPrice) {
            highlights.push(`ราคา ${previousSnapshot.coinPrice} -> ${currentSnapshot.coinPrice}`);
        }
        if (currentBlocksLength !== previousBlocksLength) {
            const delta = currentBlocksLength - previousBlocksLength;
            highlights.push(`จำนวนบล็อก ${delta > 0 ? `+${delta}` : `${delta}`}`);
        }
        if (currentCharLength !== previousCharLength) {
            const delta = currentCharLength - previousCharLength;
            highlights.push(`ตัวอักษร ${delta > 0 ? `+${delta}` : `${delta}`}`);
        }

        if (highlights.length === 0) {
            highlights.push('ไม่มีความต่างจากเวอร์ชันก่อนหน้า');
        }

        return {
            highlights,
            beforeText: previousText || '-',
            afterText: currentText || '-',
        };
    }, [buildSnapshotFromRevision, chapterContentToText]);

    const revisionRows = useMemo(() => {
        return revisions.map((revision, index) => {
            const previous = revisions[index + 1] ?? null;
            return {
                revision,
                diff: buildRevisionDiffSummary(revision, previous),
            };
        });
    }, [revisions, buildRevisionDiffSummary]);

    const handleRestoreRevision = useCallback(async (revision: ChapterRevision) => {
        if (isSaving || isRestoringRevision) return;

        const shouldRestore = window.confirm('ต้องการกู้คืนฉบับนี้ใช่ไหม? ข้อมูลที่แก้ล่าสุดจะถูกแทนที่');
        if (!shouldRestore) return;

        setIsRestoringRevision(true);
        const snapshot = buildSnapshotFromRevision(revision);
        const isPersisted = await persistSnapshotAsDraft(snapshot);

        if (!isPersisted) {
            showNotice('error', 'กู้คืนไม่สำเร็จ', 'ไม่สามารถอัปเดตฉบับร่างบนเซิร์ฟเวอร์ได้');
            setIsRestoringRevision(false);
            return;
        }

        applySnapshotToEditor(snapshot);
        await saveRevisionSnapshot('restore', snapshot);
        showNotice('success', 'กู้คืนสำเร็จ', 'ฉบับร่างถูกย้อนกลับตามประวัติที่เลือกแล้ว');
        setIsRestoringRevision(false);
    }, [
        isSaving,
        isRestoringRevision,
        buildSnapshotFromRevision,
        persistSnapshotAsDraft,
        applySnapshotToEditor,
        saveRevisionSnapshot,
    ]);

    const handleDiscardDraft = useCallback(async () => {
        if (isSaving || isRestoringRevision) return;

        const shouldDiscard = window.confirm('ต้องการยกเลิกฉบับร่างล่าสุดใช่ไหม?');
        if (!shouldDiscard) return;

        setIsRestoringRevision(true);

        try {
            let snapshot: {
                title: string;
                content: ChapterContentPayload;
                isPremium: boolean;
                coinPrice: number;
            } | null = null;

            const { data: latestRevisionData, error: latestRevisionError } = await supabase
                .from('chapter_revisions')
                .select('id, revision_type, title, content, is_premium, coin_price, created_at')
                .eq('chapter_id', chapterId)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!latestRevisionError && latestRevisionData && latestRevisionData.length > 0) {
                const latestRevision = latestRevisionData[0] as ChapterRevision;
                snapshot = buildSnapshotFromRevision(latestRevision);
            }

            if (!snapshot && status === 'published') {
                const { data: chapterData, error: chapterError } = await supabase
                    .from('chapters')
                    .select('published_title, published_content, title, content, is_premium, coin_price')
                    .eq('id', chapterId)
                    .eq('story_id', storyId)
                    .single();

                if (chapterError) throw chapterError;

                const fallbackTitle = typeof chapterData.published_title === 'string' && chapterData.published_title.trim()
                    ? chapterData.published_title
                    : chapterData.title;
                const fallbackContent = chapterData.published_content ?? chapterData.content;

                snapshot = {
                    title: fallbackTitle,
                    content: parseStoredChapterContent(fallbackContent),
                    isPremium: !!chapterData.is_premium,
                    coinPrice: chapterData.coin_price > 0 ? chapterData.coin_price : 10,
                };
            }

            if (!snapshot) {
                showNotice('error', 'ยกเลิกไม่ได้', 'ยังไม่มีประวัติให้ย้อนกลับในตอนนี้');
                setIsRestoringRevision(false);
                return;
            }

            const isPersisted = await persistSnapshotAsDraft(snapshot);
            if (!isPersisted) {
                showNotice('error', 'ยกเลิกไม่สำเร็จ', 'ไม่สามารถอัปเดตฉบับร่างบนเซิร์ฟเวอร์ได้');
                setIsRestoringRevision(false);
                return;
            }

            applySnapshotToEditor(snapshot);
            await saveRevisionSnapshot('discard', snapshot);
            showNotice('success', 'ยกเลิกฉบับร่างแล้ว', 'กลับไปเป็นเวอร์ชันล่าสุดในประวัติเรียบร้อย');
        } catch (error) {
            console.error('Discard draft failed:', error);
            showNotice('error', 'ยกเลิกไม่สำเร็จ', 'เกิดข้อผิดพลาดขณะย้อนฉบับร่าง');
        } finally {
            setIsRestoringRevision(false);
        }
    }, [
        isSaving,
        isRestoringRevision,
        chapterId,
        storyId,
        status,
        buildSnapshotFromRevision,
        parseStoredChapterContent,
        persistSnapshotAsDraft,
        applySnapshotToEditor,
        saveRevisionSnapshot,
    ]);

    // Close popups when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (charSelectorRef.current && !charSelectorRef.current.contains(event.target as Node)) {
                setOpenCharSelectorId(null);
            }
            if (charPopupRef.current && !charPopupRef.current.contains(event.target as Node)) {
                setIsCharPopupOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!notice) return;
        const timeout = setTimeout(() => setNotice(null), 2400);
        return () => clearTimeout(timeout);
    }, [notice]);

    useEffect(() => {
        if (!isMounted || isLoading || isSaving || !user) return;

        if (serverAutoSaveTimerRef.current) {
            clearTimeout(serverAutoSaveTimerRef.current);
        }

        serverAutoSaveTimerRef.current = setTimeout(() => {
            void flushServerDraftAutoSave();
        }, 1500);

        return () => {
            if (serverAutoSaveTimerRef.current) {
                clearTimeout(serverAutoSaveTimerRef.current);
                serverAutoSaveTimerRef.current = null;
            }
        };
    }, [
        title,
        blocks,
        povCharacterId,
        chatTheme,
        isPremium,
        coinPrice,
        status,
        isMounted,
        isLoading,
        isSaving,
        user,
        flushServerDraftAutoSave,
    ]);

    useEffect(() => {
        return () => {
            const ctx = sendSoundContextRef.current;
            if (ctx) {
                ctx.close().catch(() => undefined);
                sendSoundContextRef.current = null;
            }

            if (serverAutoSaveTimerRef.current) {
                clearTimeout(serverAutoSaveTimerRef.current);
                serverAutoSaveTimerRef.current = null;
            }
            void flushServerDraftAutoSave(false);
        };
    }, [flushServerDraftAutoSave]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            void flushServerDraftAutoSave(false);
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [flushServerDraftAutoSave]);

    useEffect(() => {
        if (!user || !chapterId) return;
        void loadRevisions();
    }, [user, chapterId, loadRevisions]);

    useEffect(() => {
        setIsMounted(true);

        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setCharacters(parsed.characters || []);
                setTitle(parsed.title);
                setStatus(parsed.status);
                setLastSavedAt(parsed.lastSavedAt);
                setBlocks(parsed.blocks);
                setPovCharacterId(parsed.povCharacterId);
                setChatTheme(typeof parsed.chatTheme === 'string' ? parsed.chatTheme : 'white');
                setIsPremium(!!parsed.isPremium);
                setCoinPrice(Number.isFinite(parsed.coinPrice) ? Math.max(1, Number(parsed.coinPrice)) : 10);
                const parsedBlocks = Array.isArray(parsed.blocks) ? (parsed.blocks as Block[]) : [];
                const cachedDraftContent: ChapterContentPayload = {
                    povCharacterId: parsed.povCharacterId || null,
                    chatTheme: typeof parsed.chatTheme === 'string' ? parsed.chatTheme : 'white',
                    backgroundSound: null,
                    blocks: parsedBlocks.length > 0
                        ? parsedBlocks
                        : [{ id: 'block-empty', type: 'paragraph' as const, text: '', characterId: null }],
                };
                updateSavedDraftSignature(buildSignatureFromSnapshot({
                    title: parsed.title || '',
                    content: cachedDraftContent,
                    isPremium: !!parsed.isPremium,
                    coinPrice: Number.isFinite(parsed.coinPrice) ? Math.max(1, Number(parsed.coinPrice)) : 10,
                    statusValue: (parsed.status === 'published' ? 'published' : 'draft'),
                }));
                setIsLoading(false);
            } catch (e) {
                console.error("Cache parsing error", e);
            }
        }

        const fetchChapterAndCharacters = async () => {
            if (!chapterId || !user) {
                return;
            }

            // 1. Fetch Story to check ownership first
            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .select('user_id')
                .eq('id', storyId)
                .single();

            if (storyError || !storyData) {
                console.error("Story not found or error:", storyError);
                router.push('/dashboard');
                return;
            }

            // Security check: only the owner can manage
            if (storyData.user_id !== user.id) {
                setAuthError(true);
                setIsLoading(false);
                return;
            }

            // Fetch Characters
            const { data: charsData } = await supabase
                .from('characters')
                .select('id, name, image_url')
                .eq('story_id', storyId)
                .order('order_index', { ascending: true });

            if (charsData) {
                setCharacters(charsData);
            }

            // Fetch Chapter
            const { data, error } = await supabase
                .from('chapters')
                .select('*')
                .eq('id', chapterId)
                .eq('story_id', storyId)
                .single();

            if (data && !error) {
                const draftTitle = typeof data.draft_title === 'string' && data.draft_title.trim()
                    ? data.draft_title
                    : data.title;

                setTitle(draftTitle);
                setStatus(data.status as 'draft' | 'published');
                setLastSavedAt(data.updated_at || null);
                setIsPremium(!!data.is_premium);
                setCoinPrice((data.coin_price && data.coin_price > 0) ? data.coin_price : 10);

                const draftContent = data.draft_content ?? data.content;

                // Parse content into blocks
                const parsedContent = parseStoredChapterContent(draftContent);
                const parsedBlocks = parsedContent.blocks;
                const parsedPov = parsedContent.povCharacterId;
                const parsedChatTheme = parsedContent.chatTheme || 'white';

                setBlocks(parsedBlocks);
                setPovCharacterId(parsedPov);
                setChatTheme(parsedChatTheme);
                const loadedDraftContent: ChapterContentPayload = {
                    povCharacterId: isChatStyle ? parsedPov : null,
                    chatTheme: isChatStyle ? parsedChatTheme : undefined,
                    backgroundSound: null,
                    blocks: parsedBlocks.length > 0
                        ? parsedBlocks
                        : [{ id: 'block-empty', type: 'paragraph' as const, text: '', characterId: null }],
                };
                updateSavedDraftSignature(buildSignatureFromSnapshot({
                    title: draftTitle,
                    content: loadedDraftContent,
                    isPremium: !!data.is_premium,
                    coinPrice: (data.coin_price && data.coin_price > 0) ? data.coin_price : 10,
                    statusValue: data.status === 'published' ? 'published' : 'draft',
                }));

                sessionStorage.setItem(cacheKey, JSON.stringify({
                    characters: charsData || [],
                    title: draftTitle,
                    status: data.status,
                    lastSavedAt: data.updated_at || null,
                    blocks: parsedBlocks,
                    povCharacterId: parsedPov,
                    chatTheme: parsedChatTheme,
                    isPremium: !!data.is_premium,
                    coinPrice: (data.coin_price && data.coin_price > 0) ? data.coin_price : 10,
                }));

            } else {
                console.error("Error fetching chapter:", error);
                alert("ไม่พบข้อมูลตอนนี้ หรือเกิดข้อผิดพลาด");
                router.replace(`/story/manage/${storyId}`);
            }
            setIsLoading(false);
        };

        if (!isLoadingAuth) {
            if (!user) {
                router.push('/');
            } else {
                fetchChapterAndCharacters();
            }
        }
    }, [
        cacheKey,
        chapterId,
        storyId,
        user,
        isLoadingAuth,
        router,
        isChatStyle,
        buildSignatureFromSnapshot,
        updateSavedDraftSignature,
    ]);

    const handleSave = async (publish: boolean = false) => {
        if (!title.trim()) {
            showNotice('error', 'กรุณากรอกชื่อตอน', 'ต้องใส่ชื่อตอนก่อนบันทึกหรือเผยแพร่');
            return;
        }

        const newStatus = publish ? 'published' : status;
        const cleanBlocks = blocks.filter(b => b.text.trim() !== '' || b.characterId !== null || b.type === 'image');
        const normalizedBlocks = cleanBlocks.length > 0
            ? cleanBlocks
            : [{ id: `block-${Date.now()}`, type: 'paragraph' as const, text: '', characterId: null }];
        const contentPayload: ChapterContentPayload = {
            povCharacterId: isChatStyle ? povCharacterId : null,
            chatTheme: isChatStyle ? chatTheme : undefined,
            backgroundSound: null,
            blocks: normalizedBlocks,
        };
        const draftSignatureForSave = buildSignatureFromSnapshot({
            title,
            content: contentPayload,
            isPremium,
            coinPrice,
            statusValue: newStatus,
        });

        if (!publish && draftSignatureForSave === savedDraftSignature) {
            showNotice('success', 'ไม่มีการเปลี่ยนแปลง', 'ร่างล่าสุดตรงกับข้อมูลที่บันทึกไว้แล้ว');
            return;
        }

        setIsSaving(true);

        try {
            const nowIso = new Date().toISOString();
            const updatePayload: Record<string, unknown> = {
                draft_title: title,
                draft_content: contentPayload,
                draft_updated_at: nowIso,
                status: newStatus,
                updated_at: nowIso,
            };
            const shouldUpdateLiveMonetization = publish || status !== 'published';
            if (shouldUpdateLiveMonetization) {
                updatePayload.is_premium = isPremium;
                updatePayload.coin_price = isPremium ? Math.max(1, coinPrice) : 0;
            }

            if (publish) {
                updatePayload.published_title = title;
                updatePayload.published_content = contentPayload;
                updatePayload.published_updated_at = nowIso;
                // Keep legacy columns as published snapshot for backward compatibility.
                updatePayload.title = title;
                updatePayload.content = contentPayload;
            } else if (status !== 'published') {
                // For unpublished chapters, keep legacy columns aligned with draft.
                updatePayload.title = title;
                updatePayload.content = contentPayload;
            }

            const { error } = await supabase
                .from('chapters')
                .update(updatePayload)
                .eq('id', chapterId)
                .eq('story_id', storyId);

            if (error) throw error;

            setStatus(newStatus);
            setLastSavedAt(nowIso);
            updateSavedDraftSignature(draftSignatureForSave);
            if (cleanBlocks.length !== blocks.length) setBlocks(cleanBlocks); // optimize view
            clearDraft(); // Clear auto-save draft after successful save
            void saveRevisionSnapshot(publish ? 'publish' : 'manual_save', {
                title,
                content: contentPayload,
                isPremium,
                coinPrice,
            });

            if (publish) {
                showNotice('success', 'เผยแพร่ตอนสำเร็จ', 'กำลังพาไปหน้าจัดการเรื่อง...');
                setTimeout(() => {
                    // Use window.location.replace to truly replace the history entry
                    // so pressing Back goes to dashboard, not back to the editor
                    window.location.replace(`/story/manage/${storyId}`);
                }, 900);
            } else {
                showNotice('success', 'บันทึกร่างสำเร็จ', 'ข้อมูลล่าสุดถูกบันทึกเรียบร้อยแล้ว');
            }
        } catch (err) {
            console.error("Error saving chapter:", err);
            showNotice('error', 'บันทึกไม่สำเร็จ', 'เกิดข้อผิดพลาดในการบันทึก กรุณาลองอีกครั้ง');
        } finally {
            setIsSaving(false);
        }
    };

    const updateBlock = (id: string, updates: Partial<Block>) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index === -1) return prev;
            const newBlocks = [...prev];
            newBlocks[index] = { ...newBlocks[index], ...updates };
            return newBlocks;
        });
    };

    const addBlock = (afterId?: string) => {
        setBlocks(prev => {
            let inheritedCharId: string | null = null;
            if (afterId && isChatStyle) {
                const afterBlock = prev.find(b => b.id === afterId);
                if (afterBlock) {
                    inheritedCharId = afterBlock.characterId;
                }
            }

            const newId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newBlock: Block = { id: newId, type: 'paragraph', text: '', characterId: inheritedCharId };

            if (!afterId) return [...prev, newBlock];
            const index = prev.findIndex(b => b.id === afterId);
            if (index === -1) return [...prev, newBlock];
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            return newBlocks;
        });

        // Focus the new block after a short delay to allow React to render it
        setTimeout(() => {
            // After state update, the last block will be focused or finding the newly injected ID
            const el = document.querySelector(`textarea:last-of-type`) as HTMLTextAreaElement;
            if (el) el.focus();
        }, 50);
    };

    const handleSendChat = () => {
        if (!chatInputValue.trim()) return;

        const newId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newBlock: Block = {
            id: newId,
            type: 'paragraph',
            text: chatInputValue.trim(),
            characterId: activeCharacterId
        };

        setBlocks(prev => {
            // Remove empty initial block if it's the only one
            if (prev.length === 1 && prev[0].text === '' && prev[0].characterId === null) {
                return [newBlock];
            }
            return [...prev, newBlock];
        });
        playChatSendSound();

        setChatInputValue('');
        setIsCharPopupOpen(false);

        // Auto scroll to bottom
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setIsUploadingImage(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
            const filePath = `chat_images/${storyId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('covers') // reusing covers bucket since it exists and is public
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('covers')
                .getPublicUrl(filePath);

            const newId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newBlock: Block = {
                id: newId,
                type: 'image',
                text: '',
                characterId: activeCharacterId,
                imageUrl: publicUrl
            };

            setBlocks(prev => {
                if (prev.length === 1 && prev[0].text === '' && prev[0].characterId === null && prev[0].type === 'paragraph') {
                    return [newBlock];
                }
                return [...prev, newBlock];
            });

            setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);

        } catch (error) {
            console.error('Error uploading chat image:', error);
            alert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
        } finally {
            setIsUploadingImage(false);
            if (imageInputRef.current) {
                imageInputRef.current.value = ''; // Reset input
            }
        }
    };

    const handleChatInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendChat();
        }
    };

    const handleSearchUnsplash = async (rawQuery?: string) => {
        const query = (rawQuery ?? unsplashQuery).trim();
        if (!query) {
            setUnsplashResults([]);
            setUnsplashError(null);
            return;
        }

        setIsUnsplashLoading(true);
        setUnsplashError(null);

        try {
            const response = await fetch(`/api/unsplash/search?q=${encodeURIComponent(query)}&perPage=18`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.error || 'ค้นหารูปไม่สำเร็จ');
            }

            setUnsplashResults((data.results || []) as UnsplashImage[]);
        } catch (error) {
            console.error('Unsplash search failed:', error);
            setUnsplashError('ค้นหารูปไม่สำเร็จ ลองใหม่อีกครั้ง');
        } finally {
            setIsUnsplashLoading(false);
        }
    };

    const openUnsplashPicker = (target: 'chat' | 'character' | 'narrative') => {
        setUnsplashTarget(target);
        setShowUnsplashModal(true);
        setUnsplashError(null);

        if (!unsplashQuery) {
            const defaultQuery = target === 'chat'
                ? 'cinematic scene'
                : target === 'narrative'
                    ? 'fantasy landscape'
                    : 'portrait character';
            setUnsplashQuery(defaultQuery);
            handleSearchUnsplash(defaultQuery);
        } else if (unsplashResults.length === 0) {
            handleSearchUnsplash(unsplashQuery);
        }
    };

    const handleSelectUnsplashImage = (image: UnsplashImage) => {
        if (unsplashTarget === 'chat') {
            const newId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newBlock: Block = {
                id: newId,
                type: 'image',
                text: '',
                characterId: activeCharacterId,
                imageUrl: image.regular
            };

            setBlocks(prev => {
                if (prev.length === 1 && prev[0].text === '' && prev[0].characterId === null && prev[0].type === 'paragraph') {
                    return [newBlock];
                }
                return [...prev, newBlock];
            });

            setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } else if (unsplashTarget === 'narrative') {
            const newId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newBlock: Block = {
                id: newId,
                type: 'image',
                text: '',
                characterId: null,
                imageUrl: image.regular
            };

            setBlocks(prev => {
                if (prev.length === 1 && prev[0].text === '' && prev[0].characterId === null && prev[0].type === 'paragraph') {
                    return [newBlock];
                }
                return [...prev, newBlock];
            });
        } else {
            setQuickCharImageFile(null);
            setQuickCharForm(prev => ({ ...prev, imageUrl: image.regular }));
        }

        setShowUnsplashModal(false);
    };

    const removeBlock = async (id: string) => {
        // Find the block to be removed
        const blockToRemove = blocks.find(b => b.id === id);

        setBlocks(prev => {
            if (prev.length <= 1) return [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }];

            const index = prev.findIndex(b => b.id === id);
            if (index > 0) {
                // Focus previous block before removing
                setTimeout(() => {
                    const el = document.getElementById(`textarea-${prev[index - 1].id}`);
                    if (el) el.focus();
                }, 0);
            }
            return prev.filter(b => b.id !== id);
        });

        // If the block is an image, delete it from storage
        if (blockToRemove?.type === 'image' && blockToRemove.imageUrl) {
            try {
                // Extract file path from public URL
                // Example URL: https://[project-ref].supabase.co/storage/v1/object/public/covers/chat_images/[storyId]/[fileName]
                const urlObj = new URL(blockToRemove.imageUrl);
                const pathParts = urlObj.pathname.split('/public/covers/');
                if (pathParts.length === 2) {
                    const filePath = decodeURIComponent(pathParts[1]);

                    const { error } = await supabase.storage
                        .from('covers')
                        .remove([filePath]);

                    if (error) {
                        console.error('Failed to delete image from storage:', error);
                    }
                }
            } catch (error) {
                console.error('Error parsing image URL for deletion:', error);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addBlock(id);
        } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
            e.preventDefault();
            removeBlock(id);
        }
    };

    const handleQuickCharImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setQuickCharImageFile(file);
            const objectUrl = URL.createObjectURL(file);
            setQuickCharForm((prev) => ({ ...prev, imageUrl: objectUrl }));
        }
    };

    const handleQuickAddCharacter = async () => {
        if (!user) return;
        if (!quickCharForm.name.trim()) {
            alert('กรุณากรอกชื่อตัวละคร');
            return;
        }

        setIsSavingQuickChar(true);

        try {
            let uploadedImageUrl = quickCharForm.imageUrl || null;

            if (quickCharImageFile) {
                const fileExt = quickCharImageFile.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                const filePath = `${storyId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('characters')
                    .upload(filePath, quickCharImageFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('characters')
                    .getPublicUrl(filePath);

                uploadedImageUrl = publicUrl;
            }

            // Insert new character
            const { data: newChar, error: insertError } = await supabase
                .from('characters')
                .insert([{
                    story_id: storyId,
                    user_id: user.id,
                    name: quickCharForm.name,
                    image_url: uploadedImageUrl,
                    order_index: characters.length
                }])
                .select()
                .single();

            if (insertError) throw insertError;

            // Update local state
            setCharacters(prev => [...prev, newChar]);

            // Set as active character and close popup
            setActiveCharacterId(newChar.id);
            setShowQuickAddChar(false);
            setQuickCharForm({ name: '', imageUrl: null });
            setQuickCharImageFile(null);
            setIsCharPopupOpen(false); // also close the character selector

        } catch (error) {
            console.error('Error saving quick character:', error);
            alert('เกิดข้อผิดพลาดในการสร้างตัวละคร โปรดลองอีกครั้ง');
        } finally {
            setIsSavingQuickChar(false);
        }
    };

    // Auto-resize textareas when blocks loaded/changed externally
    useEffect(() => {
        if (!isLoading && blocks.length > 0) {
            // small delay to let react render the textareas first
            setTimeout(() => {
                blocks.forEach(block => {
                    const el = document.getElementById(`textarea-${block.id}`);
                    if (el) {
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                    }
                });
            }, 50);
        }
    }, [isLoading, blocks.length]); // depend on length to catch new blocks too, actual typing is handled by onChange

    const wordCount = blocks.reduce((acc, block) => acc + (block.text.trim() ? block.text.trim().split(/\s+/).length : 0), 0);
    const charCount = blocks.reduce((acc, block) => acc + block.text.length, 0);
    if (!isMounted) return null;

    if (authError) {
        return (
            <main className={styles.main}>
                <header className={styles.header}>
                </header>
                <div className={blockStyles.content} style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
                    <h2>ไม่มีสิทธิ์เข้าถึง</h2>
                    <p>คุณไม่สามารถแก้ไขตอนนี้ได้ เนื่องจากคุณไม่ใช่เจ้าของเรื่อง</p>
                </div>
            </main>
        );
    }

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Loader2 className={styles.spinner} size={40} />
            </div>
        );
    }

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.statusBadge}>
                        {status === 'published' ? (
                            <span className={styles.published}>● เผยแพร่แล้ว</span>
                        ) : (
                            <span className={styles.draft}>● ฉบับร่าง</span>
                        )}
                    </div>
                    <div className={styles.editorMeta}>
                        <span>สไตล์: {styleLabel}</span>
                        <span>{wordCount} คำ</span>
                        <span>{charCount} ตัวอักษร</span>
                        {lastSavedAt && (
                            <span>บันทึกล่าสุด {new Date(lastSavedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {autoSaveStatus === 'pending' && (
                            <span className={styles.autoSaveIndicator}>
                                <Clock size={12} /> กำลังบันทึกอัตโนมัติ...
                            </span>
                        )}
                        {autoSaveStatus === 'saved' && (
                            <span className={styles.autoSaveIndicatorSaved}>
                                <CheckCircle2 size={12} /> บันทึกอัตโนมัติแล้ว
                            </span>
                        )}
                    </div>
                </div>

                <div className={styles.headerCenter}>
                    <input
                        type="text"
                        className={styles.headerTitleInput}
                        placeholder="ชื่อตอน..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>

                <div className={styles.headerActions}>
                    <div className={styles.headerPremiumControls}>
                        <label className={styles.headerPremiumToggle}>
                            <input
                                type="checkbox"
                                checked={isPremium}
                                onChange={(e) => setIsPremium(e.target.checked)}
                            />
                            ตอนพิเศษ
                        </label>
                        {isPremium && (
                            <label className={styles.headerPremiumPrice}>
                                <span>ราคา</span>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={coinPrice}
                                    onChange={(e) => setCoinPrice(Math.max(1, Number(e.target.value) || 1))}
                                    className={styles.headerPremiumInput}
                                />
                                <span>เหรียญ</span>
                            </label>
                        )}
                    </div>
                    <button
                        className={styles.discardDraftBtn}
                        onClick={() => void handleDiscardDraft()}
                        disabled={isSaving || isRestoringRevision}
                    >
                        <RotateCcw size={16} />
                        ยกเลิกฉบับร่าง
                    </button>
                    <button
                        className={styles.saveDraftBtn}
                        onClick={() => handleSave(false)}
                        disabled={isSaving || isRestoringRevision || !isDraftDirty}
                        title={!isDraftDirty ? 'ยังไม่มีการเปลี่ยนแปลงจากร่างล่าสุด' : undefined}
                    >
                        {isSaving ? <Loader2 size={16} className={styles.spinner} /> : <Save size={16} />}
                        บันทึกร่าง
                    </button>
                    <button className={styles.publishBtn} onClick={() => handleSave(true)} disabled={isSaving || isRestoringRevision}>
                        {isSaving ? <Loader2 size={16} className={styles.spinner} /> : 'เผยแพร่ตอน'}
                    </button>
                </div>
            </header>

            {/* Recovery Banner */}
            {hasRecovery && recoveryDraft && (
                <div className={styles.recoveryBanner}>
                    <div className={styles.recoveryContent}>
                        <div className={styles.recoveryIcon}>
                            <RotateCcw size={20} />
                        </div>
                        <div className={styles.recoveryText}>
                            <strong>พบฉบับร่างที่ยังไม่ได้บันทึก</strong>
                            <span>
                                บันทึกอัตโนมัติเมื่อ{' '}
                                {recoveryTimestamp
                                    ? new Date(recoveryTimestamp).toLocaleString('th-TH', {
                                        day: 'numeric', month: 'short',
                                        hour: '2-digit', minute: '2-digit'
                                    })
                                    : 'ไม่ทราบเวลา'
                                }
                            </span>
                        </div>
                        <div className={styles.recoveryActions}>
                            <button className={styles.recoveryRestoreBtn} onClick={handleAcceptRecovery}>
                                <RotateCcw size={14} /> กู้คืนฉบับร่าง
                            </button>
                            <button className={styles.recoveryDismissBtn} onClick={handleDismissRecovery}>
                                <X size={14} /> ละทิ้ง
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.editorWorkspace}>
                <div className={styles.editorMainColumn}>
                    <div className={`${styles.content} ${!isChatStyle ? styles.contentNarrative : ''} ${isChatStyle ? styles.contentChat : ''}`}>
                <div className={styles.titleArea}>
                    {isChatStyle && (
                        <div className={styles.chatSetupStack}>
                            {characters.length > 0 && (
                                <div className={styles.povSelector}>
                                    <label htmlFor="pov-character">มุมมองหลัก (POV):</label>
                                    <select
                                        id="pov-character"
                                        value={povCharacterId || ''}
                                        onChange={(e) => setPovCharacterId(e.target.value || null)}
                                        className={styles.povSelect}
                                    >
                                        <option value="">-- ไม่ระบุ (บุคคลที่ 3) --</option>
                                        {characters.map(char => (
                                            <option key={char.id} value={char.id}>{char.name}</option>
                                        ))}
                                    </select>
                                    <span className={styles.povHelp}>* ข้อความของมุมมองหลักจะอยู่ฝั่งขวา</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {isChatStyle ? (
                    <>
                        <div className={styles.chatHistory}>
                            {blocks.map((block) => {
                                if (!block.text && !block.characterId && blocks.length === 1) return null; // Skip empty initial block in chat view

                                const assignedChar = characters.find(c => c.id === block.characterId);
                                const isPOV = block.characterId === povCharacterId && povCharacterId !== null;
                                const isSystem = !block.characterId;

                                return (
                                    <div key={block.id} className={`${blockStyles.blockRow}`} style={{ position: 'relative', padding: '0.25rem', justifyContent: isSystem ? 'center' : (isPOV ? 'flex-end' : 'flex-start') }}>
                                        {!isPOV && !isSystem && (
                                            <div className={blockStyles.blockAvatar}>
                                                {assignedChar?.image_url ? (
                                                    <img src={assignedChar.image_url} alt={assignedChar.name} />
                                                ) : (
                                                    <span style={{ fontSize: '1.25rem' }}>?</span>
                                                )}
                                            </div>
                                        )}

                                        <div className={blockStyles.blockContent} style={{ maxWidth: isSystem ? '80%' : '50%', flexGrow: 0, width: isSystem ? 'auto' : 'fit-content', display: 'flex', flexDirection: 'column', alignItems: isPOV ? 'flex-end' : 'flex-start' }}>
                                            {!isSystem && assignedChar && (
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem', marginLeft: isPOV ? 0 : '0.5rem', marginRight: isPOV ? '0.5rem' : 0 }}>{assignedChar.name}</div>
                                            )}

                                            <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: isPOV ? 'flex-end' : 'flex-start' }}>
                                                {block.type === 'image' && block.imageUrl ? (
                                                    <img
                                                        src={block.imageUrl}
                                                        alt="Chat Image"
                                                        style={{
                                                            maxWidth: '240px',
                                                            maxHeight: '300px',
                                                            borderRadius: '12px',
                                                            objectFit: 'contain',
                                                            display: 'block',
                                                            backgroundColor: isSystem ? 'transparent' : isPOV ? '#3b82f6' : 'white',
                                                            padding: '4px',
                                                            border: isSystem ? 'none' : `0.75px solid ${isPOV ? '#3b82f6' : '#e2e8f0'}`
                                                        }}
                                                    />
                                                ) : (
                                                    <textarea
                                                        id={`textarea-${block.id}`}
                                                        className={blockStyles.blockTextarea}
                                                        style={{
                                                            backgroundColor: isSystem ? 'transparent' : isPOV ? '#3b82f6' : 'white',
                                                            color: isSystem ? '#64748b' : isPOV ? 'white' : '#1e293b',
                                                            borderColor: isSystem ? 'transparent' : isPOV ? '#3b82f6' : '#e2e8f0',
                                                            borderWidth: isSystem ? 0 : '0.75px',
                                                            borderRadius: '18px',
                                                            borderBottomRightRadius: isPOV && !isSystem ? '4px' : '18px',
                                                            borderTopLeftRadius: !isPOV && !isSystem ? '4px' : '18px',
                                                            textAlign: isSystem ? 'center' : 'left',
                                                            minHeight: 'auto',
                                                            padding: '0.6rem 0.9rem',
                                                            boxShadow: isSystem ? 'none' : '0 1px 1px rgba(0,0,0,0.04)',
                                                            width: 'auto',
                                                            minWidth: '60px',
                                                            maxWidth: '100%',
                                                            fieldSizing: 'content',
                                                        }}
                                                        value={block.text}
                                                        onChange={(e) => {
                                                            updateBlock(block.id, { text: e.target.value });
                                                            e.target.style.height = 'auto';
                                                            e.target.style.height = e.target.scrollHeight + 'px';
                                                        }}
                                                        onKeyDown={(e) => handleKeyDown(e, block.id)}
                                                        placeholder={isSystem ? 'บรรยาย...' : '...'}
                                                        rows={1}
                                                    />
                                                )}
                                                <div className={blockStyles.blockActions} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: isPOV ? 'calc(100% + 8px)' : 'auto', left: !isPOV ? 'calc(100% + 8px)' : 'auto', paddingTop: 0, minWidth: 'max-content' }}>
                                                    <button className={`${blockStyles.actionBtn} ${blockStyles.destructive}`} onClick={() => removeBlock(block.id)} title="ลบข้อความ">
                                                        <Trash2 size={14} />
                                                    </button>
                                                    {/* Simple character switcher for inline edit */}
                                                    <button className={blockStyles.actionBtn} onClick={() => {
                                                        const currentIndex = characters.findIndex(c => c.id === block.characterId);
                                                        if (currentIndex === -1) {
                                                            updateBlock(block.id, { characterId: characters[0]?.id || null });
                                                        } else if (currentIndex < characters.length - 1) {
                                                            updateBlock(block.id, { characterId: characters[currentIndex + 1].id });
                                                        } else {
                                                            updateBlock(block.id, { characterId: null });
                                                        }
                                                    }} title="เปลี่ยนคนพูด (คลิกวนลูป)">
                                                        <span style={{ fontSize: '10px', fontWeight: 'bold' }}>👤</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {isPOV && !isSystem && (
                                            <div className={blockStyles.blockAvatar}>
                                                {assignedChar?.image_url ? (
                                                    <img src={assignedChar.image_url} alt={assignedChar?.name || ''} />
                                                ) : (
                                                    <span style={{ fontSize: '1.25rem' }}>?</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Chat Input Bar */}
                        <div className={styles.chatInputBar}>
                            {/* Horizontal Character Selector Tray */}
                            <div className={styles.charSelectorTray}>
                                <button
                                    className={`${styles.trayCharBtn} ${activeCharacterId === null ? styles.active : ''}`}
                                    onClick={() => setActiveCharacterId(null)}
                                >
                                    <div className={styles.trayCharAvatar}>?</div>
                                    <span className={styles.trayCharName}>บรรยาย</span>
                                </button>

                                {characters.map(char => (
                                    <button
                                        key={char.id}
                                        className={`${styles.trayCharBtn} ${activeCharacterId === char.id ? styles.active : ''}`}
                                        onClick={() => setActiveCharacterId(char.id)}
                                        title={char.name}
                                    >
                                        <div className={styles.trayCharAvatar}>
                                            {char.image_url ? <img src={char.image_url} alt="" /> : char.name.substring(0, 1)}
                                        </div>
                                        <span className={styles.trayCharName}>{char.name}</span>
                                    </button>
                                ))}

                                <button className={styles.trayAddBtn} onClick={() => setShowQuickAddChar(true)}>
                                    <div className={styles.trayAddAvatar}>
                                        <Plus size={16} />
                                    </div>
                                    <span className={styles.trayCharName} style={{ color: 'var(--primary)' }}>เพิ่มตัว</span>
                                </button>
                            </div>

                            <div className={styles.chatInputRow}>
                                <label className={styles.imageUploadBtn} title="ส่งรูปภาพ">
                                    {isUploadingImage ? <Loader2 size={18} className={styles.spinner} /> : <ImageIcon size={18} />}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={handleImageUpload}
                                        ref={imageInputRef}
                                        disabled={isUploadingImage}
                                    />
                                </label>

                                <button
                                    type="button"
                                    className={styles.unsplashBtn}
                                    title="ค้นหารูปจาก Unsplash"
                                    onClick={() => openUnsplashPicker('chat')}
                                >
                                    <Search size={16} />
                                </button>

                                {/* Text Input */}
                                <textarea
                                    className={styles.chatTextInput}
                                    value={chatInputValue}
                                    onChange={(e) => setChatInputValue(e.target.value)}
                                    onKeyDown={handleChatInputKeyDown}
                                    placeholder={`ส่งข้อความในฐานะ ${activeCharacterId ? characters.find(c => c.id === activeCharacterId)?.name : 'บทบรรยาย'}...`}
                                    rows={1}
                                />

                                <button
                                    className={styles.sendBtn}
                                    onClick={handleSendChat}
                                    disabled={!chatInputValue.trim()}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className={styles.narrativeEditorPane}>
                        <section className={styles.characterInlinePanel}>
                            <div className={styles.characterInlineTitle}>ตัวละครในเรื่อง</div>
                            {characters.length === 0 ? (
                                <div className={styles.characterInlineEmpty}>ยังไม่มีตัวละคร</div>
                            ) : (
                                <div className={styles.characterInlineList}>
                                    {characters.map((char) => (
                                        <div key={char.id} className={styles.characterInlineItem}>
                                            <div className={styles.characterInlineAvatar}>
                                                {char.image_url ? <img src={char.image_url} alt={char.name} /> : char.name.substring(0, 1)}
                                            </div>
                                            <div className={styles.characterInlineName}>{char.name}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <div className={blockStyles.blockEditor}>
                            {blocks.map((block) => {
                                const assignedChar = characters.find(c => c.id === block.characterId);
                                const isSelectorOpen = openCharSelectorId === block.id;
                                const isImageBlock = block.type === 'image' && !!block.imageUrl;

                                return (
                                    <div key={block.id} className={`${blockStyles.blockRow} ${blockStyles.alignLeft}`}>
                                        {/* Character Avatar Wrapper */}
                                        {!isImageBlock && (
                                            <div style={{ position: 'relative' }}>
                                                <div
                                                    className={blockStyles.blockAvatar}
                                                    onClick={() => setOpenCharSelectorId(isSelectorOpen ? null : block.id)}
                                                    title={assignedChar ? assignedChar.name : "คลิกเพื่อเลือกตัวละคร"}
                                                >
                                                    {assignedChar?.image_url ? (
                                                        <img src={assignedChar.image_url} alt={assignedChar.name} />
                                                    ) : (
                                                        <span style={{ fontSize: '1.25rem' }}>?</span>
                                                    )}
                                                </div>

                                                {/* Character Selection Dropdown */}
                                                {isSelectorOpen && (
                                                    <div className={blockStyles.charSelector} ref={charSelectorRef}>
                                                        <div
                                                            className={`${blockStyles.charOption} ${!block.characterId ? blockStyles.active : ''}`}
                                                            onClick={() => { updateBlock(block.id, { characterId: null }); setOpenCharSelectorId(null); }}
                                                        >
                                                            <div className={blockStyles.charOptionAvatar}>?</div>
                                                            <div className={blockStyles.charOptionName}>ไม่มีตัวละคร (บทบรรยาย)</div>
                                                        </div>
                                                        {characters.map(char => (
                                                            <div
                                                                key={char.id}
                                                                className={`${blockStyles.charOption} ${block.characterId === char.id ? blockStyles.active : ''}`}
                                                                onClick={() => { updateBlock(block.id, { characterId: char.id }); setOpenCharSelectorId(null); }}
                                                            >
                                                                {char.image_url ? (
                                                                    <img src={char.image_url} className={blockStyles.charOptionAvatar} alt="" />
                                                                ) : (
                                                                    <div className={blockStyles.charOptionAvatar}>{char.name.substring(0, 1)}</div>
                                                                )}
                                                                <div className={blockStyles.charOptionName}>{char.name}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Text Content Wrapper */}
                                        <div className={blockStyles.blockContent}>
                                            {isImageBlock ? (
                                                <>
                                                    {assignedChar && <div className={blockStyles.blockSpeakerName}>{assignedChar.name}</div>}
                                                    <div className={blockStyles.blockImageWrapper}>
                                                        <img src={block.imageUrl} alt="Narrative image" className={blockStyles.blockImage} />
                                                    </div>
                                                    <div className={blockStyles.blockActions} style={{ opacity: 1 }}>
                                                        <button className={blockStyles.actionBtn} onClick={() => addBlock(block.id)} title="เพิ่มย่อหน้าใหม่ด้านล่าง">
                                                            <Plus size={16} />
                                                        </button>
                                                        <button className={`${blockStyles.actionBtn} ${blockStyles.destructive}`} onClick={() => removeBlock(block.id)} title="ลบรูปนี้">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {assignedChar && <div className={blockStyles.blockSpeakerName}>{assignedChar.name}</div>}
                                                    <textarea
                                                        id={`textarea-${block.id}`}
                                                        className={blockStyles.blockTextarea}
                                                        value={block.text}
                                                        onChange={(e) => {
                                                            updateBlock(block.id, { text: e.target.value });
                                                            e.target.style.height = 'auto';
                                                            e.target.style.height = e.target.scrollHeight + 'px';
                                                        }}
                                                        onKeyDown={(e) => handleKeyDown(e, block.id)}
                                                        placeholder={assignedChar ? `พิมพ์บทพูดของ ${assignedChar.name}...` : 'พิมพ์บทบรรยาย...'}
                                                        rows={1}
                                                    />
                                                    <div className={blockStyles.blockActions}>
                                                        <button className={blockStyles.actionBtn} onClick={() => addBlock(block.id)} title="เพิ่มย่อหน้าใหม่ด้านล่าง">
                                                            <Plus size={16} />
                                                        </button>
                                                        <button className={`${blockStyles.actionBtn} ${blockStyles.destructive}`} onClick={() => removeBlock(block.id)} title="ลบย่อหน้านี้">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className={blockStyles.editorBottomActions}>
                                <button className={blockStyles.addBlockBtn} onClick={() => addBlock()}>
                                    <Plus size={20} /> เพิ่มบรรทัดใหม่
                                </button>
                                <button className={blockStyles.addImageBtn} onClick={() => openUnsplashPicker('narrative')}>
                                    <Search size={18} /> เพิ่มรูปจาก Unsplash
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                    </div>
                </div>
                <aside className={styles.revisionSidebar}>
                    <section className={styles.revisionPanel}>
                        <div className={styles.revisionPanelHeader}>
                            <h3>ประวัติการแก้ไข</h3>
                            <span>
                                {isLoadingRevisions ? 'กำลังโหลด...' : `${revisions.length} รายการ`}
                            </span>
                        </div>
                        {revisions.length === 0 ? (
                            <p className={styles.revisionEmpty}>
                                ยังไม่มีประวัติการแก้ไขในตอนนี้
                            </p>
                        ) : (
                            <div className={styles.revisionList}>
                                {revisionRows.map(({ revision, diff }) => (
                                    <div className={styles.revisionItem} key={revision.id}>
                                        <div className={styles.revisionMeta}>
                                            <strong>{getRevisionTypeLabel(revision.revision_type)}</strong>
                                            <span>
                                                {new Date(revision.created_at).toLocaleString('th-TH', {
                                                    day: '2-digit',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                        </div>
                                        <div className={styles.revisionActions}>
                                            <span className={styles.revisionTitle}>{revision.title || 'ไม่มีชื่อ'}</span>
                                            <button
                                                type="button"
                                                className={styles.revisionRestoreBtn}
                                                onClick={() => void handleRestoreRevision(revision)}
                                                disabled={isSaving || isRestoringRevision}
                                            >
                                                กู้คืนเวอร์ชันนี้
                                            </button>
                                        </div>
                                        <div className={styles.revisionChangeSummary}>
                                            {diff.highlights.join(' • ')}
                                        </div>
                                        <div className={styles.revisionDiffPreview}>
                                            <div>
                                                <span>ก่อนหน้า</span>
                                                <p>{diff.beforeText}</p>
                                            </div>
                                            <div>
                                                <span>เวอร์ชันนี้</span>
                                                <p>{diff.afterText}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </aside>
            </div>

            {/* Quick Add Character Modal */}
            {
                showQuickAddChar && (
                    <div className={styles.modalOverlay} onClick={() => setShowQuickAddChar(false)}>
                        <div className={styles.modal} onClick={e => e.stopPropagation()}>
                            <div className={styles.modalHeader}>
                                <h2 className={styles.modalTitle}>เพิ่มตัวละครด่วน</h2>
                                <button className={styles.iconBtn} onClick={() => setShowQuickAddChar(false)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className={styles.modalBody}>
                                <div className={styles.editCharImageContainer}>
                                    <label className={styles.editCharImageUpload}>
                                        {quickCharForm.imageUrl ? (
                                            <img src={quickCharForm.imageUrl} alt="Character Preview" className={styles.editCharImagePreview} />
                                        ) : (
                                            <div className={styles.editCharImagePlaceholder}>
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                            </div>
                                        )}
                                        <div className={styles.editCharImageOverlay}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={handleQuickCharImageChange}
                                        />
                                    </label>
                                </div>
                                <button
                                    type="button"
                                    className={styles.unsplashPickerBtn}
                                    onClick={() => openUnsplashPicker('character')}
                                >
                                    เลือกรูปจาก Unsplash
                                </button>

                                <div className={styles.editField}>
                                    <label>ชื่อตัวละคร <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        type="text"
                                        value={quickCharForm.name}
                                        onChange={e => setQuickCharForm({ ...quickCharForm, name: e.target.value })}
                                        className={styles.editInput}
                                        placeholder="เช่น: จินอา, พระเอก, ตำรวจ"
                                    />
                                </div>
                            </div>

                            <div className={styles.modalFooter}>
                                <button className={styles.cancelBtn} onClick={() => setShowQuickAddChar(false)} disabled={isSavingQuickChar}>
                                    ยกเลิก
                                </button>
                                <button className={styles.saveBtn} onClick={handleQuickAddCharacter} disabled={isSavingQuickChar}>
                                    {isSavingQuickChar ? <Loader2 size={16} className={styles.spinner} /> : 'บันทึกและใช้งาน'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {showUnsplashModal && (
                <div className={styles.modalOverlay} onClick={() => setShowUnsplashModal(false)}>
                    <div className={`${styles.modal} ${styles.unsplashModal}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>ค้นหารูปจาก Unsplash</h2>
                            <button className={styles.iconBtn} onClick={() => setShowUnsplashModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.unsplashSearchRow}>
                                <input
                                    type="text"
                                    value={unsplashQuery}
                                    onChange={(e) => setUnsplashQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSearchUnsplash();
                                        }
                                    }}
                                    className={styles.unsplashSearchInput}
                                    placeholder={
                                        unsplashTarget === 'chat'
                                            ? 'เช่น เมืองกลางคืน, rain, fantasy'
                                            : unsplashTarget === 'narrative'
                                                ? 'เช่น fantasy landscape, storm, magic forest'
                                                : 'เช่น anime portrait, character'
                                    }
                                />
                                <button
                                    type="button"
                                    className={styles.unsplashSearchBtn}
                                    onClick={() => handleSearchUnsplash()}
                                    disabled={isUnsplashLoading || !unsplashQuery.trim()}
                                >
                                    {isUnsplashLoading ? <Loader2 size={16} className={styles.spinner} /> : 'ค้นหา'}
                                </button>
                            </div>

                            {unsplashError && (
                                <div className={styles.unsplashError}>{unsplashError}</div>
                            )}

                            {!isUnsplashLoading && !unsplashError && unsplashResults.length === 0 && (
                                <div className={styles.unsplashEmpty}>ยังไม่พบรูป ลองค้นหาคำอื่น</div>
                            )}

                            <div className={styles.unsplashGrid}>
                                {unsplashResults.map((image) => (
                                    <button
                                        key={image.id}
                                        type="button"
                                        className={styles.unsplashCard}
                                        onClick={() => handleSelectUnsplashImage(image)}
                                    >
                                        <img src={image.thumb} alt={image.alt} className={styles.unsplashThumb} />
                                        <span className={styles.unsplashCredit}>by {image.author}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {notice && (
                <div className={styles.noticeOverlay}>
                    <div
                        className={`${styles.noticeDialog} ${notice.tone === 'success' ? styles.noticeSuccess : styles.noticeError}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.noticeIcon}>
                            {notice.tone === 'success' ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
                        </div>
                        <div className={styles.noticeContent}>
                            <div className={styles.noticeTitle}>{notice.title}</div>
                            <div className={styles.noticeMessage}>{notice.message}</div>
                        </div>
                        <button className={styles.noticeClose} onClick={() => setNotice(null)} aria-label="ปิดแจ้งเตือน">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}
        </main >
    );
}
