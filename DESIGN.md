---
name: OAZE
description: Clareza financeira em uma câmara de petróleo, areia, ouro e dados vivos.
colors:
  oasis-night: "#071822"
  well-deep: "#050F16"
  petroleum: "#0F2A38"
  anchor-glass: "#23394D"
  sand: "#F4EFE6"
  ink-light: "#F1ECE3"
  mist: "#9FB2B8"
  medallion-gold: "#D8B45E"
  uglez-royal: "#4669F0"
  uglez-action: "#354EDE"
typography:
  display:
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif'
    fontSize: "clamp(42px, 5vw, 78px)"
    fontWeight: 590
    lineHeight: 0.92
    letterSpacing: "0.23em"
  headline:
    fontFamily: '"Newsreader", Georgia, serif'
    fontSize: "clamp(26px, 2.8vw, 34px)"
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.14em"
rounded:
  field: "4px"
  card: "6px"
  panel: "8px"
  context: "16px"
  chamber: "30px"
  capsule: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.medallion-gold}"
    textColor: "{colors.oasis-night}"
    rounded: "{rounded.field}"
    padding: "8px 14px"
  button-uglez:
    backgroundColor: "{colors.uglez-action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.field}"
    padding: "8px 14px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.field}"
    padding: "8px 14px"
  chip-uglez:
    backgroundColor: "rgba(151, 176, 197, 0.045)"
    textColor: "rgba(225, 231, 235, 0.68)"
    rounded: "{rounded.capsule}"
    padding: "5px 11px"
  prompt-uglez:
    backgroundColor: "rgba(139, 164, 184, 0.05)"
    textColor: "#F4F6F8"
    rounded: "{rounded.field}"
    padding: "13px 14px"
    height: "82px"
---

# Design System: OAZE

## Overview

**Creative North Star: "A Câmara Financeira do Oásis"**

OAZE transforma finanças pessoais em uma sala de leitura calma e precisa. A base é petróleo profundo; areia e tinta clara garantem legibilidade; ouro sinaliza decisões e valor. A interface permanece instrumental e contida, com números à frente da decoração.

UGLEZ habita esse mesmo mundo como matéria de dados viva: uma formação abstrata de partículas azul-real, atravessada por poucos pontos quentes. A conversa continua sendo uma ferramenta financeira com estado escrito, contexto do mês e ação explícita — não um mascote ou um cartão genérico de chatbot.

**Key Characteristics:**

- Fundo de oásis noturno e painéis de petróleo em camadas.
- Ouro raro para ação, seleção e identidade; azul-real reservado à inteligência UGLEZ.
- Tipografia editorial nos títulos, tipografia técnica e tabular na operação.
- Divisórias finas, vidro moderado e profundidade ambiental, nunca ornamental.
- Densidade responsiva que preserva contexto e ação no primeiro viewport.

## Colors

A paleta alterna um mundo claro de areia com um mundo escuro de petróleo; a câmara UGLEZ permanece deliberadamente escura para fazer os dados luminosos legíveis.

### Primary

- **Ouro do Medalhão:** ação primária, seleção, estado pronto e pontos quentes que ligam a inteligência à marca.

### Secondary

- **Azul-real UGLEZ:** partículas, foco e ação de análise; é a única luz cromática própria da inteligência.

### Neutral

- **Noite de Oásis:** fundo principal do tema escuro e tinta sobre ouro.
- **Poço:** profundidade extrema, base do console e vinheta da formação.
- **Petróleo:** superfícies de conteúdo quase sólidas e fallback quando a transparência é reduzida.
- **Âncora de Vidro:** camada dos controles e da navegação flutuante.
- **Areia:** fundo principal do tema claro.
- **Tinta Clara:** texto de alta prioridade sobre superfícies escuras.
- **Bruma:** texto secundário, metadados e orientação de baixa hierarquia.

### Named Rules

**The Ouro Único Rule.** O ouro é o acento global para ação, seleção e identidade; não se distribuem novas cores decorativas pela interface.

