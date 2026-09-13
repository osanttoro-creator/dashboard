# OAZE — dashboard financeiro pessoal

Aplicação de página única, **sem backend**. Todos os dados ficam em `localStorage`,
no próprio navegador. Nada é enviado para nenhum servidor.

## Como abrir

Dê duplo clique em `index.html`. É só isso — não precisa instalar nada.

Os gráficos usam **Chart.js via CDN**, com uma cópia local em `assets/vendor/` como
reserva — se não houver internet, o app carrega essa cópia e nada deixa de funcionar.
(E se as duas falharem, tabelas, números e formulários seguem operando; só os gráficos
somem, com um aviso na tela.)

> Em janela anônima alguns navegadores bloqueiam o `localStorage`. O app avisa quando
> isso acontece — nesse caso, use **↓ Backup** antes de fechar a aba.

## Abrir no celular

O app está publicado. No celular, abra o endereço do site e entre na sua conta — os
dados chegam sozinhos, porque a sincronização é por conta e não por aparelho.

**Sem conta, cada navegador é uma ilha.** O que você registra fica no `localStorage`
daquele navegador, e PC e celular são duas bases separadas. Para juntá-las sem criar
conta, use **↓ Backup** num e **↑ Restaurar** no outro.

### Testar pelo Wi-Fi de casa

1. No PC, clique com o botão direito em **`servir-no-wifi.ps1`** → *Executar com o PowerShell*.
2. Ele mostra um endereço, tipo `http://192.168.3.103:8777`.
3. Com o celular no **mesmo Wi-Fi**, digite esse endereço.

O login social não funciona nesse endereço: o Google só aceita origens autorizadas, e
um IP de rede local não é uma delas. Para testar login, use o site publicado.

## Publicar

É um site estático, **sem build e sem back-end** — o que existe de servidor são as
Edge Functions do Supabase, que não fazem parte da página.

Cada `git push` para a `main` publica sozinho, pelo workflow
[`.github/workflows/deploy-hostinger.yml`](.github/workflows/deploy-hostinger.yml).
O que ele confere, e o caminho manual para rollback, estão em
[`deploy/hostinger/README.md`](deploy/hostinger/README.md).

**Arquivos de configuração:**

| Arquivo | Para que serve |
|---|---|
| `deploy/hostinger/.htaccess` | Rotas de SPA, cabeçalhos de segurança, CSP e cache |
| `deploy/hostinger/montar-pacote.ps1` | Decide o que vai para o servidor, e varre por segredos |
| `robots.txt` | Pede aos buscadores que não indexem — é um painel pessoal |

> A Hostinger intercepta o `robots.txt` no subdomínio temporário e serve o dela, que
> bloqueia só o Googlebot. O nosso passa a valer quando o domínio próprio for apontado.

**Endereços:** `/` abre a landing e `/app` abre o aplicativo. O `.htaccess`
reescreve as rotas sem extensão, então `/precos` e `/entrar` funcionam como páginas.

### Content-Security-Policy

O `.htaccess` publica uma CSP que trava de onde o app pode **carregar** e para onde
pode **enviar**. Num painel financeiro isso importa: mesmo que algo malicioso rodasse
na página, não conseguiria mandar seus dados para um domínio qualquer.

Os destinos liberados são exatamente os que o app usa:

- `*.supabase.co` (mais `wss://`) — banco, autenticação e tempo real
- `accounts.google.com` — o "entrar num toque" do Google, que precisa de script,
  estilo, conexão e iframe, os quatro
- `cdn.jsdelivr.net` — Chart.js
- `*.googleusercontent.com` em `img-src` — a foto do perfil na bolha do Google

**`api.openai.com` não está na lista, e é de propósito.** Quem fala com o modelo
é a Edge Function `oaze-assistant`, que é `*.supabase.co`. A chave nunca passa pelo
navegador; liberar o domínio aqui seria manter aberta uma porta que ninguém usa.

Quem confere que a política cobre o que o site carrega é
`tools/testes/csp-cobre-o-que-carrega.js`, dentro do `verificar-tudo`. Ele existe
porque um domínio faltando não dá erro em lugar nenhum: o navegador recusa calado.

**Ao publicar, o app começa vazio se você não entrar na conta.** O `localStorage` é
por endereço: o que está em `http://192.168.x.x` não vai junto.

