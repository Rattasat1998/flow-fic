import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export const metadata: Metadata = {
  title: "นโยบายลิขสิทธิ์และการแจ้งถอดเนื้อหา | FlowFic",
  description: "แนวทางการแจ้งละเมิดลิขสิทธิ์และขั้นตอนถอดเนื้อหาบนเว็บไซต์ FlowFic",
};

export default function CopyrightTakedownPolicyPage() {
  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "48px 20px 72px",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>นโยบายลิขสิทธิ์และการแจ้งถอดเนื้อหา</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. การแจ้งละเมิดลิขสิทธิ์</h2>
        <p>
          หากท่านพบเนื้อหาบนเว็บไซต์ที่อาจละเมิดลิขสิทธิ์หรือสิทธิในทรัพย์สินทางปัญญา
          สามารถแจ้งทีมงานที่{" "}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>{" "}
          โดยระบุลิงก์เนื้อหาที่เกี่ยวข้องและรายละเอียดให้ชัดเจน
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. ข้อมูลขั้นต่ำที่ต้องระบุ</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>ข้อมูลติดต่อผู้แจ้งและความเกี่ยวข้องกับสิทธิในผลงาน</li>
          <li>รายละเอียดผลงานต้นฉบับที่อ้างสิทธิ์</li>
          <li>URL หรือข้อมูลที่ชี้เฉพาะเนื้อหาที่ถูกร้องเรียนบนเว็บไซต์</li>
          <li>คำรับรองว่าข้อมูลที่แจ้งเป็นความจริง</li>
        </ol>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. ขั้นตอนพิจารณา</h2>
        <p>
          ทีมงานอาจจำกัดการเข้าถึงเนื้อหาชั่วคราวระหว่างตรวจสอบ และอาจขอข้อมูลเพิ่มเติมจากผู้แจ้งหรือผู้เผยแพร่เนื้อหา
          เมื่อพิจารณาแล้ว ทีมงานจะดำเนินการตามความเหมาะสม เช่น ถอดเนื้อหา ระงับบัญชี หรือยกคำร้อง
        </p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>4. การกระทำซ้ำ</h2>
        <p>
          หากบัญชีผู้ใช้มีพฤติกรรมละเมิดสิทธิซ้ำอย่างมีนัยสำคัญ ทีมงานอาจเพิ่มระดับมาตรการบังคับใช้
          รวมถึงการระงับบัญชีถาวรตามข้อกำหนดของเว็บไซต์
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/terms">ข้อกำหนดและเงื่อนไขการใช้บริการ</Link>
      </p>
    </main>
  );
}
