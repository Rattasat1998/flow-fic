import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "นโยบายชุมชนและการบังคับใช้ | FlowFic",
  description: "แนวทางการบังคับใช้กฎชุมชนและบทลงโทษบนเว็บไซต์ FlowFic",
};

export default function CommunityEnforcementPolicyPage() {
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
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>นโยบายชุมชนและการบังคับใช้</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "2rem" }}>มีผลบังคับใช้: March 5, 2026</p>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>1. หลักการ</h2>
        <p>
          เว็บไซต์ FlowFic สนับสนุนการใช้งานที่ปลอดภัยและเคารพสิทธิของผู้อื่น
          ทีมงานมีสิทธิ์บังคับใช้มาตรการเมื่อพบพฤติกรรมที่ฝ่าฝืนกฎหรือเงื่อนไขการใช้งาน
        </p>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>2. ตัวอย่างพฤติกรรมที่เข้าข่ายผิดกฎ</h2>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>คุกคาม ดูหมิ่น หรือใส่ร้ายผู้ใช้อื่น</li>
          <li>เผยแพร่เนื้อหาที่ผิดกฎหมาย ละเมิดสิทธิ หรือไม่เหมาะสมร้ายแรง</li>
          <li>ทุจริตหรือพยายามบิดเบือนสถิติระบบ</li>
          <li>พฤติกรรมที่กระทบความมั่นคงปลอดภัยของระบบ</li>
        </ol>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>3. ระดับบทลงโทษ</h2>
        <p>
          การบังคับใช้ใช้แนวทางไล่ระดับตามความร้ายแรงและประวัติการกระทำผิด
          โดยอาจเริ่มจากการเตือนและจำกัดสิทธิ์ชั่วคราว ไปจนถึงการระงับบัญชีถาวร
        </p>
        <ol style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
          <li>L1: เตือนและจำกัดการใช้งานบางส่วนชั่วคราว</li>
          <li>L2: ระงับสิทธิ์ช่วงเวลาหนึ่งและส่งตรวจสอบเพิ่มเติม</li>
          <li>L3: ระงับสิทธิ์ถาวรในกรณีร้ายแรงหรือยืนยันการทุจริต</li>
        </ol>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>4. ดุลยพินิจ</h2>
        <p>
          ทีมงานจะพิจารณาแต่ละกรณีตามพยานหลักฐานและบริบทโดยรวม
          เพื่อคุ้มครองผู้ใช้และความปลอดภัยของเว็บไซต์
        </p>
      </section>

      <p style={{ marginBottom: "0.75rem" }}>
        <Link href="/terms">ข้อกำหนดและเงื่อนไขการใช้บริการ</Link>
      </p>
    </main>
  );
}