**The Luz UGLEZ Rule.** O azul-real pertence aos estados, partículas, foco e ação da inteligência UGLEZ; ele não substitui a marca OAZE.

## Typography

**Display Font:** IBM Plex Sans (with system-ui fallback), usada no nome espaçado UGLEZ.

**Body Font:** IBM Plex Sans (with system-ui fallback).

**Label/Mono Font:** IBM Plex Mono (with ui-monospace fallback).

**Editorial Font:** Newsreader (with Georgia fallback), usada nos títulos de página do aplicativo.

**Character:** Newsreader introduz uma voz editorial serena; IBM Plex Sans mantém conversa, controles e números precisos; IBM Plex Mono separa rótulos de valores. O nome UGLEZ é uma exceção intencional em sans, amplo e geométrico.

### Hierarchy

- **Display** (590, `clamp(42px, 5vw, 78px)`, 0.92): assinatura UGLEZ; no celular reduz para `clamp(36px, 12vw, 52px)`.
- **Headline** (500, `clamp(26px, 2.8vw, 34px)`, 1.18): títulos editoriais de página.
- **Title** (630, 15px, compacta): cabeçalhos operacionais como “Conversa financeira”.
- **Body** (400, 14px, 1.5): explicações e conteúdo; textos auxiliares extensos usam até 1.65.
- **Label** (600, 11–11.5px, tracking positivo e caixa alta): nomes de campos, métricas e contexto.

### Named Rules

**The Números Estáveis Rule.** Valores financeiros usam algarismos tabulares para que colunas e mudanças de estado não saltem.

**The Escala de Tracking Rule.** Texto pequeno recebe tracking positivo; títulos grandes recebem tracking negativo, exceto a assinatura deliberadamente espaçada do UGLEZ.

## Layout

O aplicativo usa uma faixa superior de destinos em telas a partir de 821px e uma ilha de navegação inferior com cinco destinos no celular. O conteúdo desktop fica centralizado até 1440px; a câmara UGLEZ pode avançar até 1920px e organiza presença visual e console em duas colunas assimétricas, com mínimos de 370px e 500px.

A 1120px, a câmara vira uma pilha: formação primeiro, console depois. A 700px, o compositor sobe antes do histórico para manter a pergunta no primeiro viewport; métricas passam de três colunas para linhas compactas. A 430px, paddings e altura do campo reduzem sem remover estado, sugestões ou ação.

O ritmo combina intervalos de 4 e 8px dentro de controles, 14px em campos e 18–24px entre blocos; as áreas de toque crescem para pelo menos 40–44px onde não há hover.

## Elevation & Depth

A profundidade é híbrida: tonalidade e transparência organizam três materiais, enquanto sombras baixas apenas separam ou elevam. Conteúdo numérico usa material quase sólido; contexto usa vidro intermediário; navegação e controles usam o vidro mais refrativo. Na câmara, vinhetas radiais, névoa azul e a frente/traseira das partículas dão volume à esfera sem trocar estrutura ou introduzir um fundo ilustrativo.

### Shadow Vocabulary

- **Ambient Low** (`0 1px 2px rgba(0, 0, 0, .5), 0 14px 36px -18px rgba(0, 0, 0, .9)`): separação normal no tema escuro.
- **Lifted Control** (`0 4px 10px rgba(0, 0, 0, .55), 0 30px 60px -24px rgba(0, 0, 0, 1)`): navegação, menus e superfícies elevadas.
- **UGLEZ Glow** (`0 0 0 1px rgba(70, 105, 240, .30), 0 0 26px rgba(70, 105, 240, .30)`): presença ou seleção da inteligência, nunca decoração genérica.

### Named Rules

**The Dados Antes do Vidro Rule.** Quanto mais importante a leitura financeira, mais sólida a superfície; transparência pertence a contexto e controles.

## Shapes

