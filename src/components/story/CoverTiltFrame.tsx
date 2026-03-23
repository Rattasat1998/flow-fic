'use client';

import { useCallback, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import styles from './CoverTiltFrame.module.css';

type CoverTiltFrameProps = {
    children: ReactNode;
    className?: string;
    isEnabled?: boolean;
};

function supportsCoverTilt(pointerType: string): boolean {
    if (pointerType === 'touch') return false;
    if (typeof window === 'undefined') return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resetCoverTilt(node: HTMLDivElement): void {
    node.dataset.tiltActive = 'false';
    node.style.setProperty('--story-card-tilt-x', '0deg');
    node.style.setProperty('--story-card-tilt-y', '0deg');
    node.style.setProperty('--story-card-glare-x', '50%');
    node.style.setProperty('--story-card-glare-y', '50%');
    node.style.setProperty('--story-card-glare-opacity', '0');
    node.style.setProperty('--story-card-aura-opacity', '0');
}

export function CoverTiltFrame({
    children,
    className,
    isEnabled = true,
}: CoverTiltFrameProps) {
    const handlePointerEnter = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isEnabled || !supportsCoverTilt(event.pointerType)) return;
        event.currentTarget.dataset.tiltActive = 'true';
    }, [isEnabled]);

    const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isEnabled || !supportsCoverTilt(event.pointerType)) return;

        const node = event.currentTarget;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const relativeX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const relativeY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        const rotateX = (0.5 - relativeY) * 14;
        const rotateY = (relativeX - 0.5) * 14;

        node.dataset.tiltActive = 'true';
        node.style.setProperty('--story-card-tilt-x', `${rotateX.toFixed(2)}deg`);
        node.style.setProperty('--story-card-tilt-y', `${rotateY.toFixed(2)}deg`);
        node.style.setProperty('--story-card-glare-x', `${(relativeX * 100).toFixed(2)}%`);
        node.style.setProperty('--story-card-glare-y', `${(relativeY * 100).toFixed(2)}%`);
        node.style.setProperty('--story-card-glare-opacity', '1');
        node.style.setProperty('--story-card-aura-opacity', '1');
    }, [isEnabled]);

    const handlePointerLeave = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        resetCoverTilt(event.currentTarget);
    }, []);

    const frameClassName = [styles.frame, className].filter(Boolean).join(' ');

    return (
        <div
            className={frameClassName}
            data-tilt-active="false"
            onPointerEnter={isEnabled ? handlePointerEnter : undefined}
            onPointerMove={isEnabled ? handlePointerMove : undefined}
            onPointerLeave={isEnabled ? handlePointerLeave : undefined}
            onPointerCancel={isEnabled ? handlePointerLeave : undefined}
        >
            {children}
            <div className={styles.glare} aria-hidden="true" />
            <div className={styles.aura} aria-hidden="true" />
        </div>
    );
}
