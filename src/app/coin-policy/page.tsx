import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "นโยบายเหรียญ | FlowFic",
  description: "เงื่อนไขการใช้งานเหรียญบนเว็บไซต์ FlowFic",
};

export default function CoinPolicyPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>นโยบายเหรียญ (Coin Policy)</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026 (Policy v1)</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. การเติมและการบันทึกยอด</h2>
        <p>
          การเติมเหรียญจะสมบูรณ์เมื่อระบบได้รับยืนยันการชำระเงินสำเร็จ
          ยอดคงเหลือผู้ใช้ยึดตามข้อมูลธุรกรรมในระบบ (ledger) เป็นหลัก
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. การใช้งานเหรียญ</h2>
        <p>
          เหรียญใช้สำหรับปลดล็อกเนื้อหาพรีเมียมตามราคาที่แสดง ณ เวลาทำรายการ
          การเปลี่ยนราคาในอนาคตจะมีผลเฉพาะการปลดล็อกครั้งใหม่ และไม่คิดย้อนหลังกับตอนที่ปลดแล้ว
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. สิทธิ์และข้อจำกัด</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>เหรียญไม่สามารถโอนข้ามบัญชีผู้ใช้ได้</li>
          <li>เหรียญไม่สามารถแลกเป็นเงินสดได้</li>
          <li>ภายใต้นโยบายปัจจุบัน เหรียญไม่มีวันหมดอายุจนกว่าจะมีการประกาศเปลี่ยนนโยบาย</li>
        </ol>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>4. ความผิดปกติและการทุจริต</h2>
        <p>
          หากตรวจพบพฤติกรรมผิดปกติหรือทุจริตที่เกี่ยวข้องกับเหรียญ เว็บไซต์มีสิทธิ์จำกัดสิทธิ์การเงินชั่วคราว
          หรือถาวรตามความร้ายแรงของกรณี
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/billing-policies">นโยบายการเงินทั้งหมด</Link>
      </p>
      <Link href="/terms">กลับไปข้อกำหนดและเงื่อนไขหลัก</Link>
    </main>
  );
}
