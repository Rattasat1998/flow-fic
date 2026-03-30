import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export const metadata: Metadata = {
  title: "นโยบายการชำระเงินและคืนเงิน | FlowFic",
  description: "นโยบายการชำระเงินและคืนเงินสำหรับเว็บไซต์ FlowFic",
};

export default function PaymentAndRefundPolicyPage() {
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
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>นโยบายการชำระเงินและคืนเงิน</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026 (Policy v1)</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. ขอบเขต</h2>
        <p>
          นโยบายนี้ใช้กับการเติมเหรียญและการสมัคร VIP ผ่านเว็บไซต์ FlowFic เท่านั้น
          และใช้ร่วมกับข้อกำหนดและเงื่อนไขการใช้บริการฉบับหลัก
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. หลักการคืนเงิน</h2>
        <p>
          รายการที่ชำระสำเร็จแล้วจะถือว่า <strong>ไม่คืนเงินเป็นค่าเริ่มต้น (No refund by default)</strong>
          เว้นแต่เป็นกรณีความผิดพลาดของระบบที่ตรวจสอบยืนยันได้ตามเงื่อนไขในข้อ 3
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. กรณียกเว้นที่อาจพิจารณาคืนเงิน</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>เกิดความผิดพลาดจากระบบของเว็บไซต์ที่พิสูจน์ได้</li>
          <li>เหรียญจากรายการนั้นยังไม่ถูกใช้งาน</li>
          <li>ผู้ใช้ให้ข้อมูลหลักฐานครบถ้วนและตรงตามรอบเวลาในการตรวจสอบ</li>
        </ol>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>4. กรณีที่ไม่คืนเงิน</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>ผู้ใช้เปลี่ยนใจหลังชำระเงินสำเร็จ</li>
          <li>เหรียญจากรายการที่ขอคืนถูกใช้ไปแล้วบางส่วนหรือทั้งหมด</li>
          <li>ความผิดพลาดเกิดจากข้อมูลที่ผู้ใช้กรอกผิดเอง</li>
          <li>กรณีที่ไม่เข้าเงื่อนไขยกเว้นตามข้อ 3</li>
        </ol>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>5. ขั้นตอนยื่นคำขอ</h2>
        <p>
          ผู้ใช้สามารถติดต่อทีมงานที่{" "}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>{" "}
          พร้อมแจ้งข้อมูลอย่างน้อย ได้แก่
          User ID, รายการที่เกี่ยวข้อง (transaction/session), วันที่ทำรายการ, และรายละเอียดปัญหา
          ทีมงานจะตรวจสอบตามหลักฐานและแจ้งผลการพิจารณา
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/billing-policies">นโยบายการเงินทั้งหมด</Link>
      </p>
    </main>
  );
}
