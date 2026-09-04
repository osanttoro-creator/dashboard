/* =============================================================
   api/uglez.js — proxy do UGLEZ (Vercel Serverless Function)
   ------------------------------------------------------------
   POR QUE ISTO EXISTE

   O brief exige que a integração de IA passe pelo backend e que
   nenhuma chave viva no navegador. Esta função é essa camada: a
   chave fica numa variável de ambiente do servidor e NUNCA é
   enviada ao cliente. Nem no corpo, nem em cabeçalho, nem em
   mensagem de erro.

   O front chama POST /api/uglez com { pergunta, resumo } e recebe
   { texto, modelo }.

   DOIS PROVEDORES

   Escolha por variável de ambiente, nesta ordem:

     IA_PROVEDOR=openai      força a OpenAI
     IA_PROVEDOR=anthropic   força a Anthropic
     (sem IA_PROVEDOR)       usa a primeira chave que existir,
                             OpenAI antes de Anthropic

   Configure apenas UMA se quiser previsibilidade. Modelo padrão de
   cada uma pode ser trocado por OPENAI_MODEL / ANTHROPIC_MODEL sem
   mexer no código — útil quando um modelo novo sai e você quer
   testar sem redeploy de código.

   FALLBACK, E POR QUE ELE CONTINUA EXISTINDO

   O app roda em três lugares: no Vercel, aberto direto do disco
   (file://) e como arquivo único no iPhone. Nos dois últimos não
   existe servidor nenhum. Quando esta função não responde, o
   cliente cai para a chave do próprio usuário guardada no
   localStorage dele — que não é um segredo do produto, é dele.

   Sem nenhuma chave configurada, respondemos 501 e o cliente
   entende que deve usar o caminho local.
   ============================================================= */
'use strict';

/* Limites defensivos: esta rota é pública e paga por token. */
const MAX_PERGUNTA = 500;
const MAX_RESUMO = 6000;
const MAX_TOKENS = 900;

const PADRAO = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-5'
};

const SISTEMA = [
  'Você é o UGLEZ, o assistente financeiro do app OAZE.',
  'Responda SEMPRE em português do Brasil, em no máximo 200 palavras.',
  'Use apenas os números do resumo abaixo. Nunca invente valores.',
  'Se o resumo não tiver a informação, diga isso claramente.',
  'Formate valores como R$ 1.234,56.',
  'Seja direto e prático: aponte o que fazer, não faça sermão.',
  'Você não é consultor de investimentos licenciado; não recomende',
  'produtos financeiros específicos nem prometa retorno.'
].join(' ');

/**
 * Decide quem responde. Uma variável explícita ganha de tudo; sem
 * ela, vale a chave que existir.
 */
function escolherProvedor() {
  const forcado = String(process.env.IA_PROVEDOR || '').trim().toLowerCase();
  const temOpenAI = !!process.env.OPENAI_API_KEY;
  const temAnthropic = !!process.env.ANTHROPIC_API_KEY;

  if (forcado === 'openai') return temOpenAI ? 'openai' : null;
  if (forcado === 'anthropic') return temAnthropic ? 'anthropic' : null;
  if (temOpenAI) return 'openai';
  if (temAnthropic) return 'anthropic';
  return null;
}

/* ---------------- OpenAI ---------------- */

async function perguntarOpenAI(pergunta, resumo) {
  const modelo = process.env.OPENAI_MODEL || PADRAO.openai;
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: 'Resumo do meu mês:\n' + resumo + '\n\nPergunta: ' + pergunta }
      ]
    })
  });

  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    throw comStatus(r.status, (dados && dados.error && dados.error.message) || 'Falha na API da OpenAI.');
  }

  const texto = String(
    (((dados.choices || [])[0] || {}).message || {}).content || ''
  ).trim();
  return { texto, modelo };
}

/* ---------------- Anthropic ---------------- */

async function perguntarAnthropic(pergunta, resumo) {
  const modelo = process.env.ANTHROPIC_MODEL || PADRAO.anthropic;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: MAX_TOKENS,
      system: SISTEMA,
      messages: [{ role: 'user', content: 'Resumo do meu mês:\n' + resumo + '\n\nPergunta: ' + pergunta }]
    })
  });

  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    throw comStatus(r.status, (dados && dados.error && dados.error.message) || 'Falha na API da Anthropic.');
  }

  const texto = (dados.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { texto, modelo };
}

function comStatus(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

/* ---------------- rota ---------------- */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }

  const provedor = escolherProvedor();
  if (!provedor) {
    // Não é erro: é a ausência do recurso. O cliente usa a própria chave.
    return res.status(501).json({
      erro: 'backend-sem-chave',
      detalhe: 'Nenhuma chave de IA configurada neste ambiente.'
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

  try {
    const r = provedor === 'openai'
      ? await perguntarOpenAI(pergunta, resumo)
      : await perguntarAnthropic(pergunta, resumo);

    if (!r.texto) return res.status(502).json({ erro: 'O modelo respondeu vazio.' });
    return res.status(200).json({ texto: r.texto, modelo: r.modelo });
  } catch (e) {
    /* Repassamos o status e a mensagem já extraída — nunca o corpo cru
       da API, que em alguns erros ecoa parte do cabeçalho enviado. */
    return res.status(e.status || 502).json({ erro: e.message || 'Não foi possível falar com a API.' });
  }
};
