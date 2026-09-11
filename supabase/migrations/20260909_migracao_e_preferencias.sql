-- =============================================================
-- OAZE — o diário da migração ganha "dispensada", e o tema
--        passa a ser da PESSOA, não do aparelho
-- -------------------------------------------------------------
-- Duas correções de defeitos que se pareciam: os dois faziam o app
-- esquecer uma decisão que o usuário já tinha tomado.
-- =============================================================

-- -------------------------------------------------------------
-- 1 · migração dispensada
-- -------------------------------------------------------------
-- O DEFEITO: o convite "levar seus dados para a conta" reaparecia
-- a cada login, para sempre. Mig.jaMigrou() só procurava linhas
-- com status 'concluida'; quem clicava "Agora não" não deixava
-- registro nenhum, então na sessão seguinte a pergunta voltava do
-- zero. Um "não" que não é lembrado é a mesma coisa que não ter
-- sido perguntado.
--
-- "Dispensada" é uma decisão do usuário e vive no BANCO, não no
-- localStorage. No localStorage ela sumiria justamente em quem
-- limpa o navegador — a mesma pessoa que mais vê o convite.
alter table public.data_migrations
  drop constraint if exists data_migrations_status_ck;

alter table public.data_migrations
  add constraint data_migrations_status_ck
  check (status in ('em_andamento', 'concluida', 'falhou', 'dispensada'));

alter table public.data_migrations
  add column if not exists dispensado_em   timestamptz,
  add column if not exists qtd_registros   int,
  add column if not exists backup_id       text;

comment on column public.data_migrations.backup_id is
  'Identificador do backup baixado antes da cópia. Serve para ligar um arquivo na pasta de downloads de alguém a esta linha, quando algo precisar ser reconstruído.';

comment on column public.data_migrations.qtd_registros is
  'Quantos registros foram detectados no aparelho. Guardado mesmo quando a migração é dispensada: é o que permite dizer depois "havia 412 lançamentos aqui".';

-- Uma linha final por origem, seja ela concluída ou dispensada.
-- Duas decisões diferentes, o mesmo efeito: não perguntar de novo.
create unique index if not exists data_migrations_decidida_idx
  on public.data_migrations (user_id, origem)
  where status in ('concluida', 'dispensada');

-- -------------------------------------------------------------
-- 2 · tema por usuário
-- -------------------------------------------------------------
-- O DEFEITO: o tema morava só no localStorage. Trocar de aparelho
-- ou limpar o navegador devolvia a pessoa ao escuro, mesmo tendo
-- escolhido claro — e quem escolhe claro costuma ter um motivo
-- (luz do ambiente, sensibilidade, leitura).
--
-- NULL É UM VALOR COM SIGNIFICADO: "nunca escolhi". Nesse caso o
-- app segue o sistema operacional, que é o padrão certo. Gravar
-- 'dark' como default aqui tiraria essa distinção e faria o
-- sistema operacional ser ignorado para todo mundo.
alter table public.user_settings
  add column if not exists tema text;

alter table public.user_settings
  drop constraint if exists user_settings_tema_ck;

alter table public.user_settings
  add constraint user_settings_tema_ck
  check (tema is null or tema in ('light', 'dark'));

comment on column public.user_settings.tema is
  'NULL = seguir o sistema operacional. Só ''light'' ou ''dark'' quando a pessoa escolheu explicitamente em Configurações → Aparência.';
