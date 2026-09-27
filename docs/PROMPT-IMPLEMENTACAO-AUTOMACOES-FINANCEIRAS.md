# Prompt de implementação — metas automáticas, categorização e recorrências sugeridas

Você é o desenvolvedor sênior responsável por implementar três automações financeiras no OAZE atual:

1. metas automáticas assistidas;
2. categorização automática com aprendizado confirmado;
3. detecção e sugestão de receitas ou despesas recorrentes, relacionando descrições diferentes do mesmo estabelecimento ou pagador.

Trabalhe no repositório `C:\Users\santtoro\Downloads\sites\OAZE\o site`.

No início da tarefa, confirme branch, `HEAD`, `git status --short --branch` e mudanças locais. A referência observada ao escrever este prompt foi `main`, commit `9f935ac`, mas o estado real no momento da execução vence este documento. Preserve qualquer trabalho existente do usuário. Não faça commit, push, deploy ou alteração remota sem autorização explícita.

## Resultado esperado

Entregar uma implementação local completa e integrada ao produto existente. As três automações devem funcionar sem Open Finance, usando os lançamentos presentes no OAZE. A arquitetura deve ficar preparada para receber transações importadas no futuro, sem depender agora de Pluggy, Belvo, Klavi ou outro serviço externo.

Automação, nesta etapa, significa **detectar, sugerir, preparar e aprender após confirmação**. Não movimentar dinheiro, não inventar saldo, não confirmar lançamento sozinho e não tratar previsão como valor realizado.

## Antes de editar

Leia integralmente, no mínimo:

- `PRODUCT.md`;
- `README.md`;
- `docs/o-que-falta.md`;
- `app.html`;
- `assets/js/store.js`;
- `assets/js/calc.js`;
- `assets/js/forms.js`;
- `assets/js/app.js`;
- `assets/js/pages/goals.js`;
- `assets/js/pages/recurring.js`;
- `assets/js/pages/transactions.js`;
- `assets/js/pages/calendar.js`;
- `assets/js/pages/settings.js`;
- `assets/js/limites.js`;
- `assets/js/sync.js`;
- `assets/js/estado-sync.js`;
- `assets/js/repo.js`;
- `assets/js/dados.js`;
- esquema e migrações atuais em `supabase/migrations`;
- testes e scripts disponíveis em `tools`.

Mapeie antes de implementar:

- formato atual de `transactions`, `goals`, categorias, contas, cartões e perfis;
- como `Store.commit()` aciona persistência e sincronização;
- como o app normaliza dados antigos;
- como os limites dos planos são aplicados;
- como as strings PT geram EN, ES e FR;
- quais partes ainda usam o documento JSON e quais usam tabelas normalizadas.

Não crie uma terceira fonte da verdade. Se a fonte dupla existente impedir uma solução segura, resolva ou isole o problema antes de ligar as automações e documente o limite com clareza.

## Regras contábeis que não podem quebrar

- Só ocorrências confirmadas entram nos totais realizados.
- Despesa no cartão conta na data da compra.
- Pagamento de fatura não é uma nova despesa.
- Guardar dinheiro numa meta não é despesa; é mudança de lugar do dinheiro.
- Um aporte com `accountId` reduz o saldo daquela conta e continua compondo o patrimônio como reserva.
- Transferência entre contas próprias não é receita nem despesa.
- Parcelas não são assinaturas.
- Previsão, sugestão e rascunho nunca alteram saldo.
- Toda escrita financeira deve ser reversível e atribuível à sua origem.

## 1. Metas automáticas assistidas

O modelo atual já possui `target`, `saved`, `deadline`, `accountId`, `contribution` e `deposits`. Preserve compatibilidade com esses campos e com backups antigos.

### Implementar

- Calcular o ritmo necessário: valor restante dividido pelos meses até o prazo.
- Calcular uma sugestão sustentável usando somente dados determinísticos do OAZE:
  - receitas confirmadas recentes;
  - despesas confirmadas;
  - despesas fixas e faturas previstas;
  - orçamentos;
  - outros aportes planejados;
  - saldo da conta de origem;
  - piso de segurança configurável.
- Mostrar separadamente:
  - `ritmo necessário`;
  - `valor planejado pelo usuário`;
  - `valor sugerido pela Coco`;
  - motivo da sugestão;
  - impacto previsto no mês.
- Permitir ativar uma regra mensal em modo assistido:
  - valor fixo;
  - dia do mês;
  - conta de origem opcional;
  - piso mínimo de saldo;
  - estado ativo/pausado.
- No vencimento, gerar uma proposta única para aquele mês. Não executar `Store.goals.deposit()` até confirmação explícita.
- Ao confirmar, usar a operação contábil existente de depósito e registrar origem, data e identificador idempotente da proposta.
- Não gerar novamente uma proposta já confirmada, rejeitada ou dispensada naquele mês.
- Permitir pausar, retomar e encerrar a automação sem apagar depósitos anteriores.
- Pausar automaticamente a sugestão quando o saldo projetado após compromissos ficar abaixo do piso definido, explicando o motivo.

