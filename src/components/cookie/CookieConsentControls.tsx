'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useCookieConsent } from '@/contexts/CookieConsentContext';
import styles from './cookie-consent-controls.module.css';

type CookiePreferencesModalProps = {
  analyticsEnabled: boolean;
  closePreferences: () => void;
  rejectAnalytics: () => void;
  savePreferences: (analyticsEnabled: boolean) => void;
};

function CookiePreferencesModal({
  analyticsEnabled,
  closePreferences,
  rejectAnalytics,
  savePreferences,
}: CookiePreferencesModalProps) {
  const [draftAnalytics, setDraftAnalytics] = useState(analyticsEnabled);
  const canSave = useMemo(() => draftAnalytics !== analyticsEnabled, [analyticsEnabled, draftAnalytics]);

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="ตั้งค่าคุกกี้">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>ตั้งค่าคุกกี้</h3>
          <button type="button" className={styles.iconBtn} onClick={closePreferences} aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className={styles.optionRow}>
          <div className={styles.optionInfo}>
            <p className={styles.optionTitle}>Necessary</p>
            <p className={styles.optionHint}>จำเป็นต่อการเข้าสู่ระบบและความปลอดภัยของเว็บไซต์</p>
          </div>
          <div className={styles.optionFixed}>
            <ShieldCheck size={16} />
            เปิดเสมอ
          </div>
        </div>

        <div className={styles.optionRow}>
          <div className={styles.optionInfo}>
            <p className={styles.optionTitle}>Analytics</p>
            <p className={styles.optionHint}>ช่วยวิเคราะห์การใช้งานเพื่อปรับปรุงประสบการณ์</p>
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={draftAnalytics}
              onChange={(event) => setDraftAnalytics(event.target.checked)}
            />
            <span className={styles.toggleTrack} />
          </label>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.btnGhost} onClick={rejectAnalytics}>
            ปฏิเสธ Analytics
          </button>
          <button type="button" className={styles.btnGhost} onClick={closePreferences}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => savePreferences(draftAnalytics)}
            disabled={!canSave}
          >
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
}

export function CookieConsentControls() {
  const {
    consent,
    showBanner,
    isPreferencesOpen,
    openPreferences,
    acceptAll,
    rejectAnalytics,
    savePreferences,
    closePreferences,
  } = useCookieConsent();

  return (
    <>
      {showBanner && (
        <section className={styles.banner} role="dialog" aria-live="polite" aria-label="Cookie consent">
          <div className={styles.bannerText}>
            <p className={styles.bannerTitle}>การตั้งค่าคุกกี้</p>
            <p className={styles.bannerDescription}>
              เราใช้คุกกี้ที่จำเป็นเพื่อการทำงานของระบบ และจะเปิด Analytics ต่อเมื่อคุณยินยอมเท่านั้น
            </p>
          </div>
          <div className={styles.bannerActions}>
            <button type="button" className={styles.btnGhost} onClick={rejectAnalytics}>
              ปฏิเสธ Analytics
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={openPreferences}
            >
              ตั้งค่า
            </button>
            <button type="button" className={styles.btnPrimary} onClick={acceptAll}>
              ยอมรับทั้งหมด
            </button>
          </div>
        </section>
      )}

      {isPreferencesOpen && (
        <CookiePreferencesModal
          analyticsEnabled={consent.analytics}
          closePreferences={closePreferences}
          rejectAnalytics={rejectAnalytics}
          savePreferences={savePreferences}
        />
      )}
    </>
  );
}
