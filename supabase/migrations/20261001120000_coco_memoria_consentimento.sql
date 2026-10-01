-- Coco V3: consentimento revogável e memória confirmada, separada dos dados contábeis.
create table if not exists public.coco_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  consented_at timestamptz,
  revoked_at timestamptz,
  learning_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint coco_settings_dates check (revoked_at is null or consented_at is not null)
);

create table if not exists public.coco_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (length(profile_id) between 1 and 100),
  kind text not null check (kind in ('categoria', 'conta', 'recorrencia', 'preferencia', 'meta', 'outro')),
  label text not null check (length(label) between 1 and 100),
  value text not null check (length(value) between 1 and 240),
  source text not null default 'confirmado_pelo_usuario' check (source = 'confirmado_pelo_usuario'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coco_memories_user_profile_idx
  on public.coco_memories (user_id, profile_id, created_at desc);

alter table public.coco_settings enable row level security;
alter table public.coco_settings force row level security;
alter table public.coco_memories enable row level security;
alter table public.coco_memories force row level security;

revoke all on public.coco_settings, public.coco_memories from anon, authenticated;
grant select, insert, update, delete on public.coco_settings, public.coco_memories to authenticated;

create policy coco_settings_own_select on public.coco_settings for select to authenticated
  using ((select auth.uid()) = user_id);
create policy coco_settings_own_insert on public.coco_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy coco_settings_own_update on public.coco_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy coco_settings_own_delete on public.coco_settings for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy coco_memories_own_select on public.coco_memories for select to authenticated
  using ((select auth.uid()) = user_id);
create policy coco_memories_own_insert on public.coco_memories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy coco_memories_own_update on public.coco_memories for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy coco_memories_own_delete on public.coco_memories for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.coco_settings is 'Consentimento específico e pausa do aprendizado da Coco, por usuário.';
comment on table public.coco_memories is 'Somente preferências que o usuário confirmou; nunca fonte contábil ou autorização de pagamento.';
