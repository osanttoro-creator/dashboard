# OAZE 1.0 — auditoria, decisões e plano

Documento de entrega da migração `redesign/oaze-1`. Registra o que foi
encontrado, o que mudou, o que **não** dá para fazer nesta arquitetura e
como publicar com segurança.

---

## 1 · Auditoria do que existia

| Item | Achado |
|---|---|
| Framework | **Nenhum.** HTML/CSS/JS clássico, sem bundler |
| TypeScript | Não existe (0 arquivos `.ts`) |
| Dependências em runtime | Só Chart.js (CDN + cópia local) |
| `package.json` na raiz | Não existe — `tools/` tem um, só para gerar ícones |
| Build | `build-arquivo-unico.ps1` inlina tudo num HTML |
| Rotas | Sem router: seções `.page[data-page]` alternadas por classe |
| Autenticação | Login Google **opcional**, só para sincronizar |
| Banco de dados | `localStorage` (`financas.v1`) + Firebase Realtime DB opcional |
| APIs | Nenhuma própria. Anthropic chamada direto do navegador |
| Pagamentos / planos / permissões | **Não existem** |
| Analytics | **Não existe** (nem GA nem eventos) |
| SEO / URLs | Página única, sem rotas indexáveis; `robots.txt` presente |
| Deploy | Vercel, estático, via push na `main` |
| Segredos no front | Config do Firebase (pública por design) e a chave da IA **do próprio usuário**, em `localStorage` |

### O que isso significa para o brief

Três exigências do brief não se aplicam literalmente aqui, e é melhor
dizer isso do que fingir que foram cumpridas:

1. **`lint`, `typecheck`, `test`, `build de produção`** — não existem
   nesta arquitetura. Foram substituídos por equivalentes reais:
   `node --check` em todos os arquivos, bateria de smoke test no
   navegador cobrindo as 12 páginas, auditoria de contraste medida sobre
   os pixels, e a geração do arquivo único (que é o "build" do projeto).

2. **"Não use `any` sem necessidade"** — não há TypeScript. Migrar o
   projeto para TS exigiria adicionar bundler, o que quebra os três modos
   de execução (Vercel, `file://` e arquivo único no iPhone).

3. **"Toda integração com IA deve passar pelo backend"** — ver §4.

---

## 2 · O que foi preservado

Nada foi removido. Confirmado por teste em todas as páginas:

receitas · despesas · transferências · investimentos · cartões · contas ·
categorias · faturas e ciclo de fatura · parcelamento · lançamentos fixos ·
importação CSV/OFX/TXT/Registrato · projeção de juros compostos ·
perfis · backup e restauração · sincronização com Google ·
armazenamento local · tema claro/escuro · atalhos de teclado.

O que era da página "Resumo Anual" (removida em versão anterior) está em
**Análises**, agora com mais informação do que antes.

---

## 3 · O que foi acrescentado

| Superfície | Estado |
|---|---|
| Visão geral | Reescrita conforme §21 do brief |
| Financeiro | Preservada |
| Contas e cartões | Preservada |
| **Orçamento** | **Novo** — limite mensal por categoria, com sugestão baseada na média real de 3 meses |
| **Metas** | **Novo** — alvo, valor guardado, prazo e o quanto guardar por mês |
| **Recorrências / Assinaturas** | **Novo** — leitura dos lançamentos fixos que já existiam |
| **Calendário** | **Novo** — mês em grade, com entradas, saídas e vencimentos |
| Investimentos | Preservada |
| **Análises** | **Novo** — consolidado, ano a ano, taxa de poupança, exportação CSV |
| **UGLEZ** | **Novo** — painel de insights + conversa |
| Categorias | Preservada |
| **Configurações** | **Novo** — reúne perfil, tema, sync, UGLEZ e dados |

### Conceitos novos no modelo

```js
profile.budgets = { categoriaId: limiteMensal }
profile.goals   = [{ id, name, target, saved, deadline, color, icon }]
```