### Não implementar agora

- transferência bancária real;
- arredondamento real de compras;
- débito automático;
- iniciação de pagamento;
- aumento automático do valor guardado sem confirmação.

## 2. Categorização automática

Crie um motor local, determinístico e explicável. Não use chamada de IA como dependência básica.

### Normalização de estabelecimento ou pagador

Criar uma função pura e testável que:

- converta para minúsculas e remova acentos;
- normalize espaços e pontuação;
- remova ruído bancário conhecido, datas, NSU, identificadores longos, terminações de cartão e prefixos como `pix`, `compra`, `debito`, `credito`, `pagamento` e `transferencia`, sem apagar o nome útil;
- preserve descrição original para exibição;
- produza uma chave estável `merchantKey`;
- relacione aliases como `NETFLIX.COM`, `NETFLIX BRASIL` e `NETFLIX ENTRETENIMENTO` sem usar apenas igualdade exata.

Não aplique similaridade solta que una estabelecimentos diferentes. Nomes muito curtos, genéricos ou compostos apenas por números devem permanecer sem vínculo automático.

### Ordem de decisão

1. regra explícita confirmada pelo usuário naquele workspace;
2. alias confirmado do estabelecimento/pagador;
3. histórico consistente do próprio usuário;
4. regras determinísticas curadas;
5. sugestão de baixa confiança;
6. sem categoria quando não houver evidência suficiente.

### Confiança e comportamento

- alta confiança: pode preencher automaticamente o campo, mas deve mostrar a origem da decisão e permitir desfazer;
- média confiança: apenas sugerir;
- baixa confiança: não selecionar categoria;
- nunca esconder que a categoria foi inferida;
- a correção do usuário pode oferecer `Aplicar também aos lançamentos parecidos`;
- só criar regra permanente após confirmação explícita;
- regra pessoal/workspace deve vencer regra global;
- não reclassificar todo o histórico silenciosamente.

Adote limiares iniciais documentados e centralizados, não números mágicos espalhados. Se usar pontuação, retorne também evidências legíveis, por exemplo: `mesmo estabelecimento em 8 lançamentos; 7 foram Mercado`.

### Integração

- Sugerir categoria durante criação e edição de lançamento quando a descrição mudar.
- Oferecer revisão das transações sem categoria já existentes.
- Guardar origem da classificação, confiança e chave do estabelecimento sem quebrar backups antigos.
- Preparar campos para futuras transações com `source = 'import'`, mantendo `manual` como padrão atual.

## 3. Detecção e sugestão de recorrências

O modelo atual representa recorrência como um lançamento com `recurring = true`; `Calc.entries()` expande ocorrências virtuais por mês e `occ['YYYY-MM']` guarda confirmação ou salto.

Não crie uma coleção paralela de recorrências confirmadas que dispute com `transactions`.

### Detecção

Analisar lançamentos históricos não recorrentes e agrupar candidatos por:

- `merchantKey` e aliases;
- `kind` (`income` ou `expense`);
- categoria provável;
- conta/cartão quando essa distinção for relevante;
- periodicidade;
- faixa de valor.

Detectar inicialmente:

- semanal, aproximadamente 7 dias;
- quinzenal, aproximadamente 14 ou 15 dias;
- mensal, aproximadamente 27 a 33 dias ou dia útil equivalente;
- bimestral;
- trimestral;
- anual;
- salário ou renda recorrente com valor variável dentro de tolerância;
- conta recorrente variável, como energia ou telefone.

Usar mediana para valor esperado. Centralizar tolerâncias e exigir evidência mínima. Como base conservadora, pedir três ocorrências; aceitar duas apenas quando houver evidência muito forte e marcar confiança menor.

### Exclusões obrigatórias

- `kind === 'transfer'`;
- transações com `installment`;
- pagamento de fatura;
- estorno ou reembolso pareado;
- lançamentos já recorrentes;
- ocorrências geradas por uma recorrência existente;
- grupos sem nome útil;
- compras frequentes sem periodicidade estável.

### Sugestão

Cada candidato deve mostrar:

- nome canônico sugerido;
- receita ou despesa;
- ocorrências que sustentam a conclusão;
- periodicidade;
- mediana e faixa dos valores;
- próxima data como janela, não certeza;
- confiança;
- motivo legível.

Ações:

- `Criar recorrência`;
- `Não é recorrente`;
- `Não sugerir de novo para este padrão`;
- `Revisar ocorrências`.

### Confirmação sem duplicar o histórico

Não converta retroativamente um dos lançamentos antigos em molde recorrente e não apague os demais.

Ao confirmar:

- preserve integralmente todos os lançamentos históricos;
- crie um novo lançamento recorrente começando na **próxima ocorrência prevista**;
- deixe a primeira ocorrência futura como prevista, não confirmada;
- use a categoria, método e origem escolhidos na revisão;
- grave metadados que apontem para os lançamentos usados como evidência;
- marque o candidato como aceito para impedir nova sugestão;
- respeite o limite `recurring_items` do plano antes de criar.

