'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Settings, BarChart2, Edit3, Image as ImageIcon, GripVertical, Trash2, X, Save, Loader2, Upload, Search } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult, DroppableProvided, DraggableProvided, DraggableStateSnapshot, DroppableStateSnapshot } from '@hello-pangea/dnd';
import styles from './manage.module.css';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { MAIN_CATEGORIES, SUB_CATEGORIES } from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';

type StoryCompletionStatus = 'ongoing' | 'completed';
type StoryPublicationStatus = 'draft' | 'published';
type StoryPathMode = 'linear' | 'branching';
const BRANCHING_FEATURE_ENABLED = FEATURE_FLAGS.branching;
const normalizeCompletionStatus = (value: string | null | undefined): StoryCompletionStatus => {
    return value === 'completed' ? 'completed' : 'ongoing';
};
const normalizePublicationStatus = (value: string | null | undefined): StoryPublicationStatus => {
    return value === 'published' ? 'published' : 'draft';
};
const normalizePathMode = (value: string | null | undefined): StoryPathMode => {
    if (!BRANCHING_FEATURE_ENABLED) return 'linear';
    return value === 'branching' ? 'branching' : 'linear';
};

export type Character = {
    id: string;
    story_id: string;
    name: string;
    age: string | null;
    occupation: string | null;
    personality: string | null;
    image_url: string | null;
    order_index: number;
    created_at: string;
};

type ManageChapter = {
    id: string;
    title: string;
    status: 'draft' | 'published';
    views: number;
    comments: number;
    date: string;
    isPremium: boolean;
    coinPrice: number;
    hasUnpublishedChanges: boolean;
};

type ChapterBranchLink = {
    fromChapterId: string;
    toChapterId: string;
};

type DecoratedManageChapter = ManageChapter & {
    isEntry: boolean;
    incomingChoiceCount: number;
    outgoingChoiceCount: number;
    branchRole: 'entry' | 'hub' | 'target' | 'unlinked';
};

type ManageStory = {
    id: string;
    title: string;
    penName: string;
    writingStyle: string;
    status: StoryPublicationStatus;
    completionStatus: StoryCompletionStatus;
    synopsis: string;
    category: string;
    mainCategory: string;
    subCategory: string;
    pathMode: StoryPathMode;
    entryChapterId: string | null;
    coverImage: string | null;
    coverWideImage: string | null;
    readCount: number;
    heartCount: number;
    commentCount: number;
    chapters: ManageChapter[];
};

type EditFormState = {
    title: string;
    penName: string;
    synopsis: string;
    category: string;
    mainCategory: string;
    subCategory: string;
    pathMode: StoryPathMode;
    coverUrl: string | null;
    coverWideUrl: string | null;
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

type UnsplashTarget = 'cover' | 'wide';

type CharacterFormState = {
    name: string;
    age: string;
    occupation: string;
    personality: string;
    imageUrl: string | null;
};

type CharacterUpdatePayload = {
    name: string;
    age: string | null;
    occupation: string | null;
    personality: string | null;
    image_url?: string;
};

type MutableChapterContentBlock = Record<string, unknown> & {
    characterId?: string | null;
};

type MutableChapterContent = Record<string, unknown> & {
    povCharacterId?: string | null;
    blocks?: MutableChapterContentBlock[];
};

const toComparableJson = (value: unknown): string => {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return String(value ?? '');
    }
};

