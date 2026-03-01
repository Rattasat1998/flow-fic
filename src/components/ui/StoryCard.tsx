import Link from 'next/link';
import { Story } from '@/types/chat';
import styles from './story-card.module.css';

interface StoryCardProps {
    story: Story;
}

export function StoryCard({ story }: StoryCardProps) {
    return (
        <Link href={`/story/${story.id}`} className={styles.card}>
            <div className={styles.imageContainer}>
                <img src={story.coverUrl} alt={story.title} className={styles.coverImage} />
            </div>

            <div className={styles.content}>
                <h3 className={styles.title}>{story.title}</h3>
                <p className={styles.author}>{story.author}</p>
            </div>
        </Link>
    );
}
