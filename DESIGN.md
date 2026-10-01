---
name: OAZE
description: Clareza financeira em água, leite de coco e um único verde de oásis.
colors:
  night-ocean: "#0D1821"
  night-ocean-deep: "#091219"
  coconut-milk: "#F0E5CF"
  coconut-milk-deep: "#E3D7BE"
  mineral-blue: "#355565"
  oasis-teal: "#5FA99B"
  oasis-teal-light: "#8FCFC0"
  oasis-teal-ink: "#2E6459"
  soft-tangerine: "#E9875E"
  ink-muted-light: "#4A5E68"
  ink-muted-dark: "#9DAFB5"
typography:
  display:
    fontFamily: '"Unbounded", system-ui, sans-serif'
    fontSize: "clamp(34px, 6vw, 72px)"
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: "-0.05em"
  headline:
    fontFamily: '"Unbounded", system-ui, sans-serif'
    fontSize: "clamp(23px, 2.2vw, 34px)"
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"Instrument Sans", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.14em"
rounded:
  field: "4px"
  card: "6px"
  panel: "8px"
  wallet: "18px"
  capsule: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.oasis-teal}"
    textColor: "{colors.night-ocean}"
    rounded: "{rounded.field}"
    padding: "8px 14px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.night-ocean}"
    rounded: "{rounded.field}"
    padding: "8px 14px"
  wallet-card:
    rounded: "{rounded.wallet}"
    width: "300px"
    height: "188px"
  chip:
    backgroundColor: "rgba(17, 38, 47, 0.06)"
    rounded: "{rounded.capsule}"
    padding: "5px 11px"
---

# Design System: OAZE

## Overview

**Norte criativo: "O oásis, não o cofre."**

O OAZE mostra dinheiro em repouso. A tela clara é leite de coco; a escura é
oceano noturno; entre as duas, um único verde de oásis marca o que se pode
tocar. Nada brilha por brilhar: a hierarquia vem do tamanho do número, da
solidez da superfície e do espaço, não de cor decorativa.

A assistente é a **Coco**, uma axolote ilustrada do kit V2.1. Ela aparece como
corpo inteiro em dez poses, cada uma ligada a um momento do app — pensando,
explicando, comemorando uma meta, dando um alerta gentil. Não é um orbe, não é
uma esfera de partículas e não tem luz própria: é um desenho, e é por isso que
ela pode ser carinhosa sem competir com os valores na tela.

**Características:**

- Dois mundos, um sistema: Coconut Milk de dia, Night Ocean de noite, com os
  mesmos tokens apontando para cada um.
- Um acento só — Oasis Teal. O tangerina pertence exclusivamente à Coco.
- Títulos em Unbounded, operação em Instrument Sans, rótulos em IBM Plex Mono.
- Três níveis de material (conteúdo, apoio, controle); quanto mais importante
  o número, mais sólida a superfície sob ele.
- Raios pequenos em tudo que é controle; o cartão da carteira é a exceção,
  porque ele imita um objeto de plástico.

> **O que saiu da V1.** Ouro, medalhão, coqueiro e o UGLEZ não fazem mais parte
> da marca. Se algo na base ainda se chama `--ouro` ou `--uglez`, é um nome
> antigo apontando para o teal: a troca foi feita no valor, não no nome, para
> não reescrever centenas de regras de uma vez.

## Colors

### Primária

- **Oasis Teal `#5FA99B`** — o acento único: ação, seleção, estado ativo, série
  em destaque nos gráficos. Como TEXTO sobre o fundo claro ele escurece para
  `#2E6459` (5,6:1); como fundo, o texto por cima é Night Ocean (8,4:1).

### Estrutura

- **Night Ocean `#0D1821`** — fundo do tema escuro e tinta do tema claro (15,1:1).
- **Coconut Milk `#F0E5CF`** — fundo do tema claro e tinta do tema escuro (14,8:1).
- **Mineral Blue `#355565`** — o vidro da navegação no tema escuro; é a camada
  que flutua, nunca uma superfície de conteúdo.

### Reservada

- **Soft Tangerine `#E9875E`** — só a Coco. Não serve de acento, de alerta nem
  de destaque em gráfico.

### Categorias

Seis matizes, dois tons cada, todas na mesma saturação e claridade — é isso que
as faz parecer família. Teal, Mineral, Índigo, Ameixa, Tangerina e Oliva, em um
tom base e um tom profundo. Todas passam 4,5:1 com texto branco por cima.

