# API da OpenAI no UGLEZ

O UGLEZ usa um único caminho:

```text
navegador autenticado -> Edge Function oaze-assistant -> Responses API da OpenAI
```

A chave da OpenAI fica nos Secrets das Edge Functions do Supabase. Ela nunca
entra em `assets/`, `app.html`, `localStorage`, resposta HTTP ou log.

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

## Contrato de segurança e privacidade

- A plataforma exige JWT e a função confirma o usuário com `getUser()`.
- Plano e cota vêm do banco; o navegador não escolhe modelo nem limite.
- A OpenAI recebe a pergunta e somente um resumo agregado: totais do mês,
  categorias, metas, histórico permitido pelo plano e despesas previstas
  agrupadas por dia.
- Não são enviados descrições de lançamentos, contas, cartões, e-mail ou IDs.
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
OAZE, abra UGLEZ, envie uma pergunta e confirme no banco uma linha `ok` em
`ai_usage`, sem conteúdo financeiro.

Referências oficiais:

- <https://developers.openai.com/api/reference/resources/responses/methods/create>
- <https://supabase.com/docs/guides/functions/secrets>
- <https://supabase.com/docs/guides/functions/auth-headers>