export default function StoryManagerPage() {
    const params = useParams();
    const router = useRouter();
    const storyId = params.id as string;
    const manageCacheKey = `flowfic_manage_${storyId}`;
    const manageScrollKey = `flowfic_manage_scroll_${storyId}`;
    const { user, isLoading: isLoadingAuth } = useAuth();
    const userId = user?.id ?? null;

    const [storyData, setStoryData] = useState<ManageStory | null>(null);
    const [chapters, setChapters] = useState<ManageChapter[]>([]);
    const [chapterLinks, setChapterLinks] = useState<ChapterBranchLink[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFromDB, setIsFromDB] = useState(false);
    const [authError, setAuthError] = useState(false);

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState<EditFormState>({
        title: '',
        penName: '',
        synopsis: '',
        category: '',
        mainCategory: '',
        subCategory: '',
        pathMode: 'linear',
        coverUrl: null as string | null,
        coverWideUrl: null as string | null,
    });
    const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
    const [editCoverWideFile, setEditCoverWideFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingStoryStatus, setIsUpdatingStoryStatus] = useState(false);
    const [showUnsplashModal, setShowUnsplashModal] = useState(false);
    const [unsplashTarget, setUnsplashTarget] = useState<UnsplashTarget>('cover');
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState<UnsplashImage[]>([]);
    const [isUnsplashLoading, setIsUnsplashLoading] = useState(false);
    const [unsplashError, setUnsplashError] = useState<string | null>(null);

    // Character modal state
    const [showCharModal, setShowCharModal] = useState(false);
    const [charForm, setCharForm] = useState<CharacterFormState>({
        name: '',
        age: '',
        occupation: '',
        personality: '',
        imageUrl: null as string | null
    });
    const [charImageFile, setCharImageFile] = useState<File | null>(null);
    const [isSavingChar, setIsSavingChar] = useState(false);
    const [editingCharId, setEditingCharId] = useState<string | null>(null);

    // Confirm Modal state
    const [deleteConfirm, setDeleteConfirm] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    // Required to prevent Next.js hydration errors with @hello-pangea/dnd
    const [isMounted, setIsMounted] = useState(false);
    const hasRestoredScrollRef = useRef(false);

    useEffect(() => {
        setIsMounted(true);

        const cached = sessionStorage.getItem(manageCacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached) as Partial<{
                    storyData: ManageStory;
                    chapters: ManageChapter[];
                    chapterLinks: ChapterBranchLink[];
                    characters: Character[];
                }>;
                setStoryData(parsed.storyData ?? null);
                setChapters(parsed.chapters ?? []);
                setChapterLinks(parsed.chapterLinks ?? []);
                setCharacters(parsed.characters ?? []);
                setIsFromDB(true);
                setIsLoading(false);
            } catch (e) {
                console.error("Cache parsing error", e);
            }
        }

        const fetchStory = async () => {
            if (!storyId || !userId) return;

            // Try fetching from Supabase first
            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .select('*')
                .eq('id', storyId)
                .single();

            if (storyError || !storyData) {
                console.error("Story not found or error:", storyError);
                router.push('/dashboard');
                return;
            }

            // Security check: only the owner can manage
            if (storyData.user_id !== userId) {
                setAuthError(true);
                setIsLoading(false);
                return;
            }

            if (!storyError && storyData) {
                const nextPathMode = normalizePathMode(storyData.path_mode);
                // Fetch chapters for this story
                const { data: chaptersData, error: chaptersError } = await supabase
                    .from('chapters')
                    .select('id, title, draft_title, published_title, content, draft_content, published_content, status, order_index, created_at, read_count, is_premium, coin_price, draft_updated_at, published_updated_at')
                    .eq('story_id', storyId)
                    .order('order_index', { ascending: true });

                if (chaptersError) {
                    throw chaptersError;
                }

                const formattedChapters: ManageChapter[] = (chaptersData || []).map(ch => ({
                    id: ch.id,
                    title: ch.draft_title || ch.title,
                    status: ch.status as 'draft' | 'published',
                    views: ch.read_count || 0,
                    comments: 0,
                    date: new Date(ch.created_at).toLocaleDateString(),
                    isPremium: ch.is_premium || false,
                    coinPrice: ch.coin_price || 0,
                    hasUnpublishedChanges: (() => {
                        if (ch.status !== 'published') return false;

                        const draftTitle = (ch.draft_title || ch.title || '').trim();
                        const publishedTitle = (ch.published_title || ch.title || '').trim();
                        const draftContent = toComparableJson(ch.draft_content ?? ch.content);
                        const publishedContent = toComparableJson(ch.published_content ?? ch.content);
                        const hasContentDiff = draftTitle !== publishedTitle || draftContent !== publishedContent;

                        const draftTs = ch.draft_updated_at ? Date.parse(ch.draft_updated_at) : NaN;
                        const publishedTs = ch.published_updated_at ? Date.parse(ch.published_updated_at) : NaN;
                        const hasTimestampDiff =
                            Number.isFinite(draftTs) && Number.isFinite(publishedTs) && draftTs > publishedTs;

                        return hasContentDiff || hasTimestampDiff;
                    })(),
                }));

                let branchLinksData: ChapterBranchLink[] = [];
                if (BRANCHING_FEATURE_ENABLED && nextPathMode === 'branching') {
                    const { data: rawLinks, error: chapterLinksError } = await supabase
                        .from('chapter_choices')
                        .select('from_chapter_id, to_chapter_id')
                        .eq('story_id', storyId);

                    if (chapterLinksError) {
                        console.error('Failed to fetch chapter choices:', chapterLinksError);
                    } else {
                        branchLinksData = ((rawLinks || []) as Array<{
                            from_chapter_id: string | null;
                            to_chapter_id: string | null;
                        }>)
                            .filter((row) => typeof row.from_chapter_id === 'string' && typeof row.to_chapter_id === 'string')
                            .map((row) => ({
                                fromChapterId: row.from_chapter_id as string,
                                toChapterId: row.to_chapter_id as string,
                            }));
                    }
                }

                const dbStory: ManageStory = {
                    id: storyData.id,
                    title: storyData.title,
                    penName: storyData.pen_name,
                    writingStyle: storyData.writing_style || 'narrative',
                    status: normalizePublicationStatus(storyData.status),
                    completionStatus: normalizeCompletionStatus(storyData.completion_status),
                    synopsis: storyData.synopsis || '',
                    category: storyData.category,
                    mainCategory: storyData.main_category || '',
                    subCategory: storyData.sub_category || '',
                    pathMode: nextPathMode,
                    entryChapterId: storyData.entry_chapter_id || null,
                    coverImage: storyData.cover_url,
                    coverWideImage: storyData.cover_wide_url,
                    readCount: storyData.read_count || 0,
                    heartCount: 0,
                    commentCount: 0,
                    chapters: formattedChapters,
                };

                // Fetch characters
                const { data: charsData } = await supabase
                    .from('characters')
                    .select('*')
                    .eq('story_id', storyId)
                    .order('order_index', { ascending: true });

                setStoryData(dbStory);
                setChapters(formattedChapters);
                setChapterLinks(branchLinksData);
                setCharacters(charsData || []);
                setIsFromDB(true);

                sessionStorage.setItem(manageCacheKey, JSON.stringify({
                    storyData: dbStory,
                    chapters: formattedChapters,
                    chapterLinks: branchLinksData,
                    characters: charsData || []
                }));
            }
            setIsLoading(false);
        };

        if (!isLoadingAuth) {
            if (!userId) {
                router.push('/');
            } else {
                fetchStory();
            }
        }
    }, [manageCacheKey, storyId, userId, isLoadingAuth, router]);

    const story = storyData ? { ...storyData, chapters } : null;
    const editorStyle = story?.writingStyle || 'narrative';
    const isBranchingStory = BRANCHING_FEATURE_ENABLED && story?.pathMode === 'branching';
    const publishedCount = chapters.filter(chapter => chapter.status === 'published').length;
    const isStoryCompleted = story?.completionStatus === 'completed';
    const canRestoreManageScroll = isMounted && !isLoading && !!story;
    const effectiveEntryChapterId = isBranchingStory
        ? (story?.entryChapterId || chapters[0]?.id || null)
        : null;
    const decoratedChapters = useMemo<DecoratedManageChapter[]>(() => {
        if (!isBranchingStory) {
            return chapters.map((chapter) => ({
                ...chapter,
                isEntry: false,
                incomingChoiceCount: 0,
                outgoingChoiceCount: 0,
                branchRole: 'unlinked',
            }));
        }

        const incomingCounts = new Map<string, number>();
        const outgoingCounts = new Map<string, number>();

        chapterLinks.forEach((link) => {
            outgoingCounts.set(link.fromChapterId, (outgoingCounts.get(link.fromChapterId) || 0) + 1);
            incomingCounts.set(link.toChapterId, (incomingCounts.get(link.toChapterId) || 0) + 1);
        });

        return chapters.map((chapter) => {
            const incomingChoiceCount = incomingCounts.get(chapter.id) || 0;
            const outgoingChoiceCount = outgoingCounts.get(chapter.id) || 0;
            const isEntry = chapter.id === effectiveEntryChapterId;
            const branchRole: DecoratedManageChapter['branchRole'] = isEntry
                ? 'entry'
                : outgoingChoiceCount > 0
                    ? 'hub'
                    : incomingChoiceCount > 0
                        ? 'target'
                        : 'unlinked';

            return {
                ...chapter,
                isEntry,
                incomingChoiceCount,
                outgoingChoiceCount,
                branchRole,
            };
        });
    }, [chapters, chapterLinks, effectiveEntryChapterId, isBranchingStory]);
    const branchingSections = useMemo(() => {
        if (!isBranchingStory) return [];

        const sectionMap: Array<{
            key: DecoratedManageChapter['branchRole'];
            title: string;
            description: string;
            chapters: DecoratedManageChapter[];
        }> = [
            {
                key: 'entry',
                title: 'ตอนจุดเริ่มต้น',
                description: 'จุดเริ่มอ่านหลักของเรื่อง',
                chapters: decoratedChapters.filter((chapter) => chapter.isEntry),
            },
            {
                key: 'hub',
                title: 'ตอนที่มีทางเลือก',
                description: 'ตอนที่ผู้อ่านต้องตัดสินใจ',
                chapters: decoratedChapters.filter((chapter) => !chapter.isEntry && chapter.outgoingChoiceCount > 0),
            },
            {
                key: 'target',
                title: 'ตอนปลายทาง',
                description: 'ตอนที่ถูกพามาจากทางเลือก',
                chapters: decoratedChapters.filter((chapter) => !chapter.isEntry && chapter.outgoingChoiceCount === 0 && chapter.incomingChoiceCount > 0),
            },
            {
                key: 'unlinked',
                title: 'ตอนยังไม่เชื่อม',
                description: 'ตอนที่ยังไม่ถูกใช้ใน flow',
                chapters: decoratedChapters.filter((chapter) => !chapter.isEntry && chapter.outgoingChoiceCount === 0 && chapter.incomingChoiceCount === 0),
            },
        ];

        return sectionMap.filter((section) => section.chapters.length > 0);
    }, [decoratedChapters, isBranchingStory]);

    const saveManageScrollPosition = useCallback(() => {
        if (typeof window === 'undefined') return;
        sessionStorage.setItem(manageScrollKey, String(window.scrollY));
    }, [manageScrollKey]);

    useEffect(() => {
        if (!isMounted) return;

        const handlePageHide = () => {
            saveManageScrollPosition();
        };

        window.addEventListener('pagehide', handlePageHide);
        return () => window.removeEventListener('pagehide', handlePageHide);
    }, [isMounted, saveManageScrollPosition]);

    useEffect(() => {
        if (!canRestoreManageScroll || hasRestoredScrollRef.current) return;

        const rawScroll = sessionStorage.getItem(manageScrollKey);
        hasRestoredScrollRef.current = true;

        if (!rawScroll) return;

        const scrollTop = Number(rawScroll);
        sessionStorage.removeItem(manageScrollKey);

        if (!Number.isFinite(scrollTop) || scrollTop <= 0) return;

        let cancelled = false;
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (cancelled) return;
                window.scrollTo({ top: scrollTop, behavior: 'auto' });
            });
        });

        return () => {
            cancelled = true;
        };
    }, [canRestoreManageScroll, manageScrollKey]);

    const buildChapterEditorUrl = useCallback((chapterId: string) => {
        const query = new URLSearchParams({
            style: editorStyle,
            pathMode: story?.pathMode || 'linear',
        });
        return `/story/manage/${storyId}/chapter/${chapterId}/edit?${query.toString()}`;
    }, [editorStyle, story?.pathMode, storyId]);

    const handleDragEnd = async (result: DropResult) => {
        if (!result.destination) return;

        const items = Array.from(chapters);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        setChapters(items);

        // Update order in Supabase if real data
        if (isFromDB) {
            const updates = items.map((item, index) => ({
                id: item.id,
                order_index: index,
            }));

            // Supabase upsert requires the whole row or just the updated fields if we do it iteratively
            // For simplicity and safety against race conditions, we update them one by one
            for (const update of updates) {
                await supabase
                    .from('chapters')
                    .update({ order_index: update.order_index })
                    .eq('id', update.id);
            }
        }
    };

    const handleDeleteChapter = (id: string) => {
        setDeleteConfirm({
            isOpen: true,
            title: 'ลบตอน',
            message: 'คุณแน่ใจหรือไม่ว่าต้องการลบตอนนี้? ข้อมูลทั้งหมดในตอนนี้จะหายไปและกู้คืนไม่ได้',
            onConfirm: async () => {
                setDeleteConfirm(prev => ({ ...prev, isOpen: false }));
                // Optimistic update
                setChapters(prev => prev.filter(c => c.id !== id));
                setChapterLinks((prev) => prev.filter((link) => link.fromChapterId !== id && link.toChapterId !== id));
                setStoryData((prev) => prev ? {
                    ...prev,
                    entryChapterId: prev.entryChapterId === id
                        ? (chapters.find((chapter) => chapter.id !== id)?.id || null)
                        : prev.entryChapterId,
                } : null);

                if (isFromDB) {
                    const { error } = await supabase
                        .from('chapters')
                        .delete()
                        .eq('id', id);

                    if (error) {
                        console.error('Failed to delete chapter:', error);
                        alert('เกิดข้อผิดพลาดในการลบตอน');
                    }
                }
            }
        });
    };

    const handleCreateChapter = async () => {
        if (!user) return;

        if (isStoryCompleted) {
            alert("เรื่องนี้ถูกตั้งเป็น 'จบแล้ว' จึงไม่สามารถเพิ่มตอนใหม่ได้");
            return;
        }

        if (!isFromDB) {
            alert("ฟีเจอร์ทดลอง: ไม่สามารถเพิ่มตอนใน Draft นิยายตัวอย่างได้");
            return;
        }

        try {
            // 1. Create a draft chapter in Supabase
            const { data, error } = await supabase
                .from('chapters')
                .insert([
                    {
                        story_id: storyId,
                        user_id: user.id,
                        title: 'ตอนใหม่',
                        draft_title: 'ตอนใหม่',
                        draft_content: null,
                        draft_updated_at: new Date().toISOString(),
                        order_index: chapters.length,
                        status: 'draft'
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            // 2. Redirect to the editor page for this new chapter
            saveManageScrollPosition();
            router.push(buildChapterEditorUrl(data.id));

        } catch (err) {
            console.error("Error creating chapter:", err);
            alert("ไม่สามารถสร้างตอนใหม่ได้ในขณะนี้");
        }
    };

    const handleEditChapter = (chapterId: string) => {
        saveManageScrollPosition();
        router.push(buildChapterEditorUrl(chapterId));
    };

    const handleQuickStoryStatusUpdate = async (
        nextPublicationStatus?: StoryPublicationStatus,
        nextCompletionStatus?: StoryCompletionStatus
    ) => {
        if (!story) return;

        const targetPublicationStatus = nextPublicationStatus ?? normalizePublicationStatus(story.status);
        const targetCompletionStatus = nextCompletionStatus ?? normalizeCompletionStatus(story.completionStatus);

        if (
            targetPublicationStatus === normalizePublicationStatus(story.status) &&
            targetCompletionStatus === normalizeCompletionStatus(story.completionStatus)
        ) {
            return;
        }

        const previousPublicationStatus = normalizePublicationStatus(story.status);
        const previousCompletionStatus = normalizeCompletionStatus(story.completionStatus);

        // Optimistic UI update
        setStoryData((prev) => prev ? {
            ...prev,
            status: targetPublicationStatus,
            completionStatus: targetCompletionStatus,
        } : null);

        if (!isFromDB) {
            return;
        }

        setIsUpdatingStoryStatus(true);
        try {
            const { error } = await supabase
                .from('stories')
                .update({
                    status: targetPublicationStatus,
                    completion_status: targetCompletionStatus,
                })
                .eq('id', storyId);

            if (error) {
                throw error;
            }
        } catch (err) {
            console.error('Error updating story status:', err);
            setStoryData((prev) => prev ? {
                ...prev,
                status: previousPublicationStatus,
                completionStatus: previousCompletionStatus,
            } : null);
            alert('ไม่สามารถอัปเดตสถานะเรื่องได้ในขณะนี้');
        } finally {
            setIsUpdatingStoryStatus(false);
        }
    };

    const openEditModal = () => {
        if (!story) return;
        setEditForm({
            title: story.title,
            penName: story.penName,
            synopsis: story.synopsis,
            category: story.category,
            mainCategory: story.mainCategory || '',
            subCategory: story.subCategory || '',
            pathMode: story.pathMode,
            coverUrl: story.coverImage,
            coverWideUrl: story.coverWideImage,
        });
        setEditCoverFile(null);
        setEditCoverWideFile(null);
        setShowEditModal(true);
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditCoverFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === 'string') {
                    setEditForm((prev) => ({ ...prev, coverUrl: result }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleWideCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditCoverWideFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === 'string') {
                    setEditForm((prev) => ({ ...prev, coverWideUrl: result }));
                }
            };
            reader.readAsDataURL(file);
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

    const openUnsplashPicker = (target: UnsplashTarget) => {
        setUnsplashTarget(target);
        setShowUnsplashModal(true);
        setUnsplashError(null);
        if (!unsplashQuery) {
            const defaultQuery =
                target === 'wide'
                    ? 'cinematic anime landscape'
                    : 'novel cover art portrait';
            setUnsplashQuery(defaultQuery);
            handleSearchUnsplash(defaultQuery);
        } else if (unsplashResults.length === 0) {
            handleSearchUnsplash(unsplashQuery);
        }
    };

    const handleSelectUnsplashCover = (image: UnsplashImage) => {
        if (unsplashTarget === 'wide') {
            setEditForm((prev) => ({ ...prev, coverWideUrl: image.regular }));
            setEditCoverWideFile(null);
        } else {
            setEditForm((prev) => ({ ...prev, coverUrl: image.regular }));
            setEditCoverFile(null);
        }
        setShowUnsplashModal(false);
    };

    const handleSaveEdit = async () => {
        if (!isFromDB || !story) return;
        setIsSaving(true);
        try {
            let finalCoverUrl = editForm.coverUrl;
            let finalCoverWideUrl = editForm.coverWideUrl;

            // 1. Upload new cover if changed
            if (editCoverFile) {
                const fileExt = editCoverFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('covers')
                    .upload(fileName, editCoverFile);

                if (uploadError) {
                    throw uploadError;
                }

                const { data: urlData } = supabase.storage
                    .from('covers')
                    .getPublicUrl(uploadData.path);
                finalCoverUrl = urlData.publicUrl;

                // 2. Delete old cover if it existed
                if (story.coverImage) {
                    const oldPath = story.coverImage.split('/covers/')[1];
                    if (oldPath) {
                        await supabase.storage.from('covers').remove([oldPath]);
                    }
                }
            }

            if (editCoverWideFile) {
                const fileExt = editCoverWideFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_wide.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('covers')
                    .upload(fileName, editCoverWideFile);

                if (uploadError) {
                    throw uploadError;
                }

                const { data: urlData } = supabase.storage
                    .from('covers')
                    .getPublicUrl(uploadData.path);
                finalCoverWideUrl = urlData.publicUrl;

                if (story.coverWideImage) {
                    const oldPath = story.coverWideImage.split('/covers/')[1];
                    if (oldPath) {
                        await supabase.storage.from('covers').remove([oldPath]);
                    }
                }
            }

            // 3. Update DB
            const { error } = await supabase
                .from('stories')
                .update({
                    title: editForm.title,
                    pen_name: editForm.penName,
                    synopsis: editForm.synopsis,
                    category: editForm.category,
                    main_category: editForm.mainCategory || null,
                    sub_category: editForm.subCategory || null,
                    path_mode: BRANCHING_FEATURE_ENABLED ? editForm.pathMode : 'linear',
                    entry_chapter_id: BRANCHING_FEATURE_ENABLED && editForm.pathMode === 'branching'
                        ? (story.entryChapterId || chapters[0]?.id || null)
                        : null,
                    cover_url: finalCoverUrl,
                    cover_wide_url: finalCoverWideUrl,
                })
                .eq('id', storyId);

            if (error) {
                alert(`เกิดข้อผิดพลาด: ${error.message}`);
                return;
            }

            // 4. Update local state
            setStoryData((prev) => prev ? {
                ...prev,
                title: editForm.title,
                penName: editForm.penName,
                synopsis: editForm.synopsis,
                category: editForm.category,
                mainCategory: editForm.mainCategory,
                subCategory: editForm.subCategory,
                pathMode: BRANCHING_FEATURE_ENABLED ? editForm.pathMode : 'linear',
                entryChapterId: BRANCHING_FEATURE_ENABLED && editForm.pathMode === 'branching'
                    ? (prev.entryChapterId || chapters[0]?.id || null)
                    : null,
                coverImage: finalCoverUrl,
                coverWideImage: finalCoverWideUrl,
            } : null);
            setShowEditModal(false);
        } catch (err) {
            console.error('Error saving edits:', err);
            alert('เกิดข้อผิดพลาดที่ไม่คาดคิด');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCharImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCharImageFile(file);
            const objectUrl = URL.createObjectURL(file);
            setCharForm((prev) => ({ ...prev, imageUrl: objectUrl }));
        }
    };

    const handleSaveCharacter = async () => {
        if (!user) return;

        if (!charForm.name.trim()) {
            alert('กรุณากรอกชื่อตัวละคร');
            return;
        }

        setIsSavingChar(true);

        try {
            let uploadedImageUrl = null;

            if (charImageFile) {
                const fileExt = charImageFile.name.split('.').pop();
                const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                const filePath = `${storyId}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('characters')
                    .upload(filePath, charImageFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('characters')
                    .getPublicUrl(filePath);

                uploadedImageUrl = publicUrl;
            }

            if (editingCharId) {
                // Update existing character
                const updateData: CharacterUpdatePayload = {
                    name: charForm.name,
                    age: charForm.age || null,
                    occupation: charForm.occupation || null,
                    personality: charForm.personality || null,
                };

                // Only update image_url if a new image was uploaded
                if (uploadedImageUrl) {
                    updateData.image_url = uploadedImageUrl;
                }

                const { data: updatedChar, error: updateError } = await supabase
                    .from('characters')
                    .update(updateData)
                    .eq('id', editingCharId)
                    .select()
                    .single();

                if (updateError) throw updateError;

                // Update local state
                setCharacters(prev => prev.map(c => c.id === editingCharId ? updatedChar : c));
            } else {
                // Insert new character
                const { data: newChar, error: insertError } = await supabase
                    .from('characters')
                    .insert([{
                        story_id: storyId,
                        user_id: user.id,
                        name: charForm.name,
                        age: charForm.age || null,
                        occupation: charForm.occupation || null,
                        personality: charForm.personality || null,
                        image_url: uploadedImageUrl,
                        order_index: characters.length
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;

                setCharacters(prev => [...prev, newChar]);
            }

            handleCloseCharModal();

        } catch (err) {
            const message = err instanceof Error ? err.message : 'unknown';
            console.error('Failed to save character:', err);
            alert(`เกิดข้อผิดพลาดในการบันทึกตัวละคร: ${message}`);
        } finally {
            setIsSavingChar(false);
        }
    };

    const handleOpenCreateCharModal = () => {
        if (!isFromDB) {
            alert("ไม่สามารถเพิ่มตัวละครในโหมดเดโมได้");
            return;
        }
        setEditingCharId(null);
        setCharForm({ name: '', age: '', occupation: '', personality: '', imageUrl: null });
        setCharImageFile(null);
        setShowCharModal(true);
    };

    const handleEditCharacter = (char: Character) => {
        setEditingCharId(char.id);
        setCharForm({
            name: char.name,
            age: char.age || '',
            occupation: char.occupation || '',
            personality: char.personality || '',
            imageUrl: char.image_url
        });
        setCharImageFile(null); // Clear any pending file
        setShowCharModal(true);
    };

    const handleCloseCharModal = () => {
        setShowCharModal(false);
        setEditingCharId(null);
        setCharForm({ name: '', age: '', occupation: '', personality: '', imageUrl: null });
        setCharImageFile(null);
    };

    const handleDeleteCharacter = (charId: string) => {
        setDeleteConfirm({
            isOpen: true,
            title: 'ลบตัวละคร',
            message: 'คุณแน่ใจหรือไม่ว่าต้องการลบตัวละครนี้?',
            onConfirm: async () => {
                setDeleteConfirm(prev => ({ ...prev, isOpen: false }));
                // Optimistic update
                setCharacters(prev => prev.filter(c => c.id !== charId));

                if (isFromDB) {
                    const { error } = await supabase
                        .from('characters')
                        .delete()
                        .eq('id', charId);

                    if (error) {
                        console.error('Failed to delete character:', error);
                        alert('เกิดข้อผิดพลาดในการลบตัวละคร');
                        return;
                    }

                    // Update any chat chapters by converting this character's blocks to narrative
                    try {
                        const { data: chatChapters } = await supabase
                            .from('chapters')
                            .select('id, content')
                            .eq('story_id', storyId)
                            .eq('style', 'chat');

                        if (chatChapters && chatChapters.length > 0) {
                            for (const chapter of chatChapters) {
                                if (!chapter.content) continue;

                                let needsUpdate = false;
                                const parsedContent: MutableChapterContent = typeof chapter.content === 'string'
                                    ? JSON.parse(chapter.content) as MutableChapterContent
                                    : chapter.content as MutableChapterContent;

                                // Nullify POV character if matched
                                if (parsedContent?.povCharacterId === charId) {
                                    parsedContent.povCharacterId = null;
                                    needsUpdate = true;
                                }

                                // Nullify block characterId if matched (converting to narrative)
                                if (parsedContent?.blocks && Array.isArray(parsedContent.blocks)) {
                                    parsedContent.blocks = parsedContent.blocks.map((block) => {
                                        if (block.characterId === charId) {
                                            needsUpdate = true;
                                            return { ...block, characterId: null };
                                        }
                                        return block;
                                    });
                                }

                                if (needsUpdate) {
                                    await supabase
                                        .from('chapters')
                                        .update({
                                            content: typeof chapter.content === 'string'
                                                ? JSON.stringify(parsedContent)
                                                : parsedContent
                                        })
                                        .eq('id', chapter.id);
                                }
                            }
                        }
                    } catch (updateErr) {
                        console.error('Failed to update chapters after char deletion:', updateErr);
                    }
                }
            }
        });
    };

    if (!isMounted || isLoading) {
        return (null);
    }
    if (authError) return (
        <main className={styles.main}>
            <header className={styles.header}>
            </header>
            <div className={styles.content} style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
                <h2>ไม่มีสิทธิ์เข้าถึง</h2>
                <p>คุณไม่สามารถจัดการเรื่องนี้ได้ เนื่องจากคุณไม่ใช่เจ้าของเรื่อง</p>
            </div>
        </main>
    );
    if (!story) return (
        <main className={styles.main}>
            <header className={styles.header}>
            </header>
            <div className={styles.content} style={{ textAlign: 'center', padding: '4rem 2rem', color: '#64748b' }}>
                <h2>ไม่พบข้อมูลเรื่องนี้</h2>
                <p>เรื่องที่คุณค้นหาอาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง</p>
            </div>
        </main>
    );

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div style={{ display: 'flex', gap: '1rem', marginLeft: 'auto' }}>
                    <button className={styles.backBtn}><BarChart2 size={18} /> สถิติ</button>
                    <button className={styles.backBtn} onClick={openEditModal}><Settings size={18} /> แก้ไขข้อมูล</button>
                </div>
            </header>

            {/* Hero Banner */}
            <div className={styles.heroBanner}>
                {(story.coverWideImage || story.coverImage) && (
                    <img src={story.coverWideImage || story.coverImage || ''} alt="Cover Background" className={styles.heroBg} />
                )}
                <div className={styles.heroOverlay}>
                    <div className={styles.heroContent}>
                        {/* Poster Image (Left) */}
                        <div className={styles.heroPosterContainer}>
                            {story.coverImage ? (
                                <img src={story.coverImage} alt={story.title} className={styles.heroPoster} />
                            ) : (
                                <div className={styles.heroPosterPlaceholder}>
                                    <ImageIcon size={48} />
                                </div>
                            )}
                        </div>

                        {/* Story Details (Right) */}
                        <div className={styles.heroDetails}>
                            {/* Optional generic badge */}
                            {story.readCount > 1000 && (
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <span className={styles.badgeTrending}>🔥 TRENDING</span>
                                </div>
                            )}
                            <h1 className={styles.heroTitle}>{story.title}</h1>
                            <p className={styles.heroSubtitle}>
                                {story.category === 'fanfic' ? 'Fanfiction' : 'Original'} · {story.penName}
                            </p>
                            <p className={styles.heroSynopsis}>{story.synopsis}</p>
                            <div className={styles.heroTags}>
                                <span className={styles.tagPill}>{story.category === 'fanfic' ? 'แฟนฟิค' : 'ออริจินัล'}</span>
                                <span className={styles.tagPill}>{story.status === 'published' ? '📢 เผยแพร่แล้ว' : '📄 แบบร่าง'}</span>
                                <span className={styles.tagPill}>{story.completionStatus === 'completed' ? '✅ จบแล้ว' : '📝 ยังไม่จบ'}</span>
                                <span className={styles.tagPill}>{isBranchingStory ? '🎯 ทางเลือกในตอน' : '➡️ Linear'}</span>
                                <span className={styles.tagPill}>👁️ {story.readCount >= 1000 ? `${(story.readCount / 1000).toFixed(1)}K` : story.readCount} Views</span>
                                <span className={styles.tagPill}>❤️ {story.heartCount} Loves</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.content}>
                <section className={styles.storyStatusPanel}>
                    <div className={styles.storyStatusRow}>
                        <div className={styles.storyStatusLabel}>สถานะการเผยแพร่</div>
                        <div className={styles.storyStatusActions}>
                            <button
                                type="button"
                                className={`${styles.storyStatusBtn} ${story.status === 'draft' ? styles.storyStatusActive : ''}`}
                                onClick={() => handleQuickStoryStatusUpdate('draft')}
                                disabled={!isFromDB || isUpdatingStoryStatus || story.status === 'draft'}
                            >
                                แบบร่าง
                            </button>
                            <button
                                type="button"
                                className={`${styles.storyStatusBtn} ${story.status === 'published' ? styles.storyStatusActive : ''}`}
                                onClick={() => handleQuickStoryStatusUpdate('published')}
                                disabled={!isFromDB || isUpdatingStoryStatus || story.status === 'published'}
                            >
                                เผยแพร่แล้ว
                            </button>
                        </div>
                    </div>

                    <div className={styles.storyStatusRow}>
                        <div className={styles.storyStatusLabel}>สถานะความสมบูรณ์เรื่อง</div>
                        <div className={styles.storyStatusActions}>
                            <button
                                type="button"
                                className={`${styles.storyStatusBtn} ${story.completionStatus === 'ongoing' ? styles.storyStatusActive : ''}`}
                                onClick={() => handleQuickStoryStatusUpdate(undefined, 'ongoing')}
                                disabled={!isFromDB || isUpdatingStoryStatus || story.completionStatus === 'ongoing'}
                            >
                                ยังไม่จบ
                            </button>
                            <button
                                type="button"
                                className={`${styles.storyStatusBtn} ${story.completionStatus === 'completed' ? styles.storyStatusActive : ''}`}
                                onClick={() => handleQuickStoryStatusUpdate(undefined, 'completed')}
                                disabled={!isFromDB || isUpdatingStoryStatus || story.completionStatus === 'completed'}
                            >
                                จบแล้ว
                            </button>
                        </div>
                    </div>

                    {isUpdatingStoryStatus && (
                        <p className={styles.storyStatusHint}>กำลังอัปเดตสถานะ...</p>
                    )}
                    {!isFromDB && (
                        <p className={styles.storyStatusHint}>โหมดเดโม: ไม่สามารถปรับสถานะเรื่องได้</p>
                    )}
                </section>

                {/* Characters Section */}
                <div className={styles.actions} style={{ marginTop: '2rem' }}>
                    <h2 className={styles.sectionTitle}>
                        แนะนำตัวละคร ({characters.length})
                    </h2>
                    <button
                        className={styles.addBtn}
                        onClick={handleOpenCreateCharModal}
                    >
                        <Plus size={18} /> เพิ่มตัวละคร
                    </button>
                </div>

                {characters.length > 0 ? (
                    <div className={styles.charactersGrid}>
                        {characters.map((char) => (
                            <div key={char.id} className={styles.characterCard}>
                                <div className={styles.charImageWrap}>
                                    {char.image_url ? (
                                        <img src={char.image_url} alt={char.name} className={styles.charImage} />
                                    ) : (
                                        <div className={styles.charImagePlaceholder}>
                                            <ImageIcon size={24} />
                                        </div>
                                    )}
                                </div>
                                <div className={styles.charInfo}>
                                    <h4 className={styles.charName}>{char.name}</h4>
                                    {char.age && <span className={styles.charDetail}>อายุ: {char.age}</span>}
                                    {char.occupation && <span className={styles.charDetail}>อาชีพ: {char.occupation}</span>}
                                </div>
                                <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', display: 'flex', gap: '0.25rem' }}>
                                    <button
                                        className={styles.editCharBtn}
                                        onClick={() => handleEditCharacter(char)}
                                        title="แก้ไขตัวละคร"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                    <button
                                        className={styles.deleteCharBtn}
                                        onClick={() => handleDeleteCharacter(char.id)}
                                        title="ลบตัวละคร"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyState} style={{ padding: '2rem', minHeight: 'auto', background: 'transparent' }}>
                        <p style={{ color: '#94a3b8', margin: 0 }}>ยังไม่มีการเพิ่มตัวละครแนะนำ</p>
                    </div>
                )}

                {/* Chapters Section */}
                <div className={styles.actions} style={{ marginTop: '2rem' }}>
                    <h2 className={styles.sectionTitle}>
                        สารบัญตอน ({story.chapters.length}) · เผยแพร่แล้ว {publishedCount} ตอน
                    </h2>
                    <button
                        className={styles.addBtn}
                        onClick={handleCreateChapter}
                        disabled={isStoryCompleted}
                        title={isStoryCompleted ? "ตั้งสถานะเรื่องเป็น 'ยังไม่จบ' ก่อนเพิ่มตอนใหม่" : "เพิ่มตอนใหม่"}
                    >
                        <Plus size={18} /> เพิ่มตอนใหม่
                    </button>
                </div>
                {isStoryCompleted && (
                    <p className={styles.completedNotice}>
                        เรื่องนี้ตั้งเป็น &quot;จบแล้ว&quot; อยู่ จึงไม่สามารถเพิ่มตอนใหม่ได้
                    </p>
                )}

                {isBranchingStory && decoratedChapters.length > 0 && (
                    <div className={styles.branchOverviewGrid}>
                        {branchingSections.map((section) => (
                            <section
                                key={section.key}
                                className={`${styles.branchOverviewCard} ${styles[`branchOverviewCard${section.key[0].toUpperCase()}${section.key.slice(1)}`]}`}
                            >
                                <div className={styles.branchOverviewHeader}>
                                    <div>
                                        <h3 className={styles.branchOverviewTitle}>{section.title}</h3>
                                        <p className={styles.branchOverviewSubtitle}>{section.description}</p>
                                    </div>
                                    <span className={styles.branchOverviewCount}>{section.chapters.length}</span>
                                </div>
                                <div className={styles.branchOverviewList}>
                                    {section.chapters.map((chapter) => (
                                        <button
                                            key={chapter.id}
                                            type="button"
                                            className={styles.branchOverviewItem}
                                            onClick={() => handleEditChapter(chapter.id)}
                                        >
                                            <span className={styles.branchOverviewItemTitle}>
                                                ตอน {String(chapters.findIndex((item) => item.id === chapter.id) + 1).padStart(2, '0')} · {chapter.title}
                                            </span>
                                            <span className={styles.branchOverviewItemMeta}>
                                                {chapter.outgoingChoiceCount > 0
                                                    ? `${chapter.outgoingChoiceCount} ทางเลือก`
                                                    : chapter.incomingChoiceCount > 0
                                                        ? `ถูกชี้เข้า ${chapter.incomingChoiceCount} เส้นทาง`
                                                        : chapter.isEntry
                                                            ? 'ตอนเริ่มต้น'
                                                            : 'ยังไม่เชื่อม'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

                {story.chapters.length > 0 ? (
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="chapters-list">
                            {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                                <div
                                    className={`${styles.chapterList} ${snapshot.isDraggingOver ? styles.draggingOver : ''}`}
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                >
                                    {decoratedChapters.map((chapter, index) => (
                                        <Draggable key={chapter.id} draggableId={chapter.id} index={index}>
                                            {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                                                <div
                                                    className={`${styles.chapterItem} ${snapshot.isDragging ? styles.dragging : ''}`}
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    style={provided.draggableProps.style}
                                                >
                                                    <div className={styles.chapterInfo}>
                                                        <div
                                                            {...provided.dragHandleProps}
                                                            className={styles.dragHandle}
                                                        >
                                                            <GripVertical size={20} color="#cbd5e1" />
                                                        </div>
                                                        <div className={styles.chapterNumber}>
                                                            {(index + 1).toString().padStart(2, '0')}
                                                        </div>
                                                        <div>
                                                            <div className={styles.chapterTitle}>{chapter.title}</div>
                                                            <div className={styles.chapterMeta}>
                                                                <span>{chapter.date}</span>
                                                                {chapter.status === 'published' ? (
                                                                    <span className={styles.publishedBadge}>เผยแพร่แล้ว</span>
                                                                ) : (
                                                                    <span className={styles.draftBadge}>ยังไม่เผยแพร่</span>
                                                                )}
                                                                {chapter.hasUnpublishedChanges && (
                                                                    <span className={styles.pendingDraftBadge}>มีฉบับร่างใหม่</span>
                                                                )}
                                                                {chapter.status === 'published' && (
                                                                    <span style={{ marginLeft: '1rem' }}>👁️ {chapter.views} | 💬 {chapter.comments}</span>
                                                                )}
                                                                {chapter.isPremium && (
                                                                    <span style={{ marginLeft: '1rem', color: '#b45309', fontWeight: 700 }}>
                                                                        🔒 ตอนพิเศษ {chapter.coinPrice} เหรียญ
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isBranchingStory && (
                                                                <div className={styles.chapterFlowMeta}>
                                                                    {chapter.isEntry && (
                                                                        <span className={`${styles.chapterFlowPill} ${styles.chapterFlowPillEntry}`}>
                                                                            จุดเริ่มต้น
                                                                        </span>
                                                                    )}
                                                                    {chapter.outgoingChoiceCount > 0 && (
                                                                        <span className={`${styles.chapterFlowPill} ${styles.chapterFlowPillHub}`}>
                                                                            {chapter.outgoingChoiceCount} ทางเลือก
                                                                        </span>
                                                                    )}
                                                                    {chapter.incomingChoiceCount > 0 && (
                                                                        <span className={`${styles.chapterFlowPill} ${styles.chapterFlowPillTarget}`}>
                                                                            ปลายทาง {chapter.incomingChoiceCount} เส้น
                                                                        </span>
                                                                    )}
                                                                    {!chapter.isEntry && chapter.incomingChoiceCount === 0 && chapter.outgoingChoiceCount === 0 && (
                                                                        <span className={`${styles.chapterFlowPill} ${styles.chapterFlowPillUnlinked}`}>
                                                                            ยังไม่เชื่อมใน flow
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            className={styles.iconBtn}
                                                            style={{ color: 'var(--primary)', background: '#ecfdf5', padding: '0.5rem', borderRadius: '8px' }}
                                                            title="แก้ไขตอน"
                                                            onClick={() => handleEditChapter(chapter.id)}
                                                        >
                                                            <Edit3 size={18} />
                                                        </button>
                                                        <button
                                                            className={styles.iconBtn}
                                                            style={{ color: '#ef4444', background: '#fef2f2', padding: '0.5rem', borderRadius: '8px' }}
                                                            title="ลบตอน"
                                                            onClick={() => handleDeleteChapter(chapter.id)}
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                ) : (
                    <div className={styles.emptyState}>
                        <div style={{ color: '#cbd5e1' }}><Edit3 size={48} /></div>
                        <h3>ยังไม่มีตอนในเรื่องนี้</h3>
                        <p>เริ่มเขียนตอนแรกของคุณเพื่อสร้างเรื่องราวให้สมบูรณ์</p>
                        <button
                            className={styles.addBtn}
                            style={{ marginTop: '0.5rem' }}
                            onClick={handleCreateChapter}
                            disabled={isStoryCompleted}
                            title={isStoryCompleted ? "ตั้งสถานะเรื่องเป็น 'ยังไม่จบ' ก่อนเพิ่มตอนใหม่" : "เขียนตอนแรก"}
                        >
                            <Plus size={18} /> เขียนตอนแรก
                        </button>
                    </div>
                )}
            </div>
            {/* Edit Modal */}
            {showEditModal && (
                <div className={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>แก้ไขข้อมูลนิยาย</h2>
                            <button className={styles.iconBtn} onClick={() => setShowEditModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.editHeroCoverPreview}>
                                <div
                                    className={styles.editHeroBackdrop}
                                    style={
                                        editForm.coverWideUrl || editForm.coverUrl
                                            ? { backgroundImage: `url(${editForm.coverWideUrl || editForm.coverUrl})` }
                                            : {}
                                    }
                                >
                                    <div className={styles.editHeroShade} />
                                    <div className={styles.editHeroContent}>
                                        <div className={styles.editHeroPoster}>
                                            {editForm.coverUrl ? (
                                                <div
                                                    className={styles.editHeroPosterImage}
                                                    style={{ backgroundImage: `url(${editForm.coverUrl})` }}
                                                    role="img"
                                                    aria-label="Cover preview"
                                                />
                                            ) : (
                                                <div className={styles.editHeroPosterEmpty}>COVER</div>
                                            )}
                                        </div>
                                        <div className={styles.editHeroText}>
                                            <h3>{editForm.title.trim() || 'ตัวอย่างชื่อเรื่อง'}</h3>
                                            <p>{editForm.penName.trim() || 'นามปากกา'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.editField}>
                                <label>รูปภาพปก (800x800 px)</label>
                                <div className={styles.editCoverContainer}>
                                    <label className={styles.editCoverUpload}>
                                        {editForm.coverUrl ? (
                                            <img src={editForm.coverUrl} alt="Cover Preview" className={styles.editCoverPreview} />
                                        ) : (
                                            <div className={styles.editCoverPlaceholder}>
                                                <ImageIcon size={32} />
                                                <span>อัปโหลดรูปภาพ</span>
                                            </div>
                                        )}
                                        <div className={styles.editCoverOverlay}>
                                            <Upload size={24} />
                                            <span>เปลี่ยนรูปปก</span>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={handleCoverChange}
                                        />
                                    </label>
                                </div>
                                <div className={styles.coverActionRow}>
                                    <button
                                        type="button"
                                        className={styles.unsplashPickerBtn}
                                        onClick={() => openUnsplashPicker('cover')}
                                    >
                                        <Search size={15} />
                                        เลือกรูปจาก Unsplash
                                    </button>
                                    {editForm.coverUrl && (
                                        <button
                                            type="button"
                                            className={styles.clearCoverBtn}
                                            onClick={() => {
                                                setEditForm((prev) => ({ ...prev, coverUrl: null }));
                                                setEditCoverFile(null);
                                            }}
                                        >
                                            ลบรูปปก
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles.editField}>
                                <label>รูปภาพปกแนวกว้างสำหรับหน้าแรก (แนะนำ 1600x900)</label>
                                <div className={styles.editCoverContainer}>
                                    <label className={styles.editWideCoverUpload}>
                                        {editForm.coverWideUrl ? (
                                            <img src={editForm.coverWideUrl} alt="Wide Cover Preview" className={styles.editCoverPreview} />
                                        ) : (
                                            <div className={styles.editCoverPlaceholder}>
                                                <ImageIcon size={28} />
                                                <span>อัปโหลดภาพแนวกว้าง</span>
                                            </div>
                                        )}
                                        <div className={styles.editCoverOverlay}>
                                            <Upload size={22} />
                                            <span>เปลี่ยนภาพกว้าง</span>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={handleWideCoverChange}
                                        />
                                    </label>
                                </div>
                                <div className={styles.coverActionRow}>
                                    <button
                                        type="button"
                                        className={styles.unsplashPickerBtn}
                                        onClick={() => openUnsplashPicker('wide')}
                                    >
                                        <Search size={15} />
                                        เลือกภาพแนวกว้างจาก Unsplash
                                    </button>
                                    {editForm.coverWideUrl && (
                                        <button
                                            type="button"
                                            className={styles.clearCoverBtn}
                                            onClick={() => {
                                                setEditForm((prev) => ({ ...prev, coverWideUrl: null }));
                                                setEditCoverWideFile(null);
                                            }}
                                        >
                                            ลบรูปปกแนวกว้าง
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles.editField}>
                                <label>ชื่อเรื่อง</label>
                                <input
                                    type="text"
                                    value={editForm.title}
                                    onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                                    className={styles.editInput}
                                />
                            </div>

                            <div className={styles.editField}>
                                <label>นามปากกา</label>
                                <input
                                    type="text"
                                    value={editForm.penName}
                                    onChange={e => setEditForm(f => ({ ...f, penName: e.target.value }))}
                                    className={styles.editInput}
                                />
                            </div>

                            <div className={styles.editField}>
                                <label>ประเภทผลงาน</label>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button
                                        type="button"
                                        className={`${styles.editCategoryBtn} ${editForm.category === 'original' ? styles.editCategoryActive : ''}`}
                                        onClick={() => setEditForm(f => ({ ...f, category: 'original' }))}
                                    >
                                        ออริจินัล
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.editCategoryBtn} ${editForm.category === 'fanfic' ? styles.editCategoryActive : ''}`}
                                        onClick={() => setEditForm(f => ({ ...f, category: 'fanfic' }))}
                                    >
                                        แฟนฟิค
                                    </button>
                                </div>
                            </div>

                            {BRANCHING_FEATURE_ENABLED && (
                                <div className={styles.editField}>
                                    <label>รูปแบบการเล่าเรื่อง</label>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <button
                                            type="button"
                                            className={`${styles.editCategoryBtn} ${editForm.pathMode === 'branching' ? styles.editCategoryActive : ''}`}
                                            onClick={() => setEditForm(f => ({ ...f, pathMode: 'branching' }))}
                                        >
                                            เส้นทางแตกแขนงข้ามตอน
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.editCategoryBtn} ${editForm.pathMode === 'linear' ? styles.editCategoryActive : ''}`}
                                            onClick={() => setEditForm(f => ({ ...f, pathMode: 'linear' }))}
                                        >
                                            เส้นเดียวตามลำดับตอน
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className={styles.editField}>
                                <label>หมวดหมู่หลัก <span style={{ color: '#ef4444' }}>*</span></label>
                                <select
                                    className={styles.editInput}
                                    value={editForm.mainCategory}
                                    onChange={(e) => {
                                        setEditForm(prev => ({
                                            ...prev,
                                            mainCategory: e.target.value,
                                            subCategory: '' // Reset sub category
                                        }));
                                    }}
                                    required
                                >
                                    <option value="" disabled>เลือกหมวดหมู่หลัก</option>
                                    {MAIN_CATEGORIES.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>

                            {editForm.mainCategory && (
                                <div className={styles.editField}>
                                    <label>หมวดหมู่ <span style={{ color: '#ef4444' }}>*</span></label>
                                    <select
                                        className={styles.editInput}
                                        value={editForm.subCategory}
                                        onChange={(e) => setEditForm(f => ({ ...f, subCategory: e.target.value }))}
                                        required
                                    >
                                        <option value="" disabled>เลือกหมวดหมู่ย่อย</option>
                                        {SUB_CATEGORIES.filter(sub => sub.mainCategoryId === editForm.mainCategory).map(sub => (
                                            <option key={sub.id} value={sub.id}>{sub.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className={styles.editField}>
                                <label>คำโปรย / เรื่องย่อ</label>
                                <textarea
                                    value={editForm.synopsis}
                                    onChange={e => setEditForm(f => ({ ...f, synopsis: e.target.value }))}
                                    className={styles.editTextarea}
                                    rows={4}
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={() => setShowEditModal(false)}>
                                ยกเลิก
                            </button>
                            <button className={styles.saveBtn} onClick={handleSaveEdit} disabled={isSaving || !isFromDB}>
                                {isSaving ? (
                                    <><Loader2 size={16} className={styles.spinner} /> กำลังบันทึก...</>
                                ) : (
                                    <><Save size={16} /> บันทึกการเปลี่ยนแปลง</>
                                )}
                            </button>
                        </div>

                        {!isFromDB && (
                            <p style={{ textAlign: 'center', color: '#f59e0b', fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
                                ⚠️ นี่คือข้อมูลตัวอย่าง (Demo) ไม่สามารถแก้ไขได้
                            </p>
                        )}
                    </div>
                </div>
            )}

            {showUnsplashModal && (
                <div className={styles.modalOverlay} onClick={() => setShowUnsplashModal(false)}>
                    <div className={`${styles.modal} ${styles.unsplashModal}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>
                                {unsplashTarget === 'wide' ? 'เลือกภาพปกแนวกว้างจาก Unsplash' : 'เลือกรูปปกจาก Unsplash'}
                            </h2>
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
                                        unsplashTarget === 'wide'
                                            ? 'เช่น cinematic anime landscape, fantasy sky'
                                            : 'เช่น fantasy book cover, mystery, anime portrait'
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
                                        onClick={() => handleSelectUnsplashCover(image)}
                                    >
                                        <img
                                            src={image.thumb}
                                            alt={image.alt}
                                            className={`${styles.unsplashThumb} ${unsplashTarget === 'wide' ? styles.unsplashThumbWide : ''}`}
                                        />
                                        <span className={styles.unsplashCredit}>by {image.author}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Character Add/Edit Modal */}
            {showCharModal && (
                <div className={styles.modalOverlay} onClick={handleCloseCharModal}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{editingCharId ? 'แก้ไขตัวละคร' : 'เพิ่มตัวละครใหม่'}</h2>
                            <button className={styles.iconBtn} onClick={handleCloseCharModal}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.editCoverContainer} style={{ aspectRatio: '1/1', width: '150px', height: '150px', margin: '0 auto 1.5rem', borderRadius: '50%' }}>
                                <label className={styles.editCoverUpload} style={{ borderRadius: '50%' }}>
                                    {charForm.imageUrl ? (
                                        <img src={charForm.imageUrl} alt="Character Preview" className={styles.editCoverPreview} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                                    ) : (
                                        <div className={styles.editCoverPlaceholder} style={{ borderRadius: '50%' }}>
                                            <ImageIcon size={24} />
                                            <span style={{ fontSize: '0.75rem', marginTop: '4px' }}>รูปตัวละคร</span>
                                        </div>
                                    )}
                                    <div className={styles.editCoverOverlay} style={{ borderRadius: '50%' }}>
                                        <Upload size={20} />
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={handleCharImageChange}
                                    />
                                </label>
                            </div>

                            <div className={styles.editField}>
                                <label>ชื่อตัวละคร <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    type="text"
                                    value={charForm.name}
                                    onChange={e => setCharForm(f => ({ ...f, name: e.target.value }))}
                                    className={styles.editInput}
                                    placeholder="เช่น: อลัน, มารีอา"
                                    required
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className={styles.editField}>
                                    <label>อายุ</label>
                                    <input
                                        type="text"
                                        value={charForm.age}
                                        onChange={e => setCharForm(f => ({ ...f, age: e.target.value }))}
                                        className={styles.editInput}
                                        placeholder="เช่น: 24 ปี"
                                    />
                                </div>
                                <div className={styles.editField}>
                                    <label>อาชีพ</label>
                                    <input
                                        type="text"
                                        value={charForm.occupation}
                                        onChange={e => setCharForm(f => ({ ...f, occupation: e.target.value }))}
                                        className={styles.editInput}
                                        placeholder="เช่น: นักผจญภัย"
                                    />
                                </div>
                            </div>

                            <div className={styles.editField}>
                                <label>ลักษณะนิสัย / อุปนิสัย</label>
                                <textarea
                                    value={charForm.personality}
                                    onChange={e => setCharForm(f => ({ ...f, personality: e.target.value }))}
                                    className={styles.editTextarea}
                                    rows={3}
                                    placeholder="บรรยายลักษณะนิสัยสั้นๆ..."
                                />
                            </div>
                        </div>

                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={handleCloseCharModal}>ยกเลิก</button>
                            <button className={styles.saveBtn} onClick={handleSaveCharacter} disabled={isSavingChar}>
                                {isSavingChar ? (
                                    <><Loader2 size={16} className={styles.spinner} /> กำลังบันทึก...</>
                                ) : (
                                    <><Save size={16} /> บันทึกตัวละคร</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirm Modal */}
            {deleteConfirm.isOpen && (
                <div className={styles.modalOverlay} onClick={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>{deleteConfirm.title}</h2>
                            <button className={styles.iconBtn} onClick={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <p style={{ margin: 0, color: '#475569' }}>{deleteConfirm.message}</p>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}>ยกเลิก</button>
                            <button
                                className={styles.saveBtn}
                                style={{ backgroundColor: '#ef4444' }}
                                onClick={deleteConfirm.onConfirm}
                            >
                                <X size={16} /> ยืนยันการลบ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
