create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'premium' check (role in ('admin','premium')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  time_limit numeric not null default 30 check (time_limit >= 0),
  possibility_limit bigint not null default 0 check (possibility_limit >= 0),
  last_active_at timestamptz
);
create table public.system_settings (
  id boolean primary key default true check (id),
  non_login_time_limit numeric not null default 30 check (non_login_time_limit >= 0),
  non_login_possibility_limit bigint not null default 0 check (non_login_possibility_limit >= 0)
);
insert into public.system_settings default values on conflict do nothing;
create table public.search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hash_input text not null,
  output text not null,
  created_at timestamptz not null default now()
);
create index search_history_user_created_idx on public.search_history(user_id, created_at desc);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin' and not disabled);
$$;
create or replace function public.create_pending_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id) values (new.id) on conflict do nothing; return new; end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_pending_profile();
create or replace function public.keep_three_searches() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from search_history where user_id = new.user_id and id not in (select id from search_history where user_id = new.user_id order by created_at desc, id desc limit 3); return new; end;
$$;
create trigger search_history_limit after insert on public.search_history for each row execute function public.keep_three_searches();
alter table public.profiles enable row level security;
alter table public.system_settings enable row level security;
alter table public.search_history enable row level security;
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() and role = 'premium' or public.is_admin()) with check (id = auth.uid() and role = 'premium' or public.is_admin());
create policy profiles_admin_delete on public.profiles for delete using (public.is_admin());
create policy settings_admin on public.system_settings for all using (public.is_admin()) with check (public.is_admin());
create policy history_self on public.search_history for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() and exists(select 1 from profiles p where p.id = auth.uid() and p.approval_status = 'approved' and not p.disabled) or public.is_admin());
create or replace function public.protect_profile_fields() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.role <> old.role or new.approval_status <> old.approval_status or new.disabled <> old.disabled or new.time_limit <> old.time_limit or new.possibility_limit <> old.possibility_limit) then
    raise exception 'Only an admin may change profile permissions or limits';
  end if;
  return new;
end;
$$;
create trigger protect_profile_fields before update on public.profiles for each row execute function public.protect_profile_fields();
