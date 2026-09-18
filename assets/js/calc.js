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

  /* A linha do extrato é desenhada com translate="no" (a descrição
     é da pessoa). As que o próprio app escreve já saem traduzidas. */
  const tr = (texto) => (global.I18n ? global.I18n.t(texto) : texto);

  const Calc = {};
  const P = () => Store.profile();

  /* ============================================================
     0 · MEMÓRIA DE CÁLCULO
     ------------------------------------------------------------
     Quase tudo aqui parte de Calc.entries(), que percorre TODOS os
     lançamentos e expande os fixos mês a mês. Isso é barato uma
     vez e caro trinta vezes — e trinta era o número real: desenhar
     a carteira chamava cardUsed() por cartão, que abre 19 faturas,
     e cada fatura chama entries() de novo. Somando o saldo de cada
     conta, uma tela com 500 lançamentos varria a lista mais de
     cem vezes, e a demora aparecia onde mais incomoda: ao salvar
     uma compra, que redesenha a página inteira.

     A saída não é calcular menos: é não calcular DUAS VEZES a
     mesma coisa entre duas mudanças de dado. A chave é
     Store.revisao(), um contador que sobe a cada commit. Enquanto
     ele não muda, nada mudou, e a resposta guardada continua
     verdadeira. Quando muda, a memória inteira é descartada — sem
     invalidação seletiva, que é onde esse tipo de código erra.

     Só o espaço ATIVO é memorizado: comparar dois espaços é raro e
     não vale o risco de guardar resposta de um perfil e devolver
     para outro.
     ============================================================ */
  let memoRev = -1;
  let memoPid = null;
  let memoDia = null;
  let memo = new Map();

  function lembrar(prof, chave, calcular) {
    const ativo = P();
    if (!ativo || prof !== ativo) return calcular();
    const rev = (global.Store && Store.revisao) ? Store.revisao() : -1;
    /* O dia entra na chave porque "confirmado" depende de hoje (ver
       makeEntry): uma aba aberta de um dia para o outro não pode
       continuar respondendo com o calendário de ontem. */
    const dia = U.todayISO();
    if (rev !== memoRev || ativo.id !== memoPid || dia !== memoDia) {
      memoRev = rev; memoPid = ativo.id; memoDia = dia; memo = new Map();
    }
    if (memo.has(chave)) return memo.get(chave);
    const valor = calcular();
    memo.set(chave, valor);
    return valor;
  }

  /** Descarta a memória à força (testes e depuração). */
  Calc.esquecer = function () { memoRev = -1; memo = new Map(); };

  /* ============================================================
     1 · OCORRÊNCIAS
     ============================================================ */

  /** Data da ocorrência de um lançamento fixo dentro de um mês. */
  function occurrenceDate(tx, ym) {
    const base = U.parseISO(tx.date);
    const p = U.ymParts(ym);
    return U.isoOf(p.y, p.m, U.clampDay(p.y, p.m, base ? base.getDate() : 1));
  }

  /* =============================================================
     SÓ CONTA O QUE FOI PAGO
     -------------------------------------------------------------
     Um lançamento fixo marcado como confirmado fazia TODAS as
     ocorrências dele nascerem confirmadas — inclusive as de dezembro,
     em setembro. O aluguel que ainda não foi pago já entrava no total
     de gastos, e o saldo do mês dizia uma coisa que não aconteceu.

     Agora a ocorrência de um fixo com data DEPOIS de hoje nasce
     prevista, e só entra nos totais quando a pessoa marca como paga
     (occ[mês].confirmed). As de hoje para trás mantêm a regra antiga:
     mudar o passado sumiria com o histórico de quem já usa o app.
     ============================================================= */
  function makeEntry(tx, ym, date) {
    const o = tx.recurring ? (tx.occ[ym] || {}) : null;
    const confirmed = tx.recurring
      ? (o.confirmed === undefined ? (!!tx.confirmed && date <= U.todayISO()) : !!o.confirmed)
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
  /**
   * Uma conta ou um cartão marcado como "fora dos totais" continua
   * com extrato, saldo e fatura — o que ele deixa de fazer é entrar
   * nas receitas e despesas do mês. É o caso da conta da empresa, da
   * conta de terceiros, do cartão que outra pessoa paga: o dinheiro
   * passa pelo banco e não é seu para gastar.
   */
  Calc.origemConsiderada = function (e, profile) {
    const prof = profile || P();
    if (e.method === 'card' && e.cardId) {
      const c = prof.cards.find((x) => x.id === e.cardId);
      return !c || c.considerado !== false;
    }
    const id = e.accountId || e.toAccountId;
    if (!id) return true;
    const a = prof.accounts.find((x) => x.id === id);
    return !a || a.considerado !== false;
  };

  Calc.entries = function (fromISO, toISO, profile) {
    const prof = profile || P();
    return lembrar(prof, 'e|' + fromISO + '|' + toISO,
      () => calcularEntries(fromISO, toISO, prof)).slice();
  };

  function calcularEntries(fromISO, toISO, prof) {
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
    out.forEach((e) => { e.contaNosTotais = Calc.origemConsiderada(e, prof); });
    return out;
  }

  Calc.entriesForMonth = function (ym, profile) {
    return Calc.entries(U.monthStart(ym), U.monthEnd(ym), profile);
  };

  /** Primeira data com movimento (para varreduras "desde sempre"). */
  Calc.earliestDate = function (profile) {
    const prof = profile || P();
    return lembrar(prof, 'ed', () => calcularEarliest(prof));
  };

  function calcularEarliest(prof) {
    let min = null;
    const consider = (d) => { if (d && (!min || d < min)) min = d; };
    prof.transactions.forEach((t) => consider(t.date));
    prof.investments.forEach((i) => consider(i.date));
    prof.accounts.forEach((a) => consider(a.openedAt));
    return min || U.monthStart(U.todayYM());
  }

  /* ============================================================
     2 · TOTAIS DO MÊS
     ============================================================ */

  /**
   * { income, expense, balance, plannedIncome, plannedExpense,
   *   plannedBalance, pendingCount, entries }
   * "planned" = tudo lançado (confirmado ou não).
   */
  Calc.monthTotals = function (ym, profile) {
    const prof = profile || P();
    return lembrar(prof, 'mt|' + ym, () => calcularMonthTotals(ym, prof));
  };

  function calcularMonthTotals(ym, profile) {
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
      if (e.contaNosTotais === false) return;   // conta/cartão fora dos totais
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

    /* ----------------------------------------------------------
       O DINHEIRO QUE REALMENTE SAI NO MÊS
       ----------------------------------------------------------
       Receitas − despesas é o resultado do mês por competência: a
       compra no cartão pesa no mês em que foi feita. Mas quem
       pergunta "quanto sobra este mês" está falando de CAIXA, e no
       caixa a fatura sai inteira no dia em que é paga — inclusive
       a fatura de compras de meses atrás.

       Os dois números convivem porque respondem perguntas
       diferentes, e nenhum deles é "o certo":
         balance     resultado do mês   (competência)
         saldoCaixa  o que sobra agora  (caixa)

       Contar a compra no crédito E a fatura no mesmo saldo seria
       contar o mesmo dinheiro duas vezes — por isso o caixa parte
       das despesas no débito e soma as faturas pagas, nunca as
       compras no crédito.
       ---------------------------------------------------------- */
    const fat = Calc.invoicePaymentsInMonth(ym, profile);
    t.invoicesPaid = fat.total;
    t.invoicePayments = fat.movimentos;
    t.saldoCaixa = U.round2(t.income - t.expenseDebit - t.invoicesPaid);
    t.plannedSaldoCaixa = U.round2(
      t.plannedIncome - U.round2(t.plannedExpense - t.expenseCredit) - t.invoicesPaid);
    return t;
  }

  /**
   * Pagamentos de fatura (e compras adiantadas) com data dentro do
   * mês. É o que a fatura tira do bolso naquele mês, venha a compra
   * de quando vier.
   */
  Calc.invoicePaymentsInMonth = function (ym, profile) {
    const prof = profile || P();
    return lembrar(prof, 'ipm|' + ym, function () {
      const de = U.monthStart(ym), ate = U.monthEnd(ym);
      const movimentos = [];
      let total = 0;
      Object.keys(prof.invoices).forEach((k) => {
        const partes = k.split('|');
        const card = prof.cards.find((c) => c.id === partes[0]);
        if (card && card.considerado === false) return;
        movimentosDoRegistro(prof.invoices[k]).forEach((m) => {
          if (m.at < de || m.at > ate) return;
          total += m.amount;
          movimentos.push(Object.assign({ cardId: partes[0], ref: partes[1] }, m));
        });
      });
      movimentos.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      return { total: U.round2(total), movimentos };
    });
  };

  /** Todos os movimentos de um registro de fatura: pagamentos e adiantamentos. */
  function movimentosDoRegistro(reg) {
    if (!reg) return [];
    const lista = (reg.pagamentos || []).map((m) => Object.assign({ tipo: 'fatura' }, m));
    Object.keys(reg.adiantamentos || {}).forEach((chave) => {
      lista.push(Object.assign({ tipo: 'adiantamento', chave }, reg.adiantamentos[chave]));
    });
    return lista;
  }
  Calc.invoiceMovements = movimentosDoRegistro;

  /** Fluxo operacional acumulado (confirmado) até uma data, inclusive. */
  Calc.cumulativeFlow = function (uptoISO, profile) {
    const prof = profile || P();
    return lembrar(prof, 'cf|' + uptoISO, () => calcularCumulativeFlow(uptoISO, prof));
  };

  function calcularCumulativeFlow(uptoISO, prof) {
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
  }

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
  /**
   * Totais por categoria no intervalo.
   * -> [{ id, name, color, total, count, pct }] ordenado desc.
   */
  Calc.categoryTotals = function (kind, fromISO, toISO, profile) {
    const prof = profile || P();
    const map = new Map();
    Calc.entries(fromISO, toISO, prof).forEach((e) => {
      if (e.kind !== kind || !e.confirmed || e.contaNosTotais === false) return;
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
      if (e.kind !== 'expense' || !e.confirmed || e.contaNosTotais === false) return;
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
    const upto = uptoISO || U.todayISO();
    return lembrar(prof, 'ab|' + accountId + '|' + upto,
      () => calcularAccountBalance(accountId, upto, prof));
  };

  function calcularAccountBalance(accountId, upto, prof) {
    const acc = prof.accounts.find((a) => a.id === accountId);
    if (!acc) return 0;
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

    // faturas pagas e compras adiantadas debitadas desta conta
    Object.keys(prof.invoices).forEach((k) => {
      movimentosDoRegistro(prof.invoices[k]).forEach((m) => {
        if (m.accountId === accountId && m.at <= upto) bal -= m.amount;
      });
    });

    // aportes debitados desta conta
    prof.investments.forEach((iv) => {
      if (iv.accountId === accountId && iv.date <= upto) bal -= (+iv.amount || 0);
    });

    // dinheiro guardado em metas, quando a pessoa disse de onde ele saiu
    prof.goals.forEach((g) => {
      (g.deposits || []).forEach((d) => {
        if (d.accountId === accountId && d.at <= upto) bal -= d.amount;
      });
    });

    return U.round2(bal);
  }

  Calc.totalAccountsBalance = function (uptoISO, profile) {
    const prof = profile || P();
    return U.round2(prof.accounts.filter((a) => !a.archived)
      .reduce((s, a) => s + Calc.accountBalance(a.id, uptoISO, prof), 0));
  };

  /* =============================================================
     SALDO ATUAL E "SE TUDO SE CONFIRMAR"
     -------------------------------------------------------------
     O número em destaque do painel. Saldo atual é o que está nas
     contas agora, com as receitas e despesas do mês que já foram
     marcadas como recebidas ou pagas — nada previsto entra. Contas
     marcadas "fora dos totais" não entram: o dinheiro da empresa ou
     de terceiros não é saldo seu.

     A projeção responde "e se tudo o que está lançado acontecer?":
     parte do saldo no último dia do mês (confirmados com data futura
     incluídos), soma as receitas previstas, tira as despesas
     previstas no débito e o que ainda falta pagar das faturas que
     vencem no mês. Compra no crédito não sai da conta: quem sai é a
     fatura, e por isso ela entra pelo vencimento, uma vez só.
     ============================================================= */
  function contasConsideradas(prof) {
    return prof.accounts.filter((a) => !a.archived && a.considerado !== false);
  }

  Calc.currentBalance = function (atISO, profile) {
    const prof = profile || P();
    const ate = atISO || U.todayISO();
    return U.round2(contasConsideradas(prof)
      .reduce((s, a) => s + Calc.accountBalance(a.id, ate, prof), 0));
  };

  Calc.monthProjection = function (ym, profile) {
    const prof = profile || P();
    return lembrar(prof, 'proj|' + ym, function () {
      const fim = U.monthEnd(ym);
      const ids = new Set(contasConsideradas(prof).map((a) => a.id));
      let receber = 0, pagar = 0, faturas = 0;

      Calc.entriesForMonth(ym, prof).forEach((e) => {
        if (e.confirmed) return;
        if (e.kind === 'income' && ids.has(e.accountId)) receber += e.amount;
        else if (e.kind === 'expense' && e.method === 'account' && ids.has(e.accountId)) pagar += e.amount;
        else if (e.kind === 'transfer') {
          if (ids.has(e.accountId) && !ids.has(e.toAccountId)) pagar += e.amount;
          if (!ids.has(e.accountId) && ids.has(e.toAccountId)) receber += e.amount;
        }
      });

      prof.cards.forEach((c) => {
        if (c.considerado === false) return;
        for (let k = -1; k <= 2; k++) {
          const ref = U.addMonths(ym, k);
          const inv = Calc.invoice(c.id, ref, prof);
          if (!inv || inv.paid || inv.restante <= 0) continue;
          if (U.ymOf(inv.dueDate) === ym) faturas += inv.restante;
        }
      });

      const base = Calc.currentBalance(fim, prof);
      return {
        base,
        receber: U.round2(receber),
        pagar: U.round2(pagar),
        faturas: U.round2(faturas),
        saldo: U.round2(base + receber - pagar - faturas)
      };
    });
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
        date: acc.openedAt, desc: tr('Saldo inicial da conta'), cat: 'Abertura',
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
      const cardId = k.split('|')[0];
      const ref = k.split('|')[1];
      const card = prof.cards.find((c) => c.id === cardId);
      const nome = card ? card.name : 'cartão';
      movimentosDoRegistro(prof.invoices[k]).forEach((m) => {
        if (m.accountId !== accountId) return;
        if (m.at < fromISO || m.at > toISO) return;
        rows.push({
          date: m.at,
          desc: m.tipo === 'adiantamento'
            ? tr(`Compra adiantada ${nome} (fatura de ${U.monthLabel(ref, true)})`)
            : tr(`Pagamento fatura ${nome} (${U.monthLabel(ref, true)})`),
          cat: 'Fatura', delta: -m.amount
        });
      });
    });

    prof.investments.forEach((iv) => {
      if (iv.accountId !== accountId) return;
      if (iv.date < fromISO || iv.date > toISO) return;
      rows.push({ date: iv.date, desc: tr(`Aporte: ${iv.name}`), cat: 'Investimento', delta: -(+iv.amount || 0) });
    });

    prof.goals.forEach((g) => {
      (g.deposits || []).forEach((d) => {
        if (d.accountId !== accountId) return;
        if (d.at < fromISO || d.at > toISO) return;
        rows.push({ date: d.at, desc: tr(`Guardado em ${g.name}`), cat: 'Reserva', delta: -d.amount });
      });
    });

    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = Calc.accountBalance(accountId, U.addDaysISO(fromISO, -1), prof);
    rows.forEach((r) => { running = U.round2(running + r.delta); r.balance = running; });
    return rows;
  };

  /* ============================================================
     5 · CARTÕES E FATURAS
     ============================================================ */

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
  /**
   * A fatura em que uma compra vai ser cobrada. É o inverso de
   * invoiceDates: a pessoa pensa "comprei dia 28, cai em qual
   * fatura?", e essa pergunta não tem resposta óbvia quando o
   * fechamento é dia 25 e o vencimento é dia 5 do mês seguinte.
   */
  Calc.invoiceRefOfDate = function (card, dateISO) {
    const base = U.ymOf(dateISO);
    for (let k = -1; k <= 3; k++) {
      const ref = U.addMonths(base, k);
      const d = Calc.invoiceDates(card, ref);
      if (dateISO >= d.openDate && dateISO <= d.closeDate) return ref;
    }
    return base;
  };

  /**
   * Como uma data de lançamento aparece nas listas. Compra no cartão
   * não mostra o dia em que foi feita: mostra a fatura em que vai ser
   * cobrada — "fatura jan/26" —, que é o que a pessoa procura. O dia
   * da compra continua guardado e é por ele que o Calc calcula.
   */
  Calc.dataDeExibicao = function (e, completa, profile) {
    if (e.kind === 'expense' && e.method === 'card' && e.cardId) {
      const card = (profile || P()).cards.find((c) => c.id === e.cardId);
      if (card) return 'fatura ' + U.monthLabel(Calc.invoiceRefOfDate(card, e.date), true);
    }
    return completa ? U.fmtDateBR(e.date) : U.fmtDayMonth(e.date);
  };

  /**
   * A data a guardar quando a pessoa escolhe só a FATURA. O cálculo
   * precisa de um dia (é por ele que a compra cai num ciclo); a
   * pessoa não precisa dar um. Fica o dia preferido se ele já está
   * no ciclo (o original, ao editar), senão hoje se hoje está nele,
   * senão a ponta do ciclo mais perto de hoje.
   */
  Calc.dateForInvoice = function (card, ref, preferida) {
    const d = Calc.invoiceDates(card, ref);
    if (preferida && U.isValidISO(preferida) && preferida >= d.openDate && preferida <= d.closeDate) return preferida;
    const hoje = U.todayISO();
    if (hoje >= d.openDate && hoje <= d.closeDate) return hoje;
    return hoje > d.closeDate ? d.closeDate : d.openDate;
  };

  Calc.invoice = function (cardId, ref, profile) {
    const prof = profile || P();
    return lembrar(prof, 'iv|' + cardId + '|' + ref, () => calcularInvoice(cardId, ref, prof));
  };

  function calcularInvoice(cardId, ref, prof) {
    const card = prof.cards.find((c) => c.id === cardId);
    if (!card) return null;
    const dates = Calc.invoiceDates(card, ref);
    const items = Calc.entries(dates.openDate, dates.closeDate, prof)
      .filter((e) => e.kind === 'expense' && e.cardId === cardId);

    const total = U.round2(U.sum(items.filter((i) => i.confirmed), (i) => i.amount));
    const planned = U.round2(U.sum(items, (i) => i.amount));
    const rec = prof.invoices[Store.invoiceKey(cardId, ref)] || null;
    const today = U.todayISO();

    /* Cada item sabe se já foi adiantado, e por quanto: é o que
       permite dizer, item a item, "esta compra já está paga" e
       "desta aqui ainda falta metade". */
    const adiantamentos = (rec && rec.adiantamentos) || {};
    let pagoAdiantado = 0;
    items.forEach((e) => {
      const m = adiantamentos[e.key];
      e.adiantado = m ? m.amount : 0;
      e.adiantadoEm = m ? m.at : null;
      e.adiantadoDaConta = m ? m.accountId : null;
      if (m) pagoAdiantado += m.amount;
    });

    const pagoFatura = U.round2(U.sum((rec && rec.pagamentos) || [], (m) => m.amount));
    pagoAdiantado = U.round2(pagoAdiantado);
    const pago = U.round2(pagoFatura + pagoAdiantado);
    const restante = U.round2(Math.max(0, planned - pago));
    /* Quitada por decisão da pessoa, ou porque o que saiu já cobre
       o que entrou. O centavo de folga existe porque arredondamento
       não pode transformar fatura paga em fatura em aberto. */
    const paid = !!(rec && rec.quitada) || (planned > 0 && pago >= U.round2(planned - 0.005));
    const ultimo = (rec && rec.pagamentos && rec.pagamentos.length)
      ? rec.pagamentos[rec.pagamentos.length - 1] : null;

    /* Cartão internacional: a fatura também na moeda dele. Cada compra
       guarda o valor original; as antigas, sem ele, entram pela cotação
       atual do cartão. O que falta pagar segue a mesma proporção, porque
       os pagamentos são registrados em reais. */
    const moeda = card.moeda && card.moeda !== 'BRL' ? card.moeda : null;
    let plannedMoeda = 0, restanteMoeda = 0;
    if (moeda) {
      items.forEach((e) => {
        if (e.tx && e.tx.moeda === moeda && e.tx.valorMoeda) plannedMoeda += e.tx.valorMoeda;
        else if (card.cotacao) plannedMoeda += e.amount / card.cotacao;
      });
      plannedMoeda = U.round2(plannedMoeda);
      restanteMoeda = planned > 0 ? U.round2(plannedMoeda * restante / planned) : 0;
    }

    return {
      card, ref, items,
      moeda, plannedMoeda, restanteMoeda,
      openDate: dates.openDate, closeDate: dates.closeDate, dueDate: dates.dueDate,
      total, planned,
      pagamentos: (rec && rec.pagamentos) || [],
      adiantamentos,
      pagoFatura, pagoAdiantado, pago, restante,
      parcial: !paid && pago > 0,
      paid,
      paidAt: ultimo ? ultimo.at : null,
      paidAmount: pago,
      paidAccountId: ultimo ? ultimo.accountId : (card.accountId || null),
      isOpen: today <= dates.closeDate,
      isOverdue: !paid && today > dates.dueDate && restante > 0
    };
  }

  /** Limite comprometido: o que ainda falta pagar nas faturas do período. */
  Calc.cardUsed = function (cardId, profile) {
    const prof = profile || P();
    return lembrar(prof, 'cu|' + cardId, function () {
      const card = prof.cards.find((c) => c.id === cardId);
      if (!card) return 0;
      const today = U.todayYM();
      let used = 0;
      for (let k = -6; k <= 12; k++) {
        const ref = U.addMonths(today, k);
        const inv = Calc.invoice(cardId, ref, prof);
        if (inv && !inv.paid) used += inv.restante;
      }
      return U.round2(used);
    });
  };

  /**
   * Fatura "atual": a primeira que tem algo a pagar. Se nenhuma tem,
   * a que ainda está recebendo compras.
   *
   * A regra anterior devolvia a primeira NÃO PAGA — e uma fatura
   * vazia nunca está paga, então o cartão abria numa fatura de R$ 0
   * enquanto as compras do mês estavam na seguinte. O primeiro
   * ciclo de um cartão novo caía sempre nisso.
   */
  Calc.currentInvoiceRef = function (card, baseYM, profile) {
    const base = baseYM || U.todayYM();
    let aberta = null;
    for (let k = 0; k <= 3; k++) {
      const ref = U.addMonths(base, k);
      const inv = Calc.invoice(card.id, ref, profile);
      if (!inv) continue;
      if (!inv.paid && inv.planned > 0) return ref;
      if (!aberta && inv.isOpen) aberta = ref;
    }
    return aberta || base;
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
    return U.round2(contas + investido + Calc.reservedFromAccounts(atISO, prof)
      - U.round2(faturas));
  };

  /**
   * Dinheiro guardado em metas que SAIU de uma conta. Ele já foi
   * descontado do saldo dela, então precisa voltar aqui: reservar
   * não empobrece ninguém, só muda o dinheiro de lugar. Aportes
   * sem conta de origem não entram — aqueles nunca saíram de nada.
   */
  Calc.reservedFromAccounts = function (atISO, profile) {
    const prof = profile || P();
    const ate = atISO || U.todayISO();
    let total = 0;
    prof.goals.forEach((g) => {
      (g.deposits || []).forEach((d) => {
        if (d.accountId && d.at <= ate) total += d.amount;
      });
    });
    return U.round2(total);
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
      if (inv && !inv.paid && inv.restante > 0 && inv.dueDate < hoje) atrasos++;
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
          /* Com pagamento parcial, o que interessa no dia do
             vencimento é o que ainda falta sair — não o total que a
             fatura teve. */
          tipo: 'due', titulo: 'Fatura ' + c.name,
          valor: inv.restante > 0 ? inv.restante : inv.planned,
          parcial: inv.parcial,
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
