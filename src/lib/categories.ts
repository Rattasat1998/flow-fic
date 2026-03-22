export type MainCategory = {
    id: string;
    label: string;
};

export type SubCategory = {
    id: string;
    label: string;
    description: string;
    mainCategoryId: string;
};

export const CORE_MAIN_CATEGORY_ID = 'mystery' as const;
export const CORE_SUB_CATEGORY_IDS = ['mystery_horror', 'mystery_detective'] as const;
export type CoreSubCategoryId = typeof CORE_SUB_CATEGORY_IDS[number];

export const MAIN_CATEGORIES: MainCategory[] = [
    { id: 'mystery', label: 'สืบสวน/ลึกลับ/สยองขวัญ' },
    { id: 'romance', label: 'นิยายรัก' },
    { id: 'fantasy', label: 'แฟนตาซี/Sci-Fi/ไลท์โนเวล' },
    { id: 'social', label: 'สะท้อนสังคม/แนวทางเลือก/เยาวชน' },
    { id: 'boy_love', label: 'Boy Love' },
    { id: 'girl_love', label: 'Girl Love' }
];

export const SUB_CATEGORIES: SubCategory[] = [
    // นิยายรัก
    {
        id: 'romance_general',
        label: 'นิยายรัก',
        description: 'เรื่องราวความรักโรแมนติกของเขาและเธอ',
        mainCategoryId: 'romance'
    },
    {
        id: 'romance_mature',
        label: 'นิยายโรมานซ์',
        description: 'เรื่องราวความรักที่เน้นเนื้อเรื่องเป็นหลัก มีฉากอีโรติกแบบผู้ใหญ่',
        mainCategoryId: 'romance'
    },
    {
        id: 'romance_chinese',
        label: 'นิยายรักจีนโบราณ',
        description: 'เรื่องราวความรักของเขาและเธอ ที่เกิดในช่วงยุคสมัยโบราณ ณ ประเทศจีน',
        mainCategoryId: 'romance'
    },
    {
        id: 'romance_teen',
        label: 'นิยายรักวัยรุ่น',
        description: 'เรื่องราวความรักในช่วงวัยรุ่น รักใสๆ กุ๊กกิ๊ก ไร้เลิฟซีน',
        mainCategoryId: 'romance'
    },
    {
        id: 'romance_young_adult',
        label: 'นิยายรักวัยว้าวุ่น',
        description: 'เรื่องราวความรักในช่วงวัยรุ่น มีฉากเลิฟซีนให้ใจเต้นตึกตัก',
        mainCategoryId: 'romance'
    },
    {
        id: 'romance_erotica',
        label: 'นิยายรักผู้ใหญ่',
        description: 'เรื่องราวความรักร้อนแรงที่เน้นฉากอีโรติกเป็นหลัก',
        mainCategoryId: 'romance'
    },

    // แฟนตาซี
    {
        id: 'fantasy_isekai',
        label: 'แฟนตาซี เกมออนไลน์ ต่างโลก',
        description: 'ท่องไปในต่างโลก ทะลุมิติ เวทมนตร์ สัตว์มหัศจรรย์ พลังวิเศษ',
        mainCategoryId: 'fantasy'
    },
    {
        id: 'fantasy_scifi',
        label: 'Sci-Fi',
        description: 'นิยายแนววิทยาศาสตร์ อวกาศ โลกคู่ขนาน โลกอนาคต',
        mainCategoryId: 'fantasy'
    },
    {
        id: 'fantasy_action',
        label: 'ผจญภัย แอคชัน กำลังภายใน',
        description: 'เรื่องราวการผจญภัยชวนระทึก บู๊แอคชัน กำลังภายใน',
        mainCategoryId: 'fantasy'
    },

    // สืบสวน
    {
        id: 'mystery_detective',
        label: 'สืบสวน',
        description: 'เรื่องราวซับซ้อนซ่อนเงื่อน สืบสวน ไขคดีต่างๆ',
        mainCategoryId: 'mystery'
    },
    {
        id: 'mystery_supernatural',
        label: 'ลึกลับ',
        description: 'เรื่องราวลึกลับในชีวิตประจำวัน สิ่งลี้ลับเหนือธรรมชาติ ที่ยังคงเป็นปริศนา',
        mainCategoryId: 'mystery'
    },
    {
        id: 'mystery_horror',
        label: 'สยองขวัญ',
        description: 'เรื่องราวเขย่าขวัญสั่นประสาทชวนหัวลุก',
        mainCategoryId: 'mystery'
    },

    // สะท้อนสังคม
    {
        id: 'social_drama',
        label: 'สะท้อนสังคม / ดราม่า',
        description: 'นิยายที่ตีแผ่ชีวิตและปัญหาสังคม',
        mainCategoryId: 'social'
    },
    {
        id: 'social_youth',
        label: 'วรรณกรรมเยาวชน',
        description: 'นิยายอ่านง่าย ให้ข้อคิด เสริมสร้างจินตนาการ เหมาะกับเด็กและเยาวชน',
        mainCategoryId: 'social'
    },
    {
        id: 'social_inspirational',
        label: 'เสริมสร้างกำลังใจ',
        description: 'เรื่องราวที่สร้างแรงบันดาลใจ ให้ข้อคิดในการดำเนินชีวิต',
        mainCategoryId: 'social'
    },

    // Boy Love
    {
        id: 'bl_lovely',
        label: 'นิยาย Boy Love Lovely Room',
        description: 'เรื่องราวความรักระหว่างหนุ่มๆ อาจมีฉากกุ๊กกิ๊กพอประปราย',
        mainCategoryId: 'boy_love'
    },
    {
        id: 'bl_party',
        label: 'นิยาย Boy Love Party Room',
        description: '[หมวดใหม่!] เรื่องราวความรักระหว่างหนุ่มๆ ที่เน้นเนื้อเรื่องเป็นหลัก มีฉากอีโรติกแบบผู้ใหญ่ได้บ้าง',
        mainCategoryId: 'boy_love'
    },
    {
        id: 'bl_secret',
        label: 'นิยาย Boy Love Secret Room',
        description: 'เรื่องราวความรักร้อนแรงระหว่างหนุ่มๆ ที่เน้นฉากอีโรติกเป็นหลัก',
        mainCategoryId: 'boy_love'
    },

    // Girl Love
    {
        id: 'gl_lovely',
        label: 'นิยาย Girl Love Lovely Room',
        description: 'เรื่องราวความรักระหว่างสาวๆ อาจมีฉากกุ๊กกิ๊กพอประปราย',
        mainCategoryId: 'girl_love'
    },
    {
        id: 'gl_party',
        label: 'นิยาย Girl Love Party Room',
        description: '[หมวดใหม่!] เรื่องราวความรักระหว่างสาวๆ ที่เน้นเนื้อเรื่องเป็นหลัก มีฉากอีโรติกแบบผู้ใหญ่ได้บ้าง',
        mainCategoryId: 'girl_love'
    },
    {
        id: 'gl_secret',
        label: 'นิยาย Girl Love Secret Room',
        description: 'เรื่องราวความรักร้อนแรงระหว่างสาวๆ ที่เน้นฉากอีโรติกเป็นหลัก',
        mainCategoryId: 'girl_love'
    }
];

export function getMainCategoryLabel(mainCategoryId: string | null | undefined): string {
    if (!mainCategoryId) return '';
    return MAIN_CATEGORIES.find((category) => category.id === mainCategoryId)?.label || mainCategoryId;
}

export function getSubCategoryLabel(subCategoryId: string | null | undefined): string {
    if (!subCategoryId) return '';
    return SUB_CATEGORIES.find((subcategory) => subcategory.id === subCategoryId)?.label || subCategoryId;
}

export function isCoreSubCategory(subCategoryId: string | null | undefined): subCategoryId is CoreSubCategoryId {
    return !!subCategoryId && CORE_SUB_CATEGORY_IDS.includes(subCategoryId as CoreSubCategoryId);
}
