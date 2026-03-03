'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Loader2, Plus, X, Trash2, GripVertical, Image as ImageIcon, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
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

export default function EditChapterPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const storyId = params.id as string;
    const chapterId = params.chapterId as string;
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

    const styleParam = searchParams.get('style');
    const editorStyle = styleParam === 'chat' || styleParam === 'thread' ? styleParam : 'narrative';
    const isChatStyle = editorStyle === 'chat';
    const styleLabel = isChatStyle ? 'แชท' : editorStyle === 'thread' ? 'กระทู้' : 'บรรยาย';

    const showNotice = (tone: NoticeState['tone'], title: string, message: string) => {
        setNotice({ tone, title, message });
    };

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
        setIsMounted(true);

        const cacheKey = `flowfic_chapter_${chapterId}`;
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
                setIsPremium(!!parsed.isPremium);
                setCoinPrice(Number.isFinite(parsed.coinPrice) ? Math.max(1, Number(parsed.coinPrice)) : 10);
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
                setTitle(data.title);
                setStatus(data.status as 'draft' | 'published');
                setLastSavedAt(data.updated_at || null);
                setIsPremium(!!data.is_premium);
                setCoinPrice((data.coin_price && data.coin_price > 0) ? data.coin_price : 10);

                let parsedBlocks: Block[];
                let parsedPov: string | null = null;

                // Parse content into blocks
                if (data.content && typeof data.content === 'object' && 'blocks' in data.content) {
                    parsedBlocks = (data.content as any).blocks as Block[];
                    parsedPov = (data.content as any).povCharacterId || null;
                } else if (data.content && typeof data.content === 'object' && 'text' in data.content) {
                    // Legacy migration: text -> blocks
                    const text = (data.content as any).text as string;
                    parsedBlocks = text.split('\n').filter((line: string) => line.trim() !== '').map((line: string, idx: number) => ({
                        id: `block-${Date.now()}-${idx}`,
                        type: 'paragraph' as const,
                        text: line,
                        characterId: null
                    }));
                    if (parsedBlocks.length === 0) parsedBlocks = [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }];
                } else if (typeof data.content === 'string') {
                    // Legacy migration: simple string -> blocks
                    parsedBlocks = data.content.split('\n').filter((line: string) => line.trim() !== '').map((line: string, idx: number) => ({
                        id: `block-${Date.now()}-${idx}`,
                        type: 'paragraph' as const,
                        text: line,
                        characterId: null
                    }));
                    if (parsedBlocks.length === 0) parsedBlocks = [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }];
                } else {
                    parsedBlocks = [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }];
                }

                setBlocks(parsedBlocks);
                setPovCharacterId(parsedPov);

                sessionStorage.setItem(cacheKey, JSON.stringify({
                    characters: charsData || [],
                    title: data.title,
                    status: data.status,
                    lastSavedAt: data.updated_at || null,
                    blocks: parsedBlocks,
                    povCharacterId: parsedPov,
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
    }, [chapterId, storyId, user, isLoadingAuth, router]);

    const handleSave = async (publish: boolean = false) => {
        if (!title.trim()) {
            showNotice('error', 'กรุณากรอกชื่อตอน', 'ต้องใส่ชื่อตอนก่อนบันทึกหรือเผยแพร่');
            return;
        }

        setIsSaving(true);
        const newStatus = publish ? 'published' : status;

        try {

            const cleanBlocks = blocks.filter(b => b.text.trim() !== '' || b.characterId !== null || b.type === 'image');

            const { error } = await supabase
                .from('chapters')
                .update({
                    title,
                    content: {
                        povCharacterId: isChatStyle ? povCharacterId : null,
                        chatTheme: isChatStyle ? chatTheme : undefined,
                        blocks: cleanBlocks.length > 0 ? cleanBlocks : [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', characterId: null }]
                    },
                    status: newStatus,
                    is_premium: isPremium,
                    coin_price: isPremium ? Math.max(1, coinPrice) : 0,
                    updated_at: new Date().toISOString()
                })
                .eq('id', chapterId)
                .eq('story_id', storyId);

            if (error) throw error;

            setStatus(newStatus);
            setLastSavedAt(new Date().toISOString());
            if (cleanBlocks.length !== blocks.length) setBlocks(cleanBlocks); // optimize view

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
                    <button className={styles.saveDraftBtn} onClick={() => handleSave(false)} disabled={isSaving}>
                        {isSaving ? <Loader2 size={16} className={styles.spinner} /> : <Save size={16} />}
                        บันทึกร่าง
                    </button>
                    <button className={styles.publishBtn} onClick={() => handleSave(true)} disabled={isSaving}>
                        {isSaving ? <Loader2 size={16} className={styles.spinner} /> : 'เผยแพร่ตอน'}
                    </button>
                </div>
            </header>

            <div className={`${styles.content} ${!isChatStyle ? styles.contentNarrative : ''}`}>
                <div className={styles.titleArea}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', color: '#334155' }}>
                            <input
                                type="checkbox"
                                checked={isPremium}
                                onChange={(e) => setIsPremium(e.target.checked)}
                            />
                            ตอนพิเศษ (ปลดล็อกด้วยเหรียญ)
                        </label>
                        {isPremium && (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', color: '#334155' }}>
                                ราคา
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={coinPrice}
                                    onChange={(e) => setCoinPrice(Math.max(1, Number(e.target.value) || 1))}
                                    style={{ width: '96px', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.35rem 0.45rem' }}
                                />
                                เหรียญ
                            </label>
                        )}
                    </div>
                    {isChatStyle && characters.length > 0 && (
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
                                                            fieldSizing: 'content' as any,
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
