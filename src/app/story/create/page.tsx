'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    FileEdit,
    MessageCircle,
    Layers,
    AlignJustify
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
            {/* Header */}
            <header className={styles.header}>
                <h1 className={styles.pageTitle}>สร้างผลงานใหม่</h1>
                <div style={{ width: 68 }}></div> {/* Spacer for centering */}
            </header>

            <div className={styles.content}>

                {/* Writing Style Section */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>สไตล์งานเขียน</h2>
                    <div className={styles.grid}>
                        <button
                            className={`${styles.optionBtn} ${style === 'narrative' ? styles.activeOption : ''}`}
                            onClick={() => setStyle('narrative')}
                        >
                            <FileEdit size={24} className={styles.icon} />
                            <span className={styles.label}>บรรยาย</span>
                        </button>

                        <button
                            className={`${styles.optionBtn} ${style === 'chat' ? styles.activeOption : ''}`}
                            onClick={() => setStyle('chat')}
                        >
                            <MessageCircle size={24} className={styles.icon} />
                            <span className={styles.label}>แชท</span>
                        </button>
                    </div>
                </div>

                {/* Format Section */}
                <div className={styles.section}>
                    <h2 className={styles.sectionTitle}>ประเภทงานเขียน</h2>
                    <div className={styles.grid}>
                        <button
                            className={`${styles.optionBtn} ${format === 'multi' ? styles.activeOption : ''}`}
                            onClick={() => setFormat('multi')}
                        >
                            <Layers size={24} className={styles.icon} />
                            <span className={styles.label}>มีหลายตอน</span>
                        </button>

                        <button
                            className={`${styles.optionBtn} ${format === 'single' ? styles.activeOption : ''}`}
                            onClick={() => setFormat('single')}
                        >
                            <AlignJustify size={24} className={styles.icon} />
                            <span className={styles.label}>ตอนเดียวจบ</span>
                        </button>
                    </div>
                </div>

                {/* Submit Action */}
                <div className={styles.submitSection}>
                    <button className={styles.submitBtn} onClick={handleNext}>
                        ถัดไป
                    </button>
                </div>

            </div>
        </main>
    );
}
