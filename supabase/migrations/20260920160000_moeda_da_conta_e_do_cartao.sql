-- =============================================================
-- OAZE — a moeda (e o "considerar nos totais") passam a existir
--        também no banco
-- -------------------------------------------------------------
-- Em 20/09/2026 a conta de débito ganhou moeda própria, como o
-- cartão internacional tem desde 17/09. Ao ligar o caminho, veio
-- à tona um defeito mais antigo e mais sério: NADA disso estava
-- sendo gravado.
--
-- O app guarda o perfil no aparelho e o espelha em tabelas
-- relacionais (repo.js). O mapeamento não tinha `moeda`, nem
-- `cotacao`, nem `valor_moeda` — e nem `considerado`. Na prática:
-- quem cadastrou um cartão em dólar e abriu o app noutro aparelho
-- recebia o cartão de volta em real, com o limite lido como reais
-- e as compras sem o valor original. Sem erro no console, sem
-- aviso: o dado simplesmente não ia.
--
-- Estas colunas fecham esse buraco. Os padrões são exatamente o
-- que todo dado existente significa hoje — 'BRL' e `true` —, então
-- nenhuma linha muda de sentido ao ganhar a coluna.
-- =============================================================

alter table public.accounts
  add column if not exists moeda text not null default 'BRL',
  add column if not exists cotacao numeric,
  add column if not exists considerado boolean not null default true;

alter table public.credit_cards
  add column if not exists moeda text not null default 'BRL',
  add column if not exists cotacao numeric,
  add column if not exists considerado boolean not null default true;

-- No lançamento as duas são opcionais: só existem quando ele
-- nasceu em outra moeda. `valor` continua sendo o valor em REAIS,
-- que é o que todos os totais somam.
alter table public.transactions
  add column if not exists moeda text,
  add column if not exists valor_moeda numeric;

-- Código de moeda é ISO 4217: três letras maiúsculas. A restrição
-- existe para o dado não virar "us$", "dolar" ou "" — o app formata
-- por esse código, e um código inválido viraria texto quebrado na
-- tela de quem nem cadastrou moeda nenhuma.
alter table public.accounts drop constraint if exists accounts_moeda_ck;
alter table public.accounts add constraint accounts_moeda_ck
  check (moeda ~ '^[A-Z]{3}$');

alter table public.credit_cards drop constraint if exists credit_cards_moeda_ck;
alter table public.credit_cards add constraint credit_cards_moeda_ck
  check (moeda ~ '^[A-Z]{3}$');

alter table public.transactions drop constraint if exists transactions_moeda_ck;
alter table public.transactions add constraint transactions_moeda_ck
  check (moeda is null or moeda ~ '^[A-Z]{3}$');

-- A cotação, quando existe, é positiva: é ela que multiplica o
-- valor, e um zero guardado zeraria o saldo da pessoa.
alter table public.accounts drop constraint if exists accounts_cotacao_ck;
alter table public.accounts add constraint accounts_cotacao_ck
  check (cotacao is null or cotacao > 0);

alter table public.credit_cards drop constraint if exists credit_cards_cotacao_ck;
alter table public.credit_cards add constraint credit_cards_cotacao_ck
  check (cotacao is null or cotacao > 0);
