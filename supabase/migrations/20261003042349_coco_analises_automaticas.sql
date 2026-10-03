-- Resumos mensais calculados pelo OAZE, separados das regras confirmadas pelo usuário.
alter table public.coco_settings
  add column if not exists analysis_consented_at timestamptz;

create table if not exists public.coco_analyses (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (length(profile_id) between 1 and 100),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  summary text check (summary is null or length(summary) between 1 and 800),
  forgotten_hash text check (forgotten_hash is null or forgotten_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id, period),
  constraint coco_analyses_content check ((summary is not null) <> (forgotten_hash is not null))
);

create index if not exists coco_analyses_recent_idx
  on public.coco_analyses (user_id, profile_id, updated_at desc);

alter table public.coco_analyses enable row level security;
alter table public.coco_analyses force row level security;
revoke all on public.coco_analyses from anon, authenticated;
grant select, insert, update, delete on public.coco_analyses to authenticated;

create policy coco_analyses_own_select on public.coco_analyses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy coco_analyses_own_insert on public.coco_analyses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy coco_analyses_own_update on public.coco_analyses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy coco_analyses_own_delete on public.coco_analyses for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.coco_analyses is 'Resumos mensais automáticos da Coco, gerados apenas com consentimento ativo; não autorizam ações financeiras.';
