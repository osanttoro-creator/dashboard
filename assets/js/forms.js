/* =============================================================
   forms.js — todos os modais de cadastro e lançamento
   ============================================================= */
(function (global) {
  'use strict';

  const Forms = {};
  const el = U.el;

  /* ---------------- construtores de campo ---------------- */

  function field(labelText, control, opts) {
    const o = opts || {};
    const wrap = el('div', { class: 'field' + (o.span2 ? ' span-2' : '') }, [
      el('span', { class: 'field-label', text: labelText }),
      control
    ]);
    if (o.hint) wrap.appendChild(el('p', { class: 'hint', text: o.hint }));
    const err = el('span', { class: 'field-error' });
    err.hidden = true;
    wrap.appendChild(err);
    wrap._error = err;
    wrap._control = control;
    return wrap;
  }

  function input(attrs) { return el('input', Object.assign({ class: 'input', type: 'text' }, attrs)); }

  function moneyInput(value) {
    const i = input({ inputmode: 'decimal', placeholder: '0,00', value: value != null ? U.fmtNum(value) : '' });
    i.addEventListener('blur', () => {
      const n = U.parseMoney(i.value);
      if (n != null) i.value = U.fmtNum(Math.abs(n));
    });
    return i;
  }

  function select(options, value, placeholder) {
    const s = el('select', { class: 'input' });
    UI.fillSelect(s, options, value, placeholder);
    return s;
  }

  function checkbox(labelText, checked) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!checked;
    const wrap = el('label', { class: 'check' }, [cb, el('span', { text: labelText })]);
    wrap._input = cb;
    return wrap;
  }

  /**
   * Seletor de cor do cartão de carteira. Serve ao cartão de crédito e à
   * conta de débito — as duas coisas são desenhadas com o mesmo material.
   * "auto" deixa a cor ser deduzida do banco escolhido.
   */
  function gradPicker(initialKey, onChange) {
    const wrap = el('div', { class: 'grad-picker' });
    let atual = initialKey || null;

    function paint() {
      U.clear(wrap);
      wrap.appendChild(el('button', {
        type: 'button', class: 'grad-opt is-auto' + (atual ? '' : ' is-active'),
        title: 'Automático — deriva do banco escolhido',
        onclick: () => { atual = null; paint(); if (onChange) onChange(null); }
      }, el('span', { text: 'auto' })));
      Cards.GRADIENTS.forEach((g) => {
        wrap.appendChild(el('button', {
          type: 'button', class: 'grad-opt' + (atual === g.key ? ' is-active' : ''),
          title: g.name, 'aria-label': 'Cor ' + g.name,
          style: { background: `linear-gradient(140deg, ${g.a}, ${g.b})` },
          onclick: () => { atual = g.key; paint(); if (onChange) onChange(g.key); }
        }));
      });
    }
    paint();
    wrap.getValue = () => atual;
    return wrap;
  }

  /** Grade de ícones Lucide para escolher o da categoria. */
  function iconPicker(initial, kindGetter, nameGetter) {
    let current = initial || null;
    const wrap = el('div', { class: 'icon-picker' });

    const auto = el('button', {
      type: 'button', class: 'icon-opt is-auto' + (current ? '' : ' is-active'),
      title: 'Automático — deduz pelo nome da categoria',
      onclick: () => { current = null; paint(); }
    });

    function paint() {
      U.clear(wrap);
      U.clear(auto);
      auto.appendChild(Icons.lucide(Icons.guessCategory(nameGetter(), kindGetter()), 17));
      auto.appendChild(el('span', { class: 'auto-tag', text: 'auto' }));
      auto.classList.toggle('is-active', !current);
      wrap.appendChild(auto);

      Icons.PICKER.forEach((grupo) => {
        wrap.appendChild(el('span', { class: 'icon-group-label', text: grupo.grupo }));
        grupo.nomes.forEach((n) => {
          if (!Icons.has(n)) return;
          wrap.appendChild(el('button', {
            type: 'button', class: 'icon-opt' + (current === n ? ' is-active' : ''),
            title: n, 'aria-label': n,
            onclick: () => { current = n; paint(); }
          }, Icons.lucide(n, 17)));
        });
      });
    }
    paint();
    wrap.getValue = () => current;
    wrap.refreshAuto = paint;
    return wrap;
  }

  function setError(fieldNode, message) {
    if (!fieldNode) return;
    fieldNode._error.textContent = message || '';
    fieldNode._error.hidden = !message;
    fieldNode._control.classList.toggle('is-invalid', !!message);
  }
  function clearErrors(nodes) { nodes.forEach((n) => setError(n, '')); }

  /* ---------------- listas de opções ---------------- */

  const accountOptions = (includeArchived) => Store.profile().accounts
    .filter((a) => includeArchived || !a.archived)
    .map((a) => ({ value: a.id, label: a.bank ? `${a.name} · ${a.bank}` : a.name }));

  const cardOptions = () => Store.profile().cards.map((c) => ({ value: c.id, label: c.name }));

  const categoryOptions = (kind) => Store.profile().categories
    .filter((c) => c.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((c) => ({ value: c.id, label: c.name }));

  /* ============================================================
     LANÇAMENTO (receita / despesa / transferência)
     ============================================================ */

  Forms.openTransaction = function (kind, txId, defaults) {
    const prof = Store.profile();
    const editing = txId ? Store.transactions.get(txId) : null;
    const d = defaults || {};
    let currentKind = editing ? editing.kind : (kind || 'expense');
    let method = editing ? editing.method : (d.method || 'account');

    if (!prof.accounts.length && !prof.cards.length) {
      UI.toast('Cadastre uma conta ou cartão antes de lançar.', 'error');
      App.goTo('accounts');
      return;
    }

    /* --- campos --- */
    const fDesc = field('Descrição *', input({
      placeholder: 'Ex.: Supermercado', maxlength: 90,
      value: editing ? editing.description : (d.description || '')
    }), { span2: true });

    const fAmount = field('Valor (R$) *', moneyInput(editing
      ? (editing.moeda && editing.valorMoeda ? editing.valorMoeda : editing.amount) : d.amount));
    /* Lançamento em outra moeda: o valor é digitado na moeda do cartão
       — ou da CONTA, desde 20/09/2026 — e o equivalente em reais
       aparece embaixo, já com a cotação do cadastro. É esse equivalente
       que vai para os totais.

       Numa transferência, quem manda é a conta de ORIGEM: é dela que o
       dinheiro sai, e é na moeda dela que a pessoa sabe quanto foi. */
    const conversao = el('p', { class: 'hint', role: 'status', hidden: true });
    fAmount.appendChild(conversao);
    function instrumentoEstrangeiro() {
      const alvo = currentKind === 'expense' && method === 'card'
        ? Store.cards.get(fCard._control.value)
        : Store.accounts.get(fAccount._control.value);
      return alvo && alvo.moeda && alvo.moeda !== 'BRL' ? alvo : null;
    }
    function syncMoedaDaCompra() {
      const c = instrumentoEstrangeiro();
      fAmount.querySelector('.field-label').textContent = 'Valor (' + (c ? c.moeda : 'R$') + ') *';
      conversao.hidden = !c;
      if (!c) return;
      const v = U.parseMoney(fAmount._control.value) || 0;
      conversao.textContent = c.cotacao
        ? '≈ ' + U.fmtBRL(v * c.cotacao) + ' nos totais, pela cotação de ' + U.fmtBRL(c.cotacao) + ' por 1 ' + c.moeda + '.'
        : 'Sem cotação cadastrada: cadastre uma para converter em reais.';
    }
    fAmount._control.addEventListener('input', () => syncMoedaDaCompra());
    const fDate = field('Data *', input({ type: 'date', value: editing ? editing.date : (d.date || App.selectedDateOrToday()) }));

    const fCategory = field('Categoria', select(categoryOptions(currentKind),
      editing ? editing.categoryId : d.categoryId, 'Sem categoria'));

    const methodSeg = UI.segmented(
      [{ value: 'account', label: '⌂ Débito' }, { value: 'card', label: '▭ Crédito' }],
      method, (v) => { method = v; syncVisibility(); }
    );
    const methodHint = el('p', { class: 'hint method-hint' });
    const fMethod = field('Forma de pagamento', methodSeg);
    fMethod.appendChild(methodHint);

    const fAccount = field('Conta', select(accountOptions(),
      editing ? editing.accountId : d.accountId,
      prof.accounts.length ? (d.requireOrigin ? 'Escolha uma conta…' : null) : 'Nenhuma conta'));
    const fCard = field('Cartão', select(cardOptions(),
      editing ? editing.cardId : d.cardId,
      prof.cards.length ? (d.requireOrigin ? 'Escolha um cartão…' : null) : 'Nenhum cartão'));
    /* ============================================================
       NO CRÉDITO, A PESSOA ESCOLHE A FATURA — NÃO O DIA
       ------------------------------------------------------------
       Quem lança uma compra no cartão pensa em "cai na fatura de
       janeiro", não em "foi dia 27 de dezembro". Pedir o dia obrigava
       a fazer de cabeça a conta do fechamento — e errar de fatura.
       Com Crédito marcado, o campo de data dá lugar a um seletor de
       fatura (mês/ano). O dia continua existindo por baixo, porque é
       por ele que o cálculo decide o ciclo: Calc.dateForInvoice
       escolhe um dia dentro da fatura escolhida (o original, ao
       editar; hoje, se hoje está nela).
       ============================================================ */
    const fFatura = field('Fatura *', el('select', { class: 'input' }));
    const faturaAviso = el('p', { class: 'hint hint-fatura span-2', role: 'status', hidden: true });
    let refEscolhida = null;

    function cartaoEscolhido() { return Store.cards.get(fCard._control.value) || null; }

    function refInicial(card) {
      const base = editing && editing.method === 'card' ? editing.date
        : (d.date || App.selectedDateOrToday());
      return Calc.invoiceRefOfDate(card, base);
    }

    function preencheFaturas() {
      const card = cartaoEscolhido();
      if (!card) return;
      if (!refEscolhida) refEscolhida = refInicial(card);
      const hojeRef = Calc.invoiceRefOfDate(card, U.todayISO());
      const opcoes = [];
      for (let k = -12; k <= 36; k++) {
        const ref = U.addMonths(hojeRef, k);
        opcoes.push({ value: ref, label: 'fatura de ' + U.monthLabel(ref, true) });
      }
      if (!opcoes.some((o) => o.value === refEscolhida)) {
        opcoes.push({ value: refEscolhida, label: 'fatura de ' + U.monthLabel(refEscolhida, true) });
        opcoes.sort((a, b) => (a.value < b.value ? -1 : 1));
      }
      UI.fillSelect(fFatura._control, opcoes, refEscolhida);
    }
    fFatura._control.addEventListener('change', () => { refEscolhida = fFatura._control.value; avisaFatura(); });
    const fToAccount = field('Conta de destino', select(accountOptions(),
      editing ? editing.toAccountId : d.toAccountId, 'Escolha…'));

    const cbRecurring = checkbox('Repetir todo mês (lançamento fixo)',
      editing ? editing.recurring : !!d.recurring);
    const fRecurEnd = field('Repetir até (opcional)', input({
      type: 'month', value: editing && editing.recurEnd ? editing.recurEnd : ''
    }), { hint: 'Em branco = sem data final.' });

    const fInstallments = field('Parcelar em', input({
      type: 'number', min: 1, max: 72, value: editing && editing.installment ? editing.installment.total : 1
    }), { hint: 'O valor informado é o TOTAL; será dividido nas parcelas.' });

    /* "Confirmado" não dizia o que confirmava. Agora diz: pago,
       recebido, compra feita. É esta marca, e só ela, que põe o
       lançamento nos totais — e um lançamento com data futura nasce
       desmarcado, porque ninguém pagou ainda a conta de daqui a um mês. */
    const dataInicial = editing ? editing.date : (d.date || App.selectedDateOrToday());
    const cbConfirmed = checkbox('Já foi pago (entra nos totais)',
      editing ? editing.confirmed
        : (d.confirmed !== undefined ? d.confirmed : dataInicial <= U.todayISO()));
    let marcouAMao = !!editing || d.confirmed !== undefined;
    cbConfirmed._input.addEventListener('change', () => { marcouAMao = true; });

    const fNotes = field('Observações', el('textarea', {
      class: 'input textarea textarea-plain', rows: 2,
      text: editing ? editing.notes : ''
    }), { span2: true });

    const kindSeg = UI.segmented([
      { value: 'expense', label: 'Despesa' },
      { value: 'income', label: 'Receita' },
      { value: 'transfer', label: 'Transferência' }
    ], currentKind, (v) => {
      currentKind = v;
      UI.fillSelect(fCategory._control, categoryOptions(v), null, 'Sem categoria');
      syncVisibility();
    });

    const recurNote = el('p', {
      class: 'hint span-2',
      text: 'Este lançamento é fixo: alterar aqui muda todas as ocorrências. Para mudar só um mês, edite o valor pela lista.'
    });
    recurNote.hidden = !(editing && editing.recurring);

    const grid = el('div', { class: 'form-grid' }, [
      el('div', { class: 'field span-2' }, [el('span', { class: 'field-label', text: 'Tipo' }), kindSeg]),
      fDesc, fAmount, fDate, fCategory, fMethod, fAccount, fCard, fFatura, fToAccount, faturaAviso,
      el('div', { class: 'field span-2' }, cbRecurring),
      fRecurEnd, fInstallments,
      el('div', { class: 'field span-2' }, cbConfirmed),
      fNotes, recurNote
    ]);

    function syncVisibility() {
      const isTransfer = currentKind === 'transfer';
      const isExpense = currentKind === 'expense';
      const useCard = isExpense && method === 'card';
      cbConfirmed.querySelector('span').textContent = isTransfer ? 'Já foi feita (entra nos saldos)'
        : currentKind === 'income' ? 'Já foi recebido (entra nos totais)'
          : useCard ? 'Compra já feita (entra nos totais)' : 'Já foi pago (entra nos totais)';

      fCategory.hidden = isTransfer;
      fMethod.hidden = !isExpense || !prof.cards.length;
      if (!isExpense) method = 'account';
      fCard.hidden = !useCard;
      fAccount.hidden = useCard;
      fDate.hidden = useCard;
      fFatura.hidden = !useCard;
      if (useCard) preencheFaturas();
      syncMoedaDaCompra();
      fAccount.querySelector('.field-label').textContent = isTransfer ? 'Conta de origem' : 'Conta';
      fToAccount.hidden = !isTransfer;
      fInstallments.hidden = !isExpense || cbRecurring._input.checked || !!editing;
      fRecurEnd.hidden = !cbRecurring._input.checked;

      // deixa explícito o efeito contábil de cada forma de pagamento
      methodHint.textContent = useCard
        ? 'Crédito: entra na fatura escolhida abaixo e não mexe no saldo da conta agora. '
          + 'O dinheiro sai do caixa quando a fatura for paga.'
        : 'Débito: sai direto da conta bancária e reduz o saldo dela na hora.';
      avisaFatura();
    }

    /* A pergunta que a data não responde: em QUAL fatura isto cai.
       Com fechamento no dia 28, uma compra do dia 29 é cobrada só no
       mês seguinte — e é esse mês que a pessoa procura. */
    function avisaFatura() {
      const useCard = currentKind === 'expense' && method === 'card';
      const card = useCard ? cartaoEscolhido() : null;
      if (!card || !refEscolhida) { faturaAviso.hidden = true; return; }
      const venc = Calc.invoiceDates(card, refEscolhida).dueDate;
      const n = Math.max(1, Math.min(72, parseInt(fInstallments._control.value, 10) || 1));
      faturaAviso.hidden = false;
      faturaAviso.textContent = !fInstallments.hidden && n > 1
        ? 'Parcelas da fatura de ' + U.monthLabel(refEscolhida, true) + ' à de '
          + U.monthLabel(U.addMonths(refEscolhida, n - 1), true) + '. A primeira vence em ' + U.fmtDateBR(venc) + '.'
        : 'Vence em ' + U.fmtDateBR(venc) + '.';
    }
    fCard._control.addEventListener('change', () => { preencheFaturas(); avisaFatura(); syncMoedaDaCompra(); });
    /* Trocar de conta troca a moeda do valor: sem isto, quem escolhe a
       conta em dólar depois de digitar vê "Valor (R$)" e lança errado. */
    fAccount._control.addEventListener('change', syncMoedaDaCompra);
    fDate._control.addEventListener('change', () => {
      if (!marcouAMao && U.isValidISO(fDate._control.value)) {
        cbConfirmed._input.checked = fDate._control.value <= U.todayISO();
      }
    });
    fInstallments._control.addEventListener('input', avisaFatura);
    cbRecurring._input.addEventListener('change', syncVisibility);
    syncVisibility();

    /* --- salvar --- */
    function submit(closeAfter) {
      const all = [fDesc, fAmount, fDate, fFatura, fAccount, fCard, fToAccount, fInstallments];
      clearErrors(all);
      let ok = true;

      const description = fDesc._control.value.trim();
      if (!description) { setError(fDesc, 'Informe uma descrição.'); ok = false; }

      const amount = U.parseMoney(fAmount._control.value);
      if (amount == null || Math.abs(amount) < 0.01) { setError(fAmount, 'Informe um valor maior que zero.'); ok = false; }

      const useCard = currentKind === 'expense' && method === 'card';
      const accountId = fAccount._control.value || null;
      const cardId = fCard._control.value || null;

      let date = fDate._control.value;
      if (useCard) {
        const cartao = Store.cards.get(cardId);
        if (cartao && refEscolhida) {
          const preferida = editing && editing.method === 'card' ? editing.date : (d.date || null);
          date = Calc.dateForInvoice(cartao, refEscolhida, preferida);
        } else if (!refEscolhida) { setError(fFatura, 'Escolha a fatura.'); ok = false; }
      } else if (!U.isValidISO(date)) { setError(fDate, 'Data inválida.'); ok = false; }
      const toAccountId = fToAccount._control.value || null;

      if (useCard && !cardId) { setError(fCard, 'Escolha um cartão.'); ok = false; }
      if (!useCard && !accountId) { setError(fAccount, 'Escolha uma conta.'); ok = false; }
      if (currentKind === 'transfer') {
        if (!toAccountId) { setError(fToAccount, 'Escolha a conta de destino.'); ok = false; }
        else if (toAccountId === accountId) { setError(fToAccount, 'Origem e destino devem ser diferentes.'); ok = false; }
      }

      const nInst = Math.max(1, Math.min(72, parseInt(fInstallments._control.value, 10) || 1));
      if (!fInstallments.hidden && nInst > 1 && Math.abs(amount || 0) / nInst < 0.01) {
        setError(fInstallments, 'Parcela ficaria menor que R$ 0,01.'); ok = false;
      }
      if (!ok) return false;

      /* Recorrência é o único limite de plano que não estava sendo
         aplicado: o teto existia no banco (3 no Grátis) e o
         Limites.contar já sabia contá-las, mas nada chamava
         exigirEspaco. Dava para criar quantas quisesse.

         A checagem só vale para NOVAS: editar uma recorrência que já
         existe não aumenta o total, e barrar aí seria prender a
         pessoa num registro que ela não pode nem corrigir. */
      const viraRecorrente = cbRecurring._input.checked;
      const jaEraRecorrente = !!(editing && editing.recurring);
      if (viraRecorrente && !jaEraRecorrente &&
          global.Limites && !Limites.exigirEspaco('recurring_items')) return false;

      /* Em cartão ou conta de outra moeda, o digitado é o valor na
         moeda; o `amount` guardado é o equivalente em reais, que é o
         que os totais somam. Sem cotação não há como converter: pede
         antes de deixar salvar. */
      const estrangeiro = instrumentoEstrangeiro();
      if (estrangeiro && !estrangeiro.cotacao) {
        setError(fAmount, 'Cadastre a cotação de ' + estrangeiro.name + ' antes de lançar em ' + estrangeiro.moeda + '.');
        return false;
      }
      const emReais = (v) => (estrangeiro ? U.round2(v * estrangeiro.cotacao) : v);
      const base = {
        kind: currentKind,
        description,
        amount: emReais(Math.abs(amount)),
        moeda: estrangeiro ? estrangeiro.moeda : null,
        valorMoeda: estrangeiro ? U.round2(Math.abs(amount)) : null,
        date,
        categoryId: currentKind === 'transfer' ? null : (fCategory._control.value || null),
        accountId: useCard ? null : accountId,
        cardId: useCard ? cardId : null,
        toAccountId: currentKind === 'transfer' ? toAccountId : null,
        recurring: cbRecurring._input.checked,
        recurEnd: cbRecurring._input.checked ? (fRecurEnd._control.value || null) : null,
        confirmed: cbConfirmed._input.checked,
        notes: fNotes._control.value.trim(),
        source: editing ? (editing.source || 'manual') : (d.source || 'manual')
      };

      if (editing) {
        Store.transactions.update(editing.id, base);
        UI.toast('Lançamento atualizado.', 'success');
      } else if (!base.recurring && nInst > 1) {
        const groupId = U.uid('grp');
        const cents = Math.round(Math.abs(amount) * 100);
        const per = Math.floor(cents / nInst);
        const list = [];
        for (let k = 0; k < nInst; k++) {
          const value = (k === nInst - 1 ? cents - per * (nInst - 1) : per) / 100;
          const q = U.ymParts(U.addMonths(U.ymOf(date), k));
          const day = U.parseISO(date).getDate();
          list.push(Object.assign({}, base, {
            amount: emReais(value),
            valorMoeda: estrangeiro ? value : null,
            date: U.isoOf(q.y, q.m, U.clampDay(q.y, q.m, day)),
            description: `${description} (${k + 1}/${nInst})`,
            installment: { total: nInst, index: k + 1, groupId },
            confirmed: k === 0 ? base.confirmed : false
          }));
        }
        Store.transactions.addMany(list);
        UI.toast(`${nInst} parcelas lançadas.`, 'success');
      } else {
        Store.transactions.add(base);
        UI.toast(currentKind === 'income' ? 'Receita lançada.' : currentKind === 'transfer' ? 'Transferência lançada.' : 'Despesa lançada.', 'success');
      }

      if (closeAfter) UI.closeModal();
      else {
        fDesc._control.value = '';
        fAmount._control.value = '';
        fNotes._control.value = '';
        fDesc._control.focus();
      }
      return true;
    }

    UI.openModal({
      title: editing ? 'Editar lançamento' : 'Novo lançamento',
      body: grid,
      buttons: [
        editing ? {
          label: 'Excluir', class: 'btn-ghost', align: 'left',
          onClick: async () => {
            const ok = await UI.confirm({
              title: 'Excluir lançamento',
              message: `Excluir <strong translate="no">${U.escape(editing.description)}</strong>?` +
                (editing.recurring ? ' Todas as ocorrências mensais serão removidas.' : '') +
                (editing.installment ? ' Todas as parcelas do grupo serão removidas.' : ''),
              confirmLabel: 'Excluir', danger: true
            });
            if (ok) { Store.transactions.remove(editing.id); UI.toast('Lançamento excluído.'); UI.closeModal(); }
          }
        } : null,
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        !editing ? { label: 'Salvar e novo', class: 'btn-outline', onClick: () => submit(false) } : null,
        { label: 'Salvar', class: 'btn-primary', onClick: () => submit(true) }
      ].filter(Boolean)
    });

    grid.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); submit(true); }
    });
  };

  /* ============================================================
     CONTA BANCÁRIA
     ============================================================ */

  Forms.openAccount = function (accountId) {
    if (!accountId && global.Limites && !Limites.exigirEspaco('accounts')) return;
    const editing = accountId ? Store.accounts.get(accountId) : null;

    const fName = field('Nome da conta *', input({ value: editing ? editing.name : '', placeholder: 'Ex.: Conta corrente', maxlength: 50 }));
    const bancoConhecido = editing && Store.bankPreset(editing.bank);
    const bankSel = select(Store.BANK_PRESETS.map((b) => ({ value: b.name, label: b.name })),
      editing ? (bancoConhecido ? bancoConhecido.name : 'Outro') : 'Itaú');
    const fBank = field('Banco', bankSel);
    const fCustomBank = field('Nome do banco', input({ value: editing && !Store.BANK_PRESETS.some((b) => b.name === editing.bank) ? editing.bank : '' }));
    const fType = field('Tipo', select(Store.ACCOUNT_TYPES.map((t) => ({ value: t, label: t })), editing ? editing.type : null));
    const fBalance = field('Saldo inicial (R$)', moneyInput(editing ? editing.openingBalance : 0),
      { hint: 'Saldo que a conta tinha na data de abertura abaixo.' });

    /* ============================================================
       CONTA EM OUTRA MOEDA
       ------------------------------------------------------------
       O cartão internacional nasceu primeiro, e por um tempo a conta
       ficou de fora — o que não fazia sentido nenhum: quem tem cartão
       em dólar tem CONTA em dólar, e era ela que aparecia zerada na
       carteira. O saldo e o extrato passam a ser na moeda da conta; a
       cotação converte para real, que é a moeda dos totais do app.

       A cotação é digitada, e não buscada na internet, pelo mesmo
       motivo do cartão: a que importa é a que o banco dela aplicou, e
       nenhuma fonte pública sabe qual foi.
       ============================================================ */
    const moedaSel = select([{ value: 'BRL', label: 'Real (R$)' }]
      .concat(Store.MOEDAS.map((m) => ({ value: m.code, label: m.nome + ' (' + m.code + ')' }))),
    editing ? editing.moeda || 'BRL' : 'BRL');
    const fMoeda = field('Moeda da conta', moedaSel,
      { hint: 'Para contas em dólar, euro e outras moedas.' });
    const fCotacao = field('Cotação (R$ por 1 unidade) *', input({
      type: 'text', inputmode: 'decimal', placeholder: '5,45',
      value: editing && editing.cotacao ? String(editing.cotacao).replace('.', ',') : ''
    }), { hint: 'A que o seu banco usa. Vale para os lançamentos novos; os antigos guardam a do dia.' });
    let moedaAnterior = moedaSel.value;
    function syncMoeda() {
      const m = moedaSel.value;
      if (m !== 'BRL' && moedaAnterior === 'BRL' && global.Limites
          && !Limites.exigirRecurso('cartoes_internacionais', 'Conta em outra moeda')) {
        moedaSel.value = 'BRL';
      }
      moedaAnterior = moedaSel.value;
      const estrangeira = moedaSel.value !== 'BRL';
      fCotacao.hidden = !estrangeira;
      fBalance.querySelector('.field-label').textContent = 'Saldo inicial (' + (estrangeira ? moedaSel.value : 'R$') + ')';
      paintPreview();
    }
    moedaSel.addEventListener('change', syncMoeda);
    const fDate = field('Considerar a partir de', input({ type: 'date', value: editing ? editing.openedAt : U.todayISO() }));
    const fLast4 = field('4 últimos dígitos', input({
      inputmode: 'numeric', maxlength: 4, placeholder: '4352',
      value: editing ? editing.last4 : ''
    }), { hint: 'Só para reconhecer a conta na carteira. Opcional.' });

    const picker = UI.colorPicker(editing ? editing.color : '#8A7A62');
    const fColor = field('Cor identificadora', picker, { span2: true });

    /* ============================================================
       DENTRO OU FORA DOS TOTAIS
       ------------------------------------------------------------
       Nem todo dinheiro que passa por uma conta é dinheiro seu. A
       conta da empresa, a conta em que você recebe e repassa, a
       poupança que administra para outra pessoa: tudo isso aparecia
       somado às suas receitas e despesas e estragava o mês inteiro.
       Apagar não serve — o saldo precisa continuar certo.

       Desligado, a conta mantém extrato, saldo e histórico; o que
       ela deixa de fazer é entrar nas receitas e despesas do mês,
       nas categorias e no orçamento.
       ============================================================ */
    const cbConsiderado = checkbox('Considerar nos totais de receitas e despesas',
      editing ? editing.considerado !== false : true);
    const fConsiderado = el('div', { class: 'field span-2' }, [
      cbConsiderado,
      el('p', { class: 'hint', text: 'Desligado, a conta continua com saldo e extrato, mas fica fora dos totais do mês, das categorias e do orçamento.' })
    ]);

    const nomeBanco = () => (bankSel.value === 'Outro' ? fCustomBank._control.value : bankSel.value);
    const corDaConta = () => {
      const preset = Store.bankPreset(bankSel.value);
      return preset ? preset.color : picker.getValue();
    };

    /* cor do cartão + prévia ao vivo — a conta é desenhada como carteira */
    const grads = gradPicker(editing ? editing.gradient : null, () => paintPreview());
    const fGrad = field('Cor do cartão na carteira', grads, { span2: true });
    const cardPreview = el('div', { class: 'card-preview' });
    const fPreview = field('Prévia', cardPreview, { span2: true });

    function currentAccount() {
      return {
        id: editing ? editing.id : 'preview',
        name: fName._control.value.trim() || 'Conta',
        bank: nomeBanco(),
        type: fType._control.value,
        color: corDaConta(),
        gradient: bankSel.value === 'Outro' ? grads.getValue() : null,
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        openingBalance: U.parseMoney(fBalance._control.value) || 0,
        considerado: cbConsiderado._input.checked,
        moeda: moedaSel.value,
        cotacao: moedaSel.value === 'BRL' ? null : U.parseMoney(fCotacao._control.value)
      };
    }
    function paintPreview() {
      U.clear(cardPreview);
      const node = Cards.account(currentAccount(), App.balanceDate(), {});
      node.disabled = true;
      node.style.cursor = 'default';
      cardPreview.appendChild(node);
    }

    if (!editing) {
      bankSel.addEventListener('change', () => {
        const preset = Store.BANK_PRESETS.find((b) => b.name === bankSel.value);
        if (preset && preset.color) {
          const btn = U.$$('.color-opt', picker).find((n) => n.style.background && rgbToHex(n.style.background) === preset.color);
          if (btn) btn.click();
        }
      });
    }
    /* A cor só existe para "Outro": banco conhecido usa o cartão do
       banco (Cards.bankDesign), e oferecer cor ali seria oferecer uma
       escolha que não muda nada.

       O aviso vive FORA do campo de cor, porque é justamente quando o
       campo está escondido que ele precisa ser lido — é ele que
       explica o sumiço. */
    const avisoCor = el('p', { class: 'hint' });
    const fAvisoCor = el('div', { class: 'field span-2' }, avisoCor);
    function syncBank() {
      const outro = bankSel.value === 'Outro';
      fCustomBank.hidden = !outro;
      fColor.hidden = !outro;
      fGrad.hidden = !outro;
      avisoCor.textContent = outro
        ? 'Escolha a cor do plástico. Em "auto", uma cor é derivada do nome.'
        : 'A carteira usa as cores do ' + bankSel.value + '. A cor só é escolhida quando o banco é "Outro".';
      paintPreview();
    }
    bankSel.addEventListener('change', syncBank);
    const repaint = U.debounce(paintPreview, 200);
    [fName, fCustomBank, fLast4, fBalance].forEach((f) => f._control.addEventListener('input', repaint));
    fType._control.addEventListener('change', paintPreview);
    cbConsiderado._input.addEventListener('change', paintPreview);
    U.$$('.color-opt', picker).forEach((b) => b.addEventListener('click', paintPreview));
    syncBank();
    syncMoeda();

    const grid = el('div', { class: 'form-grid' },
      [fName, fBank, fCustomBank, fType, fMoeda, fCotacao, fLast4, fBalance, fDate,
        fConsiderado, fColor, fGrad, fAvisoCor, fPreview]);

    function submit() {
      clearErrors([fName, fDate, fCotacao]);
      const name = fName._control.value.trim();
      const moeda = moedaSel.value;
      const cotacao = moeda === 'BRL' ? null : U.parseMoney(fCotacao._control.value);
      if (!name) { setError(fName, 'Informe o nome da conta.'); return; }
      if (moeda !== 'BRL' && !(cotacao > 0)) { setError(fCotacao, 'Informe quantos reais vale 1 ' + moeda + '.'); return; }
      if (!U.isValidISO(fDate._control.value)) { setError(fDate, 'Data inválida.'); return; }

      const data = {
        name,
        bank: bankSel.value === 'Outro' ? (fCustomBank._control.value.trim() || 'Outro') : bankSel.value,
        type: fType._control.value,
        color: corDaConta(),
        gradient: bankSel.value === 'Outro' ? grads.getValue() : null,
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        openingBalance: U.parseMoney(fBalance._control.value) || 0,
        openedAt: fDate._control.value,
        considerado: cbConsiderado._input.checked,
        archived: editing ? editing.archived : false,
        moeda,
        cotacao
      };
      if (editing) { Store.accounts.update(editing.id, data); UI.toast('Conta atualizada.', 'success'); }
      else { Store.accounts.add(data); UI.toast('Conta criada.', 'success'); }
      UI.closeModal();
    }

    UI.openModal({
      title: editing ? 'Editar conta' : 'Nova conta bancária',
      body: grid,
      buttons: [
        editing ? {
          label: 'Excluir', class: 'btn-ghost', align: 'left',
          onClick: async () => {
            const used = Store.profile().transactions.some((t) => t.accountId === editing.id || t.toAccountId === editing.id);
            const ok = await UI.confirm({
              title: 'Excluir conta',
              message: used
                ? `A conta <strong translate="no">${U.escape(editing.name)}</strong> tem lançamentos vinculados. Eles ficarão sem conta. Excluir mesmo assim?`
                : `Excluir a conta <strong translate="no">${U.escape(editing.name)}</strong>?`,
              confirmLabel: 'Excluir', danger: true
            });
            if (ok) { Store.accounts.remove(editing.id); UI.toast('Conta excluída.'); UI.closeModal(); }
          }
        } : null,
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        { label: 'Salvar', class: 'btn-primary', onClick: submit }
      ].filter(Boolean)
    });
  };

  function rgbToHex(s) {
    const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s);
    if (!m) return s;
    return '#' + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0')).join('');
  }

  /* ============================================================
     CARTÃO DE CRÉDITO
     ============================================================ */

  Forms.openCard = function (cardId) {
    if (!cardId && global.Limites && !Limites.exigirEspaco('credit_cards')) return;
    const editing = cardId ? Store.cards.get(cardId) : null;
    const accounts = accountOptions();

    const fName = field('Nome do cartão *', input({ value: editing ? editing.name : '', placeholder: 'Ex.: Cartão principal', maxlength: 50 }));
    const bankSel = select(Store.BANK_PRESETS.map((b) => ({ value: b.name, label: b.name })), editing ? editing.bank : 'Nubank');
    const fBank = field('Banco emissor', bankSel);
    const fLast4 = field('4 últimos dígitos', input({
      inputmode: 'numeric', maxlength: 4, placeholder: '4352',
      value: editing ? editing.last4 : ''
    }), { hint: 'Só para identificar o cartão na tela. Opcional — nunca guarde o número completo.' });
    const fLimit = field('Limite total (R$)', moneyInput(editing ? editing.limit : 0));

    /* ============================================================
       CARTÃO EM OUTRA MOEDA — a partir do Coqueiro
       ------------------------------------------------------------
       Cartão de conta em dólar ou euro (Nomad, Wise, Avenue...) tem
       limite e fatura na moeda dele. A cotação converte as compras
       para reais, que é a moeda dos totais do app. Ela é da pessoa, e
       não buscada na internet: a cotação que importa é a que o banco
       dela aplicou, e nenhuma fonte pública sabe qual foi.
       ============================================================ */
    const moedaSel = select([{ value: 'BRL', label: 'Real (R$)' }]
      .concat(Store.MOEDAS.map((m) => ({ value: m.code, label: m.nome + ' (' + m.code + ')' }))),
    editing ? editing.moeda || 'BRL' : 'BRL');
    const fMoeda = field('Moeda do cartão', moedaSel,
      { hint: 'Para cartões de conta em dólar, euro e outras moedas.' });
    const fCotacao = field('Cotação (R$ por 1 unidade) *', input({
      type: 'text', inputmode: 'decimal', placeholder: '5,45',
      value: editing && editing.cotacao ? String(editing.cotacao).replace('.', ',') : ''
    }), { hint: 'A que o seu banco usa. Vale para as compras novas; as antigas guardam a do dia.' });
    let moedaAnterior = moedaSel.value;
    function syncMoeda() {
      const m = moedaSel.value;
      if (m !== 'BRL' && moedaAnterior === 'BRL' && global.Limites
          && !Limites.exigirRecurso('cartoes_internacionais', 'Cartão em outra moeda')) {
        moedaSel.value = 'BRL';
      }
      moedaAnterior = moedaSel.value;
      const estrangeira = moedaSel.value !== 'BRL';
      fCotacao.hidden = !estrangeira;
      fLimit.querySelector('.field-label').textContent = 'Limite total (' + (estrangeira ? moedaSel.value : 'R$') + ')';
    }
    moedaSel.addEventListener('change', syncMoeda);
    const fClosing = field('Dia de fechamento *', input({ type: 'number', min: 1, max: 31, value: editing ? editing.closingDay : 28 }),
      { hint: 'Dia em que a fatura fecha.' });
    const fDue = field('Dia de vencimento *', input({ type: 'number', min: 1, max: 31, value: editing ? editing.dueDay : 8 }),
      { hint: 'Se for menor que o fechamento, vence no mês seguinte.' });
    const fAccount = field('Conta de débito da fatura', select(accounts, editing ? editing.accountId : null, 'Nenhuma'));

    /* Mesmo interruptor da conta de débito: o cartão do trabalho, ou
       o que outra pessoa paga, continua com fatura e limite sem
       entrar nas suas despesas. */
    const cbConsiderado = checkbox('Considerar nos totais de despesas',
      editing ? editing.considerado !== false : true);
    const fConsiderado = el('div', { class: 'field span-2' }, [
      cbConsiderado,
      el('p', { class: 'hint', text: 'Desligado, a fatura continua sendo calculada, mas as compras ficam fora dos totais do mês, das categorias e do orçamento.' })
    ]);

    /* cor do cartão + prévia ao vivo */
    const gradWrap = gradPicker(editing ? editing.gradient : null, () => paintPreview());
    const cardPreview = el('div', { class: 'card-preview' });

    function currentCard() {
      return {
        id: editing ? editing.id : 'preview',
        name: fName._control.value.trim() || 'Cartão',
        bank: bankSel.value,
        color: '#C9794A',
        gradient: bankSel.value === 'Outro' ? gradWrap.getValue() : null,
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        limit: U.parseMoney(fLimit._control.value) || 0,
        closingDay: Math.min(31, Math.max(1, parseInt(fClosing._control.value, 10) || 1)),
        dueDay: Math.min(31, Math.max(1, parseInt(fDue._control.value, 10) || 10)),
        accountId: null,
        considerado: cbConsiderado._input.checked
      };
    }

    function paintPreview() {
      U.clear(cardPreview);
      const c = currentCard();
      const node = Cards.render(c, U.todayYM(), {});
      node.disabled = true;
      node.style.cursor = 'default';
      cardPreview.appendChild(node);

      const dates = Calc.invoiceDates(c, U.todayYM());
      cardPreview.appendChild(el('p', {
        class: 'hint',
        text: `Fatura de ${U.monthLabel(U.todayYM())}: compras de ${U.fmtDateBR(dates.openDate)} a ${U.fmtDateBR(dates.closeDate)}, vencendo em ${U.fmtDateBR(dates.dueDate)}.`
      }));
    }

    const repaint = U.debounce(paintPreview, 200);
    [fName, fLast4, fLimit, fClosing, fDue].forEach((f) => f._control.addEventListener('input', repaint));
    bankSel.addEventListener('change', paintPreview);
    cbConsiderado._input.addEventListener('change', paintPreview);
    paintPreview();

    const fGrad = field('Cor do cartão', gradWrap, { span2: true });
    /* Mesma regra da conta: a cor só é escolhida em "Outro", e o
       aviso fica fora do campo para continuar visível quando ele some. */
    const avisoCorCartao = el('p', { class: 'hint' });
    const fAvisoCor = el('div', { class: 'field span-2' }, avisoCorCartao);
    const fPreview = el('div', { class: 'field span-2' }, [
      el('span', { class: 'field-label', text: 'Prévia' }), cardPreview
    ]);
    function syncCorCartao() {
      const outro = bankSel.value === 'Outro';
      fGrad.hidden = !outro;
      avisoCorCartao.textContent = outro
        ? 'Escolha a cor do plástico. Em "auto", uma cor é derivada do nome.'
        : 'O cartão usa as cores do ' + bankSel.value + '. A cor só é escolhida quando o banco é "Outro".';
    }
    bankSel.addEventListener('change', syncCorCartao);
    syncCorCartao();

    const grid = el('div', { class: 'form-grid' }, [
      fName, fBank, fMoeda, fCotacao, fLast4, fLimit, fAccount, fClosing, fDue, fConsiderado, fGrad, fAvisoCor, fPreview
    ]);
    syncMoeda();

    function submit() {
      clearErrors([fName, fClosing, fDue, fCotacao]);
      const name = fName._control.value.trim();
      const moeda = moedaSel.value;
      const cotacao = moeda === 'BRL' ? null : U.parseMoney(fCotacao._control.value);
      if (moeda !== 'BRL' && !(cotacao > 0)) { setError(fCotacao, 'Informe quantos reais vale 1 ' + moeda + '.'); return; }
      const closing = parseInt(fClosing._control.value, 10);
      const due = parseInt(fDue._control.value, 10);
      let ok = true;
      if (!name) { setError(fName, 'Informe o nome do cartão.'); ok = false; }
      if (!(closing >= 1 && closing <= 31)) { setError(fClosing, 'Use um dia entre 1 e 31.'); ok = false; }
      if (!(due >= 1 && due <= 31)) { setError(fDue, 'Use um dia entre 1 e 31.'); ok = false; }
      if (!ok) return;

      const preset = Store.BANK_PRESETS.find((b) => b.name === bankSel.value);
      const desenho = Cards.bankDesign(bankSel.value);
      const data = {
        name, bank: bankSel.value,
        color: desenho ? desenho.a : (preset ? preset.color : '#C9794A'),
        gradient: bankSel.value === 'Outro' ? gradWrap.getValue() : null,
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        limit: U.parseMoney(fLimit._control.value) || 0,
        closingDay: closing, dueDay: due,
        accountId: fAccount._control.value || null,
        considerado: cbConsiderado._input.checked,
        moeda,
        cotacao
      };
      if (editing) { Store.cards.update(editing.id, data); UI.toast('Cartão atualizado.', 'success'); }
      else { const c = Store.cards.add(data); App.cardFocusId = c.id; UI.toast('Cartão criado.', 'success'); }
      UI.closeModal();
    }

    UI.openModal({
      title: editing ? 'Editar cartão' : 'Novo cartão de crédito',
      body: grid,
      buttons: [
        editing ? {
          label: 'Excluir', class: 'btn-ghost', align: 'left',
          onClick: async () => {
            const ok = await UI.confirm({
              title: 'Excluir cartão',
              message: `Excluir <strong translate="no">${U.escape(editing.name)}</strong>? As despesas lançadas nele ficarão sem cartão.`,
              confirmLabel: 'Excluir', danger: true
            });
            if (ok) { Store.cards.remove(editing.id); UI.toast('Cartão excluído.'); UI.closeModal(); }
          }
        } : null,
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        { label: 'Salvar', class: 'btn-primary', onClick: submit }
      ].filter(Boolean)
    });
  };

  /* ============================================================
     CATEGORIA
     ============================================================ */

  Forms.openCategory = function (kind, catId) {
    if (!catId && global.Limites && !Limites.exigirEspaco('custom_categories')) return;
    const editing = catId ? Store.categories.get(catId) : null;
    const k = editing ? editing.kind : (kind || 'expense');

    const fName = field('Nome *', input({ value: editing ? editing.name : '', maxlength: 40 }), { span2: true });
    const picker = UI.colorPicker(editing ? editing.color : Store.PALETTE[0]);
    const fColor = field('Cor', picker, { span2: true });

    const icons = iconPicker(editing ? editing.icon : null, () => k, () => fName._control.value);
    const fIcon = field('Ícone', icons,
      { span2: true, hint: 'Em "auto", o ícone é deduzido pelo nome da categoria.' });
    fName._control.addEventListener('input', U.debounce(() => icons.refreshAuto(), 250));

    const grid = el('div', { class: 'form-grid' }, [fName, fColor, fIcon]);

    function submit() {
      clearErrors([fName]);
      const name = fName._control.value.trim();
      if (!name) { setError(fName, 'Informe o nome.'); return; }
      const dup = Store.profile().categories.some((c) =>
        c.kind === k && c.id !== (editing && editing.id) && U.norm(c.name) === U.norm(name));
      if (dup) { setError(fName, 'Já existe uma categoria com esse nome.'); return; }

      const data = { name, color: picker.getValue(), icon: icons.getValue() };
      if (editing) { Store.categories.update(editing.id, data); UI.toast('Categoria atualizada.', 'success'); }
      else { Store.categories.add(Object.assign({ kind: k }, data)); UI.toast('Categoria criada.', 'success'); }
      UI.closeModal();
    }

    UI.openModal({
      title: editing ? 'Editar categoria' : (k === 'income' ? 'Nova categoria de receita' : 'Nova categoria de despesa'),
      body: grid,
      buttons: [
        editing ? {
          label: 'Excluir', class: 'btn-ghost', align: 'left',
          onClick: async () => {
            const n = Store.profile().transactions.filter((t) => t.categoryId === editing.id).length;
            const ok = await UI.confirm({
              title: 'Excluir categoria',
              message: n
                ? `<strong>${n}</strong> lançamento(s) usam <strong translate="no">${U.escape(editing.name)}</strong> e ficarão "Sem categoria". Excluir?`
                : `Excluir a categoria <strong translate="no">${U.escape(editing.name)}</strong>?`,
              confirmLabel: 'Excluir', danger: true
            });
            if (ok) {
              Store.profile().transactions.forEach((t) => { if (t.categoryId === editing.id) t.categoryId = null; });
              Store.categories.remove(editing.id);
              UI.toast('Categoria excluída.'); UI.closeModal();
            }
          }
        } : null,
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        { label: 'Salvar', class: 'btn-primary', onClick: submit }
      ].filter(Boolean)
    });
  };

  /* ============================================================
     INVESTIMENTO
     ============================================================ */

  Forms.openInvestment = function (invId) {
    const editing = invId ? Store.investments.get(invId) : null;

    const fName = field('Nome *', input({ value: editing ? editing.name : '', placeholder: 'Ex.: Tesouro Selic 2029', maxlength: 60 }), { span2: true });
    const fType = field('Tipo', select(Store.INVESTMENT_TYPES.map((t) => ({ value: t, label: t })), editing ? editing.type : null));
    const fAmount = field('Valor aportado (R$) *', moneyInput(editing ? editing.amount : null));
    const fDate = field('Data do aporte *', input({ type: 'date', value: editing ? editing.date : App.selectedDateOrToday() }));
    const fRate = field('Rentabilidade estimada (% a.a.)', input({ inputmode: 'decimal', value: editing ? String(editing.rate).replace('.', ',') : '' }),
      { hint: 'Usada para estimar o valor atual.' });
    const fCurrent = field('Valor atual (opcional)', moneyInput(editing && editing.currentValue != null ? editing.currentValue : null),
      { hint: 'Se preenchido, substitui a estimativa.' });
    const fAccount = field('Debitar da conta', select(accountOptions(), editing ? editing.accountId : null, 'Não debitar'),
      { hint: 'Se escolher, o aporte sai do saldo da conta.' });
    const fNotes = field('Observações', input({ value: editing ? editing.notes : '' }), { span2: true });

    const grid = el('div', { class: 'form-grid' }, [fName, fType, fAmount, fDate, fRate, fCurrent, fAccount, fNotes]);

    function submit() {
      clearErrors([fName, fAmount, fDate]);
      let ok = true;
      const name = fName._control.value.trim();
      if (!name) { setError(fName, 'Informe o nome.'); ok = false; }
      const amount = U.parseMoney(fAmount._control.value);
      if (amount == null || Math.abs(amount) < 0.01) { setError(fAmount, 'Informe um valor maior que zero.'); ok = false; }
      if (!U.isValidISO(fDate._control.value)) { setError(fDate, 'Data inválida.'); ok = false; }
      if (!ok) return;

      const cur = U.parseMoney(fCurrent._control.value);
      const data = {
        name, type: fType._control.value,
        amount: Math.abs(amount), date: fDate._control.value,
        rate: U.parseMoney(fRate._control.value) || 0,
        currentValue: cur == null ? null : Math.abs(cur),
        accountId: fAccount._control.value || null,
        notes: fNotes._control.value.trim()
      };
      if (editing) { Store.investments.update(editing.id, data); UI.toast('Investimento atualizado.', 'success'); }
      else { Store.investments.add(data); UI.toast('Aporte registrado.', 'success'); }
      UI.closeModal();
    }

    UI.openModal({
      title: editing ? 'Editar investimento' : 'Novo aporte',
      body: grid,
      buttons: [
        editing ? {
          label: 'Excluir', class: 'btn-ghost', align: 'left',
          onClick: async () => {
            const ok = await UI.confirm({
              title: 'Excluir investimento',
              message: `Excluir <strong translate="no">${U.escape(editing.name)}</strong>?`, confirmLabel: 'Excluir', danger: true
            });
            if (ok) { Store.investments.remove(editing.id); UI.toast('Investimento excluído.'); UI.closeModal(); }
          }
        } : null,
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        { label: 'Salvar', class: 'btn-primary', onClick: submit }
      ].filter(Boolean)
    });
  };

  /* ============================================================
     PAGAMENTO DE FATURA
     ============================================================ */

  /* =============================================================
     PAGAR A FATURA — inteira, em parte, ou antes da hora
     -------------------------------------------------------------
     Antes existia um botão só: "marcar como paga". Quem pagava
     metade agora e o resto depois marcava como paga uma fatura que
     ainda devia — e o app passava a mentir sobre o limite livre e
     sobre o patrimônio.

     Agora o valor é livre e a tela diz, na hora, quanto vai faltar.
     O pagamento entra com data: é por ela que ele sai do dinheiro
     daquele mês, mesmo que as compras sejam de meses atrás.
     ============================================================= */
  Forms.openInvoicePayment = function (cardId, ref) {
    const inv = Calc.invoice(cardId, ref);
    if (!inv) return;

    const sugerido = inv.restante > 0 ? inv.restante : (inv.total || inv.planned);
    const fAmount = field('Valor pago (R$)', moneyInput(sugerido));
    const fDate = field('Data do pagamento', input({ type: 'date', value: U.todayISO() }),
      { hint: 'É por esta data que a fatura sai do dinheiro do mês.' });
    const fAccount = field('De onde sai o dinheiro', select(accountOptions(), inv.card.accountId, 'Não debitar de conta'),
      { hint: 'O pagamento baixa o saldo da conta, mas não conta como nova despesa — os itens da fatura já foram contabilizados na data da compra.' });

    const saldo = el('p', { class: 'hint span-2', role: 'status' });
    const cbQuitar = checkbox('Encerrar a fatura mesmo assim', false);
    const fQuitar = el('div', { class: 'field span-2' }, [cbQuitar,
      el('p', { class: 'hint', text: 'Use quando a diferença for estorno, desconto ou juros que você não quer lançar.' })]);

    function recalcula() {
      const v = U.parseMoney(fAmount._control.value) || 0;
      const falta = U.round2(Math.max(0, inv.planned - inv.pago - v));
      const sobra = U.round2(Math.max(0, inv.pago + v - inv.planned));
      saldo.textContent = inv.planned <= 0
        ? 'Esta fatura não tem lançamentos.'
        : falta > 0
          ? `Depois deste pagamento ainda faltam ${U.fmtBRL(falta)} de ${U.fmtBRL(inv.planned)}.`
          : sobra > 0
            ? `Isto cobre a fatura inteira, com ${U.fmtBRL(sobra)} a mais.`
            : 'Isto quita a fatura.';
      fQuitar.hidden = !(falta > 0);
    }
    fAmount._control.addEventListener('input', recalcula);
    recalcula();

    const grid = el('div', { class: 'form-grid' }, [fAmount, fDate, fAccount, saldo, fQuitar]);

    UI.openModal({
      title: `Pagar fatura — ${inv.card.name} · ${U.monthLabel(ref)}`,
      body: grid,
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Registrar pagamento', class: 'btn-primary',
          onClick: () => {
            clearErrors([fDate, fAmount]);
            const valor = U.parseMoney(fAmount._control.value) || 0;
            if (valor <= 0) { setError(fAmount, 'Informe quanto foi pago.'); return; }
            if (!U.isValidISO(fDate._control.value)) { setError(fDate, 'Data inválida.'); return; }
            const falta = U.round2(Math.max(0, inv.planned - inv.pago - valor));
            Store.payInvoice(cardId, ref, {
              amount: valor,
              paidAt: fDate._control.value,
              accountId: fAccount._control.value || null,
              quitar: falta <= 0 ? true : cbQuitar._input.checked
            });
            UI.toast(falta > 0 && !cbQuitar._input.checked
              ? `Pagamento registrado. Ainda faltam ${U.fmtBRL(falta)}.`
              : 'Fatura paga.', 'success');
            UI.closeModal();
          }
        }
      ]
    });
  };

  /**
   * Adiantar UMA compra que ainda está prevista na fatura. O valor
   * é livre pelo mesmo motivo do pagamento da fatura: adiantar
   * metade de uma parcela é coisa que acontece.
   */
  Forms.openAdvancePayment = function (cardId, ref, entrada) {
    const inv = Calc.invoice(cardId, ref);
    if (!inv) return;
    const jaPago = entrada.adiantado || 0;
    const falta = U.round2(Math.max(0, entrada.amount - jaPago));

    const fAmount = field('Valor adiantado (R$)', moneyInput(falta));
    const fDate = field('Data do pagamento', input({ type: 'date', value: U.todayISO() }));
    const fAccount = field('De onde sai o dinheiro', select(accountOptions(), inv.card.accountId, 'Não debitar de conta'));
    const aviso = el('p', { class: 'hint span-2', role: 'status' });

    function recalcula() {
      const v = U.parseMoney(fAmount._control.value) || 0;
      const resta = U.round2(Math.max(0, entrada.amount - v));
      aviso.textContent = resta > 0
        ? `Sobram ${U.fmtBRL(resta)} desta compra na fatura de ${U.monthLabel(ref, true)}.`
        : `Esta compra sai inteira da fatura de ${U.monthLabel(ref, true)}.`;
    }
    fAmount._control.addEventListener('input', recalcula);
    recalcula();

    UI.openModal({
      title: 'Adiantar — ' + entrada.description,
      body: el('div', { class: 'form-grid' }, [
        el('p', { class: 'hint span-2', text: `Compra de ${U.fmtBRL(entrada.amount)} em ${U.fmtDateBR(entrada.date)}, cobrada na fatura de ${U.monthLabel(ref, true)}.` }),
        fAmount, fDate, fAccount, aviso
      ]),
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Registrar adiantamento', class: 'btn-primary',
          onClick: () => {
            clearErrors([fAmount, fDate]);
            const valor = U.parseMoney(fAmount._control.value) || 0;
            if (valor <= 0) { setError(fAmount, 'Informe quanto foi adiantado.'); return; }
            if (!U.isValidISO(fDate._control.value)) { setError(fDate, 'Data inválida.'); return; }
            Store.advanceInvoiceItem(cardId, ref, entrada.key, {
              amount: valor,
              paidAt: fDate._control.value,
              accountId: fAccount._control.value || null
            });
            UI.toast('Adiantamento registrado.', 'success');
            UI.closeModal();
          }
        }
      ]
    });
  };

  /* ============================================================
     PERFIS
     ============================================================ */

  /* Espaços financeiros (no código, "perfis"). Abre também direto no
     campo de criar, que é o que o "+ Novo espaço" do seletor pede. */
  Forms.openProfiles = function (opcoes) {
    const o = opcoes || {};
    const body = el('div');

    function draw() {
      U.clear(body);
      const st = Store.state();
      const list = el('div', { class: 'cat-list' });
      st.profiles.forEach((p) => {
        const counts = `${p.transactions.length} lançamentos · ${p.accounts.length} contas · ${p.cards.length} cartões`;
        list.appendChild(el('div', { class: 'cat-row' }, [
          el('span', { class: 'cat-swatch', style: { background: p.id === st.activeProfileId ? 'var(--s1)' : 'var(--axis)' } }),
          el('div', {}, [
            el('div', { class: 'cat-name', text: p.name, translate: 'no' }),
            el('div', { class: 'muted', text: counts })
          ]),
          el('span'),
          el('div', { class: 'row-actions' }, [
            el('button', {
              class: 'icon-btn', title: 'Renomear', text: '✎',
              onclick: () => {
                const nome = prompt('Novo nome do espaço:', p.name);
                if (nome && nome.trim()) { Store.renameProfile(p.id, nome.trim()); draw(); }
              }
            }),
            el('button', {
              class: 'icon-btn danger', title: 'Excluir', text: '🗑',
              onclick: async () => {
                if (st.profiles.length <= 1) { UI.toast('É preciso manter ao menos um espaço.', 'error'); return; }
                const ok = await UI.confirm({
                  title: 'Excluir espaço',
                  message: `Excluir <strong translate="no">${U.escape(p.name)}</strong> e TODOS os seus dados? Isso não pode ser desfeito.`,
                  confirmLabel: 'Excluir espaço', danger: true
                });
                if (ok) { Store.deleteProfile(p.id); UI.toast('Espaço excluído.'); Forms.openProfiles(); }
              }
            })
          ])
        ]));
      });
      body.appendChild(list);

      const nameInput = input({ placeholder: 'Ex.: Casa, Empresa, Viagem', maxlength: 40 });
      const criar = () => {
        const n = nameInput.value.trim();
        if (!n) { UI.toast('Dê um nome ao espaço.', 'error'); nameInput.focus(); return; }
        if (global.Limites && !Limites.exigirEspaco('workspaces')) return;
        Store.addProfile(n);
        UI.toast(`Espaço "${n}" criado e aberto.`, 'success');
        UI.closeModal();
      };
      nameInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); criar(); }
      });
      body.appendChild(el('div', { style: { marginTop: '16px' } }, [
        field('Novo espaço', el('div', { class: 'row gap-6' }, [
          nameInput,
          el('button', { class: 'btn btn-primary', type: 'button', text: 'Criar', onclick: criar })
        ]), { hint: 'Cada espaço tem suas próprias contas, cartões, categorias e orçamento.' })
      ]));
      return nameInput;
    }
    draw();

    UI.openModal({
      title: 'Espaços financeiros',
      noAutofocus: !o.criar,
      body,
      buttons: [
        { label: 'Fechar', class: 'btn-outline', onClick: UI.closeModal }
      ]
    });
  };

  global.Forms = Forms;
})(window);
