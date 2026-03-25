import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

export type ModalProps = {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    disableClose?: boolean;
};

export function Modal({ 
    isOpen, 
    onClose, 
    title, 
    children, 
    footer, 
    className = '', 
    style = {},
    disableClose = false 
}: ModalProps) {
    useEffect(() => {
        if (!isOpen) return;
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !disableClose) {
                onClose();
            }
        };

        const originalBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = originalBodyOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, disableClose]);

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div className={styles.modalOverlay} onClick={() => !disableClose && onClose()}>
            <div 
                className={`${styles.modalContent} ${className}`} 
                style={style}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                {disableClose && (
                    <div 
                        style={{
                            position: 'absolute',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(2, 6, 23, 0.3)',
                            zIndex: 100,
                            cursor: 'wait'
                        }} 
                    />
                )}
                <div className={styles.modalHeader}>
                    {typeof title === 'string' ? <h2>{title}</h2> : title}
                    <button 
                        className={styles.closeBtn} 
                        onClick={() => !disableClose && onClose()} 
                        disabled={disableClose}
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {children}
                </div>
                {footer && (
                    <div className={styles.modalFooter}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
