'use client';

import { Copy, ExternalLink, Plus, Trash2, ArrowRight } from 'lucide-react';
import styles from '../edit.module.css';
import type { BranchChoiceDraft, BranchGraphSelection, BranchTargetOption } from './types';

type ChoiceIssueState = {
  missingText: boolean;
  missingTarget: boolean;
};

type BranchInspectorProps = {
  selected: BranchGraphSelection;
  selectedChoice: BranchChoiceDraft | null;
  selectedTarget: BranchTargetOption | null;
  chapterTargets: BranchTargetOption[];
  choiceIssues: ChoiceIssueState;
  isCreatingTarget?: boolean;
  onUpdateChoice: (id: string, updates: Partial<BranchChoiceDraft>) => void;
  onRemoveChoice: (id: string) => void;
  onDuplicateChoice: (id: string) => void;
  onCreateTarget: (choiceId: string) => void;
  onEditTarget: (id: string) => void;
  onNavigateToTarget?: (id: string) => void;
  minChoices?: number;
  choiceCount?: number;
};

export function BranchInspector({
  selected,
  selectedChoice,
  selectedTarget,
  chapterTargets,
  choiceIssues,
  isCreatingTarget = false,
  onUpdateChoice,
  onRemoveChoice,
  onDuplicateChoice,
  onCreateTarget,
  onEditTarget,
  onNavigateToTarget,
  minChoices = 0,
  choiceCount = 0,
}: BranchInspectorProps) {
  if (!selected) {
    return (
      <div className={styles.branchInspectorEmpty}>
        เลือกโหนดทางเลือกหรือปลายทางในกราฟเพื่อแก้รายละเอียด
      </div>
    );
  }

  if (selected.type === 'choice' && selectedChoice) {
    return (
      <div className={styles.branchInspectorSection}>
        <div className={styles.branchInspectorHeader}>
          <h4>แก้ไขทางเลือก</h4>
          <span className={styles.branchInspectorBadge}>Choice</span>
        </div>

        <label className={styles.branchInspectorField}>
          <span>ข้อความทางเลือก</span>
          <input
            type="text"
            className={styles.branchInspectorInput}
            value={selectedChoice.choiceText}
            onChange={(event) => onUpdateChoice(selectedChoice.id, { choiceText: event.target.value })}
            placeholder="เช่น เปิดประตูห้องใต้ดิน"
          />
          {choiceIssues.missingText && <small className={styles.branchIssueText}>ต้องมีข้อความทางเลือก</small>}
        </label>

        <label className={styles.branchInspectorField}>
          <span>ตอนปลายทาง</span>
          <select
            className={styles.branchInspectorSelect}
            value={selectedChoice.toChapterId || ''}
            onChange={(event) => onUpdateChoice(selectedChoice.id, { toChapterId: event.target.value || null })}
          >
            <option value="">เลือกตอนปลายทาง...</option>
            {chapterTargets.map((target) => (
              <option key={target.id} value={target.id}>
                ตอน {target.orderIndex + 1}: {target.title}
              </option>
            ))}
          </select>
          {choiceIssues.missingTarget && <small className={styles.branchIssueText}>ต้องเลือกตอนปลายทาง</small>}
        </label>

        <div className={styles.branchInspectorActionsRow}>
          <button
            type="button"
            className={styles.branchInspectorActionBtn}
            onClick={() => onCreateTarget(selectedChoice.id)}
            disabled={isCreatingTarget}
          >
            <Plus size={14} />
            {isCreatingTarget ? 'กำลังสร้าง...' : 'สร้างตอนปลายทาง'}
          </button>
          <button
            type="button"
            className={styles.branchInspectorActionBtn}
            onClick={() => selectedChoice.toChapterId && onEditTarget(selectedChoice.toChapterId)}
            disabled={!selectedChoice.toChapterId}
          >
            <ExternalLink size={14} />
            แก้ไขตอนปลายทาง
          </button>
        </div>

        <label className={styles.branchInspectorField}>
          <span>💭 Consequence Hint (แสดงเมื่อผู้อ่าน hover ค้างบนทางเลือก)</span>
          <textarea
            className={styles.branchInspectorTextarea}
            value={selectedChoice.outcomeText}
            onChange={(event) => onUpdateChoice(selectedChoice.id, { outcomeText: event.target.value })}
            placeholder="เช่น คุณจะพบความลับที่ซ่อนอยู่ในห้องใต้ดิน..."
            rows={3}
          />
        </label>

        <div className={styles.branchInspectorActionsRow}>
          <button
            type="button"
            className={styles.branchInspectorActionBtn}
            onClick={() => onDuplicateChoice(selectedChoice.id)}
          >
            <Copy size={14} />
            ทำซ้ำ
          </button>

          <button
            type="button"
            className={`${styles.branchInspectorActionBtn} ${styles.branchInspectorActionDanger}`}
            onClick={() => onRemoveChoice(selectedChoice.id)}
            disabled={choiceCount <= minChoices}
            title={choiceCount <= minChoices ? `ต้องมีอย่างน้อย ${minChoices} ทางเลือก` : undefined}
          >
            <Trash2 size={14} />
            ลบ
          </button>
        </div>
      </div>
    );
  }

  if (selected.type === 'target' && selectedTarget) {
    return (
      <div className={styles.branchInspectorSection}>
        <div className={styles.branchInspectorHeader}>
          <h4>ตอนปลายทาง</h4>
          <span className={styles.branchInspectorBadge}>Target</span>
        </div>

        <div className={styles.branchInspectorField}>
          <span>ชื่อตอน</span>
          <div className={styles.branchInspectorInput}>
            ตอน {selectedTarget.orderIndex + 1}: {selectedTarget.title}
          </div>
        </div>

        <div className={styles.branchInspectorField}>
          <span>สถานะ</span>
          <div className={styles.branchInspectorInput}>
            {selectedTarget.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
            {selectedTarget.isPremium && selectedTarget.coinPrice > 0
              ? ` · ตอนพิเศษ ${selectedTarget.coinPrice} เหรียญ`
              : ''}
          </div>
        </div>

        <div className={styles.branchInspectorActionsRow}>
          <button
            type="button"
            className={styles.branchInspectorActionBtn}
            onClick={() => onEditTarget(selectedTarget.id)}
          >
            <ExternalLink size={14} />
            แก้ไขใน Modal
          </button>
          <button
            type="button"
            className={styles.branchInspectorActionBtn}
            onClick={() => onNavigateToTarget?.(selectedTarget.id)}
          >
            <ArrowRight size={14} />
            สลับไปแก้ไขตอนนี้
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.branchInspectorEmpty}>
      โหนดนี้ไม่สามารถแก้ไขได้โดยตรง
    </div>
  );
}
