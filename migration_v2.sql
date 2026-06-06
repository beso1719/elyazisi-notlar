-- v2: sayfa türleri + PDF desteği. Supabase SQL Editor'da bir kez çalıştır.

-- notes tablosuna yeni sütunlar
alter table public.notes add column if not exists page_style text not null default 'blank';
alter table public.notes add column if not exists page_count int  not null default 1;
alter table public.notes add column if not exists pdf_path  text;

-- PDF dosyaları için özel (private) storage bucket
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- Storage RLS: herkes yalnızca kendi dosyasına erişir (owner = auth.uid())
drop policy if exists "pdf select own" on storage.objects;
create policy "pdf select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'pdfs' and owner = auth.uid());

drop policy if exists "pdf insert own" on storage.objects;
create policy "pdf insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pdfs' and owner = auth.uid());

drop policy if exists "pdf update own" on storage.objects;
create policy "pdf update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'pdfs' and owner = auth.uid());

drop policy if exists "pdf delete own" on storage.objects;
create policy "pdf delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pdfs' and owner = auth.uid());
