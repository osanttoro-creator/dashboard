# Login com Supabase

O OAZE tem conta própria: e-mail e senha, num formulário dentro do app. Antes
só existia o botão "Entrar com Google", que abre um pop-up — e pop-up é
justamente o que navegador de celular bloqueia com mais frequência.

O Firebase foi removido em 12/09/2026: nunca chegou a ser configurado, então
o SDK jamais era baixado e aquele backend jamais era escolhido. O login com
Google continua existindo — agora pelo Supabase, e sem pop-up.

**Projeto ligado:** `gxwatircdhhetvzzlwwq` (OAZE, us-west-2, Postgres 17.6).
Migração aplicada, RLS verificado em execução — os resultados estão no fim
desta página.

---

## Por que não há `npm install` aqui

O pedido original foi `npm install @supabase/supabase-js @supabase/ssr` com
variáveis `NEXT_PUBLIC_*` num `.env`. Essas instruções vêm do guia de Next.js
do Supabase, e **este projeto não é Next.js**:

| O que o guia supõe | O que este projeto é |
|---|---|
| bundler que resolve `import` | 32 `<script src>` clássicos, sem build |
| `process.env` no build | nenhum build — o navegador nunca vê `process` |
| servidor renderizando páginas | site estático; só `api/` roda no servidor |
| `node_modules` | dependências **vendorizadas** em `assets/vendor/` |

Três consequências práticas:

1. **`node_modules` não seria carregável.** Os pacotes são ESM para bundler; o
   navegador não os alcança sem um passo de build que não existe.
2. **`@supabase/ssr` não tem função aqui.** Ele serve para guardar a sessão em
   *cookies* no servidor. Não há servidor renderizando página neste app — a
   sessão vive no `localStorage`, que é o modelo certo para SPA estática.
3. **Um `package.json` na raiz seria perigoso.** Hospedagens detectam framework
   pela presença dele: o projeto poderia deixar de ser servido como estático e
   passar a tentar um build inexistente, derrubando o deploy.

O que foi feito no lugar: o **mesmo pacote**, `@supabase/supabase-js@2.113.0`,
na build UMD, vendorizado em `assets/vendor/supabase.js` — exatamente como o
Chart.js já era tratado. O CDN é tentado primeiro; o arquivo local é a rede de
segurança para uso offline e `file://`.

---

## Onde ficam as credenciais

Em **dois** lugares, porque servem a dois consumidores diferentes:

| Arquivo | Quem lê | Versionado |
|---|---|---|
| `assets/js/supabase-config.js` | o **front-end** — é isto que faz o login funcionar | sim |
| `.env` | nada mais — os valores de servidor vivem nos secrets do Supabase | não |
| `.env.example` | ninguém; documenta o formato | sim |

O `.env` está no `.gitignore` porque é onde uma chave secreta de verdade vai
acabar caindo um dia — a `ANTHROPIC_API_KEY` já está prevista lá.

**Ao trocar de projeto Supabase, troque nos dois lugares.**

### A chave publicável no frontend

`sb_publishable_…` é pública por projeto — o nome que o Supabase dá a ela diz
exatamente isso. Não é segredo vazado.

**Quem protege os dados é o RLS**, e ele foi verificado em execução (tabela no
fim desta página). O que **nunca** pode ir ao frontend é a `service_role` ou
uma `sb_secret_…`: elas ignoram o RLS do projeto inteiro.

---

## Como o app escolhe o provedor

Os dois backends se registram no mesmo núcleo (`assets/js/sync.js`) e vale o
primeiro **configurado**, na ordem de prioridade:

| Provedor | Prioridade | Login | Configurado quando |
|---|---|---|---|
| Supabase | 10 | e-mail e senha, link mágico, Google | `supabase-config.js` tem `url` e chave |

Se nenhum estiver preenchido, o app funciona só com o `localStorage` — offline,
isolado por aparelho. O botão de login some e nada quebra. A nuvem é uma camada
opcional; a fonte da verdade continua sendo o navegador.

### O formulário se adapta ao projeto

Ao conectar, o app consulta `/auth/v1/settings` (endpoint público) e esconde o
que não estiver ligado. Hoje, neste projeto, o botão "Continuar com Google"
**não aparece**, porque o provedor Google está desativado. Botão que só leva a
`provider is not enabled` é pior que botão nenhum: promete uma porta que não
existe.

---

## Estado atual do projeto e o que falta ligar

Consultado em `/auth/v1/settings`:

| Configuração | Estado | Efeito |
|---|---|---|
| Provider **Email** | ✅ ativo | login com e-mail e senha funciona |
| Cadastro aberto | ✅ permitido | qualquer um pode criar conta |
| **Confirmação de e-mail** | ⚠️ **obrigatória** | o link precisa ser aberto antes do 1º login |
| Provider **Google** | ❌ desativado | botão escondido automaticamente |

**Duas coisas para decidir no painel:**

1. **SMTP.** O servidor de e-mail embutido do Supabase é fortemente limitado
   (poucas mensagens por hora) e existe só para desenvolvimento. Com
   confirmação obrigatória, isso vira o gargalo do cadastro. Ou configure um
   SMTP próprio em *Authentication → Emails → SMTP Settings*, ou desligue
   *Confirm email* em *Authentication → Providers → Email*.

2. **URL Configuration.** Em *Authentication → URL Configuration*, o endereço
   publicado precisa estar em *Site URL* e em *Redirect URLs* — sem isso o link
   de confirmação e o link mágico não voltam para o app.

Opcional: ativar **Google** em Providers faz o botão reaparecer sozinho, sem
mexer no código.

---

## O que sincroniza

Só `profiles` — contas, cartões, categorias, lançamentos, investimentos e
faturas — num único documento `jsonb` por usuário, na tabela `public.dados`.

Tema e perfil ativo **não** sincronizam: são preferências de cada aparelho.

**Conflito:** cada perfil carrega um `updatedAt`. Vence o carimbo mais recente,
perfil a perfil. No primeiro login os dois lados se somam, então pode haver
duplicata (dois "Pessoal", por exemplo) — apague o que sobrar em ⚙ Perfis.

### Onde os dados moram de verdade

**No Supabase, quando há conta.** O `localStorage` deixou de ser o original e
passou a ser cinco coisas menores:

- cache, para a tela abrir sem esperar a rede;
- fila do que foi feito offline;
- recuperação temporária quando a leitura do servidor falha;
- backup da migração;
- preferências deste aparelho (tema, mês em foco, perfil aberto).

Nada disso é "os dados". É a conveniência em volta deles.

**Sem conta, o `localStorage` continua sendo tudo o que existe** — e o app diz
isso com essas palavras no indicador de sincronização, em vez de fingir que há
um servidor por trás.

#### As duas modelagens, e por que as duas existem

A tabela `dados` (um documento `jsonb` por usuário) veio primeiro e continua
servindo à sincronização entre aparelhos, que é uma troca de estado inteiro.
O esquema normalizado — `workspaces`, `accounts`, `transactions` e companhia —
é o registro oficial: é sobre ele que o RLS isola conta a conta, é dele que os
limites de plano são contados, e é ele que a exclusão de conta apaga em cascata.

`repo.js` é a única fronteira entre as duas formas. O caminho de ida
(`enviarEspaco`) já existia; o de volta (`carregarEspaco`) foi escrito na fase 2
e é o que tornou o banco a fonte, em vez de um depósito.

#### A regra que não se quebra

`Dados.carregarDoBanco` **recusa** trazer o servidor por cima do aparelho
enquanto houver fila pendente ou migração não concluída. Sem essa trava, o
caminho para perder dados é curto e silencioso: edita offline, a rede volta, o
banco desce por cima, e a edição some sem erro nenhum.

A trava é consultada por quem lê, e não garantida por ordem de chamada — a
migração é interativa e pode levar minutos ou nunca acontecer, e nenhum `await`
ordena isso. Coberto por `tools/testes/trava-sobrescrita.js`, seis casos.

---

## Verificação do RLS, em execução

Rodado no banco real, com impersonação de papel e claims de JWT — exatamente o
que o PostgREST faz a cada requisição. Dois usuários, A e B:

| Passo | Resultado |
|---|---|
| 1 · A grava a própria linha | ✅ permitido |
| 2 · A grava linha do B | ✅ bloqueado |
| 3 · Linhas que A enxerga | ✅ 1 (só a dele) |
| 4 · A transfere a linha para B | ✅ bloqueado, erro `42501` |
| 5 · A edita a própria linha | ✅ 1 linha alterada |
| 6 · Anônimo lê a tabela | ✅ bloqueado, erro `42501` |
| 7 · Limpeza | ✅ 0 linhas, 0 usuários restantes |

O passo 4 é o que mais importa: sem `with check` no `update`, um usuário
reatribuiria a própria linha para outra conta. E o passo 6 confirma o `revoke`
— o papel anônimo não tem privilégio nenhum na tabela, além de não ter política.

`get_advisors` de segurança: **nenhum alerta**.

### O que ainda não foi exercitado

O **login em si** — `signUp` e `signInWithPassword` contra a Auth. O Supabase
valida o domínio do e-mail e recusa endereços de teste (`example.com`,
domínios inexistentes), e criar uma conta com um e-mail real seu não é algo
que eu faça sem você pedir.

O que ficou provado é que, uma vez logado, o usuário grava e lê exatamente a
própria linha e nada além dela. O caminho entre "clicou em Entrar" e "tem
sessão" é código do próprio SDK do Supabase, com as mensagens de erro já
traduzidas — mas o primeiro cadastro de verdade é seu.

Para testar: abra o app, "Não tenho conta", use um e-mail real, confirme pelo
link e entre. Se algo falhar, o erro aparece traduzido no próprio formulário.

---

## Entrar com Google e com a Apple

O site tem os dois botões em `/entrar` e `/cadastro` desde 12/09/2026. Eles
**não aparecem sozinhos**: o script pergunta ao projeto, em `/auth/v1/settings`,
quais provedores estão ligados, e mostra só os que existem. Botão que leva a
"provider is not enabled" promete uma porta que não há — pior do que botão
nenhum. É a mesma regra que o painel já usava para o Google.

Estado de hoje neste projeto: `google: false`, `apple: false`. Enquanto estiver
assim, as duas páginas ficam exatamente como eram, só com e-mail.

A sessão que vem do Google ou da Apple **fica salva** igual à do e-mail: mesma
gaveta (`oaze.supabase.auth`), `persistSession`, renovação automática e PKCE.
Entrar em `/entrar` é estar dentro em `/app`, e fechar o navegador não desloga.

### 1 · Google

1. `console.cloud.google.com` → crie ou escolha um projeto.
2. **APIs e serviços → Tela de permissão OAuth**: tipo **Externo**, nome do app
   `OAZE`, e-mail de suporte e e-mail do desenvolvedor. Publique.
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**:
   - Origem JavaScript autorizada:
     `https://mediumvioletred-viper-277230.hostingersite.com`
   - URI de redirecionamento autorizado:
     `https://gxwatircdhhetvzzlwwq.supabase.co/auth/v1/callback`
4. Copie o **Client ID** e o **Client secret**.
5. Supabase → **Authentication → Providers → Google**: cole os dois, ligue e
   salve.

### 2 · Apple

Exige conta paga no **Apple Developer Program** (US$ 99 por ano). Sem ela, o
provedor não existe — e o botão continua escondido, sem quebrar nada.

1. `developer.apple.com` → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App ID**, com *Sign in with Apple* habilitado.
3. **Identifiers → Services ID** (por exemplo `com.oaze.web`): habilite
   *Sign in with Apple* e clique em *Configure*:
   - Domains: `gxwatircdhhetvzzlwwq.supabase.co`
   - Return URLs: `https://gxwatircdhhetvzzlwwq.supabase.co/auth/v1/callback`
4. **Keys → +**: habilite *Sign in with Apple*, baixe o arquivo `.p8` (ele só
   pode ser baixado uma vez) e anote o **Key ID**. O **Team ID** fica no canto
   superior direito do portal.
5. Supabase → **Authentication → Providers → Apple**: o **Services ID** vai no
   campo *Client ID*, mais Team ID, Key ID e o conteúdo do `.p8`. Ligue e salve.

> A Apple envia o nome da pessoa **só na primeira autorização**, e o e-mail pode
> chegar mascarado (`@privaterelay.appleid.com`). É o comportamento dela, não um
> defeito do OAZE — e o painel usa o que vier.

### 3 · Endereços de volta (vale para os dois)

Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://mediumvioletred-viper-277230.hostingersite.com`
- **Redirect URLs**: `https://mediumvioletred-viper-277230.hostingersite.com/**`
  — e `http://localhost:4173/**` se for testar no servidor local.

Sem o endereço na lista, o provedor devolve para a Site URL e a pessoa cai na
página errada, sem erro nenhum na tela.

### 4 · Conferir que ligou

