-- =============================================================
-- OAZE — funções e RLS dos planos
-- -------------------------------------------------------------
-- O QUE O USUÁRIO PODE FAZER NESTAS TABELAS: ler.
-- Só isso. Nem plano, nem status, nem limite, nem contador.
--
-- Não é rigor por rigor. Se houvesse política de UPDATE em
-- subscriptions, virar "pro" seria uma linha de DevTools; se
-- houvesse em usage_counters, zerar a cota da IA seria outra.
-- Escrever nestas tabelas é privilégio de quem roda no servidor:
-- a Edge Function e o webhook.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · todo usuário novo nasce no Grátis
-- -------------------------------------------------------------
-- Por gatilho, não por código de aplicação: assim vale para quem
-- entra por e-mail, por Google, por link mágico ou por qualquer
-- caminho que exista amanhã. E o ON CONFLICT torna a operação
-- idempotente — nunca duas assinaturas.
create or replace function public.criar_assinatura_gratis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subscriptions (user_id, plan_id, status, billing_cycle)
  values (new.id, 'free', 'free', 'monthly')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_assinatura_gratis();

-- Quem já existe também recebe.
insert into public.subscriptions (user_id, plan_id, status, billing_cycle)
select u.id, 'free', 'free', 'monthly' from auth.users u
on conflict (user_id) do nothing;

-- -------------------------------------------------------------
-- 2 · os direitos de um usuário, resolvidos
-- -------------------------------------------------------------
-- Uma consulta só, para o cliente não precisar juntar três tabelas
-- e para o servidor ter uma fonte única. Status que não vale
-- (past_due, canceled, expired) cai para os direitos do Grátis —
-- os DADOS continuam, o que muda é o que se pode criar de novo.
create or replace function public.meus_direitos()
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  with assinatura as (
    select
      case when s.status in ('active', 'pending') then s.plan_id else 'free' end as plano,
      s.status, s.billing_cycle, s.current_period_end, s.cancel_at_period_end,
      s.plan_id as plano_contratado
    from public.subscriptions s
    where s.user_id = (select auth.uid())
  )
  select jsonb_build_object(
    'plano',            coalesce((select plano from assinatura), 'free'),
    'plano_contratado', (select plano_contratado from assinatura),
    'status',           coalesce((select status from assinatura), 'free'),
    'ciclo',            (select billing_cycle from assinatura),
    'fim_periodo',      (select current_period_end from assinatura),
    'cancela_no_fim',   coalesce((select cancel_at_period_end from assinatura), false),
    'limites', coalesce((
      select jsonb_object_agg(e.chave, e.limite)
      from public.plan_entitlements e
      where e.tipo = 'limite'
        and e.plan_id = coalesce((select plano from assinatura), 'free')
    ), '{}'::jsonb),
    'recursos', coalesce((
      select jsonb_object_agg(e.chave, e.ativo)
      from public.plan_entitlements e
      where e.tipo = 'recurso'
        and e.plan_id = coalesce((select plano from assinatura), 'free')
    ), '{}'::jsonb)
  );
$$;

grant execute on function public.meus_direitos() to authenticated;

-- -------------------------------------------------------------
-- 3 · consumo da IA — reservar e estornar
-- -------------------------------------------------------------
-- A regra do brief tem duas partes que puxam para lados opostos:
-- o contador precisa ser atômico (senão dois pedidos simultâneos
-- passam do teto) e a cota só pode ser gasta quando a resposta
-- conclui (senão um erro do provedor cobra do usuário).
--
-- Fazer só uma das duas é escolher qual falha aceitar. A saída é
-- reservar antes e ESTORNAR se der errado: a atomicidade vem do
-- incremento condicional, e a justiça vem do estorno.
create or replace function private.reservar_ia(p_user uuid, p_limite int)
returns table(permitido boolean, usado int, teto int, periodo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  p text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  n int;
begin
  /* O incremento e a checagem do teto na MESMA instrução: o
     Postgres serializa o conflito e a segunda chamada enxerga o
     valor já incrementado pela primeira. */
  insert into public.usage_counters (user_id, tipo, periodo, usado, limite)
  values (p_user, 'ai_query', p, 1, p_limite)
  on conflict (user_id, tipo, periodo) do update
    set usado = public.usage_counters.usado + 1,
        limite = excluded.limite,
        updated_at = now()
    where public.usage_counters.usado < excluded.limite
  returning public.usage_counters.usado into n;

  if n is null then
    /* Não houve linha devolvida: o teto barrou. Buscamos o valor
       atual só para poder dizer "5 de 5" em vez de "no limite". */
    select uc.usado into n from public.usage_counters uc
      where uc.user_id = p_user and uc.tipo = 'ai_query' and uc.periodo = p;
    return query select false, coalesce(n, p_limite), p_limite, p;
  else
    return query select true, n, p_limite, p;
  end if;
end;
$$;

create or replace function private.estornar_ia(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usage_counters
     set usado = greatest(0, usado - 1), updated_at = now()
   where user_id = p_user
     and tipo = 'ai_query'
     and periodo = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
$$;

-- Só o servidor reserva e estorna. Se o navegador pudesse chamar
-- estornar_ia, a cota seria decorativa.
revoke all on function private.reservar_ia(uuid, int) from public, anon, authenticated;
revoke all on function private.estornar_ia(uuid) from public, anon, authenticated;
grant execute on function private.reservar_ia(uuid, int) to service_role;
grant execute on function private.estornar_ia(uuid) to service_role;
grant usage on schema private to service_role;

-- -------------------------------------------------------------
-- 4 · privilégios e RLS
-- -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['plans','plan_prices','plan_entitlements',
                           'subscriptions','usage_counters','subscription_events']
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end;
$$;

-- Catálogo é público para quem está logado: saber o que o Pro
-- oferece não é informação sensível, é a página de preços.
drop policy if exists "logado lê o catálogo" on public.plans;
create policy "logado lê o catálogo" on public.plans
  for select to authenticated using (true);

drop policy if exists "logado lê os preços" on public.plan_prices;
create policy "logado lê os preços" on public.plan_prices
  for select to authenticated using (true);

drop policy if exists "logado lê os direitos" on public.plan_entitlements;
create policy "logado lê os direitos" on public.plan_entitlements
  for select to authenticated using (true);

-- A assinatura, o consumo e o histórico são de quem é.
drop policy if exists "dono lê a assinatura" on public.subscriptions;
create policy "dono lê a assinatura" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "dono lê o consumo" on public.usage_counters;
create policy "dono lê o consumo" on public.usage_counters
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "dono lê o histórico" on public.subscription_events;
create policy "dono lê o histórico" on public.subscription_events
  for select to authenticated using ((select auth.uid()) = user_id);

-- Nenhuma política de INSERT, UPDATE ou DELETE em nenhuma das seis.
-- Repetindo porque parece falta: é o mecanismo.