A quantidade é deliberada: com vinte e oito cores a pessoa escolhe por sorteio
e duas categorias acabam com tons que ninguém distingue de relance. **Quem
separa vinte categorias é o ícone, que tem forma; a cor agrupa.**

### Regras nomeadas

**A regra do acento único.** Existe um acento, e ele é o teal. Uma cor nova na
interface precisa justificar por que não podia ser tamanho, peso ou espaço.

**A regra da Coco.** O tangerina é dela. Usá-lo em um botão faria a assistente
e a ação parecerem a mesma coisa.

**A regra do nome antigo.** Tokens herdados (`--ouro`, `--uglez`, `--midnight`)
apontam para a paleta nova e continuam válidos; o que não se pode é usar o
VALOR antigo de volta.

## Typography

**Títulos:** Unbounded (fallback system-ui). Geométrica, de peso 400 e 500 só.

**Corpo e controles:** Instrument Sans (fallback system-ui), 400/500/600.

**Rótulos e valores técnicos:** IBM Plex Mono, caixa alta, tracking `.14em`.

As três são servidas localmente de `/assets/fonts`, com `font-display: swap`.

> **Onze páginas ainda não migraram.** A home (`index.html` → `v3.css`) e o
> app (`app.html` → `style.css`) usam o sistema acima. As páginas secundárias
> — preços, entrar, cadastro, recursos, suporte, termos, privacidade, 404,
> confirmar e-mail, recuperar e redefinir senha — carregam `site.css`, que
> ainda está em **Newsreader + IBM Plex Sans**, a tipografia da V1. Quem
> clica em "Preços" a partir da home troca de tipo no meio do caminho.
>
> Isto está escrito aqui, e não corrigido na tabela acima, de propósito: o
> verificador de design deve continuar apontando essas páginas como fora do
> sistema até que elas migrem. Declarar as fontes antigas como válidas
> silenciaria o alarme e esconderia a dívida.

### Hierarquia

- **Display** (Unbounded 500, `clamp(34px, 6vw, 72px)`, tracking `-0.05em`): a
  marca no portal da home. Aparece uma vez por página, no máximo.
- **Headline** (Unbounded 500, `clamp(23px, 2.2vw, 34px)`): títulos de página e
  de cartão de destaque.
- **Body** (Instrument Sans 400, 14px/1.5): tudo que se lê como frase.
- **Label** (IBM Plex Mono 400, 10,5–11,5px, caixa alta, tracking positivo):
  nome de campo, nome de métrica, unidade, legenda de gráfico.

### Regras nomeadas

**A regra dos números estáveis.** Valor financeiro usa algarismo tabular, para
que a coluna não dance quando um número muda.

**A regra do rótulo que não compete.** O que é nome de campo vai em mono, caixa
alta e espaçado; o que é valor vai grande e em sans. Nunca o contrário.

## Layout

No desktop o app tem uma barra lateral de 244px e o conteúdo rola ao lado dela.
No celular, uma ilha inferior com cinco destinos, respeitando as safe areas.

O site de apresentação abre num **portal**: tela preta com "bem-vindo ao" pequeno
sobre a marca em tamanho de tela, e a rolagem abre os dois painéis revelando a
página. Todo o movimento do portal é derivado da POSIÇÃO da rolagem, nunca de um
cronômetro — por isso ele volta quando se rola para cima.

O ritmo combina 4 e 8px dentro de controles, 14px em campos e 18–24px entre
blocos. Onde não há hover, o alvo de toque cresce para 40–44px.

## Elevation & Depth

Três materiais, e a escolha entre eles é sobre leitura, não sobre estilo:

- **N1 conteúdo** — quase sólido (`.96` no claro, `.94` no escuro), blur 10px.
  Onde moram os números.
- **N2 apoio** — translúcido (`.74` / `.55`), blur 20–22px. Contexto.
- **N3 controle** — vidro (`.56` / Mineral Blue a `.5`), blur 34px / 16px.
  Barra lateral, barra superior, menus: a camada que flutua.

As sombras apenas separam ou elevam; não desenham.

- **Ambient** (`0 1px 2px …, 0 10px 30px -14px …`): separação normal.
- **Lift** (`0 2px 6px …, 0 26px 50px -22px …`): controle, menu, superfície
  elevada.

### Regra nomeada

