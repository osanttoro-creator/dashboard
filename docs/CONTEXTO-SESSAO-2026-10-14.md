# Contexto do OAZE para outra IA — sessão de 13–14/10/2026

> Documento de passagem de bastão. Descreve o estado do projeto, o que mudou nesta
> sessão, o que ficou decidido, o que ficou em aberto e o que NÃO foi verificado.
> Serve para outra IA continuar sem reconstruir o raciocínio do zero.

---

## 1. O projeto

**OAZE** — controle financeiro pessoal, site + aplicativo web. Produto de Jonatham
Santos. Em produção em **https://oaze.site**.

- **Código:** `G:\Meu Drive\sites\OAZE\o site`
  A pasta antiga `C:\Users\santtoro\Downloads\sites\OAZE` **foi apagada** — não existe mais.
- **Repositório:** `git@github.com:osanttoro-creator/dashboard.git`, branch `main`.
- **Stack:** HTML, CSS e JavaScript puros, **sem build step**. Supabase para auth e
  dados. Dados financeiros em `public.dados`, protegidos por RLS.
- **Publicação:** push em `main` → GitHub Actions ("Publica na Hostinger") →
  `deploy/hostinger/montar-pacote.ps1` monta o pacote a partir de uma **lista
  explícita** de arquivos e pastas → sobe para a Hostinger. Vai ao ar em ~15–40 s.
  Não há `gh` instalado nesta máquina.
- **O repositório NÃO tem identidade git configurada.** `git commit` falha com
  "Author identity unknown". Commitar assim:
  `git -c user.name="Jonatham Santos" -c user.email="o.santtoro@gmail.com" commit ...`

### Arquitetura do aplicativo

- A rota **`/app` é servida por `app-v3.html`**, que carrega a interface de
  **`preview-v3/`**. Editar `assets/js/forms.js` ou `cards.js` NÃO muda o app.
- `preview-v3/app.js` (~3.200 linhas) é o monólito da interface: render, eventos,
  formulários. `preview-v3/live-backend.js` é a ponte autenticada com o Supabase.
- `preview-v3/index.html?demo=1` é a prévia com dados de exemplo, sem gravação.
- A V2 (painel anterior) **foi apagada**. Não existe `?classic=1`.

### Identidade visual

Night Ocean `#0d1821`, Coconut Milk `#f0e5cf`, Oasis Teal `#5fa99b`, painel `#132633`.
Unbounded (títulos, tracking `-0.05em`), Instrument Sans (corpo), IBM Plex Mono
(rótulos). Documentado em `DESIGN.md`. A assistente é a axolote **Coco** (não existe
mais "UGLEZ"). O plástico dos cartões segue a **cor da instituição** (Itaú laranja,
Nubank roxo), não a paleta do OAZE — decisão confirmada.

### Como verificar antes de publicar

```
node tools/verificar-tudo.js
```
São **34 verificações** (mais duas que precisam de banco e ficam de fora). Precisam
estar todas verdes antes de qualquer push. Dois testes são geradores:

- `node tools/gen-idiomas.js --extrair` / `--conferir` / sem flag (gera en, fr, es do site)
- `node tools/gen-idiomas-app.js --extrair` / `--conferir` / sem flag (dicionário do app)

Todo texto novo visível no app precisa de tradução em en, fr e es nos JSON de
`i18n/app/`; string técnica (chave de localStorage, prefixo de console, atributo
`data-*`) recebe `"ignorar": true` em vez de tradução.

---

## 2. O que foi pedido nesta sessão

Jonatham relatou cinco incômodos:

1. "Olá, bem-vindo ao OAZE" não aparecia na versão mobile.
2. O OAZE pergunta demais: pedia permissão antes de entrar na conta, de novo ao
   entrar, e de novo para conversar com a Coco. Juntar tudo numa coisa só, no momento
   do login — **sem autorizar, o login não é confirmado**.
3. Na tela de início o "olá, usuário" deveria aparecer também no desktop.
4. O site abre pop-ups desnecessários (ex.: ocultar cartões); precisam de "não mostrar
   novamente".
5. O app está confuso, com funções demais à mostra. Redesenhar com base em prints do
   **Piere** e do **Mobills**: opções secundárias dentro de "mostrar mais" no
   lançamento; na área de lançamentos só entradas e saídas mais uma área de filtros;
   reconstruir a tela inicial. Mostrar primeiro, implementar depois.

Depois, ao ver a primeira proposta, acrescentou uma restrição decisiva:

> **Não pode sair: 1) a carteira e seu funcionamento, 2) investimentos, 3) a Coco.**

---

## 3. O que foi feito (tudo publicado e no ar)

| Commit | Conteúdo |
|---|---|
| `d6af1cc` | Autorização única no login, boas-vindas no celular, "olá" no computador, "não perguntar novamente" |
| `aa3a570` | Maquete redesenhada no tamanho real de celular (390px) |
| `d1a23c6` | Maquete refeita: carteira, investimentos e Coco voltam inteiros |
| `c1a55ba` | Acertos de design da maquete (tarja lateral, caixa alta longa, contraste) |
| `2d95534` | **A implementação no app**: Início em blocos, filtros, lançamento em dois níveis |
| `3611eb6` | Carimbo de versão nos endereços (cache) |
| `1f623b2` | Carimbo passa a ser o hash do próprio arquivo, aplicado pelo montar-pacote.ps1 |

