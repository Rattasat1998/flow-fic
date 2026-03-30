import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว | FlowFic",
  description: "นโยบายความเป็นส่วนตัวสำหรับผู้ใช้งานแพลตฟอร์ม FlowFic",
};

export default function PrivacyPage() {
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
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>นโยบายความเป็นส่วนตัว (Privacy Policy)</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>อัปเดตล่าสุด: March 28, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. ข้อมูลที่เราเก็บ</h2>
        <p>
          เมื่อคุณใช้งาน FlowFic เราอาจเก็บข้อมูลที่จำเป็นต่อการให้บริการ เช่น ข้อมูลบัญชีผู้ใช้จากการล็อกอิน
          ด้วย Google/Facebook (เช่น อีเมล ชื่อ และรูปโปรไฟล์), เนื้อหาที่คุณสร้างในระบบ
          (นิยาย ตอน ตัวละคร รูปปก/รูปตัวละคร), และข้อมูลการใช้งานทางเทคนิค (เช่น บันทึกเหตุขัดข้อง
          และข้อมูลอุปกรณ์โดยรวม)
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. วัตถุประสงค์ในการใช้ข้อมูล</h2>
        <p>
          เราใช้ข้อมูลเพื่อให้บริการหลักของแพลตฟอร์ม เช่น ยืนยันตัวตนผู้ใช้ แสดงและจัดการผลงานนิยาย
          ปรับปรุงประสิทธิภาพระบบ ดูแลความปลอดภัย และแจ้งข้อมูลสำคัญเกี่ยวกับบริการ
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. การเปิดเผยหรือแบ่งปันข้อมูล</h2>
        <p>
          เราไม่ขายข้อมูลส่วนบุคคลของคุณให้บุคคลที่สาม ข้อมูลอาจถูกประมวลผลโดยผู้ให้บริการที่จำเป็นต่อระบบ
          เช่น Supabase (ฐานข้อมูล/การยืนยันตัวตน/ไฟล์), และผู้ให้บริการล็อกอิน OAuth (Google/Facebook)
          เท่าที่จำเป็นต่อการทำงานของแพลตฟอร์ม
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>4. เนื้อหาสาธารณะของผู้ใช้</h2>
        <p>
          เนื้อหาที่คุณเผยแพร่ (เช่น นิยาย ตอน รูปปก และข้อมูลตัวละคร) อาจถูกแสดงต่อสาธารณะตามการตั้งค่า
          ของระบบ โปรดหลีกเลี่ยงการใส่ข้อมูลส่วนบุคคลที่ไม่ต้องการเปิดเผยในเนื้อหาที่เผยแพร่
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>5. การเก็บรักษาและลบข้อมูล</h2>
        <p>
          เราจะเก็บข้อมูลเท่าที่จำเป็นต่อการให้บริการและตามข้อกำหนดทางกฎหมาย หากคุณต้องการแก้ไขหรือลบข้อมูล
          สามารถติดต่อทีมงานที่{" "}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>{" "}
          เพื่อดำเนินการตามคำขอ
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>6. คุกกี้และเซสชัน</h2>
        <p>
          ระบบใช้คุกกี้ 2 หมวด: Necessary และ Analytics โดย Necessary จะเปิดเสมอเพื่อให้ระบบหลักทำงานได้
          ส่วน Analytics จะปิดเป็นค่าเริ่มต้น และจะเปิดเฉพาะเมื่อผู้ใช้ให้ความยินยอมผ่านระบบ Cookie Consent
          เท่านั้น
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          หากผู้ใช้ปฏิเสธ Analytics ระบบจะไม่ส่งเหตุการณ์ติดตามใหม่ และจะพยายามลบคุกกี้ analytics เดิม
          แบบ best-effort ภายใต้ข้อจำกัดของเบราว์เซอร์
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          ผู้ใช้สามารถแก้ไขการตั้งค่าได้ตลอดเวลาจากปุ่ม <strong>ตั้งค่าคุกกี้</strong> ที่ส่วนท้ายเว็บไซต์ทุกหน้า
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          อ่านรายละเอียดเพิ่มเติมได้ที่
          {" "}
          <Link href="/cookie-tracking-notice">ประกาศคุกกี้และการติดตามการใช้งาน</Link>
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>7. การเปลี่ยนแปลงนโยบาย</h2>
        <p>
          เราอาจปรับปรุงนโยบายฉบับนี้เป็นครั้งคราว โดยจะอัปเดตวันที่ด้านบนของหน้านี้ และให้ฉบับใหม่มีผลทันที
          หลังประกาศบนแพลตฟอร์ม
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>8. ติดต่อเรา</h2>
        <p>
          หากมีคำถามเกี่ยวกับความเป็นส่วนตัว กรุณาติดต่อทีมงานที่{" "}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/terms">ข้อกำหนดและเงื่อนไขการใช้บริการ (Terms of Service)</Link>
      </p>
      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/billing-policies">ศูนย์นโยบาย (Policy Center)</Link>
      </p>
      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/data-deletion">คำแนะนำการลบข้อมูล (Data Deletion)</Link>
      </p>
      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/legal-contact-and-versioning">ข้อมูลติดต่อทางกฎหมายและเวอร์ชันเอกสาร</Link>
      </p>
    </main>
  );
}
