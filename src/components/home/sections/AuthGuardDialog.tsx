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
  onGoogleSignIn: () => void;
  onFacebookSignIn: () => void;
};

export function AuthGuardDialog({
  isOpen,
  title,
  message,
  authError,
  isLoadingAuth,
  isLoggedIn,
  onClose,
  onGoogleSignIn,
  onFacebookSignIn,
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
                onClick={onGoogleSignIn}
                className={`${styles.authBtn} ${styles.googleBtn}`}
              >
                <img
                  src="/google-logo.svg"
                  alt="G"
                  className={styles.providerIcon}
                  onError={(event) => (event.currentTarget.style.display = 'none')}
                />
                เข้าสู่ระบบด้วย Google
              </button>
              <button
                type="button"
                onClick={onFacebookSignIn}
                className={`${styles.authBtn} ${styles.facebookBtn}`}
              >
                <img
                  src="/facebook-logo.svg"
                  alt="f"
                  className={styles.providerIcon}
                  onError={(event) => (event.currentTarget.style.display = 'none')}
                />
                เข้าสู่ระบบด้วย Facebook
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
