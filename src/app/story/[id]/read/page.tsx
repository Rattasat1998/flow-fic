'use client';

import { useState, useRef, useEffect, useMemo, use, useCallback } from 'react';

import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatActionBar } from '@/components/chat/ChatActionBar';
import { ChatMessage } from '@/types/chat';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { List, Heart, Bookmark, BookmarkCheck, MoreVertical, X, Send, Lock, Coins } from 'lucide-react';
import styles from './story.module.css';
import { supabase } from '@/lib/supabase';
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
  writing_style: string;
  settings: unknown;
  status: string;
  user_id: string;
};

type DBChapter = {
  id: string;
  title: string;
  draft_title: string | null;
  published_title: string | null;
  content: unknown;
  draft_content: unknown;
  published_content: unknown;
  order_index: number;
  is_premium: boolean;
  coin_price: number;
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
  isPremium: boolean;
  coinPrice: number;
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

type StorySettings = {
  allowComments: boolean;
  hideHeartCount: boolean;
};

type VipEntitlementRow = {
  status: string;
  current_period_end: string | null;
};

type ChapterUnlockRow = {
  chapter_id: string;
};

const defaultStorySettings: StorySettings = {
  allowComments: true,
  hideHeartCount: false,
};

const normalizeStorySettings = (settings: unknown): StorySettings => {
  if (!settings || typeof settings !== 'object') return defaultStorySettings;

  const raw = settings as Record<string, unknown>;
  return {
    allowComments: typeof raw.allowComments === 'boolean' ? raw.allowComments : defaultStorySettings.allowComments,
    hideHeartCount: typeof raw.hideHeartCount === 'boolean' ? raw.hideHeartCount : defaultStorySettings.hideHeartCount,
  };
};

const fallbackAvatar = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=200&q=80';

const parseChapterBlocks = (content: unknown): { povCharacterId: string | null; blocks: Block[]; chatTheme: string } => {
  if (!content) return { povCharacterId: null, blocks: [], chatTheme: 'white' };

  if (typeof content === 'object' && content !== null && 'blocks' in content) {
    const parsedContent = content as Record<string, unknown>;
    const parsedBlocks = Array.isArray(parsedContent.blocks) ? (parsedContent.blocks as Block[]) : [];
    return {
      povCharacterId: typeof parsedContent.povCharacterId === 'string' ? parsedContent.povCharacterId : null,
      blocks: parsedBlocks,
      chatTheme: typeof parsedContent.chatTheme === 'string' ? parsedContent.chatTheme : 'white',
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

  if (!textToParse) return { povCharacterId: null, blocks: [], chatTheme: 'white' };

  return {
    povCharacterId: null,
    chatTheme: 'white',
    blocks: textToParse.split('\n').filter(line => line.trim() !== '').map((line, idx) => ({
      id: `legacy-${idx}`,
      type: 'paragraph',
      text: line,
      characterId: null
    }))
  };
};

export default function StoryPage({ params }: StoryPageProps) {
  const unwrappedParams = use(params);
  const storyId = unwrappedParams.id;
  const { user } = useAuth();
  const { trackEvent } = useTracking({ autoPageView: true, pagePath: `/story/${storyId}/read`, storyId });

  const [messages, setMessages] = useState<ReaderChatMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dbStory, setDbStory] = useState<DBStory | null>(null);
  const searchParams = useSearchParams();
  const initialChapterParam = searchParams.get('chapter');
  const parsedInitialChapterIndex = initialChapterParam ? parseInt(initialChapterParam, 10) : 0;
  const initialChapterIndex = Number.isFinite(parsedInitialChapterIndex) && parsedInitialChapterIndex >= 0
    ? parsedInitialChapterIndex
    : 0;
  const isPreviewMode = searchParams.get('preview') === '1';
  const previewChapterId = searchParams.get('previewChapter');

  const [dbChapters, setDbChapters] = useState<ReaderChapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(initialChapterIndex);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  const [vipEntitlement, setVipEntitlement] = useState<VipEntitlementRow | null>(null);
  const [unlockedChapterIds, setUnlockedChapterIds] = useState<string[]>([]);
  const [isUnlockingChapterId, setIsUnlockingChapterId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReaderStory = async () => {
      setIsLoading(true);
      setLoadError('');

      // Fetch Story
      let storyQuery = supabase
        .from('stories')
        .select('id, title, pen_name, cover_url, writing_style, settings, status, user_id')
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

      // Fetch Characters
      const { data: charsData } = await supabase
        .from('characters')
        .select('id, name, image_url')
        .eq('story_id', storyId)
        .order('order_index', { ascending: true });

      if (charsData) {
        setCharacters(charsData);
      }

      // Fetch Chapters
      let chapterQuery = supabase
        .from('chapters')
        .select('id, title, draft_title, published_title, content, draft_content, published_content, order_index, is_premium, coin_price')
        .eq('story_id', storyId);

      if (isPreviewMode) {
        if (previewChapterId) {
          chapterQuery = chapterQuery.eq('id', previewChapterId);
        }
      } else {
        chapterQuery = chapterQuery.eq('status', 'published');
      }

      const { data: chapterData, error: chapterError } = await chapterQuery
        .order('order_index', { ascending: true });

      if (chapterError) {
        setLoadError('ไม่สามารถโหลดตอนของเรื่องนี้ได้');
        setIsLoading(false);
        return;
      }

      const parsedChapters = ((chapterData as DBChapter[]) || []).map(chapter => {
        const sourceTitle = isPreviewMode
          ? (chapter.draft_title || chapter.title || chapter.published_title || 'ไม่มีชื่อ')
          : (chapter.published_title || chapter.title);
        const sourceContent = isPreviewMode
          ? (chapter.draft_content ?? chapter.content ?? chapter.published_content)
          : (chapter.published_content ?? chapter.content);
        const parsedContent = parseChapterBlocks(sourceContent);

        return {
          id: chapter.id,
          title: sourceTitle,
          povCharacterId: parsedContent.povCharacterId,
          blocks: parsedContent.blocks,
          chatTheme: parsedContent.chatTheme,
          isPremium: !!chapter.is_premium,
          coinPrice: Math.max(0, chapter.coin_price || 0),
        };
      });

      if (!isPreviewMode && user) {
        const [{ data: walletData }, { data: vipData }, { data: unlockRows }] = await Promise.all([
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
        ]);

        setCoinBalance(walletData?.coin_balance || 0);
        setVipEntitlement((vipData as VipEntitlementRow | null) || null);
        setUnlockedChapterIds(((unlockRows as ChapterUnlockRow[] | null) || []).map((row) => row.chapter_id));
      } else {
        setCoinBalance(0);
        setVipEntitlement(null);
        setUnlockedChapterIds([]);
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
        // Fetch comments
        const { data: commentsData } = await supabase
          .from('comments')
          .select('id, user_id, content, created_at, profiles(pen_name, avatar_url)')
          .eq('story_id', storyId)
          .order('created_at', { ascending: true })
          .limit(100);

        setComments((commentsData as unknown as CommentRow[]) || []);
      } else {
        setComments([]);
        setShowComments(false);
      }

      setDbStory(storyData as DBStory);
      setDbChapters(parsedChapters);
      setMessages([]);
      setCurrentIndex(0);
      setIsUnlockingChapterId(null);
      setUnlockError(null);
      if (previewChapterId) {
        setSelectedChapterIndex(0);
      } else {
        setSelectedChapterIndex(Math.min(initialChapterIndex, Math.max(parsedChapters.length - 1, 0)));
      }
      setIsLoading(false);
    };

    fetchReaderStory();
  }, [storyId, user, isPreviewMode, previewChapterId, initialChapterIndex]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isStoryOwner = !!user && dbStory?.user_id === user.id;
  const isVipActive = useMemo(() => {
    if (!vipEntitlement) return false;
    return vipEntitlement.status === 'active';
  }, [vipEntitlement]);

  const unlockedChapterIdSet = useMemo(() => new Set(unlockedChapterIds), [unlockedChapterIds]);

  const canReadChapter = useCallback((chapter: ReaderChapter | null | undefined) => {
    if (!chapter) return false;
    if (isPreviewMode || isStoryOwner) return true;
    if (!chapter.isPremium || chapter.coinPrice <= 0) return true;
    if (isVipActive) return true;
    return unlockedChapterIdSet.has(chapter.id);
  }, [isPreviewMode, isStoryOwner, isVipActive, unlockedChapterIdSet]);

  const activeWritingStyle = dbStory?.writing_style || 'narrative';
  const isChatStyle = activeWritingStyle === 'chat';
  const activeChatThemeClass = useMemo(() => {
    const rawTheme = (dbChapters[selectedChapterIndex]?.chatTheme || 'white').toLowerCase();
    if (rawTheme === 'pink' || rawTheme === 'mint' || rawTheme === 'midnight') return rawTheme;
    if (rawTheme === 'dark') return 'midnight';
    return 'light';
  }, [dbChapters, selectedChapterIndex]);

  const activeStory = dbStory
    ? { title: dbStory.title, characterName: dbStory.pen_name, avatarUrl: dbStory.cover_url || fallbackAvatar }
    : null;

  const chatScript = useMemo<ReaderChatMessage[]>(() => {
    if (!isChatStyle) return [];

    const chapter = dbChapters[selectedChapterIndex];
    if (!chapter) return [];

    const chapterTitleMessage: ReaderChatMessage = {
      id: `${chapter.id}_title`,
      sender: 'system',
      text: `${selectedChapterIndex + 1}: ${chapter.title}`,
      timestamp: selectedChapterIndex * 2 + 1,
      chapterId: chapter.id,
      chapterIndex: selectedChapterIndex,
    };

    const contentMessages: ReaderChatMessage[] = chapter.blocks.map((block, blockIdx) => {
      let sender: 'character' | 'player' | 'system' = 'character';
      if (!block.characterId) {
        sender = 'system';
      } else if (block.characterId === chapter.povCharacterId) {
        sender = 'player';
      }

      return {
        id: `${chapter.id}_block_${block.id || blockIdx}`,
        sender,
        text: block.text,
        timestamp: selectedChapterIndex * 1000 + blockIdx,
        type: block.type,
        imageUrl: block.imageUrl,
        characterId: block.characterId,
        chapterId: chapter.id,
        chapterIndex: selectedChapterIndex,
      };
    });

    return [chapterTitleMessage, ...contentMessages];
  }, [isChatStyle, dbChapters, selectedChapterIndex]);

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

  const handleUnlockChapter = async (chapter: ReaderChapter) => {
    if (!user) {
      alert('กรุณาเข้าสู่ระบบก่อนปลดล็อกตอนพิเศษ');
      return;
    }

    if (!chapter.isPremium || chapter.coinPrice <= 0 || canReadChapter(chapter)) {
      return;
    }

    setUnlockError(null);
    setIsUnlockingChapterId(chapter.id);

    const { data, error } = await supabase.rpc('unlock_premium_chapter', {
      p_chapter_id: chapter.id,
    });

    setIsUnlockingChapterId(null);

    if (error) {
      setUnlockError('ปลดล็อกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      return;
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
      if (typeof result?.new_balance === 'number') {
        setCoinBalance(result.new_balance);
      }
      return;
    }

    setUnlockedChapterIds((prev) => (prev.includes(chapter.id) ? prev : [...prev, chapter.id]));
    if (typeof result.new_balance === 'number') {
      setCoinBalance(result.new_balance);
    }
    trackEvent('chapter_unlock', `/story/${storyId}/read`, {
      storyId,
      chapterId: chapter.id,
      metadata: { coin_price: chapter.coinPrice, method: result.message === 'UNLOCKED_BY_VIP' ? 'vip' : 'coins' },
    });
  };

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
  const showPremiumGate = !!currentChapter && !canReadChapter(currentChapter);

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
            onClick={() => handleUnlockChapter(currentChapter)}
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
              <button
                className={styles.readerNavAction}
                title="สารบัญ"
                onClick={() => setIsTocOpen(!isTocOpen)}
              >
                <List size={20} />
                <span>สารบัญ</span>
              </button>
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
                <div className={styles.readerMeta}>
                  เรื่อง : {activeStory.title}
                </div>

                <div className={styles.readerAuthor}>โดย : {activeStory.characterName}</div>

                {activeStory.avatarUrl && activeStory.avatarUrl !== fallbackAvatar && (
                  <img src={activeStory.avatarUrl} alt="Story Typography/Cover" className={styles.readerCover} />
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

                {isCurrentChapterLocked ? (
                  premiumGateJSX
                ) : (
                  <article className={styles.readerContent}>
                    {dbChapters[selectedChapterIndex].blocks.length > 0 ? (
                      dbChapters[selectedChapterIndex].blocks.map((block: Block, idx: number) => {
                        const char = block.characterId ? characters.find(c => c.id === block.characterId) : null;

                        if (char) {
                          return (
                            <div key={block.id || idx} className={styles.readerBlock} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                              {char.image_url ? (
                                <img src={char.image_url} alt={char.name} className={styles.readerBlockAvatar} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b', flexShrink: 0 }}>
                                  {char.name.charAt(0)}
                                </div>
                              )}
                              <div className={styles.readerBlockTextWrapper} style={{ backgroundColor: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '0 12px 12px 12px', flexGrow: 1 }}>
                                <div className={styles.readerBlockCharName} style={{ fontSize: '0.875rem', fontWeight: 600, color: '#3b82f6', marginBottom: '0.25rem' }}>{char.name}</div>
                                {block.type === 'image' && block.imageUrl ? (
                                  <img
                                    src={block.imageUrl}
                                    alt={`Image by ${char.name}`}
                                    style={{ width: '100%', maxWidth: '560px', maxHeight: '460px', objectFit: 'contain', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff' }}
                                  />
                                ) : (
                                  <p style={{ margin: 0, lineHeight: 1.6 }}>{block.text}</p>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (block.type === 'image' && block.imageUrl) {
                          return (
                            <div key={block.id || idx} style={{ marginBottom: '1.2rem', display: 'flex', justifyContent: 'center' }}>
                              <img
                                src={block.imageUrl}
                                alt="Story image"
                                style={{ width: '100%', maxWidth: '640px', maxHeight: '500px', objectFit: 'contain', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff' }}
                              />
                            </div>
                          );
                        }

                        return <p key={block.id || idx} style={{ marginBottom: '1rem', lineHeight: 1.8 }}>{block.text}</p>;
                      })
                    ) : (
                      <p>ตอนนี้ยังไม่มีเนื้อหา</p>
                    )}
                  </article>
                )}

                <div className={styles.chapterNav} style={{ marginTop: '3rem', width: '100%', maxWidth: '400px' }}>
                  <button
                    type="button"
                    className={styles.chapterNavBtn}
                    onClick={() => {
                      setUnlockError(null);
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
                      setSelectedChapterIndex((prev: number) => Math.min(prev + 1, dbChapters.length - 1));
                    }}
                    disabled={selectedChapterIndex === dbChapters.length - 1}
                  >
                    ตอนถัดไป
                  </button>
                </div>

                {/* Comment Section */}
                {storySettings.allowComments && !isCurrentChapterLocked && commentSectionJSX}
              </>
            )}
          </main>

        </>
      )}
      {isTocOpen && (
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
                      setSelectedChapterIndex(idx);
                      setMessages([]);
                      setCurrentIndex(0);
                      setIsTocOpen(false);
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
      </div>
    </div>
  );
}
