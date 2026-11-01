/* =============================================================
   anuncio-web.js — anúncio premiado fora do Android (01/11/2026)
   Windows (Tauri), site e o futuro iOS enquanto não houver SDK
   nativo: vídeo premiado do Google Ad Manager pelo SDK IMA.

   Regra (igual em todos): no Semente cada anúncio assistido até o
   fim libera +20 lançamentos. Quem credita é o servidor
   (oaze-anuncio, acao:'web'), com sessão e intervalo mínimo.

   Configuração: a tag do bloco de vídeo premiado do Ad Manager vai em
   <meta name="oaze-ima-tag" content="https://pubads.g.doubleclick.net/...">
   no app-v3.html. Sem tag (ou sem anúncio disponível), a liberação
   acontece sem vídeo, para ninguém ficar travado.
   ============================================================= */
(function (global) {
  'use strict';
  /* No Android quem mostra é o AdMob (OAZE_NATIVE_ADS, da ponte nativa, que
     carrega depois deste arquivo); a escolha é feita na hora do clique. */

  const tag = () => (document.querySelector('meta[name="oaze-ima-tag"]') || {}).content || '';
  let sdk = null;
  function carregarSdk() {
    if (global.google && google.ima) return Promise.resolve();
    if (sdk) return sdk;
    sdk = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { sdk = null; falha(new Error('sdk')); };
      document.head.appendChild(s);
    });
    return sdk;
  }

  /* Tela cheia com o vídeo. Resolve true só se o anúncio chegou ao fim. */
  function tocar(adTag) {
    return new Promise((resolve) => {
      const capa = document.createElement('div');
      capa.className = 'oz-anuncio-capa';
      capa.setAttribute('role', 'dialog');
      capa.setAttribute('aria-modal', 'true');
      capa.setAttribute('aria-label', 'Anúncio');
      capa.innerHTML = '<div class="oz-anuncio-palco"><video playsinline muted></video><div class="oz-anuncio-ads"></div></div><p class="oz-anuncio-legenda">Anúncio · ao terminar, +20 lançamentos</p>';
      document.body.appendChild(capa);
      const video = capa.querySelector('video'), alvo = capa.querySelector('.oz-anuncio-ads');
      let fim = false, gerente = null;
      const acabar = (ok) => { if (fim) return; fim = true; try { gerente && gerente.destroy(); } catch { /* segue */ } capa.remove(); resolve(ok); };
      const ima = google.ima;
      const container = new ima.AdDisplayContainer(alvo, video);
      container.initialize();
      const loader = new ima.AdsLoader(container);
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => acabar(null), false);
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (ev) => {
        gerente = ev.getAdsManager(video);
        gerente.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => acabar(null));
        gerente.addEventListener(ima.AdEvent.Type.COMPLETE, () => acabar(true));
        gerente.addEventListener(ima.AdEvent.Type.SKIPPED, () => acabar(false));
        gerente.addEventListener(ima.AdEvent.Type.USER_CLOSE, () => acabar(false));
        gerente.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, () => acabar(true));
        const r = alvo.getBoundingClientRect();
        try { gerente.init(Math.round(r.width) || 640, Math.round(r.height) || 360, ima.ViewMode.NORMAL); gerente.start(); }
        catch { acabar(null); }
      }, false);
      const pedido = new ima.AdsRequest();
      pedido.adTagUrl = adTag;
      const r = alvo.getBoundingClientRect();
      pedido.linearAdSlotWidth = Math.round(r.width) || 640;
      pedido.linearAdSlotHeight = Math.round(r.height) || 360;
      loader.requestAds(pedido);
      setTimeout(() => acabar(null), 90_000);
    });
  }

  global.OazeAnuncioWeb = {
    canal() { return global.OAZE_NATIVE_DESKTOP ? 'windows' : /iPhone|iPad/.test(navigator.userAgent) ? 'ios' : 'web'; },
    /* { recompensado, ima } — recompensado false = fechou antes do fim */
    async mostrar() {
      const t = tag();
      if (!t) return { recompensado: true, ima: false };
      try { await carregarSdk(); } catch { return { recompensado: true, ima: false }; }
      const r = await tocar(t);
      if (r === null) return { recompensado: true, ima: false };   // sem anúncio disponível: não trava
      return { recompensado: !!r, ima: true };
    },
    async creditar(ima) {
      const c = global.V3Backend && V3Backend.client && V3Backend.client();
      if (!c) throw new Error('Entre na sua conta para liberar lançamentos.');
      const { data, error } = await c.functions.invoke('oaze-anuncio', { body: { acao: 'web', origem: this.canal(), ima: !!ima } });
      if (error) {
        const ctx = error.context;
        if (ctx && ctx.status === 429) throw new Error('Espere alguns segundos entre um anúncio e outro.');
        throw new Error('Não consegui liberar agora. Tente de novo.');
      }
      if (!data || !data.ok) throw new Error(data && data.motivo === 'limite_dia' ? 'Você chegou ao limite de anúncios de hoje.' : 'Não consegui liberar agora.');
      return data;
    }
  };
})(window);
