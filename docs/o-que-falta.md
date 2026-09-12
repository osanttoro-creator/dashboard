# O que falta para lançar

Levantado em 12/09/2026, depois da limpeza que tirou o Mercado Pago, o Firebase
e o build de arquivo único. Cada item abaixo foi **verificado**, não suposto: o
que veio de leitura do banco, do log ou do site no ar está marcado como tal.

---

## O que já está de pé

| | estado |
|---|---|
| Site público (landing, preços, recursos, suporte, legais) | no ar |
| Entrar e criar conta com e-mail, senha e link mágico | funcionando |
| Entrar com o Google, botão e "num toque" | funcionando, conferido no ar |
| Sessão compartilhada entre site e aplicativo | mesma gaveta, renovação automática |
| Aplicativo completo sem conta, isolado no aparelho | funcionando |
| Isolamento entre contas (RLS) | conferido: as quatro políticas presas a `auth.uid()` |
| Sugestões com IA pela Edge Function | `oaze-assistant` ativa; a chave nunca vem ao navegador |
| Cancelar assinatura | `oaze-assinatura` ativa |
| Excluir conta | `oaze-conta` ativa |
| 12 verificações automáticas | passam |

---

## Bloqueios — nada disso pode ir ao ar sem resolver

### 1 · Não existe pagamento

A integração com o Mercado Pago foi removida a pedido. O Asaas entra no lugar, e
é obra nova:

- uma Edge Function de checkout que leia o preço de `plan_prices` **no servidor**
  e nunca aceite valor vindo do navegador;
- um webhook **assinado**, que é a única coisa que libera plano — a tela de
  "compra concluída" não libera nada;
- os segredos por `supabase secrets set`, nunca no repositório;
- os identificadores de preço criados no painel do Asaas.

Hoje o botão de assinar abre um aviso dizendo que a assinatura está indisponível.
É feio e é honesto. Uma tela de "pagamento aprovado" sem pagamento é a mentira
mais cara que um produto financeiro pode contar.

As tabelas `plans`, `plan_prices`, `plan_entitlements`, `subscriptions` e
`checkout_intencoes` continuam no banco e são agnósticas de provedor — o Asaas
pode reusá-las. A migração `20260908_checkout.sql` **não foi apagada** de
propósito: ela já foi aplicada, e apagar o arquivo desalinharia repositório e
banco sem remover tabela nenhuma.

### 2 · Duas funções do Mercado Pago continuam ATIVAS no Supabase

Verificado pela API do projeto: `oaze-checkout` e `oaze-mp-webhook` estão
`ACTIVE`, mesmo com o código-fonte apagado daqui. O webhook tem
**`verify_jwt: false`** — é um endereço público, sem autenticação, esperando
notificação de um provedor que não é mais usado.

**Apague as duas no painel do Supabase** (Edge Functions → cada uma → Delete),
ou por `supabase functions delete`. Endpoint público órfão é superfície de ataque
sem dono.

### 3 · A sincronização entre aparelhos não funciona sozinha

Este é o pior, porque a página de entrar promete "seus dados sincronizados em
qualquer aparelho" — e a promessa não se cumpre sem um passo manual escondido.

O app tem **duas fontes da verdade ao mesmo tempo**:

- o documento `dados` (jsonb), que `sync.js` grava e lê;
- o esquema normalizado (`workspaces`, `accounts`, `transactions`…), que
  `repo.js`/`dados.js` lê — e que está com **zero linhas**.

A ponte é uma migração manual em **Configurações → "Dados antigos deste
navegador" → "Trazer para a conta"**, que só aparece no aparelho que tem os dados
antigos. Enquanto ela não roda numa conta, metade do app lê um lugar vazio.

**Decidir qual é a fonte da verdade é trabalho de verdade, não remendo.** Ou a
migração passa a rodar sozinha na primeira entrada, ou o carregador normalizado
passa a ler o documento como fallback, ou o documento morre. Três caminhos, um
tem que ser escolhido antes de lançar.

### 4 · Aparelho novo fica no próprio perfil vazio

`mergeProfiles`, em `sync.js`, adiciona os perfis que vêm da nuvem, mas só troca
o perfil **ativo** se o ativo tiver sumido da lista:

