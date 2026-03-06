This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment Variables

Create `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_or_sb_secret_key
STRIPE_SECRET_KEY=sk_test_or_sk_live_key
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_APP_URL=https://your-domain.com
FINANCE_ADMIN_USER_IDS=uuid1,uuid2
CRON_SECRET=your_random_secret_for_vercel_cron
RECONCILIATION_MISMATCH_THRESHOLD=0
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
UNSPLASH_SECRET_KEY=your_unsplash_secret_key
```

`UNSPLASH_ACCESS_KEY` is required for image search in the editor.
`SUPABASE_SERVICE_ROLE_KEY` must NOT be a publishable key (`sb_publishable_*`).
`STRIPE_SECRET_KEY` must be a Stripe secret key (`sk_*`), not publishable (`pk_*`).
`FINANCE_ADMIN_USER_IDS` controls access to admin payment operations APIs.
`CRON_SECRET` is required to authorize Vercel Cron calls to internal reconciliation endpoints.
`RECONCILIATION_MISMATCH_THRESHOLD` sets the alert threshold for daily reconciliation (default `0`).

## Monetization Rollout (v1)

Use this sequence when deploying payment policy updates:

```bash
# 1) Link project (first time)
supabase link --project-ref vthbilvvchwgiiplvfxw

# 2) Ensure migration file exists in supabase/migrations
# (example: 20260305125555_monetization_policy_v1.sql)

# 3) Apply DB migration to remote
supabase db push --yes

# 4) Deploy edge functions
supabase functions deploy stripe-checkout --project-ref vthbilvvchwgiiplvfxw
supabase functions deploy stripe-webhook --project-ref vthbilvvchwgiiplvfxw --no-verify-jwt

# 5) Optional: run reconciliation once
node -e "const {createClient}=require('@supabase/supabase-js'); const fs=require('fs'); const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(Boolean).map(l=>{const i=l.indexOf('='); return [l.slice(0,i),l.slice(i+1)]})); const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}}); sb.rpc('run_payment_reconciliation',{p_mismatch_threshold:0}).then(({data,error})=>{if(error) throw error; console.log(data?.[0]||data);}).catch(e=>{console.error(e); process.exit(1);});"
```

Stripe webhook endpoint should stay enabled at:

`https://vthbilvvchwgiiplvfxw.supabase.co/functions/v1/stripe-webhook`

with events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded` (required for QR PromptPay settlement)
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Daily Reconciliation Cron

`vercel.json` schedules daily reconciliation at `00:10 UTC` via:

`/api/internal/reconciliation/daily`

This endpoint requires header:

`Authorization: Bearer <CRON_SECRET>`

Vercel automatically sends this header for cron jobs when `CRON_SECRET` is configured in the project environment.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
