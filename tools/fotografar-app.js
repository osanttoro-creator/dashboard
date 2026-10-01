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

   OS DADOS SÃO INVENTADOS
   Isto vira imagem pública: o perfil de vitrine abaixo é fictício,
   e nada aqui deve apontar para dados de pessoa de verdade.
   ============================================================= */
const fs = require('fs');
const path = require('path');

const PORTA = 9222;
const BASE = 'http://localhost:4173';
const SAIDA = path.join(__dirname, 'telas-novas');

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
    const pronto = await avaliar(cdp, "document.readyState === 'complete' && !!window.App && !!window.Store");
    if (pronto) return true;
    await espera(250);
  }
  throw new Error('a página não ficou pronta');
}

/* ---------------- o perfil de vitrine ---------------- */
/* Dados inventados: isto vira imagem pública. */

const SEMEAR = `(() => {
  const p = Store.profile();
  p.accounts.length = 0; Store.commit('accounts');
  const contas = [
    {name:'Conta corrente', bank:'Nubank', type:'Conta corrente', openingBalance:3180, color:'#5A3E7A'},
    {name:'Reserva', bank:'Itaú', type:'Poupança', openingBalance:12400, color:'#7A503E'},
    {name:'Dia a dia', bank:'Inter', type:'Conta corrente', openingBalance:740, color:'#3E647A'}
  ].map(c => Store.accounts.add(Object.assign({openedAt:'2026-01-05', meios:['pix','cartao_fisico','transferencia']}, c)));
  p.cards.length = 0; Store.commit('cards');
  const cartoes = [
    {name:'Nubank Ultravioleta', bank:'Nubank', limit:9000, closingDay:20, dueDay:28},
    {name:'Itaú Click', bank:'Itaú', limit:4500, closingDay:15, dueDay:22}
  ].map(c => Store.cards.add(Object.assign({accountId:contas[0].id}, c)));

  const cat = (nome, kind) => {
    const a = p.categories.find(c => c.kind===kind && U.norm(c.name)===U.norm(nome));
    return a ? a.id : null;
  };
  p.transactions.length = 0; Store.commit('transactions');
  const dia = (m,d) => '2026-' + String(m).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  const lanc = [];
  for (let m = 1; m <= 9; m++) {
    const r = (n) => Math.round(n * (0.88 + ((m*37)%25)/100) * 100) / 100;
    lanc.push({kind:'income',description:'Salário',amount:r(7850),date:dia(m,5),accountId:contas[0].id,categoryId:cat('Salário','income'),confirmed:true,meio:'transferencia'});
    if (m % 3 === 0) lanc.push({kind:'income',description:'Freelance de design',amount:r(1600),date:dia(m,17),accountId:contas[2].id,categoryId:cat('Extras','income'),confirmed:true,meio:'pix'});
    lanc.push({kind:'expense',description:'Aluguel',amount:2400,date:dia(m,5),accountId:contas[0].id,categoryId:cat('Moradia','expense'),confirmed:true,meio:'transferencia'});
    lanc.push({kind:'expense',description:'Mercado do mês',amount:r(790),date:dia(m,8),accountId:contas[0].id,categoryId:cat('Alimentação','expense'),confirmed:true,meio:'cartao_fisico'});
    lanc.push({kind:'expense',description:'Contas de casa',amount:r(305),date:dia(m,10),accountId:contas[0].id,categoryId:cat('Moradia','expense'),confirmed:true,meio:'debito_automatico'});
    lanc.push({kind:'expense',description:'Transporte',amount:r(260),date:dia(m,15),accountId:contas[0].id,categoryId:cat('Transporte','expense'),confirmed:true,meio:'pix'});
    lanc.push({kind:'expense',description:'Lazer',amount:r(340),date:dia(m,22),cardId:cartoes[0].id,categoryId:cat('Lazer','expense'),confirmed:true});
  }
  [['Aluguel',2400,5,'Moradia','transferencia'],['Energia',188.40,9,'Moradia','boleto'],
   ['Internet',119.90,10,'Moradia','debito_automatico'],['Mercado da semana',412.75,7,'Alimentação','cartao_fisico'],
   ['Mercado da semana',388.20,21,'Alimentação','cartao_fisico'],['Academia',139,8,'Saúde','debito_automatico'],
   ['Farmácia',96.30,16,'Saúde','pix'],['Uber',38.90,12,'Transporte','pix'],['Gasolina',240,18,'Transporte','cartao_fisico']
  ].forEach(([d,v,n,c,meio]) => lanc.push({kind:'expense',description:d,amount:v,date:dia(10,n),accountId:contas[0].id,categoryId:cat(c,'expense'),confirmed:n<=28,meio}));
  [['Jantar fora',186.50,11,'Alimentação'],['Livraria',94.90,13,'Lazer'],['Streaming',55.80,2,'Lazer'],['Tênis de corrida',459,19,'Lazer']]
    .forEach(([d,v,n,c]) => lanc.push({kind:'expense',description:d,amount:v,date:dia(10,n),cardId:cartoes[0].id,categoryId:cat(c,'expense'),confirmed:true}));
  lanc.push({kind:'income',description:'Salário',amount:7850,date:dia(10,5),accountId:contas[0].id,categoryId:cat('Salário','income'),confirmed:true,meio:'transferencia'});
  lanc.push({kind:'income',description:'Freelance de design',amount:1900,date:dia(10,14),accountId:contas[2].id,categoryId:cat('Extras','income'),confirmed:true,meio:'pix'});
  Store.transactions.addMany(lanc);
  if (!p.goals.length) Store.goals.add({name:'Viagem em janeiro', target:6000, saved:2450, color:'#3E7A6D'});
  Store.setOwnerName('Marina');
  return Store.profile().transactions.length;
})()`;

