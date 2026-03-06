import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ศูนย์นโยบาย | FlowFic",
  description: "ศูนย์รวมนโยบายที่เกี่ยวข้องกับการใช้งานเว็บไซต์ FlowFic รวมทั้งการเงิน ลิขสิทธิ์ ชุมชน และความเป็นส่วนตัว",
};

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "14px 16px",
  background: "#ffffff",
};

export default function BillingPoliciesPage() {
  return (
    <main
      style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>ศูนย์นโยบาย (Policy Center)</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>อัปเดตล่าสุด: March 5, 2026</p>
      <p style={{ marginBottom: "1.2rem" }}>
        หน้านี้รวบรวมนโยบายสำคัญที่เกี่ยวข้องกับการใช้งานเว็บไซต์ FlowFic ทั้งด้านการเงิน ลิขสิทธิ์
        กฎชุมชน คุกกี้ และข้อมูลการติดต่อทางกฎหมาย
      </p>

      <section style={{ display: "grid", gap: 10, marginBottom: "1.6rem" }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>1. นโยบายการชำระเงินและคืนเงิน</h2>
          <p style={{ marginBottom: 8 }}>หลักการคืนเงินแบบค่าเริ่มต้น, ข้อยกเว้น และขั้นตอนยื่นคำขอ</p>
          <Link href="/payment-and-refund-policy">ดูรายละเอียด</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>2. เงื่อนไข VIP รายเดือน</h2>
          <p style={{ marginBottom: 8 }}>การต่ออายุอัตโนมัติ, การยกเลิก, และสิทธิ์การอ่านตอนพรีเมียม</p>
          <Link href="/vip-subscription-terms">ดูรายละเอียด</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>3. นโยบายเหรียญ (Coins)</h2>
          <p style={{ marginBottom: 8 }}>การใช้งานเหรียญ, ข้อจำกัด, และผลของการเปลี่ยนราคา</p>
          <Link href="/coin-policy">ดูรายละเอียด</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>4. นโยบายข้อพิพาทและ Chargeback</h2>
          <p style={{ marginBottom: 8 }}>ผลต่อสิทธิ์ใช้งานเมื่อเปิดข้อพิพาท และแนวทางปลดข้อจำกัด</p>
          <Link href="/dispute-and-chargeback-policy">ดูรายละเอียด</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>5. นโยบายลิขสิทธิ์และการแจ้งถอดเนื้อหา</h2>
          <p style={{ marginBottom: 8 }}>แนวทางแจ้งละเมิดลิขสิทธิ์และขั้นตอนพิจารณาของทีมงาน</p>
          <Link href="/copyright-takedown-policy">ดูรายละเอียด</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>6. นโยบายชุมชนและการบังคับใช้</h2>
          <p style={{ marginBottom: 8 }}>กฎชุมชน ตัวอย่างการฝ่าฝืน และระดับบทลงโทษ</p>
          <Link href="/community-enforcement-policy">ดูรายละเอียด</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>7. ประกาศคุกกี้และการติดตามการใช้งาน</h2>
          <p style={{ marginBottom: 8 }}>คุกกี้ที่จำเป็น ข้อมูลการใช้งาน และการจัดการผ่านเบราว์เซอร์</p>
          <Link href="/cookie-tracking-notice">ดูรายละเอียด</Link>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>8. ข้อมูลติดต่อทางกฎหมายและเวอร์ชันเอกสาร</h2>
          <p style={{ marginBottom: 8 }}>วันที่มีผลบังคับใช้ ช่องทางติดต่อ และเอกสารอ้างอิงหลัก</p>
          <Link href="/legal-contact-and-versioning">ดูรายละเอียด</Link>
        </div>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/terms">ข้อกำหนดและเงื่อนไขการใช้บริการ</Link>
      </p>
      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
      </p>
      <Link href="/">กลับหน้าแรก</Link>
    </main>
  );
}