### Adicionar à Tela de Início

Em qualquer uma das opções: no Safari, toque em **Compartilhar → Adicionar à Tela de
Início**. O painel ganha ícone próprio e abre em tela cheia, sem a barra do navegador —
o app já traz o ícone e as metatags para isso, e respeita o notch e a barra inferior.

## Estrutura

```
index.html                a landing pública
app.html                  o aplicativo
entrar.html cadastro.html recuperar-senha.html redefinir-senha.html confirmar-email.html
precos.html recursos.html suporte.html termos.html privacidade.html 404.html
servir-no-wifi.ps1        publica a pasta na rede local, para testar do celular
tools/                    verificações, auditorias e os geradores dos vendorizados
deploy/hostinger/         .htaccess publicado e o script que monta o pacote
supabase/                 migrações do banco e as Edge Functions
docs/                     o que não cabe em comentário de código

assets/vendor/bancos.js   bancos brasileiros, vendorizado (GERADO)
assets/vendor/icons.js    ícones Lucide, vendorizado (GERADO)
assets/vendor/fontes/     Newsreader, IBM Plex Sans e Mono (OFL)
assets/css/style.css      o aplicativo
assets/css/site.css       o site público
assets/js/
  utils.js       formatação BRL, datas (sem armadilha de fuso), helpers de DOM
  store.js       modelo de dados, persistência, perfis, backup
  calc.js        motor de cálculo: ocorrências, saldos, faturas, investimentos
  repo.js        leitura e escrita no esquema normalizado do Postgres
  dados.js       traz o estado do servidor sem atropelar o que está no aparelho
  fila.js        o que ainda não subiu, e por isso não pode ser sobrescrito
  migracao.js    do localStorage para o banco, uma vez só, com backup antes
  sync.js        o contrato de sincronização (estado, mesclagem, envio)
  supabase-auth.js  o backend que cumpre esse contrato
  site-auth.js   autenticação das páginas públicas (leve, sem o app junto)
  conta.js       chamadas às Edge Functions
  planos.js limites.js  planos, direitos e limites de uso
  ai.js          sugestões, via Edge Function — a chave nunca vem ao navegador
  charts.js ui.js forms.js cards.js icons.js importer.js tema.js shell.js
  onboarding.js estado-sync.js
  uglez-*.js     a peça visual do UGLEZ (WebGL, com fallback 2D)
  pages/*.js     uma página por arquivo
  app.js         estado da interface, roteamento, eventos
```

Os scripts são clássicos (sem `type="module"`), para funcionar também em `file://` —
módulos ES são bloqueados por CORS quando abertos direto do disco.

## As cinco páginas

| Página | O que faz |
|---|---|
| **Início** | Destaque com o saldo total e a curva de 12 meses ao fundo; três cards (receitas, despesas com a quebra débito/crédito, investido); linha do saldo anual em área maior à esquerda; pizza 3D de categorias com as peças de detalhe; carteira com contas e cartões; receitas × despesas do ano em linha com marcadores |
| **Receitas e Despesas** | Receitas em fixas/variáveis/previstas; despesas separadas em **débito** e **crédito**, com filtro Todos / Débito / Crédito; checkbox de confirmação em cada item; gráficos por categoria e previsto × realizado |
| **Investimentos** | Cadastro de aportes, tabela com valor atual estimado, evolução do patrimônio, distribuição da carteira por tipo, calculadora de juros compostos |
| **Cartões e Contas** | Contas de débito e cartões de crédito desenhados no mesmo formato de carteira; extrato da conta e fatura do cartão em foco; importação de extratos |
| **Categorias** | CRUD com cor e ícone, peso de cada categoria por período |

> As páginas **Calendário** e **Resumo Anual** foram removidas. O que elas mostravam
> continua acessível: fechamento e vencimento de fatura aparecem nos cartões e no
> painel de faturas; datas de lançamento aparecem em cada item e no extrato da conta;
> e o consolidado do ano virou os dois gráficos anuais do Início (saldo acumulado e
> receitas × despesas mês a mês).

## Cabeçalho e período

