'use client';

export type ReaderCtaState = 'unread' | 'in_progress' | 'completed';

export type ReaderProgressRow = {
  last_chapter_id: string | null;
  last_chapter_index: number | null;
  chapter_states: unknown;
  updated_at: string | null;
  completed_at?: string | null;
  completed_chapter_id?: string | null;
  completed_story_version?: string | null;
};

export type StoredChapterProgress = {
  scrollY?: number;
  chatNextIndex?: number;
  visualNovelNextIndex?: number;
  anchorBlockId?: string | null;
  manualBookmarkBlockId?: string | null;
  manualBookmarkScrollY?: number;
  manualBookmarkUpdatedAt?: string | null;
  updatedAt: string;
};

export type StoredStoryProgress = {
  lastChapterId: string | null;
  lastChapterIndex: number;
  updatedAt: string;
  chapterStates: Record<string, StoredChapterProgress>;
  completedAt?: string | null;
  completedChapterId?: string | null;
  completedStoryVersion?: string | null;
};

const READ_PROGRESS_STORAGE_PREFIX = 'flowfic:reader-progress';

export const getReadProgressStorageKey = (storyId: string, userId?: string | null) =>
  `${READ_PROGRESS_STORAGE_PREFIX}:${userId || 'guest'}:${storyId}`;

const parseStoredChapterStates = (input: unknown): Record<string, StoredChapterProgress> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const parsed: Record<string, StoredChapterProgress> = {};

  Object.entries(input as Record<string, unknown>).forEach(([chapterId, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;

    const raw = value as Record<string, unknown>;
    parsed[chapterId] = {
      scrollY: typeof raw.scrollY === 'number' ? raw.scrollY : undefined,
      chatNextIndex: typeof raw.chatNextIndex === 'number' ? raw.chatNextIndex : undefined,
      visualNovelNextIndex: typeof raw.visualNovelNextIndex === 'number'
        ? raw.visualNovelNextIndex
        : typeof raw.visual_novel_next_index === 'number'
          ? raw.visual_novel_next_index
          : undefined,
      anchorBlockId: typeof raw.anchorBlockId === 'string'
        ? raw.anchorBlockId
        : typeof raw.anchor_block_id === 'string'
          ? raw.anchor_block_id
          : undefined,
      manualBookmarkBlockId: typeof raw.manualBookmarkBlockId === 'string'
        ? raw.manualBookmarkBlockId
        : typeof raw.manual_bookmark_block_id === 'string'
          ? raw.manual_bookmark_block_id
          : raw.manualBookmarkBlockId === null || raw.manual_bookmark_block_id === null
            ? null
            : undefined,
      manualBookmarkScrollY: typeof raw.manualBookmarkScrollY === 'number'
        ? raw.manualBookmarkScrollY
        : typeof raw.manual_bookmark_scroll_y === 'number'
          ? raw.manual_bookmark_scroll_y
          : undefined,
      manualBookmarkUpdatedAt: typeof raw.manualBookmarkUpdatedAt === 'string'
        ? raw.manualBookmarkUpdatedAt
        : typeof raw.manual_bookmark_updated_at === 'string'
          ? raw.manual_bookmark_updated_at
          : raw.manualBookmarkUpdatedAt === null || raw.manual_bookmark_updated_at === null
            ? null
            : undefined,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    };
  });

  return parsed;
};

export const normalizeStoredStoryProgress = (raw: ReaderProgressRow): StoredStoryProgress => ({
  lastChapterId: raw.last_chapter_id || null,
  lastChapterIndex: Math.max(0, Number(raw.last_chapter_index || 0)),
  updatedAt: raw.updated_at || new Date(0).toISOString(),
  chapterStates: parseStoredChapterStates(raw.chapter_states),
  completedAt: typeof raw.completed_at === 'string'
    ? raw.completed_at
    : raw.completed_at === null
      ? null
      : null,
  completedChapterId: typeof raw.completed_chapter_id === 'string'
    ? raw.completed_chapter_id
    : raw.completed_chapter_id === null
      ? null
      : null,
  completedStoryVersion: typeof raw.completed_story_version === 'string'
    ? raw.completed_story_version
    : raw.completed_story_version === null
      ? null
      : null,
});

