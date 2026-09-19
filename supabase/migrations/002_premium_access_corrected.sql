-- Idempotent Premium access schema and RLS.
-- This migration does not create or promote an admin account.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'premium' check (role in ('admin', 'premium')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  time_limit numeric not null default 30 check (time_limit >= 0),
  possibility_limit bigint not null default 0 check (possibility_limit >= 0),
  last_active_at timestamptz
);

create table if not exists public.system_settings (
  id boolean primary key default true,
  non_login_time_limit numeric not null default 30 check (non_login_time_limit >= 0),
  non_login_possibility_limit bigint not null default 0 check (non_login_possibility_limit >= 0)
);

create table if not exists public.search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hash_input text not null,
  output text not null,
  created_at timestamptz not null default now()
);

-- These additions make a partially-created table usable without replacing data.
do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'role' and not attisdropped) then
    alter table public.profiles add column role text not null default 'premium';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'approval_status' and not attisdropped) then
    alter table public.profiles add column approval_status text not null default 'pending';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'disabled' and not attisdropped) then
    alter table public.profiles add column disabled boolean not null default false;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'created_at' and not attisdropped) then
    alter table public.profiles add column created_at timestamptz not null default now();
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'approved_at' and not attisdropped) then
    alter table public.profiles add column approved_at timestamptz;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'time_limit' and not attisdropped) then
    alter table public.profiles add column time_limit numeric not null default 30;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'possibility_limit' and not attisdropped) then
    alter table public.profiles add column possibility_limit bigint not null default 0;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = 'last_active_at' and not attisdropped) then
    alter table public.profiles add column last_active_at timestamptz;
  end if;
end
$$;

insert into public.system_settings (id)
values (true)
on conflict (id) do nothing;

create index if not exists search_history_user_created_idx
  on public.search_history (user_id, created_at desc, id desc);

-- Existing auth users are covered if the earlier trigger was not installed.
insert into public.profiles (id)
select u.id
from auth.users as u
on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.disabled = false
  );
$$;

create or replace function public.create_pending_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role, approval_status)
  values (new.id, 'premium', 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.create_pending_profile();

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin()
     and (
       new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.approval_status is distinct from old.approval_status
       or new.disabled is distinct from old.disabled
       or new.created_at is distinct from old.created_at
       or new.approved_at is distinct from old.approved_at
       or new.time_limit is distinct from old.time_limit
       or new.possibility_limit is distinct from old.possibility_limit
     )
  then
    raise exception 'Only an admin may change profile permissions or limits';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
before update on public.profiles
for each row
execute function public.protect_profile_fields();

create or replace function public.keep_three_searches()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.search_history as h
  where h.user_id = new.user_id
    and h.id not in (
      select recent.id
      from public.search_history as recent
      where recent.user_id = new.user_id
      order by recent.created_at desc, recent.id desc
      limit 3
    );
  return new;
end;
$$;

drop trigger if exists search_history_limit on public.search_history;
create trigger search_history_limit
after insert on public.search_history
for each row
execute function public.keep_three_searches();

alter table public.profiles enable row level security;
alter table public.system_settings enable row level security;
alter table public.search_history enable row level security;

-- Replacing only policies owned by this migration makes reruns safe.
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;
drop policy if exists settings_admin on public.system_settings;
drop policy if exists settings_admin_read on public.system_settings;
drop policy if exists settings_admin_update on public.system_settings;
drop policy if exists history_self_read on public.search_history;
drop policy if exists history_admin_read on public.search_history;
drop policy if exists history_self_insert on public.search_history;
drop policy if exists history_admin_insert on public.search_history;
drop policy if exists history_admin_delete on public.search_history;
drop policy if exists history_self on public.search_history;

create policy profiles_self_read
on public.profiles
for select
using (id = auth.uid());

create policy profiles_admin_read
on public.profiles
for select
using (public.is_admin());

create policy profiles_self_update
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy profiles_admin_update
on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

create policy profiles_admin_delete
on public.profiles
for delete
using (public.is_admin());

create policy settings_admin_read
on public.system_settings
for select
using (public.is_admin());

create policy settings_admin_update
on public.system_settings
for update
using (public.is_admin())
with check (public.is_admin());

create policy history_self_read
on public.search_history
for select
using (user_id = auth.uid());

create policy history_admin_read
on public.search_history
for select
using (public.is_admin());

create policy history_self_insert
on public.search_history
for insert
with check (
  (user_id = auth.uid())
  and exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.role = 'premium'
      and p.approval_status = 'approved'
      and p.disabled = false
  )
);

create policy history_admin_insert
on public.search_history
for insert
with check (public.is_admin());

create policy history_admin_delete
on public.search_history
for delete
using (public.is_admin());

-- Policy expressions need to execute is_admin as the caller; the function only
-- returns a boolean and remains protected by SECURITY DEFINER/search_path.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
revoke all on function public.create_pending_profile() from public;
revoke all on function public.protect_profile_fields() from public;
revoke all on function public.keep_three_searches() from public;
