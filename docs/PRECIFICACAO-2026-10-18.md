# Precificação do OAZE — análise de 18/10/2026

Feita com a skill `pricing-strategy` do My Brain. Preços de concorrentes e de
fornecedores foram conferidos na data; promoção muda de semana em semana.

## 1 · O que a Coco entrega hoje (✅ lido no código, não na landing)

| Entrega | Onde | Limite real |
|---|---|---|
| Conversa por texto sobre o mês exibido | `oaze-assistant`, `gpt-4o-mini` | 10 / 60 / 200 pedidos por mês; entrada 5k / 9k / 14k tokens, saída 500 / 900 / 1.200 |
| Conversa por voz, WebRTC | `oaze-coco-realtime`, `gpt-live-1` + cérebro `gpt-6-luna` com ferramentas | sessão local de 10 min; **6 por hora, 20 por dia, sem cota mensal e sem gate de plano** |
| Mídia (foto, comprovante) com consentimento | `oaze-coco-media` | consome a cota mensal |
| Propostas estruturadas que a pessoa aprova | `preview-v3/app.js` | nunca escreve sozinha |
| Prévia de aporte: classifica só o nome | `oaze-invest-data` | 12 interpretações por dia |
| CDI/Selic (BCB) e cotação (brapi) | `oaze-invest-data` | sem `BRAPI_API_KEY`, só 4 tickers de teste |

Não entrega: conexão bancária, categorização automática, recorrência automática,
monitoramento proativo, relatórios personalizados, backup agendado, colaboradores.
PDF sai pela janela de impressão do navegador.

## 2 · Custo variável por assinante (🔎 estimado com preço de tabela)

Dólar a R$ 5,20. `gpt-4o-mini` a US$ 0,15/1M entrada e US$ 0,60/1M saída.

| Plano | Custo por pedido de texto | Mês cheio de texto |
|---|---|---|
| Semente | R$ 0,0055 | R$ 0,06 |
| Coqueiro | R$ 0,0098 | R$ 0,59 |
| Oásis | R$ 0,0147 | R$ 2,94 |

Texto é barato o bastante para não importar. **A voz é outra ordem de grandeza:**
`gpt-live-1` é cobrado por tempo, US$ 0,05/min ≈ **R$ 0,26/min**.

- sessão cheia de 10 min: **R$ 2,60**
- teto do rate limit hoje (20/dia × 30 dias × 10 min): **R$ 1.560 por usuário/mês**
- uso moderado real (2 sessões de 5 min por dia): **R$ 78 por usuário/mês**

Em um plano de R$ 14,90 isso é prejuízo com um único usuário entusiasmado, e o
rate limit por hora/dia não impede: ele só espalha o custo pelo mês.

## 3 · Custo fixo mensal (🔎 estimativa; confirmar faturas)

| Item | Mensal |
|---|---|
| Supabase Pro (US$ 25) | R$ 130 |
| Google Workspace 1 usuário (US$ 7 anual + IOF) | R$ 39 |
| Hospedagem + domínio (Hostinger, *assumido*) | R$ 45 |
| Apple Developer (US$ 99/ano) | R$ 43 |
| Contador ME no Simples | R$ 200 |
| Monitoramento, e-mail transacional, brapi | R$ 50 |
| **Base solo** | **≈ R$ 507** |
| Pluggy Dados (piso publicado R$ 2.500/mês) | +R$ 2.500 |
| 1 dev PJ + 1 suporte PJ | +R$ 8.500 |

Stripe Brasil: 3,99% + R$ 0,39 por cobrança. Em ticket pequeno o R$ 0,39 pesa:
6,6% em R$ 14,90, 5,0% em R$ 39,90, 4,2% no anual de R$ 149,90.

Governo: MEI não serve — atividade de software está fora da lista e o teto de
R$ 81 mil/ano cai em ~345 assinantes do Coqueiro. ME no Simples: **Anexo V,
15,5% na primeira faixa, sem folha**; com Fator R ≥ 28% (pró-labore/folha sobre
receita) cai para **Anexo III, 6%**. A 20 mil/mês de receita, esses 9,5 pontos
são R$ 1.900/mês — praticamente o custo do pró-labore que habilita a troca.
Decisão do contador, não minha.

