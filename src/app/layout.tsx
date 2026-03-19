import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { WebVitalsReporter } from "@/components/perf/WebVitalsReporter";
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_TITLE,
  ROOT_SHARE_IMAGE_PATH,
  getMetadataBase,
} from "@/lib/server/share";

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
        <AuthProvider>
          <WebVitalsReporter />
          <div className="appShell">
            <div className="appContent">{children}</div>
            <footer className="appFooter">
              <div className="appFooterInner">
                <div className="appFooterLinks">
                  <Link href="/terms">ข้อกำหนดและเงื่อนไข</Link>
                  <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
                  <Link href="/billing-policies">ศูนย์นโยบาย</Link>
                  <Link href="/cookie-tracking-notice">คุกกี้</Link>
                  <Link href="/data-deletion">การลบข้อมูล</Link>
                  <Link href="/legal-contact-and-versioning">ติดต่อทางกฎหมาย</Link>
                </div>
                <p className="appFooterCopy">© {new Date().getFullYear()} FlowFic</p>
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
