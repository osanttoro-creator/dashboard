/* Motor determinístico e explicável de categorização. */
(function (global) {
  'use strict';
  const LIMITES = { historicoMinimo: 3, altaConsistencia: 0.8, mediaConsistencia: 0.65 };
  const CURADAS = [
    { re: /\b(supermercado|mercado|hortifruti|padaria|restaurante|ifood)\b/, nomes: ['Alimentação'] },
    { re: /\b(uber|taxi|combustivel|posto|metro|onibus)\b/, nomes: ['Transporte'] },
    { re: /\b(netflix|spotify|streaming|assinatura)\b/, nomes: ['Assinaturas'] },
    { re: /\b(aluguel|condominio|energia|luz|agua|gas)\b/, nomes: ['Moradia'] },
    { re: /\b(farmacia|hospital|clinica|medico)\b/, nomes: ['Saúde'] },
    { re: /\b(salario|pro labore|folha)\b/, nomes: ['Salário'] }
  ];

  function porNome(profile, nomes, kind) {
    const alvo = nomes.map((n) => U.norm(n));
    return (profile.categories || []).find((c) => c.kind === kind && alvo.includes(U.norm(c.name))) || null;
  }

  function sugerir(descricao, kind, profile, opts) {
    const op = opts || {};
    const norm = Estabelecimento.normalizar(descricao);
    if (!norm.useful || kind === 'transfer') return { categoryId: null, confidence: 'low', source: 'none', merchantKey: null, evidence: 'Descrição sem nome útil.' };
    const auto = profile.automation || {};
    const regra = (auto.categoryRules || []).find((r) => r.kind === kind && r.merchantKey === norm.merchantKey && r.active !== false);
    if (regra) return { categoryId: regra.categoryId, confidence: 'high', source: 'confirmed-rule', merchantKey: norm.merchantKey, evidence: 'Regra confirmada por você para este estabelecimento.' };

    const alias = (auto.merchantAliases || []).find((a) => a.aliasKey === norm.merchantKey && a.kind === kind);
    if (alias && alias.categoryId) return { categoryId: alias.categoryId, confidence: 'high', source: 'confirmed-alias', merchantKey: norm.merchantKey, evidence: 'Alias confirmado por você.' };

    const historico = (profile.transactions || []).filter((t) => t.id !== op.excludeId && t.kind === kind && t.categoryId && !t.installment &&
      (t.merchantKey || Estabelecimento.normalizar(t.description).merchantKey) === norm.merchantKey);
    if (historico.length) {
      const contagem = {};
      historico.forEach((t) => { contagem[t.categoryId] = (contagem[t.categoryId] || 0) + 1; });
      const melhor = Object.keys(contagem).sort((a, b) => contagem[b] - contagem[a])[0];
      const taxa = contagem[melhor] / historico.length;
      if (historico.length >= LIMITES.historicoMinimo && taxa >= LIMITES.altaConsistencia) {
        return { categoryId: melhor, confidence: 'high', source: 'history', merchantKey: norm.merchantKey,
          evidence: `Mesmo estabelecimento em ${historico.length} lançamentos; ${contagem[melhor]} usaram esta categoria.` };
      }
      if (historico.length >= 2 && taxa >= LIMITES.mediaConsistencia) {
        return { categoryId: melhor, confidence: 'medium', source: 'history', merchantKey: norm.merchantKey,
          evidence: `${contagem[melhor]} de ${historico.length} lançamentos parecidos usaram esta categoria.` };
      }
    }

    const curada = CURADAS.find((r) => r.re.test(norm.normalized));
    const cat = curada && porNome(profile, curada.nomes, kind);
    if (cat) return { categoryId: cat.id, confidence: 'medium', source: 'curated', merchantKey: norm.merchantKey, evidence: 'Sugestão por uma regra local de palavras conhecidas.' };
    return { categoryId: null, confidence: 'low', source: 'none', merchantKey: norm.merchantKey, evidence: 'Ainda não há histórico consistente.' };
  }

  function confirmarRegra(profile, merchantKey, kind, categoryId) {
    if (!merchantKey || !categoryId) return false;
    profile.automation = profile.automation || {};
    profile.automation.categoryRules = profile.automation.categoryRules || [];
    const atual = profile.automation.categoryRules.find((r) => r.merchantKey === merchantKey && r.kind === kind);
    if (atual) Object.assign(atual, { categoryId, active: true, confirmedAt: new Date().toISOString() });
    else profile.automation.categoryRules.push({ id: U.uid('rule'), merchantKey, kind, categoryId, active: true, confirmedAt: new Date().toISOString() });
    return true;
  }

  global.Categorizacao = { LIMITES, sugerir, confirmarRegra };
})(window);
