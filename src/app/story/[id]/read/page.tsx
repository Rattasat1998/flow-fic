'use client';

import { useState, useRef, useEffect, useMemo, use, useCallback, type PointerEvent as ReactPointerEvent } from 'react';

import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatActionBar } from '@/components/chat/ChatActionBar';
import { ChatMessage } from '@/types/chat';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { List, Heart, Bookmark, BookmarkCheck, MoreVertical, X, Send, Lock, Coins } from 'lucide-react';
import { BranchChoiceOverlay, OverlayChoice } from '@/components/story/BranchChoiceOverlay';
import styles from './story.module.css';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import {
  markStoryProgressCompleted,
  mergeStoredStoryProgress,
  normalizeStoredStoryProgress,
  normalizeStoryProgressVersionValue,
  preserveCompletionSummary,
  readStoredStoryProgress,
  type ReaderProgressRow,
  type StoredChapterProgress,
  type StoredStoryProgress,
  writeStoredStoryProgress,
} from '@/lib/readerProgress';
import { getOrCreateTrackingSessionId } from '@/lib/trackingSession';
import { useAuth } from '@/contexts/AuthContext';
import { useTracking } from '@/hooks/useTracking';

interface StoryPageProps {
  params: Promise<{ id: string }>;
}

type DBStory = {
  id: string;
  title: string;
  pen_name: string;
  cover_url: string | null;
  cover_wide_url: string | null;
  writing_style: string;
  path_mode: 'linear' | 'branching';
  entry_chapter_id: string | null;
  settings: unknown;
  status: string;
  user_id: string;
};

type ReaderChapterRpcRow = {
  id: string;
  title: string | null;
  order_index: number;
  is_premium: boolean;
  coin_price: number;
  can_read: boolean;
  access_source: string;
  content_payload: unknown;
};

type ReaderChapterChoiceRpcRow = {
  id: string;
  choice_text: string | null;
  outcome_text: string | null;
  order_index: number;
  to_chapter_id: string | null;
  to_title: string | null;
  to_order_index: number | null;
  is_premium: boolean;
  coin_price: number;
  can_read: boolean;
  access_source: string;
};

type ChapterChoiceRow = {
  id: string;
  choice_text: string | null;
  outcome_text: string | null;
  order_index: number | null;
  to_chapter_id: string | null;
};

type EmbeddedBranchChoice = {
  id: string;
  choiceText: string;
  outcomeText: string;
  orderIndex: number;
  toChapterId: string | null;
};

type ChapterContentSourceRow = {
  draft_content: unknown;
  published_content: unknown;
  content: unknown;
};

// New Block Types
type Block = {
  id: string;
  type: 'paragraph' | 'image';
  text: string;
  characterId: string | null;
  imageUrl?: string;
  isFlashback: boolean;
};

type Character = {
  id: string;
  name: string;
  image_url: string | null;
};

type ReaderChapter = {
  id: string;
  title: string;
  povCharacterId: string | null;
  blocks: Block[];
  chatTheme: string;
  isEnding: boolean;
  choiceTimerSeconds: number;
  isPremium: boolean;
  coinPrice: number;
  rawContentPayload: unknown;
};

type ReaderChapterChoice = {
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

type ReaderChatMessage = ChatMessage & {
  chapterId: string;
  chapterIndex: number;
};

type ChapterNavigationMode = 'restore' | 'top';

type CommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { pen_name: string | null; avatar_url: string | null } | null;
};

type CommentQueryRow = Omit<CommentRow, 'profiles'>;

type ProfileQueryRow = {
  id: string;
  pen_name: string | null;
  avatar_url: string | null;
};

type StorySettings = {
  allowComments: boolean;
  hideHeartCount: boolean;
};

type ChapterUnlockRow = {
  chapter_id: string;
};

type ReaderBootstrapCommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    pen_name: string | null;
    avatar_url: string | null;
  } | null;
};

type ReaderBootstrapRpcRow = {
  story: DBStory | null;
  chapters: ReaderChapterRpcRow[] | null;
  characters: Character[] | null;
  coin_balance: number | null;
  is_vip_active: boolean | null;
  unlocked_chapter_ids: string[] | null;
  reader_progress: ReaderProgressRow | null;
  story_progress_version: string | null;
  like_count: number | null;
  liked_chapter_id: string | null;
  favorited_chapter_id: string | null;
  comments: ReaderBootstrapCommentRow[] | null;
};
const CHAPTER_READ_SESSION_CACHE_PREFIX = 'flowfic:chapter-read-session';
let readerBootstrapRpcAvailability: boolean | null = null;
let readerChapterReadRpcAvailability: boolean | null = null;

const getChapterReadSessionCacheKey = (sessionId: string) =>
  `${CHAPTER_READ_SESSION_CACHE_PREFIX}:${sessionId}`;

const hasChapterReadSessionCacheEntry = (sessionId: string, chapterId: string): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    const raw = sessionStorage.getItem(getChapterReadSessionCacheKey(sessionId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed?.[chapterId] === true;
  } catch {
    return false;
  }
};

const markChapterReadSessionCacheEntry = (sessionId: string, chapterId: string) => {
  if (typeof window === 'undefined') return;

  try {
    const raw = sessionStorage.getItem(getChapterReadSessionCacheKey(sessionId));
    const parsed = raw ? JSON.parse(raw) as Record<string, boolean> : {};
    if (parsed?.[chapterId] === true) return;

    sessionStorage.setItem(
      getChapterReadSessionCacheKey(sessionId),
      JSON.stringify({
        ...(parsed || {}),
        [chapterId]: true,
      })
    );
  } catch {
    // Ignore sessionStorage failures
  }
};

const isMissingReaderBootstrapRpcError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const message = typeof maybeError.message === 'string' ? maybeError.message : '';
  const details = typeof maybeError.details === 'string' ? maybeError.details : '';
  const hint = typeof maybeError.hint === 'string' ? maybeError.hint : '';
  const combined = `${message} ${details} ${hint}`;

  return maybeError.code === 'PGRST202' || combined.includes('get_reader_bootstrap');
};

const isMissingRecordChapterReadRpcError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const message = typeof maybeError.message === 'string' ? maybeError.message : '';
  const details = typeof maybeError.details === 'string' ? maybeError.details : '';
  const hint = typeof maybeError.hint === 'string' ? maybeError.hint : '';
  const combined = `${message} ${details} ${hint}`;

  return maybeError.code === 'PGRST202' || combined.includes('record_chapter_read');
};

const defaultStorySettings: StorySettings = {
  allowComments: true,
  hideHeartCount: false,
};

const MAX_BRANCH_TIMER_SECONDS = 300;
const NARRATIVE_BOOKMARK_VIEWPORT_OFFSET = 128;
const NARRATIVE_BOOKMARK_LONG_PRESS_MS = 400;
const NARRATIVE_BOOKMARK_LONG_PRESS_MOVE_THRESHOLD = 12;

type StoredManualNarrativeBookmark = {
  chapterId: string;
  blockId: string | null;
  scrollY: number | null;
  updatedAt: string;
};

const normalizeStorySettings = (settings: unknown): StorySettings => {
  if (!settings || typeof settings !== 'object') return defaultStorySettings;

  const raw = settings as Record<string, unknown>;
  return {
    allowComments: typeof raw.allowComments === 'boolean' ? raw.allowComments : defaultStorySettings.allowComments,
    hideHeartCount: typeof raw.hideHeartCount === 'boolean' ? raw.hideHeartCount : defaultStorySettings.hideHeartCount,
  };
};

const getNarrativeBlockRefKey = (chapterId: string, blockId: string) => `${chapterId}:${blockId}`;

const getStoredManualNarrativeBookmark = (progress: StoredStoryProgress | null): StoredManualNarrativeBookmark | null => {
  if (!progress) return null;

  let latestBookmark: StoredManualNarrativeBookmark | null = null;
  let latestBookmarkMs = 0;

  Object.entries(progress.chapterStates || {}).forEach(([chapterId, chapterState]) => {
    const blockId = typeof chapterState.manualBookmarkBlockId === 'string' && chapterState.manualBookmarkBlockId.trim().length > 0
      ? chapterState.manualBookmarkBlockId
      : null;
    const scrollY = typeof chapterState.manualBookmarkScrollY === 'number'
      ? Math.max(0, Math.floor(chapterState.manualBookmarkScrollY))
      : null;
    const hasBookmark = blockId !== null || scrollY !== null;

    if (!hasBookmark) return;

    const updatedAt = chapterState.manualBookmarkUpdatedAt || chapterState.updatedAt || progress.updatedAt;
    const updatedAtMs = Date.parse(updatedAt);
    const normalizedUpdatedAtMs = Number.isFinite(updatedAtMs) ? updatedAtMs : 0;

    if (latestBookmark && normalizedUpdatedAtMs <= latestBookmarkMs) return;

    latestBookmark = {
      chapterId,
      blockId,
      scrollY,
      updatedAt,
    };
    latestBookmarkMs = normalizedUpdatedAtMs;
  });

  return latestBookmark;
};

const normalizeChoiceTimerSeconds = (value: unknown): number => {
  if (typeof value === 'string' && value.trim() === '') return 0;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(MAX_BRANCH_TIMER_SECONDS, Math.floor(numericValue)));
};

const fallbackAvatar = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=200&q=80';
const BRANCHING_FEATURE_ENABLED = FEATURE_FLAGS.branching;

const normalizeReaderBlocks = (rawBlocks: unknown): Block[] => {
  if (!Array.isArray(rawBlocks)) return [];

  const normalizedBlocks: Block[] = [];

  rawBlocks.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const block = item as Record<string, unknown>;

    normalizedBlocks.push({
      id: typeof block.id === 'string' && block.id ? block.id : `reader-block-${index}`,
      type: block.type === 'image' ? 'image' : 'paragraph',
      text: typeof block.text === 'string' ? block.text : '',
      characterId: typeof block.characterId === 'string' ? block.characterId : null,
      imageUrl: typeof block.imageUrl === 'string' ? block.imageUrl : undefined,
      isFlashback: block.isFlashback === true || block.is_flashback === true,
    });
  });

  return normalizedBlocks;
};

const parseChapterBlocks = (content: unknown): {
  povCharacterId: string | null;
  blocks: Block[];
  chatTheme: string;
  isEnding: boolean;
  choiceTimerSeconds: number;
} => {
  if (!content) return { povCharacterId: null, blocks: [], chatTheme: 'white', isEnding: false, choiceTimerSeconds: 0 };

  if (typeof content === 'object' && content !== null && 'blocks' in content) {
    const parsedContent = content as Record<string, unknown>;
    const parsedBlocks = normalizeReaderBlocks(parsedContent.blocks);
    return {
      povCharacterId: typeof parsedContent.povCharacterId === 'string' ? parsedContent.povCharacterId : null,
      blocks: parsedBlocks,
      chatTheme: typeof parsedContent.chatTheme === 'string' ? parsedContent.chatTheme : 'white',
      isEnding: parsedContent.isEnding === true || parsedContent.is_ending === true,
      choiceTimerSeconds: normalizeChoiceTimerSeconds(
        parsedContent.choiceTimerSeconds ?? parsedContent.choice_timer_seconds
      ),
    };
  }

  // Legacy format migration
  let textToParse = '';
  if (typeof content === 'string') {
    textToParse = content;
  } else if (typeof content === 'object' && content !== null && 'text' in content) {
    const parsedContent = content as Record<string, unknown>;
    textToParse = typeof parsedContent.text === 'string' ? parsedContent.text : '';
  }

  if (!textToParse) return { povCharacterId: null, blocks: [], chatTheme: 'white', isEnding: false, choiceTimerSeconds: 0 };

  return {
    povCharacterId: null,
    chatTheme: 'white',
    isEnding: false,
    choiceTimerSeconds: 0,
    blocks: textToParse.split('\n').filter(line => line.trim() !== '').map((line, idx) => ({
      id: `legacy-${idx}`,
      type: 'paragraph',
      text: line,
      characterId: null,
      isFlashback: false,
    }))
  };
};

const parseEmbeddedBranchChoices = (content: unknown): EmbeddedBranchChoice[] => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return [];
  const payload = content as Record<string, unknown>;
  const rawChoices = Array.isArray(payload.branchChoices)
    ? payload.branchChoices
    : Array.isArray(payload.chapterChoices)
      ? payload.chapterChoices
      : [];

  return rawChoices
    .map((choice, index) => {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return null;
      const item = choice as Record<string, unknown>;
      const choiceText = typeof item.choiceText === 'string'
        ? item.choiceText
        : typeof item.choice_text === 'string'
          ? item.choice_text
          : '';
      const outcomeText = typeof item.outcomeText === 'string'
        ? item.outcomeText
        : typeof item.outcome_text === 'string'
          ? item.outcome_text
          : '';
      const toChapterRaw = item.toChapterId ?? item.to_chapter_id;
      const toChapterId = typeof toChapterRaw === 'string' && toChapterRaw.trim().length > 0
        ? toChapterRaw
        : null;
      const orderRaw = item.orderIndex ?? item.order_index;
      const orderIndex = Number.isFinite(Number(orderRaw)) ? Number(orderRaw) : index;
      const id = typeof item.id === 'string' && item.id ? item.id : `embedded-choice-${index}`;

      return {
        id,
        choiceText,
        outcomeText,
        orderIndex,
        toChapterId,
      } satisfies EmbeddedBranchChoice;
    })
    .filter((choice): choice is EmbeddedBranchChoice => choice !== null)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((choice, index) => ({
      ...choice,
      orderIndex: index,
    }));
};

const getReaderParagraphClassName = (hasCharacter: boolean, isFlashback: boolean): string => {
  const baseClassName = hasCharacter ? styles.readerBlockParagraph : styles.readerPlainParagraph;
  const modifierClassName = hasCharacter && isFlashback
    ? styles.readerParagraphSpeechFlashback
    : hasCharacter
      ? styles.readerParagraphSpeech
      : isFlashback
        ? styles.readerParagraphFlashback
        : '';

  return [baseClassName, modifierClassName].filter(Boolean).join(' ');
};

