# FlowFic Performance Runbook (Reader-First)

## 1. Baseline Collection (Staging)

1. Build and deploy current branch to staging.
2. Capture Web Vitals on `/`, `/story/:id`, `/story/:id/read` from:
   - Vercel analytics
   - `page_events` (`event_type = 'web_vitals'`)
3. Capture API timings:
   - `GET /api/discovery` (warm + cold cache)
   - Read bootstrap request path
4. Capture DB execution times with `EXPLAIN (ANALYZE, BUFFERS)` for:
   - characters by story
   - comments by story ordered by created time
   - stories by user ordered by created time
   - chapters by story ordered by order index

## 2. Route Bundle Guardrail

Route bundle budgets are enforced by:

- `npm run perf:budgets`
- `.github/workflows/perf-guardrails.yml`

Current budget gates:

- `/` JS <= 340KB, CSS <= 90KB
- `/story/[id]` JS <= 300KB, CSS <= 60KB
- `/story/[id]/read` JS <= 460KB, CSS <= 90KB

## 3. DB Migration Verification

After running migrations on staging:

1. Confirm indexes and RPC functions exist.
2. Re-run `EXPLAIN (ANALYZE, BUFFERS)` and compare p95 query time.
3. Validate no regression in:
   - chapter loading
   - like / favorite
   - comments
   - premium unlock / VIP access

## 4. Release Gate

Promote build only when:

- route bundle budgets pass
- staging API p95 and DB p95 meet target
- no new access/interaction errors in reader flow
