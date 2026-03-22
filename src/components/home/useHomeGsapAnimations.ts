'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef, type RefObject } from 'react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

type HomeGsapAnimationRefs = {
  rootRef: RefObject<HTMLElement | null>;
  navbarRef: RefObject<HTMLElement | null>;
  heroRef: RefObject<HTMLElement | null>;
  trendingRef: RefObject<HTMLElement | null>;
  mainCategoryMapRef: RefObject<HTMLElement | null>;
  editorRef: RefObject<HTMLElement | null>;
  writerCtaRef: RefObject<HTMLElement | null>;
  isGridMode: boolean;
};

type RevealConfig = {
  trendingCards: number;
  shelfCards: number;
  editorCards: number;
  sectionOffsetY: number;
  cardOffsetY: number;
  sectionDuration: number;
  cardDuration: number;
};

type RevealOptions = {
  start: string;
  cardSelector?: string;
  cardCount?: number;
  config: RevealConfig;
};

function getRevealConfig(variant: 'mobile' | 'tablet' | 'desktop'): RevealConfig {
  if (variant === 'mobile') {
    return {
      trendingCards: 2,
      shelfCards: 2,
      editorCards: 2,
      sectionOffsetY: 20,
      cardOffsetY: 16,
      sectionDuration: 0.42,
      cardDuration: 0.36,
    };
  }

  if (variant === 'tablet') {
    return {
      trendingCards: 3,
      shelfCards: 4,
      editorCards: 2,
      sectionOffsetY: 26,
      cardOffsetY: 20,
      sectionDuration: 0.52,
      cardDuration: 0.42,
    };
  }

  return {
    trendingCards: 4,
    shelfCards: 6,
    editorCards: 3,
    sectionOffsetY: 30,
    cardOffsetY: 24,
    sectionDuration: 0.58,
    cardDuration: 0.46,
  };
}

function createSectionReveal(
  container: HTMLElement | null,
  { start, cardSelector, cardCount = 0, config }: RevealOptions
) {
  if (!container) return;

  const cards = cardSelector
    ? gsap.utils.toArray<HTMLElement>(cardSelector, container).slice(0, cardCount)
    : [];

  gsap.set(container, { autoAlpha: 0, y: config.sectionOffsetY });
  if (cards.length > 0) {
    gsap.set(cards, { autoAlpha: 0, y: config.cardOffsetY });
  }

  ScrollTrigger.create({
    trigger: container,
    start,
    once: true,
    onEnter: () => {
      const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } });
      timeline.to(container, {
        autoAlpha: 1,
        y: 0,
        duration: config.sectionDuration,
      });

      if (cards.length > 0) {
        timeline.to(
          cards,
          {
            autoAlpha: 1,
            y: 0,
            duration: config.cardDuration,
            stagger: 0.07,
          },
          0.08
        );
      }
    },
  });
}

export function useHomeGsapAnimations({
  rootRef,
  navbarRef,
  heroRef,
  trendingRef,
  mainCategoryMapRef,
  editorRef,
  writerCtaRef,
  isGridMode,
}: HomeGsapAnimationRefs) {
  const hasPlayedIntroRef = useRef(false);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root || typeof window === 'undefined') return;

      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReducedMotion) {
        gsap.set(
          [
            '[data-gsap="navbar"]',
            '[data-gsap-intro]',
            '[data-gsap-section]',
            '[data-gsap-shelf-group]',
            '[data-gsap-card]',
            '[data-gsap-grid-mode]',
          ],
          { clearProps: 'all' }
        );
        return;
      }

      if (!hasPlayedIntroRef.current) {
        const navbar = navbarRef.current;
        const heroIntroTargets = gsap.utils.toArray<HTMLElement>('[data-gsap-intro]', heroRef.current ?? root);

        if (navbar) {
          gsap.fromTo(
            navbar,
            { autoAlpha: 0, y: -18 },
            { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' }
          );
        }

        if (heroIntroTargets.length > 0) {
          gsap.fromTo(
            heroIntroTargets,
            { autoAlpha: 0, y: 24 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.56,
              ease: 'power2.out',
              stagger: 0.08,
              delay: 0.1,
            }
          );
        }

        hasPlayedIntroRef.current = true;
      }

      const mm = gsap.matchMedia();

      const registerSectionAnimations = (variant: 'mobile' | 'tablet' | 'desktop') => {
        const config = getRevealConfig(variant);

        createSectionReveal(trendingRef.current, {
          start: 'top 82%',
          cardSelector: '[data-gsap-card="trending"]',
          cardCount: config.trendingCards,
          config,
        });

        const categorySection = mainCategoryMapRef.current;
        if (categorySection) {
          const categoryGroups = gsap.utils.toArray<HTMLElement>('[data-gsap-shelf-group]', categorySection);

          if (categoryGroups.length > 0) {
            categoryGroups.forEach((group) => {
              createSectionReveal(group, {
                start: 'top 88%',
                cardSelector: '[data-gsap-card="main-category"]',
                cardCount: config.shelfCards,
                config,
              });
            });
          } else {
            const gridModeContainer = categorySection.querySelector<HTMLElement>('[data-gsap-grid-mode]');
            if (gridModeContainer) {
              createSectionReveal(gridModeContainer, {
                start: 'top 86%',
                cardSelector: '[data-gsap-card="grid-category"]',
                cardCount: Math.max(config.shelfCards, 4),
                config,
              });
            } else {
              createSectionReveal(categorySection, {
                start: 'top 86%',
                config,
              });
            }
          }
        }

        createSectionReveal(editorRef.current, {
          start: 'top 84%',
          cardSelector: '[data-gsap-card="editor"]',
          cardCount: config.editorCards,
          config,
        });

        createSectionReveal(writerCtaRef.current, {
          start: 'top 88%',
          config,
        });
      };

      mm.add('(max-width: 767px)', () => {
        registerSectionAnimations('mobile');
      });

      mm.add('(min-width: 768px) and (max-width: 1180px)', () => {
        registerSectionAnimations('tablet');
      });

      mm.add('(min-width: 1181px)', () => {
        registerSectionAnimations('desktop');
      });

      ScrollTrigger.refresh();

      return () => {
        mm.revert();
      };
    },
    {
      scope: rootRef,
      dependencies: [isGridMode],
      revertOnUpdate: true,
    }
  );
}
