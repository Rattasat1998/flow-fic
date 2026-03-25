'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef } from 'react';

type HeroAnimationRefs = {
    heroSectionRef: React.RefObject<HTMLElement | null>;
    heroIndex: number;
};

export function useHomeHeroAnimations({ heroSectionRef, heroIndex }: HeroAnimationRefs) {
    const prevIndexRef = useRef(heroIndex);

    useGSAP(
        () => {
            const heroSection = heroSectionRef.current;
            if (!heroSection || typeof window === 'undefined') return;

            // Skip animation on initial render
            if (prevIndexRef.current === heroIndex) {
                prevIndexRef.current = heroIndex;
                return;
            }

            prevIndexRef.current = heroIndex;

            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (prefersReducedMotion) {
                gsap.set('[data-gsap-hero-content]', { clearProps: 'all' });
                gsap.set('[data-gsap-hero-backdrop]', { clearProps: 'all' });
                return;
            }

            // Get hero content elements (the text content that changes)
            const heroContent = heroSection.querySelectorAll<HTMLElement>('[data-gsap-hero-content]');
            const heroBackdrop = heroSection.querySelector<HTMLElement>('[data-gsap-hero-backdrop]');

            // Animate hero content (fade out old, fade in new)
            const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

            // Fade out current content
            tl.to(heroContent, {
                autoAlpha: 0,
                x: -20,
                duration: 0.25,
                stagger: 0.03,
            });

            // Crossfade the backdrop image
            if (heroBackdrop) {
                tl.to(
                    heroBackdrop,
                    {
                        autoAlpha: 0,
                        scale: 1.05,
                        duration: 0.3,
                    },
                    0
                );
            }

            // Reset and fade in new content
            tl.set(heroContent, { x: 20 });
            tl.to(
                heroContent,
                {
                    autoAlpha: 1,
                    x: 0,
                    duration: 0.4,
                    stagger: 0.05,
                },
                '+=0.05'
            );

            // Restore backdrop
            if (heroBackdrop) {
                tl.set(heroBackdrop, { scale: 0.95 });
                tl.to(
                    heroBackdrop,
                    {
                        autoAlpha: 1,
                        scale: 1,
                        duration: 0.5,
                    },
                    '+=0.05'
                );
            }
        },
        {
            scope: heroSectionRef,
            dependencies: [heroIndex],
        }
    );
}