/* =============================================================
   fotografar-app.js — refaz as capturas do app que o site mostra
   -------------------------------------------------------------
   As telas em /assets/telas são a cara do produto para quem ainda
   não entrou. Quando o app muda de identidade, elas envelhecem em
   silêncio: o site passa a vender uma coisa e a entregar outra.
   Este script refaz as cinco de uma vez, sempre do mesmo jeito.

   COMO RODAR
     1. um servidor estático na raiz do site, na porta 4173
     2. Chrome sem janela com a porta de depuração aberta:
        chrome --headless=new --remote-debugging-port=9222 \
               --user-data-dir=<pasta temporária> about:blank
     3. node tools/fotografar-app.js
     4. conferir as imagens em tools/telas-novas e, se prestarem,
        copiar para assets/telas

   POR QUE NÃO PELO PAINEL DO NAVEGADOR
   Ele REDUZ a captura quando o viewport é maior que o painel, sem
   avisar: 1440x900 sai com 800px. O CDP não tem esse teto.

   POR QUE NÃO --virtual-time-budget
   Ele não dispara requestAnimationFrame, e os gráficos saem em
   branco. Aqui se espera em tempo real.

   É A V3 QUE É FOTOGRAFADA, PORQUE É ELA QUE ESTÁ NO AR
   Antes isto abria /app.html e semeava um perfil de vitrine à mão.
   O painel servido em /app passou a ser a V3, e as capturas
   continuaram mostrando o anterior: o site vendia uma tela que
   ninguém mais recebia ao entrar. Agora a foto sai da prévia
   pública, que é a V3 de verdade com o perfil de exemplo que ela
   já carrega — sem semear nada e sem nenhum dado de pessoa real.
   ============================================================= */
const fs = require('fs');
const path = require('path');

const PORTA = 9222;
const BASE = 'http://localhost:4173';
const SAIDA = path.join(__dirname, 'telas-novas');
const PAGINA = '/preview-v3/index.html';

/* ---------------- CDP ---------------- */

