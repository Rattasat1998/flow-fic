import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlowFic",
  applicationName: "FlowFic",
  description: "แพลตฟอร์มอ่านเขียนนิยายสยองขวัญและสืบสวนที่ให้ผู้อ่านเลือกเส้นทางเรื่องได้",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
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
