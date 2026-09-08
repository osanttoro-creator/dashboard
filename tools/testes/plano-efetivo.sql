-- =============================================================
-- plano-efetivo.sql — qual plano vale, em cada estado
-- -------------------------------------------------------------
-- meus_direitos() decide o que o usuário pode fazer. Um erro aqui
-- não aparece como erro: aparece como alguém com Pro sem ter pago,
-- ou como alguém que pagou e perdeu o acesso.
--
-- A REGRA, EM UMA FRASE
-- Você tem o plano que pagou, enquanto durar o período que pagou.
--
-- O CASO QUE ORIGINOU ESTE ARQUIVO
-- A versão anterior fazia `status in ('active','pending')`. 'pending'
-- é o boleto emitido e ainda não compensado — conceder ali é
-- entregar antes de receber. Bastava iniciar um checkout para ter
-- Pro sem pagar nada, e nenhum erro apareceria.
--
-- COMO RODAR
--   cole no SQL Editor do Supabase. Tudo em transação; nada fica.
-- =============================================================
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('cccccccc-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plano@oaze.local','x', now(), now(), now());

create temp table r (caso text, esperado text, obtido text, passou boolean);
grant all on r to authenticated;

do $$
declare
  casos text[][] := array[
    -- status,      plano, fim do periodo, agendado, quando,     esperado
    array['active',   'pro',  '+30 days', null,    null,       'pro'],
    array['pending',  'pro',  '+30 days', null,    null,       'free'],
    array['past_due', 'pro',  '+30 days', null,    null,       'pro'],
    array['canceled', 'pro',  '+30 days', 'free',  '+30 days', 'pro'],
    array['active',   'pro',  '-1 day',   'free',  '-1 day',   'free'],
    array['active',   'pro',  '+30 days', 'basic', '-1 day',   'basic'],
    array['active',   'pro',  '+30 days', 'basic', '+30 days', 'pro'],
    array['expired',  'pro',  '-1 day',   null,    null,       'free'],
    array['free',     'free', null,       null,    null,       'free']
  ];
  c text[]; obtido text;
begin
  foreach c slice 1 in array casos loop
    delete from public.subscriptions where user_id='cccccccc-0000-4000-8000-000000000003';
    insert into public.subscriptions (user_id, plan_id, billing_cycle, status,
        current_period_end, plano_agendado, agendado_para)
    values ('cccccccc-0000-4000-8000-000000000003', c[2], 'monthly', c[1],
        case when c[3] is null then null else now() + c[3]::interval end,
        c[4],
        case when c[5] is null then null else now() + c[5]::interval end);

    perform set_config('request.jwt.claims',
      '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
    select public.meus_direitos()->>'plano' into obtido;

    insert into r values (
      c[1]||' plano='||c[2]||' fim='||coalesce(c[3],'-')||' agend='||coalesce(c[4],'-')||'@'||coalesce(c[5],'-'),
      c[6], obtido, obtido = c[6]);
  end loop;
end $$;

select caso, esperado, obtido,
       case when passou then 'PASSA' else 'FALHA' end as veredito
from r;

-- Os nove casos precisam passar. O segundo — 'pending' devolvendo
-- 'free' — é o que impede entregar sem receber.
select count(*) filter (where not passou) as reprovados from r;

rollback;
