# Schema Drift Audit (2026-03-17)

This note tracks remote DB objects that are not represented in the `supabase/migrations` chain yet.

## Findings

1. Objects created from root `sql_update*.sql` scripts are active on remote but not in `supabase/migrations`.
   - `sql_update7_tracking.sql` (`page_events` + indexes + RLS policies)
   - `sql_update7b_analytics_functions.sql` (`get_analytics_overview`, `get_event_breakdown`, `get_top_stories`)
   - `sql_update8_follow_notifications.sql` (`follows`, `notifications`, trigger/function)
   - `sql_update11_chapter_revisions.sql` (`chapter_revisions` + indexes + RLS)

2. Remote indexes detected by `supabase inspect db index-stats` but not found in repo SQL:
   - `public.idx_chapters_story_status_order`
   - `public.idx_chapters_story_published_updated`

## Status After Phase 1 Migration

- Covered in `supabase/migrations/20260317113000_schema_reconciliation_phase1.sql`:
  - `page_events`, analytics SQL functions, `follows`, `notifications`, publish trigger, `chapter_revisions`
  - chapter indexes: `idx_chapters_story_status_order`, `idx_chapters_story_published_updated`
- Remaining work: verify this migration on staging and run `supabase db push --dry-run --linked` to confirm no unmanaged drift remains.

## Next Migration Round (source-of-truth cleanup)

1. Create a dedicated reconciliation migration in `supabase/migrations` that:
   - backfills any missing DDL for the objects above using idempotent SQL (`if not exists` / guarded `do $$`)
   - captures both chapter indexes listed above (or explicit replacement indexes if shape changes)
2. Keep legacy `sql_update*.sql` files as historical references only; do not use them as deployment source.
3. After reconciliation migration is merged and pushed, run:
   - `supabase migration list --linked`
   - `supabase db push --dry-run --linked`
   to confirm local/remote migration history stays aligned.
