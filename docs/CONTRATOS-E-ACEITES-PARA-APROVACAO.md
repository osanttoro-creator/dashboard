# Contratos e aceites — minuta para aprovação

Versão de trabalho: 15 de setembro de 2026.

O responsável pelo OAZE autorizou em 15 de setembro de 2026 a publicação destas cláusulas como minuta. A redação pública deve manter o aviso de revisão jurídica até análise por advogado com experiência em consumidor, tecnologia e LGPD. Os aceites obrigatórios no cadastro continuam pendentes de implementação no servidor.

## Correção sobre os papéis na LGPD

No uso pessoal do OAZE, o usuário é o titular dos dados. O OAZE decide por que e como os dados de cadastro, uso, assinatura e organização financeira são tratados; por isso, tende a ser o controlador dessas operações.

O usuário só será controlador quando usar o produto em nome de uma organização e decidir o tratamento de dados pessoais de outras pessoas. Esse cenário exige contrato B2B e anexo de tratamento próprios. Não deve ser misturado aos termos de consumo atuais.

Supabase, Hostinger e OpenAI podem atuar como operadores ou suboperadores em determinados fluxos. Stripe e provedores de identidade podem atuar também como controladores independentes para fraude, segurança, cumprimento legal e gestão das próprias contas. O papel deve ser descrito por operação, não por um rótulo único.

## Informações que precisam ser preenchidas

- razão social, CNPJ e endereço do responsável pelo OAZE;
- nome ou canal público do encarregado pelo tratamento de dados;
- região e política real de backup do projeto Supabase;
- países em que cada fornecedor pode tratar dados;
- prazos contratuais de retenção de Stripe, OpenAI, Hostinger e Supabase;
- capacidade operacional de cumprir o SLA proposto abaixo;
- canal e equipe responsáveis por incidentes de segurança e acessibilidade.

## Aceites no cadastro

Os aceites devem ser separados, desmarcados por padrão e registrados no servidor:

1. "Li e aceito os Termos de uso do OAZE."
2. "Li a Política de privacidade e entendi como meus dados pessoais serão tratados para criar e manter minha conta."
3. "Declaro que tenho direito de usar os arquivos que importar e que não enviarei dados de terceiros sem autorização ou outra base legal válida."

O aceite da Política de privacidade não transforma todo tratamento em consentimento. Conta, sincronização, segurança e cobrança podem usar outras bases legais, como execução do contrato e cumprimento de obrigação legal. Consentimentos opcionais, quando existirem, devem ficar separados.

O servidor deve guardar o usuário, documento, versão, data e hora do servidor, origem do fluxo e os dados técnicos mínimos para comprovar a manifestação. O navegador não pode escolher a versão nem reescrever um aceite anterior. Mudança material exige novo aceite, preservando o histórico.

O bloqueio deve existir no servidor e também alcançar cadastro por e-mail, Google ou Apple. Um atributo `required` no HTML não é controle suficiente.

## Cláusula proposta de nível de serviço

### Disponibilidade

Para os planos pagos, o OAZE assume meta de disponibilidade mensal de 99,5% para as funções centrais: autenticação, leitura, criação e sincronização de registros financeiros. Em um mês de 30 dias, essa meta admite até 3 horas e 36 minutos de indisponibilidade contabilizada.

O plano gratuito é oferecido por melhor esforço, sem crédito de serviço, mas mantém os direitos legais do consumidor, as obrigações de segurança, privacidade e acessibilidade e o direito de exportar dados quando o serviço estiver disponível.

### Como medir

Disponibilidade mensal = minutos disponíveis divididos pelos minutos totais do mês, multiplicados por 100. A medição deve ser feita por monitoramento do lado do servidor e mantida por pelo menos 12 meses.

Não entram no cálculo:

- manutenção programada avisada com 48 horas de antecedência, limitada a 4 horas por mês;
- indisponibilidade causada apenas pelo aparelho, navegador, conexão ou configuração do usuário;
- força maior comprovada;
- falha externa que esteja fora do controle razoável do OAZE, desde que o OAZE tenha escolhido, contratado e acompanhado o fornecedor com diligência e atue para restaurar o serviço.