No desktop a navegação fica em uma **barra fixa no topo**, sempre visível, com ícone
e nome de cada seção — não há menu lateral nem aba escondida. **No celular a mesma
`<nav>` desce e vira uma barra inferior flutuante**, com os rótulos curtos
(Início · Lançamentos · Investir · Carteira · Categorias) e o ícone acima de cada um.
Não é o desktop comprimido: no celular o polegar alcança a base da tela, não o topo,
e é lá que a navegação precisa estar. A barra continua sendo uma ilha — recuada das
bordas, cantos arredondados — e o botão "+" sobe para não brigar com ela.

> As colunas da barra inferior seguem o **tamanho do conteúdo**, não cinco quintos
> iguais: com largura forçada, "Lançamentos" não cabe em tela de 320px, e cortar o
> rótulo é pior do que uma coluna ligeiramente mais larga que a outra. Abaixo de
> 360px o corpo do texto e o respiro apertam mais um passo. Acima dela, o painel de
boas-vindas traz a saudação (`Bem-vindo ao OAZE, {nome}` — clique no nome para
trocá-lo), o perfil ativo, o estado da sincronização e a data de hoje por extenso.
Logo abaixo do cabeçalho fica a barra de **sugestões com IA**, disponível em
qualquer página.

**Dia, mês e ano são editáveis** no seletor de período. O mês e o ano definem o
recorte de toda a interface; o dia define a data de corte dos saldos ("saldo em") e
a data que já vem preenchida ao abrir um lançamento novo. Trocar de mês preserva o
dia — e se ele não existir no mês de destino (31 → fevereiro), encosta no último dia.

## Convenções contábeis

Estas decisões definem o que cada número significa. Vale a pena ler uma vez.

**1 · Só o que está confirmado entra na conta.**
Cada lançamento tem uma checkbox. Enquanto não estiver marcada, ele aparece na lista
como *previsto*, mas fica fora de todos os totais, gráficos e saldos. É assim que
"previsto × realizado" funciona sem precisar de dois cadastros.

**2 · Lançamento fixo é um molde, não uma cópia.**
Uma despesa marcada como fixa gera **uma ocorrência por mês** automaticamente, sem
duplicar registros. A confirmação é *por mês*: você pode confirmar o aluguel de agosto
e deixar setembro pendente. Excluir permite escolher entre "pular só este mês" e
"excluir todas".

**3 · Despesa no cartão conta na data da compra.**
Uma compra parcelada ou no crédito entra nas despesas do mês em que foi feita
(regime de competência), não no mês em que a fatura é paga. Por isso **pagar a fatura
não é uma nova despesa** — se fosse, o valor seria contado duas vezes. O pagamento
só move dinheiro: sai do saldo da conta e aparece no extrato como "Pagamento fatura".

**3b · Débito e crédito são a mesma despesa com efeitos diferentes.**
A interface separa os dois em todo lugar (formulário, listas, gráfico por categoria),
mas a regra de cálculo é uma só:

| | Débito (conta) | Crédito (cartão) |
|---|---|---|
| Entra em "despesas do mês" | na data do lançamento | na data da compra |
| Saldo da conta | cai na hora | só quando a fatura é paga |
| Onde aparece | extrato da conta | fatura do cartão |

Na página Receitas e Despesas, a coluna de despesas tem uma seção para cada um
(com subtotal, e o recorte fixas × variáveis no cabeçalho) e um filtro
**Todos / Débito / Crédito**. Cada item traz um selo com ícone e a palavra — a
distinção nunca fica só na cor. No gráfico por categoria, cada barra é empilhada:
o segmento sólido é débito, o hachurado é crédito.

**4 · Três saldos diferentes, de propósito.**

| Número | Onde aparece | O que é |
|---|---|---|
| **Saldo do mês** | Início | receitas − despesas confirmadas. Fluxo operacional. |
| **Saldo final / acumulado** | Início | saldo inicial + saldo do mês, encadeado mês a mês. |
| **Saldo em contas** | Cartões e Contas | caixa real: inclui pagamento de fatura e aportes debitados da conta. |

Aporte em investimento **não é despesa** — é dinheiro que muda de lugar. Ele reduz o
saldo da conta (quando você indica de qual conta sai) e aparece em "Total de
investimentos". O **patrimônio** é saldo em contas + investimentos.

**5 · Ciclo da fatura.**
Uma compra entra na fatura cujo fechamento é o primeiro depois da data da compra.
Se o dia de vencimento é *menor* que o de fechamento, a fatura vence no mês seguinte
ao fechamento — o formulário mostra um exemplo com datas reais enquanto você digita.

