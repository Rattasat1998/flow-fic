-- FlowFic — Creator Revenue Share + PromptPay Payout v1
-- Policy defaults:
-- - 1 coin = 15 satang
-- - writer share = 70%
-- - hold 14 days before available
-- - min payout = 300 THB (30000 satang)
-- - withholding = 3%

create table if not exists public.creator_payout_profiles (
  writer_user_id uuid primary key references auth.users(id) on delete cascade,
  legal_name text,
  promptpay_target text,
  kyc_status text not null default 'pending'
    check (kyc_status in ('pending', 'verified', 'rejected')),
  kyc_rejection_reason text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_balances (
  writer_user_id uuid primary key references auth.users(id) on delete cascade,
  pending_satang bigint not null default 0,
  available_satang bigint not null default 0,
  reserved_satang bigint not null default 0,
  paid_satang bigint not null default 0,
  debt_satang bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_balances_non_negative check (
    pending_satang >= 0
    and available_satang >= 0
    and reserved_satang >= 0
    and paid_satang >= 0
    and debt_satang >= 0
  )
);

create table if not exists public.creator_payout_requests (
  id uuid primary key default gen_random_uuid(),
  writer_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'paid', 'rejected', 'canceled')),
  gross_satang bigint not null,
  withholding_bps int not null default 300,
  withholding_satang bigint not null,
  net_satang bigint not null,
  promptpay_target text,
  request_note text,
  transfer_reference text,
  transfer_proof_url text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  reject_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_payout_requests_non_negative check (
    gross_satang >= 0 and withholding_satang >= 0 and net_satang >= 0
  )
);

