-- =============================================================
-- Sincronização entre aparelhos: o banco mescla, ninguém sobrescreve
-- -------------------------------------------------------------
-- Até aqui cada aparelho gravava o documento INTEIRO com um upsert.
-- Um celular aberto com a cópia de ontem, ao editar qualquer coisa,
-- regravava todos os espaços com a versão velha — e o que o notebook
-- tinha salvo minutos antes sumia do banco. O notebook continuava
-- mostrando o dado certo (a mesclagem local manteve o mais novo), mas
-- ninguém o reenviava: os dois aparelhos passavam a discordar para
-- sempre. Era "não sincroniza", do jeito mais difícil de ver.
--
-- Agora a gravação passa por mesclar_dados(), que:
--   · trava a linha do usuário durante a troca (dois aparelhos
--     gravando juntos não se atropelam);
--   · mantém, espaço a espaço, o de `updatedAt` maior;
--   · registra exclusões em `removidos` ({id: carimbo}), para um
--     espaço apagado num aparelho não ressuscitar pelo outro;
--   · devolve o documento mesclado, que o aparelho aplica na hora.
--
-- SECURITY INVOKER de propósito: roda com o JWT de quem chamou, e as
-- políticas de RLS de `dados` continuam sendo a trava. auth.uid()
-- nulo (sem sessão) é recusado antes de qualquer leitura.
-- =============================================================

alter table public.dados
  add column if not exists removidos jsonb not null default '{}'::jsonb;

-- Carimbo de um espaço: só dígitos contam; qualquer outra coisa é 0.
create or replace function public.carimbo_perfil(p jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) = 'number' and (p #>> '{}') ~ '^[0-9]{1,15}$' then (p #>> '{}')::bigint
    when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^[0-9]{1,15}$' then (p #>> '{}')::bigint
    when jsonb_typeof(p) = 'object' and coalesce(p ->> 'updatedAt', '') ~ '^[0-9]{1,15}$' then (p ->> 'updatedAt')::bigint
    else 0
  end;
$$;

create or replace function public.mesclar_dados(
  p_profiles  jsonb,
  p_removidos jsonb default '{}'::jsonb,
  p_meta      jsonb default '{}'::jsonb
)
returns table (profiles jsonb, removidos jsonb, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user    uuid := auth.uid();
  v_perfis  jsonb;
  v_rem     jsonb;
  v_chave   text;
  v_valor   jsonb;
begin
  if v_user is null then
    raise exception 'sem_sessao' using errcode = '42501';
  end if;

  p_profiles  := coalesce(p_profiles, '{}'::jsonb);
  p_removidos := coalesce(p_removidos, '{}'::jsonb);
  if jsonb_typeof(p_profiles) <> 'object' or jsonb_typeof(p_removidos) <> 'object' then
    raise exception 'corpo_invalido' using errcode = '22023';
  end if;
  -- 5 MB é muito mais do que anos de uso; acima disso é erro ou abuso.
  if octet_length(p_profiles::text) > 5242880 then
    raise exception 'documento_grande' using errcode = '54000';
  end if;

  insert into public.dados (user_id, profiles, meta, removidos)
  values (v_user, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
  on conflict (user_id) do nothing;

  select d.profiles, d.removidos
    into v_perfis, v_rem
    from public.dados d
   where d.user_id = v_user
     for update;

  v_perfis := coalesce(v_perfis, '{}'::jsonb);
  v_rem    := coalesce(v_rem, '{}'::jsonb);

  -- exclusões: o carimbo mais novo de cada id vence
  for v_chave, v_valor in select e.key, e.value from jsonb_each(p_removidos) e loop
    if public.carimbo_perfil(v_valor) > public.carimbo_perfil(v_rem -> v_chave) then
      v_rem := jsonb_set(v_rem, array[v_chave], to_jsonb(public.carimbo_perfil(v_valor)));
    end if;
  end loop;

  -- espaços: o `updatedAt` mais novo vence; espaço novo entra
  for v_chave, v_valor in select e.key, e.value from jsonb_each(p_profiles) e loop
    continue when jsonb_typeof(v_valor) <> 'object';
    if not (v_perfis ? v_chave)
       or public.carimbo_perfil(v_valor) > public.carimbo_perfil(v_perfis -> v_chave) then
      v_perfis := jsonb_set(v_perfis, array[v_chave], v_valor);
    end if;
  end loop;

  -- um espaço apagado depois da última edição sai do documento
  for v_chave, v_valor in select e.key, e.value from jsonb_each(v_rem) e loop
    if (v_perfis ? v_chave)
       and public.carimbo_perfil(v_valor) >= public.carimbo_perfil(v_perfis -> v_chave) then
      v_perfis := v_perfis - v_chave;
    end if;
  end loop;

  update public.dados d
     set profiles  = v_perfis,
         removidos = v_rem,
         meta      = coalesce(p_meta, '{}'::jsonb)
   where d.user_id = v_user;

  return query select v_perfis, v_rem, now();
end;
$$;

revoke all on function public.mesclar_dados(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.mesclar_dados(jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.carimbo_perfil(jsonb) from public, anon;
grant execute on function public.carimbo_perfil(jsonb) to authenticated;
