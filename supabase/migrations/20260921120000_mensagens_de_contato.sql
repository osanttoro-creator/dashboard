-- =============================================================
-- OAZE — mensagens do formulário de contato
-- -------------------------------------------------------------
-- O site mandava as pessoas escreverem para suporte@oaze.site, em
-- 18 lugares, sem que ninguém tivesse confirmado que a caixa
-- existia. Um e-mail que volta é pior do que nenhum: a pessoa acha
-- que foi ouvida.
--
-- Agora o formulário da página de suporte grava AQUI primeiro e só
-- depois tenta mandar o e-mail (função oaze-contato). A ordem é o
-- ponto: se o envio falhar — chave do provedor ausente, provedor
-- fora do ar —, a mensagem continua guardada e pode ser lida no
-- painel do Supabase. Nenhuma se perde por causa do correio.
--
-- Só a função escreve e lê (service role). Sem política de RLS
-- nenhuma, o navegador não alcança esta tabela: nem para ler as
-- mensagens dos outros, nem para gravar sem passar pelo limite.
-- =============================================================

create table if not exists public.mensagens_contato (
  id           uuid primary key default gen_random_uuid(),
  criado_em    timestamptz not null default now(),
  nome         text not null check (char_length(nome) between 1 and 100),
  email        text not null check (char_length(email) between 3 and 200),
  mensagem     text not null check (char_length(mensagem) between 10 and 5000),
  idioma       text not null default 'pt' check (idioma in ('pt', 'en', 'fr', 'es')),
  pagina       text check (pagina is null or char_length(pagina) <= 200),
  -- Nunca o IP em claro: o hash basta para o limite de envio e não
  -- identifica ninguém fora deste banco.
  origem_hash  text,
  enviado_em   timestamptz,
  erro_envio   text check (erro_envio is null or char_length(erro_envio) <= 300),
  respondido   boolean not null default false
);

alter table public.mensagens_contato enable row level security;
-- (sem políticas: só a service role, que ignora RLS, lê e escreve)

create index if not exists mensagens_contato_criado_em_idx
  on public.mensagens_contato (criado_em desc);

comment on table public.mensagens_contato is
  'Formulário de contato do site. Gravada pela função oaze-contato antes do envio do e-mail; lida pelo painel. Sem acesso pelo navegador.';