## 4 · Mercado (✅ conferido em 18/10/2026)

| Produto | Preço | O que lidera |
|---|---|---|
| Organizze Manual | R$ 39/mês · 12× R$ 29,90 | lançamento manual, relatórios |
| Organizze Conectado | R$ 49/mês · 12× R$ 39,90 | 3 contas conectadas |
| Organizze Conectado Plus | R$ 79/mês · 12× R$ 69,90 | 10 contas, PF e PJ |
| Mobills Premium | ≈ 12× R$ 19,90 | marca e volume |
| Mobills PRO | R$ 299,90/ano · 12× R$ 29,99 | assistente no WhatsApp |
| Pierre (CloudWalk) Pro | ≈ R$ 39/mês · ≈ R$ 33 no anual | IA + Open Finance |
| **OAZE Coqueiro** | **R$ 14,90** | IA conversacional com voz |
| **OAZE Oásis** | **R$ 29,90** | projeções |

O piso do mercado brasileiro para controle **manual** é R$ 39. O OAZE cobra
R$ 14,90 por manual **mais** uma agente de voz que nenhum plano manual
concorrente tem. Está 60% abaixo do mercado na função básica.

## 5 · Preço justo recomendado

Métrica de valor errada hoje: contas, cartões e movimentações. Isso pune o
usuário engajado e não acompanha o custo. A métrica certa é **uso da Coco
(pedidos + minutos de voz)** e, depois, **bancos conectados**.

| | Semente | Coqueiro | Oásis | Oásis Conectado (quando existir) |
|---|---|---|---|---|
| Hoje | R$ 0 | R$ 14,90 | R$ 29,90 | — |
| **Recomendado** | **R$ 0** | **R$ 19,90** | **R$ 39,90** | **R$ 59,90** |
| Anual | — | R$ 199 (R$ 16,58/mês) | R$ 399 (R$ 33,25/mês) | R$ 599 (R$ 49,92/mês) |
| Pedidos de texto | 10 | 100 | 400 | 400 |
| **Minutos de voz** | **0** | **20** | **60** | **60** |
| Bancos conectados | — | — | — | 3 |

Margem no pior caso (100% da cota usada, Anexo V, Stripe, modelo trocado para
`gpt-6-luna`):

| Plano | Líquido | Texto | Voz cheia | Sobra |
|---|---|---|---|---|
| Coqueiro R$ 19,90 | R$ 15,64 | R$ 0,70 | R$ 5,20 | **R$ 9,74 (49%)** |
| Oásis R$ 39,90 | R$ 31,74 | R$ 2,80 | R$ 15,60 | **R$ 13,34 (33%)** |
| Conectado R$ 59,90 | R$ 47,84 | R$ 2,80 | R$ 15,60 | **R$ 29,44 (49%)** |

ARPU com mistura 70/30: hoje R$ 19,40 · recomendado R$ 25,90 · com conectado a
30% de adoção ≈ R$ 35.

Pacote extra de voz: 60 min por R$ 29,90 (custo R$ 15,60, sobra R$ 9,56).

Internacional (`plan_prices`, hoje `vigente = false`): US$ 3,99 / 7,99 acompanha
a mesma lógica — subir para US$ 4,99 / 9,99 mantém a paridade com o novo BRL.

## 6 · Ponto de equilíbrio

| Cenário | Fixo/mês | Assinantes para empatar |
|---|---|---|
| Solo, sem Open Finance | R$ 550 | **≈ 40** Coqueiro (ou 25 Oásis) |
| Solo, com Pluggy | R$ 3.050 | **≈ 80** Conectado |
| Pluggy + dev PJ + suporte PJ | R$ 11.550 | **≈ 300** Conectado |

O número que decide o roteiro: **o Open Finance só se paga a partir de ~80
assinantes conectados a R$ 59,90.** Antes disso, o piso de R$ 2.500/mês da
Pluggy consome tudo. Não ligar a conexão bancária sem lista de espera paga ou
sem negociar preço por conexão (há relato de revenda a ~R$ 9,90/banco, não
verificado).

