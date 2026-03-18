'use client';

import { useState, Suspense, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Save, ImagePlus, Loader2, Search, X } from 'lucide-react';
import styles from './text.module.css';
import { supabase } from '@/lib/supabase';
import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { MAIN_CATEGORIES, SUB_CATEGORIES } from '@/lib/categories';
import { useAuth } from '@/contexts/AuthContext';

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

type StoryPathMode = 'linear' | 'branching';
type UnsplashTarget = 'cover' | 'wide';
type CreateWritingStyle = 'narrative' | 'chat';
type CreateStoryFormat = 'multi' | 'single';

function parseCreateStyle(raw: string | null): CreateWritingStyle {
    return raw === 'chat' ? 'chat' : 'narrative';
}

function parseCreateFormat(raw: string | null): CreateStoryFormat {
    return raw === 'single' ? 'single' : 'multi';
}

function CreateTextForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user } = useAuth();
    const userId = user?.id ?? null;
    const userFullName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';

    // Initialize state directly from URL query
    const initialStyle = parseCreateStyle(searchParams.get('style'));
    const initialFormat = parseCreateFormat(searchParams.get('format'));
    const isBranchingFeatureEnabled = FEATURE_FLAGS.branching;

    const writingStyle = initialStyle;
    const storyFormat = initialFormat;
    const [pathMode, setPathMode] = useState<StoryPathMode>(
        initialFormat === 'single' || !isBranchingFeatureEnabled ? 'linear' : 'branching'
    );

    const [title, setTitle] = useState('');
    const [penName, setPenName] = useState('');
    const [category, setCategory] = useState<'original' | 'fanfic'>('original'); // keep original/fanfic flag
    // New Taxonomy State
    const [mainCategory, setMainCategory] = useState<string>('');
    const [subCategory, setSubCategory] = useState<string>('');

    const [fandom, setFandom] = useState('');
    const [tags, setTags] = useState('');
    const [rating, setRating] = useState('all'); // all, 13+, 18+

    // Settings Checkboxes
    const [settings, setSettings] = useState({
        allowComments: true,
        hideHeartCount: false,
    });

    const [synopsis, setSynopsis] = useState('');


    const fileInputRef = useRef<HTMLInputElement>(null);
    const wideFileInputRef = useRef<HTMLInputElement>(null);
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverWideImage, setCoverWideImage] = useState<string | null>(null);
    const [coverWideFile, setCoverWideFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showUnsplashModal, setShowUnsplashModal] = useState(false);
    const [unsplashTarget, setUnsplashTarget] = useState<UnsplashTarget>('cover');
    const [unsplashQuery, setUnsplashQuery] = useState('');
    const [unsplashResults, setUnsplashResults] = useState<UnsplashImage[]>([]);
    const [isUnsplashLoading, setIsUnsplashLoading] = useState(false);
    const [unsplashError, setUnsplashError] = useState<string | null>(null);

    // Fetch user profile for default pen_name
    useEffect(() => {
        const fetchProfile = async () => {
            if (!userId) return;
            const { data } = await supabase
                .from('profiles')
                .select('pen_name')
                .eq('id', userId)
                .single();

            if (data?.pen_name) {
                setPenName(data.pen_name);
            } else if (userFullName) {
                setPenName(userFullName);
            }
        };

        fetchProfile();
    }, [userFullName, userId]);

    useEffect(() => {
        if ((storyFormat === 'single' || !isBranchingFeatureEnabled) && pathMode !== 'linear') {
            setPathMode('linear');
        }
    }, [storyFormat, pathMode, isBranchingFeatureEnabled]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) setCoverImage(event.target.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleWideImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setCoverWideFile(file);
            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) setCoverWideImage(event.target.result as string);
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
            setCoverWideImage(image.regular);
            setCoverWideFile(null);
        } else {
            setCoverImage(image.regular);
            setCoverFile(null);
        }
        setShowUnsplashModal(false);
    };

    const handleSettingChange = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user) {
            alert('กรุณาเข้าสู่ระบบก่อนสร้างผลงาน');
            return;
        }

        setIsSubmitting(true);

        try {
            // 1. Upload cover image to Supabase Storage (if any)
            let coverUrl: string | null = null;
            if (coverFile) {
                const fileExt = coverFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('covers')
                    .upload(fileName, coverFile);

                if (uploadError) {
                    console.error('Cover upload error:', uploadError);
                } else {
                    const { data: urlData } = supabase.storage
                        .from('covers')
                        .getPublicUrl(uploadData.path);
                    coverUrl = urlData.publicUrl;
                }
            } else if (coverImage && /^https?:\/\//.test(coverImage)) {
                coverUrl = coverImage;
            }

            let coverWideUrl: string | null = null;
            if (coverWideFile) {
                const fileExt = coverWideFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}_wide.${fileExt}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('covers')
                    .upload(fileName, coverWideFile);

                if (uploadError) {
                    console.error('Wide cover upload error:', uploadError);
                } else {
                    const { data: urlData } = supabase.storage
                        .from('covers')
                        .getPublicUrl(uploadData.path);
                    coverWideUrl = urlData.publicUrl;
                }
            } else if (coverWideImage && /^https?:\/\//.test(coverWideImage)) {
                coverWideUrl = coverWideImage;
            }

            // 2. Parse tags from comma-separated string
            const parsedTags = tags
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            // 3. Insert story into Supabase
            const { error } = await supabase
                .from('stories')
                .insert({
                    user_id: user.id,
                    title,
                    pen_name: penName,
                    category,
                    main_category: mainCategory || null,
                    sub_category: subCategory || null,
                    fandom: category === 'fanfic' ? fandom : null,
                    tags: parsedTags,
                    rating,
                    synopsis,
                    cover_url: coverUrl,
                    cover_wide_url: coverWideUrl,
                    writing_style: writingStyle,
                    story_format: storyFormat,
                    path_mode: storyFormat === 'single' || !isBranchingFeatureEnabled ? 'linear' : pathMode,
                    settings,
                    status: 'draft',
                    completion_status: 'ongoing',
                })
                .select()
                .single();

            if (error) {
                console.error('Insert error:', error);
                alert(`เกิดข้อผิดพลาด: ${error.message}`);
                return;
            }

            // 4. Redirect back to the dashboard
            router.push('/dashboard');
        } catch (err) {
            console.error('Unexpected error:', err);
            alert('เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <h1>สร้างผลงานใหม่</h1>
                <div style={{ width: 60 }} /> {/* Spacer */}
            </header>

            <div className={styles.container}>
                <form onSubmit={handleSubmit} className={styles.formContainer}>
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>
                            ข้อมูลผลงาน ({writingStyle === 'chat' ? 'แชท' : 'บรรยาย'})
                        </h2>

                        <div className={styles.formGroup}>
                            <label>พรีวิวภาพหน้าปกหน้าแรก</label>
                            <div className={styles.heroCoverPreview}>
                                <div
                                    className={styles.heroCoverBackdrop}
                                    style={
                                        coverWideImage || coverImage
                                            ? { backgroundImage: `url(${coverWideImage || coverImage})` }
                                            : {}
                                    }
                                >
                                    <div className={styles.heroCoverOverlay} />
                                    <div className={styles.heroCoverContent}>
                                        <div className={styles.heroCoverPoster}>
                                            {coverImage ? (
                                                <div
                                                    className={styles.heroCoverPosterImg}
                                                    style={{ backgroundImage: `url(${coverImage})` }}
                                                    aria-label="Cover preview"
                                                    role="img"
                                                />
                                            ) : (
                                                <div className={styles.heroCoverPosterEmpty}>COVER</div>
                                            )}
                                        </div>
                                        <div className={styles.heroCoverText}>
                                            <h3>{title.trim() || 'ตัวอย่างชื่อเรื่อง'}</h3>
                                            <p>{penName.trim() || 'นามปากกา'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label>รูปภาพปก (800x800 px) <span className={styles.required}>*</span></label>
                            <div
                                className={styles.coverUpload}
                                onClick={() => fileInputRef.current?.click()}
                                style={coverImage ? { backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center', borderStyle: 'solid' } : {}}
                            >
                                {!coverImage && (
                                    <>
                                        <ImagePlus size={32} style={{ marginBottom: '0.5rem' }} />
                                        <span style={{ fontSize: '0.85rem' }}>อัปโหลดหน้าปก</span>
                                    </>
                                )}
                            </div>
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleImageUpload}
                            />
                            <div className={styles.coverActions}>
                                <button
                                    type="button"
                                    className={styles.unsplashPickerBtn}
                                    onClick={() => openUnsplashPicker('cover')}
                                >
                                    <Search size={15} />
                                    เลือกรูปจาก Unsplash
                                </button>
                                {coverImage && (
                                    <button
                                        type="button"
                                        className={styles.clearCoverBtn}
                                        onClick={() => {
                                            setCoverImage(null);
                                            setCoverFile(null);
                                        }}
                                    >
                                        ลบรูปปก
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label>รูปภาพปกแนวกว้างสำหรับหน้าแรก (แนะนำ 1600x900)</label>
                            <div
                                className={styles.wideCoverUpload}
                                onClick={() => wideFileInputRef.current?.click()}
                                style={coverWideImage ? { backgroundImage: `url(${coverWideImage})`, backgroundSize: 'cover', backgroundPosition: 'center', borderStyle: 'solid' } : {}}
                            >
                                {!coverWideImage && (
                                    <>
                                        <ImagePlus size={28} style={{ marginBottom: '0.5rem' }} />
                                        <span style={{ fontSize: '0.85rem' }}>อัปโหลดปกแนวกว้าง</span>
                                    </>
                                )}
                            </div>
                            <input
                                type="file"
                                accept="image/*"
                                ref={wideFileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleWideImageUpload}
                            />
                            <div className={styles.coverActions}>
                                <button
                                    type="button"
                                    className={styles.unsplashPickerBtn}
                                    onClick={() => openUnsplashPicker('wide')}
                                >
                                    <Search size={15} />
                                    เลือกภาพแนวกว้างจาก Unsplash
                                </button>
                                {coverWideImage && (
                                    <button
                                        type="button"
                                        className={styles.clearCoverBtn}
                                        onClick={() => {
                                            setCoverWideImage(null);
                                            setCoverWideFile(null);
                                        }}
                                    >
                                        ลบรูปปกแนวกว้าง
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="title">ชื่อเรื่อง <span className={styles.required}>*</span></label>
                            <input
                                type="text"
                                required
                                placeholder="เช่น คดีฆาตกรรมห้องปิดตาย"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="penName">นามปากกา <span className={styles.required}>*</span></label>
                            <input
                                type="text"
                                required
                                placeholder="นามปากกาของคุณ"
                                value={penName}
                                onChange={e => setPenName(e.target.value)}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>ประเภทผลงาน <span className={styles.required}>*</span></label>
                            <div className={styles.categorySelector}>
                                <button
                                    type="button"
                                    className={`${styles.categoryBtn} ${category === 'original' ? styles.activeCategory : ''}`}
                                    onClick={() => setCategory('original')}
                                >
                                    เรื่องแต่งออริจินัล
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.categoryBtn} ${category === 'fanfic' ? styles.activeCategory : ''}`}
                                    onClick={() => setCategory('fanfic')}
                                >
                                    แฟนฟิคชัน
                                </button>
                            </div>
                        </div>

                        {/* Category Taxonomy */}
                        <div className={styles.formGroup}>
                            <label>หมวดหมู่หลัก <span className={styles.required}>*</span></label>
                            <select
                                className={styles.select}
                                value={mainCategory}
                                onChange={(e) => {
                                    setMainCategory(e.target.value);
                                    setSubCategory(''); // Reset sub category when main changes
                                }}
                                required
                            >
                                <option value="" disabled>เลือกหมวดหมู่หลัก</option>
                                {MAIN_CATEGORIES.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                                ))}
                            </select>
                        </div>

                        {mainCategory && (
                            <div className={styles.formGroup}>
                                <label>หมวดหมู่ <span className={styles.required}>*</span></label>
                                <div className={styles.categorySelectGroup}>
                                    <select
                                        className={styles.selectInput}
                                        value={subCategory}
                                        onChange={(e) => setSubCategory(e.target.value)}
                                        required
                                    >
                                        <option value="" disabled>เลือกหมวดหมู่ย่อย</option>
                                        {SUB_CATEGORIES.filter(sub => sub.mainCategoryId === mainCategory).map(sub => (
                                            <option key={sub.id} value={sub.id}>{sub.label}</option>
                                        ))}
                                    </select>

                                    {subCategory && (
                                        <div className={styles.subCategoryCard}>
                                            <div className={styles.subCategoryTitle}>
                                                {SUB_CATEGORIES.find(s => s.id === subCategory)?.label}
                                            </div>
                                            <div className={styles.subCategoryDesc}>
                                                {SUB_CATEGORIES.find(s => s.id === subCategory)?.description}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {category === 'fanfic' && (
                            <div className={styles.formGroup}>
                                <label>ชื่อด้อม / แฟนด้อม (Fandom) <span className={styles.required}>*</span></label>
                                <input
                                    type="text"
                                    required
                                    placeholder="เช่น Harry Potter, ชินจัง จอมแก่น, Genshin Impact"
                                    value={fandom}
                                    onChange={e => setFandom(e.target.value)}
                                />
                            </div>
                        )}

                        <div className={styles.formGroup}>
                            <label>แท็ก (Tags)</label>
                            <input
                                type="text"
                                placeholder="เช่น สืบสวน, โรงเรียนมัธยม, แฟนตาซี (คั่นด้วยลูกน้ำ)"
                                value={tags}
                                onChange={e => setTags(e.target.value)}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>ระดับเนื้อหา (Age Rating) <span className={styles.required}>*</span></label>
                            <select
                                value={rating}
                                onChange={e => setRating(e.target.value)}
                                className={styles.select}
                            >
                                <option value="all">เหมาะสมกับผู้อ่านทุกวัย (All Ages)</option>
                                <option value="13+">เนื้อหาเหมาะสมกับผู้อ่านอายุ 13 ปีขึ้นไป (13+)</option>
                                <option value="18+">เนื้อหาเหมาะสมกับผู้อ่านอายุ 18 ปีขึ้นไป (18+)</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label>โครงสร้างเส้นเรื่อง <span className={styles.required}>*</span></label>
                            <div className={styles.categorySelector}>
                                <button
                                    type="button"
                                    className={`${styles.categoryBtn} ${pathMode === 'branching' ? styles.activeCategory : ''}`}
                                    onClick={() => setPathMode('branching')}
                                    disabled={storyFormat === 'single' || !isBranchingFeatureEnabled}
                                >
                                    เส้นทางแตกแขนงข้ามตอน
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.categoryBtn} ${pathMode === 'linear' ? styles.activeCategory : ''}`}
                                    onClick={() => setPathMode('linear')}
                                >
                                    เส้นเดียวตามลำดับตอน
                                </button>
                            </div>
                            {storyFormat === 'single' && (
                                <small style={{ color: '#64748b' }}>งานเขียนตอนเดียวจบจะใช้โหมดเส้นเดียวอัตโนมัติ</small>
                            )}
                            {!isBranchingFeatureEnabled && (
                                <small style={{ color: '#64748b' }}>โหมดเส้นทางแตกแขนงถูกปิดชั่วคราวโดยระบบ</small>
                            )}
                        </div>

                        <div className={styles.formGroup}>
                            <label>คำโปรย / เรื่องย่อ</label>
                            <textarea
                                required
                                className={styles.textarea}
                                placeholder="เขียนคำโปรยให้น่าสนใจ..."
                                rows={4}
                                value={synopsis}
                                onChange={e => setSynopsis(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>ตั้งค่าเรื่อง</h2>

                        <div className={styles.settingsList}>
                            <label className={styles.checkboxLabel}>
                                <input type="checkbox" checked={settings.allowComments} onChange={() => handleSettingChange('allowComments')} />
                                อนุญาตให้ผู้อ่านแสดงความเห็น
                            </label>

                            <label className={styles.checkboxLabel}>
                                <input type="checkbox" checked={settings.hideHeartCount} onChange={() => handleSettingChange('hideHeartCount')} />
                                ซ่อนจำนวนหัวใจ
                            </label>
                        </div>
                    </div>



                    <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <><Loader2 size={18} className={styles.spinner} /> กำลังสร้าง...</>
                        ) : (
                            <><Save size={18} /> เริ่มแต่งเรื่องเลย!</>
                        )}
                    </button>
                </form>
            </div>

            {showUnsplashModal && (
                <div className={styles.modalOverlay} onClick={() => setShowUnsplashModal(false)}>
                    <div className={`${styles.modal} ${styles.unsplashModal}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>
                                {unsplashTarget === 'wide' ? 'เลือกภาพปกแนวกว้างจาก Unsplash' : 'เลือกรูปปกจาก Unsplash'}
                            </h3>
                            <button type="button" className={styles.iconBtn} onClick={() => setShowUnsplashModal(false)}>
                                <X size={18} />
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
                                <div className={styles.unsplashEmpty}>ยังไม่พบรูป ลองค้นหาด้วยคำอื่น</div>
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
        </main>
    );
}

export default function CreateTextPage() {
    return (
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
            <CreateTextForm />
        </Suspense>
    );
}
