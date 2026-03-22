'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight,
    FileText,
    Layers3,
    ListChecks,
    MessageSquareText,
} from 'lucide-react';
import styles from './selection.module.css';

type CreateWritingStyle = 'narrative' | 'chat';
type CreateStoryFormat = 'multi' | 'single';

export default function CreateSelectionPage() {
    const router = useRouter();
    const [style, setStyle] = useState<CreateWritingStyle>('narrative');
    const [format, setFormat] = useState<CreateStoryFormat>('multi');

    const handleNext = () => {
        // Include format and style in the query for the text editor
        router.push(`/story/create/text?style=${style}&format=${format}`);
    };

    return (
        <main className={styles.main}>
            <div className={styles.shell}>
                <header className={styles.hero}>
                    <p className={styles.eyebrow}>Writer Setup</p>
                    <h1 className={styles.pageTitle}>สร้างผลงานใหม่</h1>
                    <p className={styles.pageIntro}>
                        เลือกสไตล์และโครงสร้างเริ่มต้นของงานก่อนเข้าสู่หน้ากรอกข้อมูลผลงาน
                    </p>
                </header>

                <section className={styles.selectionCard} aria-labelledby="create-selection-title">
                    <div className={styles.selectionHeader}>
                        <h2 id="create-selection-title" className={styles.selectionTitle}>ตั้งค่าเริ่มต้นของผลงาน</h2>
                        <p className={styles.selectionLead}>คุณสามารถเปลี่ยนรายละเอียดอื่น ๆ ได้ในขั้นตอนถัดไป</p>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeading}>
                            <h3 className={styles.sectionTitle}>สไตล์งานเขียน</h3>
                        </div>

                        <div className={styles.grid}>
                            <button
                                type="button"
                                aria-pressed={style === 'narrative'}
                                className={`${styles.optionBtn} ${style === 'narrative' ? styles.activeOption : ''}`}
                                onClick={() => setStyle('narrative')}
                            >
                                <span className={styles.iconWrap}>
                                    <FileText size={32} className={styles.icon} />
                                </span>
                                <span className={styles.label}>บรรยาย</span>
                            </button>

                            <button
                                type="button"
                                aria-pressed={style === 'chat'}
                                className={`${styles.optionBtn} ${style === 'chat' ? styles.activeOption : ''}`}
                                onClick={() => setStyle('chat')}
                            >
                                <span className={styles.iconWrap}>
                                    <MessageSquareText size={32} className={styles.icon} />
                                </span>
                                <span className={styles.label}>แชท</span>
                            </button>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionHeading}>
                            <h3 className={styles.sectionTitle}>ประเภทงานเขียน</h3>
                        </div>

                        <div className={styles.grid}>
                            <button
                                type="button"
                                aria-pressed={format === 'multi'}
                                className={`${styles.optionBtn} ${format === 'multi' ? styles.activeOption : ''}`}
                                onClick={() => setFormat('multi')}
                            >
                                <span className={styles.iconWrap}>
                                    <Layers3 size={32} className={styles.icon} />
                                </span>
                                <span className={styles.label}>มีหลายตอน</span>
                            </button>

                            <button
                                type="button"
                                aria-pressed={format === 'single'}
                                className={`${styles.optionBtn} ${format === 'single' ? styles.activeOption : ''}`}
                                onClick={() => setFormat('single')}
                            >
                                <span className={styles.iconWrap}>
                                    <ListChecks size={32} className={styles.icon} />
                                </span>
                                <span className={styles.label}>ตอนเดียวจบ</span>
                            </button>
                        </div>
                    </div>

                    <div className={styles.submitSection}>
                        <button
                            type="button"
                            className={styles.submitBtn}
                            onClick={handleNext}
                        >
                            ถัดไป
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </section>
            </div>
        </main>
    );
}