## 7 · Riscos, com mitigação

1. **Voz sem cota mensal nem gate de plano** → medir minutos em `ai_usage`,
   criar cota por plano e bloquear voz no Semente. É a correção mais urgente,
   antes de qualquer mudança de preço.
2. **Assinatura dentro de app iOS** → Apple fica com 15–30%, o que destrói
   R$ 19,90. Vender sempre na web (Stripe) e usar o app como cliente. O US$ 99/ano
   só começa a valer quando existir build iOS de verdade.
3. **Ancorar em R$ 14,90** → subir depois para R$ 39,90 com grandfathering deixa
   a primeira safra pagando um terço para sempre. Corrigir antes do lançamento
   de 22/10 é barato; depois, caro.
4. **Vender o que não existe** → relatórios, backup agendado e colaboradores
   continuam fora da lista até terem teste de ponta a ponta.
5. **Preço de tabela da OpenAI** → o US$ 0,05/min de `gpt-live-1` vem de fontes
   de terceiros. Conferir na página oficial e na primeira fatura real.

## 8 · Rollout

- **Grandfathering: sim**, 12 meses para quem já assinou, e aviso de 30 dias.
  Hoje a base é pequena ou nula, então o custo é mínimo e compra confiança.
- Mudança antes de 22/10 (lançamento) evita migração: ninguém ainda pagou o
  preço antigo. Essa é a janela.
- Reversão: se a conversão grátis→pago ficar abaixo de 1,5% em 60 dias, testar
  R$ 16,90 no Coqueiro em vez de voltar a R$ 14,90.
- Observar: conversão grátis→pago, churn por plano, ARPU, **minutos de voz por
  assinante** (contra-métrica: minutos crescendo mais rápido que receita).

## Premissas a confirmar

Fatura real da Hostinger; honorário do contador; cotação do dólar no dia;
preço oficial de `gpt-live-1` e `gpt-6-luna`; proposta comercial da Pluggy;
enquadramento do CNAE e Fator R com o contador; plano pago da brapi.

---

# Adendo de 19/10/2026 — preço único e universal, com iOS no ar

Decisão de Jonatham: **um preço, igual em todas as versões** (web, iOS, Android),
em vez dos três degraus da seção 5. O iOS já existe, então a comissão de loja
deixa de ser hipótese e passa a ser a restrição que define o número.

## O que muda na estrutura

Com preço único não existe upsell: o número precisa capturar a disposição a
pagar **média** da base inteira, não a da porta de entrada. E precisa sobreviver
ao canal mais caro — a App Store — porque é o mesmo número em todos.

## Comissões por canal (🔎 conferido em 19/10/2026, fontes de terceiros)

| Canal | Retenção |
|---|---|
| Web (Stripe) | 3,99% + R$ 0,39 |
| App Store com link externo de pagamento, Brasil | 15% de Store Services (10% em renovação de assinatura) |
| App Store com IAP da Apple, Brasil | 21% de comissão + 5% de processamento |
| Google Play | 15% até US$ 1M/ano |

O acordo da Apple com o Cade (junho de 2026) permite direcionar o usuário para
pagamento externo, e é isso que torna o preço único viável: 15% em vez de 26%.

## Preço recomendado

**R$ 29,90/mês · R$ 299/ano (R$ 24,92/mês) · US$ 7,99 · € 7,99** — o mesmo valor
na web, no iOS e no Android. "Universal" aqui é um preço por moeda, idêntico em
todos os canais; um número só para o mundo inteiro significaria subcobrar o
Brasil ou sobrecobrar o resto.

Plano pago único = o produto inteiro: contas, cartões e movimentações sem teto,
histórico completo, projeções, CSV e PDF, **300 pedidos de texto + 30 minutos de
voz por mês**. O Semente continua grátis (10 pedidos, 0 voz, 2 contas) — grátis
não é preço.

Margem no pior caso (cota 100% usada, variável máximo R$ 10,92):

