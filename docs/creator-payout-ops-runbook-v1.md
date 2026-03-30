# FlowFic Creator Payout Ops Runbook (Fast v1)

Updated: 2026-03-28

## 1) Operating Model

- Revenue source: coin unlock only (`spent_coins > 0`)
- Hold period: 14 days before pending becomes available
- Payout rail: PromptPay (manual transfer by finance admin)
- Withholding: fixed 3% per payout request (v1)

## 2) Roles & SLA

- Request review owner: finance admin
- Maker-checker: reviewer and transfer executor should not be the same person when possible
- SLA:
  - `requested -> approved/rejected`: within 2 business days
  - `approved -> paid`: within 1 business day after review pass

## 3) Standard Flow (Requested -> Approved -> Paid/Rejected)

1. Review `requested` payout from `/admin/payments` (Creator Payouts tab)
2. Verify:
   - Writer KYC is `verified`
   - PromptPay target is present and plausible
   - Gross / withholding / net align with system values
3. Decision:
   - Approve: call `/api/admin/payouts/approve`
   - Reject: call `/api/admin/payouts/reject` with reason
4. For approved request, execute external PromptPay transfer
5. Record transfer details:
   - `transferReference` (required)
   - `transferProofUrl` (required operationally; optional by API contract)
6. Mark paid: call `/api/admin/payouts/mark-paid`

## 4) Fallback / Exception Handling

- Wrong transfer target or transfer failed:
  - Do not mark as paid
  - Reject request with clear reason
  - Re-create payout request from writer side after correction
- Partial transfer mismatch:
  - Keep request in non-paid state
  - Reconcile externally first
  - Only mark paid when net amount is exactly matched
- Chargeback impact:
  - Use existing hold/debit flow
  - If debt is created, future writer credits reduce debt first

## 5) Hourly Settlement Automation

- Endpoint: `GET|POST /api/internal/creator-revenue/settle`
- Auth: `Authorization: Bearer <CRON_SECRET>`
- Schedule: hourly at minute 05
- Output fields to monitor:
  - `settledCount`
  - `movedSatang`
  - `executedAt`

## 6) Monthly Reconciliation Checklist

1. Export monthly `creator_payout_requests` and `creator_revenue_events`
2. Verify:
   - Sum(net paid) matches external transfer records
   - Sum(withholding) matches accounting worksheet
   - No `approved` requests left stale beyond SLA
3. Keep evidence:
   - Transfer references/proofs
   - Reconciliation worksheet
   - Exception log

## 7) Support Response Templates (TH)

- Pending not available yet:
  - "ยอดนี้อยู่ในช่วงถือยอด 14 วัน หลังจากครบกำหนดระบบจะย้ายเป็น Available อัตโนมัติ"
- Why cannot request payout:
  - "ต้องมียอด Available ถึงขั้นต่ำ 300 บาท, สถานะ KYC เป็น verified, มี PromptPay และไม่มี Debt ค้าง"
- Tax/commercial registration:
  - "FlowFic หักภาษีตามนโยบายระบบ แต่ภาระภาษี/ทะเบียนพาณิชย์ของผู้เขียนเป็นความรับผิดชอบตามกฎหมายของผู้เขียน"