Se a periodicidade detectada ainda não puder ser representada pelo modelo mensal atual, não finja suporte. Preserve o candidato como sugestão informativa ou amplie o modelo de recorrência de maneira compatível, com testes de migração. Não force semanal, quinzenal, trimestral ou anual para `recurring=true` mensal.

## Interface

Integrar as três automações na linguagem visual atual do OAZE. Não criar dashboard separado ou demonstração solta.

Sugestão de encaixe:

- Metas: bloco `Automação da meta` dentro do cartão/modal existente.
- Recorrências: aba ou seção `Sugestões encontradas` na página existente.
- Categorias: sugestão inline no formulário e caixa de revisão na página de Categorias ou Financeiro.
- Início/Coco: no máximo um resumo acionável quando houver pendência real.

Estados vazios, carregamento, erro, confirmação, rejeição e desfazer são parte da entrega. Funcionar com teclado, leitor de tela e toque. Não depender só de cor para confiança ou status.

Todas as novas strings de produto devem entrar na fonte de i18n e ser geradas para PT, EN, ES e FR conforme o fluxo atual. Não editar traduções geradas de forma divergente.

## Persistência e sincronização

- Evoluir `Store.normalizeTx()` e a normalização de metas de forma compatível com dados antigos.
- Qualquer nova coleção local precisa entrar em backup, restauração, sincronização, merge e remoções.
- Para usuários autenticados, criar migração SQL correspondente e políticas RLS por `workspace_id`.
- Resolver permissões no servidor; não confiar em `workspace_id` enviado pelo cliente sem validar associação.
- Índices devem acompanhar consultas reais do detector.
- Não expor service role no navegador.
- Propostas e sugestões precisam de chave idempotente estável.
- Exclusão de regra ou sugestão não deve apagar lançamentos financeiros.

## Organização sugerida do código

Prefira módulos pequenos e testáveis, por exemplo:

- `assets/js/automacoes/normalizar-estabelecimento.js`;
- `assets/js/automacoes/categorizar.js`;
- `assets/js/automacoes/detectar-recorrencias.js`;
- `assets/js/automacoes/metas-automaticas.js`.

Adapte ao padrão real encontrado no projeto. Não introduza framework, bundler ou dependência pesada só para essas funções. Funções de detecção devem receber dados e devolver resultados sem tocar no DOM; a interface consome o resultado separadamente.

## Testes obrigatórios

Adicionar testes automatizados com dados sintéticos, cobrindo no mínimo:

### Normalização e aliases

- `NETFLIX.COM`, `Netflix Brasil` e variações esperadas;
- nomes parecidos que não podem ser unidos;
- Pix com ruído, data e identificador;
- descrição vazia ou genérica;
- acentos e pontuação.

### Categorização

- regra confirmada vence heurística;
- correção não muda histórico sem autorização;
- confiança alta, média e baixa;
- isolamento entre workspaces;
- transação sem categoria permanece válida.

### Recorrências

- três cobranças mensais estáveis;
- conta mensal com valor variável;
- salário mensal;
- compra parcelada rejeitada;
- corridas frequentes sem ciclo rejeitadas;
- transferência própria rejeitada;
- mesma descrição com receita e despesa separadas;
- confirmação cria somente a próxima ocorrência, sem duplicar passado;
- candidato ignorado não reaparece;
- idempotência ao rodar detector várias vezes.

### Metas

- ritmo necessário;
- sugestão limitada pelo saldo e piso;
- mês já processado não duplica proposta;
- proposta não altera saldo;
- confirmação cria depósito uma vez;
- depósito com conta reduz caixa e não reduz patrimônio;
- pausa automática por falta de espaço;
- encerramento preserva histórico.

Executar também os testes existentes relacionados a lançamentos, faturas, metas, sincronização, migração e limites.

## Validação final

Antes de declarar conclusão:

1. executar `node tools/gen-idiomas.js --conferir`;
2. executar os testes novos e existentes relevantes;
3. executar `node tools/verificar-tudo.js` se o ambiente estiver configurado;
4. executar `git diff --check`;
5. revisar `git diff` procurando duplicidade contábil, perda de dados e strings sem tradução;
6. validar manualmente no navegador:
   - desktop e celular;
   - criação e edição de lançamento;
   - sugestão e correção de categoria;
   - aceitação e rejeição de recorrência;
   - proposta e confirmação de aporte;
   - backup/restauração;
   - troca de espaço financeiro;
   - sessão autenticada e modo local.

Não afirmar que sincronização, RLS ou comportamento autenticado funcionam sem teste real correspondente. Separar no relatório final:

- implementado;
- validado localmente;
- validado com Supabase autenticado;
- pendente;
- riscos conhecidos.

## Entrega

Ao terminar, informar:

- arquivos alterados e motivo;
- decisões do modelo de dados;
- como a normalização relaciona nomes;
- limiares e evidências usados;
- como duplicidade foi impedida;
- como metas continuam contabilmente corretas;
- testes executados e resultados;
- o que não foi possível validar;
- próximos passos recomendados.

Não faça commit, push ou deploy.
