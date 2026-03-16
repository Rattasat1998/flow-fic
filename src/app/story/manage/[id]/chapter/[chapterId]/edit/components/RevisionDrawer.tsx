'use client';

import { X } from 'lucide-react';
import styles from '../edit.module.css';
import type { ChapterRevision, RevisionRow } from './types';

type RevisionDrawerProps = {
  isOpen: boolean;
  isLoading: boolean;
  revisionRows: RevisionRow[];
  disabled: boolean;
  onClose: () => void;
  onRestore: (revision: ChapterRevision) => void;
  getRevisionTypeLabel: (revisionType: ChapterRevision['revision_type']) => string;
};

export function RevisionDrawer({
  isOpen,
  isLoading,
  revisionRows,
  disabled,
  onClose,
  onRestore,
  getRevisionTypeLabel,
}: RevisionDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.revisionDrawerBackdrop} onClick={onClose}>
      <aside className={styles.revisionDrawer} onClick={(event) => event.stopPropagation()}>
        <div className={styles.revisionDrawerHeader}>
          <div>
            <h3>ประวัติการแก้ไข</h3>
            <span>{isLoading ? 'กำลังโหลด...' : `${revisionRows.length} รายการ`}</span>
          </div>
          <button type="button" className={styles.revisionDrawerCloseBtn} onClick={onClose} aria-label="ปิดประวัติการแก้ไข">
            <X size={18} />
          </button>
        </div>

        {revisionRows.length === 0 ? (
          <p className={styles.revisionEmpty}>ยังไม่มีประวัติการแก้ไขในตอนนี้</p>
        ) : (
          <div className={styles.revisionList}>
            {revisionRows.map(({ revision, diff }) => (
              <div className={styles.revisionItem} key={revision.id}>
                <div className={styles.revisionMeta}>
                  <strong>{getRevisionTypeLabel(revision.revision_type)}</strong>
                  <span>
                    {new Date(revision.created_at).toLocaleString('th-TH', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className={styles.revisionActions}>
                  <span className={styles.revisionTitle}>{revision.title || 'ไม่มีชื่อ'}</span>
                  <button
                    type="button"
                    className={styles.revisionRestoreBtn}
                    onClick={() => onRestore(revision)}
                    disabled={disabled}
                  >
                    กู้คืนเวอร์ชันนี้
                  </button>
                </div>

                <div className={styles.revisionChangeSummary}>{diff.highlights.join(' • ')}</div>

                <div className={styles.revisionDiffPreview}>
                  <div>
                    <span>ก่อนหน้า</span>
                    <p>{diff.beforeText}</p>
                  </div>
                  <div>
                    <span>เวอร์ชันนี้</span>
                    <p>{diff.afterText}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
