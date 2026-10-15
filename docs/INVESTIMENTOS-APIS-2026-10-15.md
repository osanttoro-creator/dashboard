# Investimentos: automação local e limites reais

Estado: implementação local, aguardando validação e publicação. Nenhuma chave foi adicionada ao repositório e nenhuma conta foi conectada à B3.

## Prévia de aporte com Coco

Ao preencher nome e valor, a interface espera 1,8 s e pede à OpenAI somente uma classificação do **nome**. O valor não é enviado à OpenAI. A resposta estruturada pode sugerir tipo, ticker ou taxa mencionada; o usuário precisa tocar em **Usar sugestão** antes de qualquer campo mudar. A função usa `OPENAI_API_KEY` do servidor, `store:false`, autenticação Supabase e limite de 12 interpretações por usuário/dia. Sem a chave, o formulário continua manual.

A prévia financeira é separada da IA: ação/FII/ETF exige ticker e quantidade e usa brapi; CDB em percentual do CDI usa o histórico do BCB; valor atual digitado pelo usuário prevalece. Falta de cotação ou de quantidade nunca transforma o aporte em “valor atual”. São mostrados fonte, horário e caráter estimado do número. Nenhuma consulta salva ou altera o patrimônio automaticamente.

## O que o OAZE passa a fazer

| Dado | Origem | Uso | Limite |
| --- | --- | --- | --- |
| CDI diário, CDI anualizado e meta Selic | [BCB/SGS](https://www3.bcb.gov.br/sgspub/consultarvalores/consultarValoresSeries.do?method=consultarSeries&series=12) | Mostrar taxa e data; CDB em % do CDI usa a série diária para estimativa bruta | O saldo do banco não pode ser deduzido com precisão só da taxa: tributos, carência, spread e regras contratuais variam |
| Cotação de ações, FIIs e ETFs | [brapi REST v2](https://brapi.dev/docs/acoes) | Multiplicar preço por quantidade informada; exibir data da cotação | Cotação não prova titularidade nem quantidade. Sem ticker, quantidade ou resposta válida, prevalece o valor informado ou o aporte |
| Posição e movimentação pessoais | [B3 Investidor](https://developers.b3.com.br/apis/api-area-do-investidor?sort=newest&viewType=list) | Futuro: conciliação autorizada | A B3 oferece a API a clientes B2B licenciados, com autorização individual; posição é até D-1. Não há acesso direto para pessoa física |

O endpoint local `oaze-invest-data` exige sessão Supabase válida, valida origem, limita requisições e consulta provedores do lado do servidor. Tem três ações: `indices`, `cdi_history` e `quotes`. As consultas de histórico usam no máximo nove anos, dentro do limite de dez anos informado pelo [BCB](https://dadosabertos.bcb.gov.br/dataset/11-taxa-de-juros---selic). Dados recebidos não sobrescrevem o valor informado pelo usuário e não gravam posições automaticamente.

Para liberar cotações além dos quatro tickers de teste, configurar **`BRAPI_API_KEY` apenas como segredo da Edge Function**. A [documentação da brapi](https://brapi.dev/docs/authentication) exige token Bearer e alerta para não colocá-lo no frontend. Sem segredo, o endpoint só testa PETR4, MGLU3, VALE3 e ITUB4. A função foi criada localmente; para funcionar na conta real, ainda precisa ser implantada após aprovação expressa.

## B3: integração futura, não simulada

A [B3](https://www.b3.com.br/main.jsp?lumA=1&lumII=8AE490CA80A9EFDC0180CCF2DD6C308C&lumPageId=8AE490CA80A9EFDC0180CCF1D1F51E52) exige licença e autorização do investidor para compartilhar extratos. Sua [autenticação B3i](https://developers.b3.com.br/index.php?id=26&option=com_content&view=article) usa mTLS, OAuth 2.0, certificados e credenciais de certificação/produção distintas. Antes de construir o adaptador real: contratar, obter ambiente de certificação, desenhar opt-in/revogação, mapeamento de ativos, idempotência, reconciliação e política de retenção. Não colocar CPF, certificados ou tokens em `public.dados`.

## O que é o brapi AI — e o esqueleto útil para a Coco

A [brapi AI](https://brapi.dev/blog/ia-assistente-brapi-tire-suas-duvidas) é descrita pela empresa como assistente da documentação: responde sobre endpoints, autenticação, exemplos e erros. A página `/ai` não documenta publicamente um endpoint de chat reutilizável para o OAZE. A brapi oferece também um [servidor MCP](https://brapi.dev/docs/mcp) que permite a assistentes consultar dados de mercado por ferramentas; isso é diferente de importar o modelo ou a interface da brapi AI. A implementação interna do modelo não é pública: o esquema abaixo é uma proposta para a Coco, não uma descrição verificada do código da brapi.

```text
Pergunta do usuário
  -> classificador restrito: índice, cotação, carteira própria, explicação
  -> autorização: consentimento da Coco + escopo do perfil
  -> roteador de ferramentas (somente leitura)
       -> BCB: CDI/Selic com unidade e data
       -> brapi REST: cotação/histórico com ticker e data
       -> B3: posição pessoal apenas depois de licença + opt-in
       -> OAZE: aportes do perfil com RLS
  -> normalização de fonte, unidade, horário e validade
  -> cálculo determinístico fora do modelo
  -> resposta da Coco: fato / estimativa / lacuna / fonte
```

Regras: nenhuma ordem de compra/venda, nenhuma promessa de retorno, nunca confundir CDI atual com rentabilidade histórica, nunca usar cotação como prova de posição. Perguntas vagas como “qual ação vai subir?” devem explicar incerteza e pedir contexto; não produzir previsão. Para dashboards de campos fixos, REST é mais barato e previsível; MCP só vale quando a Coco precisar escolher ferramentas dinamicamente. Esta separação também é recomendada pela [brapi](https://brapi.dev/blog/mcp-server-finance-brasil-agentes-ia-2026).

## Validação pendente antes de produção

1. Implantar a Edge Function **somente com aprovação** e configurar origem permitida e `BRAPI_API_KEY` como segredo.
2. Testar uma conta autenticada real, resposta do BCB, resposta da brapi e estados de falha/limite.
3. Conferir cálculo de CDB com extrato de banco, impostos e datas de liquidação; mantê-lo rotulado como **estimativa bruta**.
4. Testar quantidade, desdobramentos e proventos em ações/FIIs/ETFs; a cotação atual não reconstrói o histórico patrimonial.
5. Avaliar licença/contrato de exibição e redistribuição de dados antes de qualquer lançamento público.
