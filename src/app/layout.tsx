import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { WebVitalsReporter } from "@/components/perf/WebVitalsReporter";
import { GaPageViewTracker } from "@/components/analytics/GaPageViewTracker";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_TITLE,
  ROOT_SHARE_IMAGE_PATH,
  getMetadataBase,
} from "@/lib/server/share";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-YCCV3630X1";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: DEFAULT_SITE_TITLE,
  applicationName: DEFAULT_SITE_TITLE,
  description: DEFAULT_SITE_DESCRIPTION,
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
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
            gtag('event', 'page_view', {
              page_path: window.location.pathname + window.location.search,
              page_location: window.location.href,
              page_title: document.title,
            });
          `}
        </Script>
        <AuthProvider>
          <WebVitalsReporter />
          <Suspense fallback={null}>
            <GaPageViewTracker measurementId={GA_MEASUREMENT_ID} />
          </Suspense>
          <div className="appShell">
            <div className="appContent">{children}</div>
            <SiteFooter />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
