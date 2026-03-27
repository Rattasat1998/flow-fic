import 'server-only';

export type ModerationCategory =
  | 'explicitStrong'
  | 'explicitMild'
  | 'minorTerms'
  | 'coercionTerms';

export type ChapterPublishModerationInput = {
  title: unknown;
  content: unknown;
};

export type ChapterPublishModerationResult = {
  allowed: boolean;
  score: number;
  reasons: string[];
  matchedCategories: ModerationCategory[];
};

const SCORE_THRESHOLD = 6;

const TERM_GROUPS: Record<ModerationCategory, string[]> = {
  explicitStrong: [
    'เย็ด',
    'ควย',
    'หี',
    'หำ',
    'fuck',
    'fucking',
    'blowjob',
    'handjob',
    'cunnilingus',
    'fellatio',
    'penetration',
    'anal sex',
    'oral sex',
    'rape',
    'incest',
  ],
  explicitMild: [
    'sex',
    'sexy',
    'nude',
    'nudity',
    'naked',
    'make out',
    'เร่าร้อน',
    'ปลุกเร้า',
    'ลูบไล้',
    'จูบดูดดื่ม',
  ],
  minorTerms: [
    'เด็ก',
    'ผู้เยาว์',
    'นักเรียน',
    'teen',
    'teenager',
    'under 18',
    'minor',
    'child',
    'kid',
    'loli',
    'โลลิ',
  ],
  coercionTerms: [
    'บังคับ',
    'ขืนใจ',
    'ข่มขืน',
    'ไม่ยินยอม',
    'ล่วงละเมิด',
    'forced',
    'forceful',
    'non-consensual',
    'non consensual',
    'coercion',
    'coerce',
    'blackmail',
  ],
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toRegex = (terms: string[]) =>
  new RegExp(terms.map(escapeRegExp).join('|'), 'giu');

const GROUP_REGEX: Record<ModerationCategory, RegExp> = {
  explicitStrong: toRegex(TERM_GROUPS.explicitStrong),
  explicitMild: toRegex(TERM_GROUPS.explicitMild),
  minorTerms: toRegex(TERM_GROUPS.minorTerms),
  coercionTerms: toRegex(TERM_GROUPS.coercionTerms),
};

const normalizeText = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const maybeParseJsonString = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
};

const pushString = (target: string[], value: unknown) => {
  if (typeof value !== 'string') return;
  const normalized = normalizeText(value);
  if (normalized.length > 0) {
    target.push(normalized);
  }
};

const extractTextFromContent = (content: unknown): string[] => {
  const segments: string[] = [];
  if (!content) return segments;

  if (typeof content === 'string') {
    const maybeJson = maybeParseJsonString(content);
    if (typeof maybeJson === 'string') {
      pushString(segments, maybeJson);
      return segments;
    }
    return extractTextFromContent(maybeJson);
  }

  if (typeof content !== 'object' || Array.isArray(content)) return segments;
  const payload = content as Record<string, unknown>;

  pushString(segments, payload.text);

  const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const blockObject = block as Record<string, unknown>;
    pushString(segments, blockObject.text);
  }

  const branchChoices = Array.isArray(payload.branchChoices) ? payload.branchChoices : [];
  const chapterChoices = Array.isArray(payload.chapterChoices) ? payload.chapterChoices : [];
  const mergedChoices = [...branchChoices, ...chapterChoices];

  for (const choice of mergedChoices) {
    if (!choice || typeof choice !== 'object') continue;
    const choiceObject = choice as Record<string, unknown>;
    pushString(segments, choiceObject.choiceText);
    pushString(segments, choiceObject.choice_text);
    pushString(segments, choiceObject.outcomeText);
    pushString(segments, choiceObject.outcome_text);
  }

  return segments;
};

const countMatches = (text: string, regex: RegExp): number => {
  const localRegex = new RegExp(regex.source, regex.flags);
  const matches = text.match(localRegex);
  return matches ? matches.length : 0;
};

const buildMatchedCategories = (counts: Record<ModerationCategory, number>): ModerationCategory[] => {
  return (Object.keys(counts) as ModerationCategory[]).filter((category) => counts[category] > 0);
};

const buildReasons = (params: {
  hasExplicitSignal: boolean;
  minorHits: number;
  coercionHits: number;
  explicitScore: number;
}): string[] => {
  const reasons: string[] = [];

  if (params.hasExplicitSignal && params.minorHits > 0) {
    reasons.push('พบเนื้อหาเชิงเพศที่เชื่อมโยงผู้เยาว์ ซึ่งไม่อนุญาตให้เผยแพร่');
  }

  if (params.hasExplicitSignal && params.coercionHits > 0) {
    reasons.push('พบเนื้อหาเชิงเพศที่เกี่ยวข้องกับการบังคับหรือไม่ยินยอม ซึ่งไม่อนุญาตให้เผยแพร่');
  }

  if (params.explicitScore >= SCORE_THRESHOLD) {
    reasons.push('พบเนื้อหาเชิงเพศชัดเจนเกินเกณฑ์การเผยแพร่ กรุณาปรับถ้อยคำให้เหมาะสม');
  }

  return reasons;
};

export function evaluateChapterPublishModeration(
  input: ChapterPublishModerationInput,
): ChapterPublishModerationResult {
  const segments: string[] = [];
  pushString(segments, input.title);
  segments.push(...extractTextFromContent(input.content));

  if (segments.length === 0) {
    return {
      allowed: true,
      score: 0,
      reasons: [],
      matchedCategories: [],
    };
  }

  const aggregateText = segments.join(' ');
  const counts: Record<ModerationCategory, number> = {
    explicitStrong: countMatches(aggregateText, GROUP_REGEX.explicitStrong),
    explicitMild: countMatches(aggregateText, GROUP_REGEX.explicitMild),
    minorTerms: countMatches(aggregateText, GROUP_REGEX.minorTerms),
    coercionTerms: countMatches(aggregateText, GROUP_REGEX.coercionTerms),
  };

  const explicitScore = counts.explicitStrong * 3 + counts.explicitMild * 1.5;
  const hasExplicitSignal = counts.explicitStrong > 0 || counts.explicitMild >= 2;
  const reasons = buildReasons({
    hasExplicitSignal,
    minorHits: counts.minorTerms,
    coercionHits: counts.coercionTerms,
    explicitScore,
  });
  const score = Number((explicitScore + counts.minorTerms + counts.coercionTerms).toFixed(2));

  return {
    allowed: reasons.length === 0,
    score,
    reasons,
    matchedCategories: buildMatchedCategories(counts),
  };
}
