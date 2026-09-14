-- =============================================================
-- OAZE — preferências voltam a salvar
-- -------------------------------------------------------------
-- user_settings, profiles e onboarding_progress usavam o gatilho
-- toca_versao(), que no UPDATE escreve em new.versao. Essas três
-- tabelas não têm a coluna versao, então TODO update nelas falhava
-- com 'record "new" has no field "versao"'.
--
-- Efeito visível: a escolha de tema nunca chegava ao servidor. Ao
-- entrar, Tema.aoEntrar() lia o valor antigo ('light') e repintava
-- o app de claro a cada visita. Editar o perfil e avançar no
-- onboarding também não gravavam.
--
-- As três passam a usar um gatilho que só atualiza updated_at.
-- =============================================================

create or replace function public.toca_atualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_settings_versao on public.user_settings;
create trigger user_settings_atualizado before insert or update on public.user_settings
  for each row execute function public.toca_atualizado();

drop trigger if exists profiles_versao on public.profiles;
create trigger profiles_atualizado before insert or update on public.profiles
  for each row execute function public.toca_atualizado();

drop trigger if exists onboarding_progress_versao on public.onboarding_progress;
create trigger onboarding_progress_atualizado before insert or update on public.onboarding_progress
  for each row execute function public.toca_atualizado();
