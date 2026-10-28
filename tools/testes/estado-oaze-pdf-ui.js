'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.OAZE_PLAYWRIGHT_MODULE ||
  'C:/Users/santtoro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.resolve(__dirname, '../..');
const types = { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ttf': 'font/ttf' };
const server = http.createServer((request, response) => {
  if (request.url === '/pdf-test.html') {
    response.writeHead(200, { 'Content-Type': 'text/html',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'" });
    response.end('<!doctype html><title>PDF test</title><button id="save">Salvar</button><script src="/assets/app/estado-oaze-pdf.js"></script>');
    return;
  }
  const target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(target, (error, bytes) => {
    response.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    response.end(error ? 'Not found' : bytes);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.OAZE_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/pdf-test.html');
    await page.evaluate(() => {
      document.getElementById('save').addEventListener('click', () => {
        window.OazeEstadoPDF.generate({
          from: '2026-10-01', to: '2026-10-30', periodTitle: 'Últimos 30 dias',
          owner: 'Pessoa teste', profile: 'Pessoal', income: 1000.1, expense: 250.2,
          categories: [{ name: 'Mercado', value: 250.2 }],
          monthly: [{ label: 'out. de 2026', income: 1000.1, expense: 250.2 }],
        }).catch((error) => { window.pdfError = error.message; });
      });
    });
    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.locator('#save').click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^estado-oaze-.*\.pdf$/);
    const file = path.join(os.tmpdir(), 'oaze-estado-pdf-test.pdf');
    await download.saveAs(file);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 2000, 'PDF vazio ou incompleto');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => window.pdfError || ''), '');
    fs.unlinkSync(file);
    console.log('Estado do OAZE: PDF gerado e baixado com CSP restritiva.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
