/* =============================================================
   tools/gen-icones-marca.js — as PNG da marca, a partir do SVG
   -------------------------------------------------------------
   Os ícones do manifesto, o apple-touch-icon e a imagem de
   compartilhamento são PNG: nenhum deles aceita SVG com segurança
   em todos os lugares onde aparece. Eles vinham da identidade V1 —
   o medalhão dourado com o coqueiro — e continuavam sendo o que
   o sistema operacional mostrava quando alguém instalava o app.

   Em vez de manter arte duplicada, as PNG passam a ser DERIVADAS
   do SVG da marca: uma fonte só, e um comando para refazer todas.

     1. um servidor estático na raiz do site, na porta 4173
     2. chrome --headless=new --remote-debugging-port=9222 \
               --user-data-dir=<pasta temporária> about:blank
     3. node tools/gen-icones-marca.js

   A de compartilhamento (og) não é o ícone esticado: é uma cena
   1200x630 com a marca centrada sobre o fundo da identidade, que é
   o que o WhatsApp e o LinkedIn mostram.
   ============================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const PORTA = 9222;
const BASE = 'http://localhost:4173';
const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'assets', 'img');

/* nome, largura, altura, e como a marca entra na cena */
const PECAS = [
  { arquivo: 'oaze-48.png', w: 48, h: 48, modo: 'icone' },
  { arquivo: 'oaze-180.png', w: 180, h: 180, modo: 'icone' },
  { arquivo: 'oaze-192.png', w: 192, h: 192, modo: 'icone' },
  { arquivo: 'oaze-512.png', w: 512, h: 512, modo: 'icone' },
  /* maskable: o sistema recorta um círculo, então a marca encolhe
     para caber na zona segura (80% do lado) e o fundo sangra. */
  { arquivo: 'oaze-512-mascara.png', w: 512, h: 512, modo: 'mascara' },
  { arquivo: 'oaze-og.png', w: 1200, h: 630, modo: 'social' }
];

function conectar(url) {
  return new Promise((ok, falha) => {
    const ws = new WebSocket(url);
    const pend = new Map();
    let n = 1;
    ws.addEventListener('open', () => ok({
      enviar(metodo, params) {
        const id = n++;
        return new Promise((res, rej) => {
          pend.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method: metodo, params: params || {} }));
        });
      },
      fechar() { ws.close(); }
    }));
    ws.addEventListener('error', falha);
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (!m.id || !pend.has(m.id)) return;
      const p = pend.get(m.id); pend.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    });
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function pagina(peca) {
  const escala = peca.modo === 'mascara' ? 0.8 : 1;
  const corpo = peca.modo === 'social'
    ? `<div class="cena"><img src="/assets/brand/oaze-logo-mono-milk.svg" alt=""></div>`
    : `<img class="marca" src="/assets/brand/oaze-app-icon.svg" alt="">`;
  return `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${peca.w}px;height:${peca.h}px;overflow:hidden;background:#0D1821}
    .marca{display:block;width:${Math.round(peca.w * escala)}px;height:${Math.round(peca.h * escala)}px;
      margin:${Math.round(peca.h * (1 - escala) / 2)}px auto}
    .cena{display:grid;place-items:center;width:100%;height:100%;
      background:radial-gradient(70% 90% at 50% 20%, #16303d 0%, #0D1821 70%)}
    .cena img{width:${Math.round(peca.w * 0.42)}px;height:auto}
  </style>${corpo}`;
}

async function alvoDaPagina() {
  const r = await fetch('http://127.0.0.1:' + PORTA + '/json/list');
  const alvos = await r.json();
  const p = alvos.find((a) => a.type === 'page');
  if (!p) throw new Error('nenhuma aba aberta no Chrome');
  return p.webSocketDebuggerUrl;
}

async function principal() {
  const cdp = await conectar(await alvoDaPagina());
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');

  for (const peca of PECAS) {
    await cdp.enviar('Emulation.setDeviceMetricsOverride', {
      width: peca.w, height: peca.h, deviceScaleFactor: 1, mobile: false
    });
    /* A página é escrita direto no documento: assim o SVG da marca
       ainda vem do servidor (mesma origem), e nada aqui duplica
       arte — só a emoldura. */
    await cdp.enviar('Page.navigate', { url: BASE + '/assets/brand/' });
    await espera(250);
    await cdp.enviar('Runtime.evaluate', {
      expression: `document.open();document.write(${JSON.stringify(pagina(peca))});document.close();`
    });
    await espera(600);
    const { data } = await cdp.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const arquivo = path.join(SAIDA, peca.arquivo);
    fs.writeFileSync(arquivo, Buffer.from(data, 'base64'));
    console.log(peca.arquivo.padEnd(24), peca.w + 'x' + peca.h, '→', Math.round(fs.statSync(arquivo).size / 1024) + 'KB');
  }
  cdp.fechar();
}

principal().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
