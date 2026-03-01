'use client';

import { useState, useRef, useEffect, useMemo, use } from 'react';

import { MOCK_STORIES } from '@/lib/dummy-data';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatActionBar } from '@/components/chat/ChatActionBar';
import { ChatMessage } from '@/types/chat';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Home, List, Type, BookmarkPlus, Bookmark, MoreVertical, ArrowLeft, X } from 'lucide-react';
import styles from './story.module.css';
import { supabase } from '@/lib/supabase';

interface StoryPageProps {
  params: Promise<{ id: string }>;
}

type DBStory = {
  id: string;
  title: string;
  pen_name: string;
  cover_url: string | null;
  writing_style: string;
};

type DBChapter = {
  id: string;
  title: string;
  content: unknown;
  order_index: number;
};

// New Block Types
type Block = {
  id: string;
  type: 'paragraph';
  text: string;
  characterId: string | null;
};

type Character = {
  id: string;
  name: string;
  image_url: string | null;
};

type ReaderChapter = {
  id: string;
  title: string;
  blocks: Block[];
};

const fallbackAvatar = 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=200&q=80';

const parseChapterBlocks = (content: unknown): Block[] => {
  if (!content) return [];

  // If it's the new block format
  if (typeof content === 'object' && 'blocks' in (content as any)) {
    return (content as any).blocks as Block[];
  }

  // Legacy format migration
  let textToParse = '';
  if (typeof content === 'string') {
    textToParse = content;
  } else if (typeof content === 'object' && 'text' in (content as any)) {
    textToParse = (content as any).text;
  }

  if (!textToParse) return [];

  return textToParse.split('\n').filter(line => line.trim() !== '').map((line, idx) => ({
    id: `legacy-${idx}`,
    type: 'paragraph',
    text: line,
    characterId: null
  }));
};