function conectar(url) {
  return new Promise((ok, falha) => {
    const ws = new WebSocket(url);
    const pendentes = new Map();
    let proximo = 1;
    ws.addEventListener('open', () => ok({
      enviar(metodo, params) {
        const id = proximo++;
        return new Promise((res, rej) => {
          pendentes.set(id, { res, rej });
          ws.send(JSON.stringify({ id, method: metodo, params: params || {} }));
        });
      },
      fechar() { ws.close(); }
    }));
    ws.addEventListener('error', falha);
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (!m.id || !pendentes.has(m.id)) return;
      const p = pendentes.get(m.id);
      pendentes.delete(m.id);
      if (m.error) p.rej(new Error(m.method + ': ' + m.error.message));
      else p.res(m.result);
    });
  });
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function avaliar(cdp, expressao) {
  const r = await cdp.enviar('Runtime.evaluate', {
    expression: expressao, awaitPromise: true, returnByValue: true
  });
  if (r.exceptionDetails) {
    throw new Error('na página: ' + (r.exceptionDetails.exception
      ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
  }
  return r.result.value;
}

async function esperarPronto(cdp, tentativas) {
  for (let i = 0; i < (tentativas || 60); i++) {
    const pronto = await avaliar(cdp, "document.readyState === 'complete' && !!document.querySelector('#v3-view .v3-home')");
    if (pronto) return true;
    await espera(250);
  }
  throw new Error('a página não ficou pronta');
}

/* ---------------- o que sai da foto ----------------
   A prévia avisa, na própria tela, que é prévia. A página inicial
   diz a mesma coisa na pílula ao lado da cena — e o aviso repetido
   dentro da captura vira ruído dentro de uma moldura de 170px. */

const LIMPAR = `(() => {
  const nota = document.getElementById('v3-demo-note');
  if (nota) nota.hidden = true;
  const biscoitos = document.querySelector('.cookie-barra, [data-cookies], .cookies');
  if (biscoitos) biscoitos.style.display = 'none';
  if (!window.__manterCoco) {
    const fab = document.querySelector('.v3-coco-fab');
    if (fab) fab.style.display = 'none';
  }
  window.scrollTo(0, 0);
  return true;
})()`;

/* A Coco é a única captura em que o lançador NÃO sai da foto: ele é
   o que se clica para abrir a conversa. Nas outras ele tapa o canto
   inferior sem explicar nada a quem olha de fora. */
const ABRIR_COCO = `(() => {
  const b = document.querySelector('.v3-coco-fab');
  if (b) b.click();
  return !!b;
})()`;

/* No início a carteira já aparece aberta, então "a tela da carteira"
   tem de ser a PÁGINA dela — senão as duas capturas saem idênticas,
   byte a byte, e o site mostra a mesma imagem duas vezes dizendo que
   são coisas diferentes. */
const IR_PARA_CARTEIRA = `(() => {
  const b = [...document.querySelectorAll('[data-go]')].find((n) => n.dataset.go === 'wallet');
  if (b) b.click();
  const fechada = document.querySelector('.v3-wallet.is-closed');
  if (fechada) {
    const t = fechada.querySelector('[data-action="wallet-toggle"]');
    if (t) t.click();
  }
  window.scrollTo(0, 0);
  return !!b;
})()`;

/* ---------------- a sessão ---------------- */

async function alvoDaPagina() {
  const r = await fetch('http://127.0.0.1:' + PORTA + '/json/list');
  const alvos = await r.json();
  const pagina = alvos.find((a) => a.type === 'page');
  if (!pagina) throw new Error('nenhuma aba aberta no Chrome');
  return pagina.webSocketDebuggerUrl;
}

/* =============================================================
   QUANTO ENTREGAR
   -------------------------------------------------------------
   Medido na página: o nó central é desenhado com cerca de 480x270
   CSS e os satélites com 173x240. Entregar o dobro cobre tela
   retina e acabou — 2880x1800 para uma moldura de 480px é cinco
   vezes o necessário: o navegador joga fora os pixels e a pessoa
   paga o download.
   ============================================================= */
const ESCALA = { 1440: 1, 1024: 1, 410: 2.25 };

async function capturar(cdp, nome, largura, altura, preparar, manterCoco) {
  await cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: largura, height: altura, deviceScaleFactor: ESCALA[largura] || 2,
    mobile: largura < 760, screenWidth: largura, screenHeight: altura
  });
  await cdp.enviar('Page.navigate', { url: BASE + PAGINA });
  await esperarPronto(cdp);
  await espera(1600);                 // render, fontes e gráficos
  await avaliar(cdp, 'window.__manterCoco = ' + (manterCoco ? 'true' : 'false') + ', true');
  if (preparar) await avaliar(cdp, preparar);
  await avaliar(cdp, LIMPAR);
  await espera(900);                  // a mola da carteira assentar
  const { data } = await cdp.enviar('Page.captureScreenshot', {
    format: 'jpeg', quality: 90, captureBeyondViewport: false
  });
  const arquivo = path.join(SAIDA, nome + '.jpg');
  fs.writeFileSync(arquivo, Buffer.from(data, 'base64'));
  const b = fs.readFileSync(arquivo);
  const e = ESCALA[largura] || 2;
  console.log(nome.padEnd(22), (Math.round(largura * e) + 'x' + Math.round(altura * e)).padEnd(12),
    '(' + largura + 'px @' + e + 'x)', '→', Math.round(b.length / 1024) + 'KB');
}

async function principal() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const cdp = await conectar(await alvoDaPagina());
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');

  /* A preferência de cookies vai em "recusados", que é a opção que
     preserva mais — e é a que sai na foto, então é a que o site
     mostra ao mundo. */
  await cdp.enviar('Page.navigate', { url: BASE + PAGINA });
  await esperarPronto(cdp);
  await avaliar(cdp, "localStorage.setItem('oaze.cookies.v2','recusados'), true");

  await capturar(cdp, 'computador-inicio', 1440, 900, null);
  await capturar(cdp, 'tablet-carteira', 1024, 720, IR_PARA_CARTEIRA);
  await capturar(cdp, 'celular-inicio', 410, 864, null);
  await capturar(cdp, 'celular-carteira', 410, 864, IR_PARA_CARTEIRA);
  await capturar(cdp, 'celular-coco', 410, 864, ABRIR_COCO, true);

  cdp.fechar();
}

principal().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });