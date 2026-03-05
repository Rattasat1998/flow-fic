# FlowFic Monetization Policy v1

Updated: 2026-03-05

## Scope

- Coins top-up
- VIP monthly subscription
- Premium chapter unlock
- Wallet ledger + checkout/webhook settlement
- Finance risk enforcement + dispute workflows

Out of scope:

- Gift economy
- Creator payout/revenue share
- Membership/live monetization
- Ad entitlement

## Locked Defaults

- Refund default: no refund for successful orders, except verified system fault.
- Enforcement: escalating ladder (L1/L2/L3).
- VIP unlock behavior: chapters unlocked during VIP remain unlocked permanently.

## Core Policy Constants

- `policy_version`: `v1`
- Checkout idempotency window: 5 minutes
- Finance statuses: `normal | restricted_finance | banned_finance`

## Condition Coverage

- C-01 to C-04: auth/type/catalog/currency checks in checkout APIs.
- C-05 to C-08: pricing snapshot metadata + webhook authenticity + event dedupe.
- C-09 to C-12: settlement via atomic ledger posting and ledger-first balance source.
- C-13 to C-20: premium unlock eligibility/idempotency/price consistency/non-retroactive pricing.
- C-21 to C-24: refund/chargeback workflows with reversible ledger entries.
- C-25 to C-28: risk signal scoring and finance status escalation.
- C-29: audit fields (`reference`, `policy_version`, `reason`, `correlation_id`, `actor_user_id`).
- C-30: reconciliation run + mismatch alert status.

## Admin Operations

- `POST /api/admin/payments/approve-refund`
- `POST /api/admin/payments/apply-chargeback-hold`
- `POST /api/admin/payments/release-hold`
- `POST /api/admin/payments/reconcile`

Admin access is restricted by `FINANCE_ADMIN_USER_IDS`.
