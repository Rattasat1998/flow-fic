'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Trash2, PenTool, Eraser, Save, Plus, ChevronLeft, ChevronRight,
    Highlighter, Undo2, Redo2, ImagePlus, ArrowUpToLine, ArrowDownToLine, Trash, Loader2
} from 'lucide-react';
import { Rnd } from 'react-rnd';
import styles from './comic.module.css';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type ToolType = 'pen' | 'marker' | 'eraser';

type DraftImage = {
    id: string;
    src: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
};

export default function ComicCreatorPage() {
    const router = useRouter();
    const { user } = useAuth();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // State for Comic Info
    const [title, setTitle] = useState('');

    // State for Canvas
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#0f172a');
    const [brushSize, setBrushSize] = useState(3);
    const [tool, setTool] = useState<ToolType>('pen');
    const [isPublishing, setIsPublishing] = useState(false);

    // Undo/Redo History per page
    const [history, setHistory] = useState<Record<number, string[]>>({});
    const [redoStack, setRedoStack] = useState<Record<number, string[]>>({});

    // State for Pages Management
    const [pages, setPages] = useState<string[]>(['']); // Array of drawn canvas images
    const [currentPage, setCurrentPage] = useState(0);

    // Image Overlays Management
    const [pageImages, setPageImages] = useState<Record<number, DraftImage[]>>({});
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const [renderScale, setRenderScale] = useState(1);

    // Compute active render scale for accurate Rnd bounds
    useEffect(() => {
        const updateScale = () => {
            const el = containerRef.current;
            if (el) {
                setRenderScale(el.clientWidth / 800);
            }
        };
        window.addEventListener('resize', updateScale);

        // Timeout to ensure DOM is fully laid out before measuring
        setTimeout(updateScale, 100);
        return () => window.removeEventListener('resize', updateScale);
    }, [currentPage]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = 800;
        canvas.height = 1131;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (pages[currentPage]) {
            const img = new Image();
            img.src = pages[currentPage];
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                saveInitialHistoryIfNeeded();
            };
        } else {
            saveInitialHistoryIfNeeded();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    const saveInitialHistoryIfNeeded = () => {
        const canvas = canvasRef.current;
        if (canvas && (!history[currentPage] || history[currentPage].length === 0)) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setHistory(prev => ({ ...prev, [currentPage]: [dataUrl] }));
        }
    };

    const saveHistoryState = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setHistory(prev => {
            const currentHist = prev[currentPage] || [];
            return { ...prev, [currentPage]: [...currentHist, dataUrl] };
        });
        setRedoStack(prev => ({ ...prev, [currentPage]: [] }));
    };

    const handleUndo = () => {
        const currentHist = history[currentPage] || [];
        if (currentHist.length <= 1) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const newHist = [...currentHist];
        const currentState = newHist.pop()!;
        const previousState = newHist[newHist.length - 1];

        setRedoStack(prev => ({
            ...prev,
            [currentPage]: [...(prev[currentPage] || []), currentState]
        }));
        setHistory(prev => ({ ...prev, [currentPage]: newHist }));

        const img = new Image();
        img.src = previousState;
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            saveCurrentPageToState();
        };
    };

    const handleRedo = () => {
        const currentRedo = redoStack[currentPage] || [];
        if (currentRedo.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const newRedo = [...currentRedo];
        const nextState = newRedo.pop()!;

        setHistory(prev => ({
            ...prev,
            [currentPage]: [...(prev[currentPage] || []), nextState]
        }));
        setRedoStack(prev => ({ ...prev, [currentPage]: newRedo }));

        const img = new Image();
        img.src = nextState;
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            saveCurrentPageToState();
        };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setSelectedImageId(null);
        setIsDrawing(true);
        draw(e);
    };

    const stopDrawing = () => {
        if (isDrawing) {
            setIsDrawing(false);
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.beginPath(); // Reset path

                saveHistoryState();
                saveCurrentPageToState();
            }
        }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;

        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (tool === 'eraser') {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = 1.0;
        } else if (tool === 'marker') {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.3;
        } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = color;
            ctx.globalAlpha = 1.0;
        }

        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    // -------- Image Overlay Handlers --------
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Immediately deselect current
        setSelectedImageId(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Fit within canvas safely
                const maxDim = 500;
                const scale = Math.min(1, maxDim / img.width, maxDim / img.height);
                const w = img.width * scale;
                const h = img.height * scale;
                const newImg: DraftImage = {
                    id: Math.random().toString(),
                    src: img.src,
                    x: (800 / 2) - (w / 2),
                    y: (1131 / 2) - (h / 2),
                    width: w,
                    height: h,
                    zIndex: Date.now()
                };

                setPageImages(prev => ({
                    ...prev,
                    [currentPage]: [...(prev[currentPage] || []), newImg]
                }));
                // Select sequentially after state updates to ensure proper focus
                setTimeout(() => setSelectedImageId(newImg.id), 50);
            };
            if (event.target?.result) {
                img.src = event.target.result as string;
            }
        };
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const updateImage = (id: string, updates: Partial<DraftImage>) => {
        setPageImages(prev => {
            const currentImgs = prev[currentPage] || [];
            return {
                ...prev,
                [currentPage]: currentImgs.map(img => img.id === id ? { ...img, ...updates } : img)
            };
        });
    };

    const bringForward = () => { if (selectedImageId) updateImage(selectedImageId, { zIndex: Date.now() }); };
    const sendBackward = () => { if (selectedImageId) updateImage(selectedImageId, { zIndex: 0 }); };
    const deleteImage = () => {
        if (!selectedImageId) return;
        setPageImages(prev => ({ ...prev, [currentPage]: (prev[currentPage] || []).filter(img => img.id !== selectedImageId) }));
        setSelectedImageId(null);
    };
    // ----------------------------------------

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 1.0;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            saveHistoryState();
            saveCurrentPageToState();
        }
    };

    const saveCurrentPageToState = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const newPages = [...pages];
            newPages[currentPage] = dataUrl;
            setPages(newPages);
        }
    };

    const addNewPage = () => {
        setSelectedImageId(null);
        saveCurrentPageToState();
        setPages([...pages, '']);
        setCurrentPage(pages.length);
        setHistory(prev => ({ ...prev, [pages.length]: [] }));
        setRedoStack(prev => ({ ...prev, [pages.length]: [] }));
    };

    const goToPage = (index: number) => {
        if (index >= 0 && index < pages.length) {
            setSelectedImageId(null);
            saveCurrentPageToState();
            setCurrentPage(index);
        }
    };

    const dataURLtoBlob = (dataURL: string): Blob => {
        const parts = dataURL.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const byteString = atob(parts[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ab], { type: mime });
    };

    const handlePublish = async () => {
        if (!title.trim()) {
            alert('กรุณาตั้งชื่อเรื่องการ์ตูนก่อนบันทึกครับ');
            return;
        }
        if (!user) {
            alert('กรุณาเข้าสู่ระบบก่อนบันทึก');
            return;
        }

        setIsPublishing(true);
        saveCurrentPageToState();

        try {
            // 1. Create the story in Supabase
            const { data: storyData, error: storyError } = await supabase
                .from('stories')
                .insert({
                    title,
                    pen_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Comic Writer',
                    category: 'original',
                    writing_style: 'narrative',
                    story_format: 'single',
                    status: 'published',
                    user_id: user.id,
                })
                .select()
                .single();

            if (storyError || !storyData) {
                throw storyError || new Error('ไม่สามารถสร้างเรื่องได้');
            }

            const storyId = storyData.id;

            // 2. Upload each page as an image to Supabase Storage
            const pageUrls: string[] = [];
            const finalPages = [...pages];
            // Make sure current page is saved
            const canvas = canvasRef.current;
            if (canvas) {
                finalPages[currentPage] = canvas.toDataURL('image/jpeg', 0.8);
            }

            for (let i = 0; i < finalPages.length; i++) {
                const pageData = finalPages[i];
                if (!pageData) continue;

                const blob = dataURLtoBlob(pageData);
                const fileName = `${storyId}/page_${i + 1}_${Date.now()}.jpg`;

                const { error: uploadError } = await supabase.storage
                    .from('comics')
                    .upload(fileName, blob, { contentType: 'image/jpeg' });

                if (uploadError) {
                    console.error(`Error uploading page ${i + 1}:`, uploadError);
                    throw uploadError;
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('comics')
                    .getPublicUrl(fileName);

                pageUrls.push(publicUrl);
            }

            // 3. Create a chapter with the comic pages as content
            const { error: chapterError } = await supabase
                .from('chapters')
                .insert({
                    story_id: storyId,
                    user_id: user.id,
                    title: `${title} — หน้า 1-${pageUrls.length}`,
                    draft_title: `${title} — หน้า 1-${pageUrls.length}`,
                    published_title: `${title} — หน้า 1-${pageUrls.length}`,
                    content: {
                        type: 'comic',
                        pages: pageUrls,
                    },
                    draft_content: {
                        type: 'comic',
                        pages: pageUrls,
                    },
                    published_content: {
                        type: 'comic',
                        pages: pageUrls,
                    },
                    draft_updated_at: new Date().toISOString(),
                    published_updated_at: new Date().toISOString(),
                    order_index: 0,
                    status: 'published',
                });

            if (chapterError) throw chapterError;

            // 4. Set cover from first page
            if (pageUrls.length > 0) {
                await supabase
                    .from('stories')
                    .update({ cover_url: pageUrls[0] })
                    .eq('id', storyId);
            }

            alert(`บันทึกการ์ตูนเรื่อง "${title}" เรียบร้อยแล้ว! (${pageUrls.length} หน้า)`);
            router.push(`/story/manage/${storyId}`);

        } catch (error) {
            console.error('Error publishing comic:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่');
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.titleInfo}>
                        <input
                            type="text"
                            className={styles.titleInput}
                            placeholder="ตั้งชื่อเรื่องการ์ตูน..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                        <span className={styles.pageCount}>หน้า {currentPage + 1} / {pages.length}</span>
                    </div>
                </div>
                <button className={styles.publishBtn} onClick={handlePublish} disabled={isPublishing}>
                    {isPublishing ? <><Loader2 size={18} className={styles.spinner} /> กำลังบันทึก...</> : <><Save size={18} /> บันทึกและเผยแพร่</>}
                </button>
            </header>

            <div className={styles.workspace}>
                {/* Left Toolbar */}
                <aside className={styles.toolbar}>

                    {/* Selected Image Controls */}
                    {selectedImageId && (
                        <div className={styles.toolSection}>
                            <h3 style={{ color: 'var(--primary)' }}>ตั้งค่ารูปภาพ</h3>
                            <div className={styles.toolGrid}>
                                <button className={styles.toolBtn} onClick={bringForward} title="ย้ายขึ้นบนสุด"><ArrowUpToLine size={18} /></button>
                                <button className={styles.toolBtn} onClick={sendBackward} title="ลงล่างสุด"><ArrowDownToLine size={18} /></button>
                                <button className={styles.toolBtn} onClick={deleteImage} title="ลบรูปนี้" style={{ color: '#ef4444' }}><Trash size={18} /></button>
                            </div>
                        </div>
                    )}

                    <div className={styles.toolSection}>
                        <h3>ย้อนกลับ / ทำซ้ำ</h3>
                        <div className={styles.toolGrid}>
                            <button
                                className={styles.toolBtn}
                                onClick={handleUndo}
                                disabled={!(history[currentPage]?.length > 1)}
                                title="Undo (ย้อนกลับลายเส้น)"
                            >
                                <Undo2 size={20} />
                            </button>
                            <button
                                className={styles.toolBtn}
                                onClick={handleRedo}
                                disabled={!(redoStack[currentPage]?.length > 0)}
                                title="Redo (ทำซ้ำ)"
                            >
                                <Redo2 size={20} />
                            </button>
                        </div>
                    </div>

                    <div className={styles.toolSection}>
                        <h3>เครื่องมือปากกา</h3>
                        <div className={styles.toolGrid}>
                            <button
                                className={`${styles.toolBtn} ${tool === 'pen' ? styles.activeTool : ''}`}
                                onClick={() => setTool('pen')}
                                title="ดินสอ/สี (Pen)"
                            >
                                <PenTool size={20} />
                            </button>
                            <button
                                className={`${styles.toolBtn} ${tool === 'marker' ? styles.activeTool : ''}`}
                                onClick={() => setTool('marker')}
                                title="มาร์กเกอร์ (Marker)"
                            >
                                <Highlighter size={20} />
                            </button>
                            <button
                                className={`${styles.toolBtn} ${tool === 'eraser' ? styles.activeTool : ''}`}
                                onClick={() => setTool('eraser')}
                                title="ยางลบ (Eraser)"
                            >
                                <Eraser size={20} />
                            </button>
                        </div>
                    </div>

                    <div className={styles.toolSection}>
                        <h3>นำเข้ารูปภาพ (Layers)</h3>
                        <button
                            className={styles.actionBtn}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <ImagePlus size={18} /> เลือกรูปสติกเกอร์...
                        </button>
                        <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                        />
                    </div>

                    {tool !== 'eraser' && (
                        <div className={styles.toolSection}>
                            <h3>สี</h3>
                            <div className={styles.colorsGrid}>
                                {['#0f172a', '#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#a855f7'].map(c => (
                                    <button
                                        key={c}
                                        className={`${styles.colorSwatch} ${color === c ? styles.activeColor : ''}`}
                                        style={{ backgroundColor: c }}
                                        onClick={() => { setColor(c); }}
                                    />
                                ))}
                                <div className={styles.colorPickerWrapper}>
                                    <input
                                        type="color"
                                        value={color}
                                        onChange={(e) => { setColor(e.target.value); }}
                                        className={styles.colorPicker}
                                        title="เลือกสีเพิ่มเติม"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className={styles.toolSection}>
                        <h3>ขนาดหัวปากกา ({brushSize}px)</h3>
                        <input
                            type="range"
                            min="1"
                            max="50"
                            value={brushSize}
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className={styles.slider}
                        />
                    </div>

                    <div className={styles.bottomTools}>
                        <button className={styles.clearBtn} onClick={clearCanvas}>
                            <Trash2 size={16} /> ล้างลายเส้นบนหน้า
                        </button>
                    </div>
                </aside>

                {/* Canvas Area */}
                <main className={styles.canvasArea} onMouseDown={() => setSelectedImageId(null)}>

                    <div className={styles.canvasWrapper} ref={containerRef}>
                        <canvas
                            ref={canvasRef}
                            className={styles.canvas}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseOut={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />

                        {/* Rnd Overlays for Images */}
                        {(pageImages[currentPage] || [])
                            .sort((a, b) => a.zIndex - b.zIndex)
                            .map(img => (
                                <Rnd
                                    key={img.id}
                                    position={{ x: img.x * renderScale, y: img.y * renderScale }}
                                    size={{ width: img.width * renderScale, height: img.height * renderScale }}
                                    onDragStop={(e, d) => updateImage(img.id, { x: d.x / renderScale, y: d.y / renderScale })}
                                    onResizeStop={(e, dir, ref, delta, position) => {
                                        updateImage(img.id, {
                                            width: parseInt(ref.style.width, 10) / renderScale,
                                            height: parseInt(ref.style.height, 10) / renderScale,
                                            x: position.x / renderScale,
                                            y: position.y / renderScale
                                        });
                                    }}
                                    scale={renderScale}
                                    style={{
                                        zIndex: 10 + img.zIndex, // keep above canvas which relies on DOM flow
                                    }}
                                    className={selectedImageId === img.id ? styles.selectedImage : ''}
                                    onMouseDown={(e: MouseEvent) => { e.stopPropagation(); setSelectedImageId(img.id); }}
                                    onTouchStart={(e: TouchEvent) => { e.stopPropagation(); setSelectedImageId(img.id); }}
                                    bounds="parent"
                                    lockAspectRatio={true}
                                >
                                    <img
                                        src={img.src}
                                        alt="comic-element"
                                        style={{ width: '100%', height: '100%', pointerEvents: 'none', objectFit: 'contain' }}
                                        draggable={false}
                                    />
                                </Rnd>
                            ))
                        }
                    </div>

                    {/* Page Pagination Controls */}
                    <div className={styles.paginationControls} onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            className={styles.pageNavBtn}
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 0}
                        >
                            <ChevronLeft size={24} /> ก่อนหน้า
                        </button>

                        <span className={styles.pageIndicator}>
                            หน้า {currentPage + 1}
                        </span>

                        {currentPage === pages.length - 1 ? (
                            <button className={styles.addPageBtn} onClick={addNewPage}>
                                <Plus size={20} /> เพิ่มหน้าใหม่
                            </button>
                        ) : (
                            <button className={styles.pageNavBtn} onClick={() => goToPage(currentPage + 1)}>
                                ถัดไป <ChevronRight size={24} />
                            </button>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
