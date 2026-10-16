-- One row per synced record. The app stores each record as JSON and merges
-- devices by last write wins on updated_at (client clock, ms).
create table if not exists public.user_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  table_name text not null,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, table_name, id)
);

create index if not exists user_records_pull_idx
  on public.user_records (user_id, server_updated_at);

-- The pull cursor relies on server_updated_at moving forward on every write.
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists user_records_touch on public.user_records;
create trigger user_records_touch
  before insert or update on public.user_records
  for each row execute function public.touch_server_updated_at();

-- Each person can only ever see and change their own rows.
alter table public.user_records enable row level security;

drop policy if exists "own rows" on public.user_records;
create policy "own rows" on public.user_records
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