create table if not exists public.creator_revenue_events (
  id uuid primary key default gen_random_uuid(),
  writer_user_id uuid not null references auth.users(id) on delete cascade,
  reader_user_id uuid references auth.users(id) on delete set null,
  story_id uuid references public.stories(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  source_unlock_id uuid references public.chapter_unlocks(id) on delete set null,
  payment_case_id uuid references public.payment_cases(id) on delete set null,
  payout_request_id uuid references public.creator_payout_requests(id) on delete set null,
  event_type text not null
    check (event_type in ('unlock_credit', 'chargeback_debit', 'payout_reserve', 'payout_release', 'payout_paid', 'debt_adjust')),
  settlement_status text not null default 'available'
    check (settlement_status in ('pending', 'available')),
  coins int not null default 0,
  gross_satang bigint not null default 0,
  writer_share_satang bigint not null default 0,
  delta_pending_satang bigint not null default 0,
  delta_available_satang bigint not null default 0,
  delta_reserved_satang bigint not null default 0,
  delta_paid_satang bigint not null default 0,
  delta_debt_satang bigint not null default 0,
  pending_remaining_satang bigint not null default 0,
  available_remaining_satang bigint not null default 0,
  reserved_remaining_satang bigint not null default 0,
  paid_remaining_satang bigint not null default 0,
  hold_release_at timestamptz,
  available_at timestamptz,
  description text,
  reference_type text,
  reference_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_payout_request_items (
  id uuid primary key default gen_random_uuid(),
  payout_request_id uuid not null references public.creator_payout_requests(id) on delete cascade,
  revenue_event_id uuid not null references public.creator_revenue_events(id) on delete restrict,
  story_id uuid references public.stories(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  amount_satang bigint not null check (amount_satang > 0),
  created_at timestamptz not null default now(),
  unique (payout_request_id, revenue_event_id)
);

create index if not exists creator_revenue_events_writer_created_idx
  on public.creator_revenue_events(writer_user_id, created_at desc);

create index if not exists creator_revenue_events_reader_created_idx
  on public.creator_revenue_events(reader_user_id, created_at desc)
  where reader_user_id is not null;

create unique index if not exists creator_revenue_events_unlock_unique_idx
  on public.creator_revenue_events(source_unlock_id)
  where event_type = 'unlock_credit' and source_unlock_id is not null;

create index if not exists creator_revenue_events_payment_case_idx
  on public.creator_revenue_events(payment_case_id, created_at desc)
  where payment_case_id is not null;

create index if not exists creator_payout_requests_writer_status_idx
  on public.creator_payout_requests(writer_user_id, status, requested_at desc);

create index if not exists creator_payout_requests_status_idx
  on public.creator_payout_requests(status, requested_at desc);

create index if not exists creator_payout_items_request_idx
  on public.creator_payout_request_items(payout_request_id);

create index if not exists creator_payout_items_revenue_event_idx
  on public.creator_payout_request_items(revenue_event_id);

alter table public.creator_payout_profiles enable row level security;
alter table public.creator_balances enable row level security;
alter table public.creator_payout_requests enable row level security;
alter table public.creator_revenue_events enable row level security;
alter table public.creator_payout_request_items enable row level security;

drop policy if exists "Creators can view own payout profile" on public.creator_payout_profiles;
create policy "Creators can view own payout profile"
  on public.creator_payout_profiles
  for select
  using (auth.uid() = writer_user_id);

drop policy if exists "Creators can insert own payout profile" on public.creator_payout_profiles;
create policy "Creators can insert own payout profile"
  on public.creator_payout_profiles
  for insert
  with check (auth.uid() = writer_user_id);

drop policy if exists "Creators can update own payout profile" on public.creator_payout_profiles;
create policy "Creators can update own payout profile"
  on public.creator_payout_profiles
  for update
  using (auth.uid() = writer_user_id)
  with check (auth.uid() = writer_user_id);

drop policy if exists "Creators can view own balances" on public.creator_balances;
create policy "Creators can view own balances"
  on public.creator_balances
  for select
  using (auth.uid() = writer_user_id);

drop policy if exists "Creators can view own payout requests" on public.creator_payout_requests;
create policy "Creators can view own payout requests"
  on public.creator_payout_requests
  for select
  using (auth.uid() = writer_user_id);

drop policy if exists "Creators can view own revenue events" on public.creator_revenue_events;
create policy "Creators can view own revenue events"
  on public.creator_revenue_events
  for select
  using (auth.uid() = writer_user_id);

drop policy if exists "Creators can view own payout request items" on public.creator_payout_request_items;
create policy "Creators can view own payout request items"
  on public.creator_payout_request_items
  for select
  using (
    exists (
      select 1
      from public.creator_payout_requests r
      where r.id = creator_payout_request_items.payout_request_id
        and r.writer_user_id = auth.uid()
    )
  );

drop trigger if exists on_creator_payout_profiles_updated on public.creator_payout_profiles;
create trigger on_creator_payout_profiles_updated
  before update on public.creator_payout_profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists on_creator_balances_updated on public.creator_balances;
create trigger on_creator_balances_updated
  before update on public.creator_balances
  for each row execute function public.handle_updated_at();

drop trigger if exists on_creator_payout_requests_updated on public.creator_payout_requests;
create trigger on_creator_payout_requests_updated
  before update on public.creator_payout_requests
  for each row execute function public.handle_updated_at();

drop trigger if exists on_creator_revenue_events_updated on public.creator_revenue_events;
create trigger on_creator_revenue_events_updated
  before update on public.creator_revenue_events
  for each row execute function public.handle_updated_at();

create or replace function public.ensure_creator_balance_row(p_writer_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_writer_user_id is null then
    raise exception 'WRITER_REQUIRED';
  end if;

  insert into public.creator_balances (writer_user_id)
  values (p_writer_user_id)
  on conflict (writer_user_id) do nothing;
end;
$$;

create or replace function public.apply_creator_balance_delta(
  p_writer_user_id uuid,
  p_delta_pending bigint default 0,
  p_delta_available bigint default 0,
  p_delta_reserved bigint default 0,
  p_delta_paid bigint default 0,
  p_delta_debt bigint default 0
)
returns table (
  success boolean,
  message text,
  pending_satang bigint,
  available_satang bigint,
  reserved_satang bigint,
  paid_satang bigint,
  debt_satang bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.creator_balances%rowtype;
  v_next_pending bigint;
  v_next_available bigint;
  v_next_reserved bigint;
  v_next_paid bigint;
  v_next_debt bigint;
begin
  if p_writer_user_id is null then
    return query select false, 'WRITER_REQUIRED', 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  perform public.ensure_creator_balance_row(p_writer_user_id);

  select *
    into v_balance
  from public.creator_balances
  where writer_user_id = p_writer_user_id
  for update;

  v_next_pending := coalesce(v_balance.pending_satang, 0) + coalesce(p_delta_pending, 0);
  v_next_available := coalesce(v_balance.available_satang, 0) + coalesce(p_delta_available, 0);
  v_next_reserved := coalesce(v_balance.reserved_satang, 0) + coalesce(p_delta_reserved, 0);
  v_next_paid := coalesce(v_balance.paid_satang, 0) + coalesce(p_delta_paid, 0);
  v_next_debt := coalesce(v_balance.debt_satang, 0) + coalesce(p_delta_debt, 0);

  if v_next_pending < 0 or v_next_available < 0 or v_next_reserved < 0 or v_next_paid < 0 or v_next_debt < 0 then
    return query select false, 'NEGATIVE_BALANCE_NOT_ALLOWED',
      coalesce(v_balance.pending_satang, 0),
      coalesce(v_balance.available_satang, 0),
      coalesce(v_balance.reserved_satang, 0),
      coalesce(v_balance.paid_satang, 0),
      coalesce(v_balance.debt_satang, 0);
    return;
  end if;

  update public.creator_balances
    set pending_satang = v_next_pending,
        available_satang = v_next_available,
        reserved_satang = v_next_reserved,
        paid_satang = v_next_paid,
        debt_satang = v_next_debt,
        updated_at = now()
  where writer_user_id = p_writer_user_id;

  return query select true, 'APPLIED', v_next_pending, v_next_available, v_next_reserved, v_next_paid, v_next_debt;
end;
$$;

create or replace function public.record_creator_unlock_revenue(p_unlock_id uuid)
returns table (
  success boolean,
  message text,
  event_id uuid,
  writer_user_id uuid,
  writer_share_satang bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_event_id uuid;
  v_unlock public.chapter_unlocks%rowtype;
  v_story_owner uuid;
  v_gross_satang bigint;
  v_writer_share bigint;
  v_hold_release_at timestamptz;
  v_debt_before bigint := 0;
  v_debt_reduction bigint := 0;
  v_credit_after_debt bigint := 0;
  v_delta_pending bigint := 0;
  v_delta_available bigint := 0;
  v_event_id uuid;
  v_apply record;
begin
  if p_unlock_id is null then
    return query select false, 'UNLOCK_REQUIRED', null::uuid, null::uuid, 0::bigint;
    return;
  end if;

  select id, user_id, story_id, chapter_id, spent_coins, created_at
    into v_unlock
  from public.chapter_unlocks
  where id = p_unlock_id;

  if not found then
    return query select false, 'UNLOCK_NOT_FOUND', null::uuid, null::uuid, 0::bigint;
    return;
  end if;

  if coalesce(v_unlock.spent_coins, 0) <= 0 then
    return query select false, 'NOT_ELIGIBLE', null::uuid, null::uuid, 0::bigint;
    return;
  end if;

  select s.user_id
    into v_story_owner
  from public.stories s
  where s.id = v_unlock.story_id;

  if v_story_owner is null then
    return query select false, 'WRITER_NOT_FOUND', null::uuid, null::uuid, 0::bigint;
    return;
  end if;

  select e.id
    into v_existing_event_id
  from public.creator_revenue_events e
  where e.event_type = 'unlock_credit'
    and e.source_unlock_id = p_unlock_id
  limit 1;

  if v_existing_event_id is not null then
    return query select true, 'DUPLICATE_REFERENCE', v_existing_event_id, v_story_owner, 0::bigint;
    return;
  end if;

  v_gross_satang := coalesce(v_unlock.spent_coins, 0)::bigint * 15;
  v_writer_share := (v_gross_satang * 7000) / 10000;
  v_hold_release_at := coalesce(v_unlock.created_at, now()) + interval '14 days';

  if v_writer_share <= 0 then
    return query select false, 'ZERO_WRITER_SHARE', null::uuid, v_story_owner, 0::bigint;
    return;
  end if;

  perform public.ensure_creator_balance_row(v_story_owner);

  select b.debt_satang
    into v_debt_before
  from public.creator_balances b
  where b.writer_user_id = v_story_owner
  for update;

  v_debt_reduction := least(coalesce(v_debt_before, 0), v_writer_share);
  v_credit_after_debt := v_writer_share - v_debt_reduction;

  if v_hold_release_at <= now() then
    v_delta_available := v_credit_after_debt;
  else
    v_delta_pending := v_credit_after_debt;
  end if;

  select *
    into v_apply
  from public.apply_creator_balance_delta(
    v_story_owner,
    v_delta_pending,
    v_delta_available,
    0,
    0,
    -v_debt_reduction
  );

  if not coalesce(v_apply.success, false) then
    return query select false, coalesce(v_apply.message, 'BALANCE_UPDATE_FAILED'), null::uuid, v_story_owner, v_writer_share;
    return;
  end if;

  insert into public.creator_revenue_events (
    writer_user_id,
    reader_user_id,
    story_id,
    chapter_id,
    source_unlock_id,
    event_type,
    settlement_status,
    coins,
    gross_satang,
    writer_share_satang,
    delta_pending_satang,
    delta_available_satang,
    delta_reserved_satang,
    delta_paid_satang,
    delta_debt_satang,
    pending_remaining_satang,
    available_remaining_satang,
    reserved_remaining_satang,
    paid_remaining_satang,
    hold_release_at,
    available_at,
    description,
    reference_type,
    reference_id
  )
  values (
    v_story_owner,
    v_unlock.user_id,
    v_unlock.story_id,
    v_unlock.chapter_id,
    v_unlock.id,
    'unlock_credit',
    case when v_delta_pending > 0 then 'pending' else 'available' end,
    coalesce(v_unlock.spent_coins, 0),
    v_gross_satang,
    v_writer_share,
    v_delta_pending,
    v_delta_available,
    0,
    0,
    -v_debt_reduction,
    v_delta_pending,
    v_delta_available,
    0,
    0,
    case when v_delta_pending > 0 then v_hold_release_at else null end,
    case when v_delta_available > 0 then now() else null end,
    'Writer unlock revenue credit',
    'chapter_unlock',
    v_unlock.id::text
  )
  returning id into v_event_id;

  return query select true, 'APPLIED', v_event_id, v_story_owner, v_writer_share;
end;
$$;

create or replace function public.settle_creator_revenue(p_now timestamptz default now())
returns table (
  settled_count int,
  moved_satang bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := coalesce(p_now, now());
  v_row record;
  v_apply record;
  v_settled int := 0;
  v_moved bigint := 0;
begin
  for v_row in
    select e.id, e.writer_user_id, e.pending_remaining_satang
    from public.creator_revenue_events e
    where e.event_type = 'unlock_credit'
      and e.settlement_status = 'pending'
      and e.pending_remaining_satang > 0
      and e.hold_release_at is not null
      and e.hold_release_at <= v_now
    order by e.hold_release_at asc, e.created_at asc
    for update skip locked
  loop
    select *
      into v_apply
    from public.apply_creator_balance_delta(
      v_row.writer_user_id,
      -v_row.pending_remaining_satang,
      v_row.pending_remaining_satang,
      0,
      0,
      0
    );

    if not coalesce(v_apply.success, false) then
      continue;
    end if;

    update public.creator_revenue_events
      set settlement_status = 'available',
          available_at = v_now,
          available_remaining_satang = available_remaining_satang + pending_remaining_satang,
          pending_remaining_satang = 0,
          updated_at = now()
    where id = v_row.id;

    insert into public.creator_revenue_events (
      writer_user_id,
      story_id,
      chapter_id,
      source_unlock_id,
      event_type,
      settlement_status,
      writer_share_satang,
      delta_pending_satang,
      delta_available_satang,
      description,
      reference_type,
      reference_id,
      available_at
    )
    select
      e.writer_user_id,
      e.story_id,
      e.chapter_id,
      e.source_unlock_id,
      'debt_adjust',
      'available',
      0,
      -v_row.pending_remaining_satang,
      v_row.pending_remaining_satang,
      'Unlock hold matured to available',
      'unlock_settlement',
      e.id::text,
      v_now
    from public.creator_revenue_events e
    where e.id = v_row.id;

    v_settled := v_settled + 1;
    v_moved := v_moved + v_row.pending_remaining_satang;
  end loop;

  return query select v_settled, v_moved;
end;
$$;

create or replace function public.apply_creator_chargeback_debit(
  p_reader_id uuid,
  p_coins int,
  p_payment_case_id uuid
)
returns table (
  success boolean,
  message text,
  total_debited_satang bigint,
  affected_writers int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desired_satang bigint;
  v_remaining bigint;
  v_total bigint := 0;
  v_writers int := 0;
  v_row record;
  v_take_available bigint;
  v_take_pending bigint;
  v_take_total bigint;
  v_fallback_writer uuid := null;
  v_apply record;
begin
  if p_reader_id is null then
    return query select false, 'READER_REQUIRED', 0::bigint, 0;
    return;
  end if;

  if p_payment_case_id is null then
    return query select false, 'PAYMENT_CASE_REQUIRED', 0::bigint, 0;
    return;
  end if;

  if coalesce(p_coins, 0) <= 0 then
    return query select false, 'INVALID_COINS', 0::bigint, 0;
    return;
  end if;

  if exists (
    select 1
    from public.creator_revenue_events e
    where e.event_type = 'chargeback_debit'
      and e.payment_case_id = p_payment_case_id
  ) then
    return query
      select true,
             'DUPLICATE_REFERENCE',
             coalesce(sum(abs(e.writer_share_satang)), 0)::bigint,
             count(*)::int
      from public.creator_revenue_events e
      where e.event_type = 'chargeback_debit'
        and e.payment_case_id = p_payment_case_id;
    return;
  end if;

  v_desired_satang := ((coalesce(p_coins, 0)::bigint * 15) * 7000) / 10000;
  v_remaining := v_desired_satang;

  for v_row in
    select e.id,
           e.writer_user_id,
           e.story_id,
           e.chapter_id,
           e.source_unlock_id,
           e.pending_remaining_satang,
           e.available_remaining_satang
    from public.creator_revenue_events e
    where e.event_type = 'unlock_credit'
      and e.reader_user_id = p_reader_id
      and (e.pending_remaining_satang > 0 or e.available_remaining_satang > 0)
    order by e.created_at desc, e.id desc
    for update skip locked
  loop
    if v_fallback_writer is null then
      v_fallback_writer := v_row.writer_user_id;
    end if;

    exit when v_remaining <= 0;

    v_take_available := least(v_row.available_remaining_satang, v_remaining);
    v_remaining := v_remaining - v_take_available;

    v_take_pending := least(v_row.pending_remaining_satang, v_remaining);
    v_remaining := v_remaining - v_take_pending;

    v_take_total := v_take_available + v_take_pending;

    if v_take_total <= 0 then
      continue;
    end if;

    update public.creator_revenue_events
      set available_remaining_satang = available_remaining_satang - v_take_available,
          pending_remaining_satang = pending_remaining_satang - v_take_pending,
          updated_at = now()
    where id = v_row.id;

    select *
      into v_apply
    from public.apply_creator_balance_delta(
      v_row.writer_user_id,
      -v_take_pending,
      -v_take_available,
      0,
      0,
      0
    );

    if not coalesce(v_apply.success, false) then
      return query select false, coalesce(v_apply.message, 'BALANCE_UPDATE_FAILED'), v_total, v_writers;
      return;
    end if;

    insert into public.creator_revenue_events (
      writer_user_id,
      reader_user_id,
      story_id,
      chapter_id,
      source_unlock_id,
      payment_case_id,
      event_type,
      settlement_status,
      coins,
      gross_satang,
      writer_share_satang,
      delta_pending_satang,
      delta_available_satang,
      delta_reserved_satang,
      delta_paid_satang,
      delta_debt_satang,
      description,
      reference_type,
      reference_id
    )
    values (
      v_row.writer_user_id,
      p_reader_id,
      v_row.story_id,
      v_row.chapter_id,
      v_row.source_unlock_id,
      p_payment_case_id,
      'chargeback_debit',
      'available',
      0,
      0,
      -v_take_total,
      -v_take_pending,
      -v_take_available,
      0,
      0,
      0,
      'Chargeback debit from reader unlock earnings',
      'payment_case',
      p_payment_case_id::text
    );

    v_total := v_total + v_take_total;
    v_writers := v_writers + 1;
  end loop;

  if v_remaining > 0 and v_fallback_writer is not null then
    select *
      into v_apply
    from public.apply_creator_balance_delta(
      v_fallback_writer,
      0,
      0,
      0,
      0,
      v_remaining
    );

    if not coalesce(v_apply.success, false) then
      return query select false, coalesce(v_apply.message, 'BALANCE_UPDATE_FAILED'), v_total, v_writers;
      return;
    end if;

    insert into public.creator_revenue_events (
      writer_user_id,
      reader_user_id,
      payment_case_id,
      event_type,
      settlement_status,
      coins,
      gross_satang,
      writer_share_satang,
      delta_pending_satang,
      delta_available_satang,
      delta_reserved_satang,
      delta_paid_satang,
      delta_debt_satang,
      description,
      reference_type,
      reference_id
    )
    values (
      v_fallback_writer,
      p_reader_id,
      p_payment_case_id,
      'chargeback_debit',
      'available',
      0,
      0,
      -v_remaining,
      0,
      0,
      0,
      0,
      v_remaining,
      'Chargeback debit converted to creator debt',
      'payment_case',
      p_payment_case_id::text || ':debt'
    );

    v_total := v_total + v_remaining;
    v_writers := v_writers + 1;
    v_remaining := 0;
  end if;

  if v_total <= 0 then
    return query select false, 'NO_ELIGIBLE_REVENUE', 0::bigint, 0;
    return;
  end if;

  return query select true, 'APPLIED', v_total, v_writers;
end;
$$;

create or replace function public.request_creator_payout(
  p_amount_satang bigint default null,
  p_request_note text default null
)
returns table (
  success boolean,
  message text,
  payout_request_id uuid,
  gross_satang bigint,
  withholding_satang bigint,
  net_satang bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_writer_id uuid := auth.uid();
  v_profile public.creator_payout_profiles%rowtype;
  v_balance public.creator_balances%rowtype;
  v_amount bigint;
  v_withholding bigint;
  v_net bigint;
  v_request_id uuid;
  v_remaining bigint;
  v_row record;
  v_use bigint;
  v_apply record;
begin
  if v_writer_id is null then
    return query select false, 'AUTH_REQUIRED', null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  perform public.settle_creator_revenue(now());

  select *
    into v_profile
  from public.creator_payout_profiles
  where writer_user_id = v_writer_id;

  if not found then
    return query select false, 'PAYOUT_PROFILE_REQUIRED', null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  if v_profile.kyc_status <> 'verified' then
    return query select false, 'KYC_NOT_VERIFIED', null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  if coalesce(trim(v_profile.promptpay_target), '') = '' then
    return query select false, 'PROMPTPAY_TARGET_REQUIRED', null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  perform public.ensure_creator_balance_row(v_writer_id);

  select *
    into v_balance
  from public.creator_balances
  where writer_user_id = v_writer_id
  for update;

  if coalesce(v_balance.debt_satang, 0) > 0 then
    return query select false, 'CREATOR_DEBT_PRESENT', null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  v_amount := coalesce(p_amount_satang, v_balance.available_satang);
  v_amount := floor(v_amount);

  if v_amount < 30000 then
    return query select false, 'AMOUNT_BELOW_MINIMUM', null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  if v_amount > v_balance.available_satang then
    return query select false, 'INSUFFICIENT_AVAILABLE_BALANCE', null::uuid, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  v_withholding := (v_amount * 300) / 10000;
  v_net := v_amount - v_withholding;

  insert into public.creator_payout_requests (
    writer_user_id,
    status,
    gross_satang,
    withholding_bps,
    withholding_satang,
    net_satang,
    promptpay_target,
    request_note,
    requested_at,
    metadata
  )
  values (
    v_writer_id,
    'requested',
    v_amount,
    300,
    v_withholding,
    v_net,
    v_profile.promptpay_target,
    case when p_request_note is null then null else left(trim(p_request_note), 500) end,
    now(),
    jsonb_build_object('kyc_status', v_profile.kyc_status)
  )
  returning id into v_request_id;

  v_remaining := v_amount;

  for v_row in
    select e.id, e.story_id, e.chapter_id, e.available_remaining_satang
    from public.creator_revenue_events e
    where e.writer_user_id = v_writer_id
      and e.event_type = 'unlock_credit'
      and e.available_remaining_satang > 0
    order by coalesce(e.hold_release_at, e.created_at) asc, e.created_at asc, e.id asc
    for update skip locked
  loop
    exit when v_remaining <= 0;

    v_use := least(v_row.available_remaining_satang, v_remaining);

    if v_use <= 0 then
      continue;
    end if;

    update public.creator_revenue_events
      set available_remaining_satang = available_remaining_satang - v_use,
          reserved_remaining_satang = reserved_remaining_satang + v_use,
          updated_at = now()
    where id = v_row.id;

    insert into public.creator_payout_request_items (
      payout_request_id,
      revenue_event_id,
      story_id,
      chapter_id,
      amount_satang
    )
    values (
      v_request_id,
      v_row.id,
      v_row.story_id,
      v_row.chapter_id,
      v_use
    );

    v_remaining := v_remaining - v_use;
  end loop;

  if v_remaining > 0 then
    raise exception 'INSUFFICIENT_ALLOCATABLE_REVENUE';
  end if;

  select *
    into v_apply
  from public.apply_creator_balance_delta(
    v_writer_id,
    0,
    -v_amount,
    v_amount,
    0,
    0
  );

  if not coalesce(v_apply.success, false) then
    raise exception 'BALANCE_UPDATE_FAILED';
  end if;

  insert into public.creator_revenue_events (
    writer_user_id,
    payout_request_id,
    event_type,
    settlement_status,
    coins,
    gross_satang,
    writer_share_satang,
    delta_pending_satang,
    delta_available_satang,
    delta_reserved_satang,
    delta_paid_satang,
    delta_debt_satang,
    description,
    reference_type,
    reference_id
  )
  values (
    v_writer_id,
    v_request_id,
    'payout_reserve',
    'available',
    0,
    v_amount,
    -v_amount,
    0,
    -v_amount,
    v_amount,
    0,
    0,
    'Reserve creator balance for payout request',
    'creator_payout_request',
    v_request_id::text
  );

  return query select true, 'REQUESTED', v_request_id, v_amount, v_withholding, v_net;
end;
$$;

create or replace function public.admin_approve_creator_payout(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_note text default null
)
returns table (
  success boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creator_payout_requests%rowtype;
begin
  if p_request_id is null then
    return query select false, 'REQUEST_REQUIRED';
    return;
  end if;

  select *
    into v_request
  from public.creator_payout_requests
  where id = p_request_id
  for update;

  if not found then
    return query select false, 'REQUEST_NOT_FOUND';
    return;
  end if;

  if v_request.status <> 'requested' then
    return query select false, 'INVALID_REQUEST_STATUS';
    return;
  end if;

  update public.creator_payout_requests
    set status = 'approved',
        approved_at = now(),
        approved_by = p_actor_user_id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('approve_note', nullif(left(trim(coalesce(p_note, '')), 500), '')),
        updated_at = now()
  where id = p_request_id;

  return query select true, 'APPROVED';
end;
$$;

create or replace function public.admin_reject_creator_payout(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns table (
  success boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creator_payout_requests%rowtype;
  v_item record;
  v_apply record;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if p_request_id is null then
    return query select false, 'REQUEST_REQUIRED';
    return;
  end if;

  if v_reason is null then
    return query select false, 'REJECT_REASON_REQUIRED';
    return;
  end if;

  select *
    into v_request
  from public.creator_payout_requests
  where id = p_request_id
  for update;

  if not found then
    return query select false, 'REQUEST_NOT_FOUND';
    return;
  end if;

  if v_request.status not in ('requested', 'approved') then
    return query select false, 'INVALID_REQUEST_STATUS';
    return;
  end if;

  for v_item in
    select i.revenue_event_id, i.amount_satang
    from public.creator_payout_request_items i
    where i.payout_request_id = p_request_id
    for update
  loop
    update public.creator_revenue_events
      set reserved_remaining_satang = greatest(0, reserved_remaining_satang - v_item.amount_satang),
          available_remaining_satang = available_remaining_satang + v_item.amount_satang,
          updated_at = now()
    where id = v_item.revenue_event_id;
  end loop;

  select *
    into v_apply
  from public.apply_creator_balance_delta(
    v_request.writer_user_id,
    0,
    v_request.gross_satang,
    -v_request.gross_satang,
    0,
    0
  );

  if not coalesce(v_apply.success, false) then
    return query select false, coalesce(v_apply.message, 'BALANCE_UPDATE_FAILED');
    return;
  end if;

  insert into public.creator_revenue_events (
    writer_user_id,
    payout_request_id,
    event_type,
    settlement_status,
    coins,
    gross_satang,
    writer_share_satang,
    delta_pending_satang,
    delta_available_satang,
    delta_reserved_satang,
    delta_paid_satang,
    delta_debt_satang,
    description,
    reference_type,
    reference_id
  )
  values (
    v_request.writer_user_id,
    v_request.id,
    'payout_release',
    'available',
    0,
    v_request.gross_satang,
    v_request.gross_satang,
    0,
    v_request.gross_satang,
    -v_request.gross_satang,
    0,
    0,
    'Release reserved creator payout back to available',
    'creator_payout_request',
    v_request.id::text
  );

  update public.creator_payout_requests
    set status = 'rejected',
        rejected_at = now(),
        rejected_by = p_actor_user_id,
        reject_reason = v_reason,
        updated_at = now()
  where id = p_request_id;

  return query select true, 'REJECTED';
end;
$$;

create or replace function public.admin_mark_creator_payout_paid(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_transfer_reference text,
  p_transfer_proof_url text default null
)
returns table (
  success boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creator_payout_requests%rowtype;
  v_item record;
  v_apply record;
  v_transfer_reference text := nullif(left(trim(coalesce(p_transfer_reference, '')), 255), '');
  v_transfer_proof_url text := nullif(left(trim(coalesce(p_transfer_proof_url, '')), 1000), '');
begin
  if p_request_id is null then
    return query select false, 'REQUEST_REQUIRED';
    return;
  end if;

  if v_transfer_reference is null then
    return query select false, 'TRANSFER_REFERENCE_REQUIRED';
    return;
  end if;

  select *
    into v_request
  from public.creator_payout_requests
  where id = p_request_id
  for update;

  if not found then
    return query select false, 'REQUEST_NOT_FOUND';
    return;
  end if;

  if v_request.status not in ('approved', 'requested') then
    return query select false, 'INVALID_REQUEST_STATUS';
    return;
  end if;

  for v_item in
    select i.revenue_event_id, i.amount_satang
    from public.creator_payout_request_items i
    where i.payout_request_id = p_request_id
    for update
  loop
    update public.creator_revenue_events
      set reserved_remaining_satang = greatest(0, reserved_remaining_satang - v_item.amount_satang),
          paid_remaining_satang = paid_remaining_satang + v_item.amount_satang,
          updated_at = now()
    where id = v_item.revenue_event_id;
  end loop;

  select *
    into v_apply
  from public.apply_creator_balance_delta(
    v_request.writer_user_id,
    0,
    0,
    -v_request.gross_satang,
    v_request.gross_satang,
    0
  );

  if not coalesce(v_apply.success, false) then
    return query select false, coalesce(v_apply.message, 'BALANCE_UPDATE_FAILED');
    return;
  end if;

  insert into public.creator_revenue_events (
    writer_user_id,
    payout_request_id,
    event_type,
    settlement_status,
    coins,
    gross_satang,
    writer_share_satang,
    delta_pending_satang,
    delta_available_satang,
    delta_reserved_satang,
    delta_paid_satang,
    delta_debt_satang,
    description,
    reference_type,
    reference_id
  )
  values (
    v_request.writer_user_id,
    v_request.id,
    'payout_paid',
    'available',
    0,
    v_request.gross_satang,
    0,
    0,
    0,
    -v_request.gross_satang,
    v_request.gross_satang,
    0,
    'Creator payout paid via PromptPay',
    'creator_payout_request',
    v_request.id::text
  );

  update public.creator_payout_requests
    set status = 'paid',
        paid_at = now(),
        paid_by = p_actor_user_id,
        transfer_reference = v_transfer_reference,
        transfer_proof_url = v_transfer_proof_url,
        updated_at = now()
  where id = p_request_id;

  return query select true, 'PAID';
end;
$$;

-- Integrate unlock flow -> writer revenue credit
create or replace function public.unlock_premium_chapter(p_chapter_id uuid)
returns table (success boolean, message text, new_balance int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_id uuid;
  v_coin_price int;
  v_is_premium boolean;
  v_coin_balance int;
  v_vip_active boolean;
  v_finance_status text := 'normal';
  v_restriction_until timestamptz;
  v_unlock_id uuid;
  v_creator_result record;
begin
  if v_user_id is null then
    return query select false, 'AUTH_REQUIRED', 0;
    return;
  end if;

  select coalesce(s.finance_status, 'normal'), s.restriction_until
    into v_finance_status, v_restriction_until
  from public.user_finance_statuses s
  where s.user_id = v_user_id;

  if v_finance_status = 'banned_finance' then
    return query select false, 'FINANCE_BANNED', 0;
    return;
  end if;

  if v_finance_status = 'restricted_finance' and (v_restriction_until is null or v_restriction_until > now()) then
    return query select false, 'FINANCE_RESTRICTED', 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text || ':' || p_chapter_id::text));

  select c.story_id, c.coin_price, c.is_premium
    into v_story_id, v_coin_price, v_is_premium
  from public.chapters c
  where c.id = p_chapter_id and c.status = 'published';

  if not found then
    return query select false, 'CHAPTER_NOT_FOUND', 0;
    return;
  end if;

  if exists (
    select 1
    from public.chapter_unlocks u
    where u.user_id = v_user_id and u.chapter_id = p_chapter_id
  ) then
    select coalesce(w.coin_balance, 0)
      into v_coin_balance
    from public.wallets w
    where w.user_id = v_user_id;

    return query select true, 'ALREADY_UNLOCKED', coalesce(v_coin_balance, 0);
    return;
  end if;

  select exists (
    select 1
    from public.vip_entitlements v
    where v.user_id = v_user_id
      and v.status = 'active'
      and (v.current_period_end is null or v.current_period_end > now())
  ) into v_vip_active;

  if v_vip_active or not v_is_premium or coalesce(v_coin_price, 0) = 0 then
    insert into public.chapter_unlocks (user_id, story_id, chapter_id, spent_coins)
    values (v_user_id, v_story_id, p_chapter_id, 0)
    on conflict (user_id, chapter_id) do nothing;

    select coalesce(w.coin_balance, 0)
      into v_coin_balance
    from public.wallets w
    where w.user_id = v_user_id;

    return query select true, case when v_vip_active then 'UNLOCKED_BY_VIP' else 'UNLOCKED_FREE' end, coalesce(v_coin_balance, 0);
    return;
  end if;

  insert into public.wallets (user_id, coin_balance)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  select w.coin_balance
    into v_coin_balance
  from public.wallets w
  where w.user_id = v_user_id
  for update;

  if v_coin_balance < v_coin_price then
    return query select false, 'INSUFFICIENT_COINS', v_coin_balance;
    return;
  end if;

  update public.wallets
    set coin_balance = coin_balance - v_coin_price
  where user_id = v_user_id
  returning coin_balance into v_coin_balance;

  insert into public.chapter_unlocks (user_id, story_id, chapter_id, spent_coins)
  values (v_user_id, v_story_id, p_chapter_id, v_coin_price)
  on conflict (user_id, chapter_id) do update
    set spent_coins = public.chapter_unlocks.spent_coins
  returning id into v_unlock_id;

  insert into public.coin_transactions (
    user_id,
    amount,
    txn_type,
    description,
    chapter_id,
    reference_type,
    reference_id,
    policy_version,
    reason,
    running_balance_after
  )
  values (
    v_user_id,
    -v_coin_price,
    'chapter_unlock',
    'Unlock premium chapter',
    p_chapter_id,
    'chapter_unlock',
    p_chapter_id::text,
    'v1',
    'Unlock premium chapter',
    v_coin_balance
  );

  select *
    into v_creator_result
  from public.record_creator_unlock_revenue(v_unlock_id)
  limit 1;

  if not coalesce(v_creator_result.success, false)
    and coalesce(v_creator_result.message, '') not in ('DUPLICATE_REFERENCE', 'NOT_ELIGIBLE') then
    raise exception 'CREATOR_REVENUE_FAILED:%', coalesce(v_creator_result.message, 'UNKNOWN');
  end if;

  return query select true, 'UNLOCKED', v_coin_balance;
end;
$$;

revoke all on function public.ensure_creator_balance_row(uuid) from public;
grant execute on function public.ensure_creator_balance_row(uuid) to service_role;

revoke all on function public.apply_creator_balance_delta(uuid, bigint, bigint, bigint, bigint, bigint) from public;
grant execute on function public.apply_creator_balance_delta(uuid, bigint, bigint, bigint, bigint, bigint)
  to service_role;

revoke all on function public.record_creator_unlock_revenue(uuid) from public;
grant execute on function public.record_creator_unlock_revenue(uuid) to authenticated, service_role;

revoke all on function public.settle_creator_revenue(timestamptz) from public;
grant execute on function public.settle_creator_revenue(timestamptz)
  to service_role;

revoke all on function public.apply_creator_chargeback_debit(uuid, int, uuid) from public;
grant execute on function public.apply_creator_chargeback_debit(uuid, int, uuid)
  to service_role;

revoke all on function public.request_creator_payout(bigint, text) from public;
grant execute on function public.request_creator_payout(bigint, text)
  to authenticated, service_role;

revoke all on function public.admin_approve_creator_payout(uuid, uuid, text) from public;
grant execute on function public.admin_approve_creator_payout(uuid, uuid, text)
  to service_role;

revoke all on function public.admin_reject_creator_payout(uuid, uuid, text) from public;
grant execute on function public.admin_reject_creator_payout(uuid, uuid, text)
  to service_role;

revoke all on function public.admin_mark_creator_payout_paid(uuid, uuid, text, text) from public;
grant execute on function public.admin_mark_creator_payout_paid(uuid, uuid, text, text)
  to service_role;
