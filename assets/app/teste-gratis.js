/* =============================================================
   teste-gratis.js — 1 semana grátis do Pro anual (31/10/2026)
   Inspiração Kontto: a oferta mostra a linha do tempo inteira antes
   do clique (hoje grátis, aviso no dia 5, cobrança no dia 7) para
   ninguém ser pego de surpresa na fatura.

   Regras (o servidor confere de novo, o app só pergunta):
   - só Pro anual, R$ 279,90/ano; uma vez por pessoa;
   - o cartão é pedido na página da Stripe; sem cartão no fim do
     teste, a assinatura cancela sozinha em vez de cobrar;
   - no app da Play Store a cobrança é da Google: aqui não aparece.
   A oferta aparece sozinha uma única vez (depois do primeiro login)
   e fica sempre disponível no topo da tela de planos.
   ============================================================= */
(function (global) {
  'use strict';

  const CHAVE_VISTO = 'oaze.teste.oferecido';
  const CHAVE_INICIO = 'oaze.teste.inicio';
  const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
  const contexto = () => { try { return global.OAZE_REPORT_CONTEXT ? global.OAZE_REPORT_CONTEXT() : null; } catch { return null; } };
  const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function preco() {
    const p = global.Planos && Planos.get ? Planos.get('pro') : null;
    const anual = p && p.anualCentavos ? p.anualCentavos : 27990;
    return { anual, mes: Math.floor(anual / 12) };
  }

  let elegivel = null, consultando = null;
  function podeOferecer() {
    const c = contexto();
    return !!(c && !c.demo && global.V3Backend && V3Backend.payment && !global.OAZE_BILLING_READONLY);
  }
  async function consultar() {
    if (elegivel !== null) return elegivel;
    if (!podeOferecer()) return false;
    if (!consultando) consultando = V3Backend.payment({ acao: 'teste' })
      .then((r) => { elegivel = !!(r && r.elegivel); return elegivel; })
      .catch(() => { elegivel = false; return false; });   // servidor antigo: sem oferta
    return consultando;
  }

  function linhaDoTempo() {
    const { anual, mes } = preco();
    const passo = (cls, ic, t, s) => '<li class="tg-passo tg-' + cls + '"><span class="tg-ic" aria-hidden="true">' + ic + '</span><span><strong>' + t + '</strong><small>' + s + '</small></span></li>';
    return '<ol class="tg-tempo">'
      + passo('hoje', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
        'Hoje: tudo liberado', 'Mais Coco por dia, relatórios em PDF, lançamentos sem limite e sem anúncio. ' + reais(0) + '.')
      + passo('aviso', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
        'Dia 5: a gente te avisa', 'Lembrete de que o teste está acabando. Sem surpresa na fatura.')
      + passo('pro', '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h20l-2-11-5 4-3-6-3 6-5-4z"/></svg>',
        'Dia 7: vira Pro anual', reais(mes) + '/mês, cobrado ' + reais(anual) + ' uma vez por ano. Cancele antes e não paga nada.')
      + '</ol>';
  }

  function abrir(origem) {
    if (!podeOferecer()) { if (global.location.hash !== '#plan') document.querySelector('[data-go="plan"]')?.click(); return; }
    gravar(CHAVE_VISTO, new Date().toISOString());
    const volta = document.activeElement;
    const d = document.createElement('dialog');
    d.className = 'tg-dialogo';
    d.setAttribute('aria-labelledby', 'tg-titulo');
    d.innerHTML = '<div class="tg-folha">'
      + '<button type="button" class="tg-fechar" data-tg="fechar" aria-label="Agora não">×</button>'
      + '<h2 id="tg-titulo">Comece com 1 semana grátis.</h2>'
      + '<p class="tg-sub">Tudo do Pro liberado hoje por ' + reais(0) + '. Veja como funciona:</p>'
      + linhaDoTempo()
      + '<ul class="tg-chips"><li>Relatórios + PDF</li><li>Lançamentos sem limite</li><li>Mais Coco por dia</li><li>Sem anúncios</li></ul>'
      + '<div class="tg-rodape"><button type="button" class="tg-principal" data-tg="comecar">Começar teste grátis</button>'
      + '<p class="tg-garantia">' + reais(0) + ' hoje · avisamos no dia 5 · cancele quando quiser</p>'
      + '<p class="tg-erro" role="alert" hidden></p>'
      + '<div class="tg-links"><button type="button" data-tg="planos">Ver todos os planos</button><a href="/suporte">Precisa de ajuda?</a></div>'
      + '<p class="tg-legal"><a href="/termos">Termos de uso</a> · <a href="/privacidade">Política de privacidade</a></p></div></div>';
    document.body.appendChild(d);
    d.addEventListener('close', () => { d.remove(); if (volta && volta.isConnected) volta.focus(); });
    d.addEventListener('click', async (ev) => {
      if (ev.target === d) { d.close(); return; }
      const b = ev.target.closest('[data-tg]');
      if (!b) return;
      if (b.dataset.tg === 'fechar') d.close();
      else if (b.dataset.tg === 'planos') { d.close(); document.querySelector('[data-go="plan"]')?.click(); }
      else if (b.dataset.tg === 'comecar') await comecar(d, b);
    });
    d.showModal();
    d.querySelector('[data-tg="comecar"]').focus();
    void origem;
  }

  async function comecar(d, botao) {
    const erro = d.querySelector('.tg-erro');
    erro.hidden = true;
    botao.disabled = true; botao.textContent = 'Abrindo pagamento seguro…';
    try {
      const canal = global.OAZE_NATIVE_DESKTOP ? { canal: 'windows' } : {};
      const r = await V3Backend.payment(Object.assign({ acao: 'assinar', plano: 'pro', ciclo: 'annual', moeda: 'BRL', teste: true }, canal));
      if (!/^https:\/\/checkout\.stripe\.com\//.test(String(r.url || ''))) throw new Error('O servidor não retornou uma página segura de pagamento.');
      gravar(CHAVE_INICIO, new Date().toISOString());
      if (global.OAZE_NATIVE_OPEN_EXTERNAL) { await global.OAZE_NATIVE_OPEN_EXTERNAL(r.url); d.close(); }
      else global.location.assign(r.url);
    } catch (e) {
      erro.textContent = (e && e.message) || 'Não foi possível abrir o pagamento. Nada foi cobrado.';
      erro.hidden = false;
      botao.disabled = false; botao.textContent = 'Começar teste grátis';
    }
  }

  /* Lembrete do dia 5, para o agendador de avisos (recursos-app.js). */
  function lembretes() {
    const inicio = ler(CHAVE_INICIO);
    if (!inicio) return [];
    const d5 = new Date(new Date(inicio).getTime() + 5 * 86400000);
    d5.setHours(10, 0, 0, 0);
    if (!(d5 > new Date())) return [];
    const { anual } = preco();
    return [{ at: d5.toISOString(), canal: 'oaze-contas', titulo: 'Seu teste do OAZE Pro acaba em 2 dias',
      corpo: 'No dia 7 vira Pro anual (' + reais(anual) + '). Para não pagar, cancele em Configurações › Plano.' }];
  }

  /* Faixa no topo da tela de planos. */
  function faixaPlanos() {
    const view = document.getElementById('v3-view');
    if (!view || view.querySelector('[data-tg-faixa]')) return;
    view.insertAdjacentHTML('afterbegin', '<section class="v3-panel tg-faixa" data-tg-faixa><span><strong>1 semana grátis do Pro</strong><small>Depois ' + reais(preco().mes) + '/mês no anual. Avisamos no dia 5.</small></span><button type="button" class="v3-primary" data-tg-abrir>Experimentar</button></section>');
  }

  document.addEventListener('click', (ev) => { if (ev.target.closest('[data-tg-abrir]')) abrir('faixa'); });
  document.addEventListener('oaze:render', async (ev) => {
    const pagina = ev.detail && ev.detail.page;
    if (pagina !== 'plan' && pagina !== 'home') return;
    const plano = global.Limites && Limites.plano ? Limites.plano() : 'free';
    if (plano !== 'free' || !(await consultar())) return;
    if (pagina === 'plan') faixaPlanos();
    else if (!ler(CHAVE_VISTO) && !document.querySelector('dialog[open]')) setTimeout(() => { if (!document.querySelector('dialog[open]')) abrir('primeira-vez'); }, 1800);
  });

  global.OazeTeste = { abrir, lembretes, consultar };
})(window);
