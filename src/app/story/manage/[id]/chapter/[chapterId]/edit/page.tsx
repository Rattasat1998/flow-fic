'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Plus, X, Trash2, GripVertical } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import styles from './edit.module.css';
import blockStyles from './block-editor.module.css';

const MOCK_STORY_ID = '123';
const MOCK_CHAPTERS: Record<string, { title: string; content: string; status: 'draft' | 'published' }> = {
    '1': {
        title: 'ปฐมบท: ศพในห้องล็อค',
        status: 'published',
        content: 'เสียงลมหนาวปะทะหน้าต่างไม้เก่า ก่อนที่ผมจะพบศพแรกในห้องที่ล็อกจากด้านใน...',
    }
}; // truncated mock for brevity

type Character = {
    id: string;
    name: string;
    image_url: string | null;
};

type Block = {
    id: string;
    type: 'paragraph';
    text: string;
    characterId: string | null;
};

export default function EditChapterPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const storyId = params.id as string;
    const chapterId = params.chapterId as string;

    const [isMounted, setIsMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDemoChapter, setIsDemoChapter] = useState(false);

    const [title, setTitle] = useState('');
    const [blocks, setBlocks] = useState<Block[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [status, setStatus] = useState<'draft' | 'published'>('draft');
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

    // Track which block has its character selector open
    const [openCharSelectorId, setOpenCharSelectorId] = useState<string | null>(null);
    const charSelectorRef = useRef<HTMLDivElement>(null);

    const styleParam = searchParams.get('style');
    const editorStyle = styleParam === 'chat' || styleParam === 'thread' ? styleParam : 'narrative';
    const styleLabel = editorStyle === 'chat' ? 'แชท' : editorStyle === 'thread' ? 'กระทู้' : 'บรรยาย';

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (charSelectorRef.current && !charSelectorRef.current.contains(event.target as Node)) {
                setOpenCharSelectorId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setIsMounted(true);

        const fetchChapterAndCharacters = async () => {
            if (!chapterId) {
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
                setTitle(data.title);
                setStatus(data.status as 'draft' | 'published');
                setLastSavedAt(data.updated_at || null);
                setIsDemoChapter(false);

                // Parse content into blocks
                if (data.content && typeof data.content === 'object' && 'blocks' in data.content) {
                    setBlocks(data.content.blocks as Block[]);
                } else if (data.content && typeof data.content === 'object' && 'text' in data.content) {
                    // Legacy migration: text -> blocks
                    const text = data.content.text as string;
                    const newBlocks = text.split('\n').filter((line: string) => line.trim() !== '').map((line: string, idx: number) => ({
                        id: `block-${Date.now()}-${idx}`,
                        type: 'paragraph' as const,
                        text: line,
                        characterId: null
                    }));
                    setBlocks(newBlocks.length > 0 ? newBlocks : [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }]);
                } else if (typeof data.content === 'string') {
                    // Legacy migration: simple string -> blocks
                    const newBlocks = data.content.split('\n').filter((line: string) => line.trim() !== '').map((line: string, idx: number) => ({
                        id: `block-${Date.now()}-${idx}`,
                        type: 'paragraph' as const,
                        text: line,
                        characterId: null
                    }));
                    setBlocks(newBlocks.length > 0 ? newBlocks : [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }]);
                } else {
                    setBlocks([{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }]);
                }

            } else {
                if (storyId === MOCK_STORY_ID) {
                    const mock = MOCK_CHAPTERS[chapterId] || { title: 'ตอนใหม่', content: '', status: 'draft' as const };
                    setTitle(mock.title);
                    setBlocks([{ id: `block-${Date.now()}`, type: 'paragraph', text: mock.content, characterId: null }]);
                    setStatus(mock.status);
                    setLastSavedAt(null);
                    setIsDemoChapter(true);
                } else {
                    console.error("Error fetching chapter:", error);
                    alert("ไม่พบข้อมูลตอนนี้ หรือเกิดข้อผิดพลาด");
                    router.replace(`/story/manage/${storyId}`);
                }
            }
            setIsLoading(false);
        };

        fetchChapterAndCharacters();
    }, [chapterId, storyId, router]);

    const handleSave = async (publish: boolean = false) => {
        if (!title.trim()) {
            alert('กรุณากรอกชื่อตอน');
            return;
        }

        setIsSaving(true);
        const newStatus = publish ? 'published' : status;

        try {
            if (isDemoChapter) {
                setStatus(newStatus);
                setLastSavedAt(new Date().toISOString());
                alert('บันทึกสำเร็จ (โหมดเดโม)');
                if (publish) router.replace(`/story/manage/${storyId}`);
                return;
            }

            const cleanBlocks = blocks.filter(b => b.text.trim() !== '' || b.characterId !== null);

            const { error } = await supabase
                .from('chapters')
                .update({
                    title,
                    content: { blocks: cleanBlocks.length > 0 ? cleanBlocks : [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }] },
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', chapterId)
                .eq('story_id', storyId);

            if (error) throw error;

            setStatus(newStatus);
            setLastSavedAt(new Date().toISOString());
            if (cleanBlocks.length !== blocks.length) setBlocks(cleanBlocks); // optimize view
            alert('บันทึกสำเร็จ');

            if (publish) {
                router.replace(`/story/manage/${storyId}`);
            }
        } catch (err) {
            console.error("Error saving chapter:", err);
            alert('เกิดข้อผิดพลาดในการบันทึก');
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
        const newId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newBlock: Block = { id: newId, type: 'paragraph', text: '', characterId: null };
        setBlocks(prev => {
            if (!afterId) return [...prev, newBlock];
            const index = prev.findIndex(b => b.id === afterId);
            if (index === -1) return [...prev, newBlock];
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            return newBlocks;
        });

        // Focus the new block after a short delay to allow React to render it
        setTimeout(() => {
            const el = document.getElementById(`textarea-${newId}`);
            if (el) el.focus();
        }, 50);
    };

    const removeBlock = (id: string) => {
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
                    <button onClick={() => router.replace(`/story/manage/${storyId}`)} className={styles.backBtn}>
                        <ArrowLeft size={20} /> กลับไปหน้าสารบัญ
                    </button>
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
                    </div>
                </div>

                <div className={styles.headerActions}>
                    <button className={styles.saveDraftBtn} onClick={() => handleSave(false)} disabled={isSaving}>
                        {isSaving ? <Loader2 size={16} className={styles.spinner} /> : <Save size={16} />}
                        บันทึกร่าง
                    </button>
                    <button className={styles.publishBtn} onClick={() => handleSave(true)} disabled={isSaving}>
                        {isSaving ? <Loader2 size={16} className={styles.spinner} /> : 'เผยแพร่ตอน'}
                    </button>
                </div>
            </header>

            <div className={styles.content}>
                <input
                    type="text"
                    className={styles.titleInput}
                    placeholder="ชื่อตอน..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />

                <div className={blockStyles.blockEditor}>
                    {blocks.map((block) => {
                        const assignedChar = characters.find(c => c.id === block.characterId);
                        const isSelectorOpen = openCharSelectorId === block.id;

                        return (
                            <div key={block.id} className={blockStyles.blockRow}>
                                {/* Character Avatar Wrapper */}
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

                                {/* Text Content Wrapper */}
                                <div className={blockStyles.blockContent}>
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
                                </div>
                            </div>
                        );
                    })}

                    <button className={blockStyles.addBlockBtn} onClick={() => addBlock()}>
                        <Plus size={20} /> เพิ่มบรรทัดใหม่
                    </button>
                </div>
            </div>
        </main>
    );
}
