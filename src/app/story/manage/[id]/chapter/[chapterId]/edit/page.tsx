'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Save, Loader2, Plus, X, Trash2, Image as ImageIcon, Search, CheckCircle2, AlertCircle, RotateCcw, Clock, History, Maximize2, Minimize2, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { useAuth } from '@/contexts/AuthContext';
import { useAutoSave } from '@/hooks/useAutoSave';
import { BranchGraphCanvas } from './components/BranchGraphCanvas';
import { BranchInspector } from './components/BranchInspector';
import { VisualNovelStage } from '@/components/story/VisualNovelStage';

import { RevisionDrawer } from './components/RevisionDrawer';
import type {
    BranchChoiceDraft,
    BranchGraphEdge,
    BranchGraphNode,
    BranchGraphSelection,
    BranchTargetOption,
    ChapterRevision,
    ChapterRevisionType,
    RevisionDiffSummary,
    RevisionRow,
} from './components/types';
import styles from './edit.module.css';
import blockStyles from './block-editor.module.css';



type Character = {
    id: string;
    name: string;
    image_url: string | null;
};

type EditorStyle = 'narrative' | 'chat' | 'thread' | 'visual_novel';
type SceneFocusSide = 'left' | 'right' | 'none';
type VisualNovelLayoutMode = 'stage' | 'split' | 'solo';
type SceneImageTargetSlot = 'backgroundUrl' | 'leftSceneImageUrl' | 'rightSceneImageUrl' | 'soloSceneImageUrl';

type Block = {
    id: string;
    type: 'paragraph' | 'image' | 'scene';
    text: string;
    characterId: string | null;
    imageUrl?: string;
    isFlashback: boolean;
    layoutMode?: VisualNovelLayoutMode;
    backgroundUrl?: string | null;
    backgroundColor?: string | null;
    leftCharacterId?: string | null;
    rightCharacterId?: string | null;
    soloCharacterId?: string | null;
    speakerCharacterId?: string | null;
    leftSceneImageUrl?: string | null;
    rightSceneImageUrl?: string | null;
    soloSceneImageUrl?: string | null;
    focusSide?: SceneFocusSide;
};

type SceneImageTarget = {
    blockId: string;
    slot: SceneImageTargetSlot;
};

type CharSelectorViewportPosition = {
    top: number;
    left: number;
    maxHeight: number;
};

type ImageSearchSource = 'unsplash' | 'pixabay';

type ImageSearchResult = {
    id: string;
    alt: string;
    thumb: string;
    regular: string;
    full: string;
    author: string;
    authorUrl: string;
    unsplashUrl?: string;
    sourceUrl?: string | null;
    source: ImageSearchSource;
};

type NoticeState = {
    tone: 'success' | 'error';
    title: string;
    message: string;
    persistUntilClose?: boolean;
};

type NoticeOptions = {
    persistUntilClose?: boolean;
};

type ChapterSpellcheckFieldInput = {
    id: string;
    label: string;
    text: string;
};

type ChapterSpellcheckFieldIssue = {
    id: string;
    label: string;
    matches: number;
    suggestions: string[];
    examples: string[];
    issues?: ChapterSpellcheckWordIssue[];
};

type ChapterSpellcheckWordIssue = {
    start: number;
    end: number;
    word: string;
    suggestions: string[];
};

type ChapterSpellcheckResponse = {
    checkedFields: number;
    totalMatches: number;
    fields: ChapterSpellcheckFieldIssue[];
    error?: string;
};

type SpellcheckSuggestionPopoverState = {
    fieldId: string;
    start: number;
    end: number;
    word: string;
    suggestions: string[];
    clientX: number;
    clientY: number;
};

type InlineSpellSegment = {
    text: string;
    issue: ChapterSpellcheckWordIssue | null;
};

type ChapterPublishModerationResponse = {
    allowed: boolean;
    score: number;
    reasons: string[];
    matchedCategories: string[];
    error?: string;
};

type BackgroundSoundSource = 'local' | 'pixabay_external' | 'pixabay_imported' | 'unknown';

type BackgroundSoundMeta = {
    source: BackgroundSoundSource;
    trackId?: string | null;
    title?: string | null;
    creator?: string | null;
    creatorUrl?: string | null;
    sourceUrl?: string | null;
    attribution?: string | null;
    license?: string | null;
    importedAt?: string | null;
    audioProfile?: string | null;
    storagePath?: string | null;
    bytesOriginal?: number | null;
    bytesCompressed?: number | null;
};

type ChapterContentPayload = {
    povCharacterId: string | null;
    chatTheme?: string;
    backgroundSound: string | null;
    backgroundSoundMeta?: BackgroundSoundMeta | null;
    blocks: Block[];
    branchChoices?: BranchChoiceDraft[];
    isEnding?: boolean;
    choiceTimerSeconds?: number;
};

type LocalSoundItem = {
    id: string;
    fileName: string;
    label: string;
    url: string;
};

type StoryPathMode = 'linear' | 'branching';

const MAX_BRANCH_CHOICES = 4;
const MIN_BRANCH_CHOICES = 1;
const MAX_BRANCH_TIMER_SECONDS = 300;
const BRANCHING_FEATURE_ENABLED = FEATURE_FLAGS.branching;
const IMAGE_SEARCH_PER_PAGE = 18;
const CONTENT_POLICY_BLOCK_PREFIX = 'CONTENT_POLICY_BLOCKED:';
const LIVE_SPELLCHECK_DEBOUNCE_MS = 900;
const LIVE_SPELLCHECK_MIN_LENGTH = 6;
const LIVE_SPELLCHECK_FAIL_NOTICE_COOLDOWN_MS = 12000;
const THAI_CHARACTER_PATTERN = /[ก-๙]/;

const extractContentPolicyBlockMessage = (error: unknown): string | null => {
    if (!error || typeof error !== 'object') return null;
    const errorObject = error as { message?: string; details?: string; hint?: string };
    const parts = [errorObject.message, errorObject.details, errorObject.hint]
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

    for (const part of parts) {
        const markerIndex = part.indexOf(CONTENT_POLICY_BLOCK_PREFIX);
        if (markerIndex >= 0) {
            const detail = part.slice(markerIndex + CONTENT_POLICY_BLOCK_PREFIX.length).trim();
            return detail || 'เนื้อหาไม่ผ่านเกณฑ์ความปลอดภัยสำหรับการเผยแพร่';
        }
    }

    return null;
};

const formatModerationReasons = (reasons: string[] | null | undefined): string => {
    if (!Array.isArray(reasons) || reasons.length === 0) {
        return 'ตรวจพบเนื้อหาไม่ผ่านเกณฑ์ความปลอดภัยสำหรับการเผยแพร่ กรุณาปรับเนื้อหาแล้วลองอีกครั้ง';
    }

    const compactReasons = reasons
        .map((reason) => reason.trim())
        .filter((reason) => reason.length > 0)
        .slice(0, 2);

    if (compactReasons.length === 0) {
        return 'ตรวจพบเนื้อหาไม่ผ่านเกณฑ์ความปลอดภัยสำหรับการเผยแพร่ กรุณาปรับเนื้อหาแล้วลองอีกครั้ง';
    }

    return compactReasons.join(' ');
};

const createBlockId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createEmptyParagraphBlock = (id: string = createBlockId('block')): Block => ({
    id,
    type: 'paragraph',
    text: '',
    characterId: null,
    isFlashback: false,
});

const createEmptySceneBlock = (id: string = createBlockId('scene')): Block => ({
    id,
    type: 'scene',
    text: '',
    characterId: null,
    isFlashback: false,
    layoutMode: 'stage',
    backgroundUrl: null,
    backgroundColor: null,
    leftCharacterId: null,
    rightCharacterId: null,
    soloCharacterId: null,
    speakerCharacterId: null,
    leftSceneImageUrl: null,
    rightSceneImageUrl: null,
    soloSceneImageUrl: null,
    focusSide: 'none',
});

const normalizeSceneLayoutMode = (value: unknown): VisualNovelLayoutMode =>
    value === 'split' || value === 'solo' ? value : 'stage';

const isMeaningfulBlock = (block: Block) => {
    if (block.type === 'scene') {
        return Boolean(
            block.text.trim()
            || block.leftSceneImageUrl
            || block.rightSceneImageUrl
            || block.soloSceneImageUrl
            || block.backgroundUrl
            || block.leftCharacterId
            || block.rightCharacterId
            || block.soloCharacterId
            || block.speakerCharacterId
        );
    }

    return block.text.trim() !== '' || block.characterId !== null || block.type === 'image';
};

const ensureBlocksForStyle = (rawBlocks: Block[], style: EditorStyle): Block[] => {
    if (style === 'visual_novel') {
        const sceneBlocks: Block[] = rawBlocks
            .map((block) => {
                if (block.type === 'scene') {
                    const nextFocusSide: SceneFocusSide = block.focusSide === 'left' || block.focusSide === 'right'
                        ? block.focusSide
                        : 'none';
                    return {
                        ...createEmptySceneBlock(block.id),
                        ...block,
                        type: 'scene' as const,
                        layoutMode: normalizeSceneLayoutMode(block.layoutMode),
                        focusSide: nextFocusSide,
                    };
                }

                return {
                    ...createEmptySceneBlock(block.id),
                    text: block.text,
                    speakerCharacterId: block.characterId,
                    layoutMode: 'stage' as const,
                    backgroundUrl: block.type === 'image' ? block.imageUrl || null : null,
                    backgroundColor: block.backgroundColor || null,
                    soloCharacterId: null,
                    soloSceneImageUrl: null,
                };
            })
            .filter(Boolean);

        return sceneBlocks.length > 0 ? sceneBlocks : [createEmptySceneBlock('scene-empty')];
    }

    return rawBlocks.length > 0 ? rawBlocks : [createEmptyParagraphBlock('block-empty')];
};

const normalizePathMode = (value: string | null | undefined): StoryPathMode => {
    if (!BRANCHING_FEATURE_ENABLED) return 'linear';
    return value === 'branching' ? 'branching' : 'linear';
};

const parseGraphSelection = (value: string | null): BranchGraphSelection => {
    if (!value) return null;
    const [type, ...rest] = value.split(':');
    const id = rest.join(':').trim();
    if (!id) return null;
    if (type === 'choice') {
        return { type, id };
    }
    if (type === 'target') {
        return { type, id };
    }
    return null;
};

const isMissingOutcomeTextColumnError = (error: { code?: string; message?: string } | null): boolean => {
    if (!error) return false;
    if (error.code === '42703' || error.code === 'PGRST204') return true;
    return typeof error.message === 'string' && error.message.toLowerCase().includes('outcome_text');
};

const normalizeChoiceTimerSeconds = (value: unknown): number => {
    if (typeof value === 'string' && value.trim() === '') return 0;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Math.min(MAX_BRANCH_TIMER_SECONDS, Math.floor(numericValue)));
};

const normalizeBackgroundSound = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const normalizeBackgroundSoundMeta = (value: unknown): BackgroundSoundMeta | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const normalizedSource = raw.source === 'local'
        || raw.source === 'pixabay_external'
        || raw.source === 'pixabay_imported'
        ? raw.source
        : 'unknown';

    const normalizeOptionalString = (input: unknown): string | null => {
        if (typeof input !== 'string') return null;
        const trimmed = input.trim();
        return trimmed.length > 0 ? trimmed : null;
    };

    const normalizeOptionalNumber = (input: unknown): number | null => {
        const numeric = Number(input);
        return Number.isFinite(numeric) ? numeric : null;
    };

    return {
        source: normalizedSource,
        trackId: normalizeOptionalString(raw.trackId),
        title: normalizeOptionalString(raw.title),
        creator: normalizeOptionalString(raw.creator),
        creatorUrl: normalizeOptionalString(raw.creatorUrl),
        sourceUrl: normalizeOptionalString(raw.sourceUrl),
        attribution: normalizeOptionalString(raw.attribution),
        license: normalizeOptionalString(raw.license),
        importedAt: normalizeOptionalString(raw.importedAt),
        audioProfile: normalizeOptionalString(raw.audioProfile),
        storagePath: normalizeOptionalString(raw.storagePath),
        bytesOriginal: normalizeOptionalNumber(raw.bytesOriginal),
        bytesCompressed: normalizeOptionalNumber(raw.bytesCompressed),
    };
};

const normalizeDraftChoices = (rawChoices: unknown): BranchChoiceDraft[] => {
    if (!Array.isArray(rawChoices)) return [];

    const parsedChoices = rawChoices
        .map((choice, index) => {
            if (!choice || typeof choice !== 'object') return null;
            const choiceObject = choice as Record<string, unknown>;
            const id = typeof choiceObject.id === 'string' && choiceObject.id
                ? choiceObject.id
                : `choice-${index}`;
            const choiceText = typeof choiceObject.choiceText === 'string'
                ? choiceObject.choiceText
                : typeof choiceObject.choice_text === 'string'
                    ? choiceObject.choice_text
                    : '';
            const toChapterRaw = choiceObject.toChapterId ?? choiceObject.to_chapter_id;
            const toChapterId = typeof toChapterRaw === 'string' && toChapterRaw ? toChapterRaw : null;
            const outcomeText = typeof choiceObject.outcomeText === 'string'
                ? choiceObject.outcomeText
                : typeof choiceObject.outcome_text === 'string'
                    ? choiceObject.outcome_text
                    : '';
            const orderRaw = choiceObject.orderIndex ?? choiceObject.order_index;
            const orderIndex = Number.isFinite(Number(orderRaw)) ? Number(orderRaw) : index;

            return {
                id,
                choiceText,
                toChapterId,
                outcomeText,
                orderIndex,
            } as BranchChoiceDraft;
        })
        .filter((choice): choice is BranchChoiceDraft => choice !== null)
        .sort((a, b) => a.orderIndex - b.orderIndex);

    return parsedChoices.map((choice, index) => ({
        ...choice,
        orderIndex: index,
    }));
};

const normalizeBlocks = (rawBlocks: unknown, fallbackPrefix: string): Block[] => {
    if (!Array.isArray(rawBlocks)) return [];

    return rawBlocks
        .map((item, index) => {
            if (!item || typeof item !== 'object') return null;
            const blockObject = item as Record<string, unknown>;
            const type = blockObject.type === 'image'
                ? 'image'
                : blockObject.type === 'scene'
                    ? 'scene'
                    : 'paragraph';
            const text = typeof blockObject.text === 'string' ? blockObject.text : '';
            const characterId = typeof blockObject.characterId === 'string' ? blockObject.characterId : null;
            const imageUrl = typeof blockObject.imageUrl === 'string' ? blockObject.imageUrl : undefined;
            const isFlashback = blockObject.isFlashback === true || blockObject.is_flashback === true;
            const id = typeof blockObject.id === 'string' && blockObject.id
                ? blockObject.id
                : `${fallbackPrefix}-${Date.now()}-${index}`;
            const backgroundUrl = typeof blockObject.backgroundUrl === 'string'
                ? blockObject.backgroundUrl
                : blockObject.backgroundUrl === null
                    ? null
                    : undefined;
            const backgroundColor = typeof blockObject.backgroundColor === 'string'
                ? blockObject.backgroundColor
                : blockObject.backgroundColor === null
                    ? null
                    : undefined;
            const leftCharacterId = typeof blockObject.leftCharacterId === 'string' ? blockObject.leftCharacterId : null;
            const rightCharacterId = typeof blockObject.rightCharacterId === 'string' ? blockObject.rightCharacterId : null;
            const soloCharacterId = typeof blockObject.soloCharacterId === 'string' ? blockObject.soloCharacterId : null;
            const speakerCharacterId = typeof blockObject.speakerCharacterId === 'string' ? blockObject.speakerCharacterId : null;
            const leftSceneImageUrl = typeof blockObject.leftSceneImageUrl === 'string'
                ? blockObject.leftSceneImageUrl
                : blockObject.leftSceneImageUrl === null
                    ? null
                    : undefined;
            const rightSceneImageUrl = typeof blockObject.rightSceneImageUrl === 'string'
                ? blockObject.rightSceneImageUrl
                : blockObject.rightSceneImageUrl === null
                    ? null
                    : undefined;
            const soloSceneImageUrl = typeof blockObject.soloSceneImageUrl === 'string'
                ? blockObject.soloSceneImageUrl
                : blockObject.soloSceneImageUrl === null
                    ? null
                    : undefined;
            const focusSide = blockObject.focusSide === 'left' || blockObject.focusSide === 'right' ? blockObject.focusSide : 'none';

            return {
                id,
                type,
                text,
                characterId,
                imageUrl,
                isFlashback,
                layoutMode: normalizeSceneLayoutMode(blockObject.layoutMode),
                backgroundUrl,
                backgroundColor,
                leftCharacterId,
                rightCharacterId,
                soloCharacterId,
                speakerCharacterId,
                leftSceneImageUrl,
                rightSceneImageUrl,
                soloSceneImageUrl,
                focusSide,
            } as Block;
        })
        .filter((item): item is Block => item !== null);
};

const parseStoredChapterContent = (rawContent: unknown): ChapterContentPayload => {
    let parsedBlocks: Block[] = [];
    let parsedPov: string | null = null;
    let parsedChatTheme = 'white';
    let parsedBackgroundSound: string | null = null;
    let parsedBackgroundSoundMeta: BackgroundSoundMeta | null = null;
    let parsedBranchChoices: BranchChoiceDraft[] | undefined;
    let parsedIsEnding = false;
    let parsedChoiceTimerSeconds = 0;

    if (rawContent && typeof rawContent === 'object') {
        const contentObject = rawContent as Record<string, unknown>;
        if (Array.isArray(contentObject.blocks)) {
            parsedBlocks = normalizeBlocks(contentObject.blocks, 'block');
        } else if (typeof contentObject.text === 'string') {
            parsedBlocks = contentObject.text
                .split('\n')
                .filter((line) => line.trim() !== '')
                .map((line, index) => ({
                    id: `block-${Date.now()}-${index}`,
                    type: 'paragraph' as const,
                    text: line,
                    characterId: null,
                    isFlashback: false,
                }));
        }

        parsedPov = typeof contentObject.povCharacterId === 'string' ? contentObject.povCharacterId : null;
        parsedChatTheme = typeof contentObject.chatTheme === 'string' ? contentObject.chatTheme : 'white';
        parsedBackgroundSound = normalizeBackgroundSound(contentObject.backgroundSound);
        parsedBackgroundSoundMeta = normalizeBackgroundSoundMeta(contentObject.backgroundSoundMeta);
        parsedIsEnding = contentObject.isEnding === true || contentObject.is_ending === true;
        parsedChoiceTimerSeconds = normalizeChoiceTimerSeconds(
            contentObject.choiceTimerSeconds ?? contentObject.choice_timer_seconds
        );
        if (Object.prototype.hasOwnProperty.call(contentObject, 'branchChoices')) {
            parsedBranchChoices = normalizeDraftChoices(contentObject.branchChoices);
        } else if (Object.prototype.hasOwnProperty.call(contentObject, 'chapterChoices')) {
            // Backward compatibility for earlier draft payload key.
            parsedBranchChoices = normalizeDraftChoices(contentObject.chapterChoices);
        }
    } else if (typeof rawContent === 'string') {
        parsedBlocks = rawContent
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line, index) => ({
                id: `block-${Date.now()}-${index}`,
                type: 'paragraph' as const,
                text: line,
                characterId: null,
                isFlashback: false,
            }));
    }

    if (parsedBlocks.length === 0) {
        parsedBlocks = [createEmptyParagraphBlock()];
    }

    const parsedContent: ChapterContentPayload = {
        povCharacterId: parsedPov,
        chatTheme: parsedChatTheme,
        backgroundSound: parsedBackgroundSound,
        backgroundSoundMeta: parsedBackgroundSoundMeta,
        blocks: parsedBlocks,
    };

    if (parsedBranchChoices !== undefined) {
        parsedContent.branchChoices = parsedBranchChoices;
    }
    parsedContent.isEnding = parsedIsEnding;
    parsedContent.choiceTimerSeconds = parsedChoiceTimerSeconds;

    return parsedContent;
};

const collectMediaUrlsFromChapterContent = (content: unknown): string[] => {
    const urls: string[] = [];

    if (!content) return urls;

    if (typeof content === 'string') {
        try {
            return collectMediaUrlsFromChapterContent(JSON.parse(content));
        } catch {
            return urls;
        }
    }

    if (typeof content !== 'object') return urls;

    const contentRecord = content as Record<string, unknown>;

    if (Array.isArray(contentRecord.blocks)) {
        contentRecord.blocks.forEach((block) => {
            if (!block || typeof block !== 'object') return;
            const blockRecord = block as Record<string, unknown>;
            const mediaCandidates = [
                blockRecord.imageUrl,
                blockRecord.backgroundUrl,
                blockRecord.leftSceneImageUrl,
                blockRecord.rightSceneImageUrl,
                blockRecord.soloSceneImageUrl,
            ];

            mediaCandidates.forEach((candidate) => {
                if (typeof candidate === 'string' && candidate.length > 0) {
                    urls.push(candidate);
                }
            });
        });
    }

    return urls;
};