**6 · Valor atual do investimento.**
Estimado por juros compostos sobre o aporte, usando a taxa anual informada. Se você
preencher "valor atual", esse número substitui a estimativa.

## Importação de extratos

Aceita **CSV**, **OFX/QFX** e **texto colado**, por arquivo ou colando direto na caixa.

- **CSV** — detecta o separador (`;`, tab, `|`, `,`) e mapeia as colunas
  automaticamente pelo cabeçalho. Se não houver cabeçalho, as colunas são deduzidas
  pelo conteúdo e você pode corrigir o mapeamento na mão. Suporta tanto uma coluna
  de valor com sinal quanto colunas separadas de débito e crédito.
- **OFX/QFX** — lê os blocos `<STMTTRN>`.
- **Texto colado** — uma linha por lançamento, com data e valor em qualquer posição.
  Ex.: `05/08/2026  SUPERMERCADO SILVA  -238,90`. Linhas sem data e valor são ignoradas
  e o app informa quantas foram.
- **Registrato (BCB)** — o relatório de relacionamentos lista *onde* você tem conta,
  mas não traz lançamentos. O app detecta isso, extrai as instituições e oferece criar
  as contas; os extratos de cada banco você importa depois em CSV/OFX.

Toda importação vira uma **prévia revisável**: cada linha traz tipo, categoria sugerida
(por palavra-chave: "ifood" → Alimentação, "posto" → Transporte, e assim por diante) e
uma checkbox. Linhas que parecem já existir vêm desmarcadas. Ao importar, os lançamentos
entram como **previstos** — você confirma na página Receitas e Despesas. Há uma opção
para já entrar tudo confirmado.

## Perfis e backup

O seletor na barra lateral troca de perfil; cada um tem contas, cartões, categorias,
lançamentos e investimentos totalmente separados. Vêm dois prontos: *Pessoal* e
*PJ / Autônomo*.

**↓ Backup** baixa um JSON com *todos* os perfis. **↑ Restaurar** substitui tudo pelo
arquivo — pede confirmação antes e recusa arquivos que não sejam backup deste app.

## Atalhos

| Tecla | Ação |
|---|---|
| `N` | abre o menu de novo lançamento (setas percorrem) |
| `D` | nova despesa |
| `R` | nova receita |
| `Alt` + `←` / `→` | mês anterior / próximo |
| `Esc` | fecha o modal ou o menu do "+" |

## Sincronização entre dispositivos

A sincronização é por **conta**, não por aparelho, e roda no Supabase. Entrar em
`/entrar` é estar dentro em `/app`: os dois lados usam a mesma gaveta de sessão.

Entrar é possível por e-mail e senha, por link mágico, ou **com o Google** — inclusive
pela bolha do "entrar num toque", que não tira a pessoa da página. A configuração de
cada provedor está em **`docs/login-supabase.md`**, com o passo a passo dos painéis.

Sem conta o app funciona inteiro, só que isolado no aparelho. É uma promessa do
produto, não uma limitação: ninguém é obrigado a criar conta para usar.

> **Duas fontes da verdade convivem hoje**, e isso é dívida conhecida: o documento
> `dados` (jsonb) e o esquema normalizado (`workspaces`, `transactions`…). A ponte
> entre eles é a migração em Configurações → "Dados antigos deste navegador". Enquanto
> ela não roda numa conta, metade do app lê um lugar vazio. Ver `docs/o-que-falta.md`.

## UGLEZ com OpenAI

A conversa do UGLEZ passa pela Edge Function autenticada `oaze-assistant`, que
chama a Responses API da OpenAI. A chave secreta fica no Supabase e nunca chega
ao navegador.

O servidor recebe a pergunta e um resumo agregado do período: totais,
categorias, metas, histórico permitido pelo plano e despesas previstas agrupadas
por dia. Não recebe descrições de lançamentos, nomes de contas ou cartões,
e-mail ou identificadores internos. A tela **O que é enviado** mostra o objeto
exato antes da chamada.

A cota mensal é aplicada atomicamente no banco e erros do provedor não consomem
consulta. A requisição é stateless e usa `store: false`. Configuração e contrato
completo: `docs/ia-backend.md`.

## A carteira — contas e cartões

