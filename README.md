# Minhas Finanças — dashboard financeiro pessoal

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

### Opção 3 — hospedar de graça (melhor para uso diário)

Um endereço fixo em HTTPS, funciona em qualquer lugar, sem o PC ligado:

- **Netlify Drop** — acesse [app.netlify.com/drop](https://app.netlify.com/drop) e
  arraste a **pasta inteira**. Sai um endereço em segundos.
- **GitHub Pages** — suba a pasta num repositório e ative Pages nas configurações.

Só o *código* do app fica público; **seus dados financeiros nunca saem do celular**,
continuam no `localStorage` do Safari. Ainda assim, se preferir não deixar nada
público, fique na opção 1.

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
assets/vendor/icons.js           SVGs de bancos + Lucide, vendorizados (GERADO)
assets/css/style.css
assets/js/
  utils.js       formatação BRL, datas (sem armadilha de fuso), helpers de DOM
  icons.js       resolve banco/categoria → ícone; selos de débito e crédito
  cards.js       cartão de crédito desenhado, leque e painel de fatura
  store.js       modelo de dados, persistência, perfis, backup, dados de exemplo
  calc.js        motor de cálculo: ocorrências, saldos, faturas, investimentos
  charts.js      camada fina sobre o Chart.js, com os tokens de cor do tema
  ui.js          modal, toasts, KPIs, selects, seletor de cor
  forms.js       formulários de lançamento, conta, cartão, categoria, investimento
  importer.js    CSV / OFX / texto colado / Registrato
  sync.js        sincronização opcional via Firebase (Realtime Database)
  ai.js          sugestões via API da Anthropic (chave do próprio usuário)
  pages/*.js     uma página por arquivo
  app.js         estado da interface, roteamento, eventos
```

Os scripts são clássicos (sem `type="module"`), justamente para funcionar em `file://` —
módulos ES são bloqueados por CORS quando abertos direto do disco.

## As sete páginas

| Página | O que faz |
|---|---|
| **Início** | 5 cards de KPI, lançamento rápido, pizza de categorias, tabela de 12 meses, faturas dos cartões, linha do saldo anual, sugestões com IA |
| **Receitas e Despesas** | Receitas em fixas/variáveis/previstas; despesas separadas em **débito** e **crédito**, com filtro Todos / Débito / Crédito; checkbox de confirmação em cada item; gráficos por categoria e previsto × realizado |
| **Investimentos** | Cadastro de aportes, tabela com valor atual estimado, evolução do patrimônio, calculadora de juros compostos |
| **Cartões e Contas** | Contas com saldo e extrato; cartões desenhados como cartões físicos empilhados, com a fatura do cartão em foco abaixo; importação de extratos |
| **Categorias** | CRUD com cor e ícone, peso de cada categoria por período |
| **Resumo Anual** | Consolidado dos 12 meses, saldo acumulado, investido no ano, comparação ano a ano |

> A página **Calendário** foi removida. As informações que só ela mostrava continuam
> acessíveis: fechamento e vencimento de fatura aparecem nos cartões (Início e
> Cartões e Contas) e no painel de faturas; datas de receitas e despesas aparecem
> em cada item na página Receitas e Despesas e no extrato de cada conta.

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
| **Saldo do mês** | Início, Resumo Anual | receitas − despesas confirmadas. Fluxo operacional. |
| **Saldo final / acumulado** | Início, Resumo Anual | saldo inicial + saldo do mês, encadeado mês a mês. |
| **Saldo em contas** | Cartões e Contas | caixa real: inclui pagamento de fatura e aportes debitados da conta. |

Aporte em investimento **não é despesa** — é dinheiro que muda de lugar. Ele reduz o
saldo da conta (quando você indica de qual conta sai) e aparece em "Total de
investimentos". O **patrimônio** mostrado no Resumo Anual é saldo em contas +
investimentos.

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
| `D` | nova despesa |
| `R` | nova receita |
| `Alt` + `←` / `→` | mês anterior / próximo |
| `Esc` | fecha o modal |

## Sincronização entre dispositivos (opcional)

Por padrão os dados ficam isolados por navegador. Para sincronizar PC e celular,
o app pode usar **o seu próprio** projeto Firebase gratuito — nenhuma credencial
vem embutida no código. Sem configurar nada, tudo funciona como antes.

Clique no indicador de sincronização na barra lateral e preencha. Antes disso,
no [console.firebase.google.com](https://console.firebase.google.com):

1. Crie um projeto (plano **Spark**, gratuito).
2. **Build → Realtime Database** → criar banco, "iniciar no modo bloqueado".
3. **Build → Authentication → Sign-in method** → ative **E-mail/senha**.
4. **Configurações do projeto → Seus apps → Web** → registre um app e copie
   `apiKey` e `databaseURL`.
5. Na aba **Regras** do Realtime Database, publique:

```json
{
  "rules": {
    "financas": {
      "$uid": {
        ".read":  "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

Use **o mesmo e-mail e senha** nos dois aparelhos. A senha não é guardada pelo app:
o Firebase mantém a sessão iniciada em cada dispositivo.

**O que sincroniza:** só os perfis — contas, cartões, categorias, lançamentos,
investimentos e faturas. Tema e perfil ativo são preferências de cada aparelho e
ficam de fora. **Conflito:** cada perfil carrega um carimbo de última alteração;
vence o mais recente, perfil a perfil. O indicador na barra lateral mostra
*sincronizado*, *sincronizando* ou *offline / erro* — nesse último caso o app segue
funcionando normalmente com o localStorage. Backup/Restaurar em JSON continuam
disponíveis como alternativa manual.

> ⚠️ Não use regras abertas (`".read": true`). Qualquer pessoa com a `databaseURL`
> conseguiria ler suas finanças.

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

## Cartões de crédito

Cada cartão cadastrado é desenhado como um cartão físico: retângulo arredondado com
gradiente próprio, chip, número mascarado (`•••• •••• •••• 4352`), nome e o logo do
banco emissor. Na página **Cartões e Contas** eles ficam empilhados em leque, com
sobreposição; o cartão em foco sobe, ganha sombra e mostra a fatura logo abaixo —
itens, total, período, vencimento e limite disponível, navegável mês a mês. Na página
**Início** os mesmos cartões aparecem em versão compacta (até 2), com a fatura ao lado.

**Cor:** o cadastro oferece 8 gradientes (Roxo, Verde, Coral, Âmbar, Ciano, Grafite,
Índigo, Rosa) ou **auto**, que deriva do banco escolhido. A prévia no formulário
atualiza enquanto você digita.

> Os 4 últimos dígitos são opcionais e servem só para você distinguir os cartões na
> tela. **Nunca guarde o número completo** — o app não tem campo para isso.

Cada ponta clara de gradiente foi escurecida até o texto branco do cartão passar
**WCAG AA (≥ 4,5:1)**, já contando a camada de 18% que o CSS aplica por cima.
Mexer nesses hexes exige refazer a conta.

## Ícones

Tudo vem **vendorizado** em `assets/vendor/icons.js` — nenhum CDN em runtime, então
funciona offline e no fluxo `file://` do iPhone.

- **Bancos** — 21 logos oficiais do projeto [`logos-bancos-br`](https://github.com/rzmt/logos-bancos-br) (MIT):
  Itaú, Bradesco, Santander, Caixa, Banco do Brasil, Nubank, Inter, C6, BTG, Sicredi,
  Sicoob, PicPay, Mercado Pago, XP, Safra, Banrisul, Neon, PagBank, Stone, BV e
  Mercantil. O nome digitado é reconhecido por padrão ("ITAÚ UNIBANCO S.A." → Itaú);
  sem correspondência, cai num ícone genérico de instituição. Aparecem nos cards de
  conta, nos cartões e na prévia do formulário.
- **Categorias** — subconjunto curado de 74 ícones [Lucide](https://lucide.dev) (ISC).
  Cada categoria pode escolher o seu; em **auto**, o ícone é deduzido pelo nome
  ("Farmácia" → `heart-pulse`, "Uber" → `car`). O padrão segue o mapeamento usual:
  Alimentação `utensils`, Transporte `car`, Moradia `house`, Saúde `heart-pulse`,
  Lazer `gamepad-2`, Educação `graduation-cap`, Compras `shopping-bag`,
  Assinaturas `repeat`, Impostos e taxas `receipt`, Salário `banknote`,
  Rendimentos `trending-up`, Outros `circle-ellipsis`. Os ícones aparecem na lista de
  lançamentos, na página Categorias, no ranking do Início e na legenda dos gráficos.

**Regenerar** (ao acrescentar bancos ou ícones) — os scripts ficam em `tools/`,
nesta ordem: `find-banks.ps1` (acha o ISPB de um banco novo), `get-svgs.ps1` (baixa os
logos), `get-lucide.ps1` (baixa os ícones) e `gen-icons.ps1` (monta o
`assets/vendor/icons.js`). O `icons.js` é gerado — **não edite à mão**. Precisa de
internet só na hora de regenerar; o app em si roda offline.

## Cores

Tema **escuro por padrão** ("Ethereal"): fundo `#0A0B0F`, cards `#15171E` com borda
`#22252E`, texto `#F2F3F5` e `#9AA0AC`. Dois cards usam gradiente — o KPI de saldo
final (verde-menta, com tinta escura por cima) e os cartões de crédito
(roxo-azulado, com texto claro). Todo texto sobre gradiente foi medido contra o
ponto mais desfavorável do gradiente e passa **WCAG AA (≥ 4,5:1)**.

**Papéis semânticos:** verde = receita e positivo, vermelho = despesa e negativo.
A cor nunca carrega o significado sozinha: variações trazem seta (▲▼→), valores
trazem sinal (+/−) e status vêm com texto no selo.

**Paleta categórica**, sempre nesta ordem fixa em todos os gráficos e páginas:

```
#3DD68C  #6C6CE0  #F0554D  #F2B84B  #4EC5D4  #9AA0AC
```

O **tema claro** tem tons próprios (não é inversão do escuro) e usa os mesmos
papéis semânticos e a mesma paleta categórica; verde e vermelho ganham passos mais
escuros ali para manter 4,5:1 sobre fundo branco. Dados salvos com a paleta antiga
são convertidos automaticamente ao abrir.