const getCoverStoragePathFromPublicUrl = (url: string): string | null => {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/public/covers/');
        if (pathParts.length !== 2) return null;
        return decodeURIComponent(pathParts[1]);
    } catch {
        return null;
    }
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
    const [isEndingChapter, setIsEndingChapter] = useState(false);
    const [choiceTimerSeconds, setChoiceTimerSeconds] = useState(0);

    // Chat specific states
    const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
    const [chatInputValue, setChatInputValue] = useState('');
    const chatEndRef = useRef<HTMLDivElement>(null);
    const sendSoundContextRef = useRef<AudioContext | null>(null);
    const serverAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const serverDraftSignatureRef = useRef<string>('');
    const serverChoicesSignatureRef = useRef<string>('[]');
    const isServerAutoSavingRef = useRef(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [chatTheme, setChatTheme] = useState<string>('white');
    const [backgroundSound, setBackgroundSound] = useState<string | null>(null);
    const [backgroundSoundMeta, setBackgroundSoundMeta] = useState<BackgroundSoundMeta | null>(null);
    const [localSoundItems, setLocalSoundItems] = useState<LocalSoundItem[]>([]);
    const [isLoadingLocalSounds, setIsLoadingLocalSounds] = useState(false);
    const [localSoundError, setLocalSoundError] = useState<string | null>(null);
    const [sceneImageTarget, setSceneImageTarget] = useState<SceneImageTarget | null>(null);

    // Track which block has its character selector open (narrative mode)
    const [openCharSelectorId, setOpenCharSelectorId] = useState<string | null>(null);
    const charSelectorRef = useRef<HTMLDivElement>(null);
    const charSelectorAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [charSelectorViewportPosition, setCharSelectorViewportPosition] = useState<CharSelectorViewportPosition | null>(null);

    // Quick Add Character Modal State
    const [showQuickAddChar, setShowQuickAddChar] = useState(false);
    const [quickCharForm, setQuickCharForm] = useState({ name: '', imageUrl: null as string | null });
    const [quickCharImageFile, setQuickCharImageFile] = useState<File | null>(null);
    const [isSavingQuickChar, setIsSavingQuickChar] = useState(false);
    const [showUnsplashModal, setShowUnsplashModal] = useState(false);
    const [unsplashTarget, setUnsplashTarget] = useState<'chat' | 'character' | 'narrative' | 'visual_novel'>('chat');
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState<ImageSearchResult[]>([]);
    const [isUnsplashLoading, setIsUnsplashLoading] = useState(false);
    const [unsplashError, setUnsplashError] = useState<string | null>(null);
    const [imageSearchSource, setImageSearchSource] = useState<ImageSearchSource>('unsplash');
    const [notice, setNotice] = useState<NoticeState | null>(null);
    const [isSpellcheckRunning, setIsSpellcheckRunning] = useState(false);
    const [spellcheckIssueFieldIds, setSpellcheckIssueFieldIds] = useState<string[]>([]);
    const [liveSpellcheckByFieldId, setLiveSpellcheckByFieldId] = useState<Record<string, ChapterSpellcheckWordIssue[]>>({});
    const [activeSpellcheckFieldId, setActiveSpellcheckFieldId] = useState<string | null>(null);
    const [activeSuggestionPopover, setActiveSuggestionPopover] = useState<SpellcheckSuggestionPopoverState | null>(null);
    const liveSpellcheckDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveSpellcheckRequestSequenceRef = useRef(0);
    const liveSpellcheckFailureNoticeAtRef = useRef(0);
    const [revisions, setRevisions] = useState<ChapterRevision[]>([]);
    const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
    const [isRestoringRevision, setIsRestoringRevision] = useState(false);
    const [savedDraftSignature, setSavedDraftSignature] = useState('');
    const [savedChoicesSignature, setSavedChoicesSignature] = useState('[]');
    const [storyPathMode, setStoryPathMode] = useState<StoryPathMode>(
        normalizePathMode(searchParams.get('pathMode'))
    );
    const [chapterChoices, setChapterChoices] = useState<BranchChoiceDraft[]>([]);
    const [chapterTargets, setChapterTargets] = useState<BranchTargetOption[]>([]);
    const [selectedGraphNode, setSelectedGraphNode] = useState<BranchGraphSelection>(
        parseGraphSelection(searchParams.get('selected'))
    );
    const [isNodeMapModalOpen, setIsNodeMapModalOpen] = useState(false);
    const [targetEditorChapterId, setTargetEditorChapterId] = useState<string | null>(null);
    const [isCreatingBranchTarget, setIsCreatingBranchTarget] = useState(false);
    const [isRevisionDrawerOpen, setIsRevisionDrawerOpen] = useState(
        searchParams.get('panel') === 'revisions'
    );

    const styleParam = searchParams.get('style');
    const editorStyle: EditorStyle = styleParam === 'chat' || styleParam === 'thread' || styleParam === 'visual_novel'
        ? styleParam
        : 'narrative';
    const isChatStyle = editorStyle === 'chat';
    const isVisualNovelStyle = editorStyle === 'visual_novel';
    const styleLabel = isChatStyle
        ? 'แชท'
        : isVisualNovelStyle
            ? 'วิชวลโนเวล'
            : editorStyle === 'thread'
                ? 'กระทู้'
                : 'บรรยาย';
    const showSpellcheckNavbarAction = false;
    const isBranchingStory = BRANCHING_FEATURE_ENABLED && storyPathMode === 'branching';
    const spellcheckIssueFieldSet = useMemo(() => new Set(spellcheckIssueFieldIds), [spellcheckIssueFieldIds]);

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
            backgroundSound: isVisualNovelStyle ? backgroundSound : null,
            backgroundSoundMeta: isVisualNovelStyle && backgroundSound ? backgroundSoundMeta : null,
            isPremium,
            coinPrice,
            chapterChoices,
            isEndingChapter,
            choiceTimerSeconds,
        });
    }, [
        title,
        blocks,
        povCharacterId,
        chatTheme,
        backgroundSound,
        backgroundSoundMeta,
        isVisualNovelStyle,
        isPremium,
        coinPrice,
        chapterChoices,
        isEndingChapter,
        choiceTimerSeconds,
        isMounted,
        isLoading,
        onEditorChange,
    ]);

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
            backgroundSound,
            backgroundSoundMeta,
            isPremium,
            coinPrice,
            chapterChoices,
            isEndingChapter,
            choiceTimerSeconds,
            storyPathMode,
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
        backgroundSound,
        backgroundSoundMeta,
        isPremium,
        coinPrice,
        chapterChoices,
        isEndingChapter,
        choiceTimerSeconds,
        storyPathMode,
    ]);

    // ── Handle recovery accept ──
    const handleAcceptRecovery = () => {
        const draft = acceptRecovery();
        if (!draft) return;
        setTitle(draft.title);
        setBlocks(ensureBlocksForStyle(normalizeBlocks(draft.blocks, 'recovered-block'), editorStyle));
        setPovCharacterId(draft.povCharacterId);
        setChatTheme(draft.chatTheme);
        setBackgroundSound(normalizeBackgroundSound(draft.backgroundSound));
        setBackgroundSoundMeta(normalizeBackgroundSoundMeta(draft.backgroundSoundMeta));
        setIsPremium(draft.isPremium);
        setCoinPrice(draft.coinPrice);
        setIsEndingChapter(draft.isEndingChapter === true);
        setChoiceTimerSeconds(normalizeChoiceTimerSeconds(draft.choiceTimerSeconds));
        const recoveredChoices = Array.isArray(draft.chapterChoices)
            ? (draft.chapterChoices as BranchChoiceDraft[]).map((choice, index) => ({
                id: choice.id || `choice-${index}`,
                choiceText: choice.choiceText || '',
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText || '',
                orderIndex: Number.isFinite(choice.orderIndex) ? Number(choice.orderIndex) : index,
            }))
            : [];
        setChapterChoices(draft.isEndingChapter === true ? [] : recoveredChoices);
        showNotice('success', 'กู้คืนสำเร็จ', 'ฉบับร่างล่าสุดถูกกู้คืนแล้ว');
    };

    const handleDismissRecovery = () => {
        dismissRecovery();
        showNotice('success', 'ละทิ้งฉบับร่าง', 'ใช้ข้อมูลจากเซิร์ฟเวอร์แทน');
    };

    const showNotice = useCallback((
        tone: NoticeState['tone'],
        title: string,
        message: string,
        options?: NoticeOptions,
    ) => {
        setNotice({
            tone,
            title,
            message,
            persistUntilClose: options?.persistUntilClose === true,
        });
    }, []);

    const showModerationBlockNotice = useCallback((message: string) => {
        showNotice('error', 'ไม่สามารถเผยแพร่ได้', message, { persistUntilClose: true });
    }, [showNotice]);

    const runPublishModerationCheck = useCallback(async (
        moderationPayload: { title: string; draftContent: ChapterContentPayload },
    ) => {
        const {
            data: { session },
            error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
            throw new Error('AUTH_REQUIRED');
        }

        const response = await fetch('/api/moderation/chapter-publish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(moderationPayload),
            cache: 'no-store',
        });

        let payload: ChapterPublishModerationResponse | { error?: string } | null = null;
        try {
            payload = (await response.json()) as ChapterPublishModerationResponse | { error?: string };
        } catch {
            payload = null;
        }

        if (response.status === 422) {
            const blockedPayload = payload as ChapterPublishModerationResponse | null;
            return {
                allowed: false,
                reasons: Array.isArray(blockedPayload?.reasons) ? blockedPayload.reasons : [],
            };
        }

        if (!response.ok) {
            const errorMessage = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
                ? payload.error
                : 'ตรวจสอบความปลอดภัยก่อนเผยแพร่ไม่สำเร็จ';
            throw new Error(errorMessage);
        }

        const successPayload = payload as ChapterPublishModerationResponse | null;
        return {
            allowed: successPayload?.allowed !== false,
            reasons: Array.isArray(successPayload?.reasons) ? successPayload.reasons : [],
        };
    }, []);

    const updateSavedDraftSignature = useCallback((signature: string) => {
        serverDraftSignatureRef.current = signature;
        setSavedDraftSignature(signature);
    }, []);

    const updateSavedChoicesSignature = useCallback((signature: string) => {
        serverChoicesSignatureRef.current = signature;
        setSavedChoicesSignature(signature);
    }, []);

    const applySnapshotToEditor = useCallback((snapshot: {
        title: string;
        content: ChapterContentPayload;
        isPremium: boolean;
        coinPrice: number;
    }) => {
        setTitle(snapshot.title);
        setBlocks(ensureBlocksForStyle(normalizeBlocks(snapshot.content.blocks, 'restored-block'), editorStyle));
        setPovCharacterId(snapshot.content.povCharacterId);
        setChatTheme(snapshot.content.chatTheme || 'white');
        setBackgroundSound(normalizeBackgroundSound(snapshot.content.backgroundSound));
        setBackgroundSoundMeta(normalizeBackgroundSoundMeta(snapshot.content.backgroundSoundMeta));
        setIsPremium(snapshot.isPremium);
        setCoinPrice(snapshot.coinPrice > 0 ? snapshot.coinPrice : 10);
        setChoiceTimerSeconds(normalizeChoiceTimerSeconds(snapshot.content.choiceTimerSeconds));
        const normalizedChoices = Array.isArray(snapshot.content.branchChoices)
            ? snapshot.content.branchChoices.map((choice, index) => ({
                id: choice.id || `choice-${index}`,
                choiceText: choice.choiceText || '',
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText || '',
                orderIndex: Number.isFinite(choice.orderIndex) ? Number(choice.orderIndex) : index,
            }))
            : [];
        setIsEndingChapter(snapshot.content.isEnding === true);
        setChapterChoices(snapshot.content.isEnding === true ? [] : normalizedChoices);
    }, [editorStyle]);

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

    const applyBackgroundSoundSelection = useCallback((
        nextUrl: string | null,
        nextMeta: BackgroundSoundMeta | null,
    ) => {
        setBackgroundSound(normalizeBackgroundSound(nextUrl));
        setBackgroundSoundMeta(nextMeta);
    }, []);

    const fetchLocalSounds = useCallback(async () => {
        setIsLoadingLocalSounds(true);
        setLocalSoundError(null);

        try {
            const response = await fetch('/api/sounds', { cache: 'no-store' });
            const payload = await response.json() as { items?: LocalSoundItem[]; error?: string };
            if (!response.ok) {
                throw new Error(payload.error || 'โหลดรายการเสียงในเครื่องไม่สำเร็จ');
            }

            const items = Array.isArray(payload.items) ? payload.items : [];
            setLocalSoundItems(items);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'โหลดรายการเสียงในเครื่องไม่สำเร็จ';
            setLocalSoundError(message);
            setLocalSoundItems([]);
        } finally {
            setIsLoadingLocalSounds(false);
        }
    }, []);

    const handleSelectLocalSound = useCallback((nextUrl: string | null) => {
        const normalizedUrl = normalizeBackgroundSound(nextUrl);
        if (!normalizedUrl) {
            applyBackgroundSoundSelection(null, null);
            return;
        }

        const matched = localSoundItems.find((item) => item.url === normalizedUrl);
        applyBackgroundSoundSelection(normalizedUrl, {
            source: 'local',
            trackId: matched?.id || null,
            title: matched?.fileName || matched?.label || normalizedUrl,
            creator: null,
            creatorUrl: null,
            sourceUrl: matched?.url || null,
            attribution: null,
            license: null,
        });
    }, [applyBackgroundSoundSelection, localSoundItems]);

    useEffect(() => {
        if (!isVisualNovelStyle) return;
        void fetchLocalSounds();
    }, [isVisualNovelStyle, fetchLocalSounds]);

    const buildDraftContentFromBlocks = useCallback((sourceBlocks: Block[]): ChapterContentPayload => {
        const draftBlocks = ensureBlocksForStyle(sourceBlocks, editorStyle);
        const draftChoices = isBranchingStory && !isEndingChapter
            ? chapterChoices.map((choice, index) => ({
                id: choice.id || `choice-${index}`,
                choiceText: choice.choiceText || '',
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText || '',
                orderIndex: index,
            }))
            : [];
        const draftContent: ChapterContentPayload = {
            povCharacterId: isChatStyle ? povCharacterId : null,
            chatTheme: isChatStyle ? chatTheme : undefined,
            backgroundSound: isVisualNovelStyle ? backgroundSound : null,
            backgroundSoundMeta: isVisualNovelStyle && backgroundSound ? backgroundSoundMeta : null,
            blocks: draftBlocks,
            branchChoices: draftChoices,
            isEnding: isBranchingStory ? isEndingChapter : undefined,
            choiceTimerSeconds: isBranchingStory ? choiceTimerSeconds : undefined,
        };

        return draftContent;
    }, [
        editorStyle,
        chapterChoices,
        isEndingChapter,
        choiceTimerSeconds,
        isBranchingStory,
        isChatStyle,
        isVisualNovelStyle,
        povCharacterId,
        chatTheme,
        backgroundSound,
        backgroundSoundMeta,
    ]);

    const buildDraftSnapshotForBlocks = useCallback((sourceBlocks: Block[]) => {
        const draftContent = buildDraftContentFromBlocks(sourceBlocks);
        const signature = buildSignatureFromSnapshot({
            title,
            content: draftContent,
            isPremium,
            coinPrice,
            statusValue: status,
        });

        return { draftContent, signature };
    }, [
        title,
        isPremium,
        coinPrice,
        status,
        buildDraftContentFromBlocks,
        buildSignatureFromSnapshot,
    ]);

    const buildDraftSnapshot = useCallback(
        () => buildDraftSnapshotForBlocks(blocks),
        [blocks, buildDraftSnapshotForBlocks]
    );

    const currentDraftSignature = useMemo(() => buildDraftSnapshot().signature, [buildDraftSnapshot]);
    const isDraftDirty = currentDraftSignature !== savedDraftSignature;

    const flushServerDraftAutoSave = useCallback(async (force = false) => {
        if (!user || !chapterId || !storyId) return;
        if (isLoading || isSaving) return;
        if (isServerAutoSavingRef.current) return;

        const { draftContent, signature } = buildDraftSnapshot();
        const draftChoices = draftContent.branchChoices || [];
        const choiceSignature = JSON.stringify(
            draftChoices.map((choice, index) => ({
                choiceText: choice.choiceText.trim(),
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText.trim(),
                orderIndex: index,
            }))
        );
        const hasChoiceValidationError =
            isBranchingStory
            && (
                draftChoices.length > MAX_BRANCH_CHOICES
                || draftChoices.some((choice) =>
                    !choice.choiceText.trim()
                    || !choice.toChapterId
                    || choice.toChapterId === chapterId
                )
            );
        if (!force && signature === serverDraftSignatureRef.current && choiceSignature === serverChoicesSignatureRef.current) {
            return;
        }

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

            if (BRANCHING_FEATURE_ENABLED && !hasChoiceValidationError) {
                const normalizedChoicesPayload = draftChoices
                    .map((choice, index) => ({
                        id: choice.id,
                        to_chapter_id: choice.toChapterId,
                        choice_text: choice.choiceText.trim(),
                        outcome_text: choice.outcomeText.trim() || null,
                        order_index: index,
                    }));
                const { error: choiceError } = await supabase.rpc('replace_chapter_choices', {
                    p_story_id: storyId,
                    p_from_chapter_id: chapterId,
                    p_choices: isBranchingStory ? normalizedChoicesPayload : [],
                });

                if (choiceError) {
                    console.error('Auto-save choices sync failed:', choiceError);
                }
            }

            updateSavedDraftSignature(signature);
            updateSavedChoicesSignature(choiceSignature);
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
        updateSavedChoicesSignature,
        isBranchingStory,
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

        const normalizedSnapshotChoices = Array.isArray(snapshot.content.branchChoices)
            ? snapshot.content.branchChoices.map((choice, index) => ({
                id: choice.id || `choice-${index}`,
                choiceText: choice.choiceText || '',
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText || '',
                orderIndex: index,
            }))
            : [];
        const draftChoices = isBranchingStory && !snapshot.content.isEnding
            ? normalizedSnapshotChoices
            : [];
        const draftContent: ChapterContentPayload = {
            ...snapshot.content,
            branchChoices: draftChoices,
            isEnding: isBranchingStory ? !!snapshot.content.isEnding : undefined,
        };
        const nowIso = new Date().toISOString();
        const payload: Record<string, unknown> = {
            draft_title: snapshot.title,
            draft_content: draftContent,
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
            content: draftContent,
            isPremium: snapshot.isPremium,
            coinPrice: snapshot.coinPrice,
            statusValue: status,
        }));
        updateSavedChoicesSignature(JSON.stringify(
            draftChoices.map((choice, index) => ({
                choiceText: choice.choiceText.trim(),
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText.trim(),
                orderIndex: index,
            }))
        ));
        return true;
    }, [
        user,
        chapterId,
        storyId,
        status,
        isBranchingStory,
        buildSignatureFromSnapshot,
        updateSavedDraftSignature,
        updateSavedChoicesSignature,
    ]);

    const collectMediaUrlsFromBlocks = useCallback((sourceBlocks: Block[]): string[] => {
        const urls: string[] = [];

        sourceBlocks.forEach((block) => {
            if (block.type === 'image' && typeof block.imageUrl === 'string' && block.imageUrl.length > 0) {
                urls.push(block.imageUrl);
                return;
            }

            if (block.type !== 'scene') return;

            [
                block.backgroundUrl,
                block.leftSceneImageUrl,
                block.rightSceneImageUrl,
                block.soloSceneImageUrl,
            ].forEach((candidate) => {
                if (typeof candidate === 'string' && candidate.length > 0) {
                    urls.push(candidate);
                }
            });
        });

        return urls;
    }, []);

    const removeCoverUrlsFromStorage = useCallback(async (candidateUrls: Array<string | null | undefined>) => {
        const removablePaths = Array.from(new Set(
            candidateUrls
                .filter((url): url is string => typeof url === 'string' && url.length > 0)
                .map((url) => getCoverStoragePathFromPublicUrl(url))
                .filter((path): path is string => typeof path === 'string' && path.length > 0)
        ));

        if (removablePaths.length === 0) return;

        const { error } = await supabase.storage.from('covers').remove(removablePaths);
        if (error) {
            throw error;
        }
    }, []);

    const collectReferencedCoverPathsForStory = useCallback(async (currentBlocks: Block[]) => {
        const referencedPaths = new Set<string>();
        collectMediaUrlsFromBlocks(currentBlocks).forEach((url) => {
            const path = getCoverStoragePathFromPublicUrl(url);
            if (path) referencedPaths.add(path);
        });

        const { data, error } = await supabase
            .from('chapters')
            .select('id, content, draft_content')
            .eq('story_id', storyId);

        if (error) {
            throw error;
        }

        (data || []).forEach((row) => {
            const chapterRow = row as { id: string; content: unknown; draft_content: unknown };

            if (chapterRow.id === chapterId) {
                if (status === 'published') {
                    collectMediaUrlsFromChapterContent(chapterRow.content).forEach((url) => {
                        const path = getCoverStoragePathFromPublicUrl(url);
                        if (path) referencedPaths.add(path);
                    });
                }
                return;
            }

            [chapterRow.content, chapterRow.draft_content].forEach((content) => {
                collectMediaUrlsFromChapterContent(content).forEach((url) => {
                    const path = getCoverStoragePathFromPublicUrl(url);
                    if (path) referencedPaths.add(path);
                });
            });
        });

        return referencedPaths;
    }, [
        chapterId,
        collectMediaUrlsFromBlocks,
        status,
        storyId,
    ]);

    const cleanupOrphanedCoverUrls = useCallback(async (
        candidateUrls: Array<string | null | undefined>,
        currentBlocks: Block[],
    ) => {
        const candidatePaths = Array.from(new Set(
            candidateUrls
                .filter((url): url is string => typeof url === 'string' && url.length > 0)
                .map((url) => getCoverStoragePathFromPublicUrl(url))
                .filter((path): path is string => typeof path === 'string' && path.length > 0)
        ));

        if (candidatePaths.length === 0) return;

        const referencedPaths = await collectReferencedCoverPathsForStory(currentBlocks);
        const pathsToDelete = candidatePaths.filter((path) => !referencedPaths.has(path));
        if (pathsToDelete.length === 0) return;

        const { error } = await supabase.storage.from('covers').remove(pathsToDelete);
        if (error) {
            throw error;
        }
    }, [collectReferencedCoverPathsForStory]);

    const commitBlocksMutation = useCallback(async ({
        previousBlocks,
        nextBlocks,
        oldUrls = [],
        uploadedUrls = [],
        failureMessage,
    }: {
        previousBlocks: Block[];
        nextBlocks: Block[];
        oldUrls?: Array<string | null | undefined>;
        uploadedUrls?: Array<string | null | undefined>;
        failureMessage: string;
    }) => {
        setBlocks(nextBlocks);

        const saved = await persistSnapshotAsDraft({
            title,
            content: buildDraftContentFromBlocks(nextBlocks),
            isPremium,
            coinPrice,
        });

        if (!saved) {
            setBlocks(previousBlocks);
            try {
                await removeCoverUrlsFromStorage(uploadedUrls);
            } catch (cleanupError) {
                console.error('Failed to rollback newly uploaded scene media:', cleanupError);
            }
            showNotice('error', 'บันทึกไม่สำเร็จ', failureMessage);
            return false;
        }

        try {
            await cleanupOrphanedCoverUrls(oldUrls, nextBlocks);
        } catch (cleanupError) {
            console.error('Failed to clean orphaned chapter media:', cleanupError);
        }

        return true;
    }, [
        buildDraftContentFromBlocks,
        cleanupOrphanedCoverUrls,
        coinPrice,
        isPremium,
        persistSnapshotAsDraft,
        removeCoverUrlsFromStorage,
        showNotice,
        title,
    ]);

    const buildSnapshotFromRevision = useCallback((revision: ChapterRevision) => {
        const parsedContent = parseStoredChapterContent(revision.content);
        return {
            title: revision.title || 'ไม่มีชื่อ',
            content: parsedContent,
            isPremium: revision.is_premium,
            coinPrice: revision.coin_price > 0 ? revision.coin_price : 10,
        };
    }, []);

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
        if (
            normalizeChoiceTimerSeconds(currentSnapshot.content.choiceTimerSeconds)
            !== normalizeChoiceTimerSeconds(previousSnapshot.content.choiceTimerSeconds)
        ) {
            highlights.push('เปลี่ยนเวลานับถอยหลัง');
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

    const buildChoicesSignature = useCallback((choices: BranchChoiceDraft[]) => {
        return JSON.stringify(
            choices.map((choice, index) => ({
                choiceText: choice.choiceText.trim(),
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText.trim(),
                orderIndex: index,
            }))
        );
    }, []);

    const currentChoiceSignature = useMemo(
        () => buildChoicesSignature(chapterChoices),
        [chapterChoices, buildChoicesSignature]
    );
    const isChoiceDirty = currentChoiceSignature !== savedChoicesSignature;
    const isEditorDirty = isDraftDirty || isChoiceDirty;

    const addChapterChoice = useCallback(() => {
        setIsEndingChapter(false);
        let createdChoiceId: string | null = null;
        setChapterChoices((prev) => {
            if (prev.length >= MAX_BRANCH_CHOICES) return prev;
            createdChoiceId = `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            return [
                ...prev,
                {
                    id: createdChoiceId,
                    choiceText: '',
                    toChapterId: null,
                    outcomeText: '',
                    orderIndex: prev.length,
                },
            ];
        });
        if (createdChoiceId) {
            setSelectedGraphNode({ type: 'choice', id: createdChoiceId });
        }
    }, []);

    const updateChapterChoice = useCallback((id: string, updates: Partial<BranchChoiceDraft>) => {
        setChapterChoices((prev) =>
            prev.map((choice, index) => (
                choice.id === id
                    ? { ...choice, ...updates, orderIndex: index }
                    : { ...choice, orderIndex: index }
            ))
        );
    }, []);

    const duplicateChapterChoice = useCallback((id: string) => {
        setIsEndingChapter(false);
        let duplicatedId: string | null = null;
        setChapterChoices((prev) => {
            if (prev.length >= MAX_BRANCH_CHOICES) return prev;
            const index = prev.findIndex((choice) => choice.id === id);
            if (index === -1) return prev;
            const source = prev[index];
            duplicatedId = `choice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const copy: BranchChoiceDraft = {
                ...source,
                id: duplicatedId,
                choiceText: source.choiceText ? `${source.choiceText} (สำเนา)` : '',
            };
            const nextChoices = [...prev];
            nextChoices.splice(index + 1, 0, copy);
            return nextChoices.map((choice, orderIndex) => ({ ...choice, orderIndex }));
        });
        if (duplicatedId) {
            setSelectedGraphNode({ type: 'choice', id: duplicatedId });
        }
    }, []);

    const handleSetChapterEnding = useCallback(() => {
        setIsEndingChapter(true);
        setChapterChoices([]);
        setSelectedGraphNode(null);
    }, []);

    const handleUnsetChapterEnding = useCallback(() => {
        setIsEndingChapter(false);
    }, []);

    const handleChoiceTimerSecondsChange = useCallback((rawValue: string) => {
        setChoiceTimerSeconds(normalizeChoiceTimerSeconds(rawValue));
    }, []);

    const removeChapterChoice = useCallback((id: string) => {
        setChapterChoices((prev) => {
            if (prev.length <= MIN_BRANCH_CHOICES) {
                showNotice('error', `ต้องมีอย่างน้อย ${MIN_BRANCH_CHOICES} ทางเลือก`, 'ไม่สามารถลบออกได้มากกว่านี้');
                return prev;
            }
            return prev
                .filter((choice) => choice.id !== id)
                .map((choice, index) => ({ ...choice, orderIndex: index }));
        });
        setSelectedGraphNode((prev) => {
            if (!prev) return prev;
            if (prev.type === 'choice' && prev.id === id) return null;
            return prev;
        });
    }, [showNotice]);

    const buildChapterEditorUrl = useCallback((targetChapterId: string) => {
        const query = new URLSearchParams({
            style: editorStyle,
            pathMode: storyPathMode,
        });
        return `/story/manage/${storyId}/chapter/${targetChapterId}/edit?${query.toString()}`;
    }, [editorStyle, storyId, storyPathMode]);

    const handleOpenTargetChapter = useCallback((targetChapterId: string) => {
        if (!targetChapterId) return;
        setTargetEditorChapterId(targetChapterId);
    }, []);

    const handleNavigateToTarget = useCallback((targetChapterId: string) => {
        if (!targetChapterId) return;
        const query = new URLSearchParams({
            style: editorStyle,
            pathMode: storyPathMode,
        });
        router.push(`/story/manage/${storyId}/chapter/${targetChapterId}/edit?${query.toString()}`);
    }, [editorStyle, storyId, storyPathMode, router]);

    const handleCreateBranchTargetForChoice = useCallback(async (choiceId: string) => {
        if (!user || !storyId) return;
        if (!choiceId) return;
        if (isCreatingBranchTarget) return;

        setIsCreatingBranchTarget(true);
        try {
            const nowIso = new Date().toISOString();
            const maxOrderIndex = chapterTargets.reduce((max, target) => Math.max(max, Number(target.orderIndex) || 0), -1);
            const nextOrderIndex = maxOrderIndex + 1;
            const nextTitle = `ตอนที่ ${nextOrderIndex + 1}`;

            const { data, error } = await supabase
                .from('chapters')
                .insert([{
                    story_id: storyId,
                    user_id: user.id,
                    title: nextTitle,
                    draft_title: nextTitle,
                    draft_content: null,
                    draft_updated_at: nowIso,
                    order_index: nextOrderIndex,
                    status: 'draft',
                    is_premium: false,
                    coin_price: 0,
                }])
                .select('id, title, draft_title, published_title, order_index, status, is_premium, coin_price')
                .single();

            if (error || !data) {
                throw error || new Error('CREATE_TARGET_FAILED');
            }

            const createdTarget: BranchTargetOption = {
                id: String(data.id),
                title: String(data.draft_title || data.published_title || data.title || nextTitle),
                orderIndex: Number.isFinite(data.order_index) ? Number(data.order_index) : nextOrderIndex,
                status: data.status === 'published' ? 'published' : 'draft',
                isPremium: !!data.is_premium,
                coinPrice: Math.max(0, Number(data.coin_price || 0)),
            };

            setChapterTargets((prev) => {
                const exists = prev.some((target) => target.id === createdTarget.id);
                if (exists) return prev;
                return [...prev, createdTarget].sort((a, b) => a.orderIndex - b.orderIndex);
            });
            updateChapterChoice(choiceId, { toChapterId: createdTarget.id });
            setSelectedGraphNode({ type: 'target', id: createdTarget.id });
            setTargetEditorChapterId(createdTarget.id);
            showNotice('success', 'สร้างตอนปลายทางแล้ว', 'เชื่อมตัวเลือกกับตอนใหม่เรียบร้อย');
        } catch (error) {
            console.error('Failed to create branch target chapter:', error);
            showNotice('error', 'สร้างตอนปลายทางไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
        } finally {
            setIsCreatingBranchTarget(false);
        }
    }, [user, storyId, isCreatingBranchTarget, chapterTargets, updateChapterChoice, showNotice]);

    const getChoiceValidationError = useCallback((choices: BranchChoiceDraft[] = chapterChoices): string | null => {
        if (!isBranchingStory) return null;
        if (!isEndingChapter && choices.length < MIN_BRANCH_CHOICES) return `ต้องมีอย่างน้อย ${MIN_BRANCH_CHOICES} ทางเลือก (หากไม่มีต้องตั้งเป็นตอนจบเส้นทาง)`;
        if (choices.length > MAX_BRANCH_CHOICES) return `เพิ่มตัวเลือกได้สูงสุด ${MAX_BRANCH_CHOICES} รายการ`;

        for (const choice of choices) {
            if (!choice.choiceText.trim()) return 'ทุกตัวเลือกต้องมีข้อความทางเลือก';
            if (!choice.toChapterId) return 'ทุกตัวเลือกต้องเลือกตอนปลายทาง';
            if (choice.toChapterId === chapterId) return 'ปลายทางของทางเลือกต้องไม่ใช่ตอนปัจจุบัน';
        }

        return null;
    }, [isBranchingStory, chapterChoices, chapterId, isEndingChapter]);

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
        showNotice,
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
        persistSnapshotAsDraft,
        applySnapshotToEditor,
        saveRevisionSnapshot,
        showNotice,
    ]);

    const updateCharSelectorViewportPosition = useCallback((blockId: string | null) => {
        if (!blockId || typeof window === 'undefined') {
            setCharSelectorViewportPosition(null);
            return;
        }

        const anchor = charSelectorAnchorRefs.current[blockId];
        if (!anchor) {
            setCharSelectorViewportPosition(null);
            return;
        }

        const rect = anchor.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const dropdownWidth = 260;
        const dropdownMaxHeight = 320;
        const gutter = 8;

        const left = Math.min(
            Math.max(gutter, rect.left),
            Math.max(gutter, viewportWidth - dropdownWidth - gutter)
        );

        let top = rect.bottom + gutter;
        if (top + dropdownMaxHeight > viewportHeight - gutter) {
            top = Math.max(gutter, rect.top - dropdownMaxHeight - gutter);
        }

        const maxHeight = Math.max(
            120,
            Math.min(dropdownMaxHeight, viewportHeight - top - gutter)
        );

        setCharSelectorViewportPosition({ top, left, maxHeight });
    }, []);

    // Close popups when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (charSelectorRef.current && !charSelectorRef.current.contains(event.target as Node)) {
                setOpenCharSelectorId(null);
                setCharSelectorViewportPosition(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!openCharSelectorId) {
            setCharSelectorViewportPosition(null);
            return;
        }

        const handleResize = () => updateCharSelectorViewportPosition(openCharSelectorId);
        
        const handleAnyScroll = (e: Event) => {
            // Prevent closing if the scroll event originated from the char selector itself
            if (charSelectorRef.current && (e.target as Node) && charSelectorRef.current.contains(e.target as Node)) {
                return;
            }
            setOpenCharSelectorId(null);
            setCharSelectorViewportPosition(null);
        };

        handleResize();

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleAnyScroll, true);
        
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleAnyScroll, true);
        };
    }, [openCharSelectorId, updateCharSelectorViewportPosition, blocks.length]);

    useEffect(() => {
        if (!notice) return;
        if (notice.persistUntilClose) return;
        const timeout = setTimeout(() => setNotice(null), 2400);
        return () => clearTimeout(timeout);
    }, [notice]);

    useEffect(() => {
        if (!isRevisionDrawerOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isRevisionDrawerOpen]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsRevisionDrawerOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

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
        chapterChoices,
        isEndingChapter,
        choiceTimerSeconds,
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
                setBlocks(ensureBlocksForStyle(normalizeBlocks(parsed.blocks, 'cached-block'), editorStyle));
                setPovCharacterId(parsed.povCharacterId);
                setChatTheme(typeof parsed.chatTheme === 'string' ? parsed.chatTheme : 'white');
                setBackgroundSound(normalizeBackgroundSound(parsed.backgroundSound));
                setBackgroundSoundMeta(normalizeBackgroundSoundMeta(parsed.backgroundSoundMeta));
                setIsPremium(!!parsed.isPremium);
                setCoinPrice(Number.isFinite(parsed.coinPrice) ? Math.max(1, Number(parsed.coinPrice)) : 10);
                setIsEndingChapter(parsed.isEndingChapter === true);
                setChoiceTimerSeconds(normalizeChoiceTimerSeconds(parsed.choiceTimerSeconds));
                const parsedChoices = Array.isArray(parsed.chapterChoices)
                    ? (parsed.chapterChoices as BranchChoiceDraft[]).map((choice, index) => ({
                        id: choice.id || `choice-${index}`,
                        choiceText: choice.choiceText || '',
                        toChapterId: choice.toChapterId || null,
                        outcomeText: choice.outcomeText || '',
                        orderIndex: Number.isFinite(choice.orderIndex) ? Number(choice.orderIndex) : index,
                    }))
                    : [];
                const effectiveCachedChoices = parsed.isEndingChapter === true ? [] : parsedChoices;
                setChapterChoices(effectiveCachedChoices);
                updateSavedChoicesSignature(buildChoicesSignature(effectiveCachedChoices));
                setStoryPathMode(normalizePathMode(parsed.storyPathMode));
                const parsedBlocks = normalizeBlocks(parsed.blocks, 'cached-block');
                const cachedDraftContent: ChapterContentPayload = {
                    povCharacterId: parsed.povCharacterId || null,
                    chatTheme: typeof parsed.chatTheme === 'string' ? parsed.chatTheme : 'white',
                    backgroundSound: normalizeBackgroundSound(parsed.backgroundSound),
                    backgroundSoundMeta: normalizeBackgroundSoundMeta(parsed.backgroundSoundMeta),
                    blocks: ensureBlocksForStyle(parsedBlocks, editorStyle),
                    branchChoices: effectiveCachedChoices,
                    isEnding: parsed.isEndingChapter === true,
                    choiceTimerSeconds: normalizeChoiceTimerSeconds(parsed.choiceTimerSeconds),
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
                .select('user_id, path_mode')
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
            setStoryPathMode(normalizePathMode(storyData.path_mode));

            // Fetch Characters
            const { data: charsData } = await supabase
                .from('characters')
                .select('id, name, image_url')
                .eq('story_id', storyId)
                .order('order_index', { ascending: true });

            if (charsData) {
                setCharacters(charsData);
            }

            const { data: chapterRows, error: chapterRowsError } = await supabase
                .from('chapters')
                .select('id, title, draft_title, published_title, order_index, status, is_premium, coin_price')
                .eq('story_id', storyId)
                .order('order_index', { ascending: true });

            if (chapterRowsError) {
                throw chapterRowsError;
            }

            const targetRows: BranchTargetOption[] = ((chapterRows || []) as Array<{
                id: string;
                title: string | null;
                draft_title: string | null;
                published_title: string | null;
                order_index: number | null;
                status: string | null;
                is_premium: boolean | null;
                coin_price: number | null;
            }>).map((row, index) => ({
                id: row.id,
                title: String(row.draft_title || row.published_title || row.title || `ตอนที่ ${index + 1}`),
                orderIndex: Number.isFinite(row.order_index) ? Number(row.order_index) : index,
                status: row.status === 'published' ? 'published' : 'draft',
                isPremium: !!row.is_premium,
                coinPrice: Math.max(0, Number(row.coin_price || 0)),
            }));
            setChapterTargets(targetRows);

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
                const parsedBlocks = ensureBlocksForStyle(parsedContent.blocks, editorStyle);
                const parsedPov = parsedContent.povCharacterId;
                const parsedChatTheme = parsedContent.chatTheme || 'white';
                const parsedBackgroundSound = normalizeBackgroundSound(parsedContent.backgroundSound);
                const parsedBackgroundSoundMeta = normalizeBackgroundSoundMeta(parsedContent.backgroundSoundMeta);
                const parsedDraftChoices = parsedContent.branchChoices;
                const parsedIsEnding = parsedContent.isEnding === true;
                const parsedChoiceTimerSeconds = normalizeChoiceTimerSeconds(parsedContent.choiceTimerSeconds);

                setBlocks(parsedBlocks);
                setPovCharacterId(parsedPov);
                setChatTheme(parsedChatTheme);
                setBackgroundSound(parsedBackgroundSound);
                setBackgroundSoundMeta(parsedBackgroundSoundMeta);
                setChoiceTimerSeconds(parsedChoiceTimerSeconds);

                let choiceRows: Array<{
                    id: string;
                    choice_text: string | null;
                    to_chapter_id: string | null;
                    outcome_text?: string | null;
                    order_index: number | null;
                }> = [];

                const { data: choiceRowsWithOutcome, error: choiceRowsError } = await supabase
                    .from('chapter_choices')
                    .select('id, choice_text, to_chapter_id, outcome_text, order_index')
                    .eq('story_id', storyId)
                    .eq('from_chapter_id', chapterId)
                    .order('order_index', { ascending: true });

                if (choiceRowsError && isMissingOutcomeTextColumnError(choiceRowsError as { code?: string; message?: string })) {
                    const { data: fallbackChoiceRows, error: fallbackChoiceRowsError } = await supabase
                        .from('chapter_choices')
                        .select('id, choice_text, to_chapter_id, order_index')
                        .eq('story_id', storyId)
                        .eq('from_chapter_id', chapterId)
                        .order('order_index', { ascending: true });

                    if (fallbackChoiceRowsError) {
                        throw fallbackChoiceRowsError;
                    }

                    choiceRows = ((fallbackChoiceRows || []) as Array<{
                        id: string;
                        choice_text: string | null;
                        to_chapter_id: string | null;
                        order_index: number | null;
                    }>).map((row) => ({
                        ...row,
                        outcome_text: null,
                    }));
                } else if (choiceRowsError) {
                    throw choiceRowsError;
                } else {
                    choiceRows = (choiceRowsWithOutcome || []) as Array<{
                        id: string;
                        choice_text: string | null;
                        to_chapter_id: string | null;
                        outcome_text?: string | null;
                        order_index: number | null;
                    }>;
                }

                const mappedChoices: BranchChoiceDraft[] = choiceRows.map((row, index) => ({
                    id: String(row.id || `choice-${index}`),
                    choiceText: String(row.choice_text || ''),
                    toChapterId: row.to_chapter_id ? String(row.to_chapter_id) : null,
                    outcomeText: String(row.outcome_text || ''),
                    orderIndex: Number(row.order_index) || index,
                }));
                const effectiveChoicesRaw = parsedDraftChoices !== undefined ? parsedDraftChoices : mappedChoices;
                const effectiveChoices = parsedIsEnding ? [] : effectiveChoicesRaw;
                setIsEndingChapter(parsedIsEnding);
                setChapterChoices(effectiveChoices);
                updateSavedChoicesSignature(buildChoicesSignature(effectiveChoices));

                const loadedDraftContent: ChapterContentPayload = {
                    povCharacterId: isChatStyle ? parsedPov : null,
                    chatTheme: isChatStyle ? parsedChatTheme : undefined,
                    backgroundSound: isVisualNovelStyle ? parsedBackgroundSound : null,
                    backgroundSoundMeta: isVisualNovelStyle && parsedBackgroundSound ? parsedBackgroundSoundMeta : null,
                    blocks: ensureBlocksForStyle(parsedBlocks, editorStyle),
                    branchChoices: effectiveChoices,
                    isEnding: parsedIsEnding,
                    choiceTimerSeconds: parsedChoiceTimerSeconds,
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
                    backgroundSound: parsedBackgroundSound,
                    backgroundSoundMeta: parsedBackgroundSoundMeta,
                    isPremium: !!data.is_premium,
                    coinPrice: (data.coin_price && data.coin_price > 0) ? data.coin_price : 10,
                    chapterChoices: effectiveChoices,
                    isEndingChapter: parsedIsEnding,
                    choiceTimerSeconds: parsedChoiceTimerSeconds,
                    storyPathMode: normalizePathMode(storyData.path_mode),
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
        isVisualNovelStyle,
        editorStyle,
        buildSignatureFromSnapshot,
        buildChoicesSignature,
        updateSavedDraftSignature,
        updateSavedChoicesSignature,
    ]);

    useEffect(() => {
        if (!isBranchingStory || isChatStyle) {
            setSelectedGraphNode(null);
            return;
        }

        setSelectedGraphNode((prev) => {
            if (!prev) {
                if (chapterChoices.length > 0) {
                    return { type: 'choice', id: chapterChoices[0].id };
                }
                return null;
            }

            if (prev.type === 'choice') {
                const exists = chapterChoices.some((choice) => choice.id === prev.id);
                if (exists) return prev;
                if (chapterChoices.length > 0) return { type: 'choice', id: chapterChoices[0].id };
                return null;
            }

            if (prev.type === 'target') {
                const exists = chapterTargets.some((target) => target.id === prev.id);
                if (exists) return prev;
                if (chapterChoices.length > 0) return { type: 'choice', id: chapterChoices[0].id };
                return null;
            }

            return null;
        });
    }, [isBranchingStory, isChatStyle, chapterChoices, chapterTargets]);

    useEffect(() => {
        if (!isBranchingStory || isChatStyle) return;

        const fromQuery = parseGraphSelection(searchParams.get('selected'));
        if (!fromQuery) return;

        const isChoiceValid = fromQuery.type === 'choice' && chapterChoices.some((choice) => choice.id === fromQuery.id);
        const isTargetValid = fromQuery.type === 'target' && chapterTargets.some((target) => target.id === fromQuery.id);
        if (!isChoiceValid && !isTargetValid) return;

        // Keep editor state as the source of truth after local interactions
        // (add/remove/select). Query param is mainly for initial deep-link.
        if (selectedGraphNode?.type === 'choice' && chapterChoices.some((choice) => choice.id === selectedGraphNode.id)) {
            return;
        }
        if (selectedGraphNode?.type === 'target' && chapterTargets.some((target) => target.id === selectedGraphNode.id)) {
            return;
        }

        setSelectedGraphNode((prev) => {
            if (prev?.type === fromQuery.type && prev.id === fromQuery.id) {
                return prev;
            }
            return fromQuery;
        });
    }, [searchParams, isBranchingStory, isChatStyle, chapterChoices, chapterTargets, selectedGraphNode]);

    useEffect(() => {
        if (!isBranchingStory || isChatStyle) return;

        const currentPanel = searchParams.get('panel');
        const currentSelected = searchParams.get('selected');
        const nextSelected = selectedGraphNode ? `${selectedGraphNode.type}:${selectedGraphNode.id}` : '';
        if (currentPanel === 'branch' && (currentSelected || '') === nextSelected) return;

        const params = new URLSearchParams(searchParams.toString());
        params.set('panel', 'branch');
        if (nextSelected) {
            params.set('selected', nextSelected);
        } else {
            params.delete('selected');
        }

        router.replace(`?${params.toString()}`, { scroll: false });
    }, [selectedGraphNode, isBranchingStory, isChatStyle, searchParams, router]);

    useEffect(() => {
        if (!isBranchingStory || isChatStyle) return;

        const handleBranchShortcut = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target) {
                const tagName = target.tagName.toLowerCase();
                const isTypingTarget =
                    target.isContentEditable ||
                    tagName === 'input' ||
                    tagName === 'textarea' ||
                    tagName === 'select';
                if (isTypingTarget) return;
            }

            if (event.metaKey || event.ctrlKey || event.altKey) return;

            if (event.key.toLowerCase() === 'a') {
                event.preventDefault();
                addChapterChoice();
                return;
            }

            if (event.key === 'Delete' || event.key === 'Backspace') {
                if (selectedGraphNode?.type === 'choice') {
                    event.preventDefault();
                    removeChapterChoice(selectedGraphNode.id);
                }
            }
        };

        window.addEventListener('keydown', handleBranchShortcut);
        return () => window.removeEventListener('keydown', handleBranchShortcut);
    }, [isBranchingStory, isChatStyle, addChapterChoice, removeChapterChoice, selectedGraphNode]);

    useEffect(() => {
        if (!isNodeMapModalOpen) return;

        const handleEscClose = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsNodeMapModalOpen(false);
            }
        };

        window.addEventListener('keydown', handleEscClose);
        return () => window.removeEventListener('keydown', handleEscClose);
    }, [isNodeMapModalOpen]);

    useEffect(() => {
        if (!targetEditorChapterId) return;

        const handleEscClose = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setTargetEditorChapterId(null);
            }
        };

        window.addEventListener('keydown', handleEscClose);
        return () => window.removeEventListener('keydown', handleEscClose);
    }, [targetEditorChapterId]);

    useEffect(() => {
        if (!isBranchingStory || isChatStyle) {
            setIsNodeMapModalOpen(false);
            setTargetEditorChapterId(null);
        }
    }, [isBranchingStory, isChatStyle]);

    useEffect(() => {
        if (!targetEditorChapterId) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [targetEditorChapterId]);

    const handleSave = async (publish: boolean = false) => {
        if (!title.trim()) {
            showNotice('error', 'กรุณากรอกชื่อตอน', 'ต้องใส่ชื่อตอนก่อนบันทึกหรือเผยแพร่');
            return;
        }

        const choiceValidationError = getChoiceValidationError(chapterChoices);
        if (publish && choiceValidationError) {
            showNotice('error', 'ตรวจสอบตัวเลือกเส้นทางไม่ผ่าน', choiceValidationError);
            return;
        }
        const choicesForSave = isBranchingStory && !isEndingChapter ? chapterChoices : [];

        const newStatus = publish ? 'published' : status;
        const cleanBlocks = blocks.filter(isMeaningfulBlock);
        const normalizedBlocks = ensureBlocksForStyle(cleanBlocks, editorStyle);
        const contentPayload: ChapterContentPayload = {
            povCharacterId: isChatStyle ? povCharacterId : null,
            chatTheme: isChatStyle ? chatTheme : undefined,
            backgroundSound: isVisualNovelStyle ? backgroundSound : null,
            backgroundSoundMeta: isVisualNovelStyle && backgroundSound ? backgroundSoundMeta : null,
            blocks: normalizedBlocks,
            isEnding: isBranchingStory ? isEndingChapter : undefined,
            choiceTimerSeconds: isBranchingStory ? choiceTimerSeconds : undefined,
        };
        const draftContentPayload: ChapterContentPayload = {
            ...contentPayload,
            branchChoices: choicesForSave.map((choice, index) => ({
                id: choice.id || `choice-${index}`,
                choiceText: choice.choiceText || '',
                toChapterId: choice.toChapterId || null,
                outcomeText: choice.outcomeText || '',
                orderIndex: index,
            })),
        };

        if (publish) {
            try {
                const moderationResult = await runPublishModerationCheck({
                    title,
                    draftContent: draftContentPayload,
                });

                if (!moderationResult.allowed) {
                    showModerationBlockNotice(
                        formatModerationReasons(moderationResult.reasons),
                    );
                    return;
                }
            } catch (moderationError) {
                const message = moderationError instanceof Error && moderationError.message === 'AUTH_REQUIRED'
                    ? 'กรุณาเข้าสู่ระบบใหม่ก่อนเผยแพร่'
                    : moderationError instanceof Error && moderationError.message
                        ? moderationError.message
                        : 'ตรวจสอบความปลอดภัยก่อนเผยแพร่ไม่สำเร็จ';
                showNotice('error', 'ไม่สามารถเผยแพร่ได้', message);
                return;
            }
        }

        const draftSignatureForSave = buildSignatureFromSnapshot({
            title,
            content: draftContentPayload,
            isPremium,
            coinPrice,
            statusValue: newStatus,
        });
        const normalizedChoicesPayload = choicesForSave
            .map((choice, index) => ({
                id: choice.id,
                to_chapter_id: choice.toChapterId,
                choice_text: choice.choiceText.trim(),
                outcome_text: choice.outcomeText.trim() || null,
                order_index: index,
            }));
        const choiceSignatureForSave = buildChoicesSignature(choicesForSave);

        if (!publish && draftSignatureForSave === savedDraftSignature && choiceSignatureForSave === savedChoicesSignature) {
            showNotice('success', 'ไม่มีการเปลี่ยนแปลง', 'ร่างล่าสุดตรงกับข้อมูลที่บันทึกไว้แล้ว');
            return;
        }

        setIsSaving(true);

        try {
            const nowIso = new Date().toISOString();
            const updatePayload: Record<string, unknown> = {
                draft_title: title,
                draft_content: draftContentPayload,
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

            if (BRANCHING_FEATURE_ENABLED && (publish || !choiceValidationError)) {
                const { error: choiceError } = await supabase.rpc('replace_chapter_choices', {
                    p_story_id: storyId,
                    p_from_chapter_id: chapterId,
                    p_choices: isBranchingStory ? normalizedChoicesPayload : [],
                });

                if (choiceError) {
                    if ((choiceError as { code?: string }).code === '42883') {
                        throw new Error('CHOICES_RPC_NOT_FOUND');
                    }
                    throw choiceError;
                }
            }

            setStatus(newStatus);
            setLastSavedAt(nowIso);
            updateSavedDraftSignature(draftSignatureForSave);
            updateSavedChoicesSignature(choiceSignatureForSave);
            if (cleanBlocks.length !== blocks.length || normalizedBlocks.length !== blocks.length) {
                setBlocks(normalizedBlocks);
            }
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
            const contentPolicyMessage = extractContentPolicyBlockMessage(err);
            if (err instanceof Error && err.message === 'CHOICES_RPC_NOT_FOUND') {
                showNotice('error', 'ระบบยังไม่พร้อม', 'ยังไม่พบ RPC ตัวเลือกเส้นทาง กรุณารัน migration ล่าสุดก่อนใช้งาน');
            } else if (contentPolicyMessage) {
                showModerationBlockNotice(contentPolicyMessage);
            } else {
                showNotice('error', 'บันทึกไม่สำเร็จ', 'เกิดข้อผิดพลาดในการบันทึก กรุณาลองอีกครั้ง');
            }
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
        const newId = createBlockId(isVisualNovelStyle ? 'scene' : 'block');
        setBlocks(prev => {
            let inheritedCharId: string | null = null;
            let inheritedScene: Block | null = null;
            if (afterId && isChatStyle) {
                const afterBlock = prev.find(b => b.id === afterId);
                if (afterBlock) {
                    inheritedCharId = afterBlock.characterId;
                }
            }
            if (afterId && isVisualNovelStyle) {
                inheritedScene = prev.find((block) => block.id === afterId) || null;
            }

            const newBlock: Block = isVisualNovelStyle
                ? {
                    ...createEmptySceneBlock(newId),
                    layoutMode: normalizeSceneLayoutMode(inheritedScene?.layoutMode),
                    backgroundUrl: inheritedScene?.backgroundUrl || null,
                    leftCharacterId: inheritedScene?.leftCharacterId || null,
                    rightCharacterId: inheritedScene?.rightCharacterId || null,
                    soloCharacterId: inheritedScene?.soloCharacterId || null,
                    speakerCharacterId: inheritedScene?.speakerCharacterId || null,
                    leftSceneImageUrl: inheritedScene?.leftSceneImageUrl || null,
                    rightSceneImageUrl: inheritedScene?.rightSceneImageUrl || null,
                    soloSceneImageUrl: inheritedScene?.soloSceneImageUrl || null,
                    focusSide: inheritedScene?.focusSide || 'none',
                }
                : { ...createEmptyParagraphBlock(newId), characterId: inheritedCharId };

            if (!afterId) return [...prev, newBlock];
            const index = prev.findIndex(b => b.id === afterId);
            if (index === -1) return [...prev, newBlock];
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            return newBlocks;
        });

        // Focus the new block after a short delay to allow React to render it
        setTimeout(() => {
            const elementId = isVisualNovelStyle ? `scene-text-${newId}` : `textarea-${newId}`;
            const el = document.getElementById(elementId) as HTMLTextAreaElement | null;
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
            characterId: activeCharacterId,
            isFlashback: false,
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

        // Auto scroll to bottom
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const openSceneImagePicker = (blockId: string, slot: SceneImageTargetSlot) => {
        setSceneImageTarget({ blockId, slot });
        imageInputRef.current?.click();
    };

    const commitSceneImageSlotChange = useCallback(async ({
        blockId,
        slot,
        nextUrl,
        uploadedUrls = [],
        failureMessage,
    }: {
        blockId: string;
        slot: SceneImageTargetSlot;
        nextUrl: string | null;
        uploadedUrls?: Array<string | null | undefined>;
        failureMessage: string;
    }) => {
        const previousBlocks = blocks;
        const targetBlock = previousBlocks.find((block) => block.id === blockId);
        if (!targetBlock || targetBlock.type !== 'scene') return false;

        const previousUrl = typeof targetBlock[slot] === 'string' ? targetBlock[slot] : null;
        const nextBlocks = previousBlocks.map((block) => (
            block.id === blockId
                ? { ...block, [slot]: nextUrl }
                : block
        ));

        return commitBlocksMutation({
            previousBlocks,
            nextBlocks,
            oldUrls: [previousUrl],
            uploadedUrls,
            failureMessage,
        });
    }, [blocks, commitBlocksMutation]);

    const handleClearSceneImage = useCallback((blockId: string, slot: SceneImageTargetSlot) => {
        void commitSceneImageSlotChange({
            blockId,
            slot,
            nextUrl: null,
            failureMessage: 'ไม่สามารถล้างภาพฉากนี้ได้ กรุณาลองใหม่อีกครั้ง',
        });
    }, [commitSceneImageSlotChange]);

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

            if (isVisualNovelStyle && sceneImageTarget) {
                await commitSceneImageSlotChange({
                    blockId: sceneImageTarget.blockId,
                    slot: sceneImageTarget.slot,
                    nextUrl: publicUrl,
                    uploadedUrls: [publicUrl],
                    failureMessage: 'ไม่สามารถบันทึกรูปฉากนี้ได้ กรุณาลองใหม่อีกครั้ง',
                });
                setSceneImageTarget(null);
            } else {
                const newId = createBlockId('block');
                const newBlock: Block = {
                    id: newId,
                    type: 'image',
                    text: '',
                    characterId: activeCharacterId,
                    imageUrl: publicUrl,
                    isFlashback: false,
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
            }

        } catch (error) {
            console.error('Error uploading chat image:', error);
            alert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
        } finally {
            setIsUploadingImage(false);
            setSceneImageTarget(null);
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

    const getDefaultImageQuery = (
        target: 'chat' | 'character' | 'narrative' | 'visual_novel',
        slot?: SceneImageTargetSlot,
    ) => {
        if (target === 'chat') return 'cinematic scene';
        if (target === 'visual_novel') {
            return slot === 'backgroundUrl'
                ? 'anime sci-fi background'
                : 'anime character illustration';
        }
        if (target === 'narrative') return 'fantasy landscape';
        return 'portrait character';
    };

    const handleSearchImages = async (rawQuery?: string, sourceOverride?: ImageSearchSource) => {
        const query = (rawQuery ?? unsplashQuery).trim();
        const source = sourceOverride ?? imageSearchSource;
        if (!query) {
            setUnsplashResults([]);
            setUnsplashError(null);
            return;
        }

        setIsUnsplashLoading(true);
        setUnsplashError(null);

        try {
            const endpoint = source === 'pixabay'
                ? `/api/pixabay/images?q=${encodeURIComponent(query)}&perPage=${IMAGE_SEARCH_PER_PAGE}`
                : `/api/unsplash/search?q=${encodeURIComponent(query)}&perPage=${IMAGE_SEARCH_PER_PAGE}`;
            const response = await fetch(endpoint);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.error || 'ค้นหารูปไม่สำเร็จ');
            }

            const normalizedResults = ((data.results || []) as Array<Omit<ImageSearchResult, 'source'>>).map((item) => ({
                ...item,
                source,
                sourceUrl: item.sourceUrl ?? item.unsplashUrl ?? null,
            }));

            setUnsplashResults(normalizedResults);
            setUnsplashError(typeof data?.error === 'string' ? data.error : null);
        } catch (error) {
            console.error('Image search failed:', error);
            setUnsplashError(error instanceof Error ? error.message : 'ค้นหารูปไม่สำเร็จ ลองใหม่อีกครั้ง');
        } finally {
            setIsUnsplashLoading(false);
        }
    };

    const openUnsplashPicker = (
        target: 'chat' | 'character' | 'narrative' | 'visual_novel',
        blockId?: string,
        slot?: SceneImageTargetSlot,
    ) => {
        setUnsplashTarget(target);
        setImageSearchSource('unsplash');
        setSceneImageTarget(
            target === 'visual_novel' && blockId && slot
                ? { blockId, slot }
                : null
        );
        setShowUnsplashModal(true);
        setUnsplashError(null);

        if (!unsplashQuery) {
            const defaultQuery = getDefaultImageQuery(target, slot);
            setUnsplashQuery(defaultQuery);
            handleSearchImages(defaultQuery, 'unsplash');
        } else if (unsplashResults.length === 0) {
            handleSearchImages(unsplashQuery, 'unsplash');
        }
    };

    const handleSelectUnsplashImage = async (image: ImageSearchResult) => {
        if (unsplashTarget === 'chat') {
            const newId = createBlockId('block');
            const newBlock: Block = {
                id: newId,
                type: 'image',
                text: '',
                characterId: activeCharacterId,
                imageUrl: image.regular,
                isFlashback: false,
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
        } else if (unsplashTarget === 'visual_novel' && sceneImageTarget) {
            await commitSceneImageSlotChange({
                blockId: sceneImageTarget.blockId,
                slot: sceneImageTarget.slot,
                nextUrl: image.regular,
                failureMessage: 'ไม่สามารถบันทึกรูปฉากจาก Unsplash ได้ กรุณาลองใหม่อีกครั้ง',
            });
        } else if (unsplashTarget === 'narrative') {
            const newId = createBlockId('block');
            const newBlock: Block = {
                id: newId,
                type: 'image',
                text: '',
                characterId: null,
                imageUrl: image.regular,
                isFlashback: false,
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

        setSceneImageTarget(null);
        setShowUnsplashModal(false);
    };

    const handleImageSourceChange = (nextSource: ImageSearchSource) => {
        setImageSearchSource(nextSource);
        setUnsplashError(null);

        if (unsplashQuery.trim()) {
            void handleSearchImages(unsplashQuery, nextSource);
            return;
        }

        const defaultQuery = getDefaultImageQuery(
            unsplashTarget,
            unsplashTarget === 'visual_novel' ? sceneImageTarget?.slot : undefined,
        );
        setUnsplashQuery(defaultQuery);
        void handleSearchImages(defaultQuery, nextSource);
    };

    const removeBlock = async (id: string) => {
        const previousBlocks = blocks;
        const blockToRemove = previousBlocks.find((block) => block.id === id);
        if (!blockToRemove) return;

        const index = previousBlocks.findIndex((block) => block.id === id);
        if (index > 0) {
            setTimeout(() => {
                const previousId = previousBlocks[index - 1].id;
                const textAreaId = previousBlocks[index - 1].type === 'scene'
                    ? `scene-text-${previousId}`
                    : `textarea-${previousId}`;
                const element = document.getElementById(textAreaId);
                if (element) element.focus();
            }, 0);
        }

        const nextBlocks = previousBlocks.length <= 1
            ? ensureBlocksForStyle([], editorStyle)
            : previousBlocks.filter((block) => block.id !== id);

        const removableImageUrls = blockToRemove.type === 'image'
            ? [blockToRemove.imageUrl].filter((url): url is string => typeof url === 'string' && url.length > 0)
            : blockToRemove.type === 'scene'
                ? [
                    blockToRemove.backgroundUrl,
                    blockToRemove.leftSceneImageUrl,
                    blockToRemove.rightSceneImageUrl,
                    blockToRemove.soloSceneImageUrl,
                ].filter((url): url is string => typeof url === 'string' && url.length > 0)
                : [];

        await commitBlocksMutation({
            previousBlocks,
            nextBlocks,
            oldUrls: removableImageUrls,
            failureMessage: blockToRemove.type === 'scene'
                ? 'ไม่สามารถลบฉากนี้ได้ กรุณาลองใหม่อีกครั้ง'
                : 'ไม่สามารถลบบล็อกนี้ได้ กรุณาลองใหม่อีกครั้ง',
        });
    };

    const moveBlockUp = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index <= 0) return prev;
            const newBlocks = [...prev];
            const temp = newBlocks[index - 1];
            newBlocks[index - 1] = newBlocks[index];
            newBlocks[index] = temp;
            return newBlocks;
        });
    }, []);

    const moveBlockDown = useCallback((id: string) => {
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === id);
            if (index < 0 || index >= prev.length - 1) return prev;
            const newBlocks = [...prev];
            const temp = newBlocks[index + 1];
            newBlocks[index + 1] = newBlocks[index];
            newBlocks[index] = temp;
            return newBlocks;
        });
    }, []);

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
    }, [isLoading, blocks]);

    const wordCount = blocks.reduce((acc, block) => acc + (block.text.trim() ? block.text.trim().split(/\s+/).length : 0), 0);
    const charCount = blocks.reduce((acc, block) => acc + block.text.length, 0);
    const choiceValidationError = getChoiceValidationError(chapterChoices);
    const hasEndingState = isBranchingStory && isEndingChapter;
    const hasNoBranchChoices = isBranchingStory && chapterChoices.length === 0;
    const missingChoiceTextCount = chapterChoices.filter((choice) => !choice.choiceText.trim()).length;
    const missingChoiceTargetCount = chapterChoices.filter((choice) => !choice.toChapterId).length;
    const selectedChoice = useMemo(
        () =>
            selectedGraphNode?.type === 'choice'
                ? chapterChoices.find((choice) => choice.id === selectedGraphNode.id) || null
                : null,
        [selectedGraphNode, chapterChoices]
    );
    const selectedTarget = useMemo(
        () =>
            selectedGraphNode?.type === 'target'
                ? chapterTargets.find((target) => target.id === selectedGraphNode.id) || null
                : null,
        [selectedGraphNode, chapterTargets]
    );
    const getAvailableTargetsForChoice = useCallback((choiceId: string | null | undefined) => {
        const selectedTargetId = choiceId
            ? chapterChoices.find((choice) => choice.id === choiceId)?.toChapterId || null
            : null;
        const usedTargetIds = new Set(
            chapterChoices
                .filter((choice) => choice.id !== choiceId && choice.toChapterId)
                .map((choice) => choice.toChapterId as string)
        );

        return chapterTargets.filter((target) => (
            target.id !== chapterId
            && (!usedTargetIds.has(target.id) || target.id === selectedTargetId)
        ));
    }, [chapterChoices, chapterTargets, chapterId]);

    const selectedChoiceIssues = useMemo(
        () => ({
            missingText: !!selectedChoice && !selectedChoice.choiceText.trim(),
            missingTarget: !!selectedChoice && !selectedChoice.toChapterId,
        }),
        [selectedChoice]
    );
    const targetEditorChapter = useMemo(
        () => (targetEditorChapterId ? chapterTargets.find((target) => target.id === targetEditorChapterId) || null : null),
        [targetEditorChapterId, chapterTargets]
    );
    const targetEditorUrl = useMemo(
        () => (targetEditorChapterId ? buildChapterEditorUrl(targetEditorChapterId) : ''),
        [targetEditorChapterId, buildChapterEditorUrl]
    );

    const branchGraph = useMemo(() => {
        const nodes: BranchGraphNode[] = [];
        const edges: BranchGraphEdge[] = [];
        const rowHeight = 102;
        const startY = 32;
        const targetById = new Map(chapterTargets.map((target) => [target.id, target]));
        const targetAnchorById = new Map<string, number>();
        let dynamicTargetCount = 0;

        const currentY = startY + Math.max(0, (chapterChoices.length - 1) * rowHeight) / 2;
        nodes.push({
            id: 'current',
            label: title.trim() || 'ตอนปัจจุบัน',
            subtitle: 'Current',
            kind: 'current',
            status: 'ready',
            x: 24,
            y: currentY,
        });

        if (chapterChoices.length === 0) {
            nodes.push({
                id: 'ending',
                label: isEndingChapter ? 'Ending' : 'Draft',
                subtitle: isEndingChapter ? 'ตั้งเป็นตอนจบแล้ว' : 'ยังไม่มีทางเลือก',
                kind: 'ending',
                status: 'ready',
                x: 640,
                y: currentY,
            });
            edges.push({
                id: 'edge-current-ending',
                from: 'current',
                to: 'ending',
                label: isEndingChapter ? 'จบตอน' : 'รอเพิ่มทางเลือก',
            });
            return { nodes, edges };
        }

        chapterChoices.forEach((choice, index) => {
            const choiceNodeId = `choice:${choice.id}`;
            const choiceY = startY + index * rowHeight;
            const target = choice.toChapterId ? targetById.get(choice.toChapterId) : null;
            const choiceStatus: BranchGraphNode['status'] = !choice.choiceText.trim()
                ? 'missing_text'
                : !choice.toChapterId || !target
                    ? 'missing_target'
                    : 'ready';

            nodes.push({
                id: choiceNodeId,
                label: choice.choiceText.trim() || `ทางเลือก ${index + 1}`,
                subtitle: !choice.choiceText.trim()
                    ? 'ยังไม่กรอกข้อความ'
                    : !choice.toChapterId
                        ? 'ยังไม่เลือกปลายทาง'
                        : target
                            ? `ไปตอน ${target.orderIndex + 1}`
                            : 'ไม่พบตอนปลายทาง',
                kind: 'choice',
                status: choiceStatus,
                x: 320,
                y: choiceY,
                selection: { type: 'choice', id: choice.id },
                choiceId: choice.id,
            });

            edges.push({
                id: `edge-current-choice:${choice.id}`,
                from: 'current',
                to: choiceNodeId,
                label: `ทางเลือก ${index + 1}`,
                choiceId: choice.id,
            });

            let targetNodeId: string;
            if (!choice.toChapterId || !target) {
                targetNodeId = `target-missing:${choice.id}`;
                nodes.push({
                    id: targetNodeId,
                    label: !choice.toChapterId ? 'ยังไม่เลือกปลายทาง' : 'ไม่พบตอนปลายทาง',
                    subtitle: 'Missing target',
                    kind: 'target',
                    status: 'missing_target',
                    x: 640,
                    y: choiceY,
                });
            } else {
                targetNodeId = `target:${target.id}`;
                if (!targetAnchorById.has(target.id)) {
                    const y = startY + dynamicTargetCount * rowHeight;
                    dynamicTargetCount += 1;
                    targetAnchorById.set(target.id, y);
                    nodes.push({
                        id: targetNodeId,
                        label: target.title,
                        subtitle: `ตอน ${target.orderIndex + 1} · ${target.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}`,
                        kind: 'target',
                        status: target.status === 'published' ? 'published_target' : 'draft_target',
                        x: 640,
                        y,
                        selection: { type: 'target', id: target.id },
                    });
                }
            }

            edges.push({
                id: `edge-choice-target:${choice.id}`,
                from: choiceNodeId,
                to: targetNodeId,
                label: 'ไปตอนปลายทาง',
                choiceId: choice.id,
                isMissing: !choice.choiceText.trim() || !choice.toChapterId || !target,
            });
        });

        return { nodes, edges };
    }, [chapterChoices, chapterTargets, title, isEndingChapter]);

    const handleValidateBranchChoices = useCallback(() => {
        if (isEndingChapter) {
            showNotice('success', 'ตรวจสอบผ่านแล้ว', 'ตอนนี้ถูกตั้งเป็นตอนจบ ผู้อ่านจะจบเส้นทางที่ตอนนี้');
            return;
        }
        const error = getChoiceValidationError(chapterChoices);
        if (error) {
            showNotice('error', 'ตรวจสอบตัวเลือกเส้นทางไม่ผ่าน', error);
            return;
        }
        showNotice('success', 'ตรวจสอบผ่านแล้ว', 'ทุกทางเลือกพร้อมสำหรับบันทึกหรือเผยแพร่');
    }, [getChoiceValidationError, chapterChoices, isEndingChapter, showNotice]);

    const focusSpellcheckFieldById = useCallback((fieldId: string) => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        const target = document.getElementById(fieldId) as HTMLTextAreaElement | HTMLInputElement | null;
        if (!target || target.disabled || target.readOnly) return;

        try {
            target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch {
            target.scrollIntoView();
        }
        try {
            target.focus({ preventScroll: true });
        } catch {
            target.focus();
        }

        if (typeof target.setSelectionRange === 'function') {
            const end = target.value.length;
            target.setSelectionRange(end, end);
        }

        target.classList.remove(styles.spellcheckFocusFlash);
        // Force reflow so repeated clicks replay the pulse animation.
        void target.offsetWidth;
        target.classList.add(styles.spellcheckFocusFlash);
        window.setTimeout(() => {
            target.classList.remove(styles.spellcheckFocusFlash);
        }, 1200);
    }, []);

    const normalizeWordIssues = useCallback((issues: ChapterSpellcheckWordIssue[] | null | undefined, textLength: number) => {
        if (!Array.isArray(issues) || issues.length === 0) return [] as ChapterSpellcheckWordIssue[];

        const normalized = issues
            .map((issue) => {
                const start = Math.max(0, Math.floor(Number(issue.start)));
                const end = Math.min(textLength, Math.max(0, Math.floor(Number(issue.end))));
                const word = typeof issue.word === 'string' ? issue.word : '';
                const suggestions = Array.isArray(issue.suggestions)
                    ? issue.suggestions
                        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                        .map((item) => item.trim())
                        .slice(0, 6)
                    : [];
                if (!word || end <= start) return null;
                return { start, end, word, suggestions };
            })
            .filter((issue): issue is ChapterSpellcheckWordIssue => issue !== null)
            .sort((a, b) => a.start - b.start || a.end - b.end);

        const deduped: ChapterSpellcheckWordIssue[] = [];
        let lastEnd = -1;
        for (const issue of normalized) {
            if (issue.start < lastEnd) continue;
            deduped.push(issue);
            lastEnd = issue.end;
        }
        return deduped;
    }, []);

    const buildInlineSpellSegments = useCallback((text: string, issues: ChapterSpellcheckWordIssue[]): InlineSpellSegment[] => {
        if (!text) return [{ text: '\u00a0', issue: null }];
        if (issues.length === 0) return [{ text, issue: null }];

        const segments: InlineSpellSegment[] = [];
        let cursor = 0;

        for (const issue of issues) {
            if (issue.start > cursor) {
                segments.push({
                    text: text.slice(cursor, issue.start),
                    issue: null,
                });
            }
            segments.push({
                text: text.slice(issue.start, issue.end),
                issue,
            });
            cursor = issue.end;
        }

        if (cursor < text.length) {
            segments.push({
                text: text.slice(cursor),
                issue: null,
            });
        }

        return segments.length > 0 ? segments : [{ text: '\u00a0', issue: null }];
    }, []);

    const findLiveIssueAtCaret = useCallback((fieldId: string, caret: number) => {
        const issues = liveSpellcheckByFieldId[fieldId] || [];
        if (issues.length === 0) return null;
        const normalizedCaret = Math.max(0, caret);
        return issues.find((issue) => (
            normalizedCaret >= issue.start && normalizedCaret <= issue.end
        )) || issues.find((issue) => (
            normalizedCaret >= issue.start - 1 && normalizedCaret <= issue.end
        )) || null;
    }, [liveSpellcheckByFieldId]);

    const hasSpellcheckIssue = useCallback((fieldId: string) => {
        if (spellcheckIssueFieldSet.has(fieldId)) return true;
        const liveIssues = liveSpellcheckByFieldId[fieldId];
        return Array.isArray(liveIssues) && liveIssues.length > 0;
    }, [liveSpellcheckByFieldId, spellcheckIssueFieldSet]);

    const getSpellcheckFieldById = useCallback((fieldId: string): ChapterSpellcheckFieldInput | null => {
        if (fieldId === 'chapter-title-input') {
            return {
                id: fieldId,
                label: 'ชื่อตอน',
                text: title,
            };
        }

        if (fieldId === 'chat-input-draft' && isChatStyle) {
            return {
                id: fieldId,
                label: 'ช่องพิมพ์แชท',
                text: chatInputValue,
            };
        }

        if (fieldId.startsWith('scene-text-') && isVisualNovelStyle) {
            const blockId = fieldId.slice('scene-text-'.length);
            const sceneIndex = blocks.findIndex((block) => block.id === blockId);
            if (sceneIndex === -1) return null;
            return {
                id: fieldId,
                label: `บทพูดฉาก ${sceneIndex + 1}`,
                text: blocks[sceneIndex].text,
            };
        }

        if (fieldId.startsWith('textarea-')) {
            const blockId = fieldId.slice('textarea-'.length);
            const textBlocks = blocks.filter((block) => block.type !== 'image');
            const textIndex = textBlocks.findIndex((block) => block.id === blockId);
            if (textIndex === -1) return null;
            return {
                id: fieldId,
                label: isChatStyle ? `ข้อความแชท ${textIndex + 1}` : `เนื้อหา ${textIndex + 1}`,
                text: textBlocks[textIndex].text,
            };
        }

        if (fieldId.startsWith('choice-text-') && isBranchingStory && !isEndingChapter) {
            const choiceId = fieldId.slice('choice-text-'.length);
            const choiceIndex = chapterChoices.findIndex((choice) => choice.id === choiceId);
            if (choiceIndex === -1) return null;
            return {
                id: fieldId,
                label: `ทางเลือก ${choiceIndex + 1}`,
                text: chapterChoices[choiceIndex].choiceText,
            };
        }

        if (fieldId.startsWith('choice-outcome-') && isBranchingStory && !isEndingChapter) {
            const choiceId = fieldId.slice('choice-outcome-'.length);
            const choiceIndex = chapterChoices.findIndex((choice) => choice.id === choiceId);
            if (choiceIndex === -1) return null;
            return {
                id: fieldId,
                label: `ผลลัพธ์ทางเลือก ${choiceIndex + 1}`,
                text: chapterChoices[choiceIndex].outcomeText,
            };
        }

        return null;
    }, [
        title,
        isChatStyle,
        chatInputValue,
        isVisualNovelStyle,
        blocks,
        isBranchingStory,
        isEndingChapter,
        chapterChoices,
    ]);

    const activeLiveSpellIssues = useMemo(() => {
        if (!activeSpellcheckFieldId) return [] as ChapterSpellcheckWordIssue[];
        const activeField = getSpellcheckFieldById(activeSpellcheckFieldId);
        if (!activeField) return [] as ChapterSpellcheckWordIssue[];
        const fieldIssues = liveSpellcheckByFieldId[activeSpellcheckFieldId];
        return normalizeWordIssues(fieldIssues, activeField.text.length);
    }, [activeSpellcheckFieldId, getSpellcheckFieldById, liveSpellcheckByFieldId, normalizeWordIssues]);

    const openSuggestionPopoverAtCaret = useCallback((
        fieldId: string,
        caretPosition: number,
        clientX: number,
        clientY: number,
    ) => {
        const issue = findLiveIssueAtCaret(fieldId, caretPosition);
        if (!issue) {
            setActiveSuggestionPopover(null);
            return;
        }
        const suggestions = issue.suggestions
            .filter((item) => item && item !== issue.word)
            .slice(0, 6);
        setActiveSuggestionPopover({
            fieldId,
            start: issue.start,
            end: issue.end,
            word: issue.word,
            suggestions,
            clientX,
            clientY,
        });
    }, [findLiveIssueAtCaret]);

    const handleSpellcheckFieldFocus = useCallback((fieldId: string) => {
        setActiveSpellcheckFieldId(fieldId);
    }, []);

    const handleSpellcheckFieldBlur = useCallback((fieldId: string) => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        window.setTimeout(() => {
            const activeElement = document.activeElement as HTMLElement | null;
            if (activeElement?.id === fieldId) return;
            if (activeElement?.closest('[data-spellcheck-popover="true"]')) return;
            setActiveSpellcheckFieldId((prev) => (prev === fieldId ? null : prev));
        }, 0);
    }, []);

    const handleSpellcheckFieldMouseUp = useCallback((
        fieldId: string,
        event: ReactMouseEvent<HTMLTextAreaElement | HTMLInputElement>,
    ) => {
        const target = event.currentTarget;
        const caret = typeof target.selectionStart === 'number' ? target.selectionStart : 0;
        openSuggestionPopoverAtCaret(fieldId, caret, event.clientX, event.clientY);
    }, [openSuggestionPopoverAtCaret]);

    const renderSpellcheckOverlay = useCallback((
        fieldId: string,
        text: string,
        mirrorClassName: string,
        singleLine = false,
    ) => {
        if (activeSpellcheckFieldId !== fieldId) return null;
        if (!text) return null;
        const issues = activeLiveSpellIssues;
        if (issues.length === 0) return null;

        const segments = buildInlineSpellSegments(text, issues);
        return (
            <div
                className={`${styles.spellcheckInlineOverlay} ${mirrorClassName} ${singleLine ? styles.spellcheckInlineOverlaySingleLine : ''}`}
                aria-hidden="true"
            >
                {segments.map((segment, index) => (
                    segment.issue ? (
                        <span
                            key={`${segment.issue.start}-${segment.issue.end}-${index}`}
                            className={styles.spellcheckInlineWord}
                        >
                            {segment.text}
                        </span>
                    ) : (
                        <span key={`plain-${index}`}>{segment.text}</span>
                    )
                ))}
            </div>
        );
    }, [activeSpellcheckFieldId, activeLiveSpellIssues, buildInlineSpellSegments]);

    const collectSpellcheckFields = useCallback((): ChapterSpellcheckFieldInput[] => {
        const fields: ChapterSpellcheckFieldInput[] = [];
        const seen = new Set<string>();

        const pushField = (field: ChapterSpellcheckFieldInput) => {
            const text = field.text.trim();
            if (!text) return;
            if (seen.has(field.id)) return;
            seen.add(field.id);
            fields.push({
                ...field,
                text,
            });
        };

        pushField({
            id: 'chapter-title-input',
            label: 'ชื่อตอน',
            text: title,
        });

        let textBlockIndex = 0;
        let sceneIndex = 0;
        blocks.forEach((block) => {
            if (block.type === 'image') return;
            if (!block.text.trim()) return;

            textBlockIndex += 1;
            if (isVisualNovelStyle) {
                sceneIndex += 1;
                pushField({
                    id: `scene-text-${block.id}`,
                    label: `บทพูดฉาก ${sceneIndex}`,
                    text: block.text,
                });
                return;
            }

            pushField({
                id: `textarea-${block.id}`,
                label: isChatStyle ? `ข้อความแชท ${textBlockIndex}` : `เนื้อหา ${textBlockIndex}`,
                text: block.text,
            });
        });

        if (isChatStyle) {
            pushField({
                id: 'chat-input-draft',
                label: 'ช่องพิมพ์แชท',
                text: chatInputValue,
            });
        }

        if (isBranchingStory && !isEndingChapter) {
            chapterChoices.forEach((choice, index) => {
                pushField({
                    id: `choice-text-${choice.id}`,
                    label: `ทางเลือก ${index + 1}`,
                    text: choice.choiceText,
                });
                pushField({
                    id: `choice-outcome-${choice.id}`,
                    label: `ผลลัพธ์ทางเลือก ${index + 1}`,
                    text: choice.outcomeText,
                });
            });
        }

        return fields;
    }, [title, blocks, isVisualNovelStyle, isChatStyle, chatInputValue, isBranchingStory, isEndingChapter, chapterChoices]);

    const applySuggestionToField = useCallback((
        fieldId: string,
        start: number,
        end: number,
        replacement: string,
    ) => {
        const applyRange = (text: string) => {
            const safeStart = Math.max(0, Math.min(start, text.length));
            const safeEnd = Math.max(safeStart, Math.min(end, text.length));
            return `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`;
        };

        if (fieldId === 'chapter-title-input') {
            setTitle((prev) => applyRange(prev));
        } else if (fieldId === 'chat-input-draft') {
            setChatInputValue((prev) => applyRange(prev));
        } else if (fieldId.startsWith('scene-text-')) {
            const blockId = fieldId.slice('scene-text-'.length);
            setBlocks((prev) => prev.map((block) => (
                block.id === blockId ? { ...block, text: applyRange(block.text) } : block
            )));
        } else if (fieldId.startsWith('textarea-')) {
            const blockId = fieldId.slice('textarea-'.length);
            setBlocks((prev) => prev.map((block) => (
                block.id === blockId ? { ...block, text: applyRange(block.text) } : block
            )));
        } else if (fieldId.startsWith('choice-text-')) {
            const choiceId = fieldId.slice('choice-text-'.length);
            setChapterChoices((prev) => prev.map((choice, index) => (
                choice.id === choiceId
                    ? { ...choice, choiceText: applyRange(choice.choiceText), orderIndex: index }
                    : { ...choice, orderIndex: index }
            )));
        } else if (fieldId.startsWith('choice-outcome-')) {
            const choiceId = fieldId.slice('choice-outcome-'.length);
            setChapterChoices((prev) => prev.map((choice, index) => (
                choice.id === choiceId
                    ? { ...choice, outcomeText: applyRange(choice.outcomeText), orderIndex: index }
                    : { ...choice, orderIndex: index }
            )));
        }

        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const nextCaret = Math.max(0, start) + replacement.length;
            window.requestAnimationFrame(() => {
                const target = document.getElementById(fieldId) as HTMLTextAreaElement | HTMLInputElement | null;
                if (!target || target.disabled || target.readOnly) return;
                target.focus();
                if (typeof target.setSelectionRange === 'function') {
                    target.setSelectionRange(nextCaret, nextCaret);
                }
            });
        }
    }, []);

    const handleApplySuggestion = useCallback((suggestion: string) => {
        if (!activeSuggestionPopover) return;
        applySuggestionToField(
            activeSuggestionPopover.fieldId,
            activeSuggestionPopover.start,
            activeSuggestionPopover.end,
            suggestion,
        );
        setActiveSuggestionPopover(null);
    }, [activeSuggestionPopover, applySuggestionToField]);

    useEffect(() => {
        if (!activeSpellcheckFieldId) return;

        const activeField = getSpellcheckFieldById(activeSpellcheckFieldId);
        if (!activeField) {
            setLiveSpellcheckByFieldId((prev) => {
                if (!prev[activeSpellcheckFieldId]) return prev;
                const next = { ...prev };
                delete next[activeSpellcheckFieldId];
                return next;
            });
            return;
        }

        if (typeof document !== 'undefined') {
            const focusedElement = document.activeElement as HTMLElement | null;
            if (!focusedElement || focusedElement.id !== activeSpellcheckFieldId) {
                return;
            }
        }

        const normalizedText = activeField.text.replace(/\r\n/g, '\n');
        if (normalizedText.trim().length < LIVE_SPELLCHECK_MIN_LENGTH || !THAI_CHARACTER_PATTERN.test(normalizedText)) {
            setLiveSpellcheckByFieldId((prev) => {
                if (!prev[activeField.id]) return prev;
                const next = { ...prev };
                delete next[activeField.id];
                return next;
            });
            if (activeSuggestionPopover?.fieldId === activeField.id) {
                setActiveSuggestionPopover(null);
            }
            return;
        }

        if (liveSpellcheckDebounceRef.current) {
            clearTimeout(liveSpellcheckDebounceRef.current);
            liveSpellcheckDebounceRef.current = null;
        }

        const requestSequence = ++liveSpellcheckRequestSequenceRef.current;
        liveSpellcheckDebounceRef.current = setTimeout(() => {
            void (async () => {
                try {
                    const {
                        data: { session },
                        error: sessionError,
                    } = await supabase.auth.getSession();

                    if (sessionError || !session?.access_token) return;

                    const response = await fetch('/api/spellcheck/chapter', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${session.access_token}`,
                        },
                        body: JSON.stringify({
                            mode: 'realtime',
                            fields: [activeField],
                        }),
                        cache: 'no-store',
                    });

                    let payload: ChapterSpellcheckResponse | { error?: string } | null = null;
                    try {
                        payload = (await response.json()) as ChapterSpellcheckResponse | { error?: string };
                    } catch {
                        payload = null;
                    }

                    if (!response.ok) {
                        throw new Error(
                            payload && typeof payload === 'object' && typeof payload.error === 'string'
                                ? payload.error
                                : 'ตรวจคำไทยชั่วคราวไม่พร้อม',
                        );
                    }

                    if (requestSequence !== liveSpellcheckRequestSequenceRef.current) return;
                    if (typeof document !== 'undefined') {
                        const focusedElement = document.activeElement as HTMLElement | null;
                        if (!focusedElement || focusedElement.id !== activeField.id) return;
                    }

                    const result = payload as ChapterSpellcheckResponse;
                    const fieldIssue = Array.isArray(result.fields)
                        ? result.fields.find((item) => item.id === activeField.id)
                        : undefined;
                    const issues = normalizeWordIssues(fieldIssue?.issues, activeField.text.length);

                    setLiveSpellcheckByFieldId((prev) => ({
                        ...prev,
                        [activeField.id]: issues,
                    }));
                } catch {
                    if (requestSequence !== liveSpellcheckRequestSequenceRef.current) return;
                    setLiveSpellcheckByFieldId((prev) => {
                        if (!prev[activeField.id]) return prev;
                        const next = { ...prev };
                        delete next[activeField.id];
                        return next;
                    });

                    const now = Date.now();
                    if (now - liveSpellcheckFailureNoticeAtRef.current >= LIVE_SPELLCHECK_FAIL_NOTICE_COOLDOWN_MS) {
                        liveSpellcheckFailureNoticeAtRef.current = now;
                        showNotice(
                            'error',
                            'ตรวจคำไทยชั่วคราวไม่พร้อม',
                            'ระบบตรวจคำไทยชั่วคราวไม่พร้อม คุณยังบันทึก/เผยแพร่ได้ตามปกติ',
                        );
                    }
                }
            })();
        }, LIVE_SPELLCHECK_DEBOUNCE_MS);

        return () => {
            if (liveSpellcheckDebounceRef.current) {
                clearTimeout(liveSpellcheckDebounceRef.current);
                liveSpellcheckDebounceRef.current = null;
            }
        };
    }, [activeSpellcheckFieldId, getSpellcheckFieldById, activeSuggestionPopover?.fieldId, normalizeWordIssues, showNotice]);

    useEffect(() => {
        if (!activeSuggestionPopover) return;
        const currentFieldIssues = liveSpellcheckByFieldId[activeSuggestionPopover.fieldId] || [];
        const stillExists = currentFieldIssues.some((issue) => (
            issue.start === activeSuggestionPopover.start && issue.end === activeSuggestionPopover.end
        ));
        if (!stillExists) {
            setActiveSuggestionPopover(null);
        }
    }, [activeSuggestionPopover, liveSpellcheckByFieldId]);

    useEffect(() => {
        if (!activeSuggestionPopover) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-spellcheck-popover="true"]')) return;
            setActiveSuggestionPopover(null);
        };

        const handleAnyScroll = () => {
            setActiveSuggestionPopover(null);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setActiveSuggestionPopover(null);
            }
        };

        window.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleEscape);
        window.addEventListener('scroll', handleAnyScroll, true);
        return () => {
            window.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleEscape);
            window.removeEventListener('scroll', handleAnyScroll, true);
        };
    }, [activeSuggestionPopover]);

    const handleTriggerSpellcheck = useCallback(async () => {
        if (isSpellcheckRunning) return;

        const fields = collectSpellcheckFields();
        if (fields.length === 0) {
            showNotice('error', 'ยังไม่มีข้อความให้ตรวจ', 'เพิ่มเนื้อหาภาษาไทยในตอนก่อนกดตรวจคำไทย');
            return;
        }

        setIsSpellcheckRunning(true);
        setSpellcheckIssueFieldIds([]);

        try {
            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session?.access_token) {
                throw new Error('AUTH_REQUIRED');
            }

            const response = await fetch('/api/spellcheck/chapter', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ mode: 'manual', fields }),
                cache: 'no-store',
            });

            let payload: ChapterSpellcheckResponse | { error?: string } | null = null;
            try {
                payload = (await response.json()) as ChapterSpellcheckResponse | { error?: string };
            } catch {
                payload = null;
            }

            if (!response.ok) {
                const message =
                    payload && typeof payload === 'object' && typeof payload.error === 'string' && payload.error.length > 0
                        ? payload.error
                        : 'ไม่สามารถตรวจคำไทยได้ในขณะนี้';
                throw new Error(message);
            }

            const result = payload as ChapterSpellcheckResponse;
            const issueFields = Array.isArray(result.fields) ? result.fields : [];

            if (issueFields.length === 0) {
                focusSpellcheckFieldById(fields[0].id);
                showNotice('success', 'ไม่พบคำไทยที่ควรแก้', `ตรวจแล้ว ${result.checkedFields} ฟิลด์`);
                return;
            }

            const issueIds = issueFields.map((field) => field.id);
            setSpellcheckIssueFieldIds(issueIds);
            focusSpellcheckFieldById(issueIds[0]);

            const compactLabels = issueFields
                .slice(0, 4)
                .map((field) => `${field.label} (${field.matches})`)
                .join(', ');
            const extraLabel = issueFields.length > 4 ? ` และอีก ${issueFields.length - 4} ฟิลด์` : '';
            showNotice(
                'error',
                'พบคำไทยที่ควรตรวจแก้',
                `พบ ${result.totalMatches} จุดใน ${issueFields.length} ฟิลด์: ${compactLabels}${extraLabel}`,
                { persistUntilClose: true },
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'ไม่สามารถตรวจคำไทยได้';
            showNotice('error', 'ตรวจคำไทยไม่สำเร็จ', message);
        } finally {
            setIsSpellcheckRunning(false);
        }
    }, [collectSpellcheckFields, focusSpellcheckFieldById, isSpellcheckRunning, showNotice]);

    const suggestionPopoverPosition = useMemo(() => {
        if (!activeSuggestionPopover || typeof window === 'undefined') return null;
        const width = 320;
        const height = 220;
        const margin = 12;
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);
        const left = Math.min(maxLeft, Math.max(margin, activeSuggestionPopover.clientX + 10));
        const top = Math.min(maxTop, Math.max(margin, activeSuggestionPopover.clientY + 10));
        return { left, top };
    }, [activeSuggestionPopover]);

    if (!isMounted) return null;

    if (authError) {
        return (
            <main className={`${styles.main} ffStudioShell`}>
                <header className={styles.header}>
                </header>
                <div className={styles.stateScreen}>
                    <div className={styles.stateCard}>
                        <h2>ไม่มีสิทธิ์เข้าถึง</h2>
                        <p>คุณไม่สามารถแก้ไขตอนนี้ได้ เนื่องจากคุณไม่ใช่เจ้าของเรื่อง</p>
                    </div>
                </div>
            </main>
        );
    }

    if (isLoading) {
        return (
            <main className={`${styles.main} ffStudioShell`}>
                <div className={styles.loadingScreen}>
                    <Loader2 className={styles.spinner} size={40} />
                </div>
            </main>
        );
    }

    return (
        <main className={`${styles.main} ffStudioShell`}>
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
                    <div className={styles.spellcheckInlineFieldFull}>
                        {renderSpellcheckOverlay('chapter-title-input', title, styles.headerTitleInput, true)}
                        <input
                            id="chapter-title-input"
                            type="text"
                            className={`${styles.headerTitleInput} ${hasSpellcheckIssue('chapter-title-input') ? styles.spellcheckFieldError : ''} ${styles.spellcheckInlineTarget}`}
                            placeholder="ชื่อตอน..."
                            value={title}
                            onFocus={() => handleSpellcheckFieldFocus('chapter-title-input')}
                            onBlur={() => handleSpellcheckFieldBlur('chapter-title-input')}
                            onMouseUp={(event) => handleSpellcheckFieldMouseUp('chapter-title-input', event)}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>
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
                        className={styles.revisionToggleBtn}
                        onClick={() => setIsRevisionDrawerOpen(true)}
                        disabled={isLoadingRevisions}
                    >
                        <History size={16} />
                        Revision
                    </button>
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
                        disabled={isSaving || isRestoringRevision || !isEditorDirty}
                        title={!isEditorDirty ? 'ยังไม่มีการเปลี่ยนแปลงจากร่างล่าสุด' : undefined}
                    >
                        {isSaving ? <Loader2 size={16} className={styles.spinner} /> : <Save size={16} />}
                        บันทึกร่าง
                    </button>
                    {showSpellcheckNavbarAction && (
                        <button
                            type="button"
                            className={styles.spellcheckBtn}
                            onClick={handleTriggerSpellcheck}
                            disabled={isSaving || isRestoringRevision || isSpellcheckRunning}
                            title="ตรวจคำไทย"
                        >
                            {isSpellcheckRunning ? <Loader2 size={16} className={styles.spinner} /> : <CheckCircle2 size={16} />}
                            {isSpellcheckRunning ? 'กำลังตรวจไทย...' : 'ตรวจคำไทย'}
                        </button>
                    )}
                    <button
                        className={styles.publishBtn}
                        onClick={() => handleSave(true)}
                        disabled={isSaving || isRestoringRevision || !!choiceValidationError}
                        title={choiceValidationError || undefined}
                    >
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

            <div className={`${styles.editorWorkspace} ${isBranchingStory && !isChatStyle ? styles.editorWorkspaceWithBranching : ''}`}>
                <div className={styles.editorMainColumn}>
                    <div
                        className={`${styles.content} ${!isChatStyle ? styles.contentNarrative : ''} ${isChatStyle ? styles.contentChat : ''}`}
                    >
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
                                const rowClassName = [
                                    blockStyles.blockRow,
                                    blockStyles.chatRow,
                                    isSystem ? blockStyles.chatRowSystem : '',
                                    isPOV ? blockStyles.chatRowPov : '',
                                ].filter(Boolean).join(' ');
                                const bubbleColumnClassName = [
                                    blockStyles.blockContent,
                                    blockStyles.chatBubbleColumn,
                                    isSystem ? blockStyles.chatBubbleColumnSystem : '',
                                    isPOV ? blockStyles.chatBubbleColumnPov : '',
                                ].filter(Boolean).join(' ');
                                const speakerClassName = [
                                    blockStyles.chatSpeakerName,
                                    isPOV ? blockStyles.chatSpeakerNamePov : '',
                                ].filter(Boolean).join(' ');
                                const bubbleWrapClassName = [
                                    blockStyles.chatBubbleWrap,
                                    isPOV ? blockStyles.chatBubbleWrapPov : '',
                                ].filter(Boolean).join(' ');
                                const imageBubbleClassName = [
                                    blockStyles.chatImageBubble,
                                    isSystem ? '' : isPOV ? blockStyles.chatImageBubblePov : blockStyles.chatImageBubbleOther,
                                ].filter(Boolean).join(' ');
                                const chatFieldId = `textarea-${block.id}`;
                                const textBubbleBaseClassName = [
                                    blockStyles.blockTextarea,
                                    blockStyles.chatTextBubble,
                                    isSystem
                                        ? blockStyles.chatTextBubbleSystem
                                        : isPOV
                                            ? blockStyles.chatTextBubblePov
                                            : blockStyles.chatTextBubbleOther,
                                ].filter(Boolean).join(' ');
                                const textBubbleClassName = [
                                    textBubbleBaseClassName,
                                    hasSpellcheckIssue(chatFieldId) ? styles.spellcheckFieldError : '',
                                    styles.spellcheckInlineTarget,
                                ].filter(Boolean).join(' ');
                                const chatActionClassName = [
                                    blockStyles.blockActions,
                                    blockStyles.chatBlockActions,
                                    isPOV ? blockStyles.chatBlockActionsPov : '',
                                ].filter(Boolean).join(' ');

                                return (
                                    <div key={block.id} className={rowClassName}>
                                        {!isPOV && !isSystem && (
                                            <div className={blockStyles.blockAvatar}>
                                                {assignedChar?.image_url ? (
                                                    <img src={assignedChar.image_url} alt={assignedChar.name} />
                                                ) : (
                                                    <span className={blockStyles.chatAvatarFallback}>?</span>
                                                )}
                                            </div>
                                        )}

                                        <div className={bubbleColumnClassName}>
                                            {!isSystem && assignedChar && (
                                                <div className={speakerClassName}>{assignedChar.name}</div>
                                            )}

                                            <div className={bubbleWrapClassName}>
                                                {block.type === 'image' && block.imageUrl ? (
                                                    <img
                                                        src={block.imageUrl}
                                                        alt="Chat Image"
                                                        className={imageBubbleClassName}
                                                    />
                                                ) : (
                                                    <div className={styles.spellcheckInlineFieldFit}>
                                                        {renderSpellcheckOverlay(chatFieldId, block.text, textBubbleBaseClassName)}
                                                        <textarea
                                                            id={chatFieldId}
                                                            className={textBubbleClassName}
                                                            value={block.text}
                                                            spellCheck={true}
                                                            lang="th-TH"
                                                            onFocus={() => handleSpellcheckFieldFocus(chatFieldId)}
                                                            onBlur={() => handleSpellcheckFieldBlur(chatFieldId)}
                                                            onMouseUp={(event) => handleSpellcheckFieldMouseUp(chatFieldId, event)}
                                                            onChange={(e) => {
                                                                updateBlock(block.id, { text: e.target.value });
                                                                e.target.style.height = 'auto';
                                                                e.target.style.height = e.target.scrollHeight + 'px';
                                                            }}
                                                            onKeyDown={(e) => handleKeyDown(e, block.id)}
                                                            placeholder={isSystem ? 'บรรยาย...' : '...'}
                                                            rows={1}
                                                        />
                                                    </div>
                                                )}
                                                <div className={chatActionClassName}>
                                                    <button className={blockStyles.actionBtn} onClick={() => moveBlockUp(block.id)} title="เลื่อนขึ้น">
                                                        <ChevronUp size={14} />
                                                    </button>
                                                    <button className={blockStyles.actionBtn} onClick={() => moveBlockDown(block.id)} title="เลื่อนลง">
                                                        <ChevronDown size={14} />
                                                    </button>
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
                                                        <span className={blockStyles.chatSwitchIcon}>👤</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {isPOV && !isSystem && (
                                            <div className={blockStyles.blockAvatar}>
                                                {assignedChar?.image_url ? (
                                                    <img src={assignedChar.image_url} alt={assignedChar?.name || ''} />
                                                ) : (
                                                    <span className={blockStyles.chatAvatarFallback}>?</span>
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
                                    <span className={`${styles.trayCharName} ${styles.trayCharNameAccent}`}>เพิ่มตัว</span>
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
                                    title="ค้นหารูปจากคลังภาพ (Unsplash/Pixabay)"
                                    onClick={() => openUnsplashPicker('chat')}
                                >
                                    <Search size={16} />
                                </button>

                                {/* Text Input */}
                                <div className={styles.spellcheckInlineFieldFull}>
                                    {renderSpellcheckOverlay('chat-input-draft', chatInputValue, styles.chatTextInput)}
                                    <textarea
                                        id="chat-input-draft"
                                        className={`${styles.chatTextInput} ${hasSpellcheckIssue('chat-input-draft') ? styles.spellcheckFieldError : ''} ${styles.spellcheckInlineTarget}`}
                                        value={chatInputValue}
                                        spellCheck={true}
                                        lang="th-TH"
                                        onFocus={() => handleSpellcheckFieldFocus('chat-input-draft')}
                                        onBlur={() => handleSpellcheckFieldBlur('chat-input-draft')}
                                        onMouseUp={(event) => handleSpellcheckFieldMouseUp('chat-input-draft', event)}
                                        onChange={(e) => setChatInputValue(e.target.value)}
                                        onKeyDown={handleChatInputKeyDown}
                                        placeholder={`ส่งข้อความในฐานะ ${activeCharacterId ? characters.find(c => c.id === activeCharacterId)?.name : 'บทบรรยาย'}...`}
                                        rows={1}
                                    />
                                </div>

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
                ) : isVisualNovelStyle ? (
                    <div className={styles.visualNovelEditorPane}>
                        <div className={styles.visualNovelHero}>
                            <div>
                                <h3 className={styles.visualNovelTitle}>Scene Editor</h3>
                                <p className={styles.visualNovelLead}>
                                    เลือกได้ทั้งเวทีปกติ ครึ่งต่อครึ่ง หรือฉากเดี่ยว พร้อมแยกรูปใช้บนเวทีออกจากรูปแนะนำตัวละคร
                                </p>
                            </div>
                            <div className={styles.visualNovelHeroActions}>
                                <button
                                    type="button"
                                    className={styles.visualNovelSecondaryBtn}
                                    onClick={() => setShowQuickAddChar(true)}
                                >
                                    <Plus size={16} />
                                    เพิ่มตัวละครด่วน
                                </button>
                                <button
                                    type="button"
                                    className={styles.visualNovelPrimaryBtn}
                                    onClick={() => addBlock()}
                                >
                                    <Plus size={16} />
                                    เพิ่มฉากใหม่
                                </button>
                            </div>
                        </div>

                        <div className={styles.soundSelector}>
                            <label htmlFor="visual-novel-bgm">BGM ประจำตอน</label>
                            <select
                                id="visual-novel-bgm"
                                className={styles.soundSelect}
                                value={localSoundItems.some((item) => item.url === backgroundSound) ? (backgroundSound || '') : ''}
                                onChange={(event) => handleSelectLocalSound(normalizeBackgroundSound(event.target.value))}
                                disabled={isLoadingLocalSounds}
                            >
                                <option value="">-- ไม่ใช้ BGM --</option>
                                {localSoundItems.map((item) => (
                                    <option key={item.id} value={item.url}>
                                        {item.fileName}
                                    </option>
                                ))}
                            </select>
                            {isLoadingLocalSounds && (
                                <span className={styles.soundHelp}>กำลังโหลดรายการเสียงในเครื่อง...</span>
                            )}
                            {localSoundError && (
                                <span className={styles.soundError}>{localSoundError}</span>
                            )}

                            <span className={styles.soundHelp}>
                                เพลงสำหรับ Visual Novel รอบนี้เลือกได้จาก local sound library เท่านั้น
                            </span>
                            {backgroundSoundMeta?.attribution && (
                                <span className={styles.soundAttribution}>
                                    เครดิตที่บันทึก: {backgroundSoundMeta.attribution}
                                </span>
                            )}
                            {backgroundSound && (
                                <audio
                                    className={styles.soundPreview}
                                    controls
                                    preload="none"
                                    src={backgroundSound}
                                />
                            )}
                        </div>

                        <input
                            type="file"
                            accept="image/*"
                            ref={imageInputRef}
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                            disabled={isUploadingImage}
                        />

                        <div className={styles.visualNovelSceneList}>
                            {blocks.map((block, index) => {
                                const leftCharacterName = characters.find((char) => char.id === block.leftCharacterId)?.name || '';
                                const rightCharacterName = characters.find((char) => char.id === block.rightCharacterId)?.name || '';
                                const soloCharacterName = characters.find((char) => char.id === block.soloCharacterId)?.name || '';
                                const sceneLayoutMode = normalizeSceneLayoutMode(block.layoutMode);
                                const isSplitScene = sceneLayoutMode === 'split';
                                const isSoloScene = sceneLayoutMode === 'solo';
                                const sceneMetaLabel = isSoloScene
                                    ? soloCharacterName || 'ภาพเดี่ยว'
                                    : `${leftCharacterName || 'ซ้ายว่าง'} / ${rightCharacterName || 'ขวาว่าง'}`;
                                const isUploadingBackground = isUploadingImage
                                    && sceneImageTarget?.blockId === block.id
                                    && sceneImageTarget.slot === 'backgroundUrl';
                                const isUploadingLeftScene = isUploadingImage
                                    && sceneImageTarget?.blockId === block.id
                                    && sceneImageTarget.slot === 'leftSceneImageUrl';
                                const isUploadingRightScene = isUploadingImage
                                    && sceneImageTarget?.blockId === block.id
                                    && sceneImageTarget.slot === 'rightSceneImageUrl';
                                const isUploadingSoloScene = isUploadingImage
                                    && sceneImageTarget?.blockId === block.id
                                    && sceneImageTarget.slot === 'soloSceneImageUrl';

                                return (
                                    <section key={block.id} className={styles.visualNovelSceneCard}>
                                        <div className={styles.visualNovelSceneHeader}>
                                            <div>
                                                <span className={styles.visualNovelSceneEyebrow}>Scene {index + 1}</span>
                                                <h4 className={styles.visualNovelSceneTitle}>
                                                    {block.text.trim().slice(0, 42) || 'ฉากใหม่'}
                                                </h4>
                                            </div>
                                            <span className={styles.visualNovelSceneMeta}>
                                                {sceneMetaLabel}
                                            </span>
                                        </div>

                                        <VisualNovelStage
                                            scene={block}
                                            characters={characters}
                                            variant="editor"
                                            className={styles.visualNovelStagePreview}
                                            footerSlot={
                                                <span className={styles.visualNovelSceneCounter}>
                                                    ฉาก {index + 1}/{blocks.length}
                                                </span>
                                            }
                                        />

                                        <div className={styles.visualNovelLayoutRow}>
                                            <span className={styles.visualNovelLayoutLabel}>รูปแบบฉาก</span>
                                            <div className={styles.visualNovelLayoutButtons}>
                                                {([
                                                    { key: 'stage', label: 'เวทีปกติ' },
                                                    { key: 'split', label: 'ครึ่งต่อครึ่ง' },
                                                    { key: 'solo', label: 'คนเดียว' },
                                                ] as const).map((option) => (
                                                    <button
                                                        key={option.key}
                                                        type="button"
                                                        className={`${styles.visualNovelLayoutBtn} ${sceneLayoutMode === option.key ? styles.visualNovelLayoutBtnActive : ''}`}
                                                        onClick={() => updateBlock(block.id, { layoutMode: option.key })}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {isSplitScene ? (
                                            <div className={styles.visualNovelSplitAssetGrid}>
                                                <section className={styles.visualNovelSplitAssetCard}>
                                                    <div className={styles.visualNovelSplitAssetHeader}>
                                                        <div>
                                                            <span className={styles.visualNovelBackgroundLabel}>ฝั่งซ้าย</span>
                                                            <span className={styles.visualNovelBackgroundValue}>
                                                                {block.leftSceneImageUrl ? 'ตั้งค่าภาพแล้ว' : 'ยังไม่ได้เลือกภาพฝั่งซ้าย'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <label className={styles.visualNovelControl}>
                                                        <span>ตัวละครฝั่งซ้าย</span>
                                                        <select
                                                            value={block.leftCharacterId || ''}
                                                            onChange={(event) => updateBlock(block.id, { leftCharacterId: event.target.value || null })}
                                                            className={styles.visualNovelSelect}
                                                        >
                                                            <option value="">-- ไม่แสดง --</option>
                                                            {characters.map((char) => (
                                                                <option key={char.id} value={char.id}>{char.name}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <div className={styles.visualNovelSplitAssetActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.visualNovelSecondaryBtn}
                                                            onClick={() => openSceneImagePicker(block.id, 'leftSceneImageUrl')}
                                                            disabled={isUploadingImage}
                                                        >
                                                            {isUploadingLeftScene ? <Loader2 size={15} className={styles.spinner} /> : <ImageIcon size={15} />}
                                                            อัปโหลด
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.visualNovelSecondaryBtn}
                                                            onClick={() => openUnsplashPicker('visual_novel', block.id, 'leftSceneImageUrl')}
                                                        >
                                                            <Search size={15} />
                                                            คลังภาพ
                                                        </button>
                                                        {block.leftSceneImageUrl && (
                                                            <button
                                                                type="button"
                                                                className={styles.visualNovelGhostBtn}
                                                                onClick={() => handleClearSceneImage(block.id, 'leftSceneImageUrl')}
                                                            >
                                                                ล้างภาพ
                                                            </button>
                                                        )}
                                                    </div>
                                                </section>

                                                <section className={styles.visualNovelSplitAssetCard}>
                                                    <div className={styles.visualNovelSplitAssetHeader}>
                                                        <div>
                                                            <span className={styles.visualNovelBackgroundLabel}>ฝั่งขวา</span>
                                                            <span className={styles.visualNovelBackgroundValue}>
                                                                {block.rightSceneImageUrl ? 'ตั้งค่าภาพแล้ว' : 'ยังไม่ได้เลือกภาพฝั่งขวา'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <label className={styles.visualNovelControl}>
                                                        <span>ตัวละครฝั่งขวา</span>
                                                        <select
                                                            value={block.rightCharacterId || ''}
                                                            onChange={(event) => updateBlock(block.id, { rightCharacterId: event.target.value || null })}
                                                            className={styles.visualNovelSelect}
                                                        >
                                                            <option value="">-- ไม่แสดง --</option>
                                                            {characters.map((char) => (
                                                                <option key={char.id} value={char.id}>{char.name}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <div className={styles.visualNovelSplitAssetActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.visualNovelSecondaryBtn}
                                                            onClick={() => openSceneImagePicker(block.id, 'rightSceneImageUrl')}
                                                            disabled={isUploadingImage}
                                                        >
                                                            {isUploadingRightScene ? <Loader2 size={15} className={styles.spinner} /> : <ImageIcon size={15} />}
                                                            อัปโหลด
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.visualNovelSecondaryBtn}
                                                            onClick={() => openUnsplashPicker('visual_novel', block.id, 'rightSceneImageUrl')}
                                                        >
                                                            <Search size={15} />
                                                            คลังภาพ
                                                        </button>
                                                        {block.rightSceneImageUrl && (
                                                            <button
                                                                type="button"
                                                                className={styles.visualNovelGhostBtn}
                                                                onClick={() => handleClearSceneImage(block.id, 'rightSceneImageUrl')}
                                                            >
                                                                ล้างภาพ
                                                            </button>
                                                        )}
                                                    </div>
                                                </section>
                                            </div>
                                        ) : isSoloScene ? (
                                            <section className={styles.visualNovelSoloAssetCard}>
                                                <div className={styles.visualNovelSplitAssetHeader}>
                                                    <div>
                                                        <span className={styles.visualNovelBackgroundLabel}>ภาพฉากเดี่ยว</span>
                                                        <span className={styles.visualNovelBackgroundValue}>
                                                            {block.soloSceneImageUrl ? 'ตั้งค่าภาพแล้ว' : 'ยังไม่ได้เลือกภาพฉากเดี่ยว'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className={styles.visualNovelAssetGuide}>
                                                    <span className={styles.visualNovelAssetHint}>แนะนำ 1920x1080 px ขึ้นไป (16:9)</span>
                                                    <span className={styles.visualNovelAssetSubhint}>สัดส่วนอื่นใช้ได้ แต่ขอบภาพอาจถูกครอปเมื่อแสดงผลเต็มฉาก</span>
                                                </div>
                                                <label className={styles.visualNovelControl}>
                                                    <span>ตัวละครหลักของฉาก</span>
                                                    <select
                                                        value={block.soloCharacterId || ''}
                                                        onChange={(event) => updateBlock(block.id, { soloCharacterId: event.target.value || null })}
                                                        className={styles.visualNovelSelect}
                                                    >
                                                        <option value="">-- ไม่ระบุตัวละคร --</option>
                                                        {characters.map((char) => (
                                                            <option key={char.id} value={char.id}>{char.name}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <div className={styles.visualNovelSplitAssetActions}>
                                                    <button
                                                        type="button"
                                                        className={styles.visualNovelSecondaryBtn}
                                                        onClick={() => openSceneImagePicker(block.id, 'soloSceneImageUrl')}
                                                        disabled={isUploadingImage}
                                                    >
                                                        {isUploadingSoloScene ? <Loader2 size={15} className={styles.spinner} /> : <ImageIcon size={15} />}
                                                        อัปโหลด
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.visualNovelSecondaryBtn}
                                                        onClick={() => openUnsplashPicker('visual_novel', block.id, 'soloSceneImageUrl')}
                                                    >
                                                        <Search size={15} />
                                                        คลังภาพ
                                                    </button>
                                                    {block.soloSceneImageUrl && (
                                                        <button
                                                            type="button"
                                                            className={styles.visualNovelGhostBtn}
                                                            onClick={() => handleClearSceneImage(block.id, 'soloSceneImageUrl')}
                                                        >
                                                            ล้างภาพ
                                                        </button>
                                                    )}
                                                </div>
                                            </section>
                                        ) : (
                                            <>
                                                <div className={styles.visualNovelControlGrid}>
                                                    <label className={styles.visualNovelControl}>
                                                        <span>ตัวละครฝั่งซ้าย</span>
                                                        <select
                                                            value={block.leftCharacterId || ''}
                                                            onChange={(event) => updateBlock(block.id, { leftCharacterId: event.target.value || null })}
                                                            className={styles.visualNovelSelect}
                                                        >
                                                            <option value="">-- ไม่แสดง --</option>
                                                            {characters.map((char) => (
                                                                <option key={char.id} value={char.id}>{char.name}</option>
                                                            ))}
                                                        </select>
                                                    </label>

                                                    <label className={styles.visualNovelControl}>
                                                        <span>ตัวละครฝั่งขวา</span>
                                                        <select
                                                            value={block.rightCharacterId || ''}
                                                            onChange={(event) => updateBlock(block.id, { rightCharacterId: event.target.value || null })}
                                                            className={styles.visualNovelSelect}
                                                        >
                                                            <option value="">-- ไม่แสดง --</option>
                                                            {characters.map((char) => (
                                                                <option key={char.id} value={char.id}>{char.name}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>

                                                <div className={styles.visualNovelBackgroundRow}>
                                                    <div className={styles.visualNovelBackgroundInfo}>
                                                        <span className={styles.visualNovelBackgroundLabel}>พื้นหลังฉาก</span>
                                                        <span className={styles.visualNovelBackgroundValue}>
                                                            {block.backgroundUrl ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้เลือกภาพพื้นหลัง'}
                                                        </span>
                                                    </div>
                                                    <div className={styles.visualNovelBackgroundActions}>
                                                        <button
                                                            type="button"
                                                            className={styles.visualNovelSecondaryBtn}
                                                            onClick={() => openSceneImagePicker(block.id, 'backgroundUrl')}
                                                            disabled={isUploadingImage}
                                                        >
                                                            {isUploadingBackground ? <Loader2 size={15} className={styles.spinner} /> : <ImageIcon size={15} />}
                                                            อัปโหลด
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={styles.visualNovelSecondaryBtn}
                                                            onClick={() => openUnsplashPicker('visual_novel', block.id, 'backgroundUrl')}
                                                        >
                                                            <Search size={15} />
                                                            คลังภาพ
                                                        </button>
                                                        {block.backgroundUrl && (
                                                            <button
                                                                type="button"
                                                                className={styles.visualNovelGhostBtn}
                                                                onClick={() => handleClearSceneImage(block.id, 'backgroundUrl')}
                                                            >
                                                                ล้างภาพ
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <div className={styles.visualNovelMetaGrid}>
                                            <label className={styles.visualNovelControl}>
                                                <span>ผู้พูด</span>
                                                <select
                                                    value={block.speakerCharacterId || ''}
                                                    onChange={(event) => updateBlock(block.id, { speakerCharacterId: event.target.value || null })}
                                                    className={styles.visualNovelSelect}
                                                >
                                                    <option value="">ผู้บรรยาย / ระบบ</option>
                                                    {characters.map((char) => (
                                                        <option key={char.id} value={char.id}>{char.name}</option>
                                                    ))}
                                                </select>
                                            </label>

                                            {isSoloScene ? (
                                                <div className={styles.visualNovelSoloMetaNote}>
                                                    โหมดคนเดียวจะใช้ภาพเดียวเต็มฉาก และไม่ใช้การหรี่โฟกัสซ้าย/ขวา
                                                </div>
                                            ) : (
                                                <div className={styles.visualNovelFocusRow}>
                                                    <span className={styles.visualNovelFocusLabel}>โฟกัสฉาก</span>
                                                    <div className={styles.visualNovelFocusButtons}>
                                                        {([
                                                            { key: 'left', label: 'ซ้าย' },
                                                            { key: 'right', label: 'ขวา' },
                                                            { key: 'none', label: 'เท่ากัน' },
                                                        ] as const).map((option) => (
                                                            <button
                                                                key={option.key}
                                                                type="button"
                                                                className={`${styles.visualNovelFocusBtn} ${block.focusSide === option.key ? styles.visualNovelFocusBtnActive : ''}`}
                                                                onClick={() => updateBlock(block.id, { focusSide: option.key })}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className={styles.visualNovelColorRow}>
                                            <div className={styles.visualNovelColorInfo}>
                                                <span className={styles.visualNovelFocusLabel}>สีพื้นหลัง</span>
                                            </div>
                                            <div className={styles.visualNovelColorButtons}>
                                                {([
                                                    { key: 'none', label: 'ไม่มี (ใส)', color: 'transparent' },
                                                    { key: '#020617', label: 'Slate 950', color: '#020617' },
                                                    { key: '#000000', label: 'ดำสนิท', color: '#000000' },
                                                    { key: '#450a0a', label: 'แดงเข้ม', color: '#450a0a' },
                                                    { key: '#172554', label: 'น้ำเงินเข้ม', color: '#172554' },
                                                    { key: '#3b0764', label: 'ม่วงเข้ม', color: '#3b0764' },
                                                    { key: '#052e16', label: 'เขียวเข้ม', color: '#052e16' },
                                                    { key: '#f8fafc', label: 'สว่าง (ขาว)', color: '#f8fafc', border: true },
                                                ] as Array<{ key: string, label: string, color: string, border?: boolean }>).map((option) => {
                                                    const isActive = (block.backgroundColor || null) === (option.key === 'none' ? null : option.key);
                                                    return (
                                                        <button
                                                            key={option.key}
                                                            type="button"
                                                            className={`${styles.visualNovelColorSwatch} ${isActive ? styles.visualNovelColorSwatchActive : ''}`}
                                                            style={{ 
                                                                backgroundColor: option.color === 'transparent' ? '#cbd5e1' : option.color, 
                                                                border: option.border ? '1px solid #94a3b8' : 'none' 
                                                            }}
                                                            onClick={() => updateBlock(block.id, { backgroundColor: option.key === 'none' ? null : option.key })}
                                                            title={option.label}
                                                        >
                                                            {isActive && <div className={styles.visualNovelColorSwatchIndicator} />}
                                                            {option.key === 'none' && !isActive && <div className={styles.visualNovelColorSwatchNoneLine} />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <label className={styles.visualNovelDialogueField}>
                                            <span>บทพูด / คำบรรยายของฉาก</span>
                                            <div className={styles.spellcheckInlineFieldFull}>
                                                {renderSpellcheckOverlay(`scene-text-${block.id}`, block.text, styles.visualNovelTextarea)}
                                                <textarea
                                                    id={`scene-text-${block.id}`}
                                                    className={`${styles.visualNovelTextarea} ${hasSpellcheckIssue(`scene-text-${block.id}`) ? styles.spellcheckFieldError : ''} ${styles.spellcheckInlineTarget}`}
                                                    value={block.text}
                                                    spellCheck={true}
                                                    lang="th-TH"
                                                    onFocus={() => handleSpellcheckFieldFocus(`scene-text-${block.id}`)}
                                                    onBlur={() => handleSpellcheckFieldBlur(`scene-text-${block.id}`)}
                                                    onMouseUp={(event) => handleSpellcheckFieldMouseUp(`scene-text-${block.id}`, event)}
                                                    onChange={(event) => {
                                                        updateBlock(block.id, { text: event.target.value });
                                                        event.target.style.height = 'auto';
                                                        event.target.style.height = `${event.target.scrollHeight}px`;
                                                    }}
                                                    onKeyDown={(event) => handleKeyDown(event, block.id)}
                                                    placeholder="พิมพ์บทพูดหรือคำบรรยายของฉากนี้..."
                                                    rows={2}
                                                />
                                            </div>
                                        </label>

                                        <div className={styles.visualNovelSceneActions}>
                                            <button type="button" className={styles.visualNovelGhostBtn} onClick={() => moveBlockUp(block.id)}>
                                                <ChevronUp size={15} />
                                                เลื่อนขึ้น
                                            </button>
                                            <button type="button" className={styles.visualNovelGhostBtn} onClick={() => moveBlockDown(block.id)}>
                                                <ChevronDown size={15} />
                                                เลื่อนลง
                                            </button>
                                            <button type="button" className={styles.visualNovelGhostBtn} onClick={() => addBlock(block.id)}>
                                                <Plus size={15} />
                                                เพิ่มต่อท้าย
                                            </button>
                                            <button type="button" className={styles.visualNovelDangerBtn} onClick={() => removeBlock(block.id)}>
                                                <Trash2 size={15} />
                                                ลบฉาก
                                            </button>
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className={styles.narrativeEditorPane}>

                        <div className={blockStyles.blockEditor}>
                            {blocks.map((block) => {
                                const assignedChar = characters.find(c => c.id === block.characterId);
                                const isSelectorOpen = openCharSelectorId === block.id;
                                const isImageBlock = block.type === 'image' && !!block.imageUrl;
                                const isFlashbackBlock = !isImageBlock && block.isFlashback;
                                const narrativeFieldId = `textarea-${block.id}`;
                                const blockRowClassName = [
                                    blockStyles.blockRow,
                                    blockStyles.alignLeft,
                                    isFlashbackBlock ? blockStyles.blockRowFlashback : '',
                                ].filter(Boolean).join(' ');
                                const textareaBaseClassName = [
                                    blockStyles.blockTextarea,
                                    isFlashbackBlock ? blockStyles.blockTextareaFlashback : '',
                                ].filter(Boolean).join(' ');
                                const textareaClassName = [
                                    textareaBaseClassName,
                                    hasSpellcheckIssue(narrativeFieldId) ? styles.spellcheckFieldError : '',
                                    styles.spellcheckInlineTarget,
                                ].filter(Boolean).join(' ');

                                return (
                                    <div key={block.id} className={blockRowClassName}>
                                        {/* Character Avatar Wrapper */}
                                        {!isImageBlock && (
                                            <div
                                                className={blockStyles.avatarAnchor}
                                                ref={(node) => {
                                                    charSelectorAnchorRefs.current[block.id] = node;
                                                }}
                                            >
                                                <div
                                                    className={blockStyles.blockAvatar}
                                                    onClick={() => {
                                                        if (isSelectorOpen) {
                                                            setOpenCharSelectorId(null);
                                                            setCharSelectorViewportPosition(null);
                                                            return;
                                                        }

                                                        setOpenCharSelectorId(block.id);
                                                        requestAnimationFrame(() => {
                                                            updateCharSelectorViewportPosition(block.id);
                                                        });
                                                    }}
                                                    title={assignedChar ? assignedChar.name : "คลิกเพื่อเลือกตัวละคร"}
                                                >
                                                    {assignedChar?.image_url ? (
                                                        <img src={assignedChar.image_url} alt={assignedChar.name} />
                                                    ) : (
                                                        <span className={blockStyles.avatarFallback}>?</span>
                                                    )}
                                                </div>

                                                {/* Character Selection Dropdown */}
                                                {isSelectorOpen && charSelectorViewportPosition && typeof window !== 'undefined'
                                                    ? createPortal(
                                                        <div
                                                            className={blockStyles.charSelector}
                                                            ref={charSelectorRef}
                                                            style={{
                                                                top: `${charSelectorViewportPosition.top}px`,
                                                                left: `${charSelectorViewportPosition.left}px`,
                                                                maxHeight: `${charSelectorViewportPosition.maxHeight}px`,
                                                            }}
                                                        >
                                                            <div
                                                                className={`${blockStyles.charOption} ${!block.characterId ? blockStyles.active : ''}`}
                                                                onClick={() => {
                                                                    updateBlock(block.id, { characterId: null });
                                                                    setOpenCharSelectorId(null);
                                                                    setCharSelectorViewportPosition(null);
                                                                }}
                                                            >
                                                                <div className={blockStyles.charOptionAvatar}>?</div>
                                                                <div className={blockStyles.charOptionName}>ไม่มีตัวละคร (บทบรรยาย)</div>
                                                            </div>
                                                            {characters.map(char => (
                                                                <div
                                                                    key={char.id}
                                                                    className={`${blockStyles.charOption} ${block.characterId === char.id ? blockStyles.active : ''}`}
                                                                    onClick={() => {
                                                                        updateBlock(block.id, { characterId: char.id });
                                                                        setOpenCharSelectorId(null);
                                                                        setCharSelectorViewportPosition(null);
                                                                    }}
                                                                >
                                                                    {char.image_url ? (
                                                                        <img src={char.image_url} className={blockStyles.charOptionAvatar} alt="" />
                                                                    ) : (
                                                                        <div className={blockStyles.charOptionAvatar}>{char.name.substring(0, 1)}</div>
                                                                    )}
                                                                    <div className={blockStyles.charOptionName}>{char.name}</div>
                                                                </div>
                                                            ))}
                                                        </div>,
                                                        document.body
                                                    )
                                                    : null}
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
                                                    <div className={`${blockStyles.blockActions} ${blockStyles.imageActionsVisible}`}>
                                                        <button className={blockStyles.actionBtn} onClick={() => moveBlockUp(block.id)} title="เลื่อนขึ้น">
                                                            <ChevronUp size={16} />
                                                        </button>
                                                        <button className={blockStyles.actionBtn} onClick={() => moveBlockDown(block.id)} title="เลื่อนลง">
                                                            <ChevronDown size={16} />
                                                        </button>
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
                                                    {(assignedChar || isFlashbackBlock) && (
                                                        <div className={blockStyles.blockMeta}>
                                                            {assignedChar && <div className={blockStyles.blockSpeakerName}>{assignedChar.name}</div>}
                                                            {isFlashbackBlock && (
                                                                <span className={blockStyles.blockToneTag}>เล่าความหลัง</span>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className={styles.spellcheckInlineFieldFull}>
                                                        {renderSpellcheckOverlay(narrativeFieldId, block.text, textareaBaseClassName)}
                                                        <textarea
                                                            id={narrativeFieldId}
                                                            className={textareaClassName}
                                                            value={block.text}
                                                            spellCheck={true}
                                                            lang="th-TH"
                                                            onFocus={() => handleSpellcheckFieldFocus(narrativeFieldId)}
                                                            onBlur={() => handleSpellcheckFieldBlur(narrativeFieldId)}
                                                            onMouseUp={(event) => handleSpellcheckFieldMouseUp(narrativeFieldId, event)}
                                                            onChange={(e) => {
                                                                updateBlock(block.id, { text: e.target.value });
                                                                e.target.style.height = 'auto';
                                                                e.target.style.height = e.target.scrollHeight + 'px';
                                                            }}
                                                            onKeyDown={(e) => handleKeyDown(e, block.id)}
                                                            placeholder={
                                                                isFlashbackBlock
                                                                    ? 'พิมพ์ฉากเล่าความหลัง...'
                                                                    : assignedChar
                                                                        ? `พิมพ์บทพูดของ ${assignedChar.name}...`
                                                                        : 'พิมพ์บทบรรยาย...'
                                                            }
                                                            rows={1}
                                                        />
                                                    </div>
                                                    <div className={blockStyles.blockActions}>
                                                        <button
                                                            className={`${blockStyles.actionBtn} ${isFlashbackBlock ? blockStyles.actionBtnActive : ''}`}
                                                            onClick={() => updateBlock(block.id, { isFlashback: !block.isFlashback })}
                                                            title={isFlashbackBlock ? 'ปิดเล่าความหลัง' : 'ตั้งเป็นเล่าความหลัง'}
                                                            aria-pressed={isFlashbackBlock}
                                                        >
                                                            <History size={16} />
                                                        </button>
                                                        <button className={blockStyles.actionBtn} onClick={() => moveBlockUp(block.id)} title="เลื่อนขึ้น">
                                                            <ChevronUp size={16} />
                                                        </button>
                                                        <button className={blockStyles.actionBtn} onClick={() => moveBlockDown(block.id)} title="เลื่อนลง">
                                                            <ChevronDown size={16} />
                                                        </button>
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
                                    <Search size={18} /> เพิ่มรูปจากคลังภาพ
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                    </div>

                    {isBranchingStory && isChatStyle && (
                        <section className={styles.branchingPanel}>
                            <div className={styles.branchingHeader}>
                                <div>
                                    <h3>ตัวเลือกท้ายตอน</h3>
                                    <p>ผู้อ่านจะกระโดดไปตอนปลายทางทันทีหลังเลือก</p>
                                </div>
                                <div className={styles.branchTopActions}>
                                    <button
                                        type="button"
                                        className={styles.branchTopActionBtn}
                                        onClick={isEndingChapter ? handleUnsetChapterEnding : handleSetChapterEnding}
                                    >
                                        <CheckCircle2 size={14} />
                                        {isEndingChapter ? 'ยกเลิกตอนจบ' : 'ตั้งเป็นตอนจบ'}
                                    </button>
                                </div>
                            </div>

                            {!isEndingChapter && missingChoiceTextCount > 0 && (
                                <div className={styles.branchingWorkflowHint}>
                                    ทุกตัวเลือกต้องกรอกข้อความก่อนบันทึก
                                </div>
                            )}
                            {!isEndingChapter && missingChoiceTargetCount > 0 && (
                                <div className={styles.branchingWorkflowHint}>
                                    ทุกตัวเลือกต้องเลือกตอนปลายทางก่อนบันทึก
                                </div>
                            )}
                            {hasEndingState && (
                                <div className={styles.branchingEndingNotice}>
                                    ตอนนี้ถูกตั้งเป็นตอนจบแล้ว
                                </div>
                            )}
                            {!hasEndingState && hasNoBranchChoices && (
                                <div className={styles.branchingWorkflowHint}>
                                    ยังไม่มีทางเลือกท้ายตอน หรือกดตั้งเป็นตอนจบ
                                </div>
                            )}

                            <div className={styles.branchTimerField}>
                                <label htmlFor="branch-choice-timer-chat">เวลานับถอยหลัง (วินาที)</label>
                                <div className={styles.branchTimerInputRow}>
                                    <input
                                        id="branch-choice-timer-chat"
                                        type="number"
                                        min={0}
                                        max={MAX_BRANCH_TIMER_SECONDS}
                                        step={1}
                                        className={styles.branchTimerInput}
                                        value={choiceTimerSeconds}
                                        onChange={(event) => handleChoiceTimerSecondsChange(event.target.value)}
                                        disabled={isEndingChapter}
                                    />
                                    <span className={styles.branchTimerSuffix}>วิ</span>
                                </div>
                                <p className={styles.branchTimerHint}>
                                    {isEndingChapter
                                        ? 'ตอนจบไม่เริ่มนับเวลา แต่จะเก็บค่าที่ตั้งไว้หากยกเลิกตอนจบ'
                                        : choiceTimerSeconds > 0
                                            ? `ตั้งเวลาไว้ ${choiceTimerSeconds} วินาที • ใส่ 0 เพื่อปิด`
                                            : 'ใส่ 0 เพื่อปิด countdown ของตอนนี้'}
                                </p>
                            </div>

                            <div className={styles.branchingTreeRoot}>
                                <div className={styles.branchingTreeRootTitle}>
                                    <span className={styles.branchingTreeRootBadge}>Start</span>
                                    <strong>{title.trim() || 'ไม่มีชื่อ'}</strong>
                                </div>
                                <div className={styles.branchingTreeRootActions}>
                                    <button
                                        type="button"
                                        className={styles.branchingAddBtn}
                                        onClick={addChapterChoice}
                                        disabled={isEndingChapter || chapterChoices.length >= MAX_BRANCH_CHOICES}
                                    >
                                        <Plus size={16} />
                                        เพิ่มทางเลือก
                                    </button>
                                </div>
                            </div>

                            <div className={styles.branchingTreeGrid}>
                                <section className={styles.branchingTreeSection}>
                                    <div className={styles.branchingTreeSectionHeader}>
                                        <h4>ทางเลือกไปตอนถัดไป</h4>
                                        <span>{chapterChoices.length}/{MAX_BRANCH_CHOICES}</span>
                                    </div>

                                    {chapterChoices.length === 0 ? (
                                        <div className={styles.branchingEmpty}>
                                            {isEndingChapter ? 'ตอนนี้ถูกตั้งเป็นตอนจบแล้ว' : 'ยังไม่มีทางเลือกท้ายตอน'}
                                        </div>
                                    ) : (
                                        <div className={styles.branchingChoiceTreeList}>
                                            {chapterChoices.map((choice, index) => (
                                                <div key={choice.id} className={styles.branchingChoiceTreeNode}>
                                                    <div className={styles.branchingTreeNodeLabel}>ทางเลือก {index + 1}</div>
                                                    <div className={styles.branchingChoicePrimaryInputs}>
                                                        <div className={styles.spellcheckInlineFieldFull}>
                                                            {renderSpellcheckOverlay(`choice-text-${choice.id}`, choice.choiceText, styles.branchingChoiceInput, true)}
                                                            <input
                                                                id={`choice-text-${choice.id}`}
                                                                type="text"
                                                                className={`${styles.branchingChoiceInput} ${hasSpellcheckIssue(`choice-text-${choice.id}`) ? styles.spellcheckFieldError : ''} ${styles.spellcheckInlineTarget}`}
                                                                placeholder="ข้อความทางเลือก เช่น เปิดประตูห้องใต้ดิน"
                                                                value={choice.choiceText}
                                                                spellCheck={true}
                                                                lang="th-TH"
                                                                onFocus={() => handleSpellcheckFieldFocus(`choice-text-${choice.id}`)}
                                                                onBlur={() => handleSpellcheckFieldBlur(`choice-text-${choice.id}`)}
                                                                onMouseUp={(event) => handleSpellcheckFieldMouseUp(`choice-text-${choice.id}`, event)}
                                                                onChange={(event) => updateChapterChoice(choice.id, { choiceText: event.target.value })}
                                                            />
                                                        </div>
                                                        <select
                                                            className={styles.branchingChoiceSelect}
                                                            value={choice.toChapterId || ''}
                                                            onChange={(event) => updateChapterChoice(choice.id, { toChapterId: event.target.value || null })}
                                                        >
                                                            <option value="">เลือกตอนปลายทาง...</option>
                                                            {getAvailableTargetsForChoice(choice.id).map((target) => (
                                                                    <option key={target.id} value={target.id}>
                                                                        ตอน {target.orderIndex + 1}: {target.title}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                        <div className={styles.spellcheckInlineFieldFull}>
                                                            {renderSpellcheckOverlay(`choice-outcome-${choice.id}`, choice.outcomeText, styles.branchingChoiceInput)}
                                                            <textarea
                                                                id={`choice-outcome-${choice.id}`}
                                                                className={`${styles.branchingChoiceInput} ${hasSpellcheckIssue(`choice-outcome-${choice.id}`) ? styles.spellcheckFieldError : ''} ${styles.spellcheckInlineTarget}`}
                                                                placeholder="Outcome text (ไม่แสดงในหน้าอ่านตอนนี้)"
                                                                value={choice.outcomeText}
                                                                spellCheck={true}
                                                                lang="th-TH"
                                                                onFocus={() => handleSpellcheckFieldFocus(`choice-outcome-${choice.id}`)}
                                                                onBlur={() => handleSpellcheckFieldBlur(`choice-outcome-${choice.id}`)}
                                                                onMouseUp={(event) => handleSpellcheckFieldMouseUp(`choice-outcome-${choice.id}`, event)}
                                                                onChange={(event) => updateChapterChoice(choice.id, { outcomeText: event.target.value })}
                                                                rows={3}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className={styles.branchingChoiceAdvancedRow}>
                                                        <button
                                                            type="button"
                                                            className={styles.branchingRemoveBtn}
                                                            onClick={() => removeChapterChoice(choice.id)}
                                                            title="ลบตัวเลือก"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>

                            {choiceValidationError && (
                                <div className={styles.branchingError}>{choiceValidationError}</div>
                            )}
                        </section>
                    )}
                </div>
                {isBranchingStory && !isChatStyle && (
                    <aside className={styles.branchingRightPane}>
                        <section className={styles.branchPaneCard}>
                            <div className={styles.branchPaneHeader}>
                                <h3>Branch Summary</h3>
                                <span>{chapterChoices.length}/{MAX_BRANCH_CHOICES}</span>
                            </div>
                            <div className={styles.branchSummaryGrid}>
                                <div className={styles.branchSummaryItem}>
                                    <span>ทางเลือกทั้งหมด</span>
                                    <strong>{chapterChoices.length}</strong>
                                </div>
                                <div className={styles.branchSummaryItem}>
                                    <span>ยังไม่กรอกข้อความ</span>
                                    <strong>{missingChoiceTextCount}</strong>
                                </div>
                                <div className={styles.branchSummaryItem}>
                                    <span>ยังไม่เลือกปลายทาง</span>
                                    <strong>{missingChoiceTargetCount}</strong>
                                </div>
                            </div>

                            <div className={styles.branchTimerField}>
                                <label htmlFor="branch-choice-timer-narrative">เวลานับถอยหลัง (วินาที)</label>
                                <div className={styles.branchTimerInputRow}>
                                    <input
                                        id="branch-choice-timer-narrative"
                                        type="number"
                                        min={0}
                                        max={MAX_BRANCH_TIMER_SECONDS}
                                        step={1}
                                        className={styles.branchTimerInput}
                                        value={choiceTimerSeconds}
                                        onChange={(event) => handleChoiceTimerSecondsChange(event.target.value)}
                                        disabled={isEndingChapter}
                                    />
                                    <span className={styles.branchTimerSuffix}>วิ</span>
                                </div>
                                <p className={styles.branchTimerHint}>
                                    {isEndingChapter
                                        ? 'ตอนจบไม่เริ่มนับเวลา แต่จะเก็บค่าที่ตั้งไว้หากยกเลิกตอนจบ'
                                        : choiceTimerSeconds > 0
                                            ? `ตั้งเวลาไว้ ${choiceTimerSeconds} วินาที • ใส่ 0 เพื่อปิด`
                                            : 'ใส่ 0 เพื่อปิด countdown ของตอนนี้'}
                                </p>
                            </div>

                            <div className={styles.branchTopActions}>
                                <button
                                    type="button"
                                    className={styles.branchTopActionBtn}
                                    onClick={addChapterChoice}
                                    disabled={isEndingChapter || chapterChoices.length >= MAX_BRANCH_CHOICES}
                                >
                                    <Plus size={14} />
                                    เพิ่มทางเลือก
                                </button>
                                <button
                                    type="button"
                                    className={styles.branchTopActionBtn}
                                    onClick={isEndingChapter ? handleUnsetChapterEnding : handleSetChapterEnding}
                                >
                                    <CheckCircle2 size={14} />
                                    {isEndingChapter ? 'ยกเลิกตอนจบ' : 'ตั้งเป็นตอนจบ'}
                                </button>
                                <button
                                    type="button"
                                    className={styles.branchTopActionBtn}
                                    onClick={handleValidateBranchChoices}
                                >
                                    ตรวจสอบ
                                </button>
                            </div>

                            <div className={styles.branchLegendRow}>
                                <span className={`${styles.branchLegendDot} ${styles.branchLegendReady}`} />
                                <span>Ready</span>
                                <span className={`${styles.branchLegendDot} ${styles.branchLegendMissing}`} />
                                <span>Missing text</span>
                                <span className={`${styles.branchLegendDot} ${styles.branchLegendDraft}`} />
                                <span>Draft target</span>
                            </div>
                        </section>

                        {(missingChoiceTextCount > 0 || missingChoiceTargetCount > 0 || hasEndingState || hasNoBranchChoices || choiceValidationError) && (
                            <section className={styles.branchPaneCard}>
                                {!isEndingChapter && missingChoiceTextCount > 0 && (
                                    <div className={styles.branchingWorkflowHint}>
                                        ทุกตัวเลือกต้องมีข้อความก่อนบันทึก
                                    </div>
                                )}
                                {!isEndingChapter && missingChoiceTargetCount > 0 && (
                                    <div className={styles.branchingWorkflowHint}>
                                        ทุกตัวเลือกต้องเลือกตอนปลายทางก่อนบันทึก
                                    </div>
                                )}
                                {hasEndingState && (
                                    <div className={styles.branchingEndingNotice}>
                                        ตอนนี้ถูกตั้งเป็นตอนจบแล้ว
                                    </div>
                                )}
                                {!hasEndingState && hasNoBranchChoices && (
                                    <div className={styles.branchingWorkflowHint}>
                                        ยังไม่มีทางเลือกท้ายตอน หรือกดตั้งเป็นตอนจบ
                                    </div>
                                )}
                                {choiceValidationError && (
                                    <div className={styles.branchingError}>{choiceValidationError}</div>
                                )}
                            </section>
                        )}

                        <section className={styles.branchPaneCard}>
                            <div className={styles.branchPaneHeader}>
                                <h3>Node Map</h3>
                                <div className={styles.branchPaneHeaderActions}>
                                    <span>Double-click เพื่อแก้ไข · Hover เพื่อลบ</span>
                                    <button
                                        type="button"
                                        className={styles.branchPaneExpandBtn}
                                        onClick={() => setIsNodeMapModalOpen(true)}
                                        title="ขยาย Node Map"
                                        aria-label="ขยาย Node Map"
                                    >
                                        <Maximize2 size={14} />
                                        ขยาย
                                    </button>
                                </div>
                            </div>
                            <BranchGraphCanvas
                                nodes={branchGraph.nodes}
                                edges={branchGraph.edges}
                                selected={selectedGraphNode}
                                onSelect={setSelectedGraphNode}
                                showSelectionPopover={false}
                                onUpdateChoice={updateChapterChoice}
                                onRemoveChoice={removeChapterChoice}
                                onAddChoice={addChapterChoice}
                                onDuplicateChoice={duplicateChapterChoice}
                                onOpenTarget={handleOpenTargetChapter}
                                chapterChoices={chapterChoices}
                                chapterTargets={chapterTargets}
                                getChoiceTargets={getAvailableTargetsForChoice}
                                currentChapterId={chapterId}
                                maxChoices={MAX_BRANCH_CHOICES}
                                minChoices={MIN_BRANCH_CHOICES}
                                choiceCount={chapterChoices.length}
                            />
                            <div className={styles.branchShortcutHint}>
                                คีย์ลัด: <kbd>A</kbd> เพิ่มทางเลือก, <kbd>Delete</kbd> ลบที่เลือก · Double-click แก้ข้อความ · Click เลือกปลายทาง
                            </div>
                        </section>
                    </aside>
                )}
            </div>

            {isNodeMapModalOpen && isBranchingStory && !isChatStyle && (
                <div
                    className={styles.branchMapModalOverlay}
                    onClick={() => setIsNodeMapModalOpen(false)}
                >
                    <section
                        className={`${styles.branchPaneCard} ${styles.branchMapModal}`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.branchPaneHeader}>
                            <h3>Node Map (Expanded)</h3>
                            <div className={styles.branchPaneHeaderActions}>
                                <span>Double-click เพื่อแก้ไข · Hover เพื่อลบ</span>
                                <button
                                    type="button"
                                    className={styles.branchPaneExpandBtn}
                                    onClick={() => setIsNodeMapModalOpen(false)}
                                    title="ย่อ Node Map"
                                    aria-label="ย่อ Node Map"
                                >
                                    <Minimize2 size={14} />
                                    ย่อ
                                </button>
                            </div>
                        </div>
                        <div className={styles.branchMapModalBody}>
                            <div className={styles.branchMapModalLayout}>
                                <div className={styles.branchMapCanvasPane}>
                                    <BranchGraphCanvas
                                        nodes={branchGraph.nodes}
                                        edges={branchGraph.edges}
                                        selected={selectedGraphNode}
                                        onSelect={setSelectedGraphNode}
                                        fillViewport
                                        showSelectionPopover={false}
                                        onUpdateChoice={updateChapterChoice}
                                        onRemoveChoice={removeChapterChoice}
                                        onAddChoice={addChapterChoice}
                                        onDuplicateChoice={duplicateChapterChoice}
                                        onOpenTarget={handleOpenTargetChapter}
                                        chapterChoices={chapterChoices}
                                        chapterTargets={chapterTargets}
                                        getChoiceTargets={getAvailableTargetsForChoice}
                                        currentChapterId={chapterId}
                                        maxChoices={MAX_BRANCH_CHOICES}
                                        minChoices={MIN_BRANCH_CHOICES}
                                        choiceCount={chapterChoices.length}
                                    />
                                </div>
                                <aside className={styles.branchMapPropertiesPane}>
                                    <div className={styles.branchPaneHeader}>
                                        <h3>Properties</h3>
                                    </div>
                                    <BranchInspector
                                        selected={selectedGraphNode}
                                        selectedChoice={selectedChoice}
                                        selectedTarget={selectedTarget}
                                        chapterTargets={selectedChoice ? getAvailableTargetsForChoice(selectedChoice.id) : chapterTargets.filter((target) => target.id !== chapterId)}
                                        choiceIssues={selectedChoiceIssues}
                                        isCreatingTarget={isCreatingBranchTarget}
                                        onUpdateChoice={updateChapterChoice}
                                        onRemoveChoice={removeChapterChoice}
                                        onDuplicateChoice={duplicateChapterChoice}
                                        onCreateTarget={handleCreateBranchTargetForChoice}
                                        onEditTarget={handleOpenTargetChapter}
                                        onNavigateToTarget={handleNavigateToTarget}
                                        minChoices={MIN_BRANCH_CHOICES}
                                        choiceCount={chapterChoices.length}
                                    />
                                </aside>
                            </div>
                        </div>
                        <div className={styles.branchShortcutHint}>
                            คีย์ลัด: <kbd>A</kbd> เพิ่มทางเลือก, <kbd>Delete</kbd> ลบที่เลือก · Double-click แก้ข้อความ · Click เลือกปลายทาง
                        </div>
                    </section>
                </div>
            )}

            {targetEditorChapterId && (
                <div
                    className={`${styles.modalOverlay} ${styles.targetChapterModalOverlay}`}
                    onClick={() => setTargetEditorChapterId(null)}
                >
                    <div
                        className={`${styles.modal} ${styles.targetChapterModal}`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                แก้ไขตอนปลายทาง: {targetEditorChapter ? `ตอน ${targetEditorChapter.orderIndex + 1}` : 'ตอน'}
                            </h2>
                            <div className={styles.targetChapterModalHeaderActions}>
                                <button
                                    type="button"
                                    className={styles.targetChapterOpenTabBtn}
                                    onClick={() => {
                                        if (!targetEditorUrl) return;
                                        window.open(targetEditorUrl, '_blank', 'noopener,noreferrer');
                                    }}
                                >
                                    <ExternalLink size={14} />
                                    เปิดแท็บใหม่
                                </button>
                                <button className={styles.iconBtn} onClick={() => setTargetEditorChapterId(null)}>
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.targetChapterModalBody}>
                            {targetEditorUrl ? (
                                <iframe
                                    className={styles.targetChapterEditorFrame}
                                    src={targetEditorUrl}
                                    title={`target-chapter-editor-${targetEditorChapterId}`}
                                />
                            ) : (
                                <div className={styles.branchInspectorEmpty}>ไม่พบตอนปลายทางที่ต้องการแก้ไข</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <RevisionDrawer
                isOpen={isRevisionDrawerOpen}
                isLoading={isLoadingRevisions}
                revisionRows={revisionRows as RevisionRow[]}
                disabled={isSaving || isRestoringRevision}
                onClose={() => setIsRevisionDrawerOpen(false)}
                onRestore={(revision) => void handleRestoreRevision(revision)}
                getRevisionTypeLabel={getRevisionTypeLabel}
            />

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
                                    เลือกรูปจากคลังภาพ
                                </button>

                                <div className={styles.editField}>
                                    <label>ชื่อตัวละคร <span className={styles.requiredMark}>*</span></label>
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
                <div className={styles.modalOverlay} onClick={() => {
                    setShowUnsplashModal(false);
                    setSceneImageTarget(null);
                }}>
                    <div className={`${styles.modal} ${styles.unsplashModal}`} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>ค้นหารูปภาพ</h2>
                            <button className={styles.iconBtn} onClick={() => {
                                setShowUnsplashModal(false);
                                setSceneImageTarget(null);
                            }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.unsplashSourceTabs}>
                                <button
                                    type="button"
                                    className={`${styles.unsplashSourceTab} ${imageSearchSource === 'unsplash' ? styles.unsplashSourceTabActive : ''}`}
                                    onClick={() => handleImageSourceChange('unsplash')}
                                >
                                    Unsplash
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.unsplashSourceTab} ${imageSearchSource === 'pixabay' ? styles.unsplashSourceTabActive : ''}`}
                                    onClick={() => handleImageSourceChange('pixabay')}
                                >
                                    Pixabay
                                </button>
                            </div>
                            <div className={styles.unsplashSearchRow}>
                                <input
                                    type="text"
                                    value={unsplashQuery}
                                    onChange={(e) => setUnsplashQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSearchImages();
                                        }
                                    }}
                                    className={styles.unsplashSearchInput}
                                    placeholder={
                                        unsplashTarget === 'chat'
                                            ? 'เช่น เมืองกลางคืน, rain, fantasy'
                                            : unsplashTarget === 'visual_novel'
                                                ? 'เช่น cyberpunk room, neon city, anime background'
                                            : unsplashTarget === 'narrative'
                                                ? 'เช่น fantasy landscape, storm, magic forest'
                                                : 'เช่น anime portrait, character'
                                    }
                                />
                                <button
                                    type="button"
                                    className={styles.unsplashSearchBtn}
                                    onClick={() => handleSearchImages()}
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
                                        <span className={styles.unsplashCredit}>
                                            <span>by {image.author}</span>
                                            <span className={styles.unsplashSourceBadge}>
                                                {image.source === 'pixabay' ? 'Pixabay' : 'Unsplash'}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeSuggestionPopover && suggestionPopoverPosition && createPortal(
                <div
                    className={styles.spellcheckSuggestionPopover}
                    style={{
                        left: `${suggestionPopoverPosition.left}px`,
                        top: `${suggestionPopoverPosition.top}px`,
                    }}
                    data-spellcheck-popover="true"
                >
                    <div className={styles.spellcheckSuggestionTitle}>
                        คำที่ควรตรวจ: <strong>{activeSuggestionPopover.word}</strong>
                    </div>
                    {activeSuggestionPopover.suggestions.length > 0 ? (
                        <div className={styles.spellcheckSuggestionList}>
                            {activeSuggestionPopover.suggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    className={styles.spellcheckSuggestionItem}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleApplySuggestion(suggestion)}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.spellcheckSuggestionEmpty}>
                            ไม่พบคำแนะนำอัตโนมัติ ลองพิมพ์แก้ด้วยตนเอง
                        </div>
                    )}
                </div>,
                document.body
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