/* O que é convite de cadastro sai da foto: é sobre conta, não sobre
   o produto. Nada aqui inventa funcionalidade — só esconde o que
   existe porque a demonstração não está logada. */
const LIMPAR = `(() => {
  const some = (n) => { if (n) n.style.display = 'none'; };
  [...document.querySelectorAll('*')].forEach((n) => {
    if (n.children.length > 4) return;
    const t = (n.textContent || '').trim();
    if (/^Estes dados estão só neste aparelho/.test(t) && t.length < 260) some(n.closest('.card,.banner,.aviso,.faixa') || n);
    if (/^Não logado/.test(t) && t.length < 70) some(n);
    if (/^Dados só neste aparelho$/.test(t)) some(n.parentElement);
  });
  if (!window.__manterCoco) some(document.querySelector('.uglez-flut'));
  return true;
})()`;

/* A Coco é a única captura em que o lançador NÃO sai da foto: ele é o
   que se clica para abrir a conversa. Nas outras ele só tapa conteúdo. */
const ABRIR_COCO = `(() => {
  const b = document.getElementById('uglezFlutBotao');
  if (b) b.click();
  return !!b;
})()`;

const ABRIR_CARTEIRA = `(() => {
  const b = document.querySelector('.carteira-abrir');
  if (b && !document.querySelector('.carteira.esta-aberta')) b.click();
  window.scrollTo(0, 0);
  return !!document.querySelector('.carteira.esta-aberta');
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
   Medido na página (medir-mockups.js, 01/10/2026): o notebook é
   desenhado com 528x332 CSS, o tablet com 306x215 e o celular com
   450x948 no bloco grande — o maior uso que ele tem.

   Entregar o dobro disso cobre tela retina e acabou. 2880x1800 para
   um notebook de 528px é 5x o necessário: o navegador joga fora os
   pixels e a pessoa paga o download. Daí a escala por aparelho em
   vez de um "2x" para todos.
   ============================================================= */
const ESCALA = { 1440: 1, 1024: 1, 410: 2.25 };

async function capturar(cdp, nome, largura, altura, preparar, manterCoco) {
  await cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: largura, height: altura, deviceScaleFactor: ESCALA[largura] || 2,
    mobile: largura < 760, screenWidth: largura, screenHeight: altura
  });
  await cdp.enviar('Page.navigate', { url: BASE + '/app.html' });
  await esperarPronto(cdp);
  await espera(1600);                 // render, fontes e gráficos
  await avaliar(cdp, 'window.__manterCoco = ' + (manterCoco ? 'true' : 'false') + ', true');
  await avaliar(cdp, LIMPAR);
  if (preparar) await avaliar(cdp, preparar);
  await espera(900);                  // a mola assentar
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

  /* o aceite de privacidade e o perfil, uma vez só */
  await cdp.enviar('Page.navigate', { url: BASE + '/app.html' });
  await esperarPronto(cdp);
  /* Aceite de privacidade e preferência de cookies: a de cookies vai
     em "recusados", que é a opção que preserva mais — e é a que sai
     na foto, então é a que o site mostra ao mundo. */
  await avaliar(cdp, "localStorage.setItem('oaze.privacidade.local.2026-10-01','aceito'),"
    + " localStorage.setItem('oaze.cookies.v2','recusados'), true");
  await cdp.enviar('Page.navigate', { url: BASE + '/app.html' });
  await esperarPronto(cdp);
  await espera(800);
  const n = await avaliar(cdp, SEMEAR);
  console.log('perfil de vitrine:', n, 'lançamentos');

  await capturar(cdp, 'computador-inicio', 1440, 900, ABRIR_CARTEIRA);
  await capturar(cdp, 'tablet-carteira', 1024, 720, ABRIR_CARTEIRA);
  await capturar(cdp, 'celular-inicio', 410, 864, null);
  await capturar(cdp, 'celular-carteira', 410, 864, ABRIR_CARTEIRA);
  await capturar(cdp, 'celular-coco', 410, 864, ABRIR_COCO, true);

  cdp.fechar();
}

principal().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