### 3.1 Boas-vindas no celular (item 1)

`assets/css/v3.css`: a regra `@media (max-width: 520px) and (max-height: 740px)`
desligava o portal da home e levava junto o `.portal-letreiro` — que não é máquina de
rolagem, é a boas-vindas. Agora painéis, dica e barra continuam fora, mas o letreiro
volta **estático, no topo**, via `order:-1` num `.portal-palco` em flex-column. Mesmo
tratamento em `prefers-reduced-motion`.

### 3.2 Uma autorização só (item 2)

Eram três perguntas em momentos diferentes. Agora:

- `entrar.html` e `cadastro.html` têm **uma caixa** cobrindo privacidade + termos +
  Coco, **antes** de a sessão existir. Sem marcar, nenhum caminho entra: Google,
  Apple, link mágico e senha passam por `autorizado()`, e o **toque único do Google**
  só é armado depois da marca (`armarToqueUnico`).
- `assets/js/site-auth.js`: `A.novoAceite()` passou a carregar `coco: true`, e o aceite
  pendente é guardado em **sessionStorage E localStorage**. Motivo: o link mágico volta
  numa aba nova e sessionStorage não atravessa aba — era por isso que o app perguntava
  de novo lá dentro.
- `preview-v3/live-backend.js`: `requirePrivacyAcceptance()` virou **`requireConsent()`**.
  Ela lê `privacy_acceptances` e `coco_settings`, consome a marca de
  `SiteAuth.aceitePendente()` e grava. **Quem tranca o app é a privacidade**; faltando
  só a Coco (conta antiga), o app abre e ela pede quando for usada. A tela bloqueante é
  resgate para quem entrou antes da mudança, e pergunta uma vez só pelas duas coisas.

Regra que não mudou: **marca de navegador não é prova de aceite**. Sem linha gravada no
banco, nenhum documento financeiro é lido.

### 3.3 "Olá, usuário" no computador (item 3)

A classe `.v3-mobile-greeting` foi renomeada para **`.v3-greeting`** e agora vale nos
dois tamanhos, com proporção maior na mesa. Na Início do desktop o `h1` "início" fica
visualmente oculto (continua para leitor de tela).

### 3.4 "Não perguntar novamente" (item 4)

`preview-v3/app.js` ganhou `ask(chave, mensagem, rótulo)` — um diálogo em HTML com
caixa "não perguntar novamente neste aparelho", guardada por chave em
`localStorage['oaze.v3.naoPerguntar']`. Aplicado a: ocultar conta/cartão, encerrar
recorrência, enviar foto/áudio à Coco, extrato duplicado. Reversível em
**Configurações → "Avisos que você escondeu"**.

**Ação sem volta continua no `confirm()` cru**: excluir conta, revogar a Coco, liberar
edição de perfil para outra pessoa. Silenciar só é aceitável quando desfazer é barato.

### 3.5 O redesenho (item 5)

**Maquete:** `preview-v3/proposta-v4.html`, publicada em
https://oaze.site/preview-v3/proposta-v4.html — `noindex`, sem código compartilhado com
a V3, números inventados. Mostra Início, Carteira, Investimentos, Lançamentos, painel de
filtros, Novo lançamento (fechado e aberto) e Coco.

**A primeira versão da maquete estava errada** e foi refeita: ela trocou a carteira por
um cartão liso de "saldo em contas" e empurrou investimentos e Coco para o fim. Isso não
era simplificar, era apagar o que distingue o OAZE para ficar parecido com os
concorrentes. O corte certo era o que estava empilhado **em volta** da carteira.

**Implementação no app (`2d95534`):**

- **Início** — carteira é a primeira peça depois da saudação, nos dois tamanhos. Abaixo
  dela, blocos iguais. Entrou um bloco de **investimentos** (valor, aportado,
  rendimento, distribuição por tipo). Saíram da primeira dobra: fileira de 4
  indicadores, ações rápidas e OAZE Score — **desligados por padrão**, religáveis em
  **"Gerenciar tela inicial"** (`data-action="home-blocks"`), guardado em
  `localStorage['oaze.v3.inicio']`.
- **Lançamentos** — a faixa antiga (`Todos/Pix/Cartões/Débito/Crédito`) misturava meio
  de pagamento com tipo de instrumento. Agora: faixa de cortes rápidos (`Tudo`,
  `Entradas`, `Saídas`, `Cartões`, `Pendentes`) + **painel de filtros**
  (`v3-form-filtros`: situação, conta/cartão, categoria, busca), com contador de filtros
  ativos na faixa. No celular a faixa rola de lado — quebrada em duas linhas comia 91px
  antes da primeira transação; agora são 47. **Filtrar é leitura**, então continua
  liberado em perfil compartilhado somente leitura.
