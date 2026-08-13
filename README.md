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

## Abrir no iPhone

O Safari do iOS, ao abrir um `.html` pelo app **Arquivos**, **não carrega CSS e JS de
subpastas** — a página apareceria em preto e branco e sem funcionar. Por isso existe
o `financas.html`: **o app inteiro em um arquivo só**, gerado por
`build-arquivo-unico.ps1`. Rode o script sempre que mexer no CSS ou no JS.

> ⚠️ **Os dados não sincronizam entre aparelhos.** Cada navegador guarda os seus no
> próprio `localStorage`. PC e iPhone são duas bases separadas. Para levar os dados de
> um para o outro, use **↓ Backup** num e **↑ Restaurar** no outro. Pelo mesmo motivo,
> se você trocar o endereço de acesso (de Wi-Fi local para um site hospedado, por
> exemplo), os dados não vão junto — faça o backup antes.

### Opção 1 — pelo app Arquivos (offline, sem depender do PC)

1. Copie **`financas.html`** para o iCloud Drive (ou mande por AirDrop / e-mail / WhatsApp para si mesmo).
2. No iPhone, abra o app **Arquivos**, toque no arquivo.
3. Toque em **Compartilhar → Abrir no Safari** (ou "Abrir em…").

Funciona sem internet — Chart.js está embutido. É a opção mais independente,
mas depende do Safari manter o armazenamento desse arquivo; **faça backup com
frequência**.

### Opção 2 — pelo Wi-Fi de casa (bom para testar rápido)

1. No PC, clique com o botão direito em **`servir-no-wifi.ps1`** → *Executar com o PowerShell*.
2. Ele mostra um endereço, tipo `http://192.168.3.103:8777`.
3. Com o iPhone no **mesmo Wi-Fi**, digite esse endereço no Safari.

Na primeira vez o Windows pergunta se libera o acesso: marque **Redes privadas**.
Só funciona com o PC ligado e o script rodando. Se o roteador trocar o IP do PC,
o endereço muda — e, como o endereço é a "identidade" do armazenamento, os dados
somem. Para uso diário, prefira a opção 1 ou 3.

### Opção 3 — hospedar no Vercel (melhor para uso diário)

