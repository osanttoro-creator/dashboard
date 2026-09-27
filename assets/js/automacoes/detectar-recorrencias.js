/* Detector puro de padrões recorrentes. Não grava nem altera históricos. */
(function (global) {
  'use strict';
  const CFG = { minimo: 3, valorVariacao: 0.35, ciclos: [
    { key: 'weekly', min: 6, max: 8, label: 'semanal' },
    { key: 'fortnightly', min: 13, max: 16, label: 'quinzenal' },
    { key: 'monthly', min: 27, max: 33, label: 'mensal' },
    { key: 'bimonthly', min: 55, max: 67, label: 'bimestral' },
    { key: 'quarterly', min: 82, max: 100, label: 'trimestral' },
    { key: 'annual', min: 350, max: 380, label: 'anual' }
  ] };

  const mediana = (xs) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  const dias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  function detectar(transacoes, profile) {
    const decisoes = ((profile || {}).automation || {}).recurrenceDecisions || {};
    const grupos = new Map();
    (transacoes || []).forEach((t) => {
      const n = Estabelecimento.normalizar(t.description);
      if (!n.useful || t.kind === 'transfer' || t.recurring || t.installment || t.confirmed === false ||
          /fatura|estorno|reembolso/i.test(t.description || '')) return;
      const origem = t.method === 'card' ? t.cardId : t.accountId;
      const chave = [n.merchantKey, t.kind, t.categoryId || '', t.method || '', origem || ''].join('|');
      if (!grupos.has(chave)) grupos.set(chave, { merchant: n, items: [], base: chave });
      grupos.get(chave).items.push(t);
    });
    const out = [];
    grupos.forEach((g) => {
      const itens = g.items.slice().sort((a, b) => a.date.localeCompare(b.date));
      if (itens.length < CFG.minimo) return;
      const intervalos = itens.slice(1).map((t, i) => dias(itens[i].date, t.date));
      const intervalo = mediana(intervalos);
      const ciclo = CFG.ciclos.find((c) => intervalo >= c.min && intervalo <= c.max);
      if (!ciclo || intervalos.some((v) => Math.abs(v - intervalo) > Math.max(3, intervalo * 0.2))) return;
      const valores = itens.map((t) => t.amount);
      const valor = mediana(valores);
      const variacao = valor ? (Math.max.apply(null, valores) - Math.min.apply(null, valores)) / valor : 1;
      if (variacao > CFG.valorVariacao && !(ciclo.key === 'monthly' && itens.length >= 4)) return;
      const id = 'rec_' + hash(g.base + '|' + ciclo.key);
      if (decisoes[id] && ['accepted', 'dismissed', 'blocked'].includes(decisoes[id].status)) return;
      const ultima = itens[itens.length - 1].date;
      const proxYM = U.addMonths(U.ymOf(ultima), 1);
      const proxPartes = U.ymParts(proxYM);
      const proxima = ciclo.key === 'monthly'
        ? U.isoOf(proxPartes.y, proxPartes.m, U.clampDay(proxPartes.y, proxPartes.m, +ultima.slice(8, 10)))
        : U.addDaysISO(ultima, intervalo);
      out.push({ id, merchantKey: g.merchant.merchantKey, name: g.merchant.canonicalName,
        kind: itens[0].kind, categoryId: itens[0].categoryId, method: itens[0].method,
        accountId: itens[0].accountId, cardId: itens[0].cardId, periodicity: ciclo.key,
        periodicityLabel: ciclo.label, median: U.round2(valor), min: Math.min.apply(null, valores), max: Math.max.apply(null, valores),
        nextDate: proxima, confidence: itens.length >= 4 && variacao <= 0.15 ? 'alta' : 'média',
        evidenceIds: itens.map((t) => t.id), reason: `${itens.length} ocorrências, intervalo mediano de ${intervalo} dias.` });
    });
    return out.sort((a, b) => b.evidenceIds.length - a.evidenceIds.length);
  }

  global.DetectorRecorrencias = { CFG, detectar };
})(window);
