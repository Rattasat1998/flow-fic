# FlowFic VIP Pass: Capability Matrix (Current State)

Updated: 2026-03-05

| Capability | Status | Evidence in code | Notes |
| --- | --- | --- | --- |
| VIP monthly subscription checkout | Live | `src/app/api/payments/checkout/route.ts`, `supabase/functions/stripe-checkout/index.ts` | Stripe subscription session is created for `kind=vip`. |
| VIP entitlement sync from Stripe webhook | Live | `src/app/api/payments/webhook/route.ts`, `supabase/functions/stripe-webhook/index.ts` | Webhook upserts `vip_entitlements` status and period end. |
| Read premium coin-gated chapters without spending coins | Live | `src/app/story/[id]/read/page.tsx`, `sql_update6.sql` (`unlock_premium_chapter`) | `isVipActive` bypasses premium gate; RPC returns `UNLOCKED_BY_VIP`. |
| Unlimited AI chat messages | Not live | No message quota/entitlement enforcement in `src/app/api/*` | Marketing claim removed from Pricing UI. |
| AI Voice Call | Not live | No voice-call API/feature gate in app routes | Marketing claim removed from Pricing UI. |
| No ads between chats | Not live | No ad delivery + VIP ad suppression logic found | Marketing claim removed from Pricing UI. |
| VIP revenue share attribution to writer | Not live | No payout/revenue allocation path tied to VIP subscriptions | Marketing claim removed from Pricing UI. |

## Pricing Copy Alignment

Pricing page now advertises only live capabilities:

- VIP reads premium coin-gated chapters without spending coins.
- Stripe subscription + entitlement sync.
- Live VIP status visibility on pricing screen.

Reference: `src/app/pricing/page.tsx`
