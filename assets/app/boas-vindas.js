/* =============================================================
   boas-vindas.js — antes do primeiro login (31/10/2026)
   Inspiração Kontto: três telas curtas antes de pedir e-mail.
   1. boas-vindas  2. o que resolver primeiro  3. de onde sai o dinheiro
   e um fecho dizendo o que já ficou pronto.

   As respostas ficam neste aparelho (localStorage) e o painel usa
   depois do login: os blocos do Início seguem os objetivos, e a
   primeira conta já vem com o banco escolhido. Nada é enviado.
   Aparece uma vez; "Já uso o OAZE" fecha direto no login.
   ============================================================= */
(function (global) {
  'use strict';

  const CHAVE = 'oaze.boasvindas';
  const CHAVE_INICIO = 'oaze.v3.inicio';
  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
  if (ler(CHAVE)) return;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const OBJETIVOS = [
    { id: 'onde', titulo: 'Pra onde vai meu dinheiro', blocos: ['categorias', 'ultimos'], ic: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
    { id: 'mes', titulo: 'Não estourar o mês', blocos: ['sobra', 'tetos', 'planejado'], ic: 'M12 8v5l3 2M9 2h6M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' },
    { id: 'contas', titulo: 'Faturas e contas em dia', blocos: ['faturas', 'proximos', 'fixas'], ic: 'M4 5h16v14l-3-2-3 2-2-2-2 2-3-2-3 2zM8 9h8M8 13h6' },
    { id: 'meta', titulo: 'Juntar pra uma meta', blocos: ['metas', 'reserva'], ic: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z' },
    { id: 'relatorio', titulo: 'Ter tudo num relatório', blocos: ['comparativo', 'indicadores'], ic: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6' }
  ];
  const BANCOS = [['nubank', 'Nubank'], ['inter', 'Inter'], ['c6', 'C6 Bank'], ['itau', 'Itaú'], ['bradesco', 'Bradesco'], ['caixa', 'Caixa'],
    ['bancodobrasil', 'Banco do Brasil'], ['santander', 'Santander'], ['picpay', 'PicPay'], ['mercadopago', 'Mercado Pago'], ['btg', 'BTG Pactual'],
    ['xp', 'XP'], ['neon', 'Neon'], ['pagbank', 'PagBank'], ['sicoob', 'Sicoob'], ['sicredi', 'Sicredi'], ['next', 'Next'], ['pan', 'Banco PAN'],
    ['digio', 'Digio'], ['wise', 'Wise'], ['nomad', 'Nomad'], ['revolut', 'Revolut'], ['safra', 'Safra'], ['original', 'Original']];

  const estado = { passo: 0, objetivos: new Set(), banco: null };
  const svg = (d) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';

  function logoBanco(chave) {
    const BR = global.BancosBR || { ICONES: {}, PRESETS: {} };
    const raw = BR.ICONES[chave], p = BR.PRESETS[chave];
    if (!raw || !p) return '<span class="bv-logo">' + esc(chave.slice(0, 2).toUpperCase()) + '</span>';
    const vb = (/viewBox=["']([^"']+)["']/.exec(raw) || [, '0 0 108 108'])[1];
    const corpo = (/<svg[^>]*>([\s\S]*)<\/svg>/.exec(raw) || [, ''])[1].replace(/\s*fill="[^"]*"/g, '');
    return '<span class="bv-logo" style="background:' + esc(p.fundo) + '"><svg viewBox="' + esc(vb) + '" width="26" height="26" fill="' + esc(p.cor) + '" aria-hidden="true">' + corpo + '</svg></span>';
  }

  function topo(podePular) {
    const pct = estado.passo === 1 ? 33 : estado.passo === 2 ? 66 : 100;
    return '<div class="bv-topo"><button type="button" class="bv-voltar" data-bv="voltar" aria-label="Voltar">‹</button>'
      + '<div class="bv-progresso" role="progressbar" aria-label="Progresso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>'
      + (podePular ? '<button type="button" class="bv-pular" data-bv="pular">Pular</button>' : '<span class="bv-pular"></span>') + '</div>';
  }

  function tela() {
    if (estado.passo === 0) {
      return '<div class="bv-hero"><img class="bv-marca" src="/assets/brand/oaze-logo-mono-milk.svg" alt="OAZE" width="132" height="52"></div>'
        + '<div class="bv-folha"><h1 id="bv-titulo">Seu dinheiro, claro.<br>Sem planilha.</h1>'
        + '<p>Responda 2 perguntas e o OAZE se monta do seu jeito.</p>'
        + '<button type="button" class="bv-principal" data-bv="avancar">Montar meu OAZE</button>'
        + '<p class="bv-nota">Leva menos de 1 minuto</p>'
        + '<button type="button" class="bv-link" data-bv="fechar">Já uso o OAZE · Entrar</button></div>';
    }
    if (estado.passo === 1) {
      return topo(false) + '<div class="bv-corpo"><h1 id="bv-titulo">O que você quer resolver primeiro?</h1>'
        + '<p>Escolha quantos quiser. O Início do painel começa por isso.</p><div class="bv-opcoes">'
        + OBJETIVOS.map((o) => '<button type="button" class="bv-opcao" data-bv-obj="' + o.id + '" aria-pressed="' + estado.objetivos.has(o.id) + '">'
          + '<span class="bv-ic">' + svg(o.ic) + '</span><strong>' + esc(o.titulo) + '</strong><span class="bv-marca-sel" aria-hidden="true"></span></button>').join('')
        + '</div></div><div class="bv-rodape"><button type="button" class="bv-principal" data-bv="avancar"' + (estado.objetivos.size ? '' : ' disabled') + '>Continuar</button></div>';
    }
    if (estado.passo === 2) {
      return topo(true) + '<div class="bv-corpo"><h1 id="bv-titulo">De onde sai seu dinheiro?</h1>'
        + '<p>É só para identificar sua primeira conta. Nada é conectado ao banco.</p>'
        + '<input type="search" class="bv-busca" id="bv-busca" placeholder="Buscar banco" aria-label="Buscar banco" autocomplete="off">'
        + '<div class="bv-bancos" id="bv-bancos">' + BANCOS.map(([k, n]) => '<button type="button" class="bv-banco" data-bv-banco="' + k + '" data-nome="' + esc(norm(n)) + '" aria-pressed="' + (estado.banco === k) + '">' + logoBanco(k) + '<span>' + esc(n) + '</span></button>').join('')
        + '</div><p class="bv-vazio" id="bv-vazio" hidden>Não achou? Pule e escolha "Outro" ao cadastrar a conta.</p></div>'
        + '<div class="bv-rodape"><button type="button" class="bv-principal" data-bv="avancar"' + (estado.banco ? '' : ' disabled') + '>Continuar</button></div>';
    }
    const escolhidos = OBJETIVOS.filter((o) => estado.objetivos.has(o.id)).map((o) => o.titulo);
    const banco = (BANCOS.find(([k]) => k === estado.banco) || [])[1];
    return topo(false) + '<div class="bv-corpo"><h1 id="bv-titulo">Pronto. Seu OAZE está montado.</h1>'
      + '<ul class="bv-pronto">'
      + (escolhidos.length ? '<li><strong>Início pensado para</strong><small>' + esc(escolhidos.join(' · ')) + '</small></li>' : '')
      + (banco ? '<li><strong>Primeira conta</strong><small>' + esc(banco) + ', é só confirmar o saldo</small></li>' : '')
      + '<li><strong>Grátis para começar</strong><small>Lançamentos sem limite: a cada 20, um anúncio curto. Coco com cota diária. O Pro libera tudo, sem anúncios.</small></li>'
      + '</ul></div><div class="bv-rodape"><a class="bv-principal" href="/cadastro" data-bv="concluir">Criar conta grátis</a>'
      + '<button type="button" class="bv-link" data-bv="concluir-entrar">Já tenho conta · Entrar</button></div>';
  }

  let raiz = null;
  function desenhar(foco) {
    raiz.innerHTML = '<div class="bv-tela bv-passo-' + estado.passo + '">' + tela() + '</div>';
    raiz.setAttribute('aria-labelledby', 'bv-titulo');
    if (foco !== false) { const h = raiz.querySelector('h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  }

  function salvar() {
    const objetivos = [...estado.objetivos];
    gravar(CHAVE, { objetivos, banco: estado.banco, em: new Date().toISOString() });
    /* Só mexe nos blocos do Início se a pessoa ainda não escolheu nada. */
    if (objetivos.length && !ler(CHAVE_INICIO)) {
      const blocos = {};
      OBJETIVOS.filter((o) => estado.objetivos.has(o.id)).forEach((o) => o.blocos.forEach((b) => { blocos[b] = true; }));
      gravar(CHAVE_INICIO, blocos);
    }
  }
  function fechar(guardar) {
    if (guardar) salvar(); else gravar(CHAVE, { objetivos: [], banco: null, pulou: true, em: new Date().toISOString() });
    document.documentElement.classList.remove('bv-aberto');
    raiz.remove();
    const email = document.getElementById('email');
    if (email) email.focus({ preventScroll: true });
  }

  function iniciar() {
    raiz = document.createElement('div');
    raiz.className = 'bv';
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-modal', 'true');
    document.body.appendChild(raiz);
    document.documentElement.classList.add('bv-aberto');
    const entrada = document.getElementById('oaze-entrance');
    if (entrada) entrada.hidden = true;
    desenhar(false);

    raiz.addEventListener('click', (ev) => {
      const obj = ev.target.closest('[data-bv-obj]');
      if (obj) { const id = obj.dataset.bvObj; estado.objetivos.has(id) ? estado.objetivos.delete(id) : estado.objetivos.add(id); obj.setAttribute('aria-pressed', estado.objetivos.has(id)); raiz.querySelector('[data-bv="avancar"]').disabled = !estado.objetivos.size; return; }
      const b = ev.target.closest('[data-bv-banco]');
      if (b) { estado.banco = b.dataset.bvBanco; raiz.querySelectorAll('[data-bv-banco]').forEach((x) => x.setAttribute('aria-pressed', x === b)); raiz.querySelector('[data-bv="avancar"]').disabled = false; return; }
      const acao = ev.target.closest('[data-bv]');
      if (!acao) return;
      const a = acao.dataset.bv;
      if (a === 'avancar') { estado.passo++; desenhar(); }
      else if (a === 'voltar') { estado.passo = Math.max(0, estado.passo - 1); desenhar(); }
      else if (a === 'pular') { estado.banco = null; estado.passo = 3; desenhar(); }
      else if (a === 'fechar') fechar(false);
      else if (a === 'concluir') salvar();           // segue o link para /cadastro
      else if (a === 'concluir-entrar') fechar(true);
    });
    raiz.addEventListener('input', (ev) => {
      if (ev.target.id !== 'bv-busca') return;
      const q = norm(ev.target.value);
      let n = 0;
      raiz.querySelectorAll('[data-bv-banco]').forEach((x) => { const ok = !q || x.dataset.nome.includes(q); x.hidden = !ok; if (ok) n++; });
      raiz.querySelector('#bv-vazio').hidden = n > 0;
    });
    raiz.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && estado.passo > 0) { estado.passo--; desenhar(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window);
