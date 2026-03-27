import { X } from 'lucide-react';
import styles from '@/app/home.module.css';

type AuthGuardDialogProps = {
  isOpen: boolean;
  title: string;
  message: string | null;
  authError: string | null;
  isLoadingAuth: boolean;
  isLoggedIn: boolean;
  onClose: () => void;
  onOpenLoginPage: () => void;
};

export function AuthGuardDialog({
  isOpen,
  title,
  message,
  authError,
  isLoadingAuth,
  isLoggedIn,
  onClose,
  onOpenLoginPage,
}: AuthGuardDialogProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modalContent} ${styles.authGuardDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-auth-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="dashboard-auth-dialog-title">{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.authDialogLead}>
            {message || 'กรุณาเข้าสู่ระบบก่อนเข้าแดชบอร์ดนักเขียน'}
          </p>
          {!isLoadingAuth && !isLoggedIn && (
            <div className={styles.authDialogButtons}>
              <button
                type="button"
                onClick={onOpenLoginPage}
                className={styles.authBtn}
              >
                เข้าสู่ระบบ FlowFic
              </button>
            </div>
          )}
          {authError && <p className={styles.authDialogError}>{authError}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} type="button">
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
