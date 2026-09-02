/* =============================================================
   calc.js — motor de cálculo
   ------------------------------------------------------------
   CONVENÇÕES CONTÁBEIS (documentadas no README):
   · Um lançamento fixo é um molde: gera uma "ocorrência" por mês.
     A confirmação é por ocorrência (tx.occ['YYYY-MM'].confirmed).
   · Só ocorrência CONFIRMADA entra em qualquer total.
   · Despesa no cartão conta como despesa na DATA DA COMPRA
     (regime de competência). O pagamento da fatura não é uma nova
     despesa — só move dinheiro da conta.
   · Saldo do mês        = receitas − despesas (fluxo operacional)
   · Saldo em contas     = caixa real: inclui pagamento de fatura
                           e aportes debitados da conta
   · Patrimônio          = saldo em contas + investimentos
   ============================================================= */
(function (global) {
  'use strict';

  const Calc = {};
  const P = () => Store.profile();

  /* ============================================================
     1 · OCORRÊNCIAS
     ============================================================ */

  /** Data da ocorrência de um lançamento fixo dentro de um mês. */
  function occurrenceDate(tx, ym) {
    const base = U.parseISO(tx.date);
    const p = U.ymParts(ym);
    return U.isoOf(p.y, p.m, U.clampDay(p.y, p.m, base ? base.getDate() : 1));
  }

  function makeEntry(tx, ym, date) {
    const o = tx.recurring ? (tx.occ[ym] || {}) : null;
    const confirmed = tx.recurring
      ? (o.confirmed === undefined ? !!tx.confirmed : !!o.confirmed)
      : !!tx.confirmed;
    return {
      key: tx.recurring ? tx.id + '#' + ym : tx.id,
      txId: tx.id,
      tx,
      ym,
      date,
      kind: tx.kind,
      amount: (o && Number.isFinite(+o.amount)) ? U.round2(+o.amount) : tx.amount,
      description: tx.description,
      categoryId: tx.categoryId,
      accountId: tx.accountId,
      toAccountId: tx.toAccountId,
      cardId: tx.cardId,
      method: tx.method,
      recurring: tx.recurring,
      installment: tx.installment,
      source: tx.source,
      confirmed
    };
  }

  /**
   * Todas as ocorrências no intervalo [fromISO, toISO], já expandidas.
   * Ordenadas por data e depois por descrição.
   */
  Calc.entries = function (fromISO, toISO, profile) {
    const prof = profile || P();
    const from = fromISO, to = toISO;
    const out = [];
    const months = U.monthRange(U.ymOf(from), U.ymOf(to));

    prof.transactions.forEach((tx) => {
      if (!tx.recurring) {
        if (tx.date >= from && tx.date <= to) out.push(makeEntry(tx, U.ymOf(tx.date), tx.date));
        return;
      }
      const startYM = U.ymOf(tx.date);
      months.forEach((ym) => {
        if (U.monthsBetween(startYM, ym) < 0) return;
        if (tx.recurEnd && U.monthsBetween(ym, tx.recurEnd) < 0) return;
        if (tx.occ[ym] && tx.occ[ym].skipped) return;
        const date = occurrenceDate(tx, ym);
        if (date >= from && date <= to) out.push(makeEntry(tx, ym, date));
      });
    });

    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 :
      a.description.localeCompare(b.description, 'pt-BR')));
    return out;
  };

  Calc.entriesForMonth = function (ym, profile) {
    return Calc.entries(U.monthStart(ym), U.monthEnd(ym), profile);
  };

  /** Primeira data com movimento (para varreduras "desde sempre"). */
  Calc.earliestDate = function (profile) {
    const prof = profile || P();
    let min = null;
    const consider = (d) => { if (d && (!min || d < min)) min = d; };
    prof.transactions.forEach((t) => consider(t.date));
    prof.investments.forEach((i) => consider(i.date));
    prof.accounts.forEach((a) => consider(a.openedAt));
    return min || U.monthStart(U.todayYM());
  };

  /* ============================================================
     2 · TOTAIS DO MÊS
     ============================================================ */

  /**
   * { income, expense, balance, plannedIncome, plannedExpense,
   *   plannedBalance, pendingCount, entries }
   * "planned" = tudo lançado (confirmado ou não).
   */
  Calc.monthTotals = function (ym, profile) {
    const entries = Calc.entriesForMonth(ym, profile);
    const t = {
      income: 0, expense: 0, balance: 0,
      plannedIncome: 0, plannedExpense: 0, plannedBalance: 0,
      pendingIncome: 0, pendingExpense: 0, pendingCount: 0,
      entries
    };
    t.expenseDebit = 0;    // pago direto da conta
    t.expenseCredit = 0;   // lançado na fatura de um cartão

    entries.forEach((e) => {
      if (e.kind === 'transfer') return;
      const isIn = e.kind === 'income';
      if (isIn) t.plannedIncome += e.amount; else t.plannedExpense += e.amount;
      if (e.confirmed) {
        if (isIn) t.income += e.amount;
        else {
          t.expense += e.amount;
          if (e.method === 'card') t.expenseCredit += e.amount; else t.expenseDebit += e.amount;
        }
      } else {
        t.pendingCount++;
        if (isIn) t.pendingIncome += e.amount; else t.pendingExpense += e.amount;
      }
    });
    t.expenseDebit = U.round2(t.expenseDebit);
    t.expenseCredit = U.round2(t.expenseCredit);
    t.income = U.round2(t.income); t.expense = U.round2(t.expense);
    t.plannedIncome = U.round2(t.plannedIncome); t.plannedExpense = U.round2(t.plannedExpense);
    t.pendingIncome = U.round2(t.pendingIncome); t.pendingExpense = U.round2(t.pendingExpense);
    t.balance = U.round2(t.income - t.expense);
    t.plannedBalance = U.round2(t.plannedIncome - t.plannedExpense);
    return t;
  };

  /** Fluxo operacional acumulado (confirmado) até uma data, inclusive. */
  Calc.cumulativeFlow = function (uptoISO, profile) {
    const prof = profile || P();
    const opening = prof.accounts.reduce(
      (s, a) => s + (a.openedAt <= uptoISO ? (+a.openingBalance || 0) : 0), 0);
    const from = Calc.earliestDate(prof);
    if (uptoISO < from) return U.round2(opening);
    let flow = 0;
    Calc.entries(from, uptoISO, prof).forEach((e) => {
      if (!e.confirmed || e.kind === 'transfer') return;
      flow += e.kind === 'income' ? e.amount : -e.amount;
    });
    return U.round2(opening + flow);
  };

  /** Saldo inicial do mês = fluxo acumulado até o último dia do mês anterior. */
  Calc.openingBalanceOfMonth = function (ym, profile) {
    return Calc.cumulativeFlow(U.addDaysISO(U.monthStart(ym), -1), profile);
  };

  /** Série mensal { ym, label, income, expense, balance, cumulative } */
  Calc.monthlySeries = function (fromYM, toYM, profile) {
    const prof = profile || P();
    const months = U.monthRange(fromYM, toYM);
    if (!months.length) return [];
    let cum = Calc.openingBalanceOfMonth(months[0], prof);
    return months.map((ym) => {
      const t = Calc.monthTotals(ym, prof);
      cum = U.round2(cum + t.balance);
      return {
        ym,
        label: U.monthLabel(ym, true),
        income: t.income,
        expense: t.expense,
        // a quebra débito × crédito acompanha a série: qualquer gráfico
        // mensal do app pode separar as duas naturezas sem recalcular
        expenseDebit: t.expenseDebit,
        expenseCredit: t.expenseCredit,
        balance: t.balance,
        plannedIncome: t.plannedIncome,
        plannedExpense: t.plannedExpense,
        cumulative: cum
      };
    });
  };

  /* ============================================================
     3 · CATEGORIAS
     ============================================================ */

  Calc.categoryById = function (id, profile) {
    return (profile || P()).categories.find((c) => c.id === id) || null;
  };
  Calc.categoryName = function (id, profile) {
    const c = Calc.categoryById(id, profile);
    return c ? c.name : 'Sem categoria';
  };
  Calc.categoryColor = function (id, profile) {
    const c = Calc.categoryById(id, profile);
    return c ? c.color : '#9AA0AC';
  };

  /**
   * Totais por categoria no intervalo.
   * -> [{ id, name, color, total, count, pct }] ordenado desc.
   */
  Calc.categoryTotals = function (kind, fromISO, toISO, profile) {
    const prof = profile || P();
    const map = new Map();
    Calc.entries(fromISO, toISO, prof).forEach((e) => {
      if (e.kind !== kind || !e.confirmed) return;
      const id = e.categoryId || '__none__';
      if (!map.has(id)) map.set(id, { id, total: 0, count: 0 });
      const row = map.get(id);
      row.total += e.amount; row.count++;
    });
    const rows = Array.from(map.values()).map((r) => {
      const cat = Calc.categoryById(r.id, prof);
      return {
        id: r.id,
        name: cat ? cat.name : 'Sem categoria',
        color: cat ? cat.color : '#9AA0AC',
        total: U.round2(r.total),
        count: r.count
      };
    });
    const grand = U.sum(rows, (r) => r.total);
    rows.forEach((r) => { r.pct = grand > 0 ? (r.total / grand) * 100 : 0; });
    rows.sort((a, b) => b.total - a.total);
    return rows;
  };

  /**
   * Igual a categoryTotals para despesas, mas quebrando cada categoria em
   * débito (conta) e crédito (cartão). Mesma regra de sempre: só confirmado,
   * e a compra no cartão conta na data em que foi feita.
   * -> [{ id, name, color, debit, credit, total, count, pct }] desc por total.
   */
  Calc.expenseTotalsByMethod = function (fromISO, toISO, profile) {
    const prof = profile || P();
    const map = new Map();
    Calc.entries(fromISO, toISO, prof).forEach((e) => {
      if (e.kind !== 'expense' || !e.confirmed) return;
      const id = e.categoryId || '__none__';
      if (!map.has(id)) map.set(id, { id, debit: 0, credit: 0, count: 0 });
      const row = map.get(id);
      if (e.method === 'card') row.credit += e.amount; else row.debit += e.amount;
      row.count++;
    });
    const rows = Array.from(map.values()).map((r) => {
      const cat = Calc.categoryById(r.id, prof);
      return {
        id: r.id,
        name: cat ? cat.name : 'Sem categoria',
        color: cat ? cat.color : '#9AA0AC',
        icon: cat ? Icons.forCategory(cat) : 'circle-ellipsis',
        debit: U.round2(r.debit),
        credit: U.round2(r.credit),
        total: U.round2(r.debit + r.credit),
        count: r.count
      };
    });
    const grand = U.sum(rows, (r) => r.total);
    rows.forEach((r) => { r.pct = grand > 0 ? (r.total / grand) * 100 : 0; });
    rows.sort((a, b) => b.total - a.total);
    return rows;
  };

  /** Agrupa a cauda longa em "Outros" para a pizza (máx. 5 fatias + Outros). */
  Calc.topCategories = function (rows, max) {
    const lim = max || 6;
    if (rows.length <= lim) return rows.slice();
    const head = rows.slice(0, lim - 1);
    const tail = rows.slice(lim - 1);
    head.push({
      id: '__other__', name: `Outras (${tail.length})`, color: '#9AA0AC',
      total: U.round2(U.sum(tail, (r) => r.total)),
      count: U.sum(tail, (r) => r.count),
      pct: U.sum(tail, (r) => r.pct)
    });
    return head;
  };

  /* ============================================================
     4 · CONTAS
     ============================================================ */

  /** Saldo de caixa de uma conta até a data (inclusive). */
  Calc.accountBalance = function (accountId, uptoISO, profile) {
    const prof = profile || P();
    const acc = prof.accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    const upto = uptoISO || U.todayISO();
    let bal = acc.openedAt <= upto ? (+acc.openingBalance || 0) : 0;

    Calc.entries(Calc.earliestDate(prof), upto, prof).forEach((e) => {
      if (!e.confirmed) return;
      if (e.kind === 'income' && e.accountId === accountId) bal += e.amount;
      else if (e.kind === 'expense' && e.method === 'account' && e.accountId === accountId) bal -= e.amount;
      else if (e.kind === 'transfer') {
        if (e.accountId === accountId) bal -= e.amount;
        if (e.toAccountId === accountId) bal += e.amount;
      }
    });

    // faturas pagas debitadas desta conta
    Object.keys(prof.invoices).forEach((k) => {
      const inv = prof.invoices[k];
      if (inv && inv.paid && inv.accountId === accountId && (inv.paidAt || '') <= upto) {
        bal -= (+inv.amount || 0);
      }
    });

    // aportes debitados desta conta
    prof.investments.forEach((iv) => {
      if (iv.accountId === accountId && iv.date <= upto) bal -= (+iv.amount || 0);
    });

    return U.round2(bal);
  };

  Calc.totalAccountsBalance = function (uptoISO, profile) {
    const prof = profile || P();
    return U.round2(prof.accounts.filter((a) => !a.archived)
      .reduce((s, a) => s + Calc.accountBalance(a.id, uptoISO, prof), 0));
  };

  Calc.accountName = function (id, profile) {
    const a = (profile || P()).accounts.find((x) => x.id === id);
    return a ? a.name : '—';
  };

  /** Extrato de uma conta com saldo corrente linha a linha. */
  Calc.accountStatement = function (accountId, fromISO, toISO, profile) {
    const prof = profile || P();
    const acc = prof.accounts.find((a) => a.id === accountId);
    const rows = [];

    // Se a conta "nasce" dentro da janela, o saldo inicial é uma linha do
    // extrato — sem isso o saldo corrente não fecha com Calc.accountBalance.
    if (acc && acc.openedAt >= fromISO && acc.openedAt <= toISO && (+acc.openingBalance || 0) !== 0) {
      rows.push({
        date: acc.openedAt, desc: 'Saldo inicial da conta', cat: 'Abertura',
        delta: +acc.openingBalance || 0
      });
    }

    Calc.entries(fromISO, toISO, prof).forEach((e) => {
      if (!e.confirmed) return;
      if (e.kind === 'income' && e.accountId === accountId) {
        rows.push({ date: e.date, desc: e.description, cat: Calc.categoryName(e.categoryId, prof), delta: e.amount });
      } else if (e.kind === 'expense' && e.method === 'account' && e.accountId === accountId) {
        rows.push({ date: e.date, desc: e.description, cat: Calc.categoryName(e.categoryId, prof), delta: -e.amount });
      } else if (e.kind === 'transfer' && e.accountId === accountId) {
        rows.push({ date: e.date, desc: `${e.description} → ${Calc.accountName(e.toAccountId, prof)}`, cat: 'Transferência', delta: -e.amount });
      } else if (e.kind === 'transfer' && e.toAccountId === accountId) {
        rows.push({ date: e.date, desc: `${e.description} ← ${Calc.accountName(e.accountId, prof)}`, cat: 'Transferência', delta: e.amount });
      }
    });

    Object.keys(prof.invoices).forEach((k) => {
      const inv = prof.invoices[k];
      if (!inv || !inv.paid || inv.accountId !== accountId) return;
      const at = inv.paidAt || '';
      if (at < fromISO || at > toISO) return;
      const cardId = k.split('|')[0];
      const card = prof.cards.find((c) => c.id === cardId);
      rows.push({
        date: at, desc: `Pagamento fatura ${card ? card.name : 'cartão'} (${U.monthLabel(k.split('|')[1], true)})`,
        cat: 'Fatura', delta: -(+inv.amount || 0)
      });
    });

    prof.investments.forEach((iv) => {
      if (iv.accountId !== accountId) return;
      if (iv.date < fromISO || iv.date > toISO) return;
      rows.push({ date: iv.date, desc: `Aporte: ${iv.name}`, cat: 'Investimento', delta: -(+iv.amount || 0) });
    });

    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = Calc.accountBalance(accountId, U.addDaysISO(fromISO, -1), prof);
    rows.forEach((r) => { running = U.round2(running + r.delta); r.balance = running; });
    return rows;
  };

  /* ============================================================
     5 · CARTÕES E FATURAS
     ============================================================ */

  /**
   * Referência (mês de VENCIMENTO) da fatura que captura uma compra.
   * Se o dia da compra passou do fechamento, cai no ciclo seguinte.
   * Se o vencimento é ANTES do fechamento no calendário, a fatura
   * vence no mês seguinte ao do fechamento.
   */
  Calc.invoiceRefForDate = function (card, iso) {
    const d = U.parseISO(iso);
    if (!d) return U.todayYM();
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    const closeDayThis = U.clampDay(y, m, card.closingDay);
    const closeMonth = day > closeDayThis ? m + 1 : m;
    const dueOffset = card.dueDay > card.closingDay ? 0 : 1;
    return U.ymKey(y, closeMonth + dueOffset);
  };

  /** { openDate, closeDate, dueDate } da fatura de referência `ref`. */
  Calc.invoiceDates = function (card, ref) {
    const p = U.ymParts(ref);
    const dueOffset = card.dueDay > card.closingDay ? 0 : 1;
    const closeAbs = new Date(p.y, p.m - dueOffset, 1);
    const cy = closeAbs.getFullYear(), cm = closeAbs.getMonth();
    const closeDate = U.isoOf(cy, cm, U.clampDay(cy, cm, card.closingDay));
    const prev = new Date(cy, cm - 1, 1);
    const prevClose = U.isoOf(prev.getFullYear(), prev.getMonth(),
      U.clampDay(prev.getFullYear(), prev.getMonth(), card.closingDay));
    return {
      openDate: U.addDaysISO(prevClose, 1),
      closeDate,
      dueDate: U.isoOf(p.y, p.m, U.clampDay(p.y, p.m, card.dueDay))
    };
  };

  /**
   * Fatura completa: itens, total, status.
   * Só entram itens confirmados no total "realizado"; pendentes vão
   * no total previsto.
   */
  Calc.invoice = function (cardId, ref, profile) {
    const prof = profile || P();
    const card = prof.cards.find((c) => c.id === cardId);
    if (!card) return null;
    const dates = Calc.invoiceDates(card, ref);
    const items = Calc.entries(dates.openDate, dates.closeDate, prof)
      .filter((e) => e.kind === 'expense' && e.cardId === cardId);

    const total = U.round2(U.sum(items.filter((i) => i.confirmed), (i) => i.amount));
    const planned = U.round2(U.sum(items, (i) => i.amount));
    const rec = Store.getInvoice(cardId, ref);
    const today = U.todayISO();

    return {
      card, ref, items,
      openDate: dates.openDate, closeDate: dates.closeDate, dueDate: dates.dueDate,
      total, planned,
      paid: !!(rec && rec.paid),
      paidAt: rec ? rec.paidAt : null,
      paidAmount: rec ? +rec.amount || 0 : 0,
      paidAccountId: rec ? rec.accountId : null,
      isOpen: today <= dates.closeDate,
      isOverdue: !(rec && rec.paid) && today > dates.dueDate && planned > 0
    };
  };

  /** Limite comprometido: soma das faturas não pagas (abertas + fechadas). */
  Calc.cardUsed = function (cardId, profile) {
    const prof = profile || P();
    const card = prof.cards.find((c) => c.id === cardId);
    if (!card) return 0;
    const today = U.todayYM();
    let used = 0;
    for (let k = -6; k <= 12; k++) {
      const ref = U.addMonths(today, k);
      const inv = Calc.invoice(cardId, ref, prof);
      if (inv && !inv.paid) used += inv.planned;
    }
    return U.round2(used);
  };

  /** Fatura "atual": a primeira em aberto ou não paga a partir do mês de hoje. */
  Calc.currentInvoiceRef = function (card, baseYM, profile) {
    const base = baseYM || U.todayYM();
    for (let k = 0; k <= 3; k++) {
      const ref = U.addMonths(base, k);
      const inv = Calc.invoice(card.id, ref, profile);
      if (inv && (!inv.paid || inv.planned > 0)) return ref;
    }
    return base;
  };

  /* ============================================================
     6 · INVESTIMENTOS
     ============================================================ */

  /** Valor estimado do aporte numa data (juros compostos sobre a taxa a.a.). */
  Calc.investmentValueAt = function (inv, atISO, profile) {
    const at = atISO || U.todayISO();
    if (inv.date > at) return 0;
    if (inv.currentValue != null && at >= U.todayISO()) return U.round2(inv.currentValue);
    const years = Math.max(0, U.yearsBetween(inv.date, at));
    const rate = (+inv.rate || 0) / 100;
    return U.round2((+inv.amount || 0) * Math.pow(1 + rate, years));
  };

  Calc.investedTotal = function (atISO, profile) {
    const prof = profile || P();
    const at = atISO || U.todayISO();
    return U.round2(prof.investments.reduce((s, iv) => s + Calc.investmentValueAt(iv, at, prof), 0));
  };
  Calc.contributedTotal = function (atISO, profile) {
    const prof = profile || P();
    const at = atISO || U.todayISO();
    return U.round2(prof.investments.reduce((s, iv) => s + (iv.date <= at ? (+iv.amount || 0) : 0), 0));
  };

  /** Série mensal do patrimônio investido: [{ ym, label, contributed, value }] */
  Calc.investmentSeries = function (fromYM, toYM, profile) {
    const prof = profile || P();
    return U.monthRange(fromYM, toYM).map((ym) => {
      const end = U.monthEnd(ym);
      return {
        ym, label: U.monthLabel(ym, true),
        contributed: Calc.contributedTotal(end, prof),
        value: Calc.investedTotal(end, prof)
      };
    });
  };

  /** Projeção de juros compostos mês a mês. */
  Calc.projection = function (initial, monthly, monthlyRate, months) {
    const i = +monthlyRate || 0;
    const out = [];
    let value = +initial || 0;
    let invested = +initial || 0;
    out.push({ month: 0, value: U.round2(value), invested: U.round2(invested) });
    for (let m = 1; m <= months; m++) {
      value = value * (1 + i) + (+monthly || 0);
      invested += (+monthly || 0);
      out.push({ month: m, value: U.round2(value), invested: U.round2(invested) });
    }
    return out;
  };
  Calc.yearRateToMonth = (annualPct) => Math.pow(1 + (+annualPct || 0) / 100, 1 / 12) - 1;

  /* ============================================================
     7 · RESUMO DO ANO
     ============================================================ */

  Calc.yearSummary = function (year, profile) {
    const prof = profile || P();
    const series = Calc.monthlySeries(`${year}-01`, `${year}-12`, prof);
    const invested = {};
    prof.investments.forEach((iv) => {
      const y = +iv.date.slice(0, 4);
      if (y === year) {
        const m = iv.date.slice(0, 7);
        invested[m] = U.round2((invested[m] || 0) + (+iv.amount || 0));
      }
    });
    series.forEach((r) => { r.invested = invested[r.ym] || 0; });
    return {
      year, series,
      income: U.round2(U.sum(series, (r) => r.income)),
      expense: U.round2(U.sum(series, (r) => r.expense)),
      balance: U.round2(U.sum(series, (r) => r.balance)),
      invested: U.round2(U.sum(series, (r) => r.invested)),
      endCumulative: series.length ? series[series.length - 1].cumulative : 0
    };
  };

  /** Anos que possuem qualquer movimento. */
  Calc.yearsWithData = function (profile) {
    const prof = profile || P();
    const set = new Set();
    prof.transactions.forEach((t) => {
      const y0 = +t.date.slice(0, 4);
      if (t.recurring) {
        const yEnd = t.recurEnd ? +t.recurEnd.slice(0, 4) : new Date().getFullYear();
        for (let y = y0; y <= yEnd; y++) set.add(y);
      } else set.add(y0);
    });
    prof.investments.forEach((i) => set.add(+i.date.slice(0, 4)));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => a - b);
  };

  /* ============================================================
     PATRIMÔNIO, SAÚDE FINANCEIRA E AGENDA
     ------------------------------------------------------------
     Tudo aqui é derivado do que já existe acima. Nenhuma destas
     funções guarda estado: some o motivo, some o resultado.
     ============================================================ */

  /**
   * Patrimônio líquido numa data: dinheiro em contas + valor
   * investido − o que está comprometido em faturas ainda não pagas.
   *
   * A fatura entra como passivo porque o dinheiro já foi gasto: ele
   * ainda está na conta, mas não é seu. Ignorar isso infla o número
   * justamente de quem usa muito o crédito.
   */
  Calc.netWorth = function (atISO, profile) {
    const prof = profile || P();
    const contas = Calc.totalAccountsBalance(atISO, prof);
    const investido = Calc.investedTotal(atISO, prof);
    let faturas = 0;
    prof.cards.forEach((c) => { faturas += Calc.cardUsed(c.id, prof); });
    return U.round2(contas + investido - U.round2(faturas));
  };

  /** Saldo disponível: caixa de verdade, sem o que já está comprometido. */
  Calc.available = function (atISO, profile) {
    const prof = profile || P();
    let faturas = 0;
    prof.cards.forEach((c) => { faturas += Calc.cardUsed(c.id, prof); });
    return U.round2(Calc.totalAccountsBalance(atISO, prof) - U.round2(faturas));
  };

  /** Quanto de cada real recebido sobrou, em %. Null quando não houve receita. */
  Calc.savingsRate = function (ym, profile) {
    const t = Calc.monthTotals(ym, profile);
    if (t.income <= 0) return null;
    return ((t.income - t.expense) / t.income) * 100;
  };

  /* ------------------------------------------------------------
     OAZE Score — 0 a 100
     ------------------------------------------------------------
     Cinco perguntas, cada uma valendo 20 pontos. Todas são
     verificáveis a partir dos próprios lançamentos; nenhuma
     depende de opinião ou de dado externo.

       1 · Sobra dinheiro?        taxa de poupança dos 3 meses
       2 · O crédito está sob controle?  fatura / receita mensal
       3 · Há reserva?            saldo disponível / gasto mensal
       4 · O patrimônio cresce?   variação em 6 meses
       5 · As contas estão em dia? nada vencido, nada no negativo

     Devolve também o porquê de cada parte, porque um número sozinho
     não ajuda ninguém a agir.
     ------------------------------------------------------------ */
  Calc.score = function (ym, profile) {
    const prof = profile || P();
    const fim = U.monthEnd(ym);
    const partes = [];
    const faixa = (v, min, max) => Math.max(0, Math.min(1, (v - min) / (max - min)));

    /* 1 · poupança média de 3 meses */
    const taxas = [0, 1, 2]
      .map((i) => Calc.savingsRate(U.addMonths(ym, -i), prof))
      .filter((x) => x != null);
    const media = taxas.length ? taxas.reduce((a, b) => a + b, 0) / taxas.length : null;
    partes.push({
      chave: 'poupanca', nome: 'Sobra no fim do mês',
      pontos: media == null ? 0 : Math.round(faixa(media, -10, 25) * 20),
      detalhe: media == null ? 'Sem receita registrada nos últimos 3 meses'
        : 'Você guarda ' + U.fmtPct(media, 0) + ' do que recebe',
      ok: media != null && media >= 10
    });

    /* 2 · peso do crédito sobre a receita */
    const receita = Calc.monthTotals(ym, prof).income;
    let fatura = 0;
    prof.cards.forEach((c) => { fatura += Calc.cardUsed(c.id, prof); });
    fatura = U.round2(fatura);
    const peso = receita > 0 ? (fatura / receita) * 100 : (fatura > 0 ? 100 : 0);
    partes.push({
      chave: 'credito', nome: 'Crédito sob controle',
      pontos: Math.round(faixa(-peso, -80, -10) * 20),
      detalhe: fatura <= 0 ? 'Nenhuma fatura em aberto'
        : 'Faturas em aberto somam ' + U.fmtPct(peso, 0) + ' da sua receita',
      ok: peso <= 30
    });

    /* 3 · reserva, em meses de gasto */
    const gastoMedio = U.round2([0, 1, 2]
      .map((i) => Calc.monthTotals(U.addMonths(ym, -i), prof).expense)
      .reduce((a, b) => a + b, 0) / 3);
    const disponivel = Calc.available(fim, prof);
    const meses = gastoMedio > 0 ? disponivel / gastoMedio : (disponivel > 0 ? 6 : 0);
    partes.push({
      chave: 'reserva', nome: 'Reserva de emergência',
      pontos: Math.round(faixa(meses, 0, 6) * 20),
      detalhe: gastoMedio <= 0 ? 'Sem gastos para comparar'
        : 'Cobre ' + (meses < 0 ? '0' : meses.toFixed(1)) + ' meses do seu gasto',
      ok: meses >= 3
    });

    /* 4 · o patrimônio cresce? */
    const agora = Calc.netWorth(fim, prof);
    const antes = Calc.netWorth(U.monthEnd(U.addMonths(ym, -6)), prof);
    const cresceu = antes !== 0 ? ((agora - antes) / Math.abs(antes)) * 100 : (agora > 0 ? 100 : 0);
    partes.push({
      chave: 'patrimonio', nome: 'Patrimônio crescendo',
      pontos: Math.round(faixa(cresceu, -10, 20) * 20),
      detalhe: (cresceu >= 0 ? 'Subiu ' : 'Caiu ') + U.fmtPct(Math.abs(cresceu), 0) + ' em 6 meses',
      ok: cresceu > 0
    });

    /* 5 · contas em dia */
    const hoje = U.todayISO();
    let atrasos = 0;
    prof.cards.forEach((c) => {
      const inv = Calc.invoice(c.id, Calc.currentInvoiceRef(c, ym), prof);
      if (inv && !inv.paid && inv.planned > 0 && inv.dueDate < hoje) atrasos++;
    });
    let negativas = 0;
    prof.accounts.forEach((a) => { if (Calc.accountBalance(a.id, fim, prof) < 0) negativas++; });
    const problemas = atrasos + negativas;
    partes.push({
      chave: 'dia', nome: 'Contas em dia',
      pontos: problemas === 0 ? 20 : Math.max(0, 20 - problemas * 10),
      detalhe: problemas === 0 ? 'Nada vencido e nenhuma conta negativa'
        : (atrasos ? atrasos + ' fatura(s) vencida(s). ' : '') + (negativas ? negativas + ' conta(s) negativa(s).' : ''),
      ok: problemas === 0
    });

    const total = partes.reduce((a, b) => a + b.pontos, 0);
    const faixaNome = total >= 80 ? 'Excelente' : total >= 60 ? 'Saudável'
      : total >= 40 ? 'Atenção' : 'Frágil';
    return { total, faixa: faixaNome, partes };
  };

  /* ------------------------------------------------------------
     Agenda financeira — o que acontece em cada dia de um mês
     ------------------------------------------------------------ */
  Calc.calendarEvents = function (ym, profile) {
    const prof = profile || P();
    const porDia = {};
    const põe = (data, ev) => {
      if (U.ymOf(data) !== ym) return;
      const d = +data.slice(8, 10);
      (porDia[d] = porDia[d] || []).push(ev);
    };

    Calc.entriesForMonth(ym, prof).forEach((e) => {
      põe(e.date, {
        tipo: e.kind === 'income' ? 'in' : e.kind === 'transfer' ? 'tr' : 'out',
        titulo: e.description,
        valor: e.amount,
        confirmado: e.confirmed,
        categoria: Calc.categoryName(e.categoryId, prof),
        txId: e.txId
      });
    });

    prof.cards.forEach((c) => {
      [U.addMonths(ym, -1), ym, U.addMonths(ym, 1)].forEach((base) => {
        const ref = Calc.currentInvoiceRef(c, base);
        const inv = Calc.invoice(c.id, ref, prof);
        if (!inv || inv.planned <= 0) return;
        põe(inv.dueDate, {
          tipo: 'due', titulo: 'Fatura ' + c.name, valor: inv.planned,
          confirmado: inv.paid, categoria: 'Cartão de crédito', cardId: c.id, ref
        });
      });
    });

    Object.keys(porDia).forEach((d) => {
      porDia[d].sort((a, b) => b.valor - a.valor);
    });
    return porDia;
  };

  global.Calc = Calc;
})(window);