```bash
curl -s -H "apikey: SUA_CHAVE_PUBLICAVEL" \
  https://gxwatircdhhetvzzlwwq.supabase.co/auth/v1/settings \
  | grep -o '"google":[a-z]*\|"apple":[a-z]*'
```

`true` quer dizer que o botão passa a aparecer sozinho no site, **sem novo
deploy** — a página pergunta isso a cada carregamento.

### O que ainda não existe

O modal de conta do painel (`supabase-auth.js`) oferece só o Google. A Apple
ainda não foi acrescentada lá — o site é que tem os dois.

---

## O Google num toque (One Tap)

Desde 12/09/2026 o site tem **duas** entradas pelo Google, e elas convivem:

1. **O botão** "Continuar com Google". Sai da página, passa pelo Google, volta
   com `?code=` e o SDK troca por sessão. É o caminho que sempre funciona.
2. **A bolha**, no canto superior direito. Não sai da página: a Google entrega
   um token de identidade e o Supabase troca por sessão ali mesmo
   (`signInWithIdToken`). É a entrada mais curta que existe.

A bolha some sozinha para quem não está logado numa conta Google no navegador,
para quem a dispensou há pouco (a Google impõe um descanso) e para quem bloqueia
scripts de terceiro. Nesses casos o botão continua no lugar — ninguém fica sem
porta. Por isso todo o caminho da bolha falha **calado**: um aviso de erro para
algo que a pessoa nem pediu seria pior do que o silêncio.

### O nonce, que é a parte fácil de errar

A Google recebe o **resumo** (SHA-256 em hexadecimal) e o Supabase recebe o
valor **cru**. Inverter os dois faz o login falhar com uma mensagem que não
explica nada. Está em `site-auth.js`, em `parDeNonce()`, e segue a receita da
documentação do Supabase.

### O que precisa estar ligado para a bolha aparecer

- **`googleClientId` em `supabase-config.js`.** É o identificador público do
  cliente OAuth — o mesmo que aparece na URL para onde o botão manda. Nunca o
  *client secret*, que vive só no painel do Supabase. Vazio desliga a bolha e
  não quebra nada.
- **A origem do site em "Origens JavaScript autorizadas"**, no Google Cloud.
  Sem isso a Google recusa em silêncio e só a bolha some; o botão segue
  funcionando. É por isso que a bolha não aparece em `localhost:4173`: aquela
  origem não está autorizada.
- **`accounts.google.com` na CSP**, em `script-src` e `connect-src`. Ela vive em
  `deploy/hostinger/.htaccess` (o `public_html/.htaccess` é cópia gerada). Sem a
  liberação, o navegador bloqueia o script e não sobra nem erro visível.

### A porta principal

Havendo qualquer provedor ligado, o Google vira a ação de cima — botão claro,
52px — e o formulário de e-mail recolhe atrás de "Entrar com e-mail". Sem
provedor nenhum, a página fica **exatamente** como sempre foi: recolher o
e-mail sem ter o que pôr no lugar deixaria a tela sem porta.

Uma consequência a saber: com o e-mail recolhido, "Esqueci a senha" fica a um
clique de distância, dentro do bloco. Quem chega para recuperar senha precisa
abrir o e-mail primeiro.

### A espera de três segundos, e a memória

`/auth/v1/settings` responde em 1,7 a 3,8 segundos. A página fica pronta em
meio segundo e passava o resto do tempo sem botão nenhum — quem clicava em
"Entrar" olhava, não via porta e concluía que não existia.

A resposta é guardada em `localStorage`, na gaveta `oaze.provedores`. Na visita
seguinte a tela é desenhada com o que já se sabia, **junto com o DOM** (medido:
674–710 ms), e a resposta da rede corrige depois se algo mudou. Na primeira
visita não há o que lembrar e a espera continua.

`montarSocial` roda, portanto, **duas vezes** — uma pela memória, outra pela
rede — e precisa ser idempotente: `ligados` evita ouvinte de clique dobrado (um
clique, dois logins) e `recolheu` evita recolher de novo um e-mail que a pessoa
já abriu. As duas são declaradas **antes** da primeira chamada: com `var`, a
atribuição só acontece quando a execução passa pela linha, e deixá-las depois
fazia a chamada pela memória ler `undefined` e matar o resto do script.

Se a memória estiver velha e o provedor tiver saído, a rede esconde o botão e
devolve o formulário de e-mail à tela.
