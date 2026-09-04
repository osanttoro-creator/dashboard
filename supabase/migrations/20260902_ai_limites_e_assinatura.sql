-- =============================================================
-- OAZE — uso de IA, limites por plano e assinatura
-- -------------------------------------------------------------
-- Três tabelas, e o princípio que governa as três: o navegador
-- NUNCA escreve nelas. Um usuário que pudesse gravar em ai_usage
-- apagaria o próprio consumo e zeraria o limite; um que pudesse
-- gravar em subscriptions se daria o plano mais caro de graça.
--
-- Por isso o desenho é assimétrico: política de SELECT para o
-- dono, e NENHUMA política de INSERT, UPDATE ou DELETE. Sem
-- política aplicável, a operação é negada — a escrita fica
-- exclusiva de quem ignora o RLS por natureza: a Edge Function
-- com a chave de serviço, no servidor, e o webhook de pagamento.
--
-- Isso é o contrário de um esquecimento. É o mecanismo.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · assinatura
-- -------------------------------------------------------------
-- Uma linha por usuário. Preenchida pelo webhook do provedor de
-- pagamento — nunca pelo app. Enquanto não existe linha, o plano
-- efetivo é 'free', decidido no servidor.
create table if not exists public.subscriptions (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  plan                     text        not null default 'free',
  provider                 text,
  external_customer_id     text,
  external_subscription_id text,
  status                   text        not null default 'active',
  started_at               timestamptz,
  current_period_end       timestamptz,
  canceled_at              timestamptz,
  trial_ends_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint subscriptions_status_ck
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete'))
);

comment on table public.subscriptions is
  'Assinatura por usuário. Escrita SÓ pelo webhook de pagamento; o cliente apenas lê a sua.';

-- -------------------------------------------------------------
-- 2 · limites de IA por plano
-- -------------------------------------------------------------
-- Configuração, não dado de usuário. Fica no banco em vez de no
-- código para mudar um limite sem redeploy da função.
create table if not exists public.ai_rate_limits (
  plan              text primary key,
  por_minuto        int  not null,
  por_dia           int  not null,
  por_mes           int  not null,
  max_entrada_chars int  not null,
  max_saida_tokens  int  not null,
  created_at        timestamptz not null default now(),
  constraint ai_rate_limits_positivos_ck
    check (por_minuto > 0 and por_dia > 0 and por_mes > 0
       and max_entrada_chars > 0 and max_saida_tokens > 0)
);

comment on table public.ai_rate_limits is
  'Teto de uso da IA por plano. Verificado no servidor; a interface só reflete.';

-- Valores de partida, conservadores de propósito: é mais fácil
-- afrouxar depois do que explicar uma fatura inesperada.
insert into public.ai_rate_limits
  (plan, por_minuto, por_dia, por_mes, max_entrada_chars, max_saida_tokens)
values
  ('free', 3,  20,  100,  4000, 700),
  ('pro',  10, 200, 2000, 8000, 1200)
on conflict (plan) do nothing;

-- -------------------------------------------------------------
-- 3 · registro de uso
-- -------------------------------------------------------------
-- É daqui que os limites são contados, então a integridade desta
-- tabela É o limite. Guarda o mínimo: quem, quando, qual modelo,
-- quantos tokens, deu certo. Nunca o prompt, nunca a resposta,
-- nunca dado financeiro.
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  workspace_id   uuid,
  created_at     timestamptz not null default now(),
  operacao       text        not null,
  modelo         text,
  tokens_entrada int,
  tokens_saida   int,
  status         text        not null,
  request_id     text        not null
);

comment on table public.ai_usage is
  'Uma linha por chamada de IA. Sem prompt, sem resposta, sem dado financeiro.';

-- A contagem por janela é a consulta quente: um índice por usuário
-- e tempo decrescente evita varrer a tabela a cada pergunta.
create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);

-- -------------------------------------------------------------
-- 4 · privilégios: só o que é preciso
-- -------------------------------------------------------------
-- O schema public do Supabase concede tudo aos dois papéis por
-- padrão. Revogamos e devolvemos apenas leitura — a escrita não
-- passa por aqui.
revoke all on public.subscriptions  from anon, authenticated;
revoke all on public.ai_rate_limits from anon, authenticated;
revoke all on public.ai_usage       from anon, authenticated;

grant select on public.subscriptions  to authenticated;
grant select on public.ai_rate_limits to authenticated;
grant select on public.ai_usage       to authenticated;

-- -------------------------------------------------------------
-- 5 · RLS
-- -------------------------------------------------------------
alter table public.subscriptions  enable row level security;
alter table public.ai_rate_limits enable row level security;
alter table public.ai_usage       enable row level security;

alter table public.subscriptions  force row level security;
alter table public.ai_rate_limits force row level security;
alter table public.ai_usage       force row level security;

drop policy if exists "dono lê a própria assinatura" on public.subscriptions;
create policy "dono lê a própria assinatura"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Tabela de configuração: todo mundo logado pode ler os tetos,
-- inclusive os dos planos que não assinou. Não há nada sensível
-- em saber quantas perguntas o plano pro permite.
drop policy if exists "logado lê os limites" on public.ai_rate_limits;
create policy "logado lê os limites"
  on public.ai_rate_limits for select
  to authenticated
  using (true);

drop policy if exists "dono lê o próprio consumo" on public.ai_usage;
create policy "dono lê o próprio consumo"
  on public.ai_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Nenhuma política de INSERT, UPDATE ou DELETE em nenhuma das três.
-- Repetindo, porque parece falta: é intencional. Sem política, a
-- operação é negada, e escrever passa a ser privilégio de quem
-- roda no servidor.

-- -------------------------------------------------------------
-- 6 · updated_at com a hora do servidor
-- -------------------------------------------------------------
create or replace function public.subscriptions_toca_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_toca_updated_at();
