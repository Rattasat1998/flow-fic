'use client';

import { useState, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, ImagePlus, Upload, Loader2 } from 'lucide-react';
import styles from './text.module.css';
import { supabase } from '@/lib/supabase';
import { MAIN_CATEGORIES, SUB_CATEGORIES } from '@/lib/categories';

function CreateTextForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Initialize state directly from URL query
    const initialStyle = searchParams.get('style') || 'narrative';
    const initialFormat = searchParams.get('format') || 'multi';

    const [writingStyle, setWritingStyle] = useState(initialStyle);
    const [storyFormat, setStoryFormat] = useState(initialFormat);

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
        allowScreenCapture: true,
        allowTextToSpeech: true,
        allowOfflineReading: true,
        allowComments: true,
        allowStickerComments: true,
        allowGuestComments: true,
        hideHeartCount: false,
        lockAge18: false,
        lockAppOnly: false,
    });

    const [synopsis, setSynopsis] = useState('');


    const fileInputRef = useRef<HTMLInputElement>(null);
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const handleSettingChange = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
            }

            // 2. Parse tags from comma-separated string
            const parsedTags = tags
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            // 3. Insert story into Supabase
            const { data, error } = await supabase
                .from('stories')
                .insert({
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
                    writing_style: writingStyle,
                    story_format: storyFormat,
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

            // 4. Redirect to the new story's management page
            router.push(`/story/manage/${data.id}`);
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
                <button onClick={() => router.back()} className={styles.backBtn} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <ArrowLeft size={20} /> กลับ
                </button>
                <h1>สร้างผลงานใหม่</h1>
                <div style={{ width: 60 }} /> {/* Spacer */}
            </header>

            <div className={styles.container}>
                <form onSubmit={handleSubmit} className={styles.formContainer}>
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>
                            ข้อมูลผลงาน ({writingStyle === 'chat' ? 'แชท' : writingStyle === 'thread' ? 'กระทู้' : 'บรรยาย'})
                        </h2>

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
                                <input type="checkbox" checked={settings.allowScreenCapture} onChange={() => handleSettingChange('allowScreenCapture')} />
                                อนุญาตให้แคปหน้าจอได้
                            </label>

                            <label className={styles.checkboxLabel}>
                                <input type="checkbox" checked={settings.allowTextToSpeech} onChange={() => handleSettingChange('allowTextToSpeech')} />
                                อนุญาตให้ใช้ฟีเจอร์อ่านให้ฟัง (Text to speech)
                            </label>

                            <label className={styles.checkboxLabel}>
                                <input type="checkbox" checked={settings.allowOfflineReading} onChange={() => handleSettingChange('allowOfflineReading')} />
                                อนุญาตให้อ่านแบบออฟไลน์ อ่านโดยไม่ใช้อินเทอร์เน็ต (อยู่ระหว่างพัฒนา)
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label className={styles.checkboxLabel}>
                                    <input type="checkbox" checked={settings.allowComments} onChange={() => handleSettingChange('allowComments')} />
                                    อนุญาตให้ผู้อ่านแสดงความเห็น
                                </label>

                                {settings.allowComments && (
                                    <div className={styles.subSettings}>
                                        <label className={styles.checkboxLabel}>
                                            <input type="checkbox" checked={settings.allowStickerComments} onChange={() => handleSettingChange('allowStickerComments')} />
                                            อนุญาตให้ผู้อ่านแสดงความเห็นด้วยสติกเกอร์
                                        </label>
                                        <label className={styles.checkboxLabel}>
                                            <input type="checkbox" checked={settings.allowGuestComments} onChange={() => handleSettingChange('allowGuestComments')} />
                                            อนุญาตให้ผู้อ่านที่ไม่ Login แสดงความคิดเห็นได้
                                        </label>
                                    </div>
                                )}
                            </div>

                            <label className={styles.checkboxLabel}>
                                <input type="checkbox" checked={settings.hideHeartCount} onChange={() => handleSettingChange('hideHeartCount')} />
                                ซ่อนจำนวนหัวใจ
                            </label>

                            <label className={styles.checkboxLabel}>
                                <input type="checkbox" checked={settings.lockAge18} onChange={() => handleSettingChange('lockAge18')} />
                                ล็อกเนื้อหาให้อ่านได้เฉพาะผู้ที่มีอายุ 18 ปีขึ้นไปและยืนยันอายุด้วยบัตรประชาชน
                            </label>

                            <label className={styles.checkboxLabel}>
                                <input type="checkbox" checked={settings.lockAppOnly} onChange={() => handleSettingChange('lockAppOnly')} />
                                ล็อกเนื้อหาให้อ่านได้เฉพาะผู้ใช้งานแอปพลิเคชันเท่านั้น
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
