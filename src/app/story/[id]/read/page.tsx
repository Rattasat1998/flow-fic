'use client';

import { useState, useRef, useEffect, useMemo, use, useCallback } from 'react';

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

type ReaderProgressRow = {
  last_chapter_id: string | null;
  last_chapter_index: number | null;
  chapter_states: unknown;
  updated_at: string | null;
};

type StoredChapterProgress = {
  scrollY?: number;
  chatNextIndex?: number;
  updatedAt: string;
};

type StoredStoryProgress = {
  lastChapterId: string | null;
  lastChapterIndex: number;
  updatedAt: string;
  chapterStates: Record<string, StoredChapterProgress>;
};

const READ_PROGRESS_STORAGE_PREFIX = 'flowfic:reader-progress';

const getReadProgressStorageKey = (storyId: string, userId?: string | null) =>
  `${READ_PROGRESS_STORAGE_PREFIX}:${userId || 'guest'}:${storyId}`;

const readStoredStoryProgress = (storyId: string, userId?: string | null): StoredStoryProgress | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getReadProgressStorageKey(storyId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredStoryProgress;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.lastChapterIndex !== 'number') return null;
    if (!parsed.chapterStates || typeof parsed.chapterStates !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeStoredStoryProgress = (
  storyId: string,
  userId: string | null | undefined,
  progress: StoredStoryProgress
) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getReadProgressStorageKey(storyId, userId), JSON.stringify(progress));
  } catch {
    // Ignore storage failures (private mode/quota exceeded)
  }
};

const parseStoredChapterStates = (input: unknown): Record<string, StoredChapterProgress> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const entries = Object.entries(input as Record<string, unknown>);
  const parsed: Record<string, StoredChapterProgress> = {};

  entries.forEach(([chapterId, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const raw = value as Record<string, unknown>;
    parsed[chapterId] = {
      scrollY: typeof raw.scrollY === 'number' ? raw.scrollY : undefined,
      chatNextIndex: typeof raw.chatNextIndex === 'number' ? raw.chatNextIndex : undefined,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    };
  });

  return parsed;
};

const normalizeStoredStoryProgress = (raw: ReaderProgressRow): StoredStoryProgress => {
  return {
    lastChapterId: raw.last_chapter_id || null,
    lastChapterIndex: Math.max(0, Number(raw.last_chapter_index || 0)),
    updatedAt: raw.updated_at || new Date(0).toISOString(),
    chapterStates: parseStoredChapterStates(raw.chapter_states),
  };
};

const getProgressUpdatedAtMs = (progress: StoredStoryProgress | null): number => {
  if (!progress) return 0;
  const ms = Date.parse(progress.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
};

const defaultStorySettings: StorySettings = {
  allowComments: true,
  hideHeartCount: false,
};

const MAX_BRANCH_TIMER_SECONDS = 300;

const normalizeStorySettings = (settings: unknown): StorySettings => {
  if (!settings || typeof settings !== 'object') return defaultStorySettings;

  const raw = settings as Record<string, unknown>;
  return {
    allowComments: typeof raw.allowComments === 'boolean' ? raw.allowComments : defaultStorySettings.allowComments,
    hideHeartCount: typeof raw.hideHeartCount === 'boolean' ? raw.hideHeartCount : defaultStorySettings.hideHeartCount,
  };
};

const normalizeChoiceTimerSeconds = (value: unknown): number => {
  if (typeof value === 'string' && value.trim() === '') return 0;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(MAX_BRANCH_TIMER_SECONDS, Math.floor(numericValue)));
};

