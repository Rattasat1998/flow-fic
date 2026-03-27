-- Chapter publish moderation guard (rules-only, balanced hard-block)
-- This migration enforces policy at DB level to prevent direct-update bypass.

create or replace function public.flowfic_count_regex_matches(
  p_text text,
  p_pattern text
)
returns int
language sql
immutable
as $$
  select coalesce(
    (
      select count(*)
      from regexp_matches(coalesce(p_text, ''), p_pattern, 'gi')
    ),
    0
  )::int;
$$;

create or replace function public.chapter_publish_policy_violation_reason(
  p_title text,
  p_content jsonb
)
returns text
language plpgsql
as $$
declare
  v_combined text;
  v_explicit_strong_hits int := 0;
  v_explicit_mild_hits int := 0;
  v_minor_hits int := 0;
  v_coercion_hits int := 0;
  v_explicit_score numeric := 0;
  v_has_explicit_signal boolean := false;
begin
  v_combined := lower(coalesce(p_title, '') || ' ' || coalesce(p_content::text, ''));

  if length(trim(v_combined)) = 0 then
    return null;
  end if;

  v_explicit_strong_hits := public.flowfic_count_regex_matches(
    v_combined,
    '(เย็ด|ควย|หี|หำ|fuck|fucking|blowjob|handjob|cunnilingus|fellatio|penetration|anal sex|oral sex|rape|incest)'
  );

  v_explicit_mild_hits := public.flowfic_count_regex_matches(
    v_combined,
    '(sex|sexy|nude|nudity|naked|make out|เร่าร้อน|ปลุกเร้า|ลูบไล้|จูบดูดดื่ม)'
  );

  v_minor_hits := public.flowfic_count_regex_matches(
    v_combined,
    '(เด็ก|ผู้เยาว์|นักเรียน|teen|teenager|under 18|minor|child|kid|loli|โลลิ)'
  );

  v_coercion_hits := public.flowfic_count_regex_matches(
    v_combined,
    '(บังคับ|ขืนใจ|ข่มขืน|ไม่ยินยอม|ล่วงละเมิด|forced|forceful|non-consensual|non consensual|coercion|coerce|blackmail)'
  );

  v_explicit_score := (v_explicit_strong_hits * 3) + (v_explicit_mild_hits * 1.5);
  v_has_explicit_signal := v_explicit_strong_hits > 0 or v_explicit_mild_hits >= 2;

  if v_has_explicit_signal and v_minor_hits > 0 then
    return 'พบเนื้อหาเชิงเพศที่เชื่อมโยงผู้เยาว์ ซึ่งไม่อนุญาตให้เผยแพร่';
  end if;

  if v_has_explicit_signal and v_coercion_hits > 0 then
    return 'พบเนื้อหาเชิงเพศที่เกี่ยวข้องกับการบังคับหรือไม่ยินยอม ซึ่งไม่อนุญาตให้เผยแพร่';
  end if;

  if v_explicit_score >= 6 then
    return 'พบเนื้อหาเชิงเพศชัดเจนเกินเกณฑ์การเผยแพร่ กรุณาปรับถ้อยคำให้เหมาะสม';
  end if;

  return null;
end;
$$;

create or replace function public.enforce_chapter_publish_content_policy()
returns trigger
language plpgsql
as $$
declare
  v_violation_reason text;
begin
  if not (
    (new.status = 'published' and old.status is distinct from 'published')
    or new.published_title is distinct from old.published_title
    or new.published_content is distinct from old.published_content
  ) then
    return new;
  end if;

  v_violation_reason := public.chapter_publish_policy_violation_reason(
    new.published_title,
    new.published_content
  );

  if v_violation_reason is not null then
    raise exception 'CONTENT_POLICY_BLOCKED: %', v_violation_reason
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_chapter_publish_content_policy on public.chapters;
create trigger trg_enforce_chapter_publish_content_policy
  before update on public.chapters
  for each row
  execute function public.enforce_chapter_publish_content_policy();