Ambos entram em `normalizeProfile`, no backup e na sincronização sem
migração destrutiva: perfis antigos ganham `{}` e `[]`.

### OAZE Score

Cinco perguntas, 20 pontos cada, todas verificáveis a partir dos próprios
lançamentos — nenhuma depende de opinião ou dado externo:

1. Sobra dinheiro? (taxa de poupança média de 3 meses)
2. O crédito está sob controle? (fatura em aberto ÷ receita)
3. Há reserva? (saldo disponível ÷ gasto médio, em meses)
4. O patrimônio cresce? (variação em 6 meses)
5. As contas estão em dia? (nada vencido, nada negativo)

O card explica cada parte — um número sem critério não ajuda ninguém.

### Patrimônio líquido

`contas + investido − faturas em aberto`. A fatura entra como passivo
porque o dinheiro já foi gasto: ainda está na conta, mas não é seu.
Ignorar isso infla o número justamente de quem usa mais o crédito.

---

## 4 · IA: a exigência do backend

**O brief exige que a IA passe pelo backend e que nenhuma chave viva no
navegador. Isso foi implementado — com uma ressalva que precisa ser dita.**

Foi criada a função `api/uglez.js` (Vercel Serverless). A chave fica em
`ANTHROPIC_API_KEY`, variável de ambiente do servidor, e nunca é enviada
ao cliente. O front chama `POST /api/uglez` e é esse o caminho padrão
quando o app está publicado.

**A ressalva:** o app roda em três lugares — Vercel, arquivo aberto do
disco (`file://`) e arquivo único no iPhone. Nos dois últimos **não existe
servidor nenhum**. Nesses casos o cliente cai para a chave do próprio
usuário, guardada no `localStorage` dele.

Essa chave **não é um segredo do produto**: é a chave dele, no aparelho
dele, indo direto para `api.anthropic.com`. Não há credencial da aplicação
exposta em lugar nenhum. Remover esse caminho eliminaria o UGLEZ do modo
offline e do iPhone.

Para ativar o caminho seguro em produção:

```
Vercel → Project → Settings → Environment Variables
ANTHROPIC_API_KEY = sk-ant-...
```

Sem essa variável a função responde `501` e o cliente entende que deve
usar o caminho local. As Configurações mostram qual dos dois está ativo.

---

## 5 · Decisões de arquitetura

**Continua sem framework.** O brief manda evoluir o projeto existente, não
recriá-lo. Introduzir React/Next exigiria bundler e quebraria `file://` e
o arquivo único — dois modos que o produto usa de verdade.

**Design system em tokens CSS.** `--n1/--n2/--n3` (três materiais),
`--s1..--s10` (série categórica por tema), papéis semânticos. Componentes
são classes reutilizadas, não CSS repetido.

**Uma conta, um lugar.** Nenhuma página nova calcula dinheiro: orçamento
compara com `Calc.categoryTotals`, análises leem `Calc.monthlySeries`, o
calendário lê `Calc.calendarEvents`. Divergência entre telas é impossível
por construção.

**Assinatura não é um tipo novo.** É uma despesa fixa. A aba é um filtro
sobre `recurring`, não uma segunda coleção — criar outro lugar para o
mesmo dado seria criar divergência.

**Guardar numa meta não é despesa.** É o mesmo dinheiro com outro nome, e
por isso vive na própria meta, fora de `Calc`. Do contrário o saldo do mês
afundaria sem motivo.

---

## 6 · Armadilhas encontradas (e por que estão anotadas)

- **`global.Set` derrubou o app inteiro.** Um módulo chamado `Set`
  sobrescreveu o `Set` nativo e quebrou todo `new Set()` do `Calc`.
  Renomeado para `Cfg`.
- **`$$` dentro de heredoc do bash vira o PID.** `U.$$(...)` virou
  `U.$(...)`, e o `.forEach` quebrou o `wire()` — derrubando o boot em
  silêncio. O boot agora é resiliente: cada peça falha isolada.
