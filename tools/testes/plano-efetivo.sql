-- =============================================================
-- plano-efetivo.sql — qual plano vale, em cada estado
-- -------------------------------------------------------------
-- meus_direitos() decide o que o usuário pode fazer. Um erro aqui
-- não aparece como erro: aparece como um plano indevido ou como
-- alguém que perdeu o acesso que ainda deveria ter.
--
-- A REGRA, EM UMA FRASE
-- Um plano não gratuito só vale com status ativo ou em encerramento
-- e antes do fim do período registrado.
--
-- O CASO QUE ORIGINOU ESTE ARQUIVO
-- A versão anterior fazia `status in ('active','pending')`. 'pending'
-- não representa acesso confirmado — conceder ali daria Pro sem
-- autorização, e nenhum erro apareceria.
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
    -- status,      plano, fim do periodo, esperado
    array['active',   'pro',  '+30 days', 'pro'],
    array['pending',  'pro',  '+30 days', 'free'],
    array['past_due', 'pro',  '+30 days', 'pro'],
    array['canceled', 'pro',  '+30 days', 'pro'],
    array['active',   'pro',  '-1 day',   'free'],
    array['expired',  'pro',  '-1 day',   'free'],
    array['free',     'free', null,       'free']
  ];
  c text[]; obtido text;
begin
  foreach c slice 1 in array casos loop
    delete from public.subscriptions where user_id='cccccccc-0000-4000-8000-000000000003';
    insert into public.subscriptions (user_id, plan_id, billing_cycle, status,
        current_period_end)
    values ('cccccccc-0000-4000-8000-000000000003', c[2], 'monthly', c[1],
        case when c[3] is null then null else now() + c[3]::interval end);

    perform set_config('request.jwt.claims',
      '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
    select public.meus_direitos()->>'plano' into obtido;

    insert into r values (
      c[1]||' plano='||c[2]||' fim='||coalesce(c[3],'-'),
      c[4], obtido, obtido = c[4]);
  end loop;
end $$;

select caso, esperado, obtido,
       case when passou then 'PASSA' else 'FALHA' end as veredito
from r;

-- Os sete casos precisam passar. O segundo confirma que 'pending'
-- nunca concede acesso.
select count(*) filter (where not passou) as reprovados from r;

rollback;
