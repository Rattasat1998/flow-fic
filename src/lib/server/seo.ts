import 'server-only';

import { SUPPORT_EMAIL } from '@/lib/support';
import { DEFAULT_SITE_TITLE, getAppOrigin, type StoryShareMeta, type WriterShareMeta } from '@/lib/server/share';
import type { DiscoveryStory } from '@/types/discovery';

const DEFAULT_LANGUAGE = 'th-TH';

const normalizePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

const toAbsoluteImageUrl = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  return `${getAppOrigin()}${normalizePath(value)}`;
};

export const toAbsoluteUrl = (path: string): string => `${getAppOrigin()}${normalizePath(path)}`;

export const serializeJsonLd = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

type ItemListStory = Pick<DiscoveryStory, 'id' | 'title' | 'pen_name' | 'cover_url' | 'cover_wide_url'>;

export type FaqEntry = {
  question: string;
  answer: string;
};

export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': toAbsoluteUrl('/#organization'),
    name: DEFAULT_SITE_TITLE,
    url: toAbsoluteUrl('/'),
    logo: toAbsoluteUrl('/icon.svg'),
    email: SUPPORT_EMAIL,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: SUPPORT_EMAIL,
      },
    ],
  };
}

export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': toAbsoluteUrl('/#website'),
    url: toAbsoluteUrl('/'),
    name: DEFAULT_SITE_TITLE,
    inLanguage: DEFAULT_LANGUAGE,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${toAbsoluteUrl('/')}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildCollectionPageJsonLd(path: string, title: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${toAbsoluteUrl(path)}#collectionpage`,
    url: toAbsoluteUrl(path),
    name: title,
    description,
    inLanguage: DEFAULT_LANGUAGE,
    isPartOf: {
      '@id': toAbsoluteUrl('/#website'),
    },
  };
}

export function buildStoryItemListJsonLd(path: string, name: string, stories: ItemListStory[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${toAbsoluteUrl(path)}#itemlist`,
    name,
    itemListElement: stories.slice(0, 10).map((story, index) => {
      const storyUrl = toAbsoluteUrl(`/story/${story.id}`);
      const image = toAbsoluteImageUrl(story.cover_wide_url || story.cover_url);

      return {
        '@type': 'ListItem',
        position: index + 1,
        url: storyUrl,
        item: {
          '@type': 'Book',
          name: story.title,
          url: storyUrl,
          author: {
            '@type': 'Person',
            name: story.pen_name,
          },
          ...(image ? { image } : {}),
        },
      };
    }),
  };
}

export function buildStoryBookJsonLd(storyId: string, story: StoryShareMeta) {
  const canonicalPath = `/story/${storyId}`;
  const image = toAbsoluteImageUrl(story.coverUrl);

  return {
    '@context': 'https://schema.org',
    '@type': ['Book', 'CreativeWork'],
    '@id': `${toAbsoluteUrl(canonicalPath)}#book`,
    url: toAbsoluteUrl(canonicalPath),
    name: story.title,
    headline: story.title,
    description: story.synopsis || `อ่านนิยายเรื่อง ${story.title} บน ${DEFAULT_SITE_TITLE}`,
    inLanguage: DEFAULT_LANGUAGE,
    author: {
      '@type': 'Person',
      name: story.penName,
    },
    publisher: {
      '@id': toAbsoluteUrl('/#organization'),
    },
    ...(image ? { image } : {}),
  };
}

export function buildWriterProfileJsonLd(writerId: string, writer: WriterShareMeta) {
  const canonicalPath = `/writer/${writerId}`;
  const personId = `${toAbsoluteUrl(canonicalPath)}#person`;
  const avatar = toAbsoluteImageUrl(writer.avatarUrl);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': personId,
        name: writer.penName,
        url: toAbsoluteUrl(canonicalPath),
        description: writer.bio || `โปรไฟล์นักเขียน ${writer.penName} บน ${DEFAULT_SITE_TITLE}`,
        inLanguage: DEFAULT_LANGUAGE,
        ...(avatar ? { image: avatar } : {}),
      },
      {
        '@type': 'ProfilePage',
        '@id': `${toAbsoluteUrl(canonicalPath)}#profilepage`,
        url: toAbsoluteUrl(canonicalPath),
        name: `${writer.penName} | ${DEFAULT_SITE_TITLE}`,
        inLanguage: DEFAULT_LANGUAGE,
        mainEntity: {
          '@id': personId,
        },
      },
    ],
  };
}

export function buildFaqPageJsonLd(faqs: FaqEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
