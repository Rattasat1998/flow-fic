import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "เงื่อนไข VIP รายเดือน | FlowFic",
  description: "เงื่อนไขการสมัครและใช้งาน VIP รายเดือนของเว็บไซต์ FlowFic",
};

export default function VipSubscriptionTermsPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>เงื่อนไข VIP รายเดือน</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026 (Policy v1)</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. การสมัครและการต่ออายุ</h2>
        <p>
          VIP เป็นแพ็กเกจแบบรายเดือนที่เรียกเก็บเงินผ่านผู้ให้บริการชำระเงิน โดยอาจมีการต่ออายุอัตโนมัติ
          ตามรอบบิลจนกว่าจะยกเลิกการสมัคร
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. สิทธิ์ระหว่างสถานะ Active</h2>
        <p>
          เมื่อสถานะ VIP เป็น <strong>active</strong> ผู้ใช้สามารถปลดล็อกตอนพรีเมียมได้โดยไม่หักเหรียญ
          สำหรับตอนที่ปลดล็อกสำเร็จ ระบบจะบันทึกสิทธิ์อ่านไว้กับบัญชีผู้ใช้
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. สิทธิ์หลังหมดอายุ VIP</h2>
        <p>
          ตอนที่ปลดล็อกไปแล้วในช่วงที่ VIP active จะยังคงอ่านได้ต่อ
          ส่วนการปลดล็อกตอนใหม่หลังหมดอายุจะเป็นไปตามเงื่อนไขเหรียญหรือการต่ออายุ VIP ในรอบถัดไป
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>4. การยกเลิก</h2>
        <p>
          ผู้ใช้สามารถยกเลิกการสมัครได้ตามช่องทางที่ผู้ให้บริการชำระเงินกำหนด
          โดยสิทธิ์การใช้งานจะเป็นไปตามสถานะและวันสิ้นสุดรอบบิลที่ระบบแสดงผล
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>5. การเปลี่ยนแปลงราคาและเงื่อนไข</h2>
        <p>
          เว็บไซต์อาจปรับราคาและเงื่อนไขแพ็กเกจ VIP ในอนาคต โดยจะแสดงผลตามข้อมูลที่มีผลในขณะทำรายการ
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/billing-policies">นโยบายการเงินทั้งหมด</Link>
      </p>
    </main>
  );
}
