# Base da sessão — OAZE: apresentação pública e lojas

**Data:** 28/10/2026  
**Projeto:** `G:\Meu Drive\sites\OAZE\o site`  
**Objetivo:** transformar a entrada pública de `oaze.site` em uma apresentação do OAZE e preparar os acessos à Google Play e à Microsoft Store.

## Decisões e escopo

- Jonatham confirmou que as fichas das lojas ainda estão em configuração. Os cartões exibem **Em breve** e não apontam a endereços inventados. Quando as fichas oficiais estiverem públicas, preencher `play` e `windows` em [`assets/js/lojas-oaze.js`](../assets/js/lojas-oaze.js); o script valida os domínios antes de criar os links.
- O site usa a identidade e as capturas do OAZE. A página da [Pierre](https://lp.pierre.finance/lp/converse) serviu de referência para a sequência de apresentação; o repositório [REA](https://github.com/morluto/rea) foi consultado para análise da referência. Não foram copiados textos, imagens ou componentes da Pierre.
- As chamadas públicas para entrar no aplicativo web foram substituídas por `#baixar` ou `/#baixar`. A rota `/app` permanece operante para autenticação e retorno de cobrança. Desativá-la exige migrar esses fluxos primeiro. Isso é uma restrição técnica desta entrega, não uma aprovação explícita do usuário para mantê-la permanentemente.

## Arquivos e resultado

- [`index.html`](../index.html): novo hero imediato, imagens do produto e seção de lojas; sem portal de rolagem nem links públicos de entrada no app.
- [`assets/css/landing-appstores.css`](../assets/css/landing-appstores.css): apresentação, cartões das lojas e regras para telas menores e movimento reduzido.
- [`assets/js/lojas-oaze.js`](../assets/js/lojas-oaze.js): URLs vazios e validação dos links oficiais futuros.
- [`recursos.html`](../recursos.html), [`precos.html`](../precos.html), [`suporte.html`](../suporte.html), [`404.html`](../404.html): chamadas públicas apontam para a seção de disponibilidade.
- `en/`, `fr/`, `es/` e `i18n/site/`: versões traduzidas correspondentes.
- [`manifest.webmanifest`](../manifest.webmanifest): início da experiência pública em `/`.
- [`tools/testes/landing-lojas-ui.js`](../tools/testes/landing-lojas-ui.js): verificação visual de 1440 px e 390 px, imagens, links, rolagem e erros de JavaScript.
- [`tools/servir-demo-local.js`](../tools/servir-demo-local.js): servidor local também resolve `/`.
- [`tools/gen-idiomas-app.js`](../tools/gen-idiomas-app.js): exclui o script público das traduções do aplicativo.
- [`README.md`](../README.md): instruções de URL das lojas e distinção entre landing e rota técnica.

Capturas locais: `docs/landing-stores-preview/landing-1440.png` e `landing-390.png`. Foram salvas no projeto para revisão, mas não fazem parte do commit nem do pacote publicado.

## Estado técnico verificado

- Fonte de verdade: branch `main` do repositório `osanttoro-creator/dashboard`.
- Commit da implementação: `66a3f9f` (`feat(site): apresentar OAZE e preparar links das lojas`), enviado a `origin/main`.
- O pacote Hostinger da cópia isolada do commit foi gerado: 141 arquivos, 5.443 KB; nenhuma assinatura de segredo encontrada.
- Em `https://oaze.site/`, o novo título e a seção `#baixar` responderam com HTTP 200. `/en/`, `/fr/`, `/es/`, `/app` e `/assets/js/lojas-oaze.js` também responderam 200.
- O teste visual passou no domínio publicado em 1440 px e 390 px, incluindo carregamento das imagens, ausência de rolagem horizontal e ausência de erros de JavaScript. O estado interno do workflow GitHub Actions não foi obtido por ferramenta; a publicação foi verificada no domínio.

## Testes, falhas e limites

- `node tools/gen-idiomas.js --conferir`, `node tools/auditar-cliques.js`, `node tools/testes/v3-corte-principal.js`, `git diff --check` e o teste visual local passaram.
- A suíte `node tools/verificar-tudo.js` passou em todos os itens de código na exportação limpa do commit. A checagem de histórico falhou ali porque `git archive` não exporta `.git`; `node tools/varrer-historico-segredos.js` passou no repositório real.
- A suíte no checkout compartilhado tinha falhas provocadas por alterações simultâneas fora desta entrega em app e pagamento. Esses arquivos não entraram no commit da landing.
- A revisão automática rejeitou executar `npx rea-agents` por risco de executar um CLI externo não verificado. A referência foi analisada por leitura do repositório e da página.
- Sem teste de instalação via Google Play/Microsoft Store: as fichas ainda não estão públicas. Sem teste ponta a ponta de login e cobrança nativos nesta sessão.

## Avaliação e próximos passos

- **Aprovado explicitamente por Jonatham:** preparar os botões agora e adicionar redirecionamentos somente após publicação das fichas.
- **Sem avaliação explícita de Jonatham:** aparência final da nova landing e manutenção técnica de `/app`.
- Ao receber os URLs oficiais, confirmar as fichas, preencher `assets/js/lojas-oaze.js`, testar cada destino e publicar uma nova versão.
- Planejar a migração dos retornos de login e cobrança para o aplicativo nativo antes de desativar `/app`.

Conexão no segundo cérebro: `G:\Meu Drive\my brain\03 - Projetos\OAZE\oaze-site-lojas-e-apresentacao-2026-10-28.md`.
