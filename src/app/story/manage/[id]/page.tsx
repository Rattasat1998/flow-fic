'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Settings, BarChart2, Edit3, Image as ImageIcon, GripVertical, Trash2, X, Save, Loader2, Upload } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult, DroppableProvided, DraggableProvided, DraggableStateSnapshot, DroppableStateSnapshot } from '@hello-pangea/dnd';
import styles from './manage.module.css';
import { supabase } from '@/lib/supabase';
import { MAIN_CATEGORIES, SUB_CATEGORIES } from '@/lib/categories';

type StoryCompletionStatus = 'ongoing' | 'completed';
type StoryPublicationStatus = 'draft' | 'published';
const normalizeCompletionStatus = (value: string | null | undefined): StoryCompletionStatus => {
    return value === 'completed' ? 'completed' : 'ongoing';
};
const normalizePublicationStatus = (value: string | null | undefined): StoryPublicationStatus => {
    return value === 'published' ? 'published' : 'draft';
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

const mockStory = {
    id: '123',
    title: 'คดีฆาตกรรมห้องปิดตาย',
    penName: 'Sherlock Holmes',
    writingStyle: 'narrative',
    status: 'published',
    completionStatus: 'ongoing',
    synopsis: 'เรื่องราวของนักสืบที่ต้องไขคดีฆาตกรรมที่เกิดขึ้นในห้องที่ไม่มีทางเข้าออก...',
    category: 'original',
    mainCategory: '',
    subCategory: '',
    coverImage: null as string | null,
    readCount: 3800,
    heartCount: 850,
    commentCount: 120,
    chapters: [
        { id: '1', title: 'ปฐมบท: ศพในห้องล็อค', status: 'published', views: 1250, comments: 45, date: '2023-10-25' },
        { id: '2', title: 'ร่องรอยที่หายไป', status: 'published', views: 980, comments: 32, date: '2023-10-28' },
        { id: '3', title: 'ผู้ต้องสงสัยทั้งสาม', status: 'published', views: 850, comments: 28, date: '2023-11-01' },
        { id: '4', title: 'พยานปากเอก', status: 'published', views: 720, comments: 15, date: '2023-11-05' },
        { id: '5', title: 'แรงจูงใจที่ซ่อนเร้น', status: 'draft', views: 0, comments: 0, date: '2023-11-10' }
    ]
};

export default function StoryManagerPage() {
    const params = useParams();
    const router = useRouter();
    const storyId = params.id as string;

    const [storyData, setStoryData] = useState<typeof mockStory | null>(null);
    const [chapters, setChapters] = useState(mockStory.chapters);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFromDB, setIsFromDB] = useState(false);

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        title: '',
        penName: '',
        synopsis: '',
        category: '',
        mainCategory: '',
        subCategory: '',
        coverUrl: null as string | null
    });
    const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingStoryStatus, setIsUpdatingStoryStatus] = useState(false);

    // Character modal state
    const [showCharModal, setShowCharModal] = useState(false);
    const [charForm, setCharForm] = useState({
        name: '',
        age: '',
        occupation: '',
        personality: '',
        imageUrl: null as string | null
    });
    const [charImageFile, setCharImageFile] = useState<File | null>(null);
    const [isSavingChar, setIsSavingChar] = useState(false);
    const [editingCharId, setEditingCharId] = useState<string | null>(null); // Track which character is being edited

    // Confirm Modal state
    const [deleteConfirm, setDeleteConfirm] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    // Required to prevent Next.js hydration errors with @hello-pangea/dnd
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        const fetchStory = async () => {
            if (!storyId) return;

            // Try fetching from Supabase first
            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .select('*')
                .eq('id', storyId)
                .single();

            if (!storyError && storyData) {
                // Fetch chapters for this story
                const { data: chaptersData, error: chaptersError } = await supabase
                    .from('chapters')
                    .select('id, title, status, order_index, created_at, read_count')
                    .eq('story_id', storyId)
                    .order('order_index', { ascending: true });

                const formattedChapters = (chaptersData || []).map(ch => ({
                    id: ch.id,
                    title: ch.title,
                    status: ch.status as 'draft' | 'published',
                    views: ch.read_count || 0,
                    comments: 0,
                    date: new Date(ch.created_at).toLocaleDateString()
                }));

                const dbStory = {
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
                    coverImage: storyData.cover_url,
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
                setCharacters(charsData || []);
                setIsFromDB(true);
            } else {
                // Fallback to mock data for legacy IDs
                setStoryData(mockStory);
                setChapters(mockStory.chapters);
                setCharacters([]);
            }
            setIsLoading(false);
        };

        fetchStory();
    }, [storyId]);

    const story = storyData ? { ...storyData, chapters } : null;
    const editorStyle = story?.writingStyle || 'narrative';
    const publishedCount = chapters.filter(chapter => chapter.status === 'published').length;
    const isStoryCompleted = story?.completionStatus === 'completed';

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
                        title: 'ตอนใหม่',
                        order_index: chapters.length,
                        status: 'draft'
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            // 2. Redirect to the editor page for this new chapter
            router.push(`/story/manage/${storyId}/chapter/${data.id}/edit?style=${editorStyle}`);

        } catch (err) {
            console.error("Error creating chapter:", err);
            alert("ไม่สามารถสร้างตอนใหม่ได้ในขณะนี้");
        }
    };

    const handleEditChapter = (chapterId: string) => {
        router.push(`/story/manage/${storyId}/chapter/${chapterId}/edit?style=${editorStyle}`);
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
        setStoryData(prev => prev ? {
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
            setStoryData(prev => prev ? {
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
            coverUrl: story.coverImage,
        });
        setEditCoverFile(null);
        setShowEditModal(true);
    };

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setEditCoverFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) setEditForm(f => ({ ...f, coverUrl: event.target!.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveEdit = async () => {
        if (!isFromDB || !story) return;
        setIsSaving(true);
        try {
            let finalCoverUrl = editForm.coverUrl;

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
                    cover_url: finalCoverUrl,
                })
                .eq('id', storyId);

            if (error) {
                alert(`เกิดข้อผิดพลาด: ${error.message}`);
                return;
            }

            // 4. Update local state
            setStoryData(prev => prev ? {
                ...prev,
                title: editForm.title,
                penName: editForm.penName,
                synopsis: editForm.synopsis,
                category: editForm.category,
                mainCategory: editForm.mainCategory,
                subCategory: editForm.subCategory,
                coverImage: finalCoverUrl,
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
            setCharForm(prev => ({ ...prev, imageUrl: objectUrl }));
        }
    };

    const handleSaveCharacter = async () => {
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
                const updateData: any = {
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

        } catch (err: any) {
            console.error('Failed to save character:', err);
            alert(`เกิดข้อผิดพลาดในการบันทึกตัวละคร: ${err.message}`);
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
                    }
                }
            }
        });
    };

    if (!isMounted || isLoading) {
        return (null);
    }
    if (!story) return (
        <main className={styles.main}>
            <header className={styles.header}>
                <button onClick={() => router.back()} className={styles.backBtn}>
                    <ArrowLeft size={20} /> กลับ
                </button>
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
                <button onClick={() => router.back()} className={styles.backBtn}>
                    <ArrowLeft size={20} /> กลับไปหน้าแต่งนิยาย
                </button>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className={styles.backBtn}><BarChart2 size={18} /> สถิติ</button>
                    <button className={styles.backBtn} onClick={openEditModal}><Settings size={18} /> แก้ไขข้อมูล</button>
                </div>
            </header>

            {/* Hero Banner */}
            <div className={styles.heroBanner}>
                {story.coverImage && (
                    <img src={story.coverImage} alt="Cover Background" className={styles.heroBg} />
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

                {story.chapters.length > 0 ? (
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="chapters-list">
                            {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
                                <div
                                    className={`${styles.chapterList} ${snapshot.isDraggingOver ? styles.draggingOver : ''}`}
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                >
                                    {story.chapters.map((chapter, index) => (
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
                                                                {chapter.status === 'published' && (
                                                                    <span style={{ marginLeft: '1rem' }}>👁️ {chapter.views} | 💬 {chapter.comments}</span>
                                                                )}
                                                            </div>
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