| Canal | Recebe | Imposto | Sobra |
|---|---|---|---|
| Web | R$ 28,32 | R$ 4,63 | **R$ 12,77 (43%)** |
| iOS com link externo | R$ 23,83 | R$ 4,63 | **R$ 8,28 (28%)** |
| iOS com IAP | R$ 22,13 | R$ 3,43 | **R$ 7,78 (26%)** |
| Google Play | R$ 25,41 | R$ 3,94 | **R$ 10,55 (35%)** |

Todos os canais ficam positivos mesmo com a cota inteira consumida. R$ 39,90
também fecharia, mas é paridade com Organizze Manual e Pierre Pro **sem** ter
Open Finance, que é justamente o que esses dois vendem na capa. R$ 29,90 fica
25% abaixo do piso do mercado e guarda o aumento para quando a conexão bancária
existir — aumento com função nova na mão é o único que cliente aceita.

## O custo real do preço único

Ponto de equilíbrio com contribuição média de ~R$ 10/assinante/mês:

| Cenário | Fixo/mês | Assinantes |
|---|---|---|
| Solo, sem Open Finance | R$ 593 | ~60 |
| Com Pluggy | R$ 3.093 | **~310** |
| Pluggy + dev PJ + suporte PJ | R$ 11.593 | ~1.160 |

Nos três degraus, o Open Finance se pagava com ~80 assinantes conectados a
R$ 59,90. Com preço único sobe para **~310 assinantes**, porque todos passam a
financiar um piso de R$ 2.500/mês que só alguns usam. Quando a conexão entrar:
subir o preço único para R$ 44,90, ou abrir uma única exceção vendendo conexão
como complemento. Recomendo o aumento.

## Trabalho que o preço único exige e que não existe no repositório

1. **Não há validação de recibo de Apple nem de Google.** O backend só conhece
   Stripe (`oaze-pagamento`, `oaze-stripe-webhook`, `stripe_intencoes`). Vender
   dentro do app exige mapear recibo da loja para o plano no Supabase, com
   renovação, estorno e cancelamento. Vender só na web com link externo no iOS
   mantém a única fonte da verdade que já funciona — e é 11 pontos mais barato.
2. **`plan_prices`** passa a ter uma linha vigente por moeda, e a migração precisa
   aposentar `basic`/`pro` sem quebrar quem já assinou.
3. **Cota de voz por plano** continua sendo o pré-requisito (seção 7, risco 1):
   30 minutos só valem como limite se forem medidos e bloqueados.
4. **Risco de revisão da App Store**: confirmar nas diretrizes vigentes que o
   link externo é aceito no Brasil para este caso antes de submeter a build.

## Desconto anual — confirmado em 19/10/2026

R$ 299/ano é exatamente **29,90 × 10**: 17% de desconto, dentro da faixa de
15–20% da skill. Anunciar como **"2 meses grátis"**, não como "−17%": é o mesmo
preço, é verdade aritmética e vende melhor. Vale o mesmo em US$ 79,90 e € 79,90.

Margem do anual no pior caso (cota 100% usada todos os 12 meses):

| Canal | Líquido/ano | Variável/ano | Sobra/mês |
|---|---|---|---|
| Web | R$ 240,33 | R$ 131,04 | **R$ 9,11 (30%)** |
| iOS com link externo | R$ 195,48 | R$ 131,04 | **R$ 5,37 (18%)** |
| iOS com IAP | R$ 186,96 | R$ 131,04 | **R$ 4,66 (16%)** |

**O teto do desconto é 20%.** A R$ 249/ano (−30%), o iOS com IAP cai para
R$ 2,06/mês de sobra (8%) com a cota cheia — uma pessoa que usa os 30 minutos
todo mês passa a dar prejuízo nesse canal.

Ganhos do anual além do desconto: o R$ 0,39 da Stripe é pago uma vez em vez de
doze (taxa efetiva cai de 5,3% para 4,1%), e doze meses de caixa adiantado é
justamente o que financia a decisão da Pluggy.

Mudanças na página: o alternador em `precos.html` hoje nasce em **Mensal**
(`data-ciclo="mensal" aria-pressed="true"`) e o selo diz `−16%`. Com preço único,
nascer em **Anual** com o selo **"2 meses grátis"** — caixa adiantado é o que
falta, não margem mensal. Atualizar também a lista de valores fixos em
`tools/conferir-planos.js`.

