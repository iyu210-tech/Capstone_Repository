-- Progress marks and saved demo setups for docs/progress.js.
--
-- Run once: Supabase -> SQL Editor -> paste this file -> Run. It is safe to
-- run again; every statement checks before it creates.
--
-- The publishable key in docs/auth-config.js reaches every visitor, so these
-- policies are the only thing between one student's rows and another's.
-- Every policy pins rows to auth.uid(); the anon role gets nothing at all.

-- "I get this now" / "Still stuck", one row per student per topic.
create table if not exists public.topic_progress (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id   text not null check (topic_id ~ '^[a-z0-9-]{1,80}$'),
  status     text not null check (status in ('understood', 'stuck')),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

-- Named slider positions, e.g. "fast and flat" on the projectile demo.
create table if not exists public.saved_setups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id   text not null check (topic_id ~ '^[a-z0-9-]{1,80}$'),
  name       text not null check (char_length(name) between 1 and 60),
  -- A handful of slider values. The cap stops the table being used as free
  -- storage by anyone holding the public key and a throwaway account.
  params     jsonb not null default '{}'::jsonb
             check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 2048),
  created_at timestamptz not null default now(),
  unique (user_id, topic_id, name)
);

create index if not exists saved_setups_user_topic on public.saved_setups (user_id, topic_id);

alter table public.topic_progress enable row level security;
alter table public.saved_setups  enable row level security;

-- Explicit grants rather than relying on project defaults, which newer
-- Supabase projects no longer apply to tables created in SQL.
revoke all on public.topic_progress from anon;
revoke all on public.saved_setups  from anon;
grant select, insert, update, delete on public.topic_progress to authenticated;
grant select, insert, update, delete on public.saved_setups  to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'topic_progress' and policyname = 'own progress') then
    create policy "own progress" on public.topic_progress
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'saved_setups' and policyname = 'own setups') then
    create policy "own setups" on public.saved_setups
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- A cap on setups per student per topic, enforced where it cannot be skipped.
-- progress.js keeps 12; the database allows a little slack for races.
create or replace function public.saved_setups_cap() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(*) from public.saved_setups
      where user_id = new.user_id and topic_id = new.topic_id) >= 20 then
    raise exception 'too many saved setups for this topic';
  end if;
  return new;
end $$;

drop trigger if exists saved_setups_cap on public.saved_setups;
create trigger saved_setups_cap before insert on public.saved_setups
  for each row execute function public.saved_setups_cap();
