/* =============================================================
   estilos-inline.js — cores que não somem (01/11/2026)

   O painel desenha a cor de cada coisa num atributo style="..."
   (--card-plastic do cartão, --bank-bg do logo, --swatch da
   categoria, --picker-accent dos seletores). No app do Windows o
   Tauri acrescenta nonce/hash à regra style-src do CSP e, com isso,
   o WebView passa a IGNORAR 'unsafe-inline': todo style="..." era
   descartado e o app ficava sem cor nenhuma.

   A correção principal está no tauri.conf.json (o Tauri não mexe mais
   em style-src). Este arquivo é a rede de segurança: testa se o
   navegador está aplicando estilo inline e, se não estiver, copia o
   texto do atributo para o CSSOM (element.style), que o CSP não
   bloqueia. Onde o estilo inline funciona (Android, site), não faz nada.
   ============================================================= */
(function (global) {
  'use strict';
  const doc = global.document;

  function inlineBloqueado() {
    try {
      const t = doc.createElement('div');
      t.setAttribute('style', '--oz-teste-inline: 7');
      (doc.body || doc.documentElement).appendChild(t);
      const v = global.getComputedStyle(t).getPropertyValue('--oz-teste-inline').trim();
      t.remove();
      return v !== '7';
    } catch { return false; }
  }

  const aplicado = new WeakMap();
  function copiar(el) {
    const texto = el.getAttribute('style');
    if (!texto || aplicado.get(el) === texto) return;
    try {
      el.style.cssText = texto;
      aplicado.set(el, el.getAttribute('style'));
    } catch { /* elemento sem CSSOM */ }
  }
  /* Se o próprio app mexe no estilo por JavaScript logo depois de desenhar
     (ex.: z-index da pilha de cartões), o navegador reescreve o atributo só
     com o que estava aplicado — e as variáveis de cor bloqueadas somem antes
     de chegarmos. O valor anterior do atributo ainda as tem: repõe as que
     faltam (só propriedades --variável). */
  function restaurar(el, anterior) {
    if (!anterior) return;
    anterior.split(';').forEach((parte) => {
      const i = parte.indexOf(':');
      if (i < 0) return;
      const nome = parte.slice(0, i).trim(), valor = parte.slice(i + 1).trim();
      if (nome.startsWith('--') && valor && !el.style.getPropertyValue(nome)) {
        try { el.style.setProperty(nome, valor); } catch { /* valor inválido */ }
      }
    });
    aplicado.set(el, el.getAttribute('style'));
  }
  function varrer(raiz) {
    if (raiz.nodeType !== 1) return;
    if (raiz.hasAttribute('style')) copiar(raiz);
    raiz.querySelectorAll('[style]').forEach(copiar);
  }

  function ligar() {
    if (!inlineBloqueado()) return;
    doc.documentElement.dataset.ozEstiloCssom = '1';
    varrer(doc.documentElement);
    new MutationObserver((lista) => {
      for (const m of lista) {
        if (m.type === 'childList') m.addedNodes.forEach(varrer);
        else if (m.type === 'attributes' && m.target.nodeType === 1) { copiar(m.target); restaurar(m.target, m.oldValue); }
      }
    }).observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['style'] });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ligar, { once: true });
  else ligar();
})(window);
