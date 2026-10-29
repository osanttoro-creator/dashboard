/* Relatório local: usa as mesmas ocorrências confirmadas do painel. */
(function (global) {
  'use strict';
  let dialog;
  function reportContext() { return global.OAZE_REPORT_CONTEXT?.() || null; }
  function period(kind, month, year) {
    const today = new Date();
    if (kind === '30d') {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      const iso = (date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      return { from: iso(start), to: iso(today), title: 'Últimos 30 dias' };
    }
    if (kind === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      return { from: month + '-01', to: month + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'), title: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)) };
    }
    if (kind === 'year' && Number.isInteger(year) && year >= 1900 && year <= 2200) {
      return { from: year + '-01-01', to: year + '-12-31', title: 'Ano de ' + year };
    }
    throw new Error('Escolha um período válido.');
  }
  function aggregate(profile, range) {
    const items = global.Calc.entries(range.from, range.to, profile)
      .filter((item) => item.confirmed && item.contaNosTotais !== false && ['income', 'expense'].includes(item.kind));
    const categories = new Map();
    const months = new Map();
    let income = 0, expense = 0;
    for (const item of items) {
      const value = Number(item.amount);
      if (!Number.isFinite(value) || value < 0) continue;
      if (item.kind === 'income') income += value;
      else {
        expense += value;
        const category = profile.categories?.find((entry) => entry.id === item.categoryId);
        const name = category?.name || 'Sem categoria';
        categories.set(name, (categories.get(name) || 0) + value);
      }
      const month = String(item.date).slice(0, 7);
      const sum = months.get(month) || { ym: month, income: 0, expense: 0 };
      sum[item.kind] += value; months.set(month, sum);
    }
    const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    return { income: round(income), expense: round(expense),
      categories: [...categories].map(([name, value]) => ({ name, value: round(value) })).sort((a, b) => b.value - a.value),
      monthly: [...months.values()].sort((a, b) => a.ym.localeCompare(b.ym)).map((row) => ({
        label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(new Date(row.ym + '-01T12:00:00')),
        income: round(row.income), expense: round(row.expense)
      })) };
  }
  function money(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
  function preview() {
    if (!dialog) return;
    const output = dialog.querySelector('[data-estado-preview]');
    const button = dialog.querySelector('[data-estado-pdf]');
    try {
      const source = reportContext();
      if (!source || source.demo || !source.profile) throw new Error('Entre na sua conta para criar o relatório.');
      const form = dialog.querySelector('form');
      const kind = form.elements.kind.value;
      form.elements.month.hidden = kind !== 'month';
      form.elements.year.hidden = kind !== 'year';
      const range = period(kind, form.elements.month.value, Number(form.elements.year.value));
      const totals = aggregate(source.profile, range);
      dialog.report = { ...range, periodTitle: range.title,
        owner: String(source.owner || 'Usuário OAZE'), profile: String(source.profile.name || 'Pessoal'),
        profileId: source.profile.id, ...totals };
      output.textContent = range.title + ' · Receitas ' + money(totals.income) + ' · Despesas ' + money(totals.expense) + ' · Saldo ' + money(totals.income - totals.expense);
      button.disabled = false;
    } catch (error) {
      dialog.report = null; output.textContent = error.message || 'Não foi possível calcular o relatório.'; button.disabled = true;
    }
  }
  function open() {
    dialog?.remove();
    dialog = document.createElement('dialog');
    dialog.className = 'v3-estado-dialog';
    const today = new Date();
    const ym = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    dialog.innerHTML = '<form method="dialog"><header><img src="/assets/brand/oaze-logo-mono-milk.svg" alt="OAZE"><button type="submit" aria-label="Fechar relatório">×</button></header><h2>Estado do OAZE</h2><p>Escolha o período. O PDF é criado neste aparelho a partir dos seus lançamentos confirmados.</p><label>Período<select name="kind"><option value="30d">Últimos 30 dias</option><option value="month">Mês específico</option><option value="year">Ano específico</option></select></label><label>Escolha o mês<input type="month" name="month"></label><label>Escolha o ano<input type="number" name="year" min="1900" max="2200"></label><div class="v3-estado-preview" data-estado-preview role="status"></div><p class="v3-estado-error" data-estado-error role="alert" hidden></p><div class="v3-estado-actions"><button type="submit" class="v3-secondary">Fechar</button><button type="button" class="v3-primary" data-estado-pdf>Salvar PDF</button></div></form>';
    document.body.appendChild(dialog);
    dialog.querySelector('[name="month"]').value = ym;
    dialog.querySelector('[name="year"]').value = String(today.getFullYear());
    dialog.addEventListener('input', preview);
    dialog.addEventListener('change', preview);
    dialog.addEventListener('close', () => { dialog.remove(); dialog = null; });
    dialog.querySelector('[data-estado-pdf]').addEventListener('click', async () => {
      const button = dialog.querySelector('[data-estado-pdf]');
      const error = dialog.querySelector('[data-estado-error]');
      const context = reportContext();
      if (!context || context.profile?.id !== dialog.report?.profileId) { preview(); return; }
      button.disabled = true; error.hidden = true;
      try { await global.OazeEstadoPDF.generate(dialog.report); }
      catch (problem) { error.textContent = problem.message || 'Não foi possível criar o PDF.'; error.hidden = false; }
      finally { if (dialog?.isConnected) button.disabled = false; }
    });
    dialog.showModal(); preview();
  }
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-action="estado-oaze"]')) { event.preventDefault(); open(); }
  });
  global.OazeEstadoUI = { period, aggregate, open };
})(window);
