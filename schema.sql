-- Supabase SQL Editor'da bir kez çalıştır.

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Yeni not',
  content     text default '',
  drawing     jsonb default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists notes_touch_updated_at on public.notes;
create trigger notes_touch_updated_at
  before update on public.notes
  for each row execute function public.touch_updated_at();

-- Row Level Security
alter table public.notes enable row level security;

drop policy if exists "Kullanıcı kendi notlarını görür" on public.notes;
create policy "Kullanıcı kendi notlarını görür"
  on public.notes for select using (auth.uid() = user_id);

drop policy if exists "Kullanıcı kendi notunu ekler" on public.notes;
create policy "Kullanıcı kendi notunu ekler"
  on public.notes for insert with check (auth.uid() = user_id);

drop policy if exists "Kullanıcı kendi notunu günceller" on public.notes;
create policy "Kullanıcı kendi notunu günceller"
  on public.notes for update using (auth.uid() = user_id);

drop policy if exists "Kullanıcı kendi notunu siler" on public.notes;
create policy "Kullanıcı kendi notunu siler"
  on public.notes for delete using (auth.uid() = user_id);
