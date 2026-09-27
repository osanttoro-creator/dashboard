/* Normalização conservadora de estabelecimento/pagador. Funções puras. */
(function (global) {
  'use strict';

  const GENERICOS = new Set(['', 'compra', 'pagamento', 'pix', 'debito', 'credito', 'transferencia', 'outros']);
  const ALIASES_CURADOS = [
    { teste: /\bnetflix\b/, chave: 'netflix', nome: 'Netflix' },
    { teste: /\bspotify\b/, chave: 'spotify', nome: 'Spotify' },
    { teste: /\bamazon(?: prime)?\b/, chave: 'amazon', nome: 'Amazon' },
    { teste: /\buber\b/, chave: 'uber', nome: 'Uber' },
    { teste: /\bifood\b/, chave: 'ifood', nome: 'iFood' }
  ];

  function semAcento(valor) {
    return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function limpar(descricao) {
    let s = semAcento(descricao).toLowerCase();
    s = s.replace(/\b(?:pix|compra|debito|credito|pagamento|transferencia|ted|doc)\b[\s:*-]*/g, ' ')
      .replace(/\b(?:nsu|id|aut|cod(?:igo)?)\s*[:#-]?\s*[a-z0-9-]{5,}\b/g, ' ')
      .replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g, ' ')
      .replace(/\b(?:cartao|final)\s*\*{0,4}\d{2,4}\b/g, ' ')
      .replace(/\b\d{6,}\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  }

  function resultado(descricao) {
    const limpo = limpar(descricao);
    if (!limpo || GENERICOS.has(limpo) || /^\d+$/.test(limpo) || limpo.length < 3) {
      return { original: String(descricao || ''), normalized: limpo, merchantKey: null, canonicalName: null, useful: false };
    }
    const curado = ALIASES_CURADOS.find((a) => a.teste.test(limpo));
    if (curado) return { original: String(descricao || ''), normalized: limpo, merchantKey: curado.chave, canonicalName: curado.nome, useful: true };
    const tokens = limpo.split(' ').filter((t) => t.length > 1 && !GENERICOS.has(t));
    if (!tokens.length) return { original: String(descricao || ''), normalized: limpo, merchantKey: null, canonicalName: null, useful: false };
    /* No máximo três tokens: remove sufixos bancários variáveis sem usar
       similaridade frouxa, que juntaria lojas diferentes. */
    const chave = tokens.slice(0, 3).join('-');
    return {
      original: String(descricao || ''), normalized: limpo, merchantKey: chave,
      canonicalName: tokens.slice(0, 3).map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' '),
      useful: chave.length >= 3
    };
  }

  global.Estabelecimento = { limpar, normalizar: resultado, ALIASES_CURADOS };
})(window);
