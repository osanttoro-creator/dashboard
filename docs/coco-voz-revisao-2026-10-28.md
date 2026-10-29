# COCO — revisão da voz

Estado em 29/10/2026: investigação e preparação para testes. Nenhum timbre novo foi aprovado ou publicado.

## O que o código faz hoje

- A conversa ao vivo usa GPT-Live com `OAZE_COCO_VOICE` (padrão `bossa`, voz brasileira feminina).
- O botão **Ouvir resposta** usa `/v1/audio/speech` com `gpt-4o-mini-tts` (padrão `coral`). As duas rotas não têm a mesma voz.
- As instruções pedem a língua da pessoa, mas isso ainda não foi avaliado com conversas reais em português, inglês e espanhol.
- O consentimento do app informa que a voz é gerada por IA.

## Decisão desta rodada

O servidor aceita `OAZE_COCO_TTS_VOICE` para testar uma das vozes integradas do endpoint de leitura sem mudar o app. Sem essa variável, `coral` permanece. Um valor fora da lista retorna ao padrão. Não alterar o timbre de produção sem escuta comparativa.

Testar sempre o mesmo texto curto, em português, inglês e espanhol, nos dois modos. Registrar pronúncia de nomes financeiros, naturalidade, latência e compreensão. A escolha de timbre não substitui o teste de resposta correta do modelo.

## Próxima arquitetura

O modelo `gpt-4o-mini-tts` tem encerramento anunciado para 06/01/2027. Migrar o botão de leitura para um fluxo de áudio suportado antes dessa data. Uma voz criada apenas por descrição funciona no GPT-Live, mas não no atual endpoint TTS; uma voz derivada de gravação exige consentimento e permissões próprias. Não prometer voz única nos dois modos até validar a rota técnica e ouvir amostras.

Fontes: [vozes GPT-Live](https://developers.openai.com/api/docs/guides/live-conversations), [texto para fala](https://developers.openai.com/api/docs/guides/text-to-speech), [vozes personalizadas](https://developers.openai.com/api/docs/guides/custom-voices).
