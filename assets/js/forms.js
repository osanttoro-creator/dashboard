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

  /** Pré-visualização do logo do banco, atualizada conforme a escolha. */
  function bankPreview(getName) {
    const box = el('div', { class: 'bank-preview' });
    box.update = () => {
      U.clear(box);
      const nome = getName();
      const known = Icons.hasBank(nome);
      box.appendChild(Icons.bankTile(nome, 32));
      box.appendChild(el('span', { text: known ? 'Logo e cor da marca encontrados' : 'Sem logo — usando ícone genérico' }));
    };
    box.update();
    return box;
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

    const fAmount = field('Valor (R$) *', moneyInput(editing ? editing.amount : d.amount));
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
      editing ? editing.accountId : d.accountId, prof.accounts.length ? null : 'Nenhuma conta'));
    const fCard = field('Cartão', select(cardOptions(),
      editing ? editing.cardId : d.cardId, prof.cards.length ? null : 'Nenhum cartão'));
    const fToAccount = field('Conta de destino', select(accountOptions(),
      editing ? editing.toAccountId : d.toAccountId, 'Escolha…'));

    const cbRecurring = checkbox('Repetir todo mês (lançamento fixo)', editing ? editing.recurring : false);
    const fRecurEnd = field('Repetir até (opcional)', input({
      type: 'month', value: editing && editing.recurEnd ? editing.recurEnd : ''
    }), { hint: 'Em branco = sem data final.' });

    const fInstallments = field('Parcelar em', input({
      type: 'number', min: 1, max: 72, value: editing && editing.installment ? editing.installment.total : 1
    }), { hint: 'O valor informado é o TOTAL; será dividido nas parcelas.' });

    const cbConfirmed = checkbox('Confirmado (entra nos totais do mês)',
      editing ? editing.confirmed : (d.confirmed !== undefined ? d.confirmed : true));

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
      fDesc, fAmount, fDate, fCategory, fMethod, fAccount, fCard, fToAccount,
      el('div', { class: 'field span-2' }, cbRecurring),
      fRecurEnd, fInstallments,
      el('div', { class: 'field span-2' }, cbConfirmed),
      fNotes, recurNote
    ]);

    function syncVisibility() {
      const isTransfer = currentKind === 'transfer';
      const isExpense = currentKind === 'expense';
      const useCard = isExpense && method === 'card';

      fCategory.hidden = isTransfer;
      fMethod.hidden = !isExpense || !prof.cards.length;
      if (!isExpense) method = 'account';
      fCard.hidden = !useCard;
      fAccount.hidden = useCard;
      fAccount.querySelector('.field-label').textContent = isTransfer ? 'Conta de origem' : 'Conta';
      fToAccount.hidden = !isTransfer;
      fInstallments.hidden = !isExpense || cbRecurring._input.checked || !!editing;
      fRecurEnd.hidden = !cbRecurring._input.checked;

      // deixa explícito o efeito contábil de cada forma de pagamento
      methodHint.textContent = useCard
        ? 'Crédito: entra na fatura do cartão e não mexe no saldo da conta agora. '
          + 'Conta como despesa na data da compra; o pagamento da fatura é só movimentação de caixa.'
        : 'Débito: sai direto da conta bancária e reduz o saldo dela na hora.';
    }
    cbRecurring._input.addEventListener('change', syncVisibility);
    syncVisibility();

    /* --- salvar --- */
    function submit(closeAfter) {
      const all = [fDesc, fAmount, fDate, fAccount, fCard, fToAccount, fInstallments];
      clearErrors(all);
      let ok = true;

      const description = fDesc._control.value.trim();
      if (!description) { setError(fDesc, 'Informe uma descrição.'); ok = false; }

      const amount = U.parseMoney(fAmount._control.value);
      if (amount == null || Math.abs(amount) < 0.01) { setError(fAmount, 'Informe um valor maior que zero.'); ok = false; }

      const date = fDate._control.value;
      if (!U.isValidISO(date)) { setError(fDate, 'Data inválida.'); ok = false; }

      const useCard = currentKind === 'expense' && method === 'card';
      const accountId = fAccount._control.value || null;
      const cardId = fCard._control.value || null;
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

      const base = {
        kind: currentKind,
        description,
        amount: Math.abs(amount),
        date,
        categoryId: currentKind === 'transfer' ? null : (fCategory._control.value || null),
        accountId: useCard ? null : accountId,
        cardId: useCard ? cardId : null,
        toAccountId: currentKind === 'transfer' ? toAccountId : null,
        recurring: cbRecurring._input.checked,
        recurEnd: cbRecurring._input.checked ? (fRecurEnd._control.value || null) : null,
        confirmed: cbConfirmed._input.checked,
        notes: fNotes._control.value.trim()
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
            amount: value,
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
              message: `Excluir <strong>${U.escape(editing.description)}</strong>?` +
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
    const editing = accountId ? Store.accounts.get(accountId) : null;

    const fName = field('Nome da conta *', input({ value: editing ? editing.name : '', placeholder: 'Ex.: Conta corrente', maxlength: 50 }));
    const bankSel = select(Store.BANK_PRESETS.map((b) => ({ value: b.name, label: b.name })),
      editing ? editing.bank : 'Itaú');
    const fBank = field('Banco', bankSel);
    const fCustomBank = field('Nome do banco', input({ value: editing && !Store.BANK_PRESETS.some((b) => b.name === editing.bank) ? editing.bank : '' }));
    const fType = field('Tipo', select(Store.ACCOUNT_TYPES.map((t) => ({ value: t, label: t })), editing ? editing.type : null));
    const fBalance = field('Saldo inicial (R$)', moneyInput(editing ? editing.openingBalance : 0),
      { hint: 'Saldo que a conta tinha na data de abertura abaixo.' });
    const fDate = field('Considerar a partir de', input({ type: 'date', value: editing ? editing.openedAt : U.todayISO() }));
    const fLast4 = field('4 últimos dígitos', input({
      inputmode: 'numeric', maxlength: 4, placeholder: '4352',
      value: editing ? editing.last4 : ''
    }), { hint: 'Só para reconhecer a conta na carteira. Opcional.' });

    const picker = UI.colorPicker(editing ? editing.color : '#A68B6B');
    const fColor = field('Cor identificadora', picker, { span2: true });

    const nomeBanco = () => (bankSel.value === 'Outro' ? fCustomBank._control.value : bankSel.value);

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
        color: picker.getValue(),
        gradient: grads.getValue(),
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        openingBalance: U.parseMoney(fBalance._control.value) || 0
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
    function syncBank() { fCustomBank.hidden = bankSel.value !== 'Outro'; paintPreview(); }
    bankSel.addEventListener('change', syncBank);
    const repaint = U.debounce(paintPreview, 200);
    [fName, fCustomBank, fLast4, fBalance].forEach((f) => f._control.addEventListener('input', repaint));
    fType._control.addEventListener('change', paintPreview);
    U.$$('.color-opt', picker).forEach((b) => b.addEventListener('click', paintPreview));
    syncBank();

    const grid = el('div', { class: 'form-grid' },
      [fName, fBank, fCustomBank, fType, fLast4, fBalance, fDate, fColor, fGrad, fPreview]);

    function submit() {
      clearErrors([fName, fDate]);
      const name = fName._control.value.trim();
      if (!name) { setError(fName, 'Informe o nome da conta.'); return; }
      if (!U.isValidISO(fDate._control.value)) { setError(fDate, 'Data inválida.'); return; }

      const data = {
        name,
        bank: bankSel.value === 'Outro' ? (fCustomBank._control.value.trim() || 'Outro') : bankSel.value,
        type: fType._control.value,
        color: picker.getValue(),
        gradient: grads.getValue(),
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        openingBalance: U.parseMoney(fBalance._control.value) || 0,
        openedAt: fDate._control.value,
        archived: editing ? editing.archived : false
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
                ? `A conta <strong>${U.escape(editing.name)}</strong> tem lançamentos vinculados. Eles ficarão sem conta. Excluir mesmo assim?`
                : `Excluir a conta <strong>${U.escape(editing.name)}</strong>?`,
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
    const fClosing = field('Dia de fechamento *', input({ type: 'number', min: 1, max: 31, value: editing ? editing.closingDay : 28 }),
      { hint: 'Dia em que a fatura fecha.' });
    const fDue = field('Dia de vencimento *', input({ type: 'number', min: 1, max: 31, value: editing ? editing.dueDay : 8 }),
      { hint: 'Se for menor que o fechamento, vence no mês seguinte.' });
    const fAccount = field('Conta de débito da fatura', select(accounts, editing ? editing.accountId : null, 'Nenhuma'));

    /* cor do cartão + prévia ao vivo */
    const gradWrap = gradPicker(editing ? editing.gradient : null, () => paintPreview());
    const cardPreview = el('div', { class: 'card-preview' });

    function currentCard() {
      return {
        id: editing ? editing.id : 'preview',
        name: fName._control.value.trim() || 'Cartão',
        bank: bankSel.value,
        color: '#C9794A',
        gradient: gradWrap.getValue(),
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        limit: U.parseMoney(fLimit._control.value) || 0,
        closingDay: Math.min(31, Math.max(1, parseInt(fClosing._control.value, 10) || 1)),
        dueDay: Math.min(31, Math.max(1, parseInt(fDue._control.value, 10) || 10)),
        accountId: null
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
    paintPreview();

    const fGrad = field('Cor do cartão', gradWrap, { span2: true });
    const fPreview = el('div', { class: 'field span-2' }, [
      el('span', { class: 'field-label', text: 'Prévia' }), cardPreview
    ]);

    const grid = el('div', { class: 'form-grid' }, [
      fName, fBank, fLast4, fLimit, fAccount, fClosing, fDue, fGrad, fPreview
    ]);

    function submit() {
      clearErrors([fName, fClosing, fDue]);
      const name = fName._control.value.trim();
      const closing = parseInt(fClosing._control.value, 10);
      const due = parseInt(fDue._control.value, 10);
      let ok = true;
      if (!name) { setError(fName, 'Informe o nome do cartão.'); ok = false; }
      if (!(closing >= 1 && closing <= 31)) { setError(fClosing, 'Use um dia entre 1 e 31.'); ok = false; }
      if (!(due >= 1 && due <= 31)) { setError(fDue, 'Use um dia entre 1 e 31.'); ok = false; }
      if (!ok) return;

      const preset = Store.BANK_PRESETS.find((b) => b.name === bankSel.value);
      const data = {
        name, bank: bankSel.value,
        color: preset ? preset.color : '#C9794A',
        gradient: gradWrap.getValue(),
        last4: fLast4._control.value.replace(/\D/g, '').slice(-4),
        limit: U.parseMoney(fLimit._control.value) || 0,
        closingDay: closing, dueDay: due,
        accountId: fAccount._control.value || null
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
              message: `Excluir <strong>${U.escape(editing.name)}</strong>? As despesas lançadas nele ficarão sem cartão.`,
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
                ? `<strong>${n}</strong> lançamento(s) usam <strong>${U.escape(editing.name)}</strong> e ficarão "Sem categoria". Excluir?`
                : `Excluir a categoria <strong>${U.escape(editing.name)}</strong>?`,
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
              message: `Excluir <strong>${U.escape(editing.name)}</strong>?`, confirmLabel: 'Excluir', danger: true
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

  Forms.openInvoicePayment = function (cardId, ref) {
    const inv = Calc.invoice(cardId, ref);
    if (!inv) return;

    const fAmount = field('Valor pago (R$)', moneyInput(inv.total || inv.planned));
    const fDate = field('Data do pagamento', input({ type: 'date', value: U.todayISO() }));
    const fAccount = field('Debitar da conta', select(accountOptions(), inv.card.accountId, 'Não debitar de conta'),
      { hint: 'O pagamento sai do saldo da conta, mas não conta como nova despesa — os itens da fatura já foram contabilizados na data da compra.' });

    const grid = el('div', { class: 'form-grid' }, [fAmount, fDate, fAccount]);

    UI.openModal({
      title: `Pagar fatura — ${inv.card.name} · ${U.monthLabel(ref)}`,
      body: grid,
      buttons: [
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Marcar como paga', class: 'btn-primary',
          onClick: () => {
            clearErrors([fDate]);
            if (!U.isValidISO(fDate._control.value)) { setError(fDate, 'Data inválida.'); return; }
            Store.setInvoicePaid(cardId, ref, true, {
              amount: U.parseMoney(fAmount._control.value) || 0,
              paidAt: fDate._control.value,
              accountId: fAccount._control.value || null
            });
            UI.toast('Fatura marcada como paga.', 'success');
            UI.closeModal();
          }
        }
      ]
    });
  };

  /* ============================================================
     PERFIS
     ============================================================ */

  Forms.openProfiles = function () {
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
            el('div', { class: 'cat-name', text: p.name }),
            el('div', { class: 'muted', text: counts })
          ]),
          el('span'),
          el('div', { class: 'row-actions' }, [
            el('button', {
              class: 'icon-btn', title: 'Renomear', text: '✎',
              onclick: () => {
                const nome = prompt('Novo nome do perfil:', p.name);
                if (nome && nome.trim()) { Store.renameProfile(p.id, nome.trim()); draw(); }
              }
            }),
            el('button', {
              class: 'icon-btn danger', title: 'Excluir', text: '🗑',
              onclick: async () => {
                if (st.profiles.length <= 1) { UI.toast('É preciso manter ao menos um perfil.', 'error'); return; }
                const ok = await UI.confirm({
                  title: 'Excluir perfil',
                  message: `Excluir <strong>${U.escape(p.name)}</strong> e TODOS os seus dados? Isso não pode ser desfeito.`,
                  confirmLabel: 'Excluir perfil', danger: true
                });
                if (ok) { Store.deleteProfile(p.id); UI.toast('Perfil excluído.'); Forms.openProfiles(); }
              }
            })
          ])
        ]));
      });
      body.appendChild(list);

      const nameInput = input({ placeholder: 'Nome do novo perfil' });
      body.appendChild(el('div', { style: { marginTop: '16px' } }, [
        field('Adicionar perfil', el('div', { class: 'row gap-6' }, [
          nameInput,
          el('button', {
            class: 'btn btn-primary', type: 'button', text: 'Criar',
            onclick: () => {
              const n = nameInput.value.trim();
              if (!n) { UI.toast('Informe um nome.', 'error'); return; }
              Store.addProfile(n);
              UI.toast(`Perfil "${n}" criado e selecionado.`, 'success');
              draw();
            }
          })
        ]))
      ]));
    }
    draw();

    UI.openModal({
      title: 'Perfis',
      body,
      buttons: [
        { label: 'Fechar', class: 'btn-primary', onClick: UI.closeModal }
      ]
    });
  };

  global.Forms = Forms;
})(window);