Essas exclusões servem somente para calcular o SLA. Elas não eliminam responsabilidade prevista em lei nem permitem transferir ao consumidor o risco de fornecedor escolhido pelo OAZE.

### Créditos de serviço propostos

- disponibilidade abaixo de 99,5% e igual ou superior a 99,0%: crédito de 10% da mensalidade afetada;
- abaixo de 99,0% e igual ou superior a 98,0%: crédito de 25%;
- abaixo de 98,0%: crédito de 50%.

O pedido poderá ser feito em até 30 dias após o mês afetado. O crédito não substitui reembolso, abatimento, reparação ou outro direito previsto em lei. Os percentuais precisam de aprovação comercial e validação da capacidade de monitoramento antes da publicação.

### Suporte e incidentes operacionais

Incidente crítico é aquele que impede a maioria dos usuários de entrar, consultar ou salvar dados, ou que ameaça perda, corrupção ou exposição de dados. A meta inicial é acusar recebimento em até 2 horas, publicar atualização a cada 4 horas enquanto o incidente crítico continuar e apresentar relatório final em até 10 dias úteis após a estabilização. O prazo de solução depende da causa e não deve ser prometido sem capacidade técnica para cumpri-lo.

## Cláusula de segurança, perda e vazamento

O OAZE deve adotar medidas técnicas e administrativas proporcionais ao risco, incluindo controle de acesso, menor privilégio, criptografia em trânsito, proteção dos segredos, registro de eventos, cópias de segurança testadas, atualização de dependências, resposta a incidentes e isolamento de dados por conta.

### Quando o OAZE pode responder

O OAZE poderá ser responsável quando o dano decorrer de tratamento em desacordo com a lei, falha de segurança que poderia razoavelmente ter sido evitada, instrução ilícita a um operador, escolha ou fiscalização negligente de fornecedor, demora indevida em conter o incidente ou omissão na comunicação exigida.

Um contrato não pode declarar que "todo vazamento do fornecedor é responsabilidade do fornecedor". Perante o titular, a responsabilidade depende da operação, da causa, das regras da LGPD e, na relação de consumo, do CDC. Depois de reparar o titular, o OAZE poderá exercer direito de regresso contra o fornecedor responsável conforme o contrato entre as empresas.

### Quando o fornecedor pode responder

O operador poderá responder quando descumprir a LGPD ou instruções lícitas do OAZE. Um fornecedor que atua como controlador independente responde pelas decisões próprias de tratamento. O OAZE deve cooperar com investigação, contenção e atendimento ao titular mesmo quando o incidente começar no fornecedor.

### Quando o usuário pode responder

O usuário deve proteger credenciais, ativar controles de segurança disponíveis, encerrar sessões em aparelhos compartilhados e importar somente arquivos que possa usar. Ele poderá responder pelos danos que causar por ação ilícita, fraude, compartilhamento deliberado de credenciais ou culpa exclusiva comprovada.

Erro comum, phishing ou uso indevido da conta não gera automaticamente culpa exclusiva. O OAZE continua obrigado a manter medidas de segurança compatíveis com o risco. Não haverá indenização automática ou obrigação ampla de defender o OAZE contra qualquer reclamação.

### Comunicação de incidente

Ao identificar incidente que possa causar risco ou dano relevante, o OAZE deve conter e investigar o evento, preservar evidências, avaliar os titulares e dados afetados e comunicar a ANPD e os titulares em até 3 dias úteis, salvo prazo legal específico. A comunicação deve explicar, em linguagem clara, natureza dos dados, riscos, medidas adotadas e canal de contato. O registro do incidente deve ser mantido por pelo menos 5 anos, inclusive quando a conclusão for de que a comunicação não era obrigatória.

## Política de tratamento de dados

### Mapa mínimo das bases de dados