**Contas de débito e cartões de crédito usam o mesmo desenho de cartão**: retângulo
arredondado com gradiente próprio, ladrilho do banco na cor da marca, número
mascarado, e uma faixa que diz em uma palavra o que aquilo é — `DÉBITO` ou
`CRÉDITO`. É o que faz a página inteira ler como uma carteira, e não como duas
listas diferentes.

O que muda entre os dois é só o conteúdo: o cartão de crédito mostra barra de limite,
limite livre e o total da fatura; a conta mostra a data de corte e o saldo. Na aba
**Cartões de crédito** eles ficam empilhados em leque — o cartão em foco sobe, ganha
sombra e abre a fatura abaixo (itens, total, período, vencimento, limite), navegável
mês a mês. Na aba **Contas de débito** ficam em grade, e clicar em um traz o extrato.
No **Início**, os dois blocos aparecem lado a lado, até 3 de cada.

**Cor:** o cadastro — de conta *e* de cartão — oferece 12 gradientes do deserto
(Terracota, Sálvia, Argila, Terra, Ocre, Adobe, Oliva, Oásis, Duna, Ferrugem, Bronze,
Ametista) ou **auto**, que deriva do banco escolhido. A prévia no formulário atualiza
enquanto você digita.

> Os 4 últimos dígitos são opcionais e servem só para você distinguir os cartões e
> contas na tela. **Nunca guarde o número completo** — o app não tem campo para isso.

Cada ponta clara de gradiente foi verificada até o texto branco do cartão passar
**WCAG AA (≥ 4,5:1)**, já contando a camada de 18% que o CSS aplica por cima. O pior
caso da lista é 4,62:1 (Terracota). Mexer nesses hexes exige refazer a conta.

## Ícones

Tudo vem **vendorizado** em `assets/vendor/` — nenhum CDN em runtime, então funciona
offline e no fluxo `file://` do iPhone.

