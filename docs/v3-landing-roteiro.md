# Landing v3 — roteiro

Texto da página inicial, seção por seção, com o visual de cada uma. Modelo de
narrativa de página de produto da Apple, na identidade v1. Implementado em
`index.html`, `assets/css/site.css` e `assets/js/narrativa.js` (`b0d2727`).

**Fundo:** ▣ Noite · □ Areia · ■ Poço. Alternar marca a virada de capítulo.
**CTA único:** "Criar conta grátis".

---

## ▣ 0 · Abertura — sem mudança

Lente com o hello escrito à mão e a demonstração do painel. Intocada.

## □ 1 · Destaques

> Rótulo: COMO O OAZE FUNCIONA
> **Cinco coisas. *Um mês inteiro à vista.***

**Visual:** grade bento de cinco cartões, cada um leva ao capítulo. Luz que segue
o ponteiro, contorno em ouro, onda no clique. O cartão da UGLEZ é escuro, com
poeira luminosa em azul-royal. *(animação interativa)*

| Cartão | Texto |
|---|---|
| Contas | Todos os bancos num painel só. · Saldo de cada conta, lado a lado. |
| Extrato | O arquivo do banco vira lançamento. |
| UGLEZ | Seu mês explicado em frases. · Pergunte em português. A resposta vem com o número. |
| Cartão | A fatura fecha no dia dela. |
| Mês | O fim do mês, visto do começo. · Projeção do fechamento e metas com data. |

## ▣ 2 · Tudo em conta.

**Visual:** painel com saldo total de R$ 12.480,90 e quatro contas com as marcas
reais de Nubank, Banco do Brasil, Santander e PicPay. As linhas entram uma a uma;
um contorno dourado passa de conta em conta. *(animação em loop)*

> **Tudo em conta.**
> Cada banco que você usa, num painel só.
>
> Às oito da manhã, antes do café, você abre o OAZE e vê a conta-salário, a
> poupança e os cartões lado a lado. Cada um com a marca do próprio banco,
> reconhecida pelo nome. O saldo de hoje fica em cima. O que já saiu fica
> embaixo. Sem abrir quatro aplicativos para somar de cabeça.

**até 41** bancos com marca própria¹ · **até 10** contas no Basic, 5× o Grátis² ·
**até 5** espaços no Pro, 5× o Grátis³

**Galeria (rolagem lateral):** Pessoal — mercado, aluguel, a feira de sábado · PJ —
a nota do cliente nunca se mistura com a casa · Casa — o que é de todos, num lugar
só. *(foto de uso, desenhada em HTML)*

## □ 3 · Passado a limpo.

**Visual:** o arquivo `extrato-setembro.ofx` desce; quatro linhas se desdobram e
ganham categoria (Alimentação, Transporte, Renda, Assinaturas). *(animação em loop)*

> **Passado a limpo.**
> O arquivo do banco vira lançamento organizado.
>
> Domingo à noite, você baixa o extrato no aplicativo do banco e solta o arquivo
> no OAZE. Cada linha vira um lançamento com data, valor e uma categoria sugerida
> pela descrição. Mercado vai para Alimentação. Uber vai para Transporte. Você só
> confere. OFX é o formato de extrato que quase todo banco oferece para baixar.

**até 4** formas de trazer o extrato⁴ · **até 100** lançamentos por mês no Grátis.
Sem limite no Basic⁵

## ▣ 4 · Crédito onde é devido.

**Visual:** compra "Fone · R$ 600 em 3×" no dia 28. A fatura de 25/set aparece já
fechada; as três parcelas caem nas faturas de 25/out, 25/nov e 25/dez.
*(animação em loop)*

> **Crédito onde é devido.**
> A compra entra na fatura em que ela realmente cai.
>
> Você compra um fone em três vezes no dia 28. O cartão fecha no dia 25. O OAZE põe
> a primeira parcela na fatura que fecha no mês seguinte, não na que acabou de
> fechar, e as outras duas nos meses em que vão cair. Quando a fatura chega, o
> valor bate com o que o banco cobra.

**até 5** cartões no Basic, 5× o Grátis⁶ · **até 24** meses de fatura lado a lado,
24× o Grátis⁷

## □ 5 · As contas batem.

**Visual:** barras de entradas e saídas de seis meses crescem; uma linha tracejada
projeta o fechamento em R$ 5.040; a meta "Reserva de emergência" enche até 64%,
"chega em mar/27 no ritmo atual". *(animação em loop)*

> **As contas batem.**
> O saldo de hoje e o do último dia, na mesma tela.
>
> No dia 12, você abre o painel e já sabe como o mês termina. Entradas, saídas e o
> que ainda vai cair entram na conta. A meta mostra quanto falta e em que mês
> chega. Se o delivery cresceu, a categoria aparece sozinha. Com menos de três meses
> de histórico, o OAZE avisa que ainda não dá para projetar.

**até 24** meses de histórico no Basic, 8× o Grátis⁸ · **até 10** metas com prazo no
Basic, 10× o Grátis⁹

## ■ 6 · Traduz sem trair.

**Visual:** as partículas da UGLEZ, as mesmas do app, passando pelos estados de
verdade — recebendo, pensando, respondendo. A pergunta aparece; a resposta é
escrita letra a letra. Marcado "Exemplo ilustrativo". *(animação em loop)*

