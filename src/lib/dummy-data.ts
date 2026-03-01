import { ChatMessage, Character, Story } from '@/types/chat';

export const MOCK_CHARACTER: Character = {
    id: 'char_1',
    name: 'Leo',
    avatarUrl: 'https://i.pravatar.cc/150?u=leo',
};

export const MOCK_STORY_SCRIPT: ChatMessage[] = [
    {
        id: 'msg_1',
        sender: 'character',
        text: 'นี่นาย! ทำไมเพิ่งมาเนี่ย?',
        emotion: 'angry',
        timestamp: Date.now() - 10000,
    },
    {
        id: 'msg_2',
        sender: 'player',
        text: 'โทษทีๆ รถติดนิดหน่อยน่ะ',
        emotion: 'neutral',
        timestamp: Date.now() - 5000,
    },
    {
        id: 'msg_3',
        sender: 'character',
        text: 'ข้ออ้างเดิมๆ ตลอดเลยนะ ถ้ารู้ว่ารถติดก็รีบออกสิ',
        emotion: 'angry',
        timestamp: Date.now() - 2000,
    },
    {
        id: 'msg_4',
        sender: 'character',
        text: 'ช่างเถอะ... หิวหรือยัง? ฉันสั่งอะไรมากินกันไหม?',
        emotion: 'neutral',
        timestamp: Date.now(),
    },
];

export const MOCK_STORIES: Story[] = [
    {
        id: 'story_1',
        title: 'บทสนทนาหลังเลิกเรียน',
        author: 'Flow Writer',
        coverUrl: 'https://images.unsplash.com/photo-1510442650500-93217e634e4c?auto=format&fit=crop&w=800&q=80',
        synopsis: 'เรื่องราวสั้นๆ ของเพื่อนร่วมชั้นที่แอบชอบกัน แต่ปากแข็งไม่ยอมรับ',
        category: 'Romance',
        readCount: 15420,
        character: MOCK_CHARACTER,
        script: MOCK_STORY_SCRIPT
    },
    {
        id: 'story_2',
        title: 'ห้องแชทปริศนาตอนตีสาม',
        author: 'Ghostly',
        coverUrl: 'https://images.unsplash.com/photo-1505635552518-3448ff116afe?auto=format&fit=crop&w=800&q=80',
        synopsis: 'จู่ๆ ก็มีข้อความลึกลับส่งมาให้คุณในตอนกลางดึก และคนส่ง... อาจจะไม่ได้อยู่บนโลกนี้แล้ว',
        category: 'Horror',
        readCount: 8900,
        character: {
            id: 'char_2',
            name: 'Unknown',
            avatarUrl: 'https://i.pravatar.cc/150?u=ghost',
        },
        script: [
            { id: 'm1', sender: 'character', text: 'นอนหรือยัง...', emotion: 'neutral', timestamp: Date.now() },
            { id: 'm2', sender: 'player', text: 'ใครน่ะ? นี่ตีสามแล้วนะ', emotion: 'surprised', timestamp: Date.now() + 1000 },
            { id: 'm3', sender: 'character', text: 'ฉันอยู่หน้าห้องคุณ เปิดประตูสิ', emotion: 'neutral', timestamp: Date.now() + 2000 },
        ]
    },
    {
        id: 'story_3',
        title: 'ภารกิจลับกอบกู้โลก',
        author: 'Agent X',
        coverUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
        synopsis: 'ร่วมมือกับสายลับสาวสุดโหดเพื่อหยุดยั้งแผนร้ายระดับชาติผ่านการสั่งงานในแอปพลิเคชัน',
        category: 'Action',
        readCount: 22100,
        character: {
            id: 'char_3',
            name: 'Agent Sarah',
            avatarUrl: 'https://i.pravatar.cc/150?u=sarah',
        },
        script: [
            { id: 'x1', sender: 'character', text: 'รหัสแดง! เข้าที่หลบภัยด่วน!', emotion: 'surprised', timestamp: Date.now() },
        ]
    }
];

export const MOCK_BANNERS = [
    { id: 'b1', imageUrl: 'https://images.unsplash.com/photo-1518621736915-f3b1c41bfd00?auto=format&fit=crop&w=1200&q=80' },
    { id: 'b2', imageUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1200&q=80' },
    { id: 'b3', imageUrl: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80' },
];