- **Ordem de origem no CSS.** Blocos acrescentados no fim do arquivo
  venciam as media queries e reativavam grades de duas colunas no
  celular. Há uma seção 23 no fim justamente para ganhar essa disputa —
  **CSS novo entra antes dela**.
- **`1fr` não é `minmax(0, 1fr)`.** O mínimo padrão é `auto` = min-content;
  bastava um item largo para espremer a coluna flexível a 16px e cortar
  "Moradia". Todos os grids de linha usam `minmax(0, 1fr)`.
- **Medir contraste é traiçoeiro.** `color-mix()` serializa como
  `oklab(...)` ou `color(srgb …)`; ler qualquer um como `rgb()` dá número
  sem sentido. E `linear-gradient` não aparece em `backgroundColor` — o
  texto do cartão precisa ser medido contra `--cc-a` + a camada de 18%.

---

## 7 · Resultado dos testes

| Teste | Resultado |
|---|---|
| `node --check` em todos os `.js` | passa |
| Boot completo sem erro no console | passa |
| 12 páginas renderizadas | passa |
| Formulários (11 modais) | passa |
| Troca de período, tema, perfil, abas | passa |
| Backup ida e volta | passa |
| Busca global, notificações, menu | passa |
| Botão "+" e teclado (`N`, `/`, `Esc`) | passa |
| Rolagem horizontal em 12 páginas × 3 larguras | nenhuma |
| Texto cortado (375 / 1100 / 1440px) | nenhum |
| **Contraste: 142 medições, 2 temas, 12 páginas** | **pior caso 4,56:1 (claro) e 4,41:1 (escuro)\*** |
| Arquivo único (878 KB) | abre e funciona sozinho |

\* O 4,41 é artefato do medidor; a medição direta da marca dá 11,73:1 no
escuro e 15,24:1 no claro. Todo o resto está acima de 4,5:1.

---

## 8 · Como rodar

**Local (multiarquivo):**
```bash
npx serve .        # ou qualquer servidor estático
```
Abrir `http://localhost:3000`. Também funciona com duplo clique em
`index.html` (`file://`) — sem sincronização e sem backend de IA.

**Celular na rede local:** `servir-no-wifi.ps1`.

**Arquivo único (iPhone):** `build-arquivo-unico.ps1` gera
`financas.html`. Rode de novo a cada alteração de CSS ou JS.

**Regenerar ícones/fonte:**
```bash
npm --prefix tools install
node tools/gen-bancos.js
node tools/gen-fonte.js
```

---

## 9 · Deploy e rollback

**Nada foi publicado.** A branch `redesign/oaze-1` não foi enviada.

Para publicar em staging:
```bash
git push -u origin redesign/oaze-1
```
A Vercel cria um Preview Deployment automático na URL da branch. Valide
lá antes de qualquer coisa.

Para produção, **só com autorização explícita**:
```bash
git checkout main && git merge --no-ff redesign/oaze-1 && git push
```

**Rollback:** a `main` continua em `07279fa`. Para voltar:
```bash
git checkout main && git reset --hard 07279fa && git push --force-with-lease
```
Os dados do usuário não são afetados: vivem no `localStorage` do
navegador dele, e o formato novo é retrocompatível (perfis antigos ganham
`budgets: {}` e `goals: []` na normalização).

---

## 10 · Pendências honestas

- **Não vi a interface renderizada.** O painel do navegador não compõe
  quadros nesta sessão; tudo foi verificado por medição no DOM. Isso pega
  erro de layout, contraste e comportamento — **não pega desagrado
  estético**.
- **Sem `lint`/`typecheck`/`test`** — não existem no projeto (§1).
- **`ANTHROPIC_API_KEY` não configurada** — até você definir a variável na
  Vercel, o UGLEZ usa o caminho local.
- **Sem analytics, pagamentos ou permissões** — não existiam antes e não
  foram inventados.
- **Importação de extratos** segue como estava; não foi reescrita.
