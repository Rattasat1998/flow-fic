import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ประกาศคุกกี้และการติดตามการใช้งาน | FlowFic",
  description: "ประกาศการใช้คุกกี้และข้อมูลการใช้งานบนเว็บไซต์ FlowFic",
};

export default function CookieTrackingNoticePage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>ประกาศคุกกี้และการติดตามการใช้งาน</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. วัตถุประสงค์</h2>
        <p>
          เว็บไซต์ FlowFic ใช้คุกกี้และข้อมูลเซสชันที่จำเป็นเพื่อให้บริการพื้นฐาน เช่น การเข้าสู่ระบบ
          การรักษาสถานะผู้ใช้ และการปรับปรุงความเสถียรของระบบ
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. ประเภทข้อมูลที่อาจถูกใช้</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>คุกกี้ที่จำเป็นต่อการทำงานของเว็บไซต์</li>
          <li>ข้อมูลเซสชันเพื่อความปลอดภัยและการยืนยันตัวตน</li>
          <li>ข้อมูลพฤติกรรมการใช้งานแบบรวม (aggregated) เพื่อวิเคราะห์และพัฒนาบริการ</li>
        </ol>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. การจัดการคุกกี้</h2>
        <p>
          ผู้ใช้สามารถจัดการคุกกี้ผ่านการตั้งค่าเบราว์เซอร์ได้ อย่างไรก็ตามการปิดคุกกี้บางประเภท
          อาจส่งผลให้ฟีเจอร์บางส่วนของเว็บไซต์ไม่สามารถใช้งานได้ตามปกติ
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>4. การเปลี่ยนแปลงประกาศ</h2>
        <p>
          เว็บไซต์อาจปรับปรุงประกาศนี้เป็นครั้งคราว โดยจะแสดงวันที่อัปเดตล่าสุดบนหน้านี้
          และให้มีผลเมื่อเผยแพร่บนเว็บไซต์
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
      </p>
      <Link href="/billing-policies">กลับไปหน้ารวมนโยบาย</Link>
    </main>
  );
}