| Base ou sistema | Dados | Finalidade | Base legal provável | Destino | Retenção proposta |
| --- | --- | --- | --- | --- | --- |
| Supabase Auth | e-mail, hash de senha, identificadores de sessão e provedor social | criar conta, autenticar e recuperar acesso | execução do contrato; segurança por legítimo interesse | infraestrutura Supabase | enquanto a conta existir; logs conforme obrigação legal |
| PostgreSQL/Supabase | perfil, contas, cartões sem número completo, categorias, lançamentos, metas, orçamentos e investimentos | organizar e sincronizar as finanças informadas pelo usuário | execução do contrato | infraestrutura Supabase | enquanto a conta existir |
| Stripe | e-mail, plano, preço, identificadores de cliente, Checkout, assinatura, fatura, estorno e disputa | contratar, cobrar, cancelar e conciliar assinatura | execução do contrato; obrigação legal | Stripe e seus subprocessadores | conforme obrigações fiscais, antifraude e política do provedor |
| OpenAI via Edge Function | pergunta e resumo financeiro agregado exibido antes do envio | responder à conversa com a UGLEZ | consentimento para o envio opcional; execução da funcionalidade solicitada | OpenAI | `store: false` no OAZE; confirmar retenções técnicas do provedor |
| Hostinger | arquivos públicos do site e registros técnicos do servidor | entregar o site, segurança e diagnóstico | execução do contrato; legítimo interesse | Hostinger e infraestrutura contratada | definir prazo dos logs no contrato de hospedagem |
| Navegador do usuário | sessão, tema, período selecionado, cache e fila offline | manter login, preferências e uso offline | execução do contrato; necessário ao serviço solicitado | aparelho do usuário | até logout, exclusão, limpeza do navegador ou prazo técnico definido |
| Registro de aceites | usuário, documento, versão, data, origem e evidência mínima | provar contratação e consentimentos | obrigação legal; exercício regular de direitos | banco do OAZE | prazo prescricional definido após revisão jurídica |
| Logs de acesso | data, hora e IP, quando o OAZE estiver sujeito ao art. 15 do Marco Civil | segurança e cumprimento legal | obrigação legal | hospedagem ou serviço de logs aprovado | 6 meses, sob sigilo e segurança |
| Registro de incidentes | fato, impacto, decisões, comunicações e correções | cumprir o regulamento da ANPD e melhorar segurança | obrigação legal | repositório interno restrito | pelo menos 5 anos |

O mapa deve ser conferido contra a produção antes de publicar. Nenhuma política deve afirmar que um dado não existe sem verificar logs, backups, painéis dos fornecedores e telemetria do navegador.

### Fornecedores e subprocessadores

A política pública deve manter uma lista atualizada com nome, serviço, finalidade, categorias de dados, país ou região, papel provável na LGPD, link de privacidade e mecanismo de transferência internacional. A lista inicial do OAZE é:

- Supabase: banco PostgreSQL, autenticação, Edge Functions e possíveis backups;
- Hostinger: hospedagem do site e registros técnicos;
- Stripe: Checkout, assinatura, faturamento, reembolso, disputa e prevenção a fraude;
- OpenAI: resposta da UGLEZ quando o usuário escolhe enviar uma pergunta;
- Google: autenticação social e One Tap, somente quando esse método estiver habilitado e escolhido;
- Apple: autenticação social, somente quando estiver habilitada e escolhida;
- jsDelivr: fallback técnico para carregar a biblioteca pública do Supabase se o arquivo local não estiver disponível.

Cloudflare Turnstile, hCaptcha, analytics, monitoramento de erros, SMTP externo e qualquer novo fornecedor só entram na lista depois de contratados e tecnicamente habilitados. A política deve ser atualizada antes de começar o envio de dados.

Transferências internacionais devem indicar o mecanismo válido usado em cada relação, conforme a Resolução CD/ANPD nº 19/2024. Dizer apenas que "o fornecedor é confiável" não basta.

## Exclusão de conta e destino dos dados

Ao pedir exclusão, o usuário deve receber confirmação clara do que será apagado e oportunidade de exportar os dados antes da operação.

Fluxo proposto:

1. cancelar a renovação da assinatura e impedir novas cobranças;
2. revogar sessões e credenciais ativas;
3. apagar ou desvincular os dados financeiros e o perfil do banco ativo em até 24 horas;
4. manter apenas registros exigidos por lei ou necessários para exercício regular de direitos, separados do produto e com acesso restrito;
5. informar que cópias residuais podem permanecer em backups protegidos por até 30 dias, sem uso normal, e serão sobrescritas pelo ciclo de retenção;
6. enviar confirmação de conclusão ao canal verificado do titular.