---

# Executado em 19/10/2026 — plano único no ar

Decisão de Jonatham: **R$ 29,90/mês e R$ 299,00/ano, e o degrau do meio sai.**
Restam Semente (grátis) e Oásis (pago). Preço igual na web, no iOS e no Android.

Conferido antes de mexer: **nenhuma assinatura em `basic`** (6 em `free`, 1 em
`pro`). Ninguém foi migrado e ninguém perdeu plano. Por isso não houve
grandfathering a fazer — a janela de que falava a seção anterior era real.

| Onde | O que mudou |
|---|---|
| Banco (migração `20261019120000_plano_unico.sql`) | `plans.basic` inativo e sem preço vigente; `pro` passa a destaque; preços v4: BRL 2990/29900, USD e EUR 799/7990 |
| `assets/js/planos.js` | catálogo sem `basic`; anual do Oásis 29990 → 29900; internacional anual 6999 → 7990 |
| `precos.html`, `index.html` | dois cartões, tabela de duas colunas, selo "2 meses grátis", metas e JSON-LD |
| `recursos.html`, `suporte.html`, `termos.html` | limites e nome do plano pago |
| `assets/css/{site,landing-oaze,v3}.css` | grade de planos de 3 para 2 colunas, com largura máxima menor |
| `supabase/functions/oaze-pagamento/index.ts` | `basic` fora de `NOMES`: compra do plano aposentado é recusada na entrada |
| `i18n/site/*.json`, `en/ fr/ es/` | 51 trechos traduzidos e as três línguas regeradas |
| `tools/conferir-planos.js` | o selo passa a aceitar "N meses grátis" **e conferir a conta** — a promessa de dois meses é verificada contra `anual == mensal × 10`, não contra o texto |
| `tools/testes/confere-planos.js` | retrato sem o `basic`, anual 29900, internacional 7990 |

`node tools/verificar-tudo.js`: **36 de 36 verdes.** `plan_entitlements` do `pro`
conferidos no banco real, um a um, contra o catálogo do JS.

## O que ficou de fora, de propósito

1. **Cota de minutos de voz** continua inexistente. Segue sendo o risco número 1:
   os R$ 29,90 só se sustentam porque quase ninguém usa a voz hoje.
2. **Alternador nasce em "Mensal"**. A recomendação era nascer em "Anual" —
   caixa adiantado é o que falta. Mudança de uma linha em `assets/js/site.js`
   (`aplicar('mensal')`) mais o HTML inicial dos cartões; não foi feita porque
   ninguém pediu.
3. **Fuga de português nas páginas de fora**: `data-mensal` e `data-anual` não
   estão na lista de atributos que o `gen-idiomas.js` traduz, então
   `en/index.html` mostra "por mês, cobrado US$ 79.90 por ano — você economiza
   US$ 15.98". O preço converte; as palavras não. É anterior a esta mudança.
4. **Entitlements do `basic`** continuam no banco, e `Planos.get('basic')` agora
   cai no primeiro plano da lista (Semente). Com zero assinantes no plano e a
   compra recusada na entrada, não há caminho até esse estado — mas se um dia
   houver, o certo é um registro de planos aposentados, não o fallback silencioso.

---

# 20/10/2026 — R$ 35,90, e o que cada plano REALMENTE entrega

Preço novo aplicado: **R$ 35,90/mês · R$ 279,90/ano (−35%)**, igual na web, no
iOS e no Android. Internacional: US$ 7,99 e € 7,99 no mês, 62,30 no ano.

## A auditoria: o que está declarado × o que o código faz

Levantado no código em 20/10/2026, chave por chave. ✅ = o produto confere o
plano antes de entregar. ❌ = a diferença existe só na tabela.

