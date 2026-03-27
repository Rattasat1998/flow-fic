import { Upload, X } from 'lucide-react';
import type { ChangeEvent, RefObject } from 'react';
import { WalletLedgerPanel } from '@/components/profile/WalletLedgerPanel';
import styles from '@/app/home.module.css';

type ProfileFormState = {
  pen_name: string;
  bio: string;
  avatar_url: string | null;
};

type ProfileSettingsModalProps = {
  isOpen: boolean;
  userId: string | null;
  profile: ProfileFormState;
  avatarPreviewUrl: string | null;
  isSaving: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onAvatarChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenFilePicker: () => void;
  onPenNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onSave: () => void;
};

export function ProfileSettingsModal({
  isOpen,
  userId,
  profile,
  avatarPreviewUrl,
  isSaving,
  fileInputRef,
  onClose,
  onAvatarChange,
  onOpenFilePicker,
  onPenNameChange,
  onBioChange,
  onSave,
}: ProfileSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalContent} ${styles.profileModalWide}`}>
        <div className={styles.modalHeader}>
          <h2>ตั้งค่าโปรไฟล์นักเขียน</h2>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            <X size={20} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.avatarSection}>
            {avatarPreviewUrl ? (
              <img src={avatarPreviewUrl} alt="Preview" className={styles.avatarPreview} />
            ) : (
              <div className={styles.avatarPlaceholder}>{profile.pen_name.charAt(0).toUpperCase() || 'W'}</div>
            )}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={onAvatarChange}
            />
            <button className={styles.uploadLabel} onClick={onOpenFilePicker} type="button">
              <Upload size={16} /> เปลี่ยนรูปโปรไฟล์
            </button>
          </div>

          <div className={styles.formGroup}>
            <label>นามปากกาหลัก</label>
            <input
              type="text"
              className={styles.inputField}
              value={profile.pen_name}
              onChange={(event) => onPenNameChange(event.target.value)}
              placeholder="เช่น Flow Writer"
            />
          </div>

          <div className={styles.formGroup}>
            <label>ประวัติย่อ / Bio</label>
            <textarea
              className={styles.textareaField}
              value={profile.bio}
              onChange={(event) => onBioChange(event.target.value)}
              placeholder="เล่าเกี่ยวกับตัวคุณสั้นๆ..."
              rows={3}
            />
          </div>

          <WalletLedgerPanel userId={userId} />
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={isSaving}>
            ยกเลิก
          </button>
          <button className={styles.saveBtn} onClick={onSave} disabled={isSaving || !profile.pen_name.trim()}>
            {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </button>
        </div>
      </div>
    </div>
  );
}