```js
if (!st.profiles.some((p) => p.id === st.activeProfileId) && st.profiles.length) {
  st.activeProfileId = st.profiles[0].id;
}
```

O aparelho novo cria o próprio perfil vazio ao abrir, e esse perfil existe na
lista. Resultado: os dados da conta chegam, entram na lista, e a pessoa continua
olhando para a tela vazia do perfil que o aparelho acabou de criar. Parece perda
de dados e não é.

### 5 · Os dados do aparelho são adotados em silêncio

Ao entrar, o que estava no `localStorage` sobe para a conta sem perguntar. Para
um produto pessoal, adotar quase sempre é o certo — você testa, gosta, cria conta
e não quer perder o que fez.

O problema é o silêncio, e o caso ruim não é o seu: **num navegador
compartilhado**, quem entrar depois absorve o que a pessoa anterior deixou no
aparelho. Não fura o isolamento do banco — entra pela porta da frente.

Falta perguntar: "achei dados neste aparelho, quer trazer para a conta?".

### 6 · Os documentos legais não nomeiam o processador

Termos, política de privacidade e a página de preços dizem "provedor externo de
pagamentos". Foi proposital: nomear o Asaas antes de ele processar qualquer coisa
seria declaração falsa em documento legal.

**No dia em que o Asaas entrar, nomeá-lo nos três é obrigatório** — a LGPD exige
que o titular saiba quem são os operadores que tratam os dados dele.

---

## Importantes, mas não impedem o lançamento

**Domínio próprio.** A tela de consentimento do Google mostra "Prosseguir para
`gxwatircdhhetvzzlwwq.supabase.co`" — um endereço críptico no momento exato em
que a pessoa decide se confia. Para aparecer "OAZE" ali, o Google exige domínio
autorizado e verificado, e `hostingersite.com` não é seu.

**Entrar com a Apple.** O botão está pronto e escondido; aparece sozinho no dia
em que o provedor for ligado. Exige o Apple Developer Program, US$ 99 por ano.

**Realtime chamado quatro vezes.** Nos logs, `observar()` dispara quatro leituras
idênticas em 80 ms. É a raiz do erro `cannot add postgres_changes callbacks after
subscribe()`: o canal é pedido pelo mesmo nome várias vezes e o SDK devolve o
mesmo objeto.

**Proteção contra senha vazada desligada.** O auditor do Supabase aponta; ligar é
um clique em Authentication → Policies.

**Limites de plano não alcançam os perfis antigos.** A conta de teste tem quatro
perfis no documento `dados`, e o plano Grátis prevê um. Os limites valem sobre
`workspaces`, que está vazia — some junto com o item 3.

**`robots.txt` interceptado pela Hostinger.** O arquivo do projeto existe em
disco mas nunca é servido no subdomínio de visualização.

**Nenhuma medição.** Não há analytics nem eventos. Lançar sem saber quantas
pessoas chegam em `/entrar` e quantas concluem é lançar às cegas.

---

## Dívida conhecida, aceita por ora

**A primeira visita espera o Supabase.** `/auth/v1/settings` leva de 1,7 a 3,8
segundos, e é ele que decide se o botão do Google aparece. A resposta fica
lembrada em `localStorage`, então da segunda visita em diante o botão chega junto
com o DOM (medido: 228 a 710 ms). Na primeira, a espera continua.

**O `financas.html` foi removido.** Era o app inteiro colado num arquivo só, para
abrir pelo app Arquivos no iPhone. Está no histórico do git. Quem dependia dele
agora usa o app hospedado, com conta.

---

## A ordem curta

1. Apagar `oaze-checkout` e `oaze-mp-webhook` do Supabase (cinco minutos, e fecha
   um endereço público órfão).
2. Escolher a fonte da verdade e fazer a sincronização funcionar sem passo
   manual. É o que decide se o produto cumpre o que a tela de entrar promete.
3. Consertar o perfil ativo e a adoção silenciosa — os dois são pequenos e os
   dois parecem perda de dados para quem usa.
4. Implementar o Asaas: checkout no servidor, webhook assinado, segredos.
5. Nomear o Asaas nos termos, na privacidade e na página de preços.
6. Domínio próprio, e então a marca na tela do Google.
7. Medição, antes de gastar com divulgação.
