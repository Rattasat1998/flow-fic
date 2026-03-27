import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export const metadata: Metadata = {
    title: "เกี่ยวกับเรา | FlowFic",
    description: "เรียนรู้เกี่ยวกับ FlowFic แพลตฟอร์มสำหรับการเขียนและอ่านนิยายออนไลน์",
};

export default function AboutPage() {
    return (
        <main
            style={{
                maxWidth: "760px",
                margin: "0 auto",
                padding: "48px 20px 72px",
                lineHeight: 1.7,
            }}
        >
            <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>เกี่ยวกับ FlowFic</h1>
            <p style={{ color: "#666", marginBottom: "2rem" }}>อัปเดตล่าสุด: March 2026</p>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>FlowFic คืออะไร?</h2>
                <p>
                    FlowFic เป็นแพลตฟอร์มสำหรับการเขียนและอ่านนิยายออนไลน์ ที่ช่วยให้ผู้เขียนสามารถ
                    สร้างสรรค์ผลงานได้อย่างง่ายดาย พร้อมทั้งมอบประสบการณ์การอ่านที่สนุกและน่าติดตามให้กับผู้อ่าน
                </p>
            </section>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>ฟีเจอร์หลักของเรา</h2>
                <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
                    <li>ระบบเขียนนิยายแบบ Branching Story ที่ให้ผู้อ่านเลือกทิศทางเรื่องได้</li>
                    <li>รองรับหลายรูปแบบ: นิยายข้อความ, คอมิกส์ และ Visual Novel</li>
                    <li>ระบบผู้ติดตามและการแจ้งเตือน</li>
                    <li>ระบบเหรียญและ VIP สำหรับการสนับสนุนนักเขียน</li>
                    <li>แดชบอร์ดสำหรับนักเขียนในการติดตามสถิติ</li>
                </ul>
            </section>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>ชุมชนของเรา</h2>
                <p>
                    FlowFic เป็นพื้นที่สำหรับนักเขียนและผู้อ่านที่หลงใหลในการเล่าเรื่อง
                    เราสนับสนุนความคิดสร้างสรรค์และเคารพลิขสิทธิ์ในผลงานของทุกคน
                </p>
            </section>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>ติดต่อเรา</h2>
                <p>
                    หากมีคำถามหรือต้องการความช่วยเหลือ สามารถติดต่อได้ผ่าน{" "}
                    <Link href="/billing-policies">ศูนย์ช่วยเหลือ</Link> หรือส่งคำถามมาที่{" "}
                    <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
                </p>
            </section>

            <section style={{ marginBottom: "2rem" }}>
                <h2>ลิงก์ที่เกี่ยวข้อง</h2>
                <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
                    <li><Link href="/terms">ข้อกำหนดการใช้งาน</Link></li>
                    <li><Link href="/privacy">นโยบายความเป็นส่วนตัว</Link></li>
                    <li><Link href="/billing-policies">ศูนย์นโยบาย</Link></li>
                </ul>
            </section>
        </main>
    );
}
