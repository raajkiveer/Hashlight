alter table public.system_settings
  add column if not exists non_login_enabled boolean not null default true;
