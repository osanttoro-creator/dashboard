/* Leitura local de extratos. Nunca grava dados nem envia o arquivo a um servidor.
   Um layout desconhecido falha fechado: saldo e resumo não viram lançamento. */
(function (global) {
  'use strict';

  const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const MONEY = /^-?\d[\d.]*,\d{2}$/;
  const MAX_ROWS = 1000;
  const MAX_PAGES = 30;
  const MAX_BYTES = 10_000_000;

  function isoDate(raw) {
    const match = DATE.exec(String(raw || '').trim());
    if (!match) return null;
    const iso = `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
  }
  function cents(raw) {
    const value = String(raw || '').trim().replace(/^R\$\s*/, '');
    if (!MONEY.test(value)) return null;
    const negative = value.startsWith('-');
    const digits = value.replace(/\D/g, '');
    const amount = Number(digits);
    return Number.isSafeInteger(amount) ? (negative ? -amount : amount) : null;
  }
  function normalized(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function row(date, description, signedCents, balanceCents) {
    if (!date || !description || !Number.isSafeInteger(signedCents) || !signedCents) return null;
    return { date, description: String(description).replace(/\s+/g, ' ').trim().slice(0, 120),
      cents: signedCents, balanceCents: Number.isSafeInteger(balanceCents) ? balanceCents : null };
  }
  function result(format, rows, checks, warnings) {
    if (!rows.length || rows.length > MAX_ROWS) throw new Error('Não encontrei movimentos seguros para revisar neste arquivo.');
    const unique = new Set(rows.map((item) => `${item.date}|${item.description}|${item.cents}`));
    if (unique.size !== rows.length) warnings.push('Há movimentos idênticos no arquivo. Confira cada repetição antes de salvar.');
    if (checks.failed) warnings.push('A sequência de saldos não confere. Revise o arquivo antes de registrar qualquer movimento.');
    return { format, rows, checks, warnings };
  }
  function csvCells(text) {
    const lines = [];
    let cell = '', cells = [], quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === ';' && !quoted) { cells.push(cell); cell = ''; }
      else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cells.push(cell); if (cells.some((part) => part.trim())) lines.push(cells);
        cell = ''; cells = [];
      } else cell += ch;
    }
    if (quoted) throw new Error('CSV com aspas incompletas.');
    cells.push(cell); if (cells.some((part) => part.trim())) lines.push(cells);
    return lines;
  }
  function parseCsv(text) {
    const lines = csvCells(String(text || '').replace(/^\uFEFF/, ''));
    const header = lines.findIndex((cells) => normalized(cells[0]) === 'data' &&
      cells.some((cell) => normalized(cell).includes('credito')) &&
      cells.some((cell) => normalized(cell).includes('debito')));
    if (header < 0) throw new Error('Layout CSV não reconhecido. Nenhum lançamento foi importado.');
    const names = lines[header].map(normalized);
    const credit = names.findIndex((name) => name.includes('credito'));
    const debit = names.findIndex((name) => name.includes('debito'));
    const balance = names.findIndex((name) => name.includes('saldo'));
    const description = names.findIndex((name) => name.includes('lancamento') || name.includes('descricao') || name.includes('historico'));
    if ([credit, debit, balance, description].some((index) => index < 0)) throw new Error('Colunas financeiras incompletas neste CSV.');
    const rows = [], checks = { passed: 0, failed: 0 }, warnings = [];
    let previousBalance = null;
    for (const cells of lines.slice(header + 1)) {
      const date = isoDate(cells[0]);
      if (!date) continue; // Rodapés e totais não são transações.
      const creditCents = cents(cells[credit]?.trim() || '0,00');
      const debitCents = cents(cells[debit]?.trim() || '0,00');
      const balanceCents = cents(cells[balance]);
      if (creditCents === null || debitCents === null || balanceCents === null || creditCents < 0 || debitCents < 0 || (creditCents && debitCents)) {
        throw new Error('CSV com valor ou sinal ambíguo. Nenhum lançamento foi importado.');
      }
      const movement = creditCents - debitCents;
      if (previousBalance !== null) {
        if (previousBalance + movement === balanceCents) checks.passed++;
        else checks.failed++;
      }
      previousBalance = balanceCents;
      if (!movement) continue; // Saldo inicial.
      const item = row(date, cells[description], movement, balanceCents);
      if (!item) throw new Error('Linha de lançamento incompleta no CSV.');
      rows.push(item);
    }
    return result('CSV bancário', rows, checks, warnings);
  }
  function linesFromItems(items) {
    const lines = [];
    for (const item of items) {
      const value = String(item.str || '').trim();
      if (!value) continue;
      const x = item.transform[4], y = item.transform[5];
      let line = lines.find((entry) => Math.abs(entry.y - y) <= 2);
      if (!line) { line = { y, parts: [] }; lines.push(line); }
      line.parts.push({ x, value });
    }
    return lines.sort((a, b) => b.y - a.y).map((line) => line.parts.sort((a, b) => a.x - b.x).map((part) => part.value).join(' ').replace(/\s+/g, ' ').trim());
  }
  function parseDatedPdf(pages) {
    const parsed = [], warnings = [], balances = [];
    const linePattern = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\d[\d.]*,\d{2})$/;
    for (const page of pages) {
      for (const line of linesFromItems(page)) {
        const match = linePattern.exec(line);
        if (!match) continue;
        const date = isoDate(match[1]), amount = cents(match[3]);
        if (!date || amount === null) throw new Error('Data ou valor inválido no extrato PDF.');
        if (normalized(match[2]) === 'saldo do dia') balances.push({ date, cents: amount });
        else if (amount) {
          const item = row(date, match[2], amount, null);
          if (!item) throw new Error('Movimento incompleto no PDF.');
          parsed.push(item);
        }
      }
    }
    if (!balances.length) throw new Error('Layout do extrato PDF não reconhecido.');
    const checks = { passed: 0, failed: 0 };
    const ordered = balances.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < ordered.length; i++) {
      const movement = parsed.filter((item) => item.date > ordered[i - 1].date && item.date <= ordered[i].date)
        .reduce((sum, item) => sum + item.cents, 0);
      if (ordered[i - 1].cents + movement === ordered[i].cents) checks.passed++;
      else checks.failed++;
    }
    return result('PDF bancário com saldos diários', parsed, checks, warnings);
  }
  function parseColumnPdf(pages) {
    const rows = [], checks = { passed: 0, failed: 0 }, warnings = [];
    let currentDate = null, previousBalance = null;
    for (const page of pages) {
      const items = page.filter((item) => String(item.str || '').trim()).map((item) => ({
        x: item.transform[4], y: item.transform[5], text: String(item.str).trim()
      }));
      const dateItems = items.filter((item) => item.x >= 35 && item.x < 95 && isoDate(item.text))
        .sort((a, b) => b.y - a.y);
      const balanceItems = items.filter((item) => item.x >= 510 && item.y < 660 && item.y > 70 && cents(item.text) !== null)
        .sort((a, b) => b.y - a.y);
      for (const anchor of balanceItems) {
        const dated = dateItems.find((item) => Math.abs(item.y - anchor.y) <= 3);
        if (dated) currentDate = isoDate(dated.text);
        if (!currentDate) continue;
        const balanceCents = cents(anchor.text);
        const amountItem = items.find((item) => item.x >= 380 && item.x < 500 && Math.abs(item.y - anchor.y) <= 3 && cents(item.text) !== null);
        if (!amountItem) { previousBalance = balanceCents; continue; } // Saldo inicial.
        const signed = amountItem.x < 450 ? cents(amountItem.text) : -cents(amountItem.text);
        if (!signed) { previousBalance = balanceCents; continue; } // Saldo inicial com zero explícito.
        const description = items.filter((item) => item.x >= 105 && item.x < 300 && item.y >= anchor.y - 6 && item.y <= anchor.y + 6)
          .sort((a, b) => b.y - a.y || a.x - b.x).map((item) => item.text).join(' ');
        if (!description && items.some((item) => item.x < 100 && Math.abs(item.y - anchor.y) <= 3 && !isoDate(item.text))) continue; // Total do período.
        const movement = row(currentDate, description, signed, balanceCents);
        if (!movement) throw new Error('Linha de extrato incompleta. Nenhum lançamento foi importado.');
        if (previousBalance !== null) {
          if (previousBalance + signed === balanceCents) checks.passed++;
          else checks.failed++;
        }
        previousBalance = balanceCents;
        rows.push(movement);
      }
    }
    if (!rows.length) throw new Error('Layout do extrato PDF não reconhecido.');
    return result('PDF bancário em colunas', rows, checks, warnings);
  }
  function parsePdfItems(pages) {
    if (!Array.isArray(pages) || !pages.length || pages.length > MAX_PAGES) throw new Error('PDF longo demais para leitura segura.');
    const text = pages.slice(0, 2).flatMap(linesFromItems).join(' ').toLowerCase();
    if (text.includes('saldo do dia') && /\d{2}\/\d{2}\/\d{4}/.test(text)) return parseDatedPdf(pages);
    if (text.includes('crédito') && text.includes('débito') && text.includes('saldo')) return parseColumnPdf(pages);
    throw new Error('Este PDF não tem um layout de extrato reconhecido. Nada foi importado.');
  }
  async function parseFile(file) {
    if (!file || file.size < 40 || file.size > MAX_BYTES) throw new Error('Arquivo vazio ou maior que 10 MB.');
    const name = String(file.name || '').toLowerCase();
    if (name.endsWith('.csv')) return parseCsv(await file.text());
    if (!name.endsWith('.pdf')) throw new Error('Use um extrato PDF ou CSV.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('O arquivo não é um PDF válido.');
    const pdfjs = await import('/assets/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    if (pdf.numPages > MAX_PAGES) throw new Error('PDF longo demais para leitura segura.');
    const pages = [];
    try {
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        pages.push((await page.getTextContent()).items);
        page.cleanup();
      }
    } finally { await pdf.destroy(); }
    return parsePdfItems(pages);
  }
  const api = Object.freeze({ parseCsv, parsePdfItems, parseFile, normalized });
  global.CocoImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
