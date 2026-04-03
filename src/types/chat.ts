export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised';
export type SenderRole = 'character' | 'player' | 'system';

export interface ChatMessage {
    id: string;
    sender: SenderRole;
    text: string;
    emotion?: Emotion;
    timestamp: number;
    type?: 'paragraph' | 'image';
    imageUrl?: string;
    characterId?: string | null;
}

export interface Character {
    id: string;
    name: string;
    avatarUrl: string | null;
}

export interface Story {
    id: string;
    title: string;
    author: string;
    coverUrl: string;
    synopsis: string;
    category: string;
    readCount: number;
    character: Character;
    script: ChatMessage[];
}
