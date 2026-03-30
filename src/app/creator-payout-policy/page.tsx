import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support';

export const metadata: Metadata = {
  title: 'นโยบายรายได้นักเขียนและการถอนเงิน | FlowFic',
  description: 'เงื่อนไขการคำนวณรายได้จากเหรียญ การถือยอด และการถอนเงินให้ผู้เขียนบน FlowFic',
};

export default function CreatorPayoutPolicyPage() {
  return (
    <main
      className="ffLegalPage"
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        padding: '48px 20px 72px',
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>นโยบายรายได้นักเขียนและการถอนเงิน</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>มีผลบังคับใช้: March 28, 2026 (Creator Payout v1)</p>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2>1. แหล่งที่มาของรายได้</h2>
        <p>
          รายได้นักเขียนเกิดจากการที่ผู้อ่านปลดล็อกตอนพรีเมียมด้วยเหรียญสำเร็จเท่านั้น
          กรณีปลดล็อกด้วยสิทธิ์ VIP หรือปลดล็อกฟรีจะไม่สร้างรายได้ในระบบนี้
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2>2. สูตรคำนวณรายได้</h2>
        <ol style={{ paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
          <li>มูลค่าพื้นฐาน 1 เหรียญ = 0.15 บาท (15 satang)</li>
          <li>ส่วนแบ่งนักเขียน = 70% ของมูลค่าที่คำนวณได้</li>
          <li>รายได้เข้าสถานะ Pending ทันที และจะเปลี่ยนเป็น Available เมื่อครบ 14 วัน</li>
        </ol>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2>3. เงื่อนไขถอนเงิน</h2>
        <ol style={{ paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
          <li>ถอนผ่าน PromptPay เท่านั้นในเวอร์ชันปัจจุบัน</li>
          <li>ขั้นต่ำต่อคำขอถอน 300 บาท</li>
          <li>ระบบหักภาษี ณ ที่จ่ายอัตราคงที่ 3% ต่อรายการถอน</li>
          <li>ต้องผ่าน KYC ขั้นพื้นฐานและมีข้อมูลรับเงินครบถ้วนก่อนยื่นถอน</li>
          <li>เอกสารหรือภาระตามกฎหมายของผู้เขียน (รวมถึงกรณีทะเบียนพาณิชย์) เป็นความรับผิดชอบของผู้เขียน</li>
        </ol>
        <p style={{ marginTop: '0.75rem' }}>
          หมายเหตุ: เวอร์ชันปัจจุบันไม่ได้บังคับใช้ทะเบียนพาณิชย์เป็นเงื่อนไขบล็อกการถอนในระบบ
          แต่ผู้เขียนต้องปฏิบัติตามกฎหมายและภาระภาษีที่เกี่ยวข้องด้วยตนเอง
        </p>
      </section>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2>4. กรณีข้อพิพาท/Chargeback</h2>
        <p>
          หากตรวจพบข้อพิพาทจากธุรกรรมของผู้อ่าน ระบบสามารถปรับลดรายได้ฝั่งนักเขียนได้
          โดยจะตัดจากยอด Available/Pending ก่อน และหากยังไม่พอจะถูกบันทึกเป็น Debt เพื่อหักจากรายได้อนาคต
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>5. การอนุมัติและจ่ายเงินจริง</h2>
        <p>
          ในเวอร์ชันนี้การจ่ายเงินจริงเป็นกระบวนการตรวจสอบและอนุมัติภายในก่อนโอน PromptPay
          ผู้เขียนสามารถติดตามสถานะคำขอถอนเงินได้จากหน้าแดชบอร์ดนักเขียน
        </p>
        <p>
          หากมีข้อสงสัยเกี่ยวกับรายการถอน สามารถติดต่อทีมงานที่{' '}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
        </p>
      </section>

      <p style={{ marginBottom: '0.75rem' }}>
        <Link href="/billing-policies">นโยบายการเงินทั้งหมด</Link>
      </p>
    </main>
  );
}