export default function StoryPage({ params }: StoryPageProps) {
  const unwrappedParams = use(params);
  const storyId = unwrappedParams.id;
  const mockStory = MOCK_STORIES.find(s => s.id === storyId) || null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAiMode, setIsAiMode] = useState(false);
  const [isLoading, setIsLoading] = useState(!mockStory);
  const [loadError, setLoadError] = useState('');
  const [dbStory, setDbStory] = useState<DBStory | null>(null);
  const searchParams = useSearchParams();
  const initialChapterParam = searchParams.get('chapter');
  const initialChapterIndex = initialChapterParam ? parseInt(initialChapterParam, 10) : 0;

  const [dbChapters, setDbChapters] = useState<ReaderChapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(initialChapterIndex);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mockStory) {
      return;
    }

    const fetchReaderStory = async () => {
      setIsLoading(true);
      setLoadError('');

      // Fetch Story
      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .select('id, title, pen_name, cover_url, writing_style, status')
        .eq('id', storyId)
        .eq('status', 'published')
        .single();

      if (storyError || !storyData) {
        setLoadError('ไม่พบเรื่องนี้ หรือยังไม่ได้เผยแพร่');
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

      // Fetch Chapters
      const { data: chapterData, error: chapterError } = await supabase
        .from('chapters')
        .select('id, title, content, order_index')
        .eq('story_id', storyId)
        .eq('status', 'published')
        .order('order_index', { ascending: true });

      if (chapterError) {
        setLoadError('ไม่สามารถโหลดตอนของเรื่องนี้ได้');
        setIsLoading(false);
        return;
      }

      const parsedChapters = ((chapterData as DBChapter[]) || []).map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        blocks: parseChapterBlocks(chapter.content),
      }));

      setDbStory(storyData as DBStory);
      setDbChapters(parsedChapters);
      setMessages([]);
      setCurrentIndex(0);
      setIsAiMode(false);
      setSelectedChapterIndex(initialChapterIndex);
      setIsLoading(false);
    };

    fetchReaderStory();
  }, [mockStory, storyId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const activeWritingStyle = mockStory ? 'chat' : (dbStory?.writing_style || 'narrative');
  const isChatStyle = activeWritingStyle === 'chat';

  const activeStory = mockStory
    ? { title: mockStory.title, characterName: mockStory.character.name, avatarUrl: mockStory.character.avatarUrl }
    : dbStory
      ? { title: dbStory.title, characterName: dbStory.pen_name, avatarUrl: dbStory.cover_url || fallbackAvatar }
      : null;

  const chatScript = useMemo<ChatMessage[]>(() => {
    if (mockStory) {
      return mockStory.script;
    }

    return dbChapters.flatMap((chapter: ReaderChapter, idx: number) => {
      const chapterTitleMessage: ChatMessage = {
        id: `${chapter.id}_title`,
        sender: 'system',
        text: `${idx + 1}: ${chapter.title}`,
        timestamp: idx * 2 + 1,
      };

      // In chat mode, we can optionally parse blocks into separate messages...
      // For now, if someone creates a chat story via the new editor, we combine or map blocks.
      const contentMessage: ChatMessage = {
        id: `${chapter.id}_content`,
        sender: 'character',
        text: chapter.blocks.length > 0 ? chapter.blocks.map(b => b.text).join('\n') : 'ตอนนี้ยังไม่มีเนื้อหา',
        timestamp: idx * 2 + 2,
      };

      return [chapterTitleMessage, contentMessage];
    });
  }, [mockStory, dbChapters]);

  const handleNextLine = () => {
    if (!activeStory || !isChatStyle) return;
    if (currentIndex < chatScript.length) {
      setMessages((prev: ChatMessage[]) => [...prev, chatScript[currentIndex]]);
      setCurrentIndex((prev: number) => prev + 1);
    }
  };

  const handleSendPlayerMessage = (text: string) => {
    const newMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      sender: 'player',
      text,
      timestamp: Date.now(),
    };

    setMessages((prev: ChatMessage[]) => [...prev, newMessage]);

    setTimeout(() => {
      const aiResponse: ChatMessage = {
        id: `msg_ai_${Date.now()}`,
        sender: 'character',
        text: 'ฉันกำลังประมวลผลคำตอบของคุณนะ... (AI Placeholder)',
        emotion: 'surprised',
        timestamp: Date.now(),
      };
      setMessages((prev: ChatMessage[]) => [...prev, aiResponse]);
    }, 1500);
  };

  const toggleAiMode = () => {
    setIsAiMode(!isAiMode);
    setMessages((prev: ChatMessage[]) => [
      ...prev,
      {
        id: `sys_${Date.now()}`,
        sender: 'system',
        text: !isAiMode ? 'Switched to AI Interactive Mode' : 'Switched to Story Mode',
        timestamp: Date.now(),
      }
    ]);
  };

  if (isLoading) {
    return (
      <main className={styles.main}>
        <div className={styles.emptyState}>กำลังโหลดข้อมูลเรื่อง...</div>
      </main>
    );
  }

  if (!activeStory || (!mockStory && loadError)) {
    return (
      <main className={styles.main}>
        <div className={styles.emptyState}>{loadError || 'ไม่พบข้อมูลเรื่อง'}</div>
      </main>
    );
  }

  return (
    <div className={isChatStyle ? styles.main : styles.readerLayout}>
      {isChatStyle ? (
        <>
          <header className={styles.header}>
            <div className={styles.headerContent}>
              <img src={activeStory.avatarUrl} alt={activeStory.characterName} className={styles.headerAvatar} />
              <div>
                <h1>{activeStory.characterName}</h1>
                <p>จากเรื่อง: {activeStory.title} · แชท</p>
              </div>
            </div>
          </header>
          <div className={styles.chatContainer}>
            {messages.length === 0 ? (
              <div className={styles.emptyState}>
                แตะปุ่มด้านล่างเพื่อเริ่มอ่าน {activeStory.title}
              </div>
            ) : (
              messages.map((msg: ChatMessage) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  character={{ id: 'reader-char', name: activeStory.characterName, avatarUrl: activeStory.avatarUrl }}
                />
              ))
            )}
            <div ref={messagesEndRef} className={styles.scrollAnchor} />
          </div>

          <ChatActionBar
            onNextLine={handleNextLine}
            onSendPlayerMessage={handleSendPlayerMessage}
            isAiMode={isAiMode}
            toggleAiMode={toggleAiMode}
          />
        </>
      ) : (
        <>
          {/* Reader Top Navbar */}
          <nav className={styles.readerNavbar}>
            <div className={styles.readerNavLeft}>
              <Link href={`/story/${storyId}`} className={styles.readerNavHome}>
                <ArrowLeft size={20} />
                <span>หน้านิยาย</span>
              </Link>
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
              <button className={styles.readerNavAction} title="ตั้งค่าอ่าน">
                <Type size={20} />
                <span>ตั้งค่าอ่าน</span>
              </button>
              <button className={styles.readerNavAction} title="เพิ่มเข้าชั้น">
                <BookmarkPlus size={20} />
                <span>เพิ่มเข้าชั้น</span>
              </button>
              <button className={styles.readerNavAction} title="บุ๊กมาร์ก">
                <Bookmark size={20} />
                <span>บุ๊กมาร์ก</span>
              </button>
              <button className={styles.readerNavAction} title="เพิ่มเติม">
                <MoreVertical size={20} />
              </button>
            </div>
          </nav>

          <main className={styles.readerContainer}>
            {dbChapters.length === 0 ? (
              <div className={styles.emptyState}>เรื่องนี้ยังไม่มีตอนที่เผยแพร่</div>
            ) : (
              <>
                <div className={styles.readerMeta}>
                  เรื่อง : {activeStory.title} | อ่านฟรีจนจบ
                </div>

                <h1 className={styles.readerChapterTitle}>{dbChapters[selectedChapterIndex].title}</h1>
                <div className={styles.readerAuthor}>โดย : {activeStory.characterName}</div>

                {activeStory.avatarUrl && activeStory.avatarUrl !== fallbackAvatar && (
                  <img src={activeStory.avatarUrl} alt="Story Typography/Cover" className={styles.readerCover} />
                )}

                <div className={styles.readerChapterLabel}>
                  {dbChapters[selectedChapterIndex].title} <MoreVertical size={16} color="#cbd5e1" />
                </div>

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
                              <div className={styles.readerBlockAvatarPlaceholder} style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b', flexShrink: 0 }}>
                                {char.name.charAt(0)}
                              </div>
                            )}
                            <div className={styles.readerBlockTextWrapper} style={{ backgroundColor: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '0 12px 12px 12px', flexGrow: 1 }}>
                              <div className={styles.readerBlockCharName} style={{ fontSize: '0.875rem', fontWeight: 600, color: '#3b82f6', marginBottom: '0.25rem' }}>{char.name}</div>
                              <p style={{ margin: 0, lineHeight: 1.6 }}>{block.text}</p>
                            </div>
                          </div>
                        );
                      }

                      return <p key={block.id || idx} style={{ marginBottom: '1rem', lineHeight: 1.8 }}>{block.text}</p>;
                    })
                  ) : (
                    <p>ตอนนี้ยังไม่มีเนื้อหา</p>
                  )}
                </article>

                <div className={styles.chapterNav} style={{ marginTop: '3rem', width: '100%', maxWidth: '400px' }}>
                  <button
                    type="button"
                    className={styles.chapterNavBtn}
                    onClick={() => setSelectedChapterIndex((prev: number) => Math.max(prev - 1, 0))}
                    disabled={selectedChapterIndex === 0}
                  >
                    ตอนก่อนหน้า
                  </button>
                  <button
                    type="button"
                    className={styles.chapterNavBtn}
                    onClick={() => setSelectedChapterIndex((prev: number) => Math.min(prev + 1, dbChapters.length - 1))}
                    disabled={selectedChapterIndex === dbChapters.length - 1}
                  >
                    ตอนถัดไป
                  </button>
                </div>
              </>
            )}
          </main>

          {/* Table of Contents Modal */}
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
                          setSelectedChapterIndex(idx);
                          setIsTocOpen(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <span className={styles.tocItemIndex}>#{idx + 1}</span>
                        <span className={styles.tocItemTitle}>{ch.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