export const preserveCompletionSummary = (
  previous: StoredStoryProgress | null,
  next: StoredStoryProgress
): StoredStoryProgress => ({
  ...next,
  completedAt: next.completedAt !== undefined ? next.completedAt : previous?.completedAt ?? null,
  completedChapterId: next.completedChapterId !== undefined
    ? next.completedChapterId
    : previous?.completedChapterId ?? null,
  completedStoryVersion: next.completedStoryVersion !== undefined
    ? next.completedStoryVersion
    : previous?.completedStoryVersion ?? null,
});

export const readStoredStoryProgress = (
  storyId: string,
  userId?: string | null
): StoredStoryProgress | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getReadProgressStorageKey(storyId, userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredStoryProgress>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.lastChapterIndex !== 'number') return null;
    if (!parsed.chapterStates || typeof parsed.chapterStates !== 'object') return null;

    return preserveCompletionSummary(null, {
      lastChapterId: typeof parsed.lastChapterId === 'string' ? parsed.lastChapterId : null,
      lastChapterIndex: parsed.lastChapterIndex,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      chapterStates: parseStoredChapterStates(parsed.chapterStates),
      completedAt: typeof parsed.completedAt === 'string'
        ? parsed.completedAt
        : parsed.completedAt === null
          ? null
          : null,
      completedChapterId: typeof parsed.completedChapterId === 'string'
        ? parsed.completedChapterId
        : parsed.completedChapterId === null
          ? null
          : null,
      completedStoryVersion: typeof parsed.completedStoryVersion === 'string'
        ? parsed.completedStoryVersion
        : parsed.completedStoryVersion === null
          ? null
          : null,
    });
  } catch {
    return null;
  }
};

export const writeStoredStoryProgress = (
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

export const getProgressUpdatedAtMs = (progress: StoredStoryProgress | null): number => {
  if (!progress) return 0;

  const ms = Date.parse(progress.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
};

export const mergeStoredStoryProgress = (
  localProgress: StoredStoryProgress | null,
  remoteProgress: StoredStoryProgress | null
): StoredStoryProgress | null => {
  if (!localProgress) return remoteProgress;
  if (!remoteProgress) return localProgress;

  return getProgressUpdatedAtMs(remoteProgress) >= getProgressUpdatedAtMs(localProgress)
    ? remoteProgress
    : localProgress;
};

export const isStoryProgressCompleteForVersion = (
  progress: StoredStoryProgress | null,
  currentStoryVersion: string | null
): boolean => {
  if (!progress?.completedChapterId) return false;
  if (!progress.completedStoryVersion || !currentStoryVersion) return false;

  return progress.completedStoryVersion === currentStoryVersion;
};

export const deriveReaderCtaState = (
  progress: StoredStoryProgress | null,
  currentStoryVersion: string | null
): ReaderCtaState => {
  if (!progress?.lastChapterId) return 'unread';
  if (isStoryProgressCompleteForVersion(progress, currentStoryVersion)) return 'completed';
  return 'in_progress';
};

export const markStoryProgressCompleted = (
  progress: StoredStoryProgress | null,
  input: {
    chapterId: string;
    chapterIndex: number;
    storyVersion: string;
    nowIso: string;
  }
): StoredStoryProgress => {
  const previous = progress;

  return {
    lastChapterId: input.chapterId,
    lastChapterIndex: input.chapterIndex,
    updatedAt: input.nowIso,
    chapterStates: previous?.chapterStates || {},
    completedAt: input.nowIso,
    completedChapterId: input.chapterId,
    completedStoryVersion: input.storyVersion,
  };
};

export const normalizeStoryProgressVersionValue = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return normalizeStoryProgressVersionValue(value[0]);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const directValue = record.story_progress_version ?? record.get_story_progress_version;

    if (typeof directValue === 'string' && directValue.trim().length > 0) {
      return directValue;
    }

    const firstValue = Object.values(record)[0];
    if (typeof firstValue === 'string' && firstValue.trim().length > 0) {
      return firstValue;
    }
  }

  return null;
};
