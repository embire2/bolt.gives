-- bolt.gives SessionManager backing table
-- Apply this in your Supabase project's SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.bolt_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  payload jsonb not null,
  share_slug uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Security: do not allow access with the publishable key by default.
-- The app's SessionManager API route uses the secret key (service role), which bypasses RLS.
alter table public.bolt_sessions enable row level security;

create or replace function public.bolt_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bolt_sessions_set_updated_at on public.bolt_sessions;

create trigger bolt_sessions_set_updated_at
before update on public.bolt_sessions
for each row execute function public.bolt_set_updated_at();

create index if not exists bolt_sessions_created_at_idx on public.bolt_sessions (created_at desc);