export default function StoryPage({ params }: StoryPageProps) {
  const unwrappedParams = use(params);
  const storyId = unwrappedParams.id;
  const { user } = useAuth();
  const userId = user?.id || null;
  const { trackEvent } = useTracking({ autoPageView: true, pagePath: `/story/${storyId}/read`, storyId });

  const [messages, setMessages] = useState<ReaderChatMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dbStory, setDbStory] = useState<DBStory | null>(null);
  const searchParams = useSearchParams();
  const initialChapterIdParam = (searchParams.get('chapterId') || '').trim();
  const initialChapterParam = searchParams.get('chapter');
  const hasExplicitChapterParam = initialChapterIdParam.length > 0 || initialChapterParam !== null;
  const parsedInitialChapterIndex = initialChapterParam ? parseInt(initialChapterParam, 10) : 0;
  const initialChapterIndex = Number.isFinite(parsedInitialChapterIndex) && parsedInitialChapterIndex >= 0
    ? parsedInitialChapterIndex
    : 0;
  const shouldRestartFromBeginning = searchParams.get('restart') === '1';
  const isPreviewMode = searchParams.get('preview') === '1';
  const previewChapterId = searchParams.get('previewChapter');

  const [dbChapters, setDbChapters] = useState<ReaderChapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(initialChapterIndex);
  const [chapterChoices, setChapterChoices] = useState<ReaderChapterChoice[]>([]);
  const [chapterChoicesStateChapterId, setChapterChoicesStateChapterId] = useState<string | null>(null);
  const [loadingChoicesChapterId, setLoadingChoicesChapterId] = useState<string | null>(null);
  const [isLoadingChoices, setIsLoadingChoices] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [showChoiceOverlay, setShowChoiceOverlay] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const narrativeChoicePanelRef = useRef<HTMLDivElement>(null);
  const narrativeCompletionSentinelRef = useRef<HTMLDivElement>(null);
  const narrativeBlockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chapterChoicesRequestRef = useRef(0);
  const lastRestoredChapterRef = useRef<string | null>(null);
  const chapterNavigationModeRef = useRef<ChapterNavigationMode>('restore');
  const longPressBookmarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressBookmarkPointerRef = useRef<{
    pointerId: number;
    chapterId: string;
    blockId: string;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressBookmarkContextMenuRef = useRef(false);
  const pendingProgressRef = useRef<StoredStoryProgress | null>(null);
  const progressSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressSyncInFlightRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownChapterRef = useRef<string | null>(null);
  const currentChapterRef = useRef<ReaderChapter | null>(null);
  const currentChapterChoicesRef = useRef<ReaderChapterChoice[]>([]);

  // Like / Favorite / Comment state
  const [likedChapterId, setLikedChapterId] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [favoritedChapterId, setFavoritedChapterId] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [storySettings, setStorySettings] = useState<StorySettings>(defaultStorySettings);
  const [coinBalance, setCoinBalance] = useState(0);
  const [isVipAccessActive, setIsVipAccessActive] = useState(false);
  const [unlockedChapterIds, setUnlockedChapterIds] = useState<string[]>([]);
  const [isUnlockingChapterId, setIsUnlockingChapterId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null);
  const [unlockConfirmChapter, setUnlockConfirmChapter] = useState<{
    id: string;
    title: string;
    coinPrice: number;
  } | null>(null);
  const [coinCollectedToast, setCoinCollectedToast] = useState<{ coins: number; balance: number } | null>(null);
  const [narrativeChoicePanelVisibleChapterId, setNarrativeChoicePanelVisibleChapterId] = useState<string | null>(null);
  const [choiceCountdownRemainingMs, setChoiceCountdownRemainingMs] = useState<number | null>(null);
  const [visibleNarrativeBookmark, setVisibleNarrativeBookmark] = useState<{ chapterId: string; blockId: string } | null>(null);
  const [hoveredBookmarkBlockId, setHoveredBookmarkBlockId] = useState<string | null>(null);
  const [storyProgressVersion, setStoryProgressVersion] = useState<string | null>(null);

  const setVisibleNarrativeBookmarkForChapter = useCallback((chapterId: string, blockId: string | null) => {
    setVisibleNarrativeBookmark((prev) => {
      if (!blockId) {
        return prev?.chapterId === chapterId ? null : prev;
      }

      if (prev?.chapterId === chapterId && prev.blockId === blockId) {
        return prev;
      }

      return { chapterId, blockId };
    });
  }, []);

  const getNearestNarrativeAnchorBlockId = useCallback((chapter: ReaderChapter | null): string | null => {
    if (!chapter) return null;

    let nearestBlockId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    chapter.blocks.forEach((block) => {
      const blockNode = narrativeBlockRefs.current[getNarrativeBlockRefKey(chapter.id, block.id)];
      if (!blockNode) return;

      const rect = blockNode.getBoundingClientRect();
      const distance = rect.bottom < NARRATIVE_BOOKMARK_VIEWPORT_OFFSET
        ? NARRATIVE_BOOKMARK_VIEWPORT_OFFSET - rect.bottom
        : Math.abs(rect.top - NARRATIVE_BOOKMARK_VIEWPORT_OFFSET);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestBlockId = block.id;
      }
    });

    return nearestBlockId;
  }, []);

  const flushPendingProgressToDatabase = useCallback(async () => {
    if (isPreviewMode || !userId) return;
    if (progressSyncInFlightRef.current) return;

    const pending = pendingProgressRef.current;
    if (!pending) return;

    progressSyncInFlightRef.current = true;
    pendingProgressRef.current = null;

    const { error } = await supabase
      .from('reader_progress')
      .upsert({
        user_id: userId,
        story_id: storyId,
        last_chapter_id: pending.lastChapterId,
        last_chapter_index: pending.lastChapterIndex,
        chapter_states: pending.chapterStates,
        completed_at: pending.completedAt,
        completed_chapter_id: pending.completedChapterId,
        completed_story_version: pending.completedStoryVersion,
      }, {
        onConflict: 'user_id,story_id',
      });

    progressSyncInFlightRef.current = false;

    if (error) {
      pendingProgressRef.current = pending;
      return;
    }
  }, [isPreviewMode, userId, storyId]);

  const scheduleProgressSync = useCallback((progress: StoredStoryProgress) => {
    if (isPreviewMode || !userId) return;

    pendingProgressRef.current = progress;
    if (progressSyncTimerRef.current) {
      clearTimeout(progressSyncTimerRef.current);
    }
    progressSyncTimerRef.current = setTimeout(() => {
      progressSyncTimerRef.current = null;
      void flushPendingProgressToDatabase();
    }, 1000);
  }, [isPreviewMode, userId, flushPendingProgressToDatabase]);

  const updateStoredStoryProgress = useCallback((
    updater: (previous: StoredStoryProgress | null, nowIso: string) => StoredStoryProgress | null
  ) => {
    if (isPreviewMode) return null;

    const previous = readStoredStoryProgress(storyId, userId);
    const nowIso = new Date().toISOString();
    const nextProgress = updater(previous, nowIso);
    if (!nextProgress) return null;

    const nextWithCompletion = preserveCompletionSummary(previous, nextProgress);

    writeStoredStoryProgress(storyId, userId, nextWithCompletion);
    scheduleProgressSync(nextWithCompletion);
    return nextWithCompletion;
  }, [isPreviewMode, scheduleProgressSync, storyId, userId]);

  const clearManualBookmarkFields = useCallback((chapterState?: StoredChapterProgress): StoredChapterProgress | undefined => {
    if (!chapterState) return chapterState;
    const {
      manualBookmarkBlockId,
      manualBookmarkScrollY,
      manualBookmarkUpdatedAt,
      ...rest
    } = chapterState;
    void manualBookmarkBlockId;
    void manualBookmarkScrollY;
    void manualBookmarkUpdatedAt;
    return rest;
  }, []);

  useEffect(() => {
    return () => {
      if (progressSyncTimerRef.current) {
        clearTimeout(progressSyncTimerRef.current);
        progressSyncTimerRef.current = null;
      }
      void flushPendingProgressToDatabase();
    };
  }, [flushPendingProgressToDatabase]);

  const mapReaderChapterRows = useCallback((rows: ReaderChapterRpcRow[]) => {
    return rows.map((row) => {
      const parsedContent = row.can_read && row.content_payload
        ? parseChapterBlocks(row.content_payload)
        : { povCharacterId: null, blocks: [], chatTheme: 'white', isEnding: false, choiceTimerSeconds: 0 };

      return {
        id: row.id,
        title: row.title || 'ไม่มีชื่อ',
        povCharacterId: parsedContent.povCharacterId,
        blocks: parsedContent.blocks,
        chatTheme: parsedContent.chatTheme,
        isEnding: parsedContent.isEnding,
        choiceTimerSeconds: parsedContent.choiceTimerSeconds,
        isPremium: !!row.is_premium,
        coinPrice: Math.max(0, row.coin_price || 0),
        rawContentPayload: row.content_payload,
      } satisfies ReaderChapter;
    });
  }, []);

  const fetchReaderChapters = useCallback(
    async (chapterIdFilter?: string) => {
      const { data, error } = await supabase.rpc('get_reader_chapters', {
        p_story_id: storyId,
        p_preview_mode: isPreviewMode,
        p_preview_chapter_id: chapterIdFilter || null,
      });

      if (error) {
        throw error;
      }

      const rows = ((data as ReaderChapterRpcRow[] | null) || [])
        .slice()
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

      return mapReaderChapterRows(rows);
    },
    [storyId, isPreviewMode, mapReaderChapterRows]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchReaderStory = async () => {
      setIsLoading(true);
      setLoadError('');
      setLikeCount(0);
      setLikedChapterId(null);
      setFavoritedChapterId(null);
      setComments([]);
      setStoryProgressVersion(null);

      // Fetch Story
      let storyQuery = supabase
        .from('stories')
        .select('id, title, pen_name, cover_url, cover_wide_url, writing_style, path_mode, entry_chapter_id, settings, status, user_id')
        .eq('id', storyId);

      if (!isPreviewMode) {
        storyQuery = storyQuery.eq('status', 'published');
      }

      const { data: storyData, error: storyError } = await storyQuery.single();

      if (cancelled) return;

      if (storyError || !storyData) {
        setLoadError(isPreviewMode ? 'ไม่พบเรื่องสำหรับพรีวิว' : 'ไม่พบเรื่องนี้ หรือยังไม่ได้เผยแพร่');
        setIsLoading(false);
        return;
      }

      if (isPreviewMode) {
        if (!user) {
          setLoadError('กรุณาเข้าสู่ระบบเพื่อดูตัวอย่าง');
          setIsLoading(false);
          return;
        }
        if ((storyData as DBStory).user_id !== user.id) {
          setLoadError('ไม่มีสิทธิ์ดูตัวอย่างเรื่องนี้');
          setIsLoading(false);
          return;
        }
      } else if ((storyData as DBStory).status !== 'published') {
        setLoadError('ไม่พบเรื่องนี้ หรือยังไม่ได้เผยแพร่');
        setIsLoading(false);
        return;
      }

      const normalizedStorySettings = normalizeStorySettings((storyData as DBStory).settings);
      setStorySettings(normalizedStorySettings);
      if (!normalizedStorySettings.allowComments) {
        setShowComments(false);
      }
      const normalizedPathMode = BRANCHING_FEATURE_ENABLED && (storyData as DBStory).path_mode === 'branching'
        ? 'branching'
        : 'linear';

      const charactersPromise = supabase
        .from('characters')
        .select('id, name, image_url')
        .eq('story_id', storyId)
        .order('order_index', { ascending: true });

      let parsedChapters: ReaderChapter[] = [];
      let remoteProgress: StoredStoryProgress | null = null;
      let nextCharacters: Character[] = [];
      let nextCoinBalance = 0;
      let nextUnlockedChapterIds: string[] = [];
      let nextIsVipAccessActive = false;
      let nextStoryProgressVersion: string | null = null;
      let preloadedLikeCount: number | null = null;
      let preloadedLikedChapterId: string | null = null;
      let preloadedFavoritedChapterId: string | null = null;
      let preloadedComments: CommentRow[] | null = null;
      let engagementPreloaded = false;

      let bootstrapRow: ReaderBootstrapRpcRow | null = null;

      if (readerBootstrapRpcAvailability !== false) {
        const { data: bootstrapRows, error: bootstrapError } = await supabase.rpc('get_reader_bootstrap', {
          p_story_id: storyId,
          p_preview_mode: isPreviewMode,
          p_preview_chapter_id: previewChapterId || null,
        });

        if (bootstrapError) {
          if (isMissingReaderBootstrapRpcError(bootstrapError)) {
            readerBootstrapRpcAvailability = false;
          } else {
            console.warn('get_reader_bootstrap failed, falling back to direct reader queries', bootstrapError);
          }
        } else {
          readerBootstrapRpcAvailability = true;
          bootstrapRow = Array.isArray(bootstrapRows) && bootstrapRows.length > 0
            ? (bootstrapRows[0] as ReaderBootstrapRpcRow)
            : null;
        }
      }

      if (bootstrapRow) {
        const chapterRows = (Array.isArray(bootstrapRow.chapters) ? bootstrapRow.chapters : [])
          .slice()
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

        parsedChapters = mapReaderChapterRows(chapterRows);
        nextCharacters = Array.isArray(bootstrapRow.characters) ? bootstrapRow.characters : [];
        nextCoinBalance = Math.max(0, Number(bootstrapRow.coin_balance || 0));
        nextUnlockedChapterIds = Array.isArray(bootstrapRow.unlocked_chapter_ids)
          ? bootstrapRow.unlocked_chapter_ids.map((chapterId) => String(chapterId))
          : [];
        nextIsVipAccessActive = !!bootstrapRow.is_vip_active;

        if (bootstrapRow.reader_progress && typeof bootstrapRow.reader_progress === 'object') {
          remoteProgress = normalizeStoredStoryProgress(bootstrapRow.reader_progress as ReaderProgressRow);
        }
        nextStoryProgressVersion = normalizeStoryProgressVersionValue(bootstrapRow.story_progress_version);

        preloadedLikeCount = Math.max(0, Number(bootstrapRow.like_count || 0));
        preloadedLikedChapterId = bootstrapRow.liked_chapter_id || null;
        preloadedFavoritedChapterId = bootstrapRow.favorited_chapter_id || null;

        if (normalizedStorySettings.allowComments) {
          const bootstrapComments = Array.isArray(bootstrapRow.comments)
            ? bootstrapRow.comments
            : [];

          preloadedComments = bootstrapComments.map((row) => ({
            id: row.id,
            user_id: row.user_id,
            content: row.content,
            created_at: row.created_at,
            profiles: row.profiles || null,
          }));
        } else {
          preloadedComments = [];
        }

        engagementPreloaded = true;
      }

      const progressVersionPromise = !isPreviewMode
        ? supabase.rpc('get_story_progress_version', { p_story_id: storyId })
        : Promise.resolve({ data: null, error: null });

      const accessPromise = !isPreviewMode && user
        ? Promise.all([
          supabase
            .from('wallets')
            .select('coin_balance')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('vip_entitlements')
            .select('status, current_period_end')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('chapter_unlocks')
            .select('chapter_id')
            .eq('story_id', storyId)
            .eq('user_id', user.id),
          supabase
            .from('reader_progress')
            .select('last_chapter_id, last_chapter_index, chapter_states, updated_at, completed_at, completed_chapter_id, completed_story_version')
            .eq('story_id', storyId)
            .eq('user_id', user.id)
            .maybeSingle(),
        ])
        : Promise.resolve(null);

      if (!bootstrapRow) {
        try {
          const [charactersResult, parsedChaptersResult, accessResult, progressVersionResult] = await Promise.all([
            charactersPromise,
            fetchReaderChapters(),
            accessPromise,
            progressVersionPromise,
          ]);

          if (cancelled) return;

          nextCharacters = (charactersResult.data as Character[] | null) || [];
          parsedChapters = parsedChaptersResult;
          nextStoryProgressVersion = normalizeStoryProgressVersionValue(progressVersionResult.data);

          if (accessResult) {
            const [{ data: walletData }, { data: vipData }, { data: unlockRows }, { data: progressRow }] = accessResult;
            nextCoinBalance = walletData?.coin_balance || 0;
            nextUnlockedChapterIds = ((unlockRows as ChapterUnlockRow[] | null) || []).map((row) => row.chapter_id);
            nextIsVipAccessActive = !!vipData
              && vipData.status === 'active'
              && (!vipData.current_period_end || new Date(vipData.current_period_end).getTime() > Date.now());

            if (progressRow) {
              remoteProgress = normalizeStoredStoryProgress(progressRow as ReaderProgressRow);
            }
          }
        } catch {
          if (cancelled) return;
          setLoadError('ไม่สามารถโหลดตอนของเรื่องนี้ได้');
          setIsLoading(false);
          return;
        }
      }

      if (cancelled) return;

      setCharacters(nextCharacters);
      setCoinBalance(nextCoinBalance);
      setUnlockedChapterIds(nextUnlockedChapterIds);
      setIsVipAccessActive(nextIsVipAccessActive);
      setStoryProgressVersion(nextStoryProgressVersion);

      const normalizedStory: DBStory = {
        ...(storyData as DBStory),
        path_mode: normalizedPathMode,
      };

      setDbStory(normalizedStory);
      setDbChapters(parsedChapters);
      setMessages([]);
      setCurrentIndex(0);
      setIsUnlockingChapterId(null);
      setUnlockError(null);
      setUnlockNotice(null);
      setVisibleNarrativeBookmark(null);
      setHoveredBookmarkBlockId(null);
      lastRestoredChapterRef.current = null;
      const localStoredProgress = !isPreviewMode
        ? readStoredStoryProgress(storyId, userId)
        : null;
      const storedProgress = mergeStoredStoryProgress(localStoredProgress, remoteProgress);

      if (storedProgress) {
        writeStoredStoryProgress(storyId, userId, storedProgress);
      }

      const storyUsesChatStyle = normalizedStory.writing_style === 'chat';
      const storedManualNarrativeBookmark = !storyUsesChatStyle
        ? getStoredManualNarrativeBookmark(storedProgress)
        : null;
      const storedNarrativeBookmarkIndex = storedManualNarrativeBookmark
        ? parsedChapters.findIndex((chapter) => chapter.id === storedManualNarrativeBookmark.chapterId)
        : -1;
      const storedChapterId = storedProgress?.lastChapterId || null;
      const storedChapterIndex = storedChapterId
        ? parsedChapters.findIndex((chapter) => chapter.id === storedChapterId)
        : -1;

      let nextSelectedChapterIndex = 0;
      if (previewChapterId) {
        const previewIndex = parsedChapters.findIndex((chapter) => chapter.id === previewChapterId);
        nextSelectedChapterIndex = previewIndex >= 0 ? previewIndex : 0;
      } else if (shouldRestartFromBeginning) {
        if (normalizedPathMode === 'branching') {
          const entryIndex = normalizedStory.entry_chapter_id
            ? parsedChapters.findIndex((chapter) => chapter.id === normalizedStory.entry_chapter_id)
            : -1;
          nextSelectedChapterIndex = entryIndex >= 0 ? entryIndex : 0;
        } else {
          nextSelectedChapterIndex = 0;
        }
      } else if (normalizedPathMode === 'branching') {
        const requestedById = initialChapterIdParam
          ? parsedChapters.findIndex((chapter) => chapter.id === initialChapterIdParam)
          : -1;
        const entryIndex = normalizedStory.entry_chapter_id
          ? parsedChapters.findIndex((chapter) => chapter.id === normalizedStory.entry_chapter_id)
          : -1;

        if (requestedById >= 0) {
          nextSelectedChapterIndex = requestedById;
        } else if (!hasExplicitChapterParam && storyUsesChatStyle && storedChapterIndex >= 0) {
          nextSelectedChapterIndex = storedChapterIndex;
        } else if (!hasExplicitChapterParam && !storyUsesChatStyle && storedNarrativeBookmarkIndex >= 0) {
          nextSelectedChapterIndex = storedNarrativeBookmarkIndex;
        } else if (entryIndex >= 0) {
          nextSelectedChapterIndex = entryIndex;
        } else {
          nextSelectedChapterIndex = 0;
        }
      } else {
        const requestedById = initialChapterIdParam
          ? parsedChapters.findIndex((chapter) => chapter.id === initialChapterIdParam)
          : -1;
        if (requestedById >= 0) {
          nextSelectedChapterIndex = requestedById;
        } else if (!hasExplicitChapterParam && storyUsesChatStyle && storedChapterIndex >= 0) {
          nextSelectedChapterIndex = storedChapterIndex;
        } else if (!hasExplicitChapterParam && !storyUsesChatStyle && storedNarrativeBookmarkIndex >= 0) {
          nextSelectedChapterIndex = storedNarrativeBookmarkIndex;
        } else {
          nextSelectedChapterIndex = Math.min(initialChapterIndex, Math.max(parsedChapters.length - 1, 0));
        }
      }
      const shouldRestoreInitialProgress = !isPreviewMode
        && !shouldRestartFromBeginning
        && !hasExplicitChapterParam
        && (
          storyUsesChatStyle
            ? storedChapterIndex >= 0 && nextSelectedChapterIndex === storedChapterIndex
            : storedNarrativeBookmarkIndex >= 0 && nextSelectedChapterIndex === storedNarrativeBookmarkIndex
        );
      chapterNavigationModeRef.current = shouldRestoreInitialProgress ? 'restore' : 'top';
      setSelectedChapterIndex(nextSelectedChapterIndex);
      setIsLoading(false);

      if (engagementPreloaded) {
        setLikeCount(preloadedLikeCount || 0);
        setLikedChapterId(preloadedLikedChapterId);
        setFavoritedChapterId(preloadedFavoritedChapterId);
        setComments(preloadedComments || []);
        return;
      }

      void (async () => {
        const [likesCountResult, likeStatusResult, favoriteResult, commentsResult] = await Promise.all([
          supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('story_id', storyId),
          user
            ? supabase
              .from('likes')
              .select('chapter_id')
              .eq('story_id', storyId)
              .eq('user_id', user.id)
              .maybeSingle()
            : Promise.resolve(null),
          user
            ? supabase
              .from('favorites')
              .select('chapter_id')
              .eq('story_id', storyId)
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            : Promise.resolve(null),
          normalizedStorySettings.allowComments
            ? supabase
              .from('comments')
              .select('id, user_id, content, created_at')
              .eq('story_id', storyId)
              .order('created_at', { ascending: true })
              .limit(100)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setLikeCount(likesCountResult.count || 0);

        if (user) {
          setLikedChapterId(likeStatusResult?.data?.chapter_id || null);
          setFavoritedChapterId(favoriteResult?.data?.chapter_id || null);
        }

        if (!normalizedStorySettings.allowComments) {
          setComments([]);
          return;
        }

        if (!commentsResult || commentsResult.error || !commentsResult.data) {
          setComments([]);
          return;
        }

        const rawComments = commentsResult.data as CommentQueryRow[];
        const commentUserIds = Array.from(new Set(rawComments.map((row) => row.user_id).filter(Boolean)));
        const profileMap = new Map<string, { pen_name: string | null; avatar_url: string | null }>();

        if (commentUserIds.length > 0) {
          const { data: profileRows } = await supabase
            .from('profiles')
            .select('id, pen_name, avatar_url')
            .in('id', commentUserIds);

          if (cancelled) return;

          ((profileRows as ProfileQueryRow[] | null) || []).forEach((row) => {
            profileMap.set(row.id, { pen_name: row.pen_name, avatar_url: row.avatar_url });
          });
        }

        if (cancelled) return;

        setComments(rawComments.map((row) => ({
          ...row,
          profiles: profileMap.get(row.user_id) || null,
        })));
      })();
    };

    void fetchReaderStory();
    return () => {
      cancelled = true;
    };
  }, [
    storyId,
    user,
    userId,
    isPreviewMode,
    previewChapterId,
    shouldRestartFromBeginning,
    hasExplicitChapterParam,
    initialChapterIndex,
    initialChapterIdParam,
    fetchReaderChapters,
    mapReaderChapterRows,
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isStoryOwner = !!user && dbStory?.user_id === user.id;
  const isVipActive = isVipAccessActive;

  const unlockedChapterIdSet = useMemo(() => new Set(unlockedChapterIds), [unlockedChapterIds]);

  const canReadChapter = useCallback((chapter: ReaderChapter | null | undefined) => {
    if (!chapter) return false;
    if (isPreviewMode || isStoryOwner) return true;
    if (!chapter.isPremium || chapter.coinPrice <= 0) return true;
    if (isVipActive) return true;
    return unlockedChapterIdSet.has(chapter.id);
  }, [isPreviewMode, isStoryOwner, isVipActive, unlockedChapterIdSet]);

  const isBranchingPath = BRANCHING_FEATURE_ENABLED && dbStory?.path_mode === 'branching';

  const fetchChapterChoices = useCallback(async (fromChapterId: string) => {
    const requestId = ++chapterChoicesRequestRef.current;

    if (!fromChapterId || !isBranchingPath) {
      if (requestId !== chapterChoicesRequestRef.current) return;
      setChapterChoicesStateChapterId(null);
      setLoadingChoicesChapterId(null);
      setChapterChoices([]);
      setChoicesError(null);
      setIsLoadingChoices(false);
      return;
    }

    const commitChoices = (choices: ReaderChapterChoice[], errorMessage: string | null) => {
      if (requestId !== chapterChoicesRequestRef.current) return false;
      setChapterChoicesStateChapterId(fromChapterId);
      setLoadingChoicesChapterId(null);
      setChapterChoices(choices.filter((choice) => !!choice.toChapterId));
      setChoicesError(errorMessage);
      setIsLoadingChoices(false);
      return true;
    };

    const getRenderableChoices = (choices: ReaderChapterChoice[]) =>
      choices.filter((choice) => !!choice.toChapterId);

    const mapWithResolvedTarget = (
      base: {
        id: string;
        choiceText: string;
        outcomeText: string;
        orderIndex: number;
        toChapterId: string | null;
        toTitle?: string;
        toOrderIndex?: number;
        isPremium?: boolean;
        coinPrice?: number;
        accessSource: string;
      }
    ): ReaderChapterChoice => {
      const targetChapterId = base.toChapterId;
      const targetIndex = targetChapterId
        ? dbChapters.findIndex((chapter) => chapter.id === targetChapterId)
        : -1;
      const targetChapter = targetIndex >= 0 ? dbChapters[targetIndex] : null;

      return {
        id: base.id,
        choiceText: base.choiceText || 'ทางเลือก',
        outcomeText: base.outcomeText || '',
        orderIndex: Number.isFinite(base.orderIndex) ? base.orderIndex : 0,
        toChapterId: targetChapter ? targetChapterId : null,
        toTitle: targetChapter?.title || base.toTitle || 'ไม่มีชื่อ',
        toOrderIndex: targetIndex >= 0 ? targetIndex : Number(base.toOrderIndex || 0),
        isPremium: targetChapter?.isPremium ?? !!base.isPremium,
        coinPrice: targetChapter?.coinPrice ?? Math.max(0, Number(base.coinPrice || 0)),
        canRead: targetChapter ? canReadChapter(targetChapter) : false,
        accessSource: targetChapter ? base.accessSource : 'missing_target',
      };
    };

    setChapterChoicesStateChapterId(fromChapterId);
    setLoadingChoicesChapterId(fromChapterId);
    setChapterChoices([]);
    setIsLoadingChoices(true);
    setChoicesError(null);
    let fallbackUnresolvedChoices: ReaderChapterChoice[] = [];

    const registerUnresolvedChoices = (choices: ReaderChapterChoice[]) => {
      if (choices.length === 0 || getRenderableChoices(choices).length > 0) return;
      if (fallbackUnresolvedChoices.length < choices.length) {
        fallbackUnresolvedChoices = choices;
      }
    };

    const commitIfHasReadableTarget = (choices: ReaderChapterChoice[]) => {
      const renderableChoices = getRenderableChoices(choices);
      if (renderableChoices.length > 0) {
        return commitChoices(renderableChoices, null);
      }
      registerUnresolvedChoices(choices);
      return false;
    };

    const { data, error } = await supabase.rpc('get_reader_chapter_choices', {
      p_story_id: storyId,
      p_from_chapter_id: fromChapterId,
      p_preview_mode: isPreviewMode,
    });

    if (requestId !== chapterChoicesRequestRef.current) return;

    if (!error) {
      const rpcRows = ((data as ReaderChapterChoiceRpcRow[] | null) || [])
        .slice()
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

      const mappedRpcRows = rpcRows.map((row) => mapWithResolvedTarget({
        id: row.id,
        choiceText: row.choice_text || 'ทางเลือก',
        outcomeText: row.outcome_text || '',
        orderIndex: row.order_index || 0,
        toChapterId: row.to_chapter_id || null,
        toTitle: row.to_title || 'ไม่มีชื่อ',
        toOrderIndex: Number(row.to_order_index || 0),
        isPremium: !!row.is_premium,
        coinPrice: Math.max(0, Number(row.coin_price || 0)),
        accessSource: row.access_source || 'rpc',
      }));

      if (commitIfHasReadableTarget(mappedRpcRows)) {
        return;
      }
    }

    const { data: localChoiceRows, error: localChoiceError } = await supabase
      .from('chapter_choices')
      .select('id, choice_text, outcome_text, order_index, to_chapter_id')
      .eq('story_id', storyId)
      .eq('from_chapter_id', fromChapterId)
      .order('order_index', { ascending: true });

    if (requestId !== chapterChoicesRequestRef.current) return;

    if (!localChoiceError && Array.isArray(localChoiceRows) && localChoiceRows.length > 0) {
      const mappedLocalRows = (localChoiceRows as ChapterChoiceRow[]).map((row) => mapWithResolvedTarget({
        id: row.id,
        choiceText: row.choice_text || 'ทางเลือก',
        outcomeText: row.outcome_text || '',
        orderIndex: Number(row.order_index || 0),
        toChapterId: row.to_chapter_id ? String(row.to_chapter_id) : null,
        accessSource: 'table',
      }));

      if (commitIfHasReadableTarget(mappedLocalRows)) {
        return;
      }
    }

    const sourceChapter = dbChapters.find((chapter) => chapter.id === fromChapterId) || null;
    let embeddedChoices = parseEmbeddedBranchChoices(sourceChapter?.rawContentPayload || null);

    if (embeddedChoices.length === 0) {
      const { data: chapterSourceRow, error: chapterSourceError } = await supabase
        .from('chapters')
        .select('draft_content, published_content, content')
        .eq('story_id', storyId)
        .eq('id', fromChapterId)
        .maybeSingle();

      if (requestId !== chapterChoicesRequestRef.current) return;

      if (!chapterSourceError && chapterSourceRow) {
        const chapterSource = chapterSourceRow as ChapterContentSourceRow;
        const payloadCandidates = isPreviewMode
          ? [chapterSource.draft_content, chapterSource.content, chapterSource.published_content]
          : [chapterSource.published_content, chapterSource.content, chapterSource.draft_content];

        for (const payloadCandidate of payloadCandidates) {
          const parsedChoices = parseEmbeddedBranchChoices(payloadCandidate);
          if (parsedChoices.length > 0) {
            embeddedChoices = parsedChoices;
            break;
          }
        }
      }
    }

    if (embeddedChoices.length > 0) {
      const mappedEmbeddedChoices = embeddedChoices.map((choice) => mapWithResolvedTarget({
        id: choice.id,
        choiceText: choice.choiceText || 'ทางเลือก',
        outcomeText: choice.outcomeText || '',
        orderIndex: choice.orderIndex,
        toChapterId: choice.toChapterId,
        accessSource: 'embedded',
      }));

      if (commitIfHasReadableTarget(mappedEmbeddedChoices)) {
        return;
      }

      commitChoices([], null);
      return;
    }

    if (fallbackUnresolvedChoices.length > 0) {
      commitChoices([], null);
      return;
    }

    commitChoices([], error && localChoiceError ? 'โหลดตัวเลือกเส้นทางไม่สำเร็จ' : null);
  }, [storyId, isPreviewMode, isBranchingPath, dbChapters, canReadChapter]);

  useEffect(() => {
    if (!user || isPreviewMode) return;

    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter) return;
    if (!chapter.isPremium || chapter.coinPrice <= 0) return;
    if (canReadChapter(chapter)) return;

    const timer = window.setTimeout(() => {
      setUnlockError(null);
      setUnlockNotice(null);
      setUnlockConfirmChapter((prev) => {
        if (prev?.id === chapter.id) return prev;
        return {
          id: chapter.id,
          title: chapter.title,
          coinPrice: chapter.coinPrice,
        };
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [user, isPreviewMode, dbChapters, selectedChapterIndex, canReadChapter]);

  useEffect(() => {
    const activeChapter = dbChapters[selectedChapterIndex] || null;

    if (!isBranchingPath || !activeChapter || activeChapter.isEnding) {
      chapterChoicesRequestRef.current += 1;
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchChapterChoices(activeChapter.id);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      chapterChoicesRequestRef.current += 1;
    };
  }, [isBranchingPath, dbChapters, selectedChapterIndex, fetchChapterChoices]);

  // Auto-dismiss coin collected toast
  useEffect(() => {
    if (!coinCollectedToast) return;
    const timer = setTimeout(() => setCoinCollectedToast(null), 2500);
    return () => clearTimeout(timer);
  }, [coinCollectedToast]);

  const activeWritingStyle = dbStory?.writing_style || 'narrative';
  const isChatStyle = activeWritingStyle === 'chat';
  const allowTocInReader = !(isBranchingPath && !isChatStyle);
  const activeChatThemeClass = useMemo(() => {
    const rawTheme = (dbChapters[selectedChapterIndex]?.chatTheme || 'white').toLowerCase();
    if (rawTheme === 'pink' || rawTheme === 'mint' || rawTheme === 'midnight') return rawTheme;
    if (rawTheme === 'dark') return 'midnight';
    return 'light';
  }, [dbChapters, selectedChapterIndex]);

  const activeChapter = dbChapters[selectedChapterIndex] || null;
  const activeChapterId = activeChapter?.id || null;
  const isCompletionTargetChapter = !!activeChapter && (
    isBranchingPath
      ? activeChapter.isEnding
      : selectedChapterIndex === Math.max(dbChapters.length - 1, 0)
  );
  const chapterChoicesForRead = useMemo(
    () => (
      activeChapterId && chapterChoicesStateChapterId === activeChapterId
        ? chapterChoices
        : []
    ),
    [activeChapterId, chapterChoicesStateChapterId, chapterChoices]
  );
  const choicesErrorForRead = useMemo(
    () => (
      activeChapterId && chapterChoicesStateChapterId === activeChapterId
        ? choicesError
        : null
    ),
    [activeChapterId, chapterChoicesStateChapterId, choicesError]
  );
  const isLoadingChoicesForRead = activeChapterId !== null && loadingChoicesChapterId === activeChapterId && isLoadingChoices;
  const activeChapterChoiceTimerSeconds = normalizeChoiceTimerSeconds(activeChapter?.choiceTimerSeconds);
  const isNarrativeChoicePanelVisible = !!activeChapter && narrativeChoicePanelVisibleChapterId === activeChapter.id;

  const activeStory = dbStory
    ? {
      title: dbStory.title,
      characterName: dbStory.pen_name,
      avatarUrl: dbStory.cover_url || dbStory.cover_wide_url || fallbackAvatar,
      wideCoverUrl: dbStory.cover_wide_url || dbStory.cover_url || null,
    }
    : null;
  const tocCharacters = useMemo(
    () => characters.filter((character) => character.name.trim().length > 0),
    [characters]
  );
  const normalizedNarrativeStoryTitle = activeStory?.title.trim().toLocaleLowerCase() || '';
  const normalizedNarrativeChapterTitle = activeChapter?.title.trim().toLocaleLowerCase() || '';
  const shouldShowNarrativeChapterTitle = !!activeChapter?.title.trim()
    && normalizedNarrativeChapterTitle !== normalizedNarrativeStoryTitle
    && !isBranchingPath;
  const shouldShowNarrativeChapterMeta = shouldShowNarrativeChapterTitle || !!activeChapter?.isPremium;

  const chatScript = useMemo<ReaderChatMessage[]>(() => {
    if (!isChatStyle) return [];

    if (!activeChapter) return [];

    const chapterTitleMessage: ReaderChatMessage = {
      id: `${activeChapter.id}_title`,
      sender: 'system',
      text: `${selectedChapterIndex + 1}: ${activeChapter.title}`,
      timestamp: selectedChapterIndex * 2 + 1,
      chapterId: activeChapter.id,
      chapterIndex: selectedChapterIndex,
    };

    const contentMessages: ReaderChatMessage[] = activeChapter.blocks.map((block, blockIdx) => {
      let sender: 'character' | 'player' | 'system' = 'character';
      if (!block.characterId) {
        sender = 'system';
      } else if (block.characterId === activeChapter.povCharacterId) {
        sender = 'player';
      }

      return {
        id: `${activeChapter.id}_block_${block.id || blockIdx}`,
        sender,
        text: block.text,
        timestamp: selectedChapterIndex * 1000 + blockIdx,
        type: block.type,
        imageUrl: block.imageUrl,
        characterId: block.characterId,
        chapterId: activeChapter.id,
        chapterIndex: selectedChapterIndex,
      };
    });

    return [chapterTitleMessage, ...contentMessages];
  }, [isChatStyle, activeChapter, selectedChapterIndex]);

  useEffect(() => {
    currentChapterRef.current = activeChapter;
  }, [activeChapter]);

  useEffect(() => {
    currentChapterChoicesRef.current = chapterChoicesForRead;
  }, [chapterChoicesForRead]);

  const resetChoiceCountdown = useCallback((nextRemainingMs: number | null = null) => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setChoiceCountdownRemainingMs(nextRemainingMs);
  }, []);

  const saveReadingProgress = useCallback((chapterId: string, chapterIndex: number, patch: Partial<StoredChapterProgress>) => {
    updateStoredStoryProgress((previous, nowIso) => ({
      lastChapterId: chapterId,
      lastChapterIndex: chapterIndex,
      updatedAt: nowIso,
      chapterStates: {
        ...(previous?.chapterStates || {}),
        [chapterId]: {
          ...(previous?.chapterStates?.[chapterId] || { updatedAt: nowIso }),
          ...patch,
          updatedAt: nowIso,
        },
      },
    }));
  }, [updateStoredStoryProgress]);

  const markCurrentChapterCompleted = useCallback(() => {
    if (isPreviewMode || !storyProgressVersion) return;

    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;

    updateStoredStoryProgress((previous, nowIso) => {
      if (previous?.completedChapterId && previous.completedStoryVersion === storyProgressVersion) {
        return previous;
      }

      return markStoryProgressCompleted(previous, {
        chapterId: chapter.id,
        chapterIndex: selectedChapterIndex,
        storyVersion: storyProgressVersion,
        nowIso,
      });
    });
  }, [
    isPreviewMode,
    storyProgressVersion,
    dbChapters,
    selectedChapterIndex,
    canReadChapter,
    updateStoredStoryProgress,
  ]);

  const clearPendingLongPressBookmark = useCallback(() => {
    if (longPressBookmarkTimerRef.current) {
      clearTimeout(longPressBookmarkTimerRef.current);
      longPressBookmarkTimerRef.current = null;
    }
    longPressBookmarkPointerRef.current = null;
  }, []);

  const setManualNarrativeBookmarkForBlock = useCallback((chapter: ReaderChapter, chapterIndex: number, blockId: string) => {
    if (isPreviewMode || isChatStyle) return;
    if (!chapter || !blockId || !canReadChapter(chapter)) return;

    const bookmarkNode = narrativeBlockRefs.current[getNarrativeBlockRefKey(chapter.id, blockId)];
    const bookmarkScrollY = bookmarkNode
      ? Math.max(0, Math.floor(window.scrollY + bookmarkNode.getBoundingClientRect().top - NARRATIVE_BOOKMARK_VIEWPORT_OFFSET))
      : Math.max(0, Math.floor(window.scrollY));

    updateStoredStoryProgress((previous, nowIso) => {
      const nextChapterStates: Record<string, StoredChapterProgress> = {};

      Object.entries(previous?.chapterStates || {}).forEach(([existingChapterId, chapterState]) => {
        nextChapterStates[existingChapterId] = clearManualBookmarkFields(chapterState) || { updatedAt: nowIso };
      });

      nextChapterStates[chapter.id] = {
        ...(nextChapterStates[chapter.id] || previous?.chapterStates?.[chapter.id] || { updatedAt: nowIso }),
        manualBookmarkBlockId: blockId,
        manualBookmarkScrollY: bookmarkScrollY,
        manualBookmarkUpdatedAt: nowIso,
        updatedAt: nowIso,
      };

      return {
        lastChapterId: chapter.id,
        lastChapterIndex: chapterIndex,
        updatedAt: nowIso,
        chapterStates: nextChapterStates,
      };
    });

    setVisibleNarrativeBookmarkForChapter(chapter.id, blockId);
  }, [
    isPreviewMode,
    isChatStyle,
    canReadChapter,
    updateStoredStoryProgress,
    clearManualBookmarkFields,
    setVisibleNarrativeBookmarkForChapter,
  ]);

  const handleClearManualNarrativeBookmark = useCallback((nextHoveredBlockId: string | null = null) => {
    if (isPreviewMode || isChatStyle) return;

    updateStoredStoryProgress((previous, nowIso) => {
      if (!previous) return null;

      const nextChapterStates: Record<string, StoredChapterProgress> = {};
      Object.entries(previous.chapterStates || {}).forEach(([chapterId, chapterState]) => {
        nextChapterStates[chapterId] = clearManualBookmarkFields(chapterState) || { updatedAt: nowIso };
      });

      return {
        ...previous,
        updatedAt: nowIso,
        chapterStates: nextChapterStates,
      };
    });

    setVisibleNarrativeBookmark(null);
    setHoveredBookmarkBlockId(nextHoveredBlockId);
  }, [isPreviewMode, isChatStyle, updateStoredStoryProgress, clearManualBookmarkFields]);

  const handleNarrativeBookmarkPointerDown = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    chapter: ReaderChapter,
    chapterIndex: number,
    blockId: string,
  ) => {
    if (event.pointerType === 'mouse') return;
    if (!chapter || !blockId || isPreviewMode || isChatStyle || !canReadChapter(chapter)) return;

    const target = event.target;
    if (target instanceof Element && target.closest('[data-bookmark-control="true"]')) {
      return;
    }

    clearPendingLongPressBookmark();

    longPressBookmarkPointerRef.current = {
      pointerId: event.pointerId,
      chapterId: chapter.id,
      blockId,
      startX: event.clientX,
      startY: event.clientY,
    };

    longPressBookmarkTimerRef.current = setTimeout(() => {
      const activePointer = longPressBookmarkPointerRef.current;
      if (!activePointer || activePointer.pointerId !== event.pointerId) return;

      suppressBookmarkContextMenuRef.current = true;
      clearPendingLongPressBookmark();
      setManualNarrativeBookmarkForBlock(chapter, chapterIndex, blockId);
      window.getSelection?.()?.removeAllRanges();
    }, NARRATIVE_BOOKMARK_LONG_PRESS_MS);
  }, [
    isPreviewMode,
    isChatStyle,
    canReadChapter,
    clearPendingLongPressBookmark,
    setManualNarrativeBookmarkForBlock,
  ]);

  const handleNarrativeBookmarkPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const activePointer = longPressBookmarkPointerRef.current;
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;

    const deltaX = Math.abs(event.clientX - activePointer.startX);
    const deltaY = Math.abs(event.clientY - activePointer.startY);
    if (deltaX > NARRATIVE_BOOKMARK_LONG_PRESS_MOVE_THRESHOLD || deltaY > NARRATIVE_BOOKMARK_LONG_PRESS_MOVE_THRESHOLD) {
      clearPendingLongPressBookmark();
    }
  }, [clearPendingLongPressBookmark]);

  const handleNarrativeBookmarkPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const activePointer = longPressBookmarkPointerRef.current;
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;
    clearPendingLongPressBookmark();
  }, [clearPendingLongPressBookmark]);

  const navigateToChapter = useCallback((
    nextIndex: number,
    options?: { mode?: ChapterNavigationMode; closeToc?: boolean },
  ) => {
    if (dbChapters.length === 0) return;

    const targetIndex = Math.max(0, Math.min(nextIndex, dbChapters.length - 1));
    const mode = options?.mode || 'top';

    setChoicesError(null);
    setUnlockError(null);
    setUnlockNotice(null);
    setShowChoiceOverlay(false);
    setHoveredBookmarkBlockId(null);
    clearPendingLongPressBookmark();

    if (mode === 'top') {
      setMessages([]);
      setCurrentIndex(0);
    }

    if (options?.closeToc) {
      setIsTocOpen(false);
    }

    if (targetIndex === selectedChapterIndex) {
      chapterNavigationModeRef.current = 'restore';

      if (mode === 'top') {
        const targetChapter = dbChapters[targetIndex];
        if (targetChapter && canReadChapter(targetChapter)) {
          if (isChatStyle) {
            saveReadingProgress(targetChapter.id, targetIndex, { chatNextIndex: 0 });
          } else {
            const stored = readStoredStoryProgress(storyId, userId);
            const storedTargetChapterState = stored?.chapterStates?.[targetChapter.id];
            const storedManualBookmarkBlockId = typeof storedTargetChapterState?.manualBookmarkBlockId === 'string'
              ? storedTargetChapterState.manualBookmarkBlockId || null
              : null;
            setVisibleNarrativeBookmarkForChapter(targetChapter.id, storedManualBookmarkBlockId);
          }
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      return;
    }

    chapterNavigationModeRef.current = mode;
    lastRestoredChapterRef.current = null;
    setSelectedChapterIndex(targetIndex);
  }, [
    dbChapters,
    selectedChapterIndex,
    canReadChapter,
    isChatStyle,
    saveReadingProgress,
    setVisibleNarrativeBookmarkForChapter,
    storyId,
    userId,
    clearPendingLongPressBookmark,
  ]);

  useEffect(() => {
    return () => {
      clearPendingLongPressBookmark();
    };
  }, [clearPendingLongPressBookmark]);

  useEffect(() => {
    lastRestoredChapterRef.current = null;
    chapterNavigationModeRef.current = 'restore';
  }, [storyId]);

  useEffect(() => {
    if (isLoading || isPreviewMode) return;
    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;
    if (lastRestoredChapterRef.current === chapter.id) return;

    const stored = readStoredStoryProgress(storyId, userId);
    const chapterState = stored?.chapterStates?.[chapter.id];
    const navigationMode = chapterNavigationModeRef.current;
    chapterNavigationModeRef.current = 'restore';
    lastRestoredChapterRef.current = chapter.id;
    const savedManualBookmarkBlockId = typeof chapterState?.manualBookmarkBlockId === 'string' && chapterState.manualBookmarkBlockId
      ? chapterState.manualBookmarkBlockId
      : null;
    const savedManualBookmarkScrollY = typeof chapterState?.manualBookmarkScrollY === 'number'
      ? Math.max(0, Math.floor(chapterState.manualBookmarkScrollY))
      : null;

    if (navigationMode === 'top') {
      const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'auto' });
      };
      let bookmarkFrame: number | null = null;

      if (isChatStyle) {
        saveReadingProgress(chapter.id, selectedChapterIndex, { chatNextIndex: 0 });
      } else {
        bookmarkFrame = window.requestAnimationFrame(() => {
          setVisibleNarrativeBookmarkForChapter(chapter.id, savedManualBookmarkBlockId);
        });
      }

      const firstTimer = window.setTimeout(scrollToTop, 0);
      const secondTimer = window.setTimeout(scrollToTop, 120);
      return () => {
        if (bookmarkFrame !== null) {
          window.cancelAnimationFrame(bookmarkFrame);
        }
        window.clearTimeout(firstTimer);
        window.clearTimeout(secondTimer);
      };
    }

    if (!chapterState) return;

    if (isChatStyle) {
      const savedNextIndex = Math.max(
        0,
        Math.min(chatScript.length, Math.floor(Number(chapterState.chatNextIndex || 0)))
      );
      if (savedNextIndex > 0) {
        const timer = window.setTimeout(() => {
          setMessages(chatScript.slice(0, savedNextIndex));
          setCurrentIndex(savedNextIndex);
        }, 0);
        return () => window.clearTimeout(timer);
      }
      return;
    }

    if (!savedManualBookmarkBlockId && savedManualBookmarkScrollY === null) {
      const clearBookmarkFrame = window.requestAnimationFrame(() => {
        setVisibleNarrativeBookmarkForChapter(chapter.id, null);
      });
      return () => window.cancelAnimationFrame(clearBookmarkFrame);
    }

    const restoreNarrativePosition = () => {
      if (savedManualBookmarkBlockId) {
        const anchorNode = narrativeBlockRefs.current[getNarrativeBlockRefKey(chapter.id, savedManualBookmarkBlockId)];
        if (anchorNode) {
          const anchorTop = window.scrollY + anchorNode.getBoundingClientRect().top - NARRATIVE_BOOKMARK_VIEWPORT_OFFSET;
          window.scrollTo({ top: Math.max(0, Math.floor(anchorTop)), behavior: 'auto' });
          setVisibleNarrativeBookmarkForChapter(chapter.id, savedManualBookmarkBlockId);
          return true;
        }
      }

      if (savedManualBookmarkScrollY !== null) {
        window.scrollTo({ top: savedManualBookmarkScrollY, behavior: 'auto' });
        window.requestAnimationFrame(() => {
          setVisibleNarrativeBookmarkForChapter(chapter.id, getNearestNarrativeAnchorBlockId(chapter));
        });
        return true;
      }

      return false;
    };

    const firstTimer = window.setTimeout(() => {
      restoreNarrativePosition();
    }, 60);
    const secondTimer = window.setTimeout(() => {
      restoreNarrativePosition();
    }, 260);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
    };
  }, [
    isLoading,
    isPreviewMode,
    dbChapters,
    selectedChapterIndex,
    canReadChapter,
    storyId,
    userId,
    isChatStyle,
    chatScript,
    saveReadingProgress,
    getNearestNarrativeAnchorBlockId,
    setVisibleNarrativeBookmarkForChapter,
  ]);

  useEffect(() => {
    if (isPreviewMode) return;
    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;
    saveReadingProgress(chapter.id, selectedChapterIndex, {});
  }, [isPreviewMode, dbChapters, selectedChapterIndex, canReadChapter, saveReadingProgress]);

  useEffect(() => {
    if (isLoading || isPreviewMode || isStoryOwner) return;
    if (readerChapterReadRpcAvailability === false) return;

    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;

    const sessionId = getOrCreateTrackingSessionId();
    if (sessionId === 'ssr') return;
    if (hasChapterReadSessionCacheEntry(sessionId, chapter.id)) return;

    let cancelled = false;

    const recordChapterRead = async () => {
      const { error } = await supabase.rpc('record_chapter_read', {
        p_story_id: storyId,
        p_chapter_id: chapter.id,
        p_session_id: sessionId,
      });

      if (cancelled) return;

      if (error) {
        if (isMissingRecordChapterReadRpcError(error)) {
          readerChapterReadRpcAvailability = false;
          console.warn('record_chapter_read is unavailable. Chapter view counts will not increment until the migration is applied.', error);
        } else {
          console.warn('Failed to record chapter read count.', error);
        }
        return;
      }

      readerChapterReadRpcAvailability = true;
      markChapterReadSessionCacheEntry(sessionId, chapter.id);
    };

    void recordChapterRead();

    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    isPreviewMode,
    isStoryOwner,
    dbChapters,
    selectedChapterIndex,
    canReadChapter,
    storyId,
  ]);

  useEffect(() => {
    if (!isChatStyle || isPreviewMode) return;
    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;
    saveReadingProgress(chapter.id, selectedChapterIndex, { chatNextIndex: currentIndex });
  }, [
    isChatStyle,
    isPreviewMode,
    dbChapters,
    selectedChapterIndex,
    canReadChapter,
    currentIndex,
    saveReadingProgress,
  ]);

  useEffect(() => {
    if (!isChatStyle || isPreviewMode) return;
    if (!activeChapter || !canReadChapter(activeChapter)) return;
    if (!isCompletionTargetChapter) return;
    if (chatScript.length === 0 || currentIndex < chatScript.length) return;

    markCurrentChapterCompleted();
  }, [
    isChatStyle,
    isPreviewMode,
    activeChapter,
    canReadChapter,
    isCompletionTargetChapter,
    currentIndex,
    chatScript.length,
    markCurrentChapterCompleted,
  ]);

  const handleNextLine = () => {
    if (!activeStory || !isChatStyle) return;
    const currentChapter = dbChapters[selectedChapterIndex];
    if (!currentChapter || !canReadChapter(currentChapter)) return;
    if (currentIndex >= chatScript.length) return;

    const nextMessage = chatScript[currentIndex];

    setMessages((prev: ReaderChatMessage[]) => [...prev, nextMessage]);
    setCurrentIndex((prev: number) => prev + 1);
  };

  // Interaction handlers
  const handleToggleLike = async () => {
    if (!user) return alert('กรุณาเข้าสู่ระบบก่อนกดหัวใจ');
    const currentChapterId = dbChapters[selectedChapterIndex]?.id;
    if (!currentChapterId) return;

    const isCurrentChapterLiked = likedChapterId === currentChapterId;

    if (isCurrentChapterLiked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', user.id);

      if (error) return;

      setLikedChapterId(null);
      setLikeCount(prev => Math.max(0, prev - 1));
    } else {
      const hadLikeBefore = likedChapterId !== null;

      const { error: clearError } = await supabase
        .from('likes')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', user.id);

      if (clearError) return;

      const { error } = await supabase
        .from('likes')
        .insert({ story_id: storyId, user_id: user.id, chapter_id: currentChapterId });

      if (error) return;

      setLikedChapterId(currentChapterId);
      if (!hadLikeBefore) {
        setLikeCount(prev => prev + 1);
      }
      trackEvent('like', `/story/${storyId}/read`, { storyId, chapterId: currentChapterId });
    }
  };

  const handleToggleFavorite = async () => {
    if (!user) return alert('กรุณาเข้าสู่ระบบก่อนเก็บเข้าชั้น');
    const currentChapterId = dbChapters[selectedChapterIndex]?.id;
    if (!currentChapterId) return;

    const isCurrentChapterFavorited = favoritedChapterId === currentChapterId;

    if (isCurrentChapterFavorited) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', user.id);

      if (error) return;

      setFavoritedChapterId(null);
    } else {
      const { error: clearError } = await supabase
        .from('favorites')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', user.id);

      if (clearError) return;

      const { error } = await supabase
        .from('favorites')
        .insert({ story_id: storyId, user_id: user.id, chapter_id: currentChapterId });

      if (error) return;

      setFavoritedChapterId(currentChapterId);
      trackEvent('favorite', `/story/${storyId}/read`, { storyId, chapterId: currentChapterId });
    }
  };

  const handleSubmitComment = async () => {
    if (!storySettings.allowComments) return;
    if (!user) return alert('กรุณาเข้าสู่ระบบก่อนคอมเมนต์');
    if (!newComment.trim()) return;
    setIsSubmittingComment(true);

    const { data, error } = await supabase
      .from('comments')
      .insert({
        story_id: storyId,
        user_id: user.id,
        content: newComment.trim(),
        chapter_id: dbChapters[selectedChapterIndex]?.id || null,
      })
      .select('id, user_id, content, created_at')
      .single();

    if (!error && data) {
      // Fetch user profile for display
      const { data: profileData } = await supabase
        .from('profiles')
        .select('pen_name, avatar_url')
        .eq('id', user.id)
        .single();

      setComments(prev => [...prev, {
        ...data,
        profiles: profileData || { pen_name: user.email?.split('@')[0] || 'ผู้อ่าน', avatar_url: null }
      }]);
      setNewComment('');
      trackEvent('comment', `/story/${storyId}/read`, { storyId, chapterId: dbChapters[selectedChapterIndex]?.id });
    }
    setIsSubmittingComment(false);
  };

  const addUnlockedChapterToBookshelf = useCallback(async (chapterId: string) => {
    if (!user) return;

    const { error: clearError } = await supabase
      .from('favorites')
      .delete()
      .eq('story_id', storyId)
      .eq('user_id', user.id);

    if (clearError) {
      console.error('Failed to clear stale bookshelf rows:', clearError);
      return;
    }

    const { error: insertError } = await supabase
      .from('favorites')
      .insert({
        story_id: storyId,
        user_id: user.id,
        chapter_id: chapterId,
      });

    if (insertError) {
      console.error('Failed to add unlocked chapter to bookshelf:', insertError);
    }
  }, [storyId, user]);

  const promptUnlockChapter = useCallback((chapter: ReaderChapter) => {
    if (!user) {
      alert('กรุณาเข้าสู่ระบบก่อนปลดล็อกตอนพิเศษ');
      return;
    }

    if (!chapter.isPremium || chapter.coinPrice <= 0 || canReadChapter(chapter)) {
      return;
    }

    setUnlockError(null);
    setUnlockNotice(null);
    setUnlockConfirmChapter({
      id: chapter.id,
      title: chapter.title,
      coinPrice: chapter.coinPrice,
    });
  }, [user, canReadChapter]);

  const handleUnlockChapter = async (chapter: ReaderChapter): Promise<boolean> => {
    if (!user) {
      alert('กรุณาเข้าสู่ระบบก่อนปลดล็อกตอนพิเศษ');
      return false;
    }

    if (!chapter.isPremium || chapter.coinPrice <= 0 || canReadChapter(chapter)) {
      return true;
    }

    setUnlockError(null);
    setUnlockNotice(null);
    setIsUnlockingChapterId(chapter.id);

    const { data, error } = await supabase.rpc('unlock_premium_chapter', {
      p_chapter_id: chapter.id,
    });

    setIsUnlockingChapterId(null);

    if (error) {
      setUnlockError('ปลดล็อกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      return false;
    }

    const result = Array.isArray(data) && data.length > 0
      ? (data[0] as { success: boolean; message: string; new_balance: number })
      : null;

    if (!result || !result.success) {
      if (result?.message === 'INSUFFICIENT_COINS') {
        setUnlockError('เหรียญไม่พอสำหรับปลดล็อกตอนนี้');
      } else if (result?.message === 'FINANCE_RESTRICTED') {
        setUnlockError('บัญชีของคุณถูกจำกัดการทำธุรกรรมชั่วคราว กรุณาลองใหม่ภายหลัง');
      } else if (result?.message === 'FINANCE_BANNED') {
        setUnlockError('บัญชีของคุณถูกระงับสิทธิ์ด้านการเงิน กรุณาติดต่อทีมงาน');
      } else if (result?.message === 'AUTH_REQUIRED') {
        setUnlockError('กรุณาเข้าสู่ระบบก่อนปลดล็อก');
      } else if (result?.message === 'CHAPTER_NOT_FOUND') {
        setUnlockError('ไม่พบตอนที่ต้องการปลดล็อกหรือยังไม่เผยแพร่');
      } else {
        setUnlockError('ปลดล็อกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
      const failedBalance = Number(result?.new_balance);
      if (Number.isFinite(failedBalance)) {
        setCoinBalance(failedBalance);
      }
      return false;
    }

    setUnlockedChapterIds((prev) => (prev.includes(chapter.id) ? prev : [...prev, chapter.id]));
    const nextBalance = Number(result.new_balance);
    if (Number.isFinite(nextBalance)) {
      setCoinBalance(nextBalance);
    }
    try {
      const refreshedChapters = await fetchReaderChapters(chapter.id);
      const refreshedChapter = refreshedChapters[0] || null;
      if (refreshedChapter) {
        setDbChapters((prev) => prev.map((item) => (item.id === refreshedChapter.id ? refreshedChapter : item)));
      }
    } catch {
      setUnlockError('ปลดล็อกสำเร็จ แต่โหลดเนื้อหาล่าช้า กรุณารีเฟรชหน้าอีกครั้ง');
    }

    if (result.message === 'UNLOCKED' || result.message === 'ALREADY_UNLOCKED') {
      await addUnlockedChapterToBookshelf(chapter.id);
    }

    if (result.message === 'UNLOCKED') {
      setUnlockNotice('ปลดล็อกสำเร็จและบันทึกเรื่องนี้ลงชั้นหนังสือแล้ว');
      setCoinCollectedToast({ coins: chapter.coinPrice, balance: nextBalance });
    } else if (result.message === 'UNLOCKED_BY_VIP') {
      setUnlockNotice('ปลดล็อกผ่านสิทธิ์ VIP ระบบจึงไม่หักเหรียญ');
    } else if (result.message === 'ALREADY_UNLOCKED') {
      setUnlockNotice('ตอนนี้ปลดล็อกไว้แล้ว ระบบจึงไม่หักเหรียญซ้ำ และเพิ่มเข้าชั้นหนังสือให้แล้ว');
    }

    trackEvent('chapter_unlock', `/story/${storyId}/read`, {
      storyId,
      chapterId: chapter.id,
      metadata: { coin_price: chapter.coinPrice, method: result.message === 'UNLOCKED_BY_VIP' ? 'vip' : 'coins' },
    });
    return true;
  };

  const handleConfirmUnlockChapter = async () => {
    if (!unlockConfirmChapter) return;

    const chapterIdToUnlock = unlockConfirmChapter.id;
    const chapter = dbChapters.find((item) => item.id === chapterIdToUnlock);
    setUnlockConfirmChapter(null);

    if (!chapter) {
      setUnlockError('ไม่พบตอนที่ต้องการปลดล็อก กรุณาลองใหม่');
      return;
    }

    const success = await handleUnlockChapter(chapter);
    if (success) {
      // Automatically navigate to the chapter after successful unlock
      const index = dbChapters.findIndex(c => c.id === chapterIdToUnlock);
      if (index >= 0) {
        navigateToChapter(index);
      }
    }
  };

  const handleSelectBranchChoice = useCallback((
    choice: ReaderChapterChoice | OverlayChoice,
    options?: { selectionMode?: 'manual' | 'timeout_auto'; countdownSeconds?: number },
  ) => {
    const currentChapterId = dbChapters[selectedChapterIndex]?.id;
    const selectionMode = options?.selectionMode || 'manual';
    const countdownSeconds = options?.countdownSeconds ?? normalizeChoiceTimerSeconds(currentChapterRef.current?.choiceTimerSeconds);

    resetChoiceCountdown();
    
    trackEvent('choice_select', `/story/${storyId}/read`, {
      storyId,
      chapterId: currentChapterId || 'unknown',
      metadata: {
        choice_id: choice.id,
        from_chapter_id: currentChapterId || 'unknown',
        to_chapter_id: choice.toChapterId || undefined,
        access_source: choice.accessSource,
        selection_mode: selectionMode,
        countdown_seconds: countdownSeconds > 0 ? countdownSeconds : undefined,
      },
    });

    if (!choice.toChapterId) {
      setChoicesError('ทางเลือกนี้ยังไม่มีตอนปลายทาง');
      return;
    }

    const targetIndex = dbChapters.findIndex((chapter) => chapter.id === choice.toChapterId);
    if (targetIndex < 0) {
      setChoicesError('ไม่พบตอนปลายทางสำหรับทางเลือกนี้ในรายการตอน');
      return;
    }

    const targetChapter = dbChapters[targetIndex];
    if (!canReadChapter(targetChapter)) {
      setChoicesError(null);
      promptUnlockChapter(targetChapter);
      return;
    }

    navigateToChapter(targetIndex);
  }, [dbChapters, selectedChapterIndex, storyId, trackEvent, canReadChapter, promptUnlockChapter, resetChoiceCountdown, navigateToChapter]);

  const startChoiceCountdown = useCallback((chapterId: string, durationSeconds: number) => {
    const sanitizedDurationSeconds = normalizeChoiceTimerSeconds(durationSeconds);
    if (!chapterId || sanitizedDurationSeconds <= 0) return;
    if (countdownChapterRef.current === chapterId) return;

    resetChoiceCountdown(sanitizedDurationSeconds * 1000);
    countdownChapterRef.current = chapterId;

    const durationMs = sanitizedDurationSeconds * 1000;
    const startedAt = Date.now();

    countdownIntervalRef.current = setInterval(() => {
      const currentChapter = currentChapterRef.current;
      if (!currentChapter || currentChapter.id !== chapterId) {
        resetChoiceCountdown();
        return;
      }

      const remainingMs = Math.max(0, durationMs - (Date.now() - startedAt));
      setChoiceCountdownRemainingMs(remainingMs);

      if (remainingMs > 0) return;

      resetChoiceCountdown(0);

      const eligibleChoices = currentChapterChoicesRef.current.filter((choice) => choice.canRead && !!choice.toChapterId);
      if (eligibleChoices.length === 0) {
        setChoicesError('เวลาหมด แต่ยังไม่มีทางเลือกที่อ่านต่อได้อัตโนมัติ');
        setShowChoiceOverlay(false);
        return;
      }

      const randomChoice = eligibleChoices[Math.floor(Math.random() * eligibleChoices.length)];
      handleSelectBranchChoice(randomChoice, {
        selectionMode: 'timeout_auto',
        countdownSeconds: sanitizedDurationSeconds,
      });
    }, 100);
  }, [handleSelectBranchChoice, resetChoiceCountdown]);

  useEffect(() => {
    countdownChapterRef.current = null;
    const frameId = window.requestAnimationFrame(() => {
      resetChoiceCountdown();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeChapter?.id, resetChoiceCountdown]);

  useEffect(() => {
    if (isChatStyle || !isBranchingPath) return;
    const panel = narrativeChoicePanelRef.current;
    if (!panel) return;

    if (typeof IntersectionObserver === 'undefined') {
      const frameId = window.requestAnimationFrame(() => {
        if (activeChapter?.id) {
          setNarrativeChoicePanelVisibleChapterId(activeChapter.id);
        }
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNarrativeChoicePanelVisibleChapterId(activeChapter?.id || null);
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(panel);
    return () => observer.disconnect();
  }, [isChatStyle, isBranchingPath, activeChapter?.id, chapterChoicesForRead.length, isLoadingChoicesForRead]);

  useEffect(() => {
    if (isChatStyle) return;
    if (!isBranchingPath || !activeChapter || activeChapter.isEnding) return;
    if (activeChapterChoiceTimerSeconds <= 0 || isLoadingChoicesForRead) return;
    if (!isNarrativeChoicePanelVisible || chapterChoicesForRead.length === 0) return;
    if (!canReadChapter(activeChapter)) return;

    const frameId = window.requestAnimationFrame(() => {
      startChoiceCountdown(activeChapter.id, activeChapterChoiceTimerSeconds);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    isChatStyle,
    isBranchingPath,
    activeChapter,
    activeChapterChoiceTimerSeconds,
    isLoadingChoicesForRead,
    isNarrativeChoicePanelVisible,
    chapterChoicesForRead,
    canReadChapter,
    startChoiceCountdown,
  ]);

  useEffect(() => {
    if (!isChatStyle) return;
    if (!isBranchingPath || !activeChapter || activeChapter.isEnding) return;
    if (activeChapterChoiceTimerSeconds <= 0 || isLoadingChoicesForRead) return;
    if (chapterChoicesForRead.length === 0 || !canReadChapter(activeChapter)) return;
    if (currentIndex < chatScript.length) return;

    const frameId = window.requestAnimationFrame(() => {
      if (countdownChapterRef.current !== activeChapter.id) {
        setShowChoiceOverlay(true);
      }
      startChoiceCountdown(activeChapter.id, activeChapterChoiceTimerSeconds);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    isChatStyle,
    isBranchingPath,
    activeChapter,
    activeChapterChoiceTimerSeconds,
    isLoadingChoicesForRead,
    chapterChoicesForRead,
    canReadChapter,
    currentIndex,
    chatScript.length,
    startChoiceCountdown,
  ]);

  useEffect(() => {
    if (isChatStyle || isPreviewMode) return;
    if (!activeChapter || !canReadChapter(activeChapter)) return;
    if (!isCompletionTargetChapter) return;

    const sentinel = narrativeCompletionSentinelRef.current;
    if (!sentinel) return;

    if (typeof IntersectionObserver === 'undefined') {
      const frameId = window.requestAnimationFrame(() => {
        markCurrentChapterCompleted();
      });
      return () => window.cancelAnimationFrame(frameId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markCurrentChapterCompleted();
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    isChatStyle,
    isPreviewMode,
    activeChapter,
    canReadChapter,
    isCompletionTargetChapter,
    markCurrentChapterCompleted,
  ]);

  const choiceCountdownDurationMs = activeChapterChoiceTimerSeconds > 0
    ? activeChapterChoiceTimerSeconds * 1000
    : 0;
  const choiceCountdownRemainingSeconds = choiceCountdownDurationMs > 0
    ? Math.max(
      0,
      Math.ceil(
        (choiceCountdownRemainingMs === null ? choiceCountdownDurationMs : choiceCountdownRemainingMs) / 1000
      )
    )
    : 0;
  const choiceCountdownProgressPercent = choiceCountdownDurationMs > 0
    ? Math.max(
      0,
      Math.min(
        100,
        ((choiceCountdownRemainingMs === null ? choiceCountdownDurationMs : choiceCountdownRemainingMs) / choiceCountdownDurationMs) * 100
      )
    )
    : 100;
  const isChoiceCountdownDanger = activeChapterChoiceTimerSeconds > 0 && choiceCountdownProgressPercent < 25;

  useEffect(() => {
    return () => resetChoiceCountdown();
  }, [resetChoiceCountdown]);

  if (isLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.emptyState}>กำลังโหลดข้อมูลเรื่อง...</div>
      </main>
    );
  }

  if (!activeStory || loadError) {
    return (
      <main className={styles.main}>
        <div className={styles.emptyState}>{loadError || 'ไม่พบข้อมูลเรื่อง'}</div>
      </main>
    );
  }

  const currentChapter = dbChapters[selectedChapterIndex] || null;
  const currentChapterId = currentChapter?.id || null;
  const isCurrentChapterLiked = !!currentChapterId && likedChapterId === currentChapterId;
  const isCurrentChapterFavorited = !!currentChapterId && favoritedChapterId === currentChapterId;
  const isCurrentChapterLocked = currentChapter ? !canReadChapter(currentChapter) : false;
  const canUseInlineNarrativeBookmark = !isPreviewMode && !isChatStyle && !isCurrentChapterLocked;
  const isLastChapter = selectedChapterIndex === Math.max(dbChapters.length - 1, 0);
  const showPremiumGate = !!currentChapter && !canReadChapter(currentChapter);
  const showNarrativeIntroMeta = selectedChapterIndex === 0;
  const showNarrativeCompactChapterHeading = !isChatStyle && !showNarrativeIntroMeta && !!currentChapter && !isBranchingPath;
  const narrativeChapterHeadingText = currentChapter
    ? currentChapter.title.trim()
      ? `ตอนที่ ${selectedChapterIndex + 1}: ${currentChapter.title}`
      : `ตอนที่ ${selectedChapterIndex + 1}`
    : '';
  const hasChapterChoices = chapterChoicesForRead.length > 0;
  const showEndingNotice =
    !!currentChapter?.isEnding && !hasChapterChoices && !choicesErrorForRead;
  const showNarrativeChoiceSection =
    isBranchingPath && (hasChapterChoices || !!choicesErrorForRead);
  const showChatBranchSection =
    isBranchingPath &&
    !isCurrentChapterLocked &&
    currentIndex >= chatScript.length &&
    (showNarrativeChoiceSection || showEndingNotice);
  const readerContextTitle = isBranchingPath
    ? activeStory?.title || ''
    : currentChapter?.title?.trim()
      ? `ตอนที่ ${selectedChapterIndex + 1}: ${currentChapter.title}`
      : activeStory?.title || '';
  const readerMobileActions = (
    <div className="ffMobileActionInner">
      {allowTocInReader && (
        <button
          type="button"
          className={`ffMobileActionBtn ffMobileActionBtnSecondary ${styles.readerMobileActionBtn}`}
          onClick={() => setIsTocOpen(true)}
        >
          <List size={18} />
          <span>สารบัญ</span>
        </button>
      )}
      <button
        type="button"
        className={`ffMobileActionBtn ffMobileActionBtnSecondary ${styles.readerMobileActionBtn}`}
        onClick={handleToggleLike}
        style={{ color: isCurrentChapterLiked ? '#ef4444' : undefined }}
      >
        <Heart size={18} fill={isCurrentChapterLiked ? 'currentColor' : 'none'} />
        <span>{storySettings.hideHeartCount ? 'หัวใจ' : `หัวใจ ${likeCount}`}</span>
      </button>
      <button
        type="button"
        className={[
          'ffMobileActionBtn',
          isCurrentChapterFavorited ? 'ffMobileActionBtnPrimary' : 'ffMobileActionBtnSecondary',
          styles.readerMobileActionBtn,
        ].join(' ')}
        onClick={handleToggleFavorite}
      >
        {isCurrentChapterFavorited ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
        <span>{isCurrentChapterFavorited ? 'อยู่ในชั้น' : 'เก็บเข้าชั้น'}</span>
      </button>
    </div>
  );

  const premiumGateJSX = showPremiumGate && currentChapter ? (
    <div className={`${styles.premiumGate} ${isChatStyle ? styles.premiumGateChat : ''}`}>
      <div className={styles.premiumGateBadge}>
        <Lock size={14} />
        ตอนพิเศษ
      </div>
      <h3>ตอนนี้ต้องปลดล็อกก่อนอ่าน</h3>
      <p>
        ใช้ {currentChapter.coinPrice.toLocaleString('th-TH')} เหรียญเพื่ออ่านตอน
        {' '}
        <strong>{currentChapter.title}</strong>
      </p>
      {user && !isPreviewMode && (
        <div className={styles.premiumGateBalance}>
          <Coins size={16} />
          คงเหลือ {coinBalance.toLocaleString('th-TH')} เหรียญ
        </div>
      )}
      <div className={styles.premiumGateActions}>
        {user ? (
          <button
            type="button"
            className={styles.premiumGateBtn}
            onClick={() => promptUnlockChapter(currentChapter)}
            disabled={isUnlockingChapterId === currentChapter.id}
          >
            {isUnlockingChapterId === currentChapter.id
              ? 'กำลังปลดล็อก...'
              : `ปลดล็อก ${currentChapter.coinPrice.toLocaleString('th-TH')} เหรียญ`}
          </button>
        ) : (
          <Link href="/" className={styles.premiumGateBtn}>
            เข้าสู่ระบบเพื่อปลดล็อก
          </Link>
        )}
        <Link href="/pricing" className={styles.premiumGateBtnGhost}>
          เติมเหรียญ
        </Link>
      </div>
      {unlockError && <p className={styles.premiumGateError}>{unlockError}</p>}
      {unlockNotice && <p className={styles.premiumGateNotice}>{unlockNotice}</p>}
    </div>
  ) : null;

  // Comment section as plain JSX variable (NOT a component function)
  // Defining this as a component caused React to remount the input on every keystroke
  const commentSectionJSX = (
    <div className={styles.commentSection}>
      <div className={styles.commentHeader} onClick={() => setShowComments(!showComments)}>
        <h3>💬 ความคิดเห็น ({comments.length})</h3>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{showComments ? 'ซ่อน' : 'แสดง'}</span>
      </div>
      {showComments && (
        <>
          <div className={styles.commentList}>
            {comments.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>ยังไม่มีคอมเมนต์ เป็นคนแรกเลย!</p>
            ) : (
              comments.map(comment => (
                <div key={comment.id} className={styles.commentItem}>
                  <div className={styles.commentAvatar}>
                    {comment.profiles?.avatar_url ? (
                      <img src={comment.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      (comment.profiles?.pen_name || 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className={styles.commentBody}>
                    <div className={styles.commentMeta}>
                      <strong>{comment.profiles?.pen_name || 'ผู้อ่าน'}</strong>
                      <span>{new Date(comment.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p>{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          {user && (
            <div className={styles.commentForm}>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="แสดงความคิดเห็น..."
                className={styles.commentInput}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
              />
              <button
                onClick={handleSubmitComment}
                className={styles.commentSendBtn}
                disabled={isSubmittingComment || !newComment.trim()}
              >
                <Send size={18} />
              </button>
            </div>
          )}
          {!user && (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', padding: '0.5rem' }}>
              <Link href="/" style={{ color: 'var(--primary)' }}>เข้าสู่ระบบ</Link> เพื่อแสดงความคิดเห็น
            </p>
          )}
        </>
      )}
    </div>
  );

  const themeWrapperClass = isChatStyle ? `theme-${activeChatThemeClass}` : '';

  return (
    <div className={themeWrapperClass}>
      <div className={isChatStyle ? styles.main : styles.readerLayout}>
        {isChatStyle ? (
          <>
            <header className={styles.header}>
              <div className={styles.headerContent}>
                <div>
                  <h1>{activeStory.title}</h1>
                  <p>
                    ตอนที่ {selectedChapterIndex + 1}: {dbChapters[selectedChapterIndex]?.title}
                    {isCurrentChapterLocked ? ` • 🔒 ${dbChapters[selectedChapterIndex]?.coinPrice || 0} เหรียญ` : ''}
                  </p>
                </div>
              </div>
              <div className={styles.chatHeaderActions}>
                <button
                  onClick={() => setIsTocOpen(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.8)' }}
                  title="เลือกตอน"
                >
                  <List size={18} />
                </button>
                <button onClick={handleToggleLike} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: isCurrentChapterLiked ? '#ef4444' : 'rgba(148,163,184,0.7)', fontSize: '0.85rem', fontWeight: 600 }}>
                  <Heart size={18} fill={isCurrentChapterLiked ? 'currentColor' : 'none'} />
                  {!storySettings.hideHeartCount && <span>{likeCount}</span>}
                </button>
                <button onClick={handleToggleFavorite} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isCurrentChapterFavorited ? 'var(--primary)' : 'rgba(148,163,184,0.7)' }}>
                  {isCurrentChapterFavorited ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                </button>
              </div>
            </header>
            <div className={styles.chatContainer}>
              {messages.length === 0 ? (
                <div className={styles.emptyState}>
                  แตะปุ่มด้านล่างเพื่อเริ่มอ่าน {activeStory.title}
                </div>
              ) : (
                messages.map((msg) => {
                  const blockChar = characters.find(c => c.id === msg.characterId);
                  const chatChar = blockChar
                    ? { id: blockChar.id, name: blockChar.name, avatarUrl: blockChar.image_url || fallbackAvatar }
                    : { id: 'reader-char', name: activeStory.characterName, avatarUrl: activeStory.avatarUrl };
                  return (
                    <ChatBubble
                      key={msg.id}
                      message={msg}
                      character={chatChar}
                    />
                  );
                })
              )}
              <div ref={messagesEndRef} className={styles.scrollAnchor} />
              {premiumGateJSX}
              {showChatBranchSection && (
                <>
                  {isLoadingChoicesForRead ? (
                    <div className={styles.chatBranchPanel}>
                      <p className={styles.branchChoiceInfo}>กำลังโหลดตัวเลือก...</p>
                    </div>
                  ) : showEndingNotice ? (
                    <div className={`${styles.chatBranchPanel} ${styles.branchEndingPanel}`}>
                      <div className={styles.branchChoiceHeader}>
                        <h3>จบเส้นทางแล้ว</h3>
                        <span className={styles.branchEndingTag}>Ending</span>
                      </div>
                      <p className={styles.branchChoiceInfo}>ตอนนี้เป็นตอนจบของเส้นทางนี้</p>
                    </div>
                  ) : chapterChoicesForRead.length === 0 ? (
                    choicesErrorForRead ? (
                      <div className={styles.chatBranchPanel}>
                        <p className={styles.branchChoiceError}>{choicesErrorForRead}</p>
                      </div>
                    ) : null
                  ) : !showChoiceOverlay ? (
                    <div className={styles.chatBranchPanel}>
                      {choicesErrorForRead && (
                        <p className={styles.branchChoiceError}>{choicesErrorForRead}</p>
                      )}
                      <button
                        type="button"
                        className={styles.branchChoiceBtn}
                        onClick={() => setShowChoiceOverlay(true)}
                      >
                        <span>⚡ เลือกเส้นทางถัดไป ({chapterChoicesForRead.length} ทางเลือก)</span>
                      </button>
                    </div>
                  ) : null}
                  {showChoiceOverlay && chapterChoicesForRead.length > 0 && (
                    <BranchChoiceOverlay
                      choices={chapterChoicesForRead}
                      onSelect={handleSelectBranchChoice}
                      timerSeconds={activeChapterChoiceTimerSeconds}
                      remainingSeconds={choiceCountdownRemainingSeconds}
                      progressPercent={choiceCountdownProgressPercent}
                    />
                  )}
                </>
              )}
            </div>

            <ChatActionBar
              onNextLine={handleNextLine}
              hasMore={!isCurrentChapterLocked && currentIndex < chatScript.length}
              onCloseChapter={() => setIsTocOpen(true)}
              secondaryActions={readerMobileActions}
            />
          </>
        ) : (
          <>
            {/* Reader Top Navbar */}
            <nav className={styles.readerNavbar}>
              <div className={styles.readerNavContext}>
                <span className={styles.readerNavContextEyebrow}>{activeStory.title}</span>
                <span className={styles.readerNavContextTitle}>{readerContextTitle}</span>
              </div>
              <div className={styles.readerNavRight}>
                {allowTocInReader && (
                  <button
                    className={styles.readerNavAction}
                    title="สารบัญ"
                    onClick={() => setIsTocOpen(!isTocOpen)}
                  >
                    <List size={20} />
                    <span>สารบัญ</span>
                  </button>
                )}
                <button
                  className={styles.readerNavAction}
                  title="กดหัวใจ"
                  onClick={handleToggleLike}
                  style={{ color: isCurrentChapterLiked ? '#ef4444' : undefined }}
                >
                  <Heart size={20} fill={isCurrentChapterLiked ? 'currentColor' : 'none'} />
                  {!storySettings.hideHeartCount && <span>{likeCount}</span>}
                </button>
                <button
                  className={styles.readerNavAction}
                  title="เก็บเข้าชั้น"
                  onClick={handleToggleFavorite}
                  style={{ color: isCurrentChapterFavorited ? 'var(--primary)' : undefined }}
                >
                  {isCurrentChapterFavorited ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
                  <span>{isCurrentChapterFavorited ? 'อยู่ในชั้น' : 'เก็บเข้าชั้น'}</span>
                </button>
              </div>
            </nav>

            <main className={styles.readerContainer}>
              {dbChapters.length === 0 ? (
                <div className={styles.emptyState}>{isPreviewMode ? 'ยังไม่พบตอนสำหรับพรีวิว' : 'เรื่องนี้ยังไม่มีตอนที่เผยแพร่'}</div>
              ) : (
                <>
                  {showNarrativeIntroMeta && (
                    <>
                      <div className={styles.readerMeta}>
                        เรื่อง : {activeStory.title}
                      </div>

                      <div className={styles.readerAuthor}>โดย : {activeStory.characterName}</div>

                      {dbStory?.cover_url && (
                        <img src={dbStory.cover_url} alt="Story Typography/Cover" className={styles.readerCover} />
                      )}

                      {shouldShowNarrativeChapterMeta && (
                        <div
                          className={[
                            styles.readerChapterLabel,
                            !shouldShowNarrativeChapterTitle ? styles.readerChapterLabelCompact : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {shouldShowNarrativeChapterTitle && dbChapters[selectedChapterIndex].title}
                          {currentChapter?.isPremium && (
                            <span className={`${styles.readerPremiumTag} ${isCurrentChapterLocked ? styles.readerPremiumTagLocked : ''}`}>
                              <Lock size={13} />
                              {isCurrentChapterLocked
                                ? `${currentChapter.coinPrice.toLocaleString('th-TH')} เหรียญ`
                                : 'ตอนพิเศษ'}
                            </span>
                          )}
                          {shouldShowNarrativeChapterTitle && <MoreVertical size={16} color="#cbd5e1" />}
                        </div>
                      )}
                    </>
                  )}

                  {showNarrativeCompactChapterHeading && currentChapter && (
                    <div className={styles.readerChapterHeadingCompact}>
                      <span className={styles.readerChapterHeadingCompactTitle}>{narrativeChapterHeadingText}</span>
                      {currentChapter.isPremium && (
                        <span className={`${styles.readerPremiumTag} ${isCurrentChapterLocked ? styles.readerPremiumTagLocked : ''}`}>
                          <Lock size={13} />
                          {isCurrentChapterLocked
                            ? `${currentChapter.coinPrice.toLocaleString('th-TH')} เหรียญ`
                            : 'ตอนพิเศษ'}
                        </span>
                      )}
                    </div>
                  )}

                  {isCurrentChapterLocked ? (
                    premiumGateJSX
                  ) : (
                    <>
                      <article className={styles.readerContent}>
                        {currentChapter && currentChapter.blocks.length > 0 ? (
                          currentChapter.blocks.map((block: Block, idx: number) => {
                            const paragraphClassName = getReaderParagraphClassName(block.characterId !== null, block.isFlashback);
                            const blockRefKey = getNarrativeBlockRefKey(currentChapter.id, block.id);
                            const shouldShowBookmarkRibbon = visibleNarrativeBookmark?.chapterId === currentChapter.id
                              && visibleNarrativeBookmark.blockId === block.id;
                            const shouldShowBookmarkGuide = canUseInlineNarrativeBookmark && !shouldShowBookmarkRibbon;
                            const isBookmarkGuideHovered = hoveredBookmarkBlockId === block.id && shouldShowBookmarkGuide;
                            const blockAnchorClassName = [
                              styles.readerBlockAnchor,
                              isBookmarkGuideHovered ? styles.readerBlockAnchorHovered : '',
                            ].filter(Boolean).join(' ');

                            if (block.type === 'image' && block.imageUrl) {
                              return (
                                <div
                                  key={block.id || idx}
                                  ref={(node) => {
                                    narrativeBlockRefs.current[blockRefKey] = node;
                                  }}
                                  className={blockAnchorClassName}
                                  onMouseEnter={() => setHoveredBookmarkBlockId(block.id)}
                                  onMouseLeave={() => setHoveredBookmarkBlockId((prev) => (prev === block.id ? null : prev))}
                                  onPointerDown={(event) => handleNarrativeBookmarkPointerDown(event, currentChapter, selectedChapterIndex, block.id)}
                                  onPointerMove={handleNarrativeBookmarkPointerMove}
                                  onPointerUp={handleNarrativeBookmarkPointerEnd}
                                  onPointerCancel={handleNarrativeBookmarkPointerEnd}
                                  onPointerLeave={handleNarrativeBookmarkPointerEnd}
                                  onContextMenu={(event) => {
                                    if (suppressBookmarkContextMenuRef.current) {
                                      event.preventDefault();
                                      suppressBookmarkContextMenuRef.current = false;
                                    }
                                  }}
                                >
                                  {shouldShowBookmarkRibbon && (
                                    <button
                                      type="button"
                                      className={styles.readerBookmarkRibbon}
                                      onClick={() => handleClearManualNarrativeBookmark(block.id)}
                                      aria-label="ลบที่คั่นหน้า"
                                      title="ลบที่คั่นหน้า"
                                      data-bookmark-control="true"
                                    >
                                      <BookmarkCheck size={13} />
                                    </button>
                                  )}
                                  {shouldShowBookmarkGuide && (
                                    <button
                                      type="button"
                                      className={styles.readerBookmarkGuide}
                                      onClick={() => setManualNarrativeBookmarkForBlock(currentChapter, selectedChapterIndex, block.id)}
                                      onFocus={() => setHoveredBookmarkBlockId(block.id)}
                                      onBlur={() => setHoveredBookmarkBlockId((prev) => (prev === block.id ? null : prev))}
                                      aria-label="คั่นหน้าตรงนี้"
                                      title="คั่นหน้าตรงนี้"
                                      data-bookmark-control="true"
                                    />
                                  )}
                                  <div className={styles.readerImageOnlyWrap}>
                                    <img
                                      src={block.imageUrl}
                                      alt="Story image"
                                      className={styles.readerImageOnly}
                                    />
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={block.id || idx}
                                ref={(node) => {
                                  narrativeBlockRefs.current[blockRefKey] = node;
                                }}
                                className={blockAnchorClassName}
                                onMouseEnter={() => setHoveredBookmarkBlockId(block.id)}
                                onMouseLeave={() => setHoveredBookmarkBlockId((prev) => (prev === block.id ? null : prev))}
                                onPointerDown={(event) => handleNarrativeBookmarkPointerDown(event, currentChapter, selectedChapterIndex, block.id)}
                                onPointerMove={handleNarrativeBookmarkPointerMove}
                                onPointerUp={handleNarrativeBookmarkPointerEnd}
                                onPointerCancel={handleNarrativeBookmarkPointerEnd}
                                onPointerLeave={handleNarrativeBookmarkPointerEnd}
                                onContextMenu={(event) => {
                                  if (suppressBookmarkContextMenuRef.current) {
                                    event.preventDefault();
                                    suppressBookmarkContextMenuRef.current = false;
                                  }
                                }}
                              >
                                {shouldShowBookmarkRibbon && (
                                  <button
                                    type="button"
                                    className={styles.readerBookmarkRibbon}
                                    onClick={() => handleClearManualNarrativeBookmark(block.id)}
                                    aria-label="ลบที่คั่นหน้า"
                                    title="ลบที่คั่นหน้า"
                                    data-bookmark-control="true"
                                  >
                                    <BookmarkCheck size={13} />
                                  </button>
                                )}
                                {shouldShowBookmarkGuide && (
                                  <button
                                    type="button"
                                    className={styles.readerBookmarkGuide}
                                    onClick={() => setManualNarrativeBookmarkForBlock(currentChapter, selectedChapterIndex, block.id)}
                                    onFocus={() => setHoveredBookmarkBlockId(block.id)}
                                    onBlur={() => setHoveredBookmarkBlockId((prev) => (prev === block.id ? null : prev))}
                                    aria-label="คั่นหน้าตรงนี้"
                                    title="คั่นหน้าตรงนี้"
                                    data-bookmark-control="true"
                                  />
                                )}
                                <p className={paragraphClassName}>{block.text}</p>
                              </div>
                            );
                          })
                        ) : (
                          <p>ตอนนี้ยังไม่มีเนื้อหา</p>
                        )}
                      </article>
                      <div
                        ref={narrativeCompletionSentinelRef}
                        className={styles.readerCompletionSentinel}
                        aria-hidden="true"
                      />
                    </>
                )}

                {isBranchingPath ? (
                  showNarrativeChoiceSection ? (
                    <div ref={narrativeChoicePanelRef} className={styles.branchChoicePanel}>
                      <div className={styles.branchChoiceHeader}>
                        <h3>ทางเลือกเส้นทางถัดไป</h3>
                      </div>
                      {activeChapterChoiceTimerSeconds > 0 && chapterChoicesForRead.length > 0 && (
                        <div className={`${styles.branchChoiceTimer} ${isChoiceCountdownDanger ? styles.branchChoiceTimerDanger : ''}`}>
                          <div className={styles.branchChoiceTimerMeta}>
                            <span>{isChoiceCountdownDanger ? 'เวลาใกล้หมด!' : 'เวลาจำกัด'}</span>
                            <strong>เหลือ {choiceCountdownRemainingSeconds} วิ</strong>
                          </div>
                          <div className={styles.branchChoiceTimerTrack}>
                            <div
                              className={styles.branchChoiceTimerFill}
                              style={{ width: `${choiceCountdownProgressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {isLoadingChoicesForRead ? (
                        <p className={styles.branchChoiceInfo}>กำลังโหลดตัวเลือก...</p>
                      ) : chapterChoicesForRead.length === 0 ? (
                        choicesErrorForRead ? (
                          <p className={styles.branchChoiceError}>{choicesErrorForRead}</p>
                        ) : null
                      ) : (
                        <>
                          {choicesErrorForRead && <p className={styles.branchChoiceError}>{choicesErrorForRead}</p>}
                          <div className={styles.branchChoiceList}>
                            {chapterChoicesForRead.map((choice, index) => {
                              const isLockedChoice = !choice.canRead;
                              return (
                                <button
                                  key={choice.id}
                                  type="button"
                                  className={[
                                    styles.branchChoiceBtn,
                                    isLockedChoice ? styles.branchChoiceBtnLocked : '',
                                  ].filter(Boolean).join(' ')}
                                  onClick={() => handleSelectBranchChoice(choice)}
                                >
                                  <span>{index + 1}. {choice.choiceText}</span>
                                  {isLockedChoice && (
                                    <small className={styles.branchChoiceMeta}>
                                      {`🔒 ล็อก ${choice.coinPrice.toLocaleString('th-TH')} เหรียญ`}
                                    </small>
                                  )}
                                  {choice.outcomeText && (
                                    <p className={styles.branchChoiceOutcome}>{choice.outcomeText}</p>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  ) : showEndingNotice ? (
                    <div className={`${styles.branchChoicePanel} ${styles.branchEndingPanel}`}>
                      <div className={styles.branchChoiceHeader}>
                        <h3>จบเส้นทางแล้ว</h3>
                        <span className={styles.branchEndingTag}>Ending</span>
                      </div>
                      <p className={styles.branchChoiceInfo}>ตอนนี้เป็นตอนจบของเส้นทางนี้</p>
                    </div>
                  ) : null
                ) : (
                    <div className={styles.chapterNav} style={{ marginTop: '3rem', width: '100%', maxWidth: '400px' }}>
                      <button
                        type="button"
                        className={styles.chapterNavBtn}
                        onClick={() => {
                          navigateToChapter(selectedChapterIndex - 1);
                        }}
                        disabled={selectedChapterIndex === 0}
                      >
                        ตอนก่อนหน้า
                      </button>
                      <button
                        type="button"
                        className={styles.chapterNavBtn}
                        onClick={() => {
                          navigateToChapter(selectedChapterIndex + 1);
                        }}
                        disabled={selectedChapterIndex === dbChapters.length - 1}
                      >
                        ตอนถัดไป
                      </button>
                    </div>
                  )}

                  {/* Comment Section */}
                  {storySettings.allowComments && !isCurrentChapterLocked && isLastChapter && commentSectionJSX}
                </>
              )}
            </main>
            <div className="ffMobileActionBar">
              {readerMobileActions}
            </div>

          </>
        )}
        {allowTocInReader && isTocOpen && (
          <div className={styles.tocOverlay} onClick={() => setIsTocOpen(false)}>
            <div className={styles.tocModal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.tocHeader}>
                <h3 className={styles.tocTitle}>สารบัญ</h3>
                <button className={styles.tocCloseBtn} onClick={() => setIsTocOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className={styles.tocContent}>
                <div className={styles.tocStoryTitle}>{dbChapters[selectedChapterIndex]?.title || activeStory.title}</div>
                <div className={styles.tocTotalInfo}>ตอนทั้งหมด ({dbChapters.length})</div>
                {tocCharacters.length > 0 && (
                  <div className={styles.tocCharactersSection}>
                    <div className={styles.tocCharactersLabel}>ตัวละคร</div>
                    <div className={styles.tocCharactersList}>
                      {tocCharacters.map((character) => (
                        <span key={character.id} className={styles.tocCharacterChip}>
                          {character.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.tocList}>
                  {dbChapters.map((ch, idx) => (
                    <button
                      key={ch.id}
                      className={`${styles.tocItem} ${idx === selectedChapterIndex ? styles.tocItemActive : ''}`}
                      onClick={() => {
                        navigateToChapter(idx, { closeToc: true });
                        if (!canReadChapter(ch) && !isPreviewMode && user) {
                          promptUnlockChapter(ch);
                        }
                      }}
                    >
                      <span className={styles.tocItemIndex}>#{idx + 1}</span>
                      <div className={styles.tocItemBody}>
                        <span className={styles.tocItemTitle}>{ch.title}</span>
                        {ch.isPremium && (
                          <span className={`${styles.tocLockTag} ${canReadChapter(ch) ? styles.tocLockTagUnlocked : ''}`}>
                            {canReadChapter(ch)
                              ? 'ปลดล็อกแล้ว'
                              : `ล็อก ${ch.coinPrice.toLocaleString('th-TH')} เหรียญ`}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {unlockConfirmChapter && (
          <div
            className={styles.unlockConfirmOverlay}
            onClick={() => {
              setUnlockConfirmChapter(null);
            }}
          >
            <div className={styles.unlockConfirmCard} onClick={(event) => event.stopPropagation()}>
              <div className={styles.coinIconWrapper}>
                <span className={styles.coinIconInner}>
                  <Coins size={32} />
                </span>
              </div>
              <h3>ปลดล็อกตอนพิเศษ</h3>
              <p>
                ใช้เหรียญเพื่ออ่าน <strong>{unlockConfirmChapter.title}</strong>
              </p>
              <div className={styles.coinPriceTag}>
                <Coins size={22} />
                {unlockConfirmChapter.coinPrice.toLocaleString('th-TH')} เหรียญ
              </div>
              <div className={styles.unlockConfirmBalance}>
                <Coins size={14} />
                คงเหลือ {coinBalance.toLocaleString('th-TH')} เหรียญ
              </div>
              {unlockError && <p className={styles.premiumGateError}>{unlockError}</p>}
              {unlockNotice && <p className={styles.premiumGateNotice}>{unlockNotice}</p>}
              <div className={styles.unlockConfirmActions}>
                <button
                  type="button"
                  className={styles.unlockConfirmCancelBtn}
                  onClick={() => {
                    setUnlockConfirmChapter(null);
                  }}
                  disabled={isUnlockingChapterId === unlockConfirmChapter.id}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={styles.unlockConfirmSubmitBtn}
                  onClick={handleConfirmUnlockChapter}
                  disabled={isUnlockingChapterId === unlockConfirmChapter.id}
                >
                  {isUnlockingChapterId === unlockConfirmChapter.id
                    ? 'กำลังปลดล็อก...'
                    : `ยืนยัน ${unlockConfirmChapter.coinPrice.toLocaleString('th-TH')} เหรียญ`}
                </button>
              </div>
            </div>
          </div>
        )}
        {coinCollectedToast && (
          <div className={styles.coinCollectedToast} key={`toast-${coinCollectedToast.coins}-${coinCollectedToast.balance}`}>
            <div className={styles.coinToastIcon}>
              <Coins size={16} />
            </div>
            <span className={styles.coinToastText}>
              ใช้ {coinCollectedToast.coins.toLocaleString('th-TH')} เหรียญสำเร็จ!
            </span>
            <span className={styles.coinToastBalance}>
              เหลือ {coinCollectedToast.balance.toLocaleString('th-TH')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
