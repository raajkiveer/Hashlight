do $$
declare
  constraint_name text;
  table_name text;
begin
  for constraint_name, table_name in
    select con.conname
      , rel.relname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('profiles', 'system_settings')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%possibility_limit%>= 0%'
  loop
    execute format('alter table public.%I drop constraint %I', table_name, constraint_name);
  end loop;
end $$;
