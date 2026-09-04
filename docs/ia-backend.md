# A IA do UGLEZ — onde a chave mora

Regra única, e ela não tem exceção: **chave de IA é secreta e vive só no
servidor**. Nenhuma delas pode aparecer em `assets/`, em `index.html`, no
`financas.html` ou em qualquer arquivo que o navegador baixe.

Uma chave `sk-proj-…` exposta é a sua conta sendo gasta por outra pessoa. Ao
contrário da chave publicável do Supabase — que é pública por design e
protegida pelo RLS — aqui não existe nada atrás dela. Quem tem a chave, gasta.

---

## Como configurar

**Em produção**, que é o que vale: Vercel → projeto → *Settings* →
*Environment Variables* → ambiente **Production**.

**Localmente**, para `vercel dev`: no `.env` da raiz, que está no `.gitignore`.

| Variável | Para quê |
|---|---|
| `OPENAI_API_KEY` | chave da OpenAI (`sk-proj-…`) |
| `ANTHROPIC_API_KEY` | chave da Anthropic |
| `IA_PROVEDOR` | `openai` ou `anthropic`, para forçar um |
| `OPENAI_MODEL` | padrão `gpt-4o-mini` |
| `ANTHROPIC_MODEL` | padrão `claude-opus-5` |

Preencha **uma** chave. Com as duas configuradas e sem `IA_PROVEDOR`, vale a
OpenAI. Trocar de modelo não exige mexer no código — só a variável e um
redeploy.

---

## Como funciona

O front chama `POST /api/uglez` com `{ pergunta, resumo }` e recebe
`{ texto, modelo }`. A chave nunca sai do servidor: vai no cabeçalho da
chamada à API do provedor e nada mais.

Três defesas na função, e cada uma existe por um motivo:

- **A pergunta é cortada em 500 caracteres e o resumo em 6.000.** A rota é
  pública e paga por token; sem limite, qualquer um transforma o seu endpoint
  numa conta aberta.
- **O corpo de erro da API nunca é repassado cru.** Em alguns erros ele ecoa
  parte do cabeçalho enviado. Só a mensagem extraída volta ao navegador.
- **Sem chave nenhuma, a resposta é 501** — não é falha, é ausência do
  recurso, e o cliente entende que deve usar o outro caminho.

### O outro caminho, e por que ele existe

O app roda em três lugares: no Vercel, aberto direto do disco (`file://`) e
como arquivo único no iPhone. **Nos dois últimos não existe servidor nenhum.**

Quando `/api/uglez` não responde, o cliente cai para a chave que o próprio
usuário guardou no `localStorage` dele. Essa não é um segredo do produto — é
dele, no aparelho dele, sob a responsabilidade dele.

**Esse caminho local fala com a Anthropic apenas.** Se você configurar só a
OpenAI, o UGLEZ funciona no site publicado e fica indisponível no arquivo
único do iPhone — a menos que o usuário tenha uma chave Anthropic própria
guardada. É uma limitação real, não um bug.

---

## Verificação

Rodado com `fetch` substituído por um espião, sem nenhuma chave real e sem
nenhuma requisição saindo da máquina:

| Cenário | Resultado |
|---|---|
| Só OpenAI configurada | ✅ 200, chama a OpenAI, `gpt-4o-mini` |
| Só Anthropic configurada | ✅ 200, chama a Anthropic, `claude-opus-5` |
| As duas | ✅ OpenAI ganha |
| As duas + `IA_PROVEDOR=anthropic` | ✅ Anthropic ganha |
| `OPENAI_MODEL=gpt-4.1` | ✅ modelo trocado sem tocar no código |
| Nenhuma chave | ✅ 501, nenhuma chamada externa |
| Pergunta vazia / corpo inválido | ✅ 400, nenhuma chamada externa |
| Chave na resposta ao navegador | ✅ **nunca**, em nenhum cenário |
| Chave no corpo enviado à API | ✅ não — só no cabeçalho `authorization` |
| Pergunta de 900 e resumo de 9.000 chars | ✅ cortados em 500 e 6.000 |

---

## Se uma chave vazar

Não tente "tirar do lugar errado". **Revogue e gere outra**, sempre:

- OpenAI → platform.openai.com/api-keys
- Anthropic → console.anthropic.com/settings/keys

Uma chave que passou por chat, print, log ou commit está comprometida mesmo
que pareça não ter sido usada. Rotacionar custa um minuto; descobrir a fatura
depois, não.
