# A IA do UGLEZ — onde a chave mora

Regra única, e ela não tem exceção: **chave de IA é secreta e vive só no
servidor**. Nenhuma delas pode aparecer em `assets/`, em `index.html`, no
`financas.html` ou em qualquer arquivo que o navegador baixe.

Uma chave `sk-proj-…` exposta é a sua conta sendo gasta por outra pessoa. Ao
contrário da chave publicável do Supabase — que é pública por design e
protegida pelo RLS — aqui não existe nada atrás dela. Quem tem a chave, gasta.

---

## Como configurar

Painel do Supabase → *Edge Functions* → *Secrets*. É o único lugar: não há
camada de servidor neste repositório, e por isso não há `.env` de produção.

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

O front chama a Edge Function `oaze-assistant` do Supabase, com a sessão do
usuário no cabeçalho `Authorization`. A chave da OpenAI nunca sai do servidor:
vai no cabeçalho da chamada ao provedor e nada mais.

Quatro defesas na função, e cada uma existe por um motivo:

- **A rota exige sessão.** Ao contrário de um endpoint público, aqui cada
  chamada tem dono — é o que torna possível cobrar cota de alguém.
- **A pergunta é cortada em 500 caracteres, e o contexto em 4.000 (plano
  grátis) ou 8.000.** Token custa; sem limite, uma chamada vira uma conta
  aberta.
- **O que chega ao modelo depende do plano.** O mapa `PERFIL` decide quantas
  categorias, quantos meses de histórico e quantos tokens de resposta. Não é
  só preço: é menos dado saindo do banco para quem pediu menos.
- **A cota é reservada antes da chamada e estornada em qualquer erro.** A
  reserva é um `INSERT … ON CONFLICT DO UPDATE … WHERE usado < limite`: duas
  abas simultâneas não conseguem gastar a mesma última pergunta.

O corpo de erro do provedor **nunca é repassado cru** — em alguns erros ele
ecoa parte do cabeçalho enviado. O navegador recebe só um código curto
(`limite`, `provedor`, `contexto_grande`…), uma frase pronta e o `request_id`
para casar com o log.

### O outro caminho, e por que ele existe

O app roda em três lugares: publicado na Hostinger, aberto direto do disco
(`file://`) e como arquivo único no iPhone. **Nos dois últimos não existe
servidor nenhum, e não há sessão do Supabase.**

Quando a Edge Function não responde, o cliente cai para a chave que o próprio
usuário guardou no `localStorage` dele. Essa não é um segredo do produto — é
dele, no aparelho dele, sob a responsabilidade dele.

**Esse caminho local fala com a Anthropic apenas.** Ou seja, no arquivo único
do iPhone o UGLEZ só conversa se o usuário tiver uma chave Anthropic própria
guardada. É uma limitação real, não um bug.

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
