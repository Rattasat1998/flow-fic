import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ข้อมูลติดต่อทางกฎหมายและเวอร์ชันเอกสาร | FlowFic",
  description: "ข้อมูลวันที่มีผลบังคับใช้ เวอร์ชันเอกสาร และช่องทางติดต่อทางกฎหมายของเว็บไซต์ FlowFic",
};

export default function LegalContactAndVersioningPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>ข้อมูลติดต่อทางกฎหมายและเวอร์ชันเอกสาร</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. เวอร์ชันเอกสาร</h2>
        <p>
          นโยบายและข้อกำหนดของเว็บไซต์จะแสดงวันที่อัปเดตล่าสุดบนแต่ละหน้า
          และเวอร์ชันที่มีผลบังคับใช้ในขณะนั้นจะถือเป็นฉบับอ้างอิงหลัก
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. วันที่มีผลบังคับใช้</h2>
        <p>
          หากมีการเปลี่ยนแปลงสาระสำคัญ เว็บไซต์อาจอัปเดตเอกสารและวันที่มีผลบังคับใช้
          โดยการใช้งานเว็บไซต์ต่อเนื่องหลังประกาศถือว่าเป็นการยอมรับฉบับล่าสุด
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. ช่องทางติดต่อ</h2>
        <p>
          สำหรับคำถามหรือข้อกังวลด้านกฎหมายและนโยบาย โปรดติดต่อทีมงานผ่านช่องทางซัพพอร์ตบนเว็บไซต์
          พร้อมระบุหัวข้อและรายละเอียดที่เกี่ยวข้องเพื่อให้ทีมงานตรวจสอบได้รวดเร็ว
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>4. เอกสารที่เกี่ยวข้อง</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>ข้อกำหนดและเงื่อนไขการใช้บริการ</li>
          <li>นโยบายความเป็นส่วนตัว</li>
          <li>นโยบายการเงินและนโยบายย่อยที่เกี่ยวข้อง</li>
        </ol>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/terms">ข้อกำหนดและเงื่อนไขการใช้บริการ</Link>
      </p>
      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
      </p>
    </main>
  );
}
