/* =============================================================
   api/uglez.js — proxy do UGLEZ (Vercel Serverless Function)
   ------------------------------------------------------------
   POR QUE ISTO EXISTE

   O brief exige que a integração de IA passe pelo backend e que
   nenhuma chave viva no navegador. Esta função é essa camada: a
   chave fica em ANTHROPIC_API_KEY, uma variável de ambiente do
   servidor, e nunca é enviada ao cliente.

   O front chama POST /api/uglez com { pergunta, resumo }.

   FALLBACK, E POR QUE ELE CONTINUA EXISTINDO

   O app roda em três lugares: no Vercel, aberto direto do disco
   (file://) e como arquivo único no iPhone. Nos dois últimos não
   existe servidor nenhum. Quando esta função não responde, o
   cliente cai para a chave do próprio usuário guardada no
   localStorage dele — que não é um segredo do produto, é dele.

   Quando ANTHROPIC_API_KEY não está configurada, respondemos 501
   e o cliente entende que deve usar o caminho local.
   ============================================================= */
'use strict';

const MODELO = 'claude-opus-5';
const MAX_TOKENS = 900;

/* Limites defensivos: esta rota é pública e paga por token. */
const MAX_PERGUNTA = 500;
const MAX_RESUMO = 6000;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }

  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    // Não é erro: é a ausência do recurso. O cliente usa a própria chave.
    return res.status(501).json({
      erro: 'backend-sem-chave',
      detalhe: 'ANTHROPIC_API_KEY não configurada neste ambiente.'
    });
  }

  let corpo = req.body;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch (e) { corpo = null; }
  }
  if (!corpo || typeof corpo !== 'object') {
    return res.status(400).json({ erro: 'Corpo inválido.' });
  }

  const pergunta = String(corpo.pergunta || '').trim().slice(0, MAX_PERGUNTA);
  const resumo = String(corpo.resumo || '').trim().slice(0, MAX_RESUMO);
  if (!pergunta) return res.status(400).json({ erro: 'Pergunta vazia.' });

  const sistema = [
    'Você é o UGLEZ, o assistente financeiro do app OAZE.',
    'Responda SEMPRE em português do Brasil, em no máximo 200 palavras.',
    'Use apenas os números do resumo abaixo. Nunca invente valores.',
    'Se o resumo não tiver a informação, diga isso claramente.',
    'Formate valores como R$ 1.234,56.',
    'Seja direto e prático: aponte o que fazer, não faça sermão.',
    'Você não é consultor de investimentos licenciado; não recomende',
    'produtos financeiros específicos nem prometa retorno.'
  ].join(' ');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': chave,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        system: sistema,
        messages: [{ role: 'user', content: 'Resumo do meu mês:\n' + resumo + '\n\nPergunta: ' + pergunta }]
      })
    });

    const dados = await r.json();
    if (!r.ok) {
      // repassa o status, mas NUNCA o corpo cru: ele pode conter eco da chave
      const msg = (dados && dados.error && dados.error.message) || 'Falha na API.';
      return res.status(r.status).json({ erro: msg });
    }

    const texto = (dados.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return res.status(200).json({ texto, modelo: MODELO });
  } catch (e) {
    return res.status(502).json({ erro: 'Não foi possível falar com a API.' });
  }
};
