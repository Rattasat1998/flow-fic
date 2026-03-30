import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { CookieConsentProvider } from "@/contexts/CookieConsentContext";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WebVitalsReporter } from "@/components/perf/WebVitalsReporter";
import { GaPageViewTracker } from "@/components/analytics/GaPageViewTracker";
import { GaBootstrap } from "@/components/analytics/GaBootstrap";
import { CookieConsentControls } from "@/components/cookie/CookieConsentControls";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_TITLE,
  ROOT_SHARE_IMAGE_PATH,
  getMetadataBase,
} from "@/lib/server/share";
import { buildOrganizationJsonLd, buildWebSiteJsonLd, serializeJsonLd } from "@/lib/server/seo";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-YCCV3630X1";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const organizationJsonLd = buildOrganizationJsonLd();
const webSiteJsonLd = buildWebSiteJsonLd();

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: DEFAULT_SITE_TITLE,
  applicationName: DEFAULT_SITE_TITLE,
  description: DEFAULT_SITE_DESCRIPTION,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: DEFAULT_SITE_TITLE,
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    images: [{
      url: ROOT_SHARE_IMAGE_PATH,
      width: 1200,
      height: 630,
      alt: DEFAULT_SITE_TITLE,
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SITE_TITLE,
    description: DEFAULT_SITE_DESCRIPTION,
    images: [ROOT_SHARE_IMAGE_PATH],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(webSiteJsonLd) }}
        />
        <CookieConsentProvider>
          <AuthProvider>
            <GaBootstrap measurementId={GA_MEASUREMENT_ID} />
            <WebVitalsReporter />
            <Suspense fallback={null}>
              <GaPageViewTracker measurementId={GA_MEASUREMENT_ID} />
            </Suspense>
            <div className="appShell">
              <div className="appContent">{children}</div>
              <SiteFooter />
            </div>
            <CookieConsentControls />
          </AuthProvider>
        </CookieConsentProvider>
      </body>
    </html>
  );
}