Os prazos de 24 horas e 30 dias são propostas. Antes de prometer, é preciso confirmar se Supabase, Hostinger, Stripe e o procedimento operacional do OAZE conseguem cumpri-los. Se um backup for restaurado, a fila de exclusões deve ser reaplicada antes de liberar o ambiente.

Registros de acesso sujeitos ao Marco Civil podem permanecer por 6 meses. Registros fiscais, de cobrança, fraude, aceite, defesa em processo e incidentes podem ser conservados pelo prazo legal aplicável. Esses dados não podem voltar a ser usados para marketing, personalização ou reativação da conta.

## Política e banner de cookies

O primeiro nível do banner deve oferecer, com destaque equivalente:

- "Aceitar opcionais";
- "Recusar opcionais";
- "Configurar".

Cookies ou tecnologias opcionais ficam desligados por padrão. A recusa deve impedir analytics, marketing, personalização não necessária e qualquer SDK opcional. A escolha precisa ser reversível em "Privacidade e cookies".

Cookies e armazenamento estritamente necessários podem continuar ativos quando forem indispensáveis à sessão, segurança, preferência solicitada ou funcionamento local. O banner deve explicar nome, fornecedor, finalidade, duração, tipo e base legal de cada item.

Se o usuário não quiser o tratamento necessário para criar e sincronizar uma conta, o OAZE não poderá oferecer essas funções autenticadas. Quando tecnicamente disponível, ele poderá usar o modo local sem conta. Isso deve ser explicado antes da criação da conta; não deve ser escondido dentro do banner de cookies.

O banner atual do site, com apenas "Entendi", não atende a esta especificação caso qualquer tecnologia opcional seja ativada. A implementação deve ser revista junto com o inventário real do navegador.

## Cláusula de acessibilidade

A acessibilidade faz parte do serviço e não depende de plano pago. O OAZE deve buscar conformidade integral com WCAG 2.2 nível AA em todas as páginas, estados responsivos e fluxos essenciais.

Isso inclui navegação completa por teclado, foco visível e não encoberto, nomes e funções compreensíveis por leitores de tela, contraste suficiente, zoom sem perda de conteúdo, texto alternativo útil, mensagens de erro associadas aos campos, autenticação acessível, alvos de toque adequados, redução de movimento, ausência de conteúdo que provoque crises e suporte que não dependa de um único sentido.

Termos, política, faturas, recibos, exportações e comunicações importantes devem ser fornecidos em formato acessível. Quando uma barreira impedir cadastro, pagamento, exportação, cancelamento ou exclusão, o suporte deverá oferecer alternativa equivalente sem custo e sem perda de prazo.

Relatos de barreira poderão ser enviados a `suporte@oaze.site`. A meta proposta é acusar recebimento em 2 dias úteis, oferecer solução alternativa para bloqueio crítico em até 5 dias úteis e informar prazo de correção definitiva. Esses prazos precisam de aprovação operacional.

O OAZE só poderá declarar conformidade WCAG depois de auditoria técnica e testes com pessoas com deficiência. Enquanto isso, a redação deve usar "meta de conformidade", não "site totalmente acessível".

## Outras cláusulas necessárias

### Escopo do produto e ausência de aconselhamento

O OAZE organiza dados informados pelo usuário. Não é banco, instituição de pagamento, contador, consultor financeiro ou consultor de investimentos. A UGLEZ pode errar e não toma decisões financeiras em nome do usuário.

### Decisões automatizadas e IA

Se o OAZE passar a tomar decisão que afete o usuário somente por tratamento automatizado, deverá explicar critérios relevantes e oferecer canal de revisão nos termos do art. 20 da LGPD. Hoje, respostas e alertas da UGLEZ devem ser descritos como apoio informativo, não decisão vinculante.

### Responsabilidade por upload

O usuário declara ter autorização ou outra base legal para o arquivo importado e não deve enviar malware, dados ilícitos ou dados de terceiros sem direito de tratamento. O OAZE deve validar tipo e tamanho, processar localmente quando possível e eliminar cópias temporárias. A cláusula não afasta o dever do OAZE de segurança nem cria responsabilidade automática por todo incidente envolvendo upload.

### Backup, continuidade e recuperação

