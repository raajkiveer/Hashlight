alter table public.profiles
  add column if not exists email text;

update public.profiles as p
set email = u.email
from auth.users as u
where p.id = u.id
  and p.email is distinct from u.email;

create or replace function public.create_pending_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, role, approval_status)
  values (new.id, new.email, 'premium', 'pending')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_profile_email();
