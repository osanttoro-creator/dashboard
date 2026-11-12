# Base da sessão — OAZE, site de lançamento

Data: 2026-11-11. Projeto: site público OAZE. Branch: `main`. Repositório público: `osanttoro-creator/dashboard`.

## Objetivo e decisões

Jonatham pediu uma apresentação nova inspirada na estrutura direta da página Pierre, sem copiar o site; uma única cor de destaque que transmitisse confiança; correção do botão de assinatura; a assistente antes chamada Coco agora se chama **OAZE**; e uso da imagem enviada “Coco e o cofrinho magenta.png” como foto do app. Confirmou que a assinatura deve abrir o fluxo **dentro do aplicativo**. As fichas da Google Play e da Microsoft Store ainda não têm URLs públicas confirmadas.

## Entrega

- [Página principal](../index.html): nova narrativa, visão do produto, carteira, agenda, assistente, controle, planos, lojas, perguntas e contato.
- [Estilos da página principal](../assets/css/launch-2026.css) e [páginas de apoio](../assets/css/launch-pages.css): oceano escuro, creme como neutro e verde OAZE `#5FA99B` como único destaque de interface.
- [Imagem entregue](../assets/brand/oaze-mascote-app.png): exibida na seção da assistente, no ícone de toque e declarada no manifesto web. O arquivo foi copiado sem alteração da imagem recebida.
- [Planos](../precos.html), [recursos](../recursos.html) e [suporte](../suporte.html): identidade e terminologia atualizadas. Oásis deixou de aparecer em duplicidade na página inicial. Uma promessa de simulações avançadas foi retirada da lista de funções disponíveis porque a própria página de recursos diz que ainda não funciona.
- O botão Oásis leva a `/app/planos`, rota existente do aplicativo web. A escolha final do ciclo e o pagamento continuam no app autenticado. O site não cria cobrança.
- Textos gerados em inglês, francês e espanhol e dicionários correspondentes foram atualizados.

## Verificação

- Commit principal de implementação: `2bc251c`.
- `node tools/verificar-tudo.js`: 49 verificações passaram.
- `node tools/conferir-planos.js`: preços e catálogo coerentes.
- Prévia automatizada com arquivos locais: larguras de 1440 px e 390 px passaram; imagens carregadas, sem rolagem horizontal, menu móvel, formulário e destino de assinatura verificados. O teste foi atualizado em [landing-lojas-ui.js](../tools/testes/landing-lojas-ui.js).
- As páginas da loja permanecem “Em breve”; nenhum link foi inventado.

## Falhas e limites

- O navegador deste ambiente não alcançou o servidor local por bloqueio de rede. A inspeção visual foi feita com interceptação de arquivos locais no navegador e mostrou o layout desktop e celular. O clique autenticado de assinatura, a cobrança Stripe, o banco e o recebimento de e-mail do formulário não foram testados nesta sessão.
- A revisão automática bloqueou clonar por completo o repositório privado do aplicativo. Esta entrega usa a imagem no **site** e no manifesto web; não altera o ícone dos instaladores Android/Windows nem as fichas das lojas.
- O formulário já existia. Esta sessão manteve sua implementação, mas não comprovou persistência nem entrega de e-mail em produção.
- O arquivo antigo do ícone em 192/512 px ainda existe no manifesto para compatibilidade. É preciso substituir os tamanhos nativos pelo arquivo oficial no projeto do aplicativo antes do lançamento nas lojas.

## Avaliação e próximos passos

Jonatham aprovou a direção funcional do botão dentro do app e forneceu a imagem exata. Não houve aprovação visual explícita da nova página nesta sessão. Publicação e teste em produção devem ser registrados separadamente após a execução do deploy.

Quando as fichas oficiais estiverem públicas, verificar os links exatos e preencher [lojas-oaze.js](../assets/js/lojas-oaze.js). Validar uma assinatura real em conta de teste, o ícone instalado no Android/Windows e a chegada de mensagens do formulário em `info@oaze.site`.

## Publicação verificada

Os commits `2bc251c` e `3a6b541` foram enviados à `main`. O [workflow Hostinger 176](https://github.com/osanttoro-creator/dashboard/actions/runs/43133552371) terminou com sucesso. A página inicial, `/precos`, `/app/planos`, o CSS e a imagem responderam HTTP 200 no domínio; o HTML servido continha a nova chamada, a referência à imagem e o link de assinatura. `/app/planos` entregou a tela do aplicativo. Isso confirma a rota pública, não a cobrança autenticada.

O SHA-256 da imagem original recebida e do arquivo no repositório é igual (`2F4395416AA0FB2D981F9553A6E9E0FEBF800879B69A6DEB1FAC8BA6A33F42EE`). A resposta PNG da Hostinger teve bytes diferentes, embora a imagem inspecionada visualmente corresponda à enviada; o servidor pode ter recompactado o arquivo. Não foi executada comparação pixel a pixel.