Um endereço fixo em HTTPS, funciona em qualquer lugar, sem o PC ligado. O projeto já
vem configurado — veja **[Publicar no Vercel](#publicar-no-vercel)** abaixo.

Só o *código* do app fica público; **seus dados financeiros nunca saem do celular**,
continuam no `localStorage` do Safari. Ainda assim, se preferir não deixar nada
público, fique na opção 1.

## Publicar no Vercel

O repositório já traz tudo pronto: é um site estático, **sem build e sem back-end**.

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório do GitHub.
2. Em **Framework Preset**, escolha **Other**.
3. Deixe **Build Command** e **Output Directory** em branco — não há build.
4. **Deploy**.

O `vercel.json` cuida do resto. Cada `git push` para a `main` republica sozinho.

**Arquivos de configuração:**

| Arquivo | Para que serve |
|---|---|
| `vercel.json` | Cabeçalhos de segurança, CSP e cache |
| `.vercelignore` | Mantém `.ps1`, `tools/` e o README fora do site |
| `robots.txt` | Pede aos buscadores que não indexem — é um painel pessoal |

**Endereços depois do deploy:** `/` abre o `index.html` (versão multiarquivo, a de
uso normal) e `/financas` abre o arquivo único — útil para baixar direto no iPhone
sem precisar do PC.

### Content-Security-Policy

O `vercel.json` publica uma CSP que trava para onde o app pode **enviar** dados
(`connect-src`). Isso importa num painel que guarda uma chave de API no navegador:
mesmo que algo malicioso rodasse na página, não conseguiria mandar seus dados para
um domínio qualquer. Os destinos liberados são exatamente os que o app usa:

- `api.anthropic.com` — sugestões com IA
- `*.googleapis.com` e `apis.google.com` — autenticação do Firebase
- `*.firebaseio.com` e `*.firebasedatabase.app` (mais `wss://`) — Realtime Database
- `cdn.jsdelivr.net` e `www.gstatic.com` — Chart.js e o SDK do Firebase
- `*.googleusercontent.com` em `img-src` — foto do perfil da conta Google

Duas regras existem por causa do **login com Google por popup**, e quebram o login se
forem apertadas demais:

- `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Com `same-origin` (o valor
  mais restritivo) o navegador corta o `window.opener`, o popup não consegue devolver
  o resultado do login, e o `signInWithPopup` **trava sem erro visível**.
- `frame-src` precisa liberar `*.firebaseapp.com`, `accounts.google.com` e
  `apis.google.com` — o Firebase Auth usa um iframe no domínio do seu projeto.

> `script-src` precisa de `'unsafe-inline'` porque o `financas.html` é inteiramente
> inline por construção — é o que permite abrir pelo app Arquivos no iPhone. Ou seja,
> a CSP aqui **não** protege contra injeção de script; ela limita a exfiltração.
> Se você adicionar uma integração nova e ela não conectar, o motivo provável é a
> `connect-src` — inclua o domínio novo na lista.

**Ao publicar, o app começa vazio.** O `localStorage` é por endereço: os dados que
estão no `file://` ou no `http://192.168.x.x` **não** vão junto. Use **↓ Backup** no
lugar antigo e **↑ Restaurar** no endereço do Vercel.

### Adicionar à Tela de Início

Em qualquer uma das opções: no Safari, toque em **Compartilhar → Adicionar à Tela de
Início**. O painel ganha ícone próprio e abre em tela cheia, sem a barra do navegador —
o app já traz o ícone e as metatags para isso, e respeita o notch e a barra inferior.

## Estrutura

```
index.html                versão de trabalho (multiarquivo) — use no PC
financas.html             gerado: o app todo em 1 arquivo — use no iPhone
build-arquivo-unico.ps1   gera o financas.html a partir dos arquivos abaixo
servir-no-wifi.ps1        publica a pasta na rede local para acessar do celular
tools/                    scripts que regeram os ícones vendorizados

assets/vendor/chart.umd.min.js   cópia local do Chart.js (usada offline)
assets/vendor/bancos.js          41 bancos brasileiros, vendorizado (GERADO)
assets/vendor/icons.js           76 ícones Lucide, vendorizado (GERADO)
assets/css/style.css
assets/js/
  firebase-config.js  COLE AQUI as credenciais do seu Firebase (opcional)
  utils.js       formatação BRL, datas (sem armadilha de fuso), helpers de DOM
  icons.js       resolve banco/categoria → ícone; selos de débito e crédito
  cards.js       a carteira: contas e cartões desenhados no mesmo material
  store.js       modelo de dados, persistência, perfis, backup, dados de exemplo
  calc.js        motor de cálculo: ocorrências, saldos, faturas, investimentos
  charts.js      camada fina sobre o Chart.js, com os tokens de cor do tema
  ui.js          modal, toasts, KPIs, selects, seletor de cor
  forms.js       formulários de lançamento, conta, cartão, categoria, investimento
  importer.js    CSV / OFX / texto colado / Registrato
  sync.js        login Google + sincronização opcional (Realtime Database)
  ai.js          sugestões via API da Anthropic (chave do próprio usuário)
  pages/*.js     uma página por arquivo
  app.js         estado da interface, roteamento, eventos
```

Os scripts são clássicos (sem `type="module"`), justamente para funcionar em `file://` —
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

A navegação fica em uma **barra fixa no topo**, sempre visível, com ícone e nome de
cada seção — não há menu lateral nem aba escondida. Acima dela, o painel de
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

## Sincronização entre dispositivos (opcional)

**O app funciona sem login.** Sem configurar nada, os dados ficam no `localStorage`,
isolados por aparelho — exatamente como sempre foi. O login com Google existe só para
quem quer ver os mesmos dados no PC e no celular.

A sincronização usa **o seu próprio** projeto Firebase gratuito: Authentication com o
provedor Google, mais o Realtime Database.

### Configurar (uma vez)

No [console.firebase.google.com](https://console.firebase.google.com):

1. Crie um projeto (plano **Spark**, gratuito).
2. **Build → Authentication → Sign-in method** → ative **Google**.
3. **Build → Realtime Database** → criar banco, "iniciar no modo bloqueado".
4. Na aba **Regras** do Realtime Database, publique isto:

```json
{
  "rules": {
    "usuarios": {
      "$uid": {
        ".read":  "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

5. **⚙ Configurações do projeto → Seus apps → Web** (`</>`) → registre um app e copie
   o objeto `firebaseConfig` para **`assets/js/firebase-config.js`**.
6. **Authentication → Settings → Authorized domains** → adicione o endereço onde o app
   está publicado (o domínio do Vercel). Sem isso o popup de login recusa com
   `auth/unauthorized-domain`.
7. Rode `build-arquivo-unico.ps1` de novo, para o `financas.html` levar a configuração.

> ⚠️ **O passo 7 é fácil de esquecer.** O `financas.html` é um retrato do código no
> momento em que foi gerado. Se você preencher o `firebase-config.js` e não rodar o
> build, o PC (que usa `index.html`) sincroniza e o iPhone (que usa o arquivo único)
> continua isolado — sem erro nenhum, só não sincroniza. Por isso o script agora
> imprime, no fim, se a sincronização ficou ligada ou desligada naquele arquivo.

Depois disso, clique em **Entrar com Google** na barra lateral. A sessão fica salva em
cada aparelho — você entra uma vez por dispositivo.

> As credenciais do `firebase-config.js` **podem ficar públicas**. Não são segredo: o
> Firebase as embute no front-end de qualquer app web. Quem protege os dados são as
> regras acima. O que **não** pode é publicar regras abertas (`".read": true`) — aí
> qualquer pessoa com a `databaseURL` lê as suas finanças.
>
> Como reforço, dá para restringir a chave em *console.cloud.google.com → APIs e
> serviços → Credenciais → sua chave → Restrições de aplicativo → Sites*, listando só
> o seu domínio. Isso impede que outra pessoa consuma a sua cota.

### Como funciona

Os dados vão para `/usuarios/{uid}/dados`, onde `uid` é o identificador da sua conta
Google. As regras garantem que só essa conta lê e escreve ali.

**O que sincroniza:** só os perfis — contas, cartões, categorias, lançamentos,
investimentos e faturas. Tema e perfil ativo são preferências de cada aparelho e ficam
de fora. Toda alteração local grava no `localStorage` na hora e sobe para o Firebase
com um atraso de 1,5 s (debounce), para não gravar a cada tecla.

**Conflito:** cada perfil carrega um carimbo de última alteração; vence o mais recente,
**perfil a perfil**. Ou seja, editar o perfil Pessoal no celular não desfaz o que você
mudou no perfil PJ no PC.

**Estados do indicador**, na barra lateral:

| Estado | O que significa |
|---|---|
| *Sincronização não configurada* | `firebase-config.js` está vazio — nada além do localStorage |
| *Não logado — só neste aparelho* | Configurado, mas sem login. O app funciona normal |
| *Sincronizando…* | Há alterações locais indo para a nuvem |
| *Sincronizado* | Tudo enviado |
| *Sem conexão — usando dados locais* | Rede caiu ou as regras recusaram. O app continua funcionando |

> ⚠️ **No primeiro login, os dois lados se somam.** Se este aparelho já tem perfis e a
> sua conta na nuvem também, você fica com todos — nada é apagado, mas pode aparecer
> duplicata (dois "Pessoal", por exemplo), porque os perfis criados separadamente em
> cada aparelho têm identificadores diferentes. Apague os que sobrarem em **⚙ Perfis**.
> Daí em diante cada perfil é reconhecido pelo mesmo identificador nos dois lugares.

**Backup/Restaurar em JSON continuam funcionando** com ou sem login — inclusive para
trazer dados de antes de você ter conta, ou para migrar entre endereços.

## Sugestões com IA (opcional)

O card na página Início manda uma pergunta sua, junto de um resumo do perfil e do
mês selecionados, para a API da Anthropic e mostra a resposta formatada.

**Como habilitar:** crie uma chave em
[console.anthropic.com → API Keys](https://console.anthropic.com) e cole em
*⚙ Configurar chave*. É **cobrado por uso**, conforme a tabela de preços da
Anthropic. Sem chave, o card fica inerte e o resto do painel funciona igual.

**O que é enviado:** apenas o resumo do **perfil e mês ativos** — saldos, totais por
categoria (com comparação ao mês anterior), fixas × variáveis, últimos 6 meses,
contas, faturas de cartão e investimentos. Nenhum outro perfil entra, e os números
respeitam as convenções acima (só confirmado conta; cartão pela data da compra).
O botão *"Ver o resumo exato que seria enviado"* mostra o texto literal antes de
qualquer chamada.

**A chave fica só no `localStorage` deste navegador** e vai direto para
`api.anthropic.com` — não passa por nenhum outro servidor.

> ⚠️ Quem tiver acesso a este navegador consegue ler a chave. Se hospedar o painel
> na internet, use uma chave com limite de gasto baixo e revogue-a se desconfiar de
> vazamento.

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

Isso reconstrói `assets/vendor/bancos.js` a partir do pacote npm. Para os ícones de
categoria, `tools/get-lucide.ps1` baixa os SVGs e `tools/gen-icons.ps1` monta o
`assets/vendor/icons.js`. Precisa de internet só na hora de regenerar; o app em si
roda offline.

> O app **não usa npm em runtime** e não tem bundler: o `npm install` acima serve só
> para o script de geração ler o pacote e cuspir um script clássico. Por isso
> `tools/node_modules/` fica fora do Git.

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
nenhuma, e nada sai do navegador para produzi-la. Só a caixa "Pedir sugestão"
chama a API da Anthropic.

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
