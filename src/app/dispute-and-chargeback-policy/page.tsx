import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "นโยบายข้อพิพาทและ Chargeback | FlowFic",
  description: "แนวทางการจัดการข้อพิพาทการชำระเงินและ chargeback ของเว็บไซต์ FlowFic",
};

export default function DisputeAndChargebackPolicyPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>นโยบายข้อพิพาทและ Chargeback</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026 (Policy v1)</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. การเปิดข้อพิพาทการชำระเงิน</h2>
        <p>
          เมื่อระบบตรวจพบข้อพิพาทหรือ chargeback จากช่องทางชำระเงิน บัญชีอาจถูกกำหนดสถานะจำกัดสิทธิ์การเงิน
          เพื่อป้องกันความเสียหายระหว่างการตรวจสอบ
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. มาตรการระหว่างตรวจสอบ</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>ระงับการทำธุรกรรมการเงินบางส่วนหรือทั้งหมดชั่วคราว</li>
          <li>อาจมีการลงรายการ hold แบบ reversible ในบัญชีเหรียญ</li>
          <li>เปิดเคสตรวจสอบภายในพร้อมบันทึกเหตุผลและหลักฐาน</li>
        </ol>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. ผลการพิจารณา</h2>
        <p>
          หากข้อพิพาทถูกยกเลิกหรือผลการพิจารณาเข้าข่ายปลดข้อจำกัด ระบบจะปล่อย hold และคืนสถานะตามเงื่อนไข
          แต่หากยืนยันการทุจริต เว็บไซต์มีสิทธิ์คงข้อจำกัดหรือยกระดับเป็นการระงับถาวร
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>4. การติดต่อและหลักฐาน</h2>
        <p>
          ผู้ใช้สามารถติดต่อช่องทางซัพพอร์ตของเว็บไซต์เพื่อส่งข้อมูลประกอบ เช่น รายการชำระเงินที่เกี่ยวข้อง
          วันเวลาทำรายการ และเอกสารจากผู้ให้บริการชำระเงิน เพื่อใช้ในการตรวจสอบ
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/billing-policies">นโยบายการเงินทั้งหมด</Link>
      </p>
      <Link href="/terms">กลับไปข้อกำหนดและเงื่อนไขหลัก</Link>
    </main>
  );
}
