/* Cálculo e propostas assistidas de metas. Nunca movimenta sem confirmação. */
(function (global) {
  'use strict';
  const mesAte = (data) => {
    if (!data || data <= U.todayISO()) return 0;
    const a = U.ymParts(U.todayYM()), b = U.ymParts(U.ymOf(data));
    return Math.max(1, (b.y - a.y) * 12 + (b.m - a.m));
  };
  function ritmo(goal) {
    const falta = Math.max(0, (+goal.target || 0) - (+goal.saved || 0));
    const meses = mesAte(goal.deadline);
    return meses ? U.round2(falta / meses) : null;
  }
  function sugerir(goal, profile, ym) {
    const meses = [1, 2, 3].map((n) => Calc.monthTotals(U.addMonths(ym || U.todayYM(), -n), profile));
    const renda = U.round2(U.sum(meses, (m) => m.income) / meses.length);
    const gasto = U.round2(U.sum(meses, (m) => m.expense) / meses.length);
    const outros = U.sum((profile.goals || []).filter((g) => g.id !== goal.id && g.contribution), (g) => g.contribution.amount);
    const orcamentos = U.sum(Object.keys(profile.budgets || {}), (id) => +(profile.budgets[id] || 0));
    const atual = Calc.monthTotals(ym || U.todayYM(), profile);
    const compromissos = Math.max(gasto, orcamentos, atual.plannedExpense || 0);
    const piso = Math.max(0, +((goal.automation || {}).floor) || 0);
    const contaId = ((goal.automation || {}).accountId) || goal.accountId;
    const conta = contaId && profile.accounts.find((a) => a.id === contaId);
    const espacoMensal = Math.max(0, Math.max(renda, atual.plannedIncome || 0) - compromissos - outros);
    const espacoConta = conta ? Math.max(0, Calc.accountBalance(conta.id, U.todayISO(), profile) - piso) : espacoMensal;
    const necessario = ritmo(goal);
    const valor = U.round2(Math.max(0, Math.min(necessario == null ? espacoMensal : necessario, espacoMensal, espacoConta)));
    const pausada = valor < 0.01 || (conta && espacoConta < 0.01);
    return { necessary: necessario, suggested: valor, planned: goal.contribution ? goal.contribution.amount : 0,
      projectedImpact: valor, paused: pausada, reason: pausada
        ? `O saldo projetado ficaria abaixo do piso de ${U.fmtBRL(piso)}.`
        : `Baseado na média de ${U.fmtBRL(renda)} de receitas, ${U.fmtBRL(gasto)} de despesas e ${U.fmtBRL(compromissos)} já comprometidos ou orçados.` };
  }
  function ensureProposal(goal, profile, ym) {
    const auto = goal.automation || {};
    if (!auto.active || auto.status === 'ended') return null;
    const hoje = U.todayISO(); const mes = ym || U.todayYM();
    if (mes !== U.todayYM() || +hoje.slice(8, 10) < (+auto.day || 1)) return null;
    goal.proposals = Array.isArray(goal.proposals) ? goal.proposals : [];
    const id = goal.id + '|' + mes;
    let p = goal.proposals.find((x) => x.id === id);
    if (p) return p;
    const calc = sugerir(goal, profile, mes);
    p = { id, ym: mes, status: calc.paused ? 'paused' : 'pending', amount: Math.min(+auto.amount || calc.suggested, calc.suggested),
      accountId: auto.accountId || goal.accountId || null, floor: +auto.floor || 0, reason: calc.reason, createdAt: new Date().toISOString() };
    goal.proposals.push(p);
    return p;
  }
  global.MetasAutomaticas = { ritmo, sugerir, ensureProposal };
})(window);
