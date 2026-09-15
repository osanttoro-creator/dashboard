# Base jurídica e operacional para futuros produtos SaaS

Esta base serve como roteiro para novos projetos. Não é contrato pronto e não deve ser copiada sem adaptar produto, público, fornecedores, dados, riscos e capacidade operacional.

## Princípios que não mudam de projeto para projeto

- descrever o funcionamento real; contrato não corrige arquitetura inexistente;
- definir controlador e operador por operação;
- coletar o mínimo necessário e atribuir finalidade e base legal a cada dado;
- separar tratamento necessário de consentimento opcional;
- não transferir ao consumidor toda a responsabilidade por fornecedor escolhido pelo produto;
- tornar exclusão, exportação, cancelamento e contato tão acessíveis quanto cadastro e compra;
- incluir acessibilidade desde o desenho e medir contra WCAG 2.2 AA;
- versionar documentos e guardar prova de aceite no servidor;
- prometer SLA, backup e prazo de resposta somente quando houver monitoramento e equipe para cumprir.

## Conjunto documental mínimo

1. Termos de uso e condições comerciais.
2. Política de privacidade.
3. Política de cookies e preferências.
4. Aviso resumido no momento da coleta.
5. Anexo de tratamento de dados para clientes empresariais, quando eles controlarem dados de terceiros.
6. Lista pública de fornecedores e subprocessadores.
7. Política de acessibilidade e canal para barreiras.
8. SLA para planos que tenham garantia de disponibilidade.
9. Política de uso aceitável e de upload.
10. Procedimento interno de direitos do titular, exclusão e incidente.

## Perguntas que devem ser respondidas antes da redação

- Quem contrata: consumidor, empresa ou ambos?
- Quem é titular dos dados e quem decide cada finalidade?
- Quais bancos, arquivos, caches, logs e backups existem?
- Quais dados entram, de onde vêm, para onde vão e por quanto tempo ficam?
- Quais fornecedores recebem dados, em quais países e sob qual mecanismo de transferência?
- O produto usa IA, perfil, recomendação ou decisão automatizada?
- Há dados financeiros, de menores, biometria, saúde ou outra categoria de alto risco?
- O usuário pode exportar e excluir sem falar com suporte?
- Quais promessas de disponibilidade, recuperação e atendimento são mensuráveis?
- Todos os fluxos essenciais funcionam por teclado, leitor de tela, zoom e redução de movimento?

## Estrutura de cláusulas

### Partes, objeto e limites

Identificar fornecedor, contato, produto, público, requisitos de idade, recursos incluídos e aquilo que o serviço não faz. Em produtos financeiros, deixar claro quando não há movimentação de dinheiro, custódia ou aconselhamento.

### Conta e segurança compartilhada

Explicar autenticação, recuperação, sessões, deveres do usuário e deveres do produto. Culpa do usuário depende de prova e causalidade; phishing ou erro não eliminam automaticamente a obrigação de segurança do fornecedor.

### Planos, cobrança e cancelamento

Mostrar preço total, periodicidade, renovação, limites, tributos, arrependimento, reembolso, falha de pagamento e efeito do cancelamento. O resumo deve aparecer antes da compra e o contrato precisa ser armazenável.

### SLA e continuidade

Definir indicador, escopo, janela de medição, percentual, indisponibilidade permitida, manutenção, exclusões razoáveis, monitoramento, créditos, suporte, severidade, RPO e RTO. Excluir um evento do cálculo não pode eliminar direitos legais.

### Dados e privacidade

Manter tabela com dado, origem, finalidade, base legal, destinatário, país, retenção e medida de segurança. Informar direitos, canal, prazo, encarregado, transferências e mudanças de finalidade.

### Cookies

Inventariar cookies e tecnologias equivalentes. Deixar opcionais desligados antes da escolha e oferecer aceitar, recusar e configurar com destaque equivalente. Cookies necessários devem ser explicados; consentimento deve ser reversível.

### IA e decisões automatizadas

Informar entradas, saídas, fornecedor, retenção, treinamento, revisão humana, limitações e risco de erro. Se decisão exclusivamente automatizada afetar interesses, oferecer explicação e revisão conforme a LGPD.

### Upload e conteúdo do usuário

Definir formatos, tamanho, finalidade, processamento, retenção, licença técnica mínima, proibições, detecção de conteúdo malicioso e retirada. Não usar uma cláusula ampla para afastar falhas de segurança do produto.

### Incidentes e responsabilidade

Separar causa atribuível ao produto, operador, controlador independente, usuário e terceiro. Prever contenção, investigação, cooperação, comunicação legal, preservação de registro e direito de regresso, sem afastar CDC ou LGPD.

### Exclusão e portabilidade

Explicar etapas, prazo do banco ativo, resíduos em backup, registros legais, formato da exportação e o que ocorre se um backup for restaurado. Dados retidos para obrigação legal não podem ser reutilizados para outra finalidade.

### Acessibilidade

Adotar WCAG 2.2 AA como meta verificável, cobrir todos os estados responsivos e fluxos essenciais, oferecer formatos acessíveis e alternativa equivalente sem custo. Publicar canal, prazo de resposta e histórico de melhorias. Só declarar conformidade depois de auditoria.

### Alterações, suspensão e disputa

Definir aviso prévio, novo aceite quando necessário, direito de exportar, motivo de suspensão, contestação, lei aplicável e foro. Evitar arbitragem compulsória, cancelamento unilateral desequilibrado e limitação ampla de responsabilidade em relação de consumo.

## Controles internos que sustentam o contrato

- Registro das Operações de Tratamento e avaliações de legítimo interesse;
- Relatório de Impacto para fluxos de maior risco;
- gestão de fornecedores, subprocessadores e transferências internacionais;
- inventário de cookies automatizado e revisão antes de releases;
- monitoramento de SLA e página de status;
- plano de resposta a incidentes e simulações periódicas;
- backups com restauração testada e fila de exclusões reaplicável;
- auditoria de acessibilidade automatizada e manual com pessoas com deficiência;
- revisão jurídica, de segurança e de produto antes de cada mudança material.

## Marcadores recomendados durante a elaboração

- `CONFIRMADO`: existe e foi verificado no produto ou contrato do fornecedor.
- `EM DEFINIÇÃO`: depende de decisão comercial, jurídica ou técnica.
- `INFERIDO`: hipótese que ainda precisa de evidência.
- `DESCARTADO`: opção rejeitada, com motivo.
- `HISTÓRICO`: regra anterior mantida apenas para rastreabilidade.

## Fontes-base brasileiras

Use sempre a versão vigente da LGPD, CDC, Marco Civil da Internet, Decreto do Comércio Eletrônico, Lei Brasileira de Inclusão, regulamentos e guias da ANPD e WCAG. Leis, fornecedores e arquitetura mudam; toda reutilização exige nova verificação.
