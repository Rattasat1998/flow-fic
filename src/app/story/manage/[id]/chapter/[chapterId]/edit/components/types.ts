export type ChapterRevisionType = 'manual_save' | 'publish' | 'discard' | 'restore';

export type ChapterRevision = {
  id: string;
  revision_type: ChapterRevisionType;
  title: string;
  content: unknown;
  is_premium: boolean;
  coin_price: number;
  created_at: string;
};

export type RevisionDiffSummary = {
  highlights: string[];
  beforeText: string;
  afterText: string;
};

export type RevisionRow = {
  revision: ChapterRevision;
  diff: RevisionDiffSummary;
};

export type BranchChoiceDraft = {
  id: string;
  choiceText: string;
  toChapterId: string | null;
  outcomeText: string;
  orderIndex: number;
};

export type BranchTargetOption = {
  id: string;
  title: string;
  orderIndex: number;
  status: 'draft' | 'published';
  isPremium: boolean;
  coinPrice: number;
};

export type BranchGraphNodeKind = 'current' | 'choice' | 'target' | 'ending';

export type BranchGraphNodeStatus =
  | 'ready'
  | 'missing_text'
  | 'missing_target'
  | 'draft_target'
  | 'published_target';

export type BranchGraphSelection =
  | { type: 'choice'; id: string }
  | { type: 'target'; id: string }
  | null;

export type BranchGraphNode = {
  id: string;
  label: string;
  subtitle?: string;
  kind: BranchGraphNodeKind;
  status: BranchGraphNodeStatus;
  x: number;
  y: number;
  selection?: Exclude<BranchGraphSelection, null>;
  choiceId?: string;
};

export type BranchGraphEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  choiceId?: string;
  isMissing?: boolean;
};
