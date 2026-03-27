import type { Metadata } from 'next';
import PricingClient from './PricingClient';
import {
  DEFAULT_SITE_TITLE,
  ROOT_SHARE_IMAGE_PATH,
} from '@/lib/server/share';
import {
  buildCollectionPageJsonLd,
  serializeJsonLd,
} from '@/lib/server/seo';

const PRICING_TITLE = `เติมเหรียญและสมัคร VIP | ${DEFAULT_SITE_TITLE}`;
const PRICING_DESCRIPTION = 'ดูแพ็กเกจเหรียญและสมัคร VIP เพื่อปลดล็อกประสบการณ์การอ่านนิยายพรีเมียมบน FlowFic';

export const metadata: Metadata = {
  title: PRICING_TITLE,
  description: PRICING_DESCRIPTION,
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    type: 'website',
    title: PRICING_TITLE,
    description: PRICING_DESCRIPTION,
    url: '/pricing',
    images: [ROOT_SHARE_IMAGE_PATH],
  },
  twitter: {
    card: 'summary_large_image',
    title: PRICING_TITLE,
    description: PRICING_DESCRIPTION,
    images: [ROOT_SHARE_IMAGE_PATH],
  },
};

export default function PricingPage() {
  const collectionJsonLd = buildCollectionPageJsonLd('/pricing', 'หน้าเติมเหรียญและสมัคร VIP', PRICING_DESCRIPTION);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }}
      />
      <PricingClient />
    </>
  );
}
