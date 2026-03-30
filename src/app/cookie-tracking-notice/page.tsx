import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ประกาศคุกกี้และการติดตามการใช้งาน | FlowFic",
  description: "ประกาศการใช้คุกกี้และข้อมูลการใช้งานบนเว็บไซต์ FlowFic",
};

export default function CookieTrackingNoticePage() {
  return (
    <main
      className="ffLegalPage"
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>ประกาศคุกกี้และการติดตามการใช้งาน</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>อัปเดตล่าสุด: March 28, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. วัตถุประสงค์</h2>
        <p>
          FlowFic ใช้คุกกี้ที่จำเป็นเพื่อให้เว็บไซต์ทำงานได้ตามปกติ และใช้คุกกี้ Analytics
          เฉพาะเมื่อผู้ใช้ให้ความยินยอมเท่านั้น
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. หมวดคุกกี้ที่ใช้ในระบบ</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>
            <strong>Necessary (เปิดเสมอ):</strong> ใช้สำหรับการเข้าสู่ระบบ ความปลอดภัย และการทำงานหลักของเว็บไซต์
          </li>
          <li>
            <strong>Analytics (ปิดเป็นค่าเริ่มต้น):</strong> ใช้วัดการใช้งานเพื่อปรับปรุงประสบการณ์ เช่น page view และเหตุการณ์การใช้งาน
          </li>
        </ol>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. พฤติกรรมการยินยอม (Strict Opt-in)</h2>
        <p>
          ในการเข้าชมครั้งแรก ระบบจะแสดงแบนเนอร์คุกกี้ และยังไม่เปิด Analytics จนกว่าคุณจะกดอนุญาต
          หากเลือกปฏิเสธ ระบบจะหยุดส่ง Analytics events และพยายามลบคุกกี้ Google Analytics เดิมทันที
          แบบ best-effort
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>4. การเปลี่ยนแปลงการตั้งค่า</h2>
        <p>
          คุณสามารถเปลี่ยนใจได้ตลอดเวลาโดยกดปุ่ม <strong>ตั้งค่าคุกกี้</strong> ที่ footer ของทุกหน้า
          แล้วเลือกเปิด/ปิด Analytics ได้ทันทีโดยไม่ต้องรีเฟรชหน้า
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>5. การเปลี่ยนแปลงประกาศ</h2>
        <p>
          เราอาจปรับปรุงประกาศนี้เป็นครั้งคราว โดยจะแสดงวันที่อัปเดตล่าสุดบนหน้านี้
          และให้มีผลเมื่อเผยแพร่บนเว็บไซต์
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
      </p>
    </main>
  );
}
