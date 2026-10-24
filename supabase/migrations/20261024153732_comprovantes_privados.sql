-- Comprovantes são objetos privados, separados do documento financeiro.
-- O nome do arquivo é gerado no cliente; o primeiro segmento é auth.uid().
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oaze-receipts', 'oaze-receipts', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "oaze_receipts_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'oaze-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "oaze_receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'oaze-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "oaze_receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'oaze-receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