Os termos devem dizer se existe backup, sua frequência, retenção, RPO e RTO. Enquanto esses números não forem testados, não se deve prometer recuperação garantida. O usuário deve poder exportar cópia em formato aberto.

### Mudanças de fornecedor e suboperador

Mudança que altere finalidade, categoria de dado, país, risco ou papel do agente exige atualização prévia da política e, quando necessário, novo consentimento. Deve haver processo interno para avaliar segurança, privacidade, acessibilidade, transferência internacional e plano de saída do fornecedor.

### Segurança da conta

O usuário deve receber meios para trocar senha, revogar sessões, recuperar acesso e relatar suspeita de fraude. O OAZE não pode responsabilizá-lo por falha que decorra da ausência de controles razoáveis do próprio serviço.

### Propriedade intelectual e licença sobre dados

O software, a marca e o conteúdo editorial pertencem ao OAZE ou a seus licenciantes. Os dados financeiros e arquivos do usuário continuam pertencendo ao usuário. Ele concede somente a licença técnica, limitada e revogável necessária para armazenar, processar, sincronizar, exportar e excluir o conteúdo conforme o serviço solicitado.

### Suspensão e encerramento

Suspensão por abuso deve indicar motivo, alcance, canal de contestação e, quando a segurança permitir, prazo para exportar dados. Ação imediata pode ocorrer diante de fraude, ataque, ordem legal ou risco grave, mas deve ser revisada e comunicada assim que possível.

### Cobrança, cancelamento e arrependimento

Antes da contratação, o OAZE deve apresentar preço total, periodicidade, renovação, limites, forma de cancelamento e cláusulas que limitem direitos. O contrato precisa ser disponibilizado em formato que possa ser guardado. Cancelamento e arrependimento devem usar ferramenta eficaz, com confirmação imediata e respeito ao CDC e ao Decreto nº 7.962/2013.

### Alterações dos documentos

Mudanças materiais devem ser avisadas com antecedência razoável. Nova finalidade incompatível, nova categoria sensível ou redução relevante de direitos pode exigir novo aceite. Versões anteriores precisam permanecer arquivadas para prova e consulta.

### Lei e foro

Aplica-se a lei brasileira. O foro do domicílio do consumidor permanece disponível. Arbitragem não pode ser imposta ao consumidor por contrato de adesão.

## Evidências e documentos internos necessários

- inventário de dados e Registro das Operações de Tratamento;
- avaliação de legítimo interesse para cada uso dessa base;
- Relatório de Impacto para dados financeiros, IA e mudanças de alto risco;
- plano de resposta a incidentes com contatos, níveis de severidade e modelo de comunicação;
- contratos de tratamento e lista de subprocessadores;
- testes de restauração de backup e registro de exclusões;
- relatório de disponibilidade e incidentes do SLA;
- auditoria de acessibilidade WCAG 2.2 AA;
- histórico versionado dos termos, políticas e aceites.

## Fontes oficiais usadas nesta revisão

- LGPD, Lei nº 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
- Guia da ANPD sobre agentes de tratamento: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/anonimizado___guia_de_agente_de_tratamento_e_encarregado_da_anpd_novo.pdf
- Guia da ANPD sobre cookies: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf
- Comunicação de incidentes, Resolução CD/ANPD nº 15/2024: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis
- Transferência internacional, Resolução CD/ANPD nº 19/2024: https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados
- Marco Civil da Internet, Lei nº 12.965/2014: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm
- Código de Defesa do Consumidor, Lei nº 8.078/1990: https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm
- Comércio eletrônico, Decreto nº 7.962/2013: https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm
- Lei Brasileira de Inclusão, Lei nº 13.146/2015: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm
- WCAG 2.2, recomendação W3C: https://www.w3.org/TR/WCAG22/

## Ordem para aprovação

1. preencher a identificação da instituição, encarregado e fornecedores;
2. aprovar ou ajustar SLA, créditos e prazos de suporte;
3. confirmar retenção, backup, exclusão e países com cada fornecedor;
4. auditar cookies e armazenamento reais;
5. validar WCAG 2.2 AA e o canal de acessibilidade;
6. submeter a advogado;
7. só então atualizar as páginas públicas e bloquear o cadastro pelos aceites versionados no servidor.
