# Coco — conversa e voz

Interface OAZE: Night Ocean, Coconut Milk, Mineral Blue e Oasis Teal. Soft Tangerine fica na Coco. Logo e personagem usam os arquivos oficiais do produto.

- Sem navegação lateral na tela da Coco. Dívidas, Planejar, Metas e Análises ficam em quatro blocos acima da mensagem.
- Conversa e voz são modos da mesma tela. Somente mensagens ou gráficos rolam. Trocar de modo preserva o rascunho.
- Microfone exige ação e confirmação. Sair da Coco, trocar perfil, revogar autorização ou encerrar interrompe a captação. Sessão local limitada a dez minutos.
- Voz usa WebRTC com sessão criada no servidor. Chave OpenAI nunca vai ao navegador. O movimento da personagem acompanha áudio reproduzido, não apenas texto recebido.
- Ferramentas consultam dados agregados, distinguem dívida, previsão e despesa paga e exibem propostas para revisão. Não transferem dinheiro nem renegociam automaticamente.
- Histórico financeiro não substitui CET, juros, despesas essenciais, condições de renegociação ou capacidade mensal informada. Sem esses dados, a Coco deve perguntar e explicitar limites.

Validação: `node tools/verificar-tudo.js`, `node tools/testes/coco-interface-ui.js`. A primeira verifica contratos locais; a segunda testa três tamanhos em navegador isolado, sem dados reais nem microfone. Publicar frontend e funções Supabase separadamente. Um deploy não prova voz autenticada em dispositivo físico.