> Pergunta: *Dá para trocar de celular em outubro?*
> Resposta: *Dá, mantendo o ritmo. Sobram R$ 1.140 por mês e o celular custa
> R$ 2.800. Em outubro você terá R$ 3.420 guardados — a meta da reserva atrasa um
> mês.*

> **Traduz sem trair.**
> Pergunte em português. A resposta vem com o número.
>
> No almoço, você pergunta se dá para trocar de celular em outubro. A UGLEZ olha os
> totais do mês, as metas e as recorrências, e responde com os valores. Ela recebe
> só o resumo, nunca a descrição dos seus lançamentos. Quando o histórico é curto
> demais para prever, ela diz isso em vez de inventar.

**até 120** leituras por mês no Pro, 24× o Grátis¹⁰ · **até 30** no Basic, 6× o
Grátis¹⁰

## □ 7 · Comparador

> Rótulo: COMPARAR · **O que você usa hoje?** · Escolha. O ganho aparece em número.

Escolha entre três opções. Funciona sem JavaScript. **Visual:** a ferramenta atual
desenhada à esquerda, uma seta, o painel do OAZE à direita. *(animação)*

| Opção | Frase | Números |
|---|---|---|
| Planilha | Na planilha, você digita cada linha e conserta a fórmula. | até 4 formas de importar em vez de digitar⁴ · até 24 meses comparados, sem fórmula⁷ · até 5 cartões com fatura por ciclo⁶ |
| App do banco | No app do banco, você vê um banco de cada vez. | até 41 bancos num painel só¹ · até 10 contas lado a lado² · até 5 espaços separados³ |
| Caderno | O caderno guarda o que passou. Não diz o que vem. | até 10 metas com data de chegada⁹ · até 24 meses de histórico⁸ · até 120 leituras da UGLEZ por mês¹⁰ |

CTA: **Criar conta grátis**

## ▣ 8 · Planos — sem mudança

## ▣ 9 · Perguntas frequentes

Duas respostas corrigidas: saiu a promessa de "exportar" dados numa troca de plano
e a de "trazer o que estava no aparelho, com confirmação" — nenhuma das duas é
verdade hoje.

## □ 10 · Por que começar aqui.

**Motivos**, com ícone: Grátis, sem prazo. — O plano Grátis não expira. · Sem cartão
para começar. — Nenhum dado de pagamento no cadastro. · Nada para instalar. — Abre
no navegador do celular e do computador. · Experimente antes. — O painel funciona
antes do cadastro.

**Valores**, com ilustração:

- **Privacidade** (âncora `#seguranca`). Seu extrato não vira produto. Cada conta
  enxerga só a si mesma, por regra no próprio banco de dados. O OAZE não pede a
  senha do seu banco. A UGLEZ recebe só totais, nunca a descrição dos lançamentos.
- **Acessibilidade.** Legível para quem enxerga pouco. O texto chega a até 15,3:1 de
  contraste, 2× o nível mais alto da norma¹¹. Quem pede menos movimento no aparelho
  recebe a página parada. Cada controle mostra onde está o foco do teclado.
- **Leveza.** O cálculo do seu mês acontece no seu aparelho. Saldo, fatura e projeção
  não esperam servidor nenhum para aparecer. Menos ida e volta de dados para chegar
  ao mesmo número.

> O modelo pede "meio ambiente". Não há afirmação ambiental que o OAZE sustente com
> número, então o bloco virou **Leveza**, com o fato verificável que existe: o
> cálculo é local.

CTA: **Criar conta grátis**

## Notas

1. Instituições com logotipo próprio no OAZE em setembro de 2026. Bancos fora da
   lista entram com ícone genérico.
2. Contas: até 2 no Grátis, até 10 no Basic, sem limite no Pro.
3. Espaços financeiros separados, como Pessoal e PJ: 1 no Grátis e no Basic, até 5
   no Pro.
4. CSV, OFX, texto colado e Registrato, o relatório de contas do Banco Central.
   Disponibilidade por plano na página de preços.
5. Movimentações por mês: até 100 no Grátis; sem limite no Basic e no Pro.
6. Cartões de crédito: 1 no Grátis, até 5 no Basic, sem limite no Pro.
7. Comparação entre meses: 1 mês no Grátis, até 24 no Basic, sem limite no Pro.
8. Histórico guardado: 3 meses no Grátis, até 24 no Basic, sem limite no Pro.
9. Metas: 1 no Grátis, até 10 no Basic, sem limite no Pro.
10. Leituras da UGLEZ por mês: 5 no Grátis, até 30 no Basic, até 120 no Pro.
11. Texto principal `#F1ECE3` sobre o fundo `#071822`, pela fórmula da WCAG 2.2. O
    nível AAA pede 7:1.

Todos os limites vêm de `assets/js/planos.js`; a contagem de bancos, de
`assets/vendor/bancos.js`.

## Decisões fora do modelo

- **Cabeçalho mantido.** O modelo pede uma barra só com nome, "explorar" e "preço".
  O cabeçalho do site carrega "Entrar" para quem já tem conta, e a abertura não
  podia mudar. Fica como está.
- **Cinco destaques, não seis.** Espaços financeiros viraram a galeria do capítulo
  de contas, para a alternância de fundos fechar certa antes dos planos.