Campos e botões usam cantos firmes e pequenos (4px); cartões comuns avançam por 6–8px; contexto interno do UGLEZ usa 12–16px; navegação e estado usam cápsulas completas. A câmara é uma exceção de grande escala com canto generoso (30px, 22px abaixo de 700px e 19px abaixo de 430px). Bordas de 1px, translúcidas e frias definem os planos sem criar molduras pesadas.

Formas circulares ficam reservadas a ícones, pontos de estado, medalhão e partículas. A formação UGLEZ é uma esfera erodida, não um avatar figurativo.

## Components

Os componentes são precisos e contidos: estados mudam por cor, borda, brilho e pequenos deslocamentos, com equivalente por foco visível.

### Buttons

- **Shape:** cantos firmes (4px), peso 560 e padding de 8px por 14px.
- **Primary:** ouro do medalhão com tinta de oásis; usado para ações financeiras principais.
- **UGLEZ:** azul de ação próprio com texto branco; na câmara ocupa no mínimo 104px no desktop e vira uma linha de pelo menos 42–44px no celular.
- **Hover / Focus:** brilho muda de forma breve; o ativo comprime para 97%; foco permanece visível e o movimento é retirado em preferência reduzida.
- **Outline / Ghost:** fundo transparente; outline mantém borda fria, ghost ganha apenas um véu tonal no hover.

### Chips

- **Style:** cápsulas compactas com borda fria translúcida, fundo quase invisível e texto secundário.
- **State:** hover e foco recebem borda azul-real, névoa azul e texto claro; em toque, a altura mínima cresce para 40px.

### Cards / Containers

- **Corner Style:** 6–8px no sistema comum; 12–16px para contexto dentro da câmara.
- **Background:** petróleo e vidros frios em níveis; conteúdo crítico permanece mais sólido.
- **Shadow Strategy:** sombra baixa em repouso e sombra elevada apenas para controles, menus ou resposta ao hover.
- **Border:** linha de 1px com baixa opacidade e ressalto interno sutil.
- **Internal Padding:** 14–24px conforme densidade e hierarquia.

### Inputs / Fields

- **Style:** campo escuro translúcido, borda fria de 1px, canto de 4px e texto IBM Plex Sans.
- **Focus:** borda azul-real e halo de 3px com baixa opacidade.
- **Responsive:** prompt de 82px no desktop, 68px abaixo de 700px e 62px abaixo de 430px; fonte sobe para 16px no celular para evitar zoom do Safari.

### Navigation

- **Desktop:** destinos compactos em faixa superior; o item ativo recebe fundo tonal, e UGLEZ é o único destino com luz azul-real.
- **Mobile:** ilha inferior arredondada com cinco destinos; o estado ativo mantém ícone, rótulo e contraste, respeitando safe areas.

### UGLEZ Chamber

A assinatura é uma prancha escura dividida entre esfera de partículas e console. A esfera responde aos mesmos estados escritos — repouso, foco, recebendo, pensando, respondendo, sucesso e erro — e preserva um fallback 2D. No celular, o compositor precede o histórico; com movimento reduzido, a interação por ponteiro sai sem remover o feedback textual.

## Do's and Don'ts

### Do:

- **Do** mantenha o ouro raro e use-o em ação, seleção, identidade e estados quentes confirmados.
- **Do** preserve o azul-real para a matéria e os estados do UGLEZ.
- **Do** mantenha estado textual acessível junto de qualquer mudança visual da esfera.
- **Do** priorize legibilidade de números com superfícies mais sólidas e algarismos tabulares.
- **Do** preserve o compositor no primeiro viewport móvel e os alvos de toque de 40–44px.

### Don't:

- **Don't** transforme UGLEZ em avatar, mascote ou cartão genérico de chatbot.
- **Don't** substitua petróleo, areia e ouro por uma identidade roxa ou por novos acentos decorativos.
- **Don't** aplique vidro intenso sobre números ou respostas que precisem de leitura precisa.
- **Don't** dependa apenas da animação para comunicar recebimento, pensamento, sucesso ou erro.
- **Don't** remova logo, navegação global, safe areas ou alternativas de movimento reduzido ao estender a câmara.