**A regra dos dados antes do vidro.** Quanto mais importante a leitura
financeira, mais sólida a superfície. Transparência pertence a contexto e
controle, nunca a um número que se precisa conferir.

## Shapes

Campo e botão em 4px; cartão em 6px; prancha em 8px; estado e navegação em
cápsula. Bordas de 1px translúcidas definem os planos sem moldura pesada.

A exceção é a **carteira**: o cartão tem 18px de canto, 300×188px, e é desenhado
como plástico — gradiente, ladrilho do banco, brilho diagonal. Ele é a única
coisa no app que imita um objeto, e imita porque é um objeto que a pessoa já
tem no bolso.

## Components

### Carteira

Fechada, a carteira é um porta-cartões de couro que mostra **o total**. Aberta,
mostra **um cartão** — o último que foi aberto, lembrado entre sessões — com os
vizinhos espiando nas bordas.

- **Trocar de cartão:** arrastando no celular, pelas setas ou pelas flechas do
  teclado no computador.
- **O arrasto é 1:1.** O cartão acompanha o dedo pixel por pixel, com captura de
  ponteiro; nas pontas resiste em vez de travar.
- **Quem anima é uma mola**, quadro a quadro, e não uma transição CSS: agarrar o
  cartão no meio do caminho precisa pegá-lo onde ele está, não onde ele deveria
  estar. Rigidez 340, criticamente amortecida (0,8 depois de um lance).
- **Um gesto anda um cartão.** A projeção da velocidade decide a direção, não a
  distância: carteira não é rolagem.
- O bolso é um container de consulta; em coluna estreita a linha quebra e o
  botão desce, porque o saldo cortado é pior do que o botão deslocado.

### Botões

- **Primário:** Oasis Teal com tinta Night Ocean, canto 4px, padding 8×14.
- **Outline / ghost:** fundo transparente, borda fria; ghost ganha só um véu.
- **Estados:** hover muda brilho; ativo comprime; foco sempre visível; o
  movimento sai em `prefers-reduced-motion`.

### Lançamento

O lançamento tem **três estados**, e não uma marca: ✓ pago (entra nos totais),
✗ não pago (fica previsto) e 🚫 cancelado (não entra em total nenhum, nem no
previsto). O primeiro muda de palavra conforme o tipo — "recebido" numa receita,
"feita" numa transferência, "comprado" no crédito.

O cancelado não some da lista: fica riscado no fim da coluna, com um botão de
restaurar.

### Seletores

- **Cor:** seis colunas, dois tons cada, com o nome do tom escolhido embaixo.
  O vão entre colunas é maior que o vão interno — é só isso que diz "estes dois
  são a mesma cor".
- **Ícone:** caixas individuais de 32px em grade, agrupadas por tema, com o
  desenho do ícone à mostra. É um `radiogroup` com navegação por setas.
- **Banco:** lista com busca em cima, que filtra sem acento e por qualquer
  pedaço do nome. Sem JavaScript, o `<select>` nativo continua inteiro.

### Coco

Dez poses em `/assets/coco`, cada uma ligada a um momento: neutra acolhedora,
pensando, explicando, analisando gráfico, conferindo recibo, lendo arquivo,
feliz, aliviada, meta comemorada, alerta gentil.

A Coco nunca substitui o estado escrito. Toda mudança visual dela acompanha um
texto que diz a mesma coisa.

## Do's and Don'ts

### Do:

- **Do** usar o teal como único acento, e justificar qualquer cor nova.
- **Do** manter o tangerina reservado à Coco.
- **Do** pôr o número sobre a superfície mais sólida que houver.
- **Do** derivar movimento ligado à rolagem da POSIÇÃO, para que ele volte.
- **Do** manter o estado escrito ao lado de qualquer sinal visual.
- **Do** preservar alvos de 40–44px onde não existe hover.

### Don't:

- **Don't** trazer de volta ouro, medalhão, coqueiro ou o UGLEZ.
- **Don't** animar gesto com transição CSS: ela não pode ser interrompida sem
  saltar, e o gesto precisa ser interrompível.
- **Don't** aplicar vidro forte sobre valor que se precise conferir.
- **Don't** aumentar a paleta de categorias para "não repetir": quem separa
  vinte categorias é o ícone.
- **Don't** truncar um saldo. Se não cabe, a linha quebra ou o número encolhe.
- **Don't** depender só de animação para comunicar recebimento, sucesso ou erro.