const fallbackAvatar = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=200&q=80';
const BRANCHING_FEATURE_ENABLED = FEATURE_FLAGS.branching;

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
    const parsedBlocks = Array.isArray(parsedContent.blocks) ? (parsedContent.blocks as Block[]) : [];
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
      characterId: null
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
  const isPreviewMode = searchParams.get('preview') === '1';
  const previewChapterId = searchParams.get('previewChapter');

  const [dbChapters, setDbChapters] = useState<ReaderChapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(initialChapterIndex);
  const [chapterChoices, setChapterChoices] = useState<ReaderChapterChoice[]>([]);
  const [isLoadingChoices, setIsLoadingChoices] = useState(false);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  const [showChoiceOverlay, setShowChoiceOverlay] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const narrativeChoicePanelRef = useRef<HTMLDivElement>(null);
  const chapterChoicesRequestRef = useRef(0);
  const lastRestoredChapterRef = useRef<string | null>(null);
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

  useEffect(() => {
    return () => {
      if (progressSyncTimerRef.current) {
        clearTimeout(progressSyncTimerRef.current);
        progressSyncTimerRef.current = null;
      }
      void flushPendingProgressToDatabase();
    };
  }, [flushPendingProgressToDatabase]);

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
    },
    [storyId, isPreviewMode]
  );

  useEffect(() => {
    const fetchReaderStory = async () => {
      setIsLoading(true);
      setLoadError('');

      // Fetch Story
      let storyQuery = supabase
        .from('stories')
        .select('id, title, pen_name, cover_url, cover_wide_url, writing_style, path_mode, entry_chapter_id, settings, status, user_id')
        .eq('id', storyId);

      if (!isPreviewMode) {
        storyQuery = storyQuery.eq('status', 'published');
      }

      const { data: storyData, error: storyError } = await storyQuery.single();

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
      const normalizedPathMode = BRANCHING_FEATURE_ENABLED && (storyData as DBStory).path_mode === 'branching'
        ? 'branching'
        : 'linear';

      // Fetch Characters
      const { data: charsData } = await supabase
        .from('characters')
        .select('id, name, image_url')
        .eq('story_id', storyId)
        .order('order_index', { ascending: true });

      if (charsData) {
        setCharacters(charsData);
      }

      let parsedChapters: ReaderChapter[] = [];
      try {
        parsedChapters = await fetchReaderChapters();
      } catch {
        setLoadError('ไม่สามารถโหลดตอนของเรื่องนี้ได้');
        setIsLoading(false);
        return;
      }

      let remoteProgress: StoredStoryProgress | null = null;
      if (!isPreviewMode && user) {
        const [{ data: walletData }, { data: vipData }, { data: unlockRows }, { data: progressRow }] = await Promise.all([
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
            .select('last_chapter_id, last_chapter_index, chapter_states, updated_at')
            .eq('story_id', storyId)
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        setCoinBalance(walletData?.coin_balance || 0);
        const unlockedIds = ((unlockRows as ChapterUnlockRow[] | null) || []).map((row) => row.chapter_id);
        setUnlockedChapterIds(unlockedIds);
        const vipActiveForRead = !!vipData
          && vipData.status === 'active'
          && (!vipData.current_period_end || new Date(vipData.current_period_end).getTime() > Date.now());
        setIsVipAccessActive(vipActiveForRead);

        if (progressRow) {
          remoteProgress = normalizeStoredStoryProgress(progressRow as ReaderProgressRow);
        }
      } else {
        setCoinBalance(0);
        setUnlockedChapterIds([]);
        setIsVipAccessActive(false);
      }

      // Fetch like count + user like status
      const { count: likesCount } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', storyId);
      setLikeCount(likesCount || 0);

      if (user) {
        const { data: likeData } = await supabase
          .from('likes')
          .select('chapter_id')
          .eq('story_id', storyId)
          .eq('user_id', user.id)
          .maybeSingle();
        setLikedChapterId(likeData?.chapter_id || null);

        const { data: favData } = await supabase
          .from('favorites')
          .select('id, chapter_id, created_at')
          .eq('story_id', storyId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        const favoriteRows = favData || [];
        const latestFavorite = favoriteRows[0] || null;
        setFavoritedChapterId(latestFavorite?.chapter_id || null);

        // Legacy cleanup: keep only one favorite row per story/user (latest row).
        if (favoriteRows.length > 1) {
          const staleFavoriteIds = favoriteRows.slice(1).map(f => f.id);
          await supabase
            .from('favorites')
            .delete()
            .in('id', staleFavoriteIds);
        }
      } else {
        setLikedChapterId(null);
        setFavoritedChapterId(null);
      }

      if (normalizedStorySettings.allowComments) {
        const { data: commentsData, error: commentsError } = await supabase
          .from('comments')
          .select('id, user_id, content, created_at')
          .eq('story_id', storyId)
          .order('created_at', { ascending: true })
          .limit(100);

        if (commentsError || !commentsData) {
          setComments([]);
        } else {
          const rawComments = commentsData as CommentQueryRow[];
          const commentUserIds = Array.from(new Set(rawComments.map((row) => row.user_id).filter(Boolean)));
          const profileMap = new Map<string, { pen_name: string | null; avatar_url: string | null }>();

          if (commentUserIds.length > 0) {
            const { data: profileRows } = await supabase
              .from('profiles')
              .select('id, pen_name, avatar_url')
              .in('id', commentUserIds);

            ((profileRows as ProfileQueryRow[] | null) || []).forEach((row) => {
              profileMap.set(row.id, { pen_name: row.pen_name, avatar_url: row.avatar_url });
            });
          }

          setComments(rawComments.map((row) => ({
            ...row,
            profiles: profileMap.get(row.user_id) || null,
          })));
        }
      } else {
        setComments([]);
        setShowComments(false);
      }

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
      lastRestoredChapterRef.current = null;
      const localStoredProgress = !isPreviewMode
        ? readStoredStoryProgress(storyId, userId)
        : null;
      const storedProgress = getProgressUpdatedAtMs(remoteProgress) >= getProgressUpdatedAtMs(localStoredProgress)
        ? remoteProgress || localStoredProgress
        : localStoredProgress || remoteProgress;

      if (storedProgress) {
        writeStoredStoryProgress(storyId, userId, storedProgress);
      }

      const storedChapterId = storedProgress?.lastChapterId || null;
      const storedChapterIndex = storedChapterId
        ? parsedChapters.findIndex((chapter) => chapter.id === storedChapterId)
        : -1;

      if (previewChapterId) {
        const previewIndex = parsedChapters.findIndex((chapter) => chapter.id === previewChapterId);
        setSelectedChapterIndex(previewIndex >= 0 ? previewIndex : 0);
      } else if (normalizedPathMode === 'branching') {
        const requestedById = initialChapterIdParam
          ? parsedChapters.findIndex((chapter) => chapter.id === initialChapterIdParam)
          : -1;
        const entryIndex = normalizedStory.entry_chapter_id
          ? parsedChapters.findIndex((chapter) => chapter.id === normalizedStory.entry_chapter_id)
          : -1;

        if (requestedById >= 0) {
          setSelectedChapterIndex(requestedById);
        } else if (!hasExplicitChapterParam && storedChapterIndex >= 0) {
          setSelectedChapterIndex(storedChapterIndex);
        } else if (entryIndex >= 0) {
          setSelectedChapterIndex(entryIndex);
        } else {
          setSelectedChapterIndex(0);
        }
      } else {
        const requestedById = initialChapterIdParam
          ? parsedChapters.findIndex((chapter) => chapter.id === initialChapterIdParam)
          : -1;
        if (requestedById >= 0) {
          setSelectedChapterIndex(requestedById);
        } else if (!hasExplicitChapterParam && storedChapterIndex >= 0) {
          setSelectedChapterIndex(storedChapterIndex);
        } else {
          setSelectedChapterIndex(Math.min(initialChapterIndex, Math.max(parsedChapters.length - 1, 0)));
        }
      }
      setIsLoading(false);
    };

    fetchReaderStory();
  }, [
    storyId,
    user,
    userId,
    isPreviewMode,
    previewChapterId,
    hasExplicitChapterParam,
    initialChapterIndex,
    initialChapterIdParam,
    fetchReaderChapters,
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
      setChapterChoices([]);
      setChoicesError(null);
      setIsLoadingChoices(false);
      return;
    }

    const commitChoices = (choices: ReaderChapterChoice[], errorMessage: string | null) => {
      if (requestId !== chapterChoicesRequestRef.current) return false;
      setChapterChoices(choices);
      setChoicesError(errorMessage);
      setIsLoadingChoices(false);
      return true;
    };

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

    setIsLoadingChoices(true);
    setChoicesError(null);
    let fallbackUnresolvedChoices: ReaderChapterChoice[] = [];

    const registerUnresolvedChoices = (choices: ReaderChapterChoice[]) => {
      if (choices.length === 0) return;
      if (fallbackUnresolvedChoices.length < choices.length) {
        fallbackUnresolvedChoices = choices;
      }
    };

    const commitIfHasReadableTarget = (choices: ReaderChapterChoice[]) => {
      if (choices.some((choice) => !!choice.toChapterId)) {
        return commitChoices(choices, null);
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

      commitChoices(mappedEmbeddedChoices, 'พบทางเลือก แต่ยังไม่เชื่อมปลายทางที่อ่านได้');
      return;
    }

    if (fallbackUnresolvedChoices.length > 0) {
      commitChoices(fallbackUnresolvedChoices, 'พบทางเลือก แต่ยังไม่เชื่อมปลายทางที่อ่านได้');
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
    if (!isBranchingPath) {
      chapterChoicesRequestRef.current += 1;
      const timer = window.setTimeout(() => {
        setChapterChoices([]);
        setChoicesError(null);
        setIsLoadingChoices(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const currentChapterId = dbChapters[selectedChapterIndex]?.id;
    if (!currentChapterId) {
      chapterChoicesRequestRef.current += 1;
      const timer = window.setTimeout(() => {
        setChapterChoices([]);
        setChoicesError(null);
        setIsLoadingChoices(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void fetchChapterChoices(currentChapterId);
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

  const chapterChoicesForRead = chapterChoices;
  const activeChapter = dbChapters[selectedChapterIndex] || null;
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
    if (isPreviewMode) return;
    const previous = readStoredStoryProgress(storyId, userId);
    const nowIso = new Date().toISOString();
    const nextProgress: StoredStoryProgress = {
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
    };
    writeStoredStoryProgress(storyId, userId, nextProgress);
    scheduleProgressSync(nextProgress);
  }, [storyId, userId, isPreviewMode, scheduleProgressSync]);

  useEffect(() => {
    lastRestoredChapterRef.current = null;
  }, [storyId]);

  useEffect(() => {
    if (isLoading || isPreviewMode) return;
    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;
    if (lastRestoredChapterRef.current === chapter.id) return;

    const stored = readStoredStoryProgress(storyId, userId);
    const chapterState = stored?.chapterStates?.[chapter.id];
    lastRestoredChapterRef.current = chapter.id;

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

    const savedScrollY = Math.max(0, Math.floor(Number(chapterState.scrollY || 0)));
    if (!savedScrollY) return;

    const firstTimer = window.setTimeout(() => {
      window.scrollTo({ top: savedScrollY, behavior: 'auto' });
    }, 60);
    const secondTimer = window.setTimeout(() => {
      window.scrollTo({ top: savedScrollY, behavior: 'auto' });
    }, 320);
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
  ]);

  useEffect(() => {
    if (isPreviewMode) return;
    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;
    saveReadingProgress(chapter.id, selectedChapterIndex, {});
  }, [isPreviewMode, dbChapters, selectedChapterIndex, canReadChapter, saveReadingProgress]);

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
    if (isChatStyle || isPreviewMode) return;
    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter || !canReadChapter(chapter)) return;

    let throttleTimer: number | null = null;
    const handleScroll = () => {
      if (throttleTimer) return;
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null;
        saveReadingProgress(chapter.id, selectedChapterIndex, {
          scrollY: Math.max(0, Math.floor(window.scrollY)),
        });
      }, 200);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (throttleTimer) window.clearTimeout(throttleTimer);
    };
  }, [
    isChatStyle,
    isPreviewMode,
    dbChapters,
    selectedChapterIndex,
    canReadChapter,
    saveReadingProgress,
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
        setChoicesError(null);
        setUnlockError(null);
        setShowChoiceOverlay(false);
        setSelectedChapterIndex(index);
        setMessages([]);
        setCurrentIndex(0);
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 10);
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

    setChoicesError(null);
    setUnlockError(null);
    setUnlockNotice(null);
    setShowChoiceOverlay(false);
    setSelectedChapterIndex(targetIndex);
    setMessages([]);
    setCurrentIndex(0);
    
    // Use a small delay to ensure state updates before scrolling
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 10);
  }, [dbChapters, selectedChapterIndex, storyId, trackEvent, canReadChapter, promptUnlockChapter, resetChoiceCountdown]);

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
  }, [isChatStyle, isBranchingPath, activeChapter?.id, chapterChoicesForRead.length, isLoadingChoices]);

  useEffect(() => {
    if (isChatStyle) return;
    if (!isBranchingPath || !activeChapter || activeChapter.isEnding) return;
    if (activeChapterChoiceTimerSeconds <= 0 || isLoadingChoices) return;
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
    isLoadingChoices,
    isNarrativeChoicePanelVisible,
    chapterChoicesForRead,
    canReadChapter,
    startChoiceCountdown,
  ]);

  useEffect(() => {
    if (!isChatStyle) return;
    if (!isBranchingPath || !activeChapter || activeChapter.isEnding) return;
    if (activeChapterChoiceTimerSeconds <= 0 || isLoadingChoices) return;
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
    isLoadingChoices,
    chapterChoicesForRead,
    canReadChapter,
    currentIndex,
    chatScript.length,
    startChoiceCountdown,
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
  const isLastChapter = selectedChapterIndex === Math.max(dbChapters.length - 1, 0);
  const showPremiumGate = !!currentChapter && !canReadChapter(currentChapter);
  const showNarrativeIntroMeta = selectedChapterIndex === 0;

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
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
              {isBranchingPath && !isCurrentChapterLocked && currentIndex >= chatScript.length && (
                <>
                  {isLoadingChoices ? (
                    <div className={styles.chatBranchPanel}>
                      <p className={styles.branchChoiceInfo}>กำลังโหลดตัวเลือก...</p>
                    </div>
                  ) : chapterChoicesForRead.length === 0 ? (
                    <div className={styles.chatBranchPanel}>
                      {choicesError ? (
                        <p className={styles.branchChoiceError}>{choicesError}</p>
                      ) : currentChapter?.isEnding ? (
                        <p className={styles.branchChoiceInfo}>ตอนนี้เป็นตอนจบของเส้นทางนี้</p>
                      ) : (
                        <p className={styles.branchChoiceInfo}>ตอนนี้ยังไม่มีทางเลือกท้ายตอน</p>
                      )}
                    </div>
                  ) : !showChoiceOverlay ? (
                    <div className={styles.chatBranchPanel}>
                      {choicesError && (
                        <p className={styles.branchChoiceError}>{choicesError}</p>
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
            />
          </>
        ) : (
          <>
            {/* Reader Top Navbar */}
            <nav className={styles.readerNavbar}>
              <div className={styles.readerNavLeft}>
                <div className={styles.readerNavTitle} title={dbChapters[selectedChapterIndex]?.title || activeStory.title}>
                  {dbChapters[selectedChapterIndex]?.title || activeStory.title}
                </div>
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

                      <div className={styles.readerChapterLabel}>
                        {dbChapters[selectedChapterIndex].title}
                        {currentChapter?.isPremium && (
                          <span className={`${styles.readerPremiumTag} ${isCurrentChapterLocked ? styles.readerPremiumTagLocked : ''}`}>
                            <Lock size={13} />
                            {isCurrentChapterLocked
                              ? `${currentChapter.coinPrice.toLocaleString('th-TH')} เหรียญ`
                              : 'ตอนพิเศษ'}
                          </span>
                        )}
                        <MoreVertical size={16} color="#cbd5e1" />
                      </div>
                    </>
                  )}

                  {isCurrentChapterLocked ? (
                    premiumGateJSX
                  ) : (
                    <article className={styles.readerContent}>
                      {dbChapters[selectedChapterIndex].blocks.length > 0 ? (
                        dbChapters[selectedChapterIndex].blocks.map((block: Block, idx: number) => {
                          const char = block.characterId ? characters.find(c => c.id === block.characterId) : null;

                          if (char) {
                            return (
                              <div key={block.id || idx} className={styles.readerBlock}>
                                {char.image_url ? (
                                  <img src={char.image_url} alt={char.name} className={styles.readerBlockAvatar} />
                                ) : (
                                  <div className={styles.readerBlockFallbackAvatar}>
                                    {char.name.charAt(0)}
                                  </div>
                                )}
                                <div className={styles.readerBlockTextWrapper}>
                                  <div className={styles.readerBlockCharName}>{char.name}</div>
                                  {block.type === 'image' && block.imageUrl ? (
                                    <img
                                      src={block.imageUrl}
                                      alt={`Image by ${char.name}`}
                                      className={styles.readerBlockImage}
                                    />
                                  ) : (
                                    <p className={styles.readerBlockParagraph}>{block.text}</p>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          if (block.type === 'image' && block.imageUrl) {
                            return (
                              <div key={block.id || idx} className={styles.readerImageOnlyWrap}>
                                <img
                                  src={block.imageUrl}
                                  alt="Story image"
                                  className={styles.readerImageOnly}
                                />
                              </div>
                            );
                          }

                          return <p key={block.id || idx} className={styles.readerPlainParagraph}>{block.text}</p>;
                        })
                      ) : (
                        <p>ตอนนี้ยังไม่มีเนื้อหา</p>
                      )}
                    </article>
                )}

                {isBranchingPath ? (
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
                      {isLoadingChoices ? (
                        <p className={styles.branchChoiceInfo}>กำลังโหลดตัวเลือก...</p>
                      ) : chapterChoicesForRead.length === 0 ? (
                        choicesError ? (
                          <p className={styles.branchChoiceError}>{choicesError}</p>
                        ) : currentChapter?.isEnding ? (
                          <p className={styles.branchChoiceInfo}>ตอนนี้เป็นตอนจบของเส้นทางนี้</p>
                        ) : (
                          <p className={styles.branchChoiceInfo}>ตอนนี้ยังไม่มีทางเลือกท้ายตอน</p>
                        )
                      ) : (
                        <>
                          {choicesError && <p className={styles.branchChoiceError}>{choicesError}</p>}
                          <div className={styles.branchChoiceList}>
                            {chapterChoicesForRead.map((choice, index) => {
                              const isMissingDestination = !choice.toChapterId;
                              const isLockedChoice = !isMissingDestination && !choice.canRead;
                              return (
                                <button
                                  key={choice.id}
                                  type="button"
                                  className={[
                                    styles.branchChoiceBtn,
                                    isLockedChoice ? styles.branchChoiceBtnLocked : '',
                                    isMissingDestination ? styles.branchChoiceBtnDisabled : '',
                                  ].filter(Boolean).join(' ')}
                                  onClick={() => handleSelectBranchChoice(choice)}
                                  disabled={isMissingDestination}
                                >
                                  <span>{index + 1}. {choice.choiceText}</span>
                                  <small className={styles.branchChoiceMeta}>
                                    {isMissingDestination
                                      ? 'ทางเลือกนี้ยังไม่มีตอนปลายทาง'
                                      : isLockedChoice
                                        ? `🔒 ล็อก ${choice.coinPrice.toLocaleString('th-TH')} เหรียญ • ไปตอน ${choice.toOrderIndex + 1}`
                                        : `ไปตอน ${choice.toOrderIndex + 1}: ${choice.toTitle}`}
                                  </small>
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
                  ) : (
                    <div className={styles.chapterNav} style={{ marginTop: '3rem', width: '100%', maxWidth: '400px' }}>
                      <button
                        type="button"
                        className={styles.chapterNavBtn}
                        onClick={() => {
                          setUnlockError(null);
                          setUnlockNotice(null);
                          setShowChoiceOverlay(false);
                          setSelectedChapterIndex((prev: number) => Math.max(prev - 1, 0));
                        }}
                        disabled={selectedChapterIndex === 0}
                      >
                        ตอนก่อนหน้า
                      </button>
                      <button
                        type="button"
                        className={styles.chapterNavBtn}
                        onClick={() => {
                          setUnlockError(null);
                          setUnlockNotice(null);
                          setShowChoiceOverlay(false);
                          setSelectedChapterIndex((prev: number) => Math.min(prev + 1, dbChapters.length - 1));
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
                <div className={styles.tocList}>
                  {dbChapters.map((ch, idx) => (
                    <button
                      key={ch.id}
                      className={`${styles.tocItem} ${idx === selectedChapterIndex ? styles.tocItemActive : ''}`}
                      onClick={() => {
                        setUnlockError(null);
                        setUnlockNotice(null);
                        setShowChoiceOverlay(false);
                        setSelectedChapterIndex(idx);
                        setMessages([]);
                        setCurrentIndex(0);
                        setIsTocOpen(false);
                        if (!canReadChapter(ch) && !isPreviewMode && user) {
                          promptUnlockChapter(ch);
                        }
                        window.scrollTo({ top: 0, behavior: 'smooth' });
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
