/* =============================================================
   funcoes-oaze.js — rodada de 01/11/2026
   Caixinhas, dividir despesa, busca, simulador de quitação,
   sugestões pela notificação do banco, nota fiscal (NFC-e),
   relatório para o IR, resumo automático e lista de desejos.

   Usa a casca de telas de mais-telas.js (OazeMais): tela cheia
   com voltar, gravação por V3Backend.mutate (sincroniza igual ao
   resto) e, na demonstração, tudo só na memória.
   ============================================================= */
(function (global) {
  'use strict';

  const M = () => global.OazeMais;
  const esc = (s) => M().esc(s);
  const reais = (v) => M().reais(v);
  const num = (v) => M().num(v);
  const hoje = () => M().hoje();
  const P = () => M().P();
  const avisar = (t) => M().avisar(t);
  const mudar = (fn, msg) => M().mudar(fn, msg);
  const redesenhar = () => M().redesenhar();
  const uid = (p) => M().uid(p);
  const nomeMes = (ym) => M().nomeMes(ym);
  const somaMes = (ym, n) => M().somaMes(ym, n);
  const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const contas = () => (P().accounts || []).filter((a) => !a.archived);
  const nomeConta = (id) => { const c = (P().accounts || []).concat(P().cards || []).find((x) => x.id === id); return c ? (c.name || c.bank || 'Conta') : ''; };
  const nomeCategoria = (id) => ((P().categories || []).find((c) => c.id === id) || {}).name || 'Sem categoria';
  const saldoConta = (id) => { try { return Calc.accountBalance(id, hoje(), P()); } catch { const a = (P().accounts || []).find((x) => x.id === id); return Number(a && a.openingBalance) || 0; } };

  /* =============================================================
     1. CAIXINHAS — dinheiro separado dentro de uma conta
     ============================================================= */
  function porConta() {
    const mapa = {};
    (P().caixinhas || []).forEach((c) => { mapa[c.contaId] = (mapa[c.contaId] || 0) + c.valor; });
    return mapa;
  }
  function telaCaixinhas() {
    const lista = P().caixinhas || [], mapa = porConta();
    const total = lista.reduce((s, c) => s + c.valor, 0);
    const saldoTotal = contas().reduce((s, a) => s + saldoConta(a.id), 0);
    return '<p class="oz-tela-intro">Separe dinheiro para "viagem", "IPVA", "reserva" sem abrir outra conta. O saldo livre já desconta o que está guardado.</p>'
      + '<div class="oz-resumo"><div><small>Nas caixinhas</small><strong>' + reais(total) + '</strong></div><div><small>Livre nas contas</small><strong>' + reais(saldoTotal - total) + '</strong></div></div>'
      + (lista.length ? '<ul class="oz-cards">' + lista.map((c) => {
        const pct = c.meta ? Math.min(100, Math.round(c.valor / c.meta * 100)) : null;
        return '<li class="oz-card"><div class="oz-card-topo"><span><strong><i class="oz-tag-cor" style="background:' + esc(c.cor) + '"></i> ' + esc(c.nome) + '</strong><small>' + esc(nomeConta(c.contaId) || 'sem conta') + (c.meta ? ' · meta ' + reais(c.meta) : '') + '</small></span><strong>' + reais(c.valor) + '</strong></div>'
          + (pct != null ? '<div class="oz-barra-p" role="progressbar" aria-label="Quanto da meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div><small class="oz-card-sub">' + pct + '% da meta</small>' : '')
          + '<div class="oz-card-acoes"><button type="button" class="v3-secondary" data-oz-cx-guardar="' + esc(c.id) + '">Guardar</button><button type="button" class="v3-link" data-oz-cx-tirar="' + esc(c.id) + '">Tirar</button><button type="button" class="v3-link oz-perigo" data-oz-cx-excluir="' + esc(c.id) + '">Excluir</button></div></li>';
      }).join('') + '</ul>' : '<p class="oz-vazio">Nenhuma caixinha ainda.</p>')
      + (contas().length ? '<details class="oz-form-box"' + (lista.length ? '' : ' open') + '><summary>Nova caixinha</summary><form class="v3-form" data-oz-f="caixinha">'
        + '<label>NOME<input name="nome" maxlength="40" required placeholder="Ex.: Viagem, IPVA"></label>'
        + '<label>EM QUAL CONTA<select name="contaId" required>' + contas().map((a) => '<option value="' + esc(a.id) + '">' + esc(a.name || a.bank) + ' · livre ' + reais(saldoConta(a.id) - (mapa[a.id] || 0)) + '</option>').join('') + '</select></label>'
        + '<div class="v3-form-row"><label>GUARDAR AGORA<input name="valor" inputmode="decimal" placeholder="0,00"></label><label>META (OPCIONAL)<input name="meta" inputmode="decimal" placeholder="0,00"></label></div>'
        + '<button class="v3-primary" type="submit">Criar caixinha</button></form></details>' : '<p class="oz-vazio">Cadastre uma conta na carteira para criar caixinhas.</p>');
  }
  async function moverCaixinha(id, sinal) {
    const c = (P().caixinhas || []).find((x) => x.id === id); if (!c) return;
    const v = num(global.prompt(sinal > 0 ? 'Quanto guardar em "' + c.nome + '"?' : 'Quanto tirar de "' + c.nome + '"?', ''));
    if (!(v > 0)) return;
    if (sinal > 0) {
      const livre = saldoConta(c.contaId) - (porConta()[c.contaId] || 0);
      if (v > livre + 0.001 && !global.confirm('Isso passa do saldo livre da conta (' + reais(livre) + '). Guardar mesmo assim?')) return;
    }
    await mudar(() => { const x = P().caixinhas.find((y) => y.id === id); if (x) x.valor = Math.max(0, Math.round((x.valor + sinal * v) * 100) / 100); }, sinal > 0 ? 'Guardado.' : 'Retirado.');
    redesenhar();
  }
  /* Na carteira: "R$ X em caixinhas · livre R$ Y" embaixo do saldo da conta aberta. */
  function linhaCarteira() {
    const bolso = document.querySelector('.v3-wallet-pocket');
    if (!bolso || !(P().caixinhas || []).length) return;
    const total = (P().caixinhas || []).reduce((s, c) => s + c.valor, 0);
    let linha = bolso.querySelector('[data-oz-cx-linha]');
    const html = '<small class="oz-cx-linha" data-oz-cx-linha>' + reais(total) + ' guardado em caixinhas · <button type="button" class="v3-link" data-oz-mais="caixinhas">ver</button></small>';
    const texto = reais(total) + ' guardado em caixinhas';
    if (linha) { if (linha.dataset.ozTexto !== texto) { linha.dataset.ozTexto = texto; linha.firstChild.textContent = texto + ' · '; } return; }
    bolso.insertAdjacentHTML('beforeend', html.replace('data-oz-cx-linha>', 'data-oz-cx-linha data-oz-texto="' + esc(texto) + '">'));
  }

  /* =============================================================
     2. DIVIDIR DESPESA — a parte de cada um vira "Quem me deve"
     ============================================================= */
  function campoDividir(form) {
    if (!form || form.querySelector('[data-oz-dividir]')) return;
    if (form.elements.id && form.elements.id.value) return;          // só em lançamento novo
    const mais = form.querySelector('.v3-mais .v3-mais-corpo'); if (!mais) return;
    mais.insertAdjacentHTML('afterbegin', '<fieldset class="oz-dividir" data-oz-dividir><legend>DIVIDIR COM (OPCIONAL)</legend>'
      + '<input name="ozDividir" maxlength="200" placeholder="Ex.: Ana, João" aria-describedby="oz-dividir-ajuda" autocomplete="off">'
      + '<small id="oz-dividir-ajuda" class="v3-muted">Partes iguais entre você e quem você citar. A parte de cada um vai para "Quem me deve".</small></fieldset>');
  }
  document.addEventListener('submit', (ev) => {
    const form = ev.target;
    if (!form || form.id !== 'v3-form-tx' || !form.elements.ozDividir) return;   // campo removido em 01/11/2026
    const nomes = String(form.elements.ozDividir.value || '').split(/[,;]| e /).map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (!nomes.length || form.elements.kind.value !== 'Despesa') return;
    const total = num(form.elements.amount.value), descricao = String(form.elements.description.value || '').trim();
    if (!(total > 0)) return;
    const parte = Math.floor(total / (nomes.length + 1) * 100) / 100;
    const data = form.elements.date ? form.elements.date.value : hoje();
    /* espera o lançamento terminar de gravar (o app não aceita duas gravações juntas) */
    let tentativas = 0;
    (function anotar() {
      if (global.V3Backend && V3Backend.saving && V3Backend.saving() && ++tentativas < 60) { setTimeout(anotar, 250); return; }
      const tx = (P().transactions || []).slice().reverse().find((t) => t.description === descricao && Math.abs(t.amount - total) < 0.01);
      void mudar(() => {
        const p = P();
        p.aReceber = (p.aReceber || []).concat(nomes.map((pessoa) => ({ id: uid('rec'), pessoa, descricao: descricao + ' (dividido)', valor: parte, recebido: 0, data, vence: null, quitado: false, txId: tx ? tx.id : null })));
      }, 'Dividido: ' + reais(parte) + ' para cada um em "Quem me deve".');
    })();
  }, true);

  /* =============================================================
     3. BUSCA DE LANÇAMENTOS — todos os meses
     ============================================================= */
  const busca = { q: '', conta: '', tag: '', min: '', max: '' };
  function resultados() {
    const q = norm(busca.q), min = num(busca.min), max = num(busca.max);
    const valorQ = num(busca.q);
    return (P().transactions || []).filter((t) => {
      if (busca.conta && t.accountId !== busca.conta && t.cardId !== busca.conta) return false;
      if (busca.tag && !(t.tags || []).includes(busca.tag)) return false;
      if (busca.min && t.amount < min) return false;
      if (busca.max && t.amount > max) return false;
      if (!q) return true;
      const alvo = norm([t.description, t.notes, nomeCategoria(t.categoryId), nomeConta(t.accountId || t.cardId), (t.tags || []).map((id) => ((P().tags || []).find((x) => x.id === id) || {}).nome).join(' ')].join(' '));
      return alvo.includes(q) || (valorQ > 0 && Math.abs(t.amount - valorQ) < 0.005);
    }).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200);
  }
  function telaBusca() {
    const r = (busca.q || busca.conta || busca.tag || busca.min || busca.max) ? resultados() : null;
    const todasContas = (P().accounts || []).concat(P().cards || []);
    return '<form class="v3-form oz-busca" data-oz-f="busca" role="search">'
      + '<label class="oz-sr" for="oz-busca-q">Buscar lançamentos</label><input id="oz-busca-q" name="q" type="search" value="' + esc(busca.q) + '" placeholder="Texto, valor (ex.: 45,90), categoria ou tag" autocomplete="off">'
      + '<div class="v3-form-row"><label>CONTA OU CARTÃO<select name="conta"><option value="">Todas</option>' + todasContas.map((c) => '<option value="' + esc(c.id) + '"' + (busca.conta === c.id ? ' selected' : '') + '>' + esc(c.name || c.bank) + '</option>').join('') + '</select></label>'
      + '</div>'
      + '<div class="v3-form-row"><label>VALOR DE<input name="min" inputmode="decimal" value="' + esc(busca.min) + '" placeholder="0,00"></label><label>ATÉ<input name="max" inputmode="decimal" value="' + esc(busca.max) + '" placeholder="0,00"></label></div></form>'
      + (r == null ? '<p class="oz-vazio">Procura em todos os meses, não só no mês aberto.</p>'
        : '<p class="oz-tela-intro" role="status">' + r.length + (r.length === 200 ? '+' : '') + ' resultado' + (r.length === 1 ? '' : 's') + '</p>'
          + (r.length ? '<ul class="oz-lista">' + r.map((t) => '<li><span class="oz-lista-txt"><strong>' + esc(t.description) + '</strong><small>' + dataBR(t.date) + (t.recurring ? ' · mensal' : '') + ' · ' + esc(nomeCategoria(t.categoryId)) + ' · ' + esc(nomeConta(t.accountId || t.cardId)) + '</small></span><strong class="oz-valor ' + (t.kind === 'income' ? 'oz-pos' : t.kind === 'expense' ? 'oz-neg' : '') + '">' + (t.kind === 'income' ? '+ ' : t.kind === 'expense' ? '− ' : '') + reais(t.amount) + '</strong><button type="button" class="v3-link" data-oz-busca-abrir="' + esc(t.id) + '">Abrir</button></li>').join('') + '</ul>' : ''));
  }

  /* =============================================================
     4. SIMULADOR DE QUITAÇÃO — bola de neve × avalanche
     ============================================================= */
  let extraSim = 200;
  /* Saldo devedor: valor presente das parcelas que faltam, com os juros
     informados; sem juros, a soma simples das parcelas. */
  function saldoDevedor(d) {
    const n = d.parcelas - d.pagas, i = (Number(d.juros) || 0) / 100;
    if (n <= 0) return 0;
    return i > 0 ? d.parcela * (1 - Math.pow(1 + i, -n)) / i : d.parcela * n;
  }
  function simular(ordem, extra) {
    const dividas = (P().dividas || []).filter((d) => d.pagas < d.parcelas).map((d) => ({ nome: d.nome, saldo: saldoDevedor(d), i: (Number(d.juros) || 0) / 100, minimo: d.parcela }));
    if (!dividas.length) return null;
    let mes = 0, juros = 0, sobra = 0;
    while (dividas.some((d) => d.saldo > 0.01) && mes < 600) {
      mes++;
      let livre = extra + sobra; sobra = 0;
      dividas.forEach((d) => { if (d.saldo <= 0.01) { livre += d.minimo; return; } const j = d.saldo * d.i; juros += j; d.saldo += j; const pago = Math.min(d.saldo, d.minimo); d.saldo -= pago; if (pago < d.minimo) livre += d.minimo - pago; });
      const fila = dividas.filter((d) => d.saldo > 0.01).sort(ordem === 'menor' ? (a, b) => a.saldo - b.saldo : (a, b) => b.i - a.i || a.saldo - b.saldo);
      for (const d of fila) { if (livre <= 0) break; const p = Math.min(livre, d.saldo); d.saldo -= p; livre -= p; }
      sobra = 0;
    }
    return { meses: mes, juros: Math.round(juros * 100) / 100, fim: somaMes(hoje().slice(0, 7), mes - 1) };
  }
  function telaSimulador() {
    const ativas = (P().dividas || []).filter((d) => d.pagas < d.parcelas);
    if (!ativas.length) return '<p class="oz-tela-intro">Cadastre seus financiamentos e empréstimos (com os juros ao mês) para comparar as estratégias.</p><p><button type="button" class="v3-secondary" data-oz-mais="emprestimos">Cadastrar empréstimo</button> <button type="button" class="v3-secondary" data-oz-mais="financiamentos">Cadastrar financiamento</button></p>';
    const base = simular('juros', 0), neve = simular('menor', extraSim), aval = simular('juros', extraSim);
    const semJuros = ativas.filter((d) => d.juros == null).length;
    const linha = (t, s, sub) => '<div class="oz-sim-op"><h3>' + t + '</h3><p class="oz-sim-sub">' + sub + '</p><strong>' + nomeMes(s.fim) + '</strong><small>' + s.meses + ' meses · ' + reais(s.juros) + ' de juros</small>'
      + (base && s.juros < base.juros ? '<b class="oz-pos">economiza ' + reais(base.juros - s.juros) + ' e ' + (base.meses - s.meses) + ' meses</b>' : '') + '</div>';
    const melhor = aval.juros <= neve.juros ? 'avalanche' : 'bola de neve';
    return '<p class="oz-tela-intro">Quanto a mais por mês você consegue pôr nas dívidas? O OAZE compara as duas ordens de pagamento com as ' + ativas.length + ' dívidas cadastradas.</p>'
      + '<form class="v3-form" data-oz-f="simulador"><label>A MAIS POR MÊS<input name="extra" inputmode="decimal" value="' + esc(String(extraSim).replace('.', ',')) + '"></label></form>'
      + '<div class="oz-sim">' + linha('Bola de neve', neve, 'primeiro a menor dívida') + linha('Avalanche', aval, 'primeiro a de juros mais alto') + '</div>'
      + '<p class="oz-sim-sem">Pagando só as parcelas: termina em <strong>' + nomeMes(base.fim) + '</strong> com ' + reais(base.juros) + ' de juros.</p>'
      + '<p class="v3-muted">' + (Math.abs(aval.juros - neve.juros) < 1 ? 'Neste cenário as duas ordens dão o mesmo resultado (a dívida menor é também a de juros mais alto).' : 'Neste cenário, a <strong>' + melhor + '</strong> sai mais barata.') + ' Quitada uma dívida, a parcela dela passa para a próxima.' + (semJuros ? ' ' + semJuros + ' dívida(s) sem juros informados entram como juro zero.' : '') + '</p>';
  }

  /* =============================================================
     5. NOTIFICAÇÃO DO BANCO (Android) — vira sugestão de lançamento
     O lado nativo (OazeBancoNotificacoes, MainActivity) lê só os
     avisos dos apps de banco e guarda o texto no aparelho. Nada sai
     do aparelho até a pessoa tocar em "Lançar".
     ============================================================= */
  function lerAviso(texto) {
    const t = String(texto || '');
    const m = t.match(/R\$\s?([\d.]+,\d{2})/);
    if (!m) return null;
    const valor = num(m[1]);
    const entrada = /recebid|pix recebido|transfer[eê]ncia recebida|dep[oó]sito|cr[eé]dito em conta|caiu na sua conta/i.test(t);
    let local = (t.match(/(?:\bem|\bno|\bna|para|de)\s+([A-Z0-9][\w&.'\- ]{2,40}?)(?:\s+(?:em|no|na|no dia|às|as|com|foi|aprovad|valor|de R)|[.,;:]|$)/) || [])[1] || '';
    local = local.replace(/\s+/g, ' ').trim();
    return { valor, entrada, descricao: local || (entrada ? 'Valor recebido' : 'Compra no cartão'), cartao: /cart[aã]o|cr[eé]dito|compra aprovada/i.test(t) && !entrada };
  }
  async function sugestoesBanco() {
    const n = global.OAZE_NATIVE_BANK_NOTIFS;
    if (!n) return { ligado: false, itens: [] };
    const ligado = await n.status().catch(() => false);
    const itens = ligado ? await n.pendentes().catch(() => []) : [];
    return { ligado, itens: (itens || []).map((x) => Object.assign({}, x, { lido: lerAviso(x.texto) })).filter((x) => x.lido) };
  }
  let cacheBanco = { ligado: false, itens: [] };
  function telaBanco() {
    if (!global.OAZE_NATIVE_BANK_NOTIFS) return '<p class="oz-tela-intro">Disponível no app OAZE para Android: quando o seu banco avisa "Compra aprovada R$ 45,90 em Padaria X", o OAZE sugere o lançamento para você confirmar.</p>';
    if (!cacheBanco.ligado) return '<p class="oz-tela-intro">O OAZE lê <strong>só</strong> as notificações dos apps de banco e cartão, no próprio aparelho. Nada é enviado; cada sugestão espera você confirmar.</p><button type="button" class="v3-primary" data-oz-banco-ligar>Permitir leitura dos avisos do banco</button><p class="v3-muted">O Android abre a tela "Acesso a notificações". Ative o OAZE e volte.</p>';
    return '<p class="oz-tela-intro">Avisos dos seus bancos que parecem compras ou recebimentos. Toque para revisar e lançar.</p>'
      + (cacheBanco.itens.length ? '<ul class="oz-lista">' + cacheBanco.itens.map((x) => '<li><span class="oz-lista-txt"><strong>' + esc(x.lido.descricao) + '</strong><small>' + esc(x.app || 'banco') + ' · ' + esc(new Date(x.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })) + '</small></span><strong class="oz-valor ' + (x.lido.entrada ? 'oz-pos' : 'oz-neg') + '">' + reais(x.lido.valor) + '</strong><button type="button" class="v3-secondary" data-oz-banco-lancar="' + esc(x.id) + '">Lançar</button><button type="button" class="v3-link" data-oz-banco-ignorar="' + esc(x.id) + '">Ignorar</button></li>').join('') + '</ul>'
        : '<p class="oz-vazio">Nenhum aviso novo de banco. Assim que chegar, aparece aqui.</p>')
      + '<p><button type="button" class="v3-link" data-oz-banco-desligar>Parar de ler avisos</button></p>';
  }
  async function abrirBanco() { cacheBanco = await sugestoesBanco(); M().abrir('banco'); }

  /* =============================================================
     6. NOTA FISCAL (NFC-e) — QR do cupom
     O QR tem o endereço da consulta na Sefaz; a função oaze-nfce lê a
     página pública e devolve loja, data, total e itens.
     ============================================================= */
  let nota = null;
  function telaNota() {
    if (!nota) return '<p class="oz-tela-intro">Aponte a câmera para o QR Code do cupom fiscal (NFC-e). O OAZE busca loja, data, total e os itens na Sefaz.</p>'
      + '<div class="oz-nota-acoes"><button type="button" class="v3-primary" data-oz-nota-camera>Abrir câmera</button><label class="v3-secondary oz-nota-foto">Escolher foto do QR<input type="file" accept="image/*" class="oz-arquivo-oculto" data-oz-nota-foto></label></div>'
      + '<video class="oz-nota-video" playsinline muted hidden></video><p class="v3-muted" data-oz-nota-status role="status"></p>';
    if (nota.erro) return '<p class="oz-tela-intro">' + esc(nota.erro) + '</p><button type="button" class="v3-secondary" data-oz-nota-nova>Tentar outro QR</button>';
    return '<div class="oz-resumo"><div><small>' + esc(nota.loja || 'Loja') + '</small><strong>' + reais(nota.total) + '</strong></div><div><small>Data</small><strong>' + dataBR(nota.data) + '</strong></div></div>'
      + (nota.itens && nota.itens.length ? '<ul class="oz-lista oz-nota-itens">' + nota.itens.slice(0, 80).map((i) => '<li><span class="oz-lista-txt"><strong>' + esc(i.nome) + '</strong><small>' + esc(String(i.qtd).replace('.', ',')) + ' ' + esc(i.un || '') + '</small></span><strong class="oz-valor">' + reais(i.valor) + '</strong></li>').join('') + '</ul>' : '<p class="v3-muted">A Sefaz deste estado não mostrou os itens; o total foi lido.</p>')
      + '<button type="button" class="v3-primary" data-oz-nota-lancar>Lançar ' + reais(nota.total) + '</button> <button type="button" class="v3-link" data-oz-nota-nova>Ler outro</button>';
  }
  let fluxoCamera = null;
  function pararCamera() { if (fluxoCamera) { fluxoCamera.getTracks().forEach((t) => t.stop()); fluxoCamera = null; } }
  async function lerQR(fonte) {
    if (!('BarcodeDetector' in global)) throw new Error('Este aparelho não lê QR pelo app. Use a câmera do celular e abra o link no navegador.');
    const det = new global.BarcodeDetector({ formats: ['qr_code'] });
    const r = await det.detect(fonte);
    return r && r[0] ? r[0].rawValue : '';
  }
  async function consultarNota(url) {
    const status = document.querySelector('[data-oz-nota-status]'); if (status) status.textContent = 'Consultando a Sefaz…';
    if (!/^https?:\/\/[^/]*(sefaz|fazenda|nfce|nfe)[^/]*\.[a-z.]*gov\.br\//i.test(url)) { nota = { erro: 'Esse QR não é de uma NFC-e (cupom fiscal eletrônico).' }; redesenhar(); return; }
    if (M().demo()) { nota = { loja: 'Supermercado Exemplo', data: hoje(), total: 87.45, itens: [{ nome: 'Arroz 5kg', qtd: 1, un: 'UN', valor: 27.9 }, { nome: 'Café 500g', qtd: 2, un: 'UN', valor: 39.8 }, { nome: 'Banana', qtd: 1.2, un: 'KG', valor: 19.75 }] }; redesenhar(); return; }
    try {
      const c = global.V3Backend && V3Backend.client && V3Backend.client();
      const { data, error } = await c.functions.invoke('oaze-nfce', { body: { url } });
      if (error || !data || !(data.total > 0)) throw new Error((data && data.mensagem) || 'A Sefaz não respondeu agora.');
      nota = data;
    } catch (e) { nota = { erro: (e && e.message) || 'Não consegui ler a nota.' }; }
    redesenhar();
  }

  /* =============================================================
     7. RELATÓRIO PARA O IMPOSTO DE RENDA
     ============================================================= */
  let anoIR = new Date().getFullYear() - 1;
  const DEDUTIVEL = [[/sa[uú]de|m[eé]dic|dentist|hospital|plano de sa|exame|psic|fisio|terap|odonto/i, 'Saúde (dedutível sem limite)'], [/educa|escola|faculdade|curso|mensalidade escolar|universidade/i, 'Educação (limite anual por pessoa)'], [/previd[eê]ncia|pgbl/i, 'Previdência privada PGBL (até 12% da renda)'], [/pens[aã]o aliment/i, 'Pensão alimentícia judicial']];
  function dadosIR(ano) {
    const ini = ano + '-01-01', fim = ano + '-12-31';
    let ents = [];
    try { ents = Calc.entries(ini, fim, P()).filter((e) => e.confirmed && !e.cancelado); } catch { ents = []; }
    const rend = {}, ded = {};
    ents.forEach((e) => {
      const cat = nomeCategoria(e.categoryId);
      if (e.kind === 'income') rend[cat] = (rend[cat] || 0) + e.amount;
      if (e.kind === 'expense') { const d = DEDUTIVEL.find(([re]) => re.test(cat) || re.test(e.description || '')); if (d) (ded[d[1]] = ded[d[1]] || []).push(e); }
    });
    const bens = contas().map((a) => { let s = 0; try { s = Calc.accountBalance(a.id, fim, P()); } catch { s = 0; } return { nome: (a.name || a.bank) + (a.bank && a.name !== a.bank ? ' · ' + a.bank : ''), tipo: 'Conta (grupo 06)', valor: s }; })
      .concat((P().investments || []).filter((x) => x.date <= fim).map((x) => { let v = Number(x.amount) || 0; try { v = Calc.investmentValueAt(x, fim, P()); } catch { /* aporte */ } return { nome: x.name, tipo: 'Aplicação (grupo 04)', valor: v }; }));
    const dividas = (P().dividas || []).map((d) => ({ nome: d.nome + (d.instituicao ? ' · ' + d.instituicao : ''), valor: saldoDevedor(d) }));
    return { rend, ded, bens, dividas };
  }
  function telaIR() {
    const r = dadosIR(anoIR);
    const somaO = (o) => Object.values(o).reduce((s, v) => s + (Array.isArray(v) ? v.reduce((a, e) => a + e.amount, 0) : v), 0);
    const tabela = (linhas) => '<table class="oz-ir-tabela"><tbody>' + linhas.join('') + '</tbody></table>';
    return '<form class="v3-form" data-oz-f="ir"><label>ANO-CALENDÁRIO<select name="ano">' + [0, 1, 2, 3].map((k) => { const a = new Date().getFullYear() - k; return '<option' + (a === anoIR ? ' selected' : '') + '>' + a + '</option>'; }).join('') + '</select></label></form>'
      + '<p class="oz-tela-intro">Organizado na ordem da declaração. Confira com os informes do banco e da empresa: o OAZE só soma o que você lançou.</p>'
      + '<h2 class="oz-ir-h">Rendimentos</h2>' + (Object.keys(r.rend).length ? tabela(Object.entries(r.rend).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + reais(v) + '</td></tr>').concat('<tr class="is-total"><td>Total</td><td>' + reais(somaO(r.rend)) + '</td></tr>')) : '<p class="oz-vazio">Nenhuma receita confirmada em ' + anoIR + '.</p>')
      + '<h2 class="oz-ir-h">Pagamentos dedutíveis</h2>' + (Object.keys(r.ded).length ? Object.entries(r.ded).map(([k, l]) => '<details class="oz-ir-grupo"><summary>' + esc(k) + ' <strong>' + reais(l.reduce((s, e) => s + e.amount, 0)) + '</strong></summary>' + tabela(l.map((e) => '<tr><td>' + dataBR(e.date) + ' · ' + esc(e.description) + '</td><td>' + reais(e.amount) + '</td></tr>')) + '</details>').join('') : '<p class="oz-vazio">Nada em saúde, educação ou previdência neste ano.</p>')
      + '<h2 class="oz-ir-h">Bens e direitos em 31/12/' + anoIR + '</h2>' + (r.bens.length ? tabela(r.bens.map((b) => '<tr><td>' + esc(b.nome) + '<small>' + esc(b.tipo) + '</small></td><td>' + reais(b.valor) + '</td></tr>')) : '<p class="oz-vazio">Sem contas ou investimentos.</p>')
      + '<h2 class="oz-ir-h">Dívidas e ônus em 31/12</h2>' + (r.dividas.length ? tabela(r.dividas.map((d) => '<tr><td>' + esc(d.nome) + '</td><td>' + reais(d.valor) + '</td></tr>')) : '<p class="oz-vazio">Sem financiamentos ou empréstimos cadastrados.</p>')
      + '<p class="oz-ir-acoes"><button type="button" class="v3-secondary" data-oz-ir-csv>Baixar planilha</button> <button type="button" class="v3-secondary" data-oz-rel-imprimir>Imprimir ou salvar PDF</button></p>'
      + '<p class="v3-muted">Não é orientação tributária. Saldo de dívida estimado pelas parcelas que faltam e pelos juros informados.</p>';
  }
  function csvIR() {
    const r = dadosIR(anoIR), l = [['Seção', 'Item', 'Valor']];
    Object.entries(r.rend).forEach(([k, v]) => l.push(['Rendimentos', k, v.toFixed(2)]));
    Object.entries(r.ded).forEach(([k, es]) => es.forEach((e) => l.push(['Dedutível · ' + k, e.date + ' ' + e.description, e.amount.toFixed(2)])));
    r.bens.forEach((b) => l.push(['Bens e direitos', b.nome, b.valor.toFixed(2)]));
    r.dividas.forEach((d) => l.push(['Dívidas', d.nome, d.valor.toFixed(2)]));
    const csv = '﻿' + l.map((x) => x.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    if (global.U && U.download) U.download('oaze-ir-' + anoIR + '.csv', csv, 'text/csv;charset=utf-8');
  }

  /* =============================================================
     8. RESUMO AUTOMÁTICO — semana (domingo 19h) e mês (dia 1, 9h)
     Vai para o agendador de avisos de recursos-app.js. O texto é
     montado no aparelho; nenhum número sai dele.
     ============================================================= */
  const CHAVE_RESUMO = 'oaze.resumo';
  function prefResumo() { try { return Object.assign({ semana: true, mes: true }, JSON.parse(localStorage.getItem(CHAVE_RESUMO) || '{}')); } catch { return { semana: true, mes: true }; } }
  function resumoPeriodo(ini, fim) {
    let ents = [];
    try { ents = Calc.entries(ini, fim, P()).filter((e) => e.confirmed && !e.cancelado && e.contaNosTotais !== false); } catch { ents = []; }
    const entrou = ents.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0);
    const saiu = ents.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
    const porCat = {};
    ents.filter((e) => e.kind === 'expense').forEach((e) => { porCat[e.categoryId] = (porCat[e.categoryId] || 0) + e.amount; });
    const maior = Object.entries(porCat).sort((a, b) => b[1] - a[1])[0];
    return { entrou, saiu, maior: maior ? nomeCategoria(maior[0]) + ' (' + reais(maior[1]) + ')' : '' };
  }
  function proximoVencimento(depois) {
    try {
      const lim = new Date(depois); lim.setDate(lim.getDate() + 10);
      const e = Calc.entries(depois.toISOString().slice(0, 10), lim.toISOString().slice(0, 10), P()).find((x) => x.kind === 'expense' && !x.confirmed && !x.cancelado);
      return e ? e.description + ' em ' + dataBR(e.date).slice(0, 5) + ' (' + reais(e.amount) + ')' : '';
    } catch { return ''; }
  }
  function lembretesResumo() {
    if (M().demo()) return [];
    const pref = prefResumo(), out = [], agora = new Date();
    if (pref.semana) {
      const d = new Date(agora); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); d.setHours(19, 0, 0, 0); if (d <= agora) d.setDate(d.getDate() + 7);
      const ini = new Date(d); ini.setDate(ini.getDate() - 6);
      const r = resumoPeriodo(ini.toISOString().slice(0, 10), d.toISOString().slice(0, 10)); const prox = proximoVencimento(d);
      out.push({ at: d.toISOString(), canal: 'oaze-insights', titulo: 'Sua semana em 1 minuto', corpo: 'Entrou ' + reais(r.entrou) + ', saiu ' + reais(r.saiu) + (r.maior ? '. Maior gasto: ' + r.maior : '') + (prox ? '. Próximo: ' + prox : '') + '.' });
    }
    if (pref.mes) {
      const d = new Date(agora.getFullYear(), agora.getMonth() + 1, 1, 9, 0, 0);
      const ymAtual = agora.toISOString().slice(0, 7);
      const r = resumoPeriodo(ymAtual + '-01', ymAtual + '-31');
      out.push({ at: d.toISOString(), canal: 'oaze-insights', titulo: 'Seu mês em 1 minuto', corpo: nomeMes(ymAtual) + ': entrou ' + reais(r.entrou) + ', saiu ' + reais(r.saiu) + ', sobra ' + reais(r.entrou - r.saiu) + (r.maior ? '. Maior gasto: ' + r.maior : '') + '.' });
    }
    return out;
  }
  function telaResumo() {
    const pref = prefResumo(), ym = hoje().slice(0, 7), r = resumoPeriodo(ym + '-01', ym + '-31');
    return '<p class="oz-tela-intro">Uma notificação curta, no aparelho: quanto entrou, quanto saiu, a maior categoria e o que vence a seguir.</p>'
      + '<form class="v3-form" data-oz-f="resumo"><label class="v3-check"><input type="checkbox" name="semana"' + (pref.semana ? ' checked' : '') + '> Resumo da semana (domingo, 19h)</label><label class="v3-check"><input type="checkbox" name="mes"' + (pref.mes ? ' checked' : '') + '> Resumo do mês (dia 1, 9h)</label></form>'
      + '<div class="oz-resumo-previa"><span class="v3-label">PRÉVIA DE ' + nomeMes(ym).toUpperCase() + '</span><p>Entrou <strong>' + reais(r.entrou) + '</strong>, saiu <strong>' + reais(r.saiu) + '</strong>, sobra <strong>' + reais(r.entrou - r.saiu) + '</strong>.' + (r.maior ? ' Maior gasto: ' + esc(r.maior) + '.' : '') + '</p></div>'
      + '<p class="v3-muted">Os avisos precisam estar ligados em Configurações › Notificações. Resumo por e-mail ainda não existe.</p>';
  }

  /* =============================================================
     9. LISTA DE DESEJOS — "posso comprar?"
     ============================================================= */
  function folgaMensal() {
    try { const pr = M().projecao(3); if (pr && pr.linhas && pr.linhas.length) return Math.max(0, pr.linhas.reduce((s, m) => s + (m.entra - m.fixo - m.variavel), 0) / pr.linhas.length); } catch { /* segue */ }
    const ym = hoje().slice(0, 7), ant = somaMes(ym, -1), r = resumoPeriodo(ant + '-01', ant + '-31');
    return Math.max(0, r.entrou - r.saiu);
  }
  function veredito(d, folga, livre) {
    if (d.valor <= livre * 0.3) return ['sim', 'Cabe: usa ' + Math.round(d.valor / Math.max(livre, 1) * 100) + '% do que está livre nas contas.'];
    if (folga > 0) { const meses = Math.ceil(d.valor / folga); return meses <= 1 ? ['sim', 'Cabe na sobra deste mês.'] : ['espera', 'Guardando a sobra média (' + reais(folga) + '/mês), dá em ' + meses + ' meses.']; }
    return ['nao', 'Hoje não sobra dinheiro no mês. Vale rever gastos antes.'];
  }
  function telaDesejos() {
    const lista = (P().desejos || []).slice().sort((a, b) => a.comprado - b.comprado || ['alta', 'media', 'baixa'].indexOf(a.prioridade) - ['alta', 'media', 'baixa'].indexOf(b.prioridade));
    const folga = folgaMensal();
    const livre = contas().reduce((s, a) => s + saldoConta(a.id), 0) - (P().caixinhas || []).reduce((s, c) => s + c.valor, 0);
    return '<p class="oz-tela-intro">Anote o que você quer comprar. O OAZE compara com o que está livre e com a sobra média dos próximos meses.</p>'
      + '<div class="oz-resumo"><div><small>Livre nas contas</small><strong>' + reais(livre) + '</strong></div><div><small>Sobra média/mês</small><strong>' + reais(folga) + '</strong></div></div>'
      + '<details class="oz-form-box"' + (lista.length ? '' : ' open') + '><summary>Adicionar desejo</summary><form class="v3-form" data-oz-f="desejo"><label>O QUÊ<input name="nome" maxlength="80" required placeholder="Ex.: Fone novo"></label><div class="v3-form-row"><label>VALOR<input name="valor" inputmode="decimal" required placeholder="0,00"></label><label>PRIORIDADE<select name="prioridade"><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></label></div><button class="v3-primary" type="submit">Adicionar</button></form></details>'
      + (lista.length ? '<ul class="oz-cards">' + lista.map((d) => {
        const [tom, frase] = veredito(d, folga, livre);
        return '<li class="oz-card' + (d.comprado ? ' is-quitado' : '') + '"><div class="oz-card-topo"><span><strong>' + esc(d.nome) + '</strong><small>prioridade ' + esc(d.prioridade) + '</small></span><strong>' + reais(d.valor) + '</strong></div>'
          + (d.comprado ? '<small class="oz-card-sub">Comprado.</small>' : '<p class="oz-desejo-veredito is-' + tom + '">' + (tom === 'sim' ? 'Pode comprar. ' : tom === 'espera' ? 'Melhor esperar. ' : 'Agora não. ') + esc(frase) + '</p>')
          + '<div class="oz-card-acoes">' + (d.comprado ? '' : '<button type="button" class="v3-secondary" data-oz-des-coco="' + esc(d.id) + '">Perguntar à Coco</button><button type="button" class="v3-link" data-oz-des-comprei="' + esc(d.id) + '">Comprei</button>') + '<button type="button" class="v3-link oz-perigo" data-oz-des-excluir="' + esc(d.id) + '">Excluir</button></div></li>';
      }).join('') + '</ul>' : '');
  }

  /* =============================================================
     registro das telas, cliques e formulários
     ============================================================= */
  function registrarTudo() {
    if (!global.OazeMais || !OazeMais.registrar) return false;
    OazeMais.registrar('caixinhas', 'Caixinhas', telaCaixinhas);
    OazeMais.registrar('busca', 'Buscar lançamentos', telaBusca);
    OazeMais.registrar('simulador', 'Simulador de quitação', telaSimulador);
    OazeMais.registrar('banco', 'Avisos do banco', telaBanco);
    OazeMais.registrar('nota', 'Nota fiscal (NFC-e)', telaNota);
    OazeMais.registrar('ir', 'Relatório para o IR', telaIR);
    OazeMais.registrar('resumo', 'Resumo automático', telaResumo);
    OazeMais.registrar('desejos', 'Lista de desejos', telaDesejos);
    return true;
  }
  if (!registrarTudo()) document.addEventListener('DOMContentLoaded', registrarTudo, { once: true });

  document.addEventListener('click', async (ev) => {
    const abrirBancoBtn = ev.target.closest('[data-oz-mais="banco"]');
    if (abrirBancoBtn) { ev.preventDefault(); ev.stopImmediatePropagation(); await abrirBanco(); return; }
    const tela = M() && M().aberta();
    if (!tela || !tela.contains(ev.target)) return;
    const b = ev.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.ozCxGuardar) await moverCaixinha(d.ozCxGuardar, 1);
    else if (d.ozCxTirar) await moverCaixinha(d.ozCxTirar, -1);
    else if (d.ozCxExcluir) { if (global.confirm('Excluir a caixinha? O dinheiro volta a contar como livre.')) { await mudar(() => { const p = P(); p.caixinhas = p.caixinhas.filter((x) => x.id !== d.ozCxExcluir); }, 'Caixinha excluída.'); redesenhar(); } }
    else if (d.ozBuscaAbrir) { M().fecharTela(); if (global.OazeEditar) setTimeout(() => global.OazeEditar(d.ozBuscaAbrir), 60); }
    else if (b.hasAttribute('data-oz-banco-ligar')) { await global.OAZE_NATIVE_BANK_NOTIFS.abrirAjustes().catch(() => {}); avisar('Ative o OAZE em "Acesso a notificações" e volte.'); }
    else if (b.hasAttribute('data-oz-banco-desligar')) { await global.OAZE_NATIVE_BANK_NOTIFS.abrirAjustes().catch(() => {}); }
    else if (d.ozBancoIgnorar) { await global.OAZE_NATIVE_BANK_NOTIFS.remover(d.ozBancoIgnorar).catch(() => {}); cacheBanco = await sugestoesBanco(); redesenhar(); }
    else if (d.ozBancoLancar) {
      const x = cacheBanco.itens.find((y) => y.id === d.ozBancoLancar); if (!x) return;
      M().fecharTela();
      const ok = global.OazeCompor && global.OazeCompor({ tipo: x.lido.entrada ? 'income' : 'expense', forma_pagamento: x.lido.cartao ? 'card' : 'account', descricao: x.lido.descricao, valor: x.lido.valor, data: new Date(x.quando).toISOString().slice(0, 10), origem: x.app || '' });
      if (ok) await global.OAZE_NATIVE_BANK_NOTIFS.remover(x.id).catch(() => {});
    }
    else if (b.hasAttribute('data-oz-nota-camera')) {
      const video = tela.querySelector('.oz-nota-video'), status = tela.querySelector('[data-oz-nota-status]');
      try {
        if (!('BarcodeDetector' in global)) throw new Error('Este aparelho não lê QR pelo app. Escolha uma foto do QR.');
        fluxoCamera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = fluxoCamera; video.hidden = false; await video.play();
        status.textContent = 'Procurando o QR…';
        const fim = Date.now() + 30000;
        (async function procurar() {
          if (!fluxoCamera) return;
          const url = await lerQR(video).catch(() => '');
          if (url) { pararCamera(); await consultarNota(url); return; }
          if (Date.now() < fim) setTimeout(procurar, 400); else { pararCamera(); status.textContent = 'Não achei o QR. Tente com mais luz ou escolha uma foto.'; }
        })();
      } catch (e) { pararCamera(); status.textContent = (e && e.message) || 'Câmera indisponível.'; }
    }
    else if (b.hasAttribute('data-oz-nota-nova')) { nota = null; redesenhar(); }
    else if (b.hasAttribute('data-oz-nota-lancar') && nota) {
      const n = nota; M().fecharTela();
      if (global.OazeCompor) global.OazeCompor({ tipo: 'expense', forma_pagamento: 'account', descricao: (n.loja || 'Compra').slice(0, 90), valor: n.total, data: n.data || hoje(), categoria: /mercad|atacad|super|hortifruti|padaria|açougue/i.test(n.loja || '') ? 'Alimentação' : '' });
      nota = null;
    }
    else if (b.hasAttribute('data-oz-ir-csv')) csvIR();
    else if (d.ozDesComprei) { await mudar(() => { const x = P().desejos.find((y) => y.id === d.ozDesComprei); if (x) x.comprado = true; }, 'Marcado como comprado.'); redesenhar(); }
    else if (d.ozDesExcluir) { await mudar(() => { const p = P(); p.desejos = p.desejos.filter((y) => y.id !== d.ozDesExcluir); }); redesenhar(); }
    else if (d.ozDesCoco) {
      const x = P().desejos.find((y) => y.id === d.ozDesCoco); if (!x) return;
      M().fecharTela();
      const ir = document.querySelector('[data-go="coco"]'); if (ir) ir.click();
      let n = 0; (function enviar() { const f = document.getElementById('v3-chat-form'); if (f && f.elements.question) { f.elements.question.value = 'Posso comprar ' + x.nome + ' por ' + reais(x.valor) + ' agora? Se não, em quantos meses consigo guardar esse valor?'; if (f.requestSubmit) f.requestSubmit(); return; } if (++n < 20) setTimeout(enviar, 60); })();
    }
  });

  document.addEventListener('change', async (ev) => {
    const foto = ev.target.closest && ev.target.closest('[data-oz-nota-foto]');
    if (foto && foto.files && foto.files[0]) {
      const status = document.querySelector('[data-oz-nota-status]');
      try { const img = await createImageBitmap(foto.files[0]); const url = await lerQR(img); if (!url) throw new Error('Não encontrei um QR nessa foto.'); await consultarNota(url); }
      catch (e) { if (status) status.textContent = (e && e.message) || 'Não consegui ler a foto.'; }
      return;
    }
    const f = ev.target.closest && ev.target.closest('[data-oz-f]'); if (!f) return;
    if (f.dataset.ozF === 'ir') { anoIR = Number(f.elements.ano.value) || anoIR; redesenhar(); }
    else if (f.dataset.ozF === 'resumo') { try { localStorage.setItem(CHAVE_RESUMO, JSON.stringify({ semana: f.elements.semana.checked, mes: f.elements.mes.checked })); } catch { /* segue */ } avisar('Resumo atualizado.'); document.dispatchEvent(new CustomEvent('oaze:avisos-mudaram')); }
    else if (f.dataset.ozF === 'busca' && ev.target.tagName === 'SELECT') { busca.conta = f.elements.conta.value; busca.tag = f.elements.tag.value; redesenhar(); }
  });
  let buscaT = 0;
  document.addEventListener('input', (ev) => {
    const f = ev.target.closest && ev.target.closest('[data-oz-f="busca"],[data-oz-f="simulador"]'); if (!f) return;
    clearTimeout(buscaT);
    buscaT = setTimeout(() => {
      const foco = ev.target.name, pos = ev.target.selectionStart;
      if (f.dataset.ozF === 'busca') { busca.q = f.elements.q.value; busca.min = f.elements.min.value; busca.max = f.elements.max.value; }
      else extraSim = Math.max(0, num(f.elements.extra.value));
      redesenhar();
      const el = M().aberta() && M().aberta().querySelector('[name="' + foco + '"]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch { /* number */ } }
    }, 250);
  });
  document.addEventListener('submit', async (ev) => {
    const f = ev.target.closest && ev.target.closest('[data-oz-f]'); if (!f) return;
    ev.preventDefault();
    const fd = new FormData(f), qual = f.dataset.ozF;
    if (qual === 'caixinha') {
      const c = { id: uid('cx'), nome: String(fd.get('nome') || '').trim(), contaId: String(fd.get('contaId') || ''), valor: num(fd.get('valor')), meta: num(fd.get('meta')), cor: ['#5FA99B', '#6AA8FF', '#F2B33D', '#A78BFA', '#EE8F72'][(P().caixinhas || []).length % 5] };
      if (!c.nome) return;
      await mudar(() => { const p = P(); p.caixinhas = (p.caixinhas || []).concat(c); }, 'Caixinha criada.'); redesenhar();
    } else if (qual === 'desejo') {
      const d = { id: uid('des'), nome: String(fd.get('nome') || '').trim(), valor: num(fd.get('valor')), prioridade: String(fd.get('prioridade') || 'media'), criadoEm: hoje(), comprado: false };
      if (!d.nome || !(d.valor > 0)) { avisar('Preencha o nome e o valor.'); return; }
      await mudar(() => { const p = P(); p.desejos = (p.desejos || []).concat(d); }, 'Adicionado à lista.'); redesenhar();
    }
  });

  /* Formulário de lançamento e carteira: campos que aparecem sozinhos. */
  new MutationObserver(() => {
    linhaCarteira();
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('oaze:render', () => { try { linhaCarteira(); } catch { /* sem perfil */ } });

  global.OazeFuncoes = { lembretes: lembretesResumo, lerAviso, saldoDevedor, simular, abrirBanco };
})(window);
/* Volta da tela "Acesso a notificações" do Android: atualiza a lista. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !window.OazeMais || !window.OazeMais.aberta()) return;
  const t = window.OazeMais.aberta().querySelector('#oz-tela-titulo');
  if (t && /Avisos do banco/.test(t.textContent) && window.OazeFuncoes) window.OazeFuncoes.abrirBanco();
});
