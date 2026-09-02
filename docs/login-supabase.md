# Login com Supabase

O OAZE passou a ter conta própria: e-mail e senha, num formulário dentro do
app. Antes só existia o botão "Entrar com Google", que abre um pop-up — e
pop-up é justamente o que navegador de celular bloqueia com mais frequência.

Nada foi removido. O Firebase continua funcionando, e quem já entrou com
Google continua entrando com Google.

---

## Como o app escolhe o provedor

Os dois backends se registram no mesmo núcleo (`assets/js/sync.js`) e vale o
primeiro que estiver **configurado**, na ordem de prioridade:

| Provedor | Prioridade | Login | Configurado quando |
|---|---|---|---|
| Supabase | 10 | e-mail e senha, no app | `supabase-config.js` tem `url` e `anonKey` |
| Firebase | 20 | Google, em pop-up | `firebase-config.js` tem `apiKey` e `databaseURL` |

Se os dois estiverem preenchidos, **o Supabase ganha**. Se nenhum estiver, o
app funciona só com o `localStorage` — offline, isolado por aparelho, como
sempre funcionou. O botão de login some e nada quebra.

Isso é deliberado: a nuvem é uma camada opcional por cima. A fonte da verdade
continua sendo o navegador.

---

## Ligar o Supabase — cinco passos

1. **Crie um projeto** em [supabase.com/dashboard](https://supabase.com/dashboard).

2. **Copie as credenciais.** Em ⚙ *Project Settings → API*, pegue a
   *Project URL* e a chave *anon* e cole em `assets/js/supabase-config.js`:

   ```js
   window.SupabaseConfig = {
     url: 'https://xxxxxxxxxxxx.supabase.co',
     anonKey: 'eyJhbGciOi...'
   };
   ```

3. **Rode o SQL.** No *SQL Editor*, cole o conteúdo de
   [`docs/supabase.sql`](supabase.sql) e execute. Ele cria a tabela `dados`,
   liga o RLS com quatro políticas, instala o gatilho de `updated_at` e
   registra a tabela no Realtime. É idempotente — pode rodar de novo.

4. **Ative o e-mail.** Em *Authentication → Providers → Email*, deixe
   habilitado. Para testar sem precisar confirmar o e-mail, desligue
   *Confirm email* temporariamente.

5. **Autorize o endereço.** Em *Authentication → URL Configuration*, ponha o
   endereço do site em *Site URL* e em *Redirect URLs*. Sem isso, o link
   mágico e o retorno do Google não voltam para o app.

**Opcionais:** ative *Google* em Providers para o botão "Continuar com
Google"; e confirme o *Realtime* na tabela `dados` para que um aparelho
avise o outro sem recarregar a página.

Depois disso, rode `build-arquivo-unico.ps1` de novo — o `financas.html` é um
retrato do código no momento da geração. Sem regerar, o PC sincroniza e o
iPhone não, sem nenhum aviso.

---

## Sobre a chave `anon` estar no frontend

Ela é pública por projeto — o próprio Supabase a chama de *publishable* e a
embute no front-end de qualquer app web. Não é um segredo vazado.

**Quem protege os dados é o RLS.** As políticas do `supabase.sql` amarram
cada linha ao dono comparando `auth.uid()` com `user_id`, para leitura,
inserção, alteração e remoção. Sem o SQL rodado, ninguém lê nada — nem você.

O que **nunca** pode ir para o frontend é a chave `service_role`: ela ignora
o RLS do projeto inteiro e daria acesso total ao banco a qualquer pessoa que
abrisse o site. Ela existe só para uso em servidor.

Duas linhas de defesa a mais, ambas já no repositório:

- a CSP do `vercel.json` só libera `*.supabase.co` em `connect-src`;
- o `update` tem `with check` além de `using`, então uma linha não pode ser
  transferida para outro `user_id` no meio de uma alteração.

---

## O que sincroniza

Só `profiles` — contas, cartões, categorias, lançamentos, investimentos e
faturas — num único documento `jsonb` por usuário.

Tema e perfil ativo **não** sincronizam: são preferências de cada aparelho.

**Conflito:** cada perfil carrega um `updatedAt`. Vence o carimbo mais
recente, perfil a perfil. No primeiro login os dois lados se somam, então
pode haver duplicata (dois "Pessoal", por exemplo) — apague o que sobrar em
⚙ Perfis. Depois disso o mesmo identificador vale nos dois aparelhos.

### Por que `jsonb` e não tabelas normalizadas

Não existe consulta relacional do lado do servidor: o app lê tudo de uma vez
e calcula no navegador. Normalizar obrigaria a manter duas modelagens em
sincronia e a migrar o banco a cada campo novo, sem ganho nenhum. Um
documento por usuário é a forma honesta do que isto realmente é — uma cópia
sincronizada do `localStorage`.

---

## Como isto foi testado

Sem um projeto Supabase real — criar conta em serviço externo não é algo que
eu faça em nome de alguém. O que foi verificado:

| Verificação | Resultado |
|---|---|
| App sobe com o `sync.js` refatorado, só Firebase configurado | ✅ cai no Firebase, botão "Entrar com Google" |
| Com Supabase configurado, backend escolhido | ✅ `Sync.status().backend === 'supabase'` |
| Erros de JavaScript no carregamento | ✅ nenhum |
| Formulário de login, tema escuro e claro | ✅ |
| Alternância entrar ↔ criar conta (campo Nome, rótulos) | ✅ |
| SDK vendorizado carrega e expõe `createClient` | ✅ |

**Não testado, porque exige um projeto de verdade:** o login em si, a leitura
e a gravação na tabela, as políticas de RLS em execução e o canal de
Realtime. As mensagens de erro cobrem os casos previsíveis — tabela ausente,
provider desativado, e-mail não confirmado, limite de tentativas — mas nenhuma
delas passou por um servidor real ainda.
