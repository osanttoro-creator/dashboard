# Coco no OAZE V3 — contrato atual e evolução

Revisão de 08/10/2026. A conversa da Coco usa um único caminho:

```text
navegador autenticado -> Edge Function oaze-assistant -> Responses API da OpenAI
```

A chave da OpenAI fica nos Secrets das Edge Functions do Supabase. Ela nunca
entra em `assets/`, `preview-v3/`, `localStorage`, resposta HTTP ou log.

## Configuração

No Supabase, abra **Edge Functions -> Secrets** e configure:

| variável | finalidade |
|---|---|
| `OPENAI_API_KEY` | chave secreta do projeto OpenAI |
| `OPENAI_MODEL` | modelo usado; se omitido, `gpt-4o-mini` |
| `OAZE_ALLOWED_ORIGINS` | origens públicas separadas por vírgula |

Exemplo pela CLI, digitado apenas no seu terminal:

```powershell
supabase secrets set OPENAI_API_KEY="SUA_CHAVE"
supabase secrets set OPENAI_MODEL="gpt-4o-mini"
supabase secrets set OAZE_ALLOWED_ORIGINS="https://oaze.site"
```

Não salve a chave em `.env` dentro do repositório nem a envie por chat. Se uma
chave já foi exposta, revogue-a e gere outra.

## Comparação com a Pierre e limites reais

A [central de ajuda da Pierre](https://ajuda.pierre.finance/pt-BR/articles/16020658-como-o-pierre-funciona)
declara conexão bancária via Open Finance e organização automática. Sua página
sobre [assistentes](https://ajuda.pierre.finance/pt-BR/articles/16020800-como-funcionam-os-assistentes-no-pierre)
descreve monitoramento de padrões, metas e vencimentos, com alertas e resumos.
O [assistente personalizado](https://ajuda.pierre.finance/pt-BR/articles/16021492-como-criar-um-assistente-personalizado-no-pierre)
é configurado por condição, frequência e canal. São afirmações do fornecedor,
não testes independentes do produto.

O OAZE ainda depende dos dados cadastrados ou importados em formatos validados.
O obstáculo principal não é trocar de modelo: sem atualização confiável da base,
uma IA pode responder com fluência sobre um retrato incompleto. A Coco deve
mostrar período, origem e cobertura antes de conclusões financeiras.

Nesta revisão, a V3 passou a enviar à IA o mês realmente exibido. Perguntas
simples sobre o total do mês passado usam diretamente o cálculo do painel, sem
gastar cota de IA. Propostas com conta ambígua pedem seleção no formulário.
O olho do cartão e a apresentação da proposta foram corrigidos na interface.

Para ser uma agente completa ainda faltam: consultas autoritativas no servidor
com RLS e escopo por perfil; ingestão consentida e reconciliada; propostas
estruturadas para recorrências, metas e orçamentos; monitoramento opt-in com
frequência e horário silencioso; auditoria e testes reais de áudio, PIN,
compartilhamento e cobrança. Nenhum desses itens deve ser anunciado como pronto
apenas porque a conversa responde. O modelo interpreta e propõe; o backend
confere, e a pessoa aprova qualquer escrita financeira.

Antes de enviar descrições individuais ou novos arquivos à OpenAI, atualizar
privacidade e consentimento. O aceite atual para resumos agregados não autoriza
uma ampliação silenciosa do conteúdo enviado.

## Contrato de segurança e privacidade

- A plataforma exige JWT e a função confirma o usuário com `getUser()`.
- Plano e cota vêm do banco; o navegador não escolhe modelo nem limite.
- A OpenAI recebe a pergunta e somente um resumo agregado: totais do mês,
  categorias, metas, histórico permitido pelo plano e despesas previstas
  agrupadas por dia.
- Não são enviados descrições de lançamentos, contas, cartões, e-mail ou IDs.
- Esta lista descreve apenas a conversa textual de `oaze-assistant`. Mídia que
  a pessoa escolhe enviar passa por consentimento e função próprios; o arquivo
  pode conter nomes e descrições.
- A requisição usa `store: false`; a conversa não depende de respostas salvas.
- A cota é reservada atomicamente antes da chamada e devolvida se o provedor
  falhar ou responder vazio.
- Um limite da conta OpenAI é reportado como indisponibilidade do serviço, não
  como se o usuário tivesse esgotado o próprio plano.
- `ai_usage` guarda apenas modelo, contagem de tokens, estado e `request_id`;
  nunca prompt, resposta ou dado financeiro.

## Verificação

```powershell
node tools/verificar-tudo.js
```

A bateria valida o contrato estático, mas o teste completo ainda exige uma
sessão real e o secret `OPENAI_API_KEY` configurado. Depois do deploy, entre no
OAZE, abra a Coco, envie uma pergunta e confirme no banco uma linha `ok` em
`ai_usage`, sem conteúdo financeiro.

Referências oficiais:

- <https://developers.openai.com/api/reference/resources/responses/methods/create>
- <https://supabase.com/docs/guides/functions/secrets>
- <https://supabase.com/docs/guides/functions/auth-headers>
