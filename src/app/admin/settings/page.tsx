import AdminSectionPlaceholder from '../_components/AdminSectionPlaceholder';

export default function AdminSettingsPage() {
  return (
    <AdminSectionPlaceholder
      title="ตั้งค่าระบบแอดมิน"
      description="เมนูนี้กำลังอยู่ระหว่างพัฒนา คุณสามารถกลับไปดูภาพรวมหรือเมนูการเงินได้ทันที"
      actions={[
        { href: '/admin', label: 'กลับไปหน้าภาพรวม' },
        { href: '/admin/payments', label: 'ไปที่เมนูการเงิน' },
      ]}
    />
  );
}
