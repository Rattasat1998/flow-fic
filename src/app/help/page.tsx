import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export const metadata: Metadata = {
    title: "ศูนย์ช่วยเหลือ | FlowFic",
    description: "ศูนย์ช่วยเหลือและคำถามที่พบบ่อยสำหรับผู้ใช้งาน FlowFic",
};

export default function HelpPage() {
    return (
        <main
            style={{
                maxWidth: "760px",
                margin: "0 auto",
                padding: "48px 20px 72px",
                lineHeight: 1.7,
            }}
        >
            <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>ศูนย์ช่วยเหลือ FlowFic</h1>
            <p style={{ color: "#666", marginBottom: "2rem" }}>คำแนะนำและคำตอบสำหรับคำถามที่พบบ่อย</p>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>เริ่มต้นใช้งาน</h2>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>วิธีสมัครสมาชิก</h3>
                    <p>คุณสามารถสมัครสมาชิกได้โดยการล็อกอินผ่าน Google หรือ Facebook บนหน้าหลักของเว็บไซต์</p>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>วิธีเขียนนิยาย</h3>
                    <p>หลังจากล็อกอิน ไปที่เมนู &quot;สร้าง&quot; เพื่อเริ่มสร้างนิยายใหม่ คุณสามารถเลือกรูปแบบการเขียนได้ เช่น นิยายข้อความ หรือคอมิกส์</p>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>วิธีอ่านนิยาย</h3>
                    <p>ค้นหานิยายที่สนใจได้จากหน้าหลักหรือใช้ระบบค้นหา คลิกที่นิยายเพื่อเริ่มอ่าน และสามารถติดตามนักเขียนได้</p>
                </div>
            </section>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>ระบบเหรียญและ VIP</h2>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>เหรียญ (Coins) ใช้ทำอะไร?</h3>
                    <p>เหรียญใช้สำหรับปลดล็อกตอนพิเศษ ซื้อไอเทมในเกม หรือสนับสนุนนักเขียนโดยตรง</p>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>VIP มีสิทธิ์อะไรบ้าง?</h3>
                    <p>สมาชิก VIP จะสามารถอ่านตอนพรีเมียมได้ไม่จำกัด พร้อมทั้งได้รับเหรียญฟรีทุกเดือน</p>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>วิธีซื้อเหรียญ</h3>
                    <p>ไปที่หน้า Pricing เพื่อเลือกแพ็กเกจเหรียญที่ต้องการ รองรับการชำระผ่านบัตรเครดิตและ QR Code</p>
                </div>
            </section>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>สำหรับนักเขียน</h2>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>วิธีเริ่มเขียนนิยาย</h3>
                    <p>ไปที่เมนู &quot;สร้าง&quot; เลือกรูปแบบการเขียน กรอกชื่อเรื่องและคำอธิบาย จากนั้นเริ่มเขียนตอนแรกได้เลย</p>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>ระบบ Branching Story คืออะไร?</h3>
                    <p>Branching Story ช่วยให้คุณสร้างเรื่องที่มีหลายทางเลือก ให้ผู้อ่านตัดสินใจและเดินทางเรื่องได้หลายแบบ</p>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "1.1rem", marginBottom: "0.3rem" }}>วิธีดูสถิติการอ่าน</h3>
                    <p>ไปที่ Dashboard ในเมนูนักเขียนเพื่อดูจำนวนผู้อ่าน ยอดไลค์ และรายได้จากการเขียน</p>
                </div>
            </section>

            <section style={{ marginBottom: "1.5rem" }}>
                <h2>นโยบายและข้อกำหนด</h2>
                <ul style={{ paddingLeft: "1.2rem", marginTop: "0.5rem" }}>
                    <li><Link href="/terms">ข้อกำหนดการใช้งาน</Link></li>
                    <li><Link href="/privacy">นโยบายความเป็นส่วนตัว</Link></li>
                    <li><Link href="/billing-policies">ศูนย์นโยบาย</Link></li>
                    <li><Link href="/copyright-takedown-policy">นโยบายลิขสิทธิ์</Link></li>
                </ul>
            </section>

            <section style={{ marginBottom: "2rem" }}>
                <h2>ติดต่อเรา</h2>
                <p>
                    หากไม่พบคำตอบที่ต้องการ สามารถติดต่อทีมงานที่{" "}
                    <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>{" "}
                    เราพร้อมช่วยเหลือคุณตลอด 24 ชั่วโมง
                </p>
            </section>
        </main>
    );
}