- **Novo lançamento** — de 13 controles visíveis para 8. "Como" (meio), parcelas,
  repetir (+ data da repetição, terminar em) e observações foram para
  **`<details class="v3-mais">` "Mais detalhes"**. A dobra **nasce aberta** quando o
  lançamento editado já é recorrente ou parcelado — campo obrigatório escondido em dobra
  fechada trava o envio sem dizer onde.

Carteira, investimentos e Coco mantidos com o comportamento de hoje.

### 3.6 O cache (descoberta importante)

Jonatham relatou duas vezes que "nada mudou no app". **O deploy estava correto** — o
arquivo servido era o novo, verificado byte a byte. A causa era o navegador: o site não
tem build, os arquivos moram sempre no mesmo endereço, e a Hostinger manda
`Cache-Control: max-age=0, must-revalidate` **junto com** um `Expires` de uma semana à
frente. Navegador que escolhe o `Expires` serve o arquivo velho do disco sem consultar o
servidor. **Publicar e a pessoa não ver, com o deploy verde.**

Correção em `deploy/hostinger/montar-pacote.ps1`: ao montar o pacote, cada endereço de
`.js` e `.css` nas páginas recebe `?v=<sha256 do próprio arquivo, 10 chars>`. Hash e não
data: com data, todo deploy invalidaria tudo; com hash, só muda o endereço do que de
fato mudou. São 307 endereços nas 133 páginas do pacote (pt, en, fr, es). O `?v=` que
está no HTML do repositório é **lugar reservado** — há comentário dizendo isso.
Endereço apontando para arquivo não empacotado **derruba o pacote**.

---

## 4. Decisões tomadas sem resposta do Jonatham (reversíveis)

Ele não respondeu quatro perguntas; estes foram os padrões adotados:

1. Indicadores, ações rápidas e Score: **desligados por padrão**, com a porta de volta
   sempre visível.
2. Score: bloco opcional, não tela própria.
3. "Gerenciar tela inicial": guardado **no aparelho** (localStorage), não na conta —
   é preferência de quem olha, não dado financeiro.
4. Piso tipográfico de 10 px → 11 px nos rótulos do app: **NÃO foi feito**, continua em
   aberto.

---

## 5. O que NÃO foi verificado

- **Nada foi testado em conta real autenticada.** Toda a validação de interface foi na
  prévia com dados de exemplo (`?demo=1`), que não grava.
- Falta confirmar: gravar um lançamento pelo formulário novo em conta real; e o
  registro do aceite único (`privacy_acceptances` + `coco_settings`) na primeira carga
  autenticada depois da mudança.
- Deploy verde e arquivos idênticos **não provam** que o fluxo financeiro funciona.

---

## 6. Convenções e armadilhas desta base

- **Estilo de comentário:** o código é densamente comentado em português, explicando
  *por que* a solução é aquela e que erro ela evita — não o que a linha faz. Manter esse
  tom. Mensagens de commit seguem o mesmo padrão.
- **Heredoc come cifrão:** aplicar patch em JS por heredoc no bash transforma `$$` em
  `$`. Usar as ferramentas de escrita/edição de arquivo, ou scripts Node lidos de
  arquivo — nunca heredoc para código.
- **Não há Python** nesta máquina. Node está disponível.
- **O Google Drive confunde o git:** arquivos aparecem como modificados por diferença de
  stat mesmo com conteúdo idêntico, o que faz `git stash pop` abortar. Para recuperar um
  stash nesse estado: `git show "stash@{0}:<arquivo>" > <arquivo>`, um por um.
- **Detector de design:** `impeccable detect <arquivo> [--no-advisory]`. Em
  `preview-v3/proposta-v4.html` há supressões registradas em `.impeccable/config.json`,
  cada uma com motivo: tracking do display (o DESIGN.md manda `-0.05em` e o detector é
  mais apertado que a marca), contraste do vermelho (o detector resolve o fundo como
  `#35353f`, cor que não existe na página; o real dá 6,3:1), e cartão-dentro-de-cartão e
  padding apertado (o detector conta a moldura do aparelho como cartão).
  **Pendências anteriores a esta sessão:** `preview-v3/app.css` linhas 13 e 470 têm
  borda de 3 px num lado. Não foram tocadas.
- **Segundo cérebro:** Jonatham mantém um cofre Obsidian em `G:\Meu Drive\my brain`,
  com `AGENTS.md` (postura e regras) e notas do projeto em `03 - Projetos/OAZE/`. É
  **somente leitura** — só se escreve nele quando a mensagem contém `/save`.

---

## 7. Como continuar

1. Ler `G:\Meu Drive\my brain\AGENTS.md` e as notas de `03 - Projetos/OAZE/`.
2. Confirmar o estado real no repositório, nunca só nas notas.
3. Rodar `node tools/verificar-tudo.js` antes e depois de qualquer mudança.
4. Publicar: commit com a identidade acima, push em `main`, e conferir **no ar** —
   comparando o arquivo servido com o do disco, não só o status do workflow.