| Recurso declarado | Semente | Oásis | Cobrado de verdade? |
|---|---|---|---|
| Limites numéricos (contas, cartões, lançamentos, categorias, orçamentos, metas, recorrências, espaços) | 2/3/100/10/1/1/3/1 | 50/∞/∞/200/100/50/150/5 | ✅ `Limites.cabe` + `limitsReady()` antes de cada criação |
| Pedidos à Coco por mês | 10 | 200 | ✅ `reservar_ia` reserva no banco, atômico, antes de chamar a OpenAI |
| Profundidade da Coco | 3 meses, 6 categorias, 3 metas, 120 palavras, sem comparar, sem simular | 60 meses, 40 categorias, 20 metas, 350 palavras, compara e simula | ✅ `PERFIS` na `oaze-assistant`, no servidor |
| Ritmo da Coco | 3/min, 20/dia | 10/min, 200/dia | ✅ servidor |
| Exportar CSV / PDF | não | sim | ✅ `Limites.exigirRecurso` |
| Contas e cartões em outras moedas | sim | sim | ✅ gated — mas igual nos dois, então não diferencia |
| **Coco flutuante no app** | declarado "não" | declarado "sim" | ❌ **o FAB é renderizado para todos**; `uglezFloatingAssistant` não é consultado em lugar nenhum |
| **Calendário financeiro** | declarado "não" | declarado "sim" | ❌ a rota `/app/calendario` abre para qualquer conta |
| **Comparação entre meses / anual** | declarado "não" | declarado "sim" | ❌ como flag de interface, nunca conferido (a Coco respeita no servidor; o painel não) |
| **Tendências, simulações e projeções** | declarado "não" | declarado "sim" | ❌ idem: a Coco respeita, a interface não |
| **Colaboradores** | 0 | 3 | ❌ criar convite tem **teto fixo de 20 para todos**, sem olhar o plano |
| **Histórico disponível** | 3 meses | completo | ❌ só a Coco respeita; o painel não corta histórico |
| Acesso antecipado, atendimento prioritário | não | sim | ❌ (promessa operacional, não código — isso é legítimo) |
| **Relatórios personalizados** | — | declarado `true` no catálogo | ❌ **não existe**, e a própria página de preços avisa que não existe |
| **Coco por voz** | sem distinção | sem distinção | ❌ **sem cota e sem plano**: 6 sessões/hora, 20/dia, para qualquer conta, inclusive grátis |

## O que isso significa para o preço

A parte que diferencia de verdade é boa e está no lugar certo: **a Coco** (cota,
profundidade, ritmo, simulações) e os **limites de volume**. Tudo isso é conferido
no servidor ou antes da gravação. É defensável cobrar R$ 35,90 por isso.

O problema é o outro lado: hoje uma conta **grátis** tem calendário, Coco
flutuante, comparação entre meses no painel, histórico sem corte, convite para
colaborador e **voz sem teto**. Sete linhas da tabela de comparação dizem "Não"
na coluna Semente e entregam "Sim". Isso é duas coisas ao mesmo tempo: propaganda
incorreta e motivo para não assinar.

Margem a R$ 35,90, com os 200 pedidos de texto queimados:

| | Web | iOS com IAP |
|---|---|---|
| Mensal | R$ 25,58 (71%) | R$ 19,51 (54%) |
| Anual (por mês) | R$ 15,81 (44%) | R$ 11,65 (32%) |

Confortável — até a voz entrar. Trinta minutos de voz custam R$ 7,80 e derrubam a
pior célula (anual no iOS) para **R$ 3,85/mês (11%)**. Duas horas por mês custam
R$ 31,20: nesse canal, **prejuízo de R$ 19,55/mês** com um único usuário. E não
existe nada hoje que impeça isso, nem no plano grátis.

## A escolha que sobra

Cada linha ❌ tem duas saídas honestas, e a decisão é de produto, não minha:

1. **Cobrar o que está escrito** — implementar o gate (voz com cota por plano,
   calendário, Coco flutuante, comparações, histórico, colaboradores). O Semente
   fica menor do que é hoje, e a assinatura passa a valer o que custa.
2. **Escrever o que se cobra** — mover essas linhas para "incluído nos dois" e
   assumir que a diferença é Coco + volume. Tabela mais curta, mais verdadeira,
   e o Semente fica generoso de propósito.

Para a voz não há essa escolha: ela precisa de cota medida nos dois planos, porque
é o único item cujo custo não tem teto. Isso vem antes de qualquer das duas.
