/* =============================================================
   importer.js — importação de CSV / OFX / texto colado
   ------------------------------------------------------------
   Nada sai do navegador. O conteúdo é interpretado localmente e
   vira uma PRÉVIA: cada linha é revisada e só entra nos totais
   depois de confirmada (mesma lógica de checkbox da Página 2).
   ============================================================= */
(function (global) {
  'use strict';

  const el = U.el;
  const Importer = {};

  let parsed = null;   // { type, rows, columns, delimiter, warnings }
  let mapping = { date: null, description: null, amount: null, debit: null, credit: null };

  /* ============================================================
     Dicionário de palavras-chave → categoria sugerida
     ============================================================ */
  const KEYWORDS = [
    [['supermercado', 'mercado', 'atacad', 'carrefour', 'assai', 'pao de acucar', 'extra ', 'hortifruti', 'padaria', 'acougue'], 'Alimentação'],
    [['ifood', 'rappi', 'restaurante', 'lanchonete', 'pizzaria', 'burger', 'mcdonald', 'subway', 'cafe', 'bar '], 'Alimentação'],
    [['uber', '99app', '99 pop', 'taxi', 'combustivel', 'posto ', 'ipiranga', 'shell', 'petrobras', 'estacionamento', 'pedagio', 'sem parar', 'metro', 'bilhete unico', 'onibus'], 'Transporte'],
    [['aluguel', 'condominio', 'iptu', 'energia', 'enel', 'cemig', 'light ', 'copel', 'sabesp', 'agua', 'gas ', 'comgas'], 'Moradia'],
    [['farmacia', 'drogaria', 'droga raia', 'drogasil', 'pague menos', 'hospital', 'clinica', 'laboratorio', 'unimed', 'amil', 'plano de saude', 'dentista', 'psicolog'], 'Saúde'],
    [['netflix', 'spotify', 'amazon prime', 'disney', 'hbo', 'globoplay', 'youtube premium', 'icloud', 'google one', 'microsoft 365', 'adobe', 'assinatura', 'chatgpt', 'claude'], 'Assinaturas'],
    [['vivo', 'claro', 'tim ', 'oi ', 'internet', 'telefon', 'net virtua'], 'Assinaturas'],
    [['escola', 'faculdade', 'universidade', 'curso', 'udemy', 'alura', 'livraria', 'mensalidade escolar'], 'Educação'],
    [['cinema', 'teatro', 'show', 'ingresso', 'academia', 'smartfit', 'viagem', 'hotel', 'airbnb', 'booking', 'latam', 'gol ', 'azul '], 'Lazer'],
    [['mercado livre', 'mercadolivre', 'shopee', 'aliexpress', 'amazon', 'magazine', 'magalu', 'americanas', 'renner', 'riachuelo', 'zara', 'shopping'], 'Compras'],
    [['darf', 'das ', 'inss', 'irpf', 'imposto', 'taxa', 'tarifa', 'anuidade', 'juros', 'multa', 'iof'], 'Impostos e taxas'],
    [['salario', 'salário', 'remuneracao', 'folha de pagamento', 'pagamento de salario', 'proventos'], 'Salário'],
    [['rendimento', 'dividendo', 'jcp', 'juros sobre capital', 'resgate', 'cdb', 'tesouro'], 'Rendimentos'],
    [['reembolso', 'estorno', 'devolucao', 'cashback'], 'Reembolso']
  ];

  function suggestCategory(description, kind) {
    const n = U.norm(description);
    const cats = Store.profile().categories.filter((c) => c.kind === kind);
    // 1 · nome de categoria aparece literalmente na descrição
    const direct = cats.find((c) => c.name.length > 3 && n.includes(U.norm(c.name)));
    if (direct) return direct.id;
    // 2 · dicionário de palavras-chave
    for (const [words, catName] of KEYWORDS) {
      if (words.some((w) => n.includes(w))) {
        const c = cats.find((x) => U.norm(x.name) === U.norm(catName));
        if (c) return c.id;
      }
    }
    return null;
  }

  /* ============================================================
     Parsers
     ============================================================ */

  function parseDateLoose(raw) {
    const s = String(raw || '').trim();
    let m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = /^(\d{8})/.exec(s))) return `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`;
    if ((m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(s))) {
      let y = +m[3];
      if (y < 100) y += y > 70 ? 1900 : 2000;
      return `${y}-${U.pad(+m[2])}-${U.pad(+m[1])}`;
    }
    if ((m = /(\d{1,2})[\/\-.](\d{1,2})(?!\d)/.exec(s))) {
      const y = U.ymParts(App.ym).y;
      return `${y}-${U.pad(+m[2])}-${U.pad(+m[1])}`;
    }
    return null;
  }

  /** Conta ocorrências de um caractere fora de aspas. */
  function countOutside(line, ch) {
    let n = 0, q = false;
    for (const c of line) {
      if (c === '"') q = !q;
      else if (!q && c === ch) n++;
    }
    return n;
  }

  /**
   * CSV com detecção de delimitador e suporte a campos entre aspas.
   * A vírgula é a última candidata e só vale como separador quando não
   * está fazendo papel de vírgula decimal ("-34,50" NÃO é um CSV).
   */
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const sample = lines.slice(0, 12);

    let delimiter = null;
    for (const cand of [';', '\t', '|', ',']) {
      const counts = sample.map((l) => countOutside(l, cand));
      if (!counts[0]) continue;
      const consistent = counts.filter((c) => c === counts[0]).length / counts.length;
      if (consistent < 0.7) continue;
      if (cand === ',') {
        // linhas do tipo "12/08 UBER -34,50": a vírgula é decimal, não separador
        const decimalish = sample.filter((l) => /\d,\d{2}(?!\d)/.test(l)).length / sample.length;
        if (decimalish > 0.4 && counts[0] < 2) continue;
      }
      delimiter = cand;
      break;
    }
    if (!delimiter) return null;

    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }

    const clean = rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
    if (clean.length < 2) return null;

    // Extrato sem cabeçalho: a 1ª linha já é dado — não pode ser descartada.
    const first = clean[0];
    const looksLikeData = first.some((c) => parseDateLoose(c)) &&
      first.some((c) => U.parseMoney(c) != null && /\d/.test(c));
    if (looksLikeData) {
      return { delimiter, header: first.map((_, i) => 'Coluna ' + (i + 1)), body: clean, headless: true };
    }
    return { delimiter, header: first, body: clean.slice(1), headless: false };
  }

  function parseOFX(text) {
    const out = [];
    const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
    blocks.forEach((b) => {
      const tag = (t) => {
        const m = new RegExp('<' + t + '>([^<\\r\\n]*)', 'i').exec(b);
        return m ? m[1].trim() : '';
      };
      const date = parseDateLoose(tag('DTPOSTED'));
      const amount = U.parseMoney(tag('TRNAMT'));
      const desc = tag('MEMO') || tag('NAME') || 'Lançamento';
      if (date && amount != null) out.push({ date, description: desc, amount });
    });
    return out;
  }

  /** Texto livre: uma linha por lançamento, data + descrição + valor. */
  function parseFreeText(text) {
    const out = [];
    const skipped = [];
    text.split(/\r?\n/).forEach((line) => {
      const raw = line.trim();
      if (!raw || raw.length < 8) return;
      const dm = /(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{4}-\d{2}-\d{2})/.exec(raw);
      if (!dm) { skipped.push(raw); return; }
      const date = parseDateLoose(dm[1]);
      const rest = (raw.slice(0, dm.index) + ' ' + raw.slice(dm.index + dm[1].length)).trim();
      const money = rest.match(/-?R?\$?\s?\(?-?\d{1,3}(?:\.\d{3})*,\d{2}\)?-?|-?\d+[.,]\d{2}(?!\d)/g);
      if (!date || !money || !money.length) { skipped.push(raw); return; }
      const token = money[money.length - 1];
      const amount = U.parseMoney(token);
      if (amount == null || amount === 0) { skipped.push(raw); return; }
      let desc = rest.replace(token, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—|;:]+|[\s\-–—|;:]+$/g, '').trim();
      if (!desc) desc = 'Lançamento importado';
      const negHint = /\bD\b|\bdeb/i.test(raw) && !/\bC\b|\bcred/i.test(raw);
      out.push({ date, description: desc.slice(0, 90), amount: negHint ? -Math.abs(amount) : amount });
    });
    return { rows: out, skipped };
  }

  /** Registrato (Relatório de Relacionamentos do BCB): lista de instituições. */
  function detectRegistrato(text) {
    const n = U.norm(text);
    const hit = n.includes('registrato') || n.includes('relacionamentos com o sistema financeiro') ||
      (n.includes('banco central') && n.includes('instituicao'));
    if (!hit) return null;
    const names = new Set();
    // o cabeçalho do relatório não é uma instituição
    const headerNoise = /banco central|registrato|relacionament|sistema financeiro|relatorio/i;
    text.split(/\r?\n/).forEach((line) => {
      const l = line.trim();
      if (l.length < 4 || l.length > 80) return;
      if (headerNoise.test(U.norm(l))) return;
      const m = /(banco[^,;|\t]{2,50}|caixa econ[^,;|\t]{0,30}|nu pagamentos[^,;|\t]{0,20}|itau[^,;|\t]{0,30}|bradesco[^,;|\t]{0,30}|santander[^,;|\t]{0,30}|sicredi[^,;|\t]{0,30}|sicoob[^,;|\t]{0,30}|xp inv[^,;|\t]{0,30}|btg[^,;|\t]{0,30}|inter[^,;|\t]{0,20}|c6[^,;|\t]{0,20}|picpay[^,;|\t]{0,20}|mercado pago[^,;|\t]{0,20})/i.exec(l);
      if (m) names.add(U.smartCase(m[1].trim()));
    });
    return { institutions: Array.from(names).slice(0, 30) };
  }

  /* ============================================================
     Interface
     ============================================================ */

  Importer.renderTargets = function () {
    const prof = Store.profile();
    const opts = prof.accounts.map((a) => ({ value: 'acc:' + a.id, label: 'Conta · ' + a.name }))
      .concat(prof.cards.map((c) => ({ value: 'card:' + c.id, label: 'Cartão · ' + c.name })));
    UI.fillSelect(document.getElementById('importTarget'), opts, App.importTarget,
      opts.length ? null : 'Cadastre uma conta ou cartão primeiro');
  };

  Importer.readFile = function (file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('importText').value = String(reader.result || '');
      UI.toast(`Arquivo "${file.name}" carregado. Clique em "Analisar conteúdo".`, 'success');
    };
    reader.onerror = () => UI.toast('Não foi possível ler o arquivo.', 'error');
    reader.readAsText(file, 'utf-8');
  };

  Importer.analyze = function () {
    const text = document.getElementById('importText').value;
    const box = U.clear(document.getElementById('importResult'));
    parsed = null;

    if (!text.trim()) {
      box.appendChild(info('Cole o conteúdo ou selecione um arquivo antes de analisar.', 'is-warn'));
      return;
    }

    const reg = detectRegistrato(text);
    if (reg && reg.institutions.length) {
      box.appendChild(registratoPanel(reg));
    }

    if (/<OFX|<STMTTRN>/i.test(text)) {
      const rows = parseOFX(text);
      if (rows.length) { parsed = { type: 'ofx', rows }; renderPreview(box, `${rows.length} lançamentos lidos do arquivo OFX.`); return; }
      box.appendChild(info('Arquivo OFX reconhecido, mas nenhum lançamento (&lt;STMTTRN&gt;) foi encontrado.', 'is-warn'));
      return;
    }

    const csv = parseCSV(text);
    if (csv) { renderMapping(box, csv); return; }

    const free = parseFreeText(text);
    if (free.rows.length) {
      parsed = { type: 'text', rows: free.rows };
      renderPreview(box, `${free.rows.length} linha(s) interpretadas.` +
        (free.skipped.length ? ` ${free.skipped.length} linha(s) foram ignoradas por não conter data e valor.` : ''));
      return;
    }

    if (!reg) {
      box.appendChild(info(
        'Não consegui interpretar o conteúdo. Formatos aceitos: CSV (com cabeçalho), OFX/QFX, ' +
        'ou texto com uma linha por lançamento contendo data e valor — por exemplo: ' +
        '<code>05/08/2026 SUPERMERCADO SILVA -238,90</code>.', 'is-error'));
    }
  };

  function info(html, cls) {
    return el('div', { class: 'parse-info ' + (cls || ''), html });
  }

  /* ---------------- mapeamento de colunas (CSV) ---------------- */

  function guessColumn(header, candidates) {
    const idx = header.findIndex((h) => candidates.some((c) => U.norm(h).includes(c)));
    return idx >= 0 ? idx : null;
  }

  /** Sem cabeçalho útil: adivinha pelo conteúdo das primeiras linhas. */
  function guessByContent(body) {
    const rows = body.slice(0, 15);
    const cols = Math.max(...rows.map((r) => r.length));
    const score = { date: [], money: [], text: [] };
    for (let c = 0; c < cols; c++) {
      const cells = rows.map((r) => r[c] || '');
      score.date[c] = cells.filter((v) => parseDateLoose(v)).length / rows.length;
      score.money[c] = cells.filter((v) => /\d/.test(v) && U.parseMoney(v) != null && !parseDateLoose(v)).length / rows.length;
      score.text[c] = cells.filter((v) => /[a-zA-Z]{3}/.test(v) && U.parseMoney(v) == null).length / rows.length;
    }
    const best = (arr, exclude) => {
      let bi = null, bv = 0.5;
      arr.forEach((v, i) => { if (v > bv && !exclude.includes(i)) { bv = v; bi = i; } });
      return bi;
    };
    const date = best(score.date, []);
    const description = best(score.text, [date].filter((x) => x != null));
    const amount = best(score.money, [date, description].filter((x) => x != null));
    return { date, description, amount };
  }

  function renderMapping(box, csv) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { text: '2 · Diga o que é cada coluna' }),
      el('span', {
        class: 'card-note',
        text: `CSV com ${csv.body.length} linha(s), separador "${csv.delimiter === '\t' ? 'TAB' : csv.delimiter}"` +
          (csv.headless ? ' · sem cabeçalho, colunas deduzidas pelo conteúdo' : '')
      })
    ]));

    mapping = {
      date: guessColumn(csv.header, ['data', 'date', 'dt']),
      description: guessColumn(csv.header, ['descri', 'historic', 'memo', 'lancamento', 'estabelecimento', 'name', 'detalhe', 'titulo']),
      amount: guessColumn(csv.header, ['valor', 'amount', 'montante', 'quantia']),
      debit: guessColumn(csv.header, ['debito', 'saida', 'pagamento']),
      credit: guessColumn(csv.header, ['credito', 'entrada', 'recebimento'])
    };
    if (mapping.date == null || mapping.description == null || (mapping.amount == null && mapping.debit == null)) {
      const g = guessByContent(csv.body);
      if (mapping.date == null) mapping.date = g.date;
      if (mapping.description == null) mapping.description = g.description;
      if (mapping.amount == null && mapping.debit == null && mapping.credit == null) mapping.amount = g.amount;
    }

    const colOpts = csv.header.map((h, i) => ({ value: String(i), label: `${i + 1} · ${h || '(sem título)'}` }));
    const row = el('div', { class: 'map-row' });

    const mk = (key, label, placeholder) => {
      const sel = el('select', { class: 'input' });
      UI.fillSelect(sel, colOpts, mapping[key] != null ? String(mapping[key]) : '', placeholder);
      sel.addEventListener('change', () => {
        mapping[key] = sel.value === '' ? null : +sel.value;
        buildCsvRows(csv, card);
      });
      row.appendChild(el('div', { class: 'field' }, [el('span', { class: 'field-label', text: label }), sel]));
    };
    mk('date', 'Coluna da data *', 'Escolha…');
    mk('description', 'Coluna da descrição *', 'Escolha…');
    mk('amount', 'Coluna do valor', 'Não usar');
    mk('debit', 'Coluna de débito', 'Não usar');
    mk('credit', 'Coluna de crédito', 'Não usar');
    card.appendChild(row);

    card.appendChild(el('p', {
      class: 'hint',
      text: 'Use "valor" quando houver uma única coluna com sinal (negativo = despesa). Use "débito/crédito" quando o extrato separa entradas e saídas em colunas diferentes.'
    }));

    const preview = el('div', { id: 'csvPreviewSlot' });
    card.appendChild(preview);
    box.appendChild(card);
    buildCsvRows(csv, card);
  }

  function buildCsvRows(csv, card) {
    const slot = U.clear(card.querySelector('#csvPreviewSlot'));
    if (mapping.date == null || mapping.description == null) {
      slot.appendChild(info('Escolha ao menos as colunas de <strong>data</strong> e <strong>descrição</strong>.', 'is-warn'));
      parsed = null;
      const old = document.querySelector('#importResult .import-preview');
      if (old) old.remove();
      return;
    }
    const rows = [];
    let bad = 0;
    csv.body.forEach((r) => {
      const date = parseDateLoose(r[mapping.date]);
      const desc = String(r[mapping.description] || '').trim() || 'Lançamento importado';
      let amount = null;
      if (mapping.amount != null) amount = U.parseMoney(r[mapping.amount]);
      if (amount == null && mapping.debit != null) {
        const d = U.parseMoney(r[mapping.debit]);
        if (d != null && d !== 0) amount = -Math.abs(d);
      }
      if (amount == null && mapping.credit != null) {
        const c = U.parseMoney(r[mapping.credit]);
        if (c != null && c !== 0) amount = Math.abs(c);
      }
      if (!date || amount == null || amount === 0) { bad++; return; }
      rows.push({ date, description: desc.slice(0, 90), amount });
    });

    parsed = { type: 'csv', rows };
    const box = document.getElementById('importResult');
    const old = box.querySelector('.import-preview');
    if (old) old.remove();
    renderPreview(box, `${rows.length} linha(s) prontas.` + (bad ? ` ${bad} linha(s) ignoradas (data ou valor ilegível).` : ''));
  }

  /* ---------------- prévia e confirmação ---------------- */

  function renderPreview(box, summary) {
    if (!parsed || !parsed.rows.length) return;
    const target = document.getElementById('importTarget').value;
    if (!target) {
      box.appendChild(info('Cadastre uma conta ou cartão antes de importar.', 'is-error'));
      return;
    }
    const isCard = target.startsWith('card:');
    const targetId = target.slice(target.indexOf(':') + 1);

    // deduplicação contra o que já existe
    const existing = new Set(Store.profile().transactions.map((t) => t.date + '|' + U.norm(t.description) + '|' + t.amount.toFixed(2)));

    const items = parsed.rows.map((r) => {
      const kind = r.amount >= 0 && !isCard ? 'income' : 'expense';
      const amount = Math.abs(r.amount);
      const dupKey = r.date + '|' + U.norm(r.description) + '|' + amount.toFixed(2);
      return {
        date: r.date,
        description: r.description,
        amount,
        kind,
        categoryId: suggestCategory(r.description, kind),
        include: !existing.has(dupKey),
        duplicate: existing.has(dupKey)
      };
    });

    const card = el('div', { class: 'card import-preview' });
    const dupes = items.filter((i) => i.duplicate).length;

    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { text: '3 · Revise e confirme' }),
      el('span', {
        class: 'card-note',
        text: `Destino: ${isCard ? 'cartão' : 'conta'} ${isCard ? Store.cards.get(targetId).name : Calc.accountName(targetId)}`
      })
    ]));
    card.appendChild(info(summary + (dupes ? ` <strong>${dupes}</strong> parecem já existir e vieram desmarcadas.` : '')));

    const table = el('table', { class: 'table table-compact' }, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, checkAll()), el('th', { text: 'Data' }), el('th', { text: 'Descrição' }),
        el('th', { text: 'Tipo' }), el('th', { text: 'Categoria sugerida' }), el('th', { class: 'num', text: 'Valor' })
      ])),
      el('tbody')
    ]);
    const tbody = table.querySelector('tbody');

    items.forEach((it) => {
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Importar ' + it.description });
      cb.checked = it.include;
      cb.addEventListener('change', () => { it.include = cb.checked; });

      const catSel = el('select', { class: 'input input-sm' });
      const fill = () => UI.fillSelect(catSel,
        Store.profile().categories.filter((c) => c.kind === it.kind).map((c) => ({ value: c.id, label: c.name })),
        it.categoryId, 'Sem categoria');
      fill();
      catSel.addEventListener('change', () => { it.categoryId = catSel.value || null; });

      const kindSel = el('select', { class: 'input input-sm' });
      UI.fillSelect(kindSel, [{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }], it.kind);
      kindSel.disabled = isCard;
      kindSel.addEventListener('change', () => {
        it.kind = kindSel.value;
        it.categoryId = suggestCategory(it.description, it.kind);
        fill();
      });

      tbody.appendChild(el('tr', { class: it.duplicate ? 'is-pending' : '' }, [
        el('td', {}, el('label', { class: 'check' }, cb)),
        el('td', { text: U.fmtDateBR(it.date) }),
        el('td', {}, [
          document.createTextNode(it.description + ' '),
          it.duplicate ? UI.badge('possível duplicata', 'pend') : null
        ].filter(Boolean)),
        el('td', {}, kindSel),
        el('td', {}, catSel),
        el('td', { class: 'num ' + (it.kind === 'income' ? 'val-pos' : 'val-neg'), text: U.fmtBRL(it.amount) })
      ]));
    });

    function checkAll() {
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Marcar todos' });
      cb.checked = true;
      cb.addEventListener('change', () => {
        U.$$('tbody input[type=checkbox]', table).forEach((x) => { if (x.checked !== cb.checked) x.click(); });
      });
      return el('label', { class: 'check' }, cb);
    }

    card.appendChild(el('div', { class: 'table-wrap preview-scroll' }, table));

    const cbConfirm = el('input', { type: 'checkbox' });
    card.appendChild(el('div', { class: 'row gap-6', style: { marginTop: '14px', flexWrap: 'wrap' } }, [
      el('label', { class: 'check' }, [cbConfirm, el('span', { text: 'Já marcar tudo como confirmado (entra nos totais imediatamente)' })])
    ]));

    card.appendChild(el('div', { class: 'row gap-6', style: { marginTop: '12px', flexWrap: 'wrap' } }, [
      el('button', {
        class: 'btn btn-primary', text: 'Importar selecionados',
        onclick: () => {
          const chosen = items.filter((i) => i.include);
          if (!chosen.length) { UI.toast('Nenhuma linha selecionada.', 'error'); return; }
          Store.transactions.addMany(chosen.map((i) => ({
            kind: i.kind,
            description: i.description,
            amount: i.amount,
            date: i.date,
            categoryId: i.categoryId,
            accountId: isCard ? null : targetId,
            cardId: isCard ? targetId : null,
            confirmed: cbConfirm.checked,
            source: 'import'
          })));
          UI.toast(`${chosen.length} lançamento(s) importados${cbConfirm.checked ? '' : ' como previstos — confirme na página Receitas e Despesas'}.`, 'success');
          document.getElementById('importText').value = '';
          document.getElementById('importFile').value = '';
          U.clear(document.getElementById('importResult'));
          parsed = null;
        }
      }),
      el('button', {
        class: 'btn btn-outline', text: 'Descartar',
        onclick: () => { U.clear(document.getElementById('importResult')); parsed = null; }
      })
    ]));

    box.appendChild(card);
  }

  /* ---------------- Registrato ---------------- */

  function registratoPanel(reg) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { text: 'Relatório do Registrato detectado' }),
      el('span', { class: 'card-note', text: `${reg.institutions.length} instituição(ões) identificada(s)` })
    ]));
    card.appendChild(info(
      'O relatório de relacionamentos do Banco Central lista onde você tem conta, mas <strong>não traz lançamentos</strong>. ' +
      'Dá para criar as contas a partir dele e depois importar os extratos de cada banco em CSV/OFX.'));

    const list = el('div', { class: 'cat-list' });
    const chosen = new Set(reg.institutions);
    reg.institutions.forEach((name) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = true;
      cb.addEventListener('change', () => { if (cb.checked) chosen.add(name); else chosen.delete(name); });
      list.appendChild(el('div', { class: 'cat-row' }, [
        el('label', { class: 'check' }, cb),
        el('div', { class: 'cat-name', text: name }),
        el('span'), el('span')
      ]));
    });
    card.appendChild(list);

    card.appendChild(el('button', {
      class: 'btn btn-primary btn-sm', style: { marginTop: '12px' },
      text: 'Criar contas selecionadas',
      onclick: () => {
        if (!chosen.size) { UI.toast('Nenhuma instituição selecionada.', 'error'); return; }
        let n = 0;
        chosen.forEach((name) => {
          if (Store.profile().accounts.some((a) => U.norm(a.name) === U.norm(name))) return;
          const preset = Store.BANK_PRESETS.find((b) => U.norm(name).includes(U.norm(b.name)));
          Store.accounts.add({
            name, bank: preset ? preset.name : name, type: 'Conta corrente',
            color: preset ? preset.color : '#9AA0AC',
            openingBalance: 0, openedAt: U.todayISO(), archived: false
          });
          n++;
        });
        UI.toast(n ? `${n} conta(s) criadas — informe o saldo inicial de cada uma.` : 'Todas as contas já existiam.', n ? 'success' : null);
        Importer.renderTargets();
      }
    }));
    return card;
  }

  global.Importer = Importer;
})(window);