- **Bancos** — 41 instituições de [`@edusites/bancos-brasil`](https://lecdt.com/libs/bancos-brasil) (MIT):
  Itaú, Bradesco, Santander, Caixa, Banco do Brasil, Nubank, Inter, C6, BTG, Sicredi,
  Sicoob, PicPay, Mercado Pago, PagBank, XP, Safra, Neon, Stone, BV, Mercantil, Cora,
  InfinitePay, Digio, Pan, Wise, PayPal, Stripe, Next, Original, Rico, Revolut, BS2,
  Efí, Ton, Iugu, Asaas, NG.CASH, Avenue, Nomad, BMG e Agibank. O pacote traz a
  silhueta monocromática **e a cor oficial da marca**, que é o que dá o ladrilho
  colorido da carteira. O nome digitado é reconhecido por padrão ("ITAÚ UNIBANCO
  S.A." → Itaú, "PagSeguro" → PagBank); sem correspondência, cai num ícone genérico
  de instituição.
- **Categorias** — subconjunto curado de 76 ícones [Lucide](https://lucide.dev) (ISC).
  Cada categoria pode escolher o seu; em **auto**, o ícone é deduzido pelo nome
  ("Farmácia" → `heart-pulse`, "Uber" → `car`). O padrão segue o mapeamento usual:
  Alimentação `utensils`, Transporte `car`, Moradia `house`, Saúde `heart-pulse`,
  Lazer `gamepad-2`, Educação `graduation-cap`, Compras `shopping-bag`,
  Assinaturas `repeat`, Impostos e taxas `receipt`, Salário `banknote`,
  Rendimentos `trending-up`, Outros `circle-ellipsis`. Os ícones aparecem na lista de
  lançamentos, na página Categorias, no ranking do Início e na legenda dos gráficos.

**Regenerar** — os dois arquivos de `assets/vendor/` são **gerados; não edite à mão**.

```bash
npm --prefix tools install
node tools/gen-bancos.js
```

```bash
node tools/gen-fonte.js
```

O primeiro reconstrói `assets/vendor/bancos.js` a partir do pacote npm; o segundo,
`assets/vendor/fonte.css`. Para os ícones de categoria, `tools/get-lucide.ps1` baixa
os SVGs e `tools/gen-icons.ps1` monta o `assets/vendor/icons.js`. Precisa de internet só na hora de regenerar; o app em si
roda offline.

> O app **não usa npm em runtime** e não tem bundler: o `npm install` acima serve só
> para o script de geração ler o pacote e cuspir um script clássico. Por isso
> `tools/node_modules/` fica fora do Git.

## Tipografia

**IBM Plex Sans**, **Newsreader** e **IBM Plex Mono**, vendorizadas em
`assets/vendor/fonte.css` — subconjunto latin,
eixo de peso 100–900, **embutida em base64**.

Por que base64 e não um `.woff2` ao lado: o app roda em `file://` e como arquivo
aberto em `file://`, e fonte em arquivo separado é bloqueada por CORS nesse
esquema na maioria dos navegadores — o texto cairia para a fonte do sistema
justamente no cenário offline. Custo: 47 KB
de woff2, 64 KB depois do base64.

A fonte do sistema segue na fila de fallback de propósito: setas e símbolos
(▲ ▼ ⇄ ✎ ⚙ 🗑) estão fora do subconjunto latin e usam a fonte do sistema.

```css
font-feature-settings: 'cv05' 1, 'ss03' 1;
```

Essas duas variantes trazem o `l` com cauda e o `1` com base. Em coluna de valores
isso não é enfeite — sem elas, `1` e `l` ficam quase idênticos.

O **tracking é por tamanho**, nunca um valor só: rótulos em caixa alta e texto miúdo
levam `+0,05em`; o número do destaque leva `−0,035em`. Um `letter-spacing` único
está errado em algum tamanho.

> A CSP do `.htaccess` precisa de `font-src 'self' data:`. Com o `data:` de fora,
> a fonte é bloqueada **só em produção** — em `file://` e no servidor local não há
> CSP, então a falha não aparece durante o desenvolvimento.

## Materiais — três níveis, três funções

Aplicar o mesmo vidro em tudo achata a hierarquia e cobra legibilidade sem
devolver nada. Aqui o material diz o que a coisa **é**:

| Nível | Onde | Como |
|---|---|---|
| **N1 · conteúdo** | cards, KPIs, destaque, modais | quase sólido (95% claro / 93% escuro), blur de 10px |
| **N2 · apoio** | painel de boas-vindas, superfícies de contexto | translúcido (76% / 62%), blur de 20px |
| **N3 · controle** | cabeçalho, assistente, menu do botão "+" | vidro evidente (58% / 40%), blur de 34px, sombra mais funda |

A regra que sustenta isso: **onde há número, o material é quase sólido.** O vidro
de verdade fica só na camada que flutua — navegação e ações. Um valor financeiro
ilegível não tem estética que compense.

Todos os três recebem uma linha clara na aresta superior — é a luz batendo na
quina do material — e a sombra cresce com a altura em que a peça flutua.

### O ambiente

O fundo são três manchas luminosas muito grandes e muito desfocadas (blur de
90px), à deriva em ciclos longos e dessincronizados (68s, 103s, 149s). Não é
textura: é a iluminação da sala em que os painéis flutuam, e é o que o vidro tem
para refratar. Só `transform` anima, então o compositor resolve sem repintar.

## Destaque, assistente e ação principal

**Destaque.** O topo do Início é um único número grande: o **saldo total** —
dinheiro em contas mais valor investido, com a variação contra o fim do mês
anterior e a curva de 12 meses vivendo no fundo do próprio card, sem eixo nem
grade. A quebra ("X em contas · Y investidos") fica logo abaixo, para o número
não ficar ambíguo.

**Assistente.** A leitura do topo — *"Você gastou 15% a menos com Alimentação que
em jul/26"* — é **aritmética local sobre o `Calc`, não uma resposta de modelo**.
Isso importa por dois motivos: ela aparece para quem nunca configurou chave
nenhuma, e nada sai do navegador para produzi-la. Só a conversa do UGLEZ chama a
Edge Function protegida que acessa a OpenAI.

**Ação principal.** Os quatro lançamentos (despesa, receita, transferência,
aporte) saem de um botão "+" flutuante, disponível em qualquer página. O menu
nasce no canto do botão que o abriu e some pelo mesmo caminho. Funciona no
teclado: `N` abre, setas percorrem, `Esc` fecha.

**Categorias como peças.** No ranking do Início e na distribuição da carteira,
cada categoria é um objeto que responde ao ponteiro: no repouso mostra ícone,
nome, valor e peso; no hover sobe 2px e revela a quebra débito × crédito. Em
telas de toque — onde `:hover` não existe — o detalhe fica sempre visível.

## Cores — a paleta do oásis

O nome **OAZE** vem de *oásis*, e a paleta é a do deserto, nos dois temas:

| | | |
|---|---|---|
| `#E7D4B5` | Areia | fundo claro, KPI de destaque |
| `#C9794A` | Terracota | acento, despesa, crédito |
| `#A68B6B` | Argila | neutro de série |
| `#7A846A` | Sálvia | receita, débito |
| `#5A3E2B` | Terra | o vidro dos painéis |

**Painéis de vidro.** Todo painel é uma camada translúcida com `backdrop-filter:
blur()` — no escuro, um marrom-terra a 42% sobre o fundo; no claro, uma areia
clara a 72%. A aresta superior recebe uma linha clara, que é a luz batendo na quina
do material. Superfícies maiores (modal, cabeçalho) usam mais blur e sombra mais
funda, para lerem como mais espessas.

**Tempestade de areia.** Três camadas de poeira atravessam o fundo em velocidades
diferentes (64s, 97s e 143s), animando só `transform` — o compositor dá conta sem
repintar. O contraste é propositalmente baixo: é ambiente, não conteúdo.

**Papéis semânticos:** sálvia = receita, positivo e débito; terracota = despesa,
negativo e crédito. A cor nunca carrega o significado sozinha: variações trazem
seta (▲▼→), valores trazem sinal (+/−), débito e crédito trazem ícone e palavra, e
status vêm com texto no selo.

**Paleta categórica** — dez matizes, sempre nesta ordem fixa. Cada tema tem o seu
passo de luminância, porque uma série só não sobrevive a um fundo areia *e* a um
fundo noite sem alguma cor sumir:

```
claro   #C58E27  #3F5C56  #A68B6B  #A0553F  #B79454  #7A846A  #6B4A76  #C9794A  #8A6A4F  #8C8F4E
escuro  #D9A441  #527A72  #A68B6B  #A0553F  #C2A46E  #7A846A  #7F588C  #C9794A  #8A6A4F  #8C8F4E
```

A ordem foi escolhida por busca, maximizando o contraste entre vizinhos nos **dois**
temas ao mesmo tempo: cada cor fica em pelo menos 2,6:1 contra o próprio painel, e
vizinhas em pelo menos 1,38:1 entre si.

> **Limite honesto:** uma paleta de terra ocupa uma faixa estreita de matiz. Dez
> categorias não ficam tão distinguíveis quanto ficariam com cores livres. Por isso
> nada no app depende de cor sozinha — categoria sempre vem com **ícone e nome**, a
> pizza vem com **ranking de valores e percentuais** ao lado, e débito × crédito vem
> com **hachura** além da cor.

**Contraste.** Os tokens de texto foram medidos compondo o alfa sobre o fundo real
do painel — não confie no hex isolado ao mexer. A auditoria roda no navegador sobre
os pixels que a folha realmente produz, nos dois temas e nas cinco páginas:
**88 verificações, pior caso 5,11:1 no claro e 4,71:1 no escuro.**

> Duas armadilhas de medição que já custaram um falso positivo cada, caso você
> refaça essa conta: `color-mix()` é serializado como `oklab(...)` e
> `color-mix` sobre variáveis vira `color(srgb …)` com floats de 0 a 1 — ler
> qualquer um dos dois como se fosse `rgb()` dá um número sem sentido. E medir
> logo depois de trocar o tema pega o elemento no meio da transição de `color`.

Dados salvos com as paletas anteriores são convertidos automaticamente ao abrir
(veja `OLD_TO_NEW` em `store.js`). Cores escolhidas à mão ficam como estão.

### Acessibilidade do material

- `prefers-reduced-motion` — a tempestade assenta, o deslocamento sai, opacidade e
  cor ficam. Movimento de tela cheia é justamente o que incomoda quem pediu isso.
- `prefers-reduced-transparency` — painéis viram sólidos e o blur sai; manter o blur
  ali só custaria bateria sem entregar o efeito.
- `prefers-contrast: more` — painéis sólidos com borda definida, sem tempestade.

> **Nota de implementação:** `.nav-item` e `.ai-chip` fazem transição de `background`,
> **não** de `color`. Quando o valor de `color` vem de uma custom property que muda na
> troca de tema, o Chrome deixa a cor presa no valor antigo. O retorno do hover mora
> no fundo; a cor acompanha o tema na hora.
