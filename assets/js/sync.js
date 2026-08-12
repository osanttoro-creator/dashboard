/* =============================================================
   sync.js — sincronização entre dispositivos com login Google
   ------------------------------------------------------------
   PRINCÍPIO: o localStorage continua sendo a fonte da verdade.
   O Firebase é uma camada opcional por cima. Sem credenciais em
   firebase-config.js, ou sem login, ou sem rede, o app funciona
   exatamente como antes — offline, isolado por aparelho.

   O QUE SINCRONIZA: apenas `profiles` (contas, cartões,
   categorias, lançamentos, investimentos, faturas).
   O QUE NÃO SINCRONIZA: tema e perfil ativo — são preferências
   de cada aparelho.

   CONFLITO: cada perfil carrega `updatedAt` (ver Store.commit).
   Vence o carimbo mais recente, perfil a perfil.

   CAMINHO NO BANCO: /usuarios/{uid}/dados
   ============================================================= */
(function (global) {
  'use strict';

  const Sync = {};
  const el = U.el;

  const SDK = [
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
  ];
  const CFG_ANTIGA = 'financas.sync.config';   // formato anterior (e-mail/senha)

  let app = null, auth = null, db = null, ref = null;
  let user = null;
  let state = 'off';        // off | signed-out | connecting | ok | syncing | offline
  let detail = '';
  let applying = false;     // ignora o commit gerado ao aplicar dados remotos
  let pushTimer = null;
  let sdkPromise = null;

  /* ---------------- configuração ---------------- */

  function cfg() {
    const c = global.FirebaseConfig;
    if (!c || typeof c !== 'object') return null;
    if (!c.apiKey || !c.databaseURL) return null;
    return c;
  }
  Sync.isConfigured = () => !!cfg();
  Sync.status = () => ({ state, detail, user });
  Sync.currentUser = () => user;

  /* ---------------- indicador visual ---------------- */

  const LABEL = {
    off: 'Sincronização não configurada',
    'signed-out': 'Não logado — só neste aparelho',
    connecting: 'Conectando…',
    ok: 'Sincronizado',
    syncing: 'Sincronizando…',
    offline: 'Sem conexão — usando dados locais'
  };

  function setState(next, msg) {
    state = next;
    detail = msg || '';
    paintAccount();
  }
  Sync.refreshIndicator = () => setState(state, detail);

  /** Bloco de conta na barra lateral: avatar, nome e status. */
  function paintAccount() {
    const box = document.getElementById('syncBox');
    if (!box) return;
    U.clear(box);

    const dotCls = 'sync-dot' + (
      state === 'ok' ? ' is-ok' :
      state === 'offline' ? ' is-error' :
      state === 'connecting' || state === 'syncing' ? ' is-loading' : '');

    if (!Sync.isConfigured()) {
      box.appendChild(el('button', {
        class: 'sync-chip', type: 'button',
        title: 'Como ativar a sincronização entre aparelhos',
        onclick: () => Sync.openHelp()
      }, [
        el('span', { class: 'sync-dot' }),
        el('span', { text: LABEL.off })
      ]));
      return;
    }

    if (!user) {
      box.appendChild(el('button', {
        class: 'btn btn-outline btn-sm btn-google', type: 'button',
        onclick: () => Sync.signIn()
      }, [googleMark(), el('span', { text: 'Entrar com Google' })]));
      box.appendChild(el('button', {
        class: 'sync-chip', type: 'button',
        title: 'O app funciona normalmente sem login. Clique para entender.',
        onclick: () => Sync.openHelp()
      }, [
        el('span', { class: dotCls }),
        el('span', { text: detail || LABEL['signed-out'] })
      ]));
      return;
    }

    const conta = el('div', { class: 'account-row' }, [
      user.photoURL
        ? el('img', { class: 'account-avatar', src: user.photoURL, alt: '', referrerpolicy: 'no-referrer' })
        : el('span', { class: 'account-avatar is-generic', text: (user.displayName || user.email || '?').charAt(0).toUpperCase() }),
      el('div', { class: 'account-id' }, [
        el('span', { class: 'account-name', text: user.displayName || 'Conta Google' }),
        el('span', { class: 'account-mail', text: user.email || '' })
      ]),
      el('button', {
        class: 'icon-btn', type: 'button', title: 'Sair desta conta', text: '⏻',
        'aria-label': 'Sair', onclick: () => Sync.signOut()
      })
    ]);
    box.appendChild(conta);
    box.appendChild(el('button', {
      class: 'sync-chip', type: 'button', title: detail || LABEL[state],
      onclick: () => Sync.openHelp()
    }, [
      el('span', { class: dotCls }),
      el('span', { text: LABEL[state] || LABEL.ok })
    ]));
  }

  /** "G" do Google desenhado em SVG — sem depender de imagem externa. */
  function googleMark() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17.5z"/>' +
      '<path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-5.7z"/>' +
      '<path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.5-5.8c-2.1 1.4-4.8 2.2-7.8 2.2-6.3 0-11.7-3.7-13.6-9.2l-7.8 5.7C6.5 42.6 14.6 48 24 48z"/>';
    return svg;
  }

  /* ---------------- SDK ---------------- */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('não foi possível carregar o Firebase (sem internet?)'));
      document.head.appendChild(s);
    });
  }

  function loadSDK() {
    if (global.firebase && global.firebase.database) return Promise.resolve();
    if (!sdkPromise) {
      sdkPromise = (async () => {
        for (const src of SDK) await loadScript(src);
        if (!global.firebase) throw new Error('SDK do Firebase indisponível.');
      })().catch((e) => { sdkPromise = null; throw e; });
    }
    return sdkPromise;
  }

  async function ensureApp() {
    const c = cfg();
    if (!c) throw new Error('Firebase não configurado.');
    await loadSDK();
    if (!app) {
      app = global.firebase.apps.length ? global.firebase.app() : global.firebase.initializeApp(c);
      auth = global.firebase.auth();
      db = global.firebase.database();
      // mantém a sessão entre aberturas do app
      try { await auth.setPersistence(global.firebase.auth.Auth.Persistence.LOCAL); } catch (e) { /* segue */ }
      auth.onAuthStateChanged(onUser);
      db.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === false && user) setState('offline', 'Sem conexão com o Firebase.');
        else if (snap.val() === true && user && state === 'offline') setState('ok');
      });
    }
    return app;
  }

  /* ---------------- login ---------------- */

  Sync.signIn = async function () {
    try {
      setState('connecting');
      await ensureApp();
      const provider = new global.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(provider);
      // o restante acontece em onUser()
    } catch (e) {
      console.error('Sync/login:', e);
      setState('signed-out', erroLogin(e));
      UI.toast(erroLogin(e), 'error', 8000);
    }
  };

  function erroLogin(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-blocked') return 'O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Login cancelado.';
    if (code === 'auth/unauthorized-domain') return 'Este endereço não está autorizado no Firebase. Adicione-o em Authentication → Settings → Authorized domains.';
    if (code === 'auth/operation-not-allowed') return 'O login com Google não está ativado no seu projeto Firebase (Authentication → Sign-in method).';
    if (code === 'auth/network-request-failed') return 'Sem conexão para completar o login.';
    return 'Não foi possível entrar: ' + ((e && e.message) || 'erro desconhecido');
  }

  Sync.signOut = async function () {
    const ok = await UI.confirm({
      title: 'Sair da conta',
      message: 'Os dados continuam salvos <strong>neste aparelho</strong> e na sua nuvem, mas param de sincronizar até você entrar de novo. Sair?',
      confirmLabel: 'Sair'
    });
    if (!ok) return;
    detachRef();
    try { await auth.signOut(); } catch (e) { /* ignora */ }
    UI.toast('Você saiu. O app continua funcionando com os dados deste aparelho.');
  };

  function detachRef() {
    clearTimeout(pushTimer);
    if (ref) { try { ref.child('profiles').off(); } catch (e) { /* ignora */ } }
    ref = null;
  }

  /* ---------------- ciclo de autenticação ---------------- */

  function onUser(u) {
    const anterior = user && user.uid;
    user = u || null;

    // onAuthStateChanged dispara também em renovação de token e re-login.
    // Sem soltar o listener antigo, cada disparo empilha outro e o merge
    // (e o toast) rodariam duplicados.
    detachRef();

    if (!user) { setState('signed-out'); return; }

    setState('connecting');
    ref = db.ref('usuarios/' + user.uid + '/dados');

    ref.child('profiles').on('value', (snap) => {
      const remote = snap.val();
      if (!remote) { pushNow(); return; }        // nuvem vazia: publica o que temos
      if (mergeProfiles(remote)) {
        applying = true;
        Store.commit('sync-apply');               // não re-carimba updatedAt
        applying = false;
        UI.toast('Dados atualizados a partir de outro dispositivo.');
      }
      setState('ok');
    }, (e) => {
      console.error('Sync/leitura:', e);
      setState('offline', e.code === 'PERMISSION_DENIED'
        ? 'Sem permissão: confira as regras do Realtime Database (veja o README).'
        : e.message);
    });

    // só avisa quando a conta realmente muda — não a cada reabertura do app
    if (anterior !== user.uid) {
      UI.toast('Sincronizando como ' + (user.displayName || user.email) + '.', 'success');
    }
  }

  /* ---------------- mesclagem ---------------- */

  /** Junta os perfis remotos com os locais. Vence o `updatedAt` maior. */
  function mergeProfiles(remoteMap) {
    const st = Store.state();
    const byId = new Map(st.profiles.map((p) => [p.id, p]));
    let changed = false;

    Object.keys(remoteMap || {}).forEach((id) => {
      const remote = remoteMap[id];
      if (!remote || typeof remote !== 'object') return;
      const normalized = Store.normalizeProfile(remote);
      normalized.id = id;
      const local = byId.get(id);
      if (!local) {
        st.profiles.push(normalized);
        byId.set(id, normalized);
        changed = true;
      } else if ((+normalized.updatedAt || 0) > (+local.updatedAt || 0)) {
        Object.assign(local, normalized);
        changed = true;
      }
    });

    if (!st.profiles.some((p) => p.id === st.activeProfileId) && st.profiles.length) {
      st.activeProfileId = st.profiles[0].id;
      changed = true;
    }
    return changed;
  }
  Sync._merge = mergeProfiles;   // usado nos testes

  function profilesPayload() {
    const map = {};
    Store.state().profiles.forEach((p) => {
      // JSON puro: o Firebase rejeita undefined
      map[p.id] = JSON.parse(JSON.stringify(p));
    });
    return map;
  }

  /* ---------------- envio (com debounce) ---------------- */

  function schedulePush() {
    if (!ref || applying) return;
    clearTimeout(pushTimer);
    setState('syncing');
    pushTimer = setTimeout(pushNow, 1500);
  }

  function pushNow() {
    if (!ref) return;
    ref.update({
      profiles: profilesPayload(),
      meta: { updatedAt: Date.now(), device: navigator.userAgent.slice(0, 120) }
    }).then(() => setState('ok'))
      .catch((e) => setState('offline', 'Falha ao enviar: ' + e.message));
  }
  Sync.pushNow = () => { clearTimeout(pushTimer); pushNow(); };

  /* ---------------- ajuda ---------------- */

  const REGRAS = `{
  "rules": {
    "usuarios": {
      "$uid": {
        ".read":  "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}`;

  Sync.openHelp = function () {
    const configurado = Sync.isConfigured();
    const body = el('div', {}, [
      el('div', { class: 'parse-info' }, el('div', {
        html: 'Sincronizar é <strong>opcional</strong>. Sem login, o app funciona igual — os dados ficam ' +
          'neste aparelho, no <code>localStorage</code>. O login com Google serve só para ver os mesmos ' +
          'dados no PC e no celular.'
      })),
      el('p', { style: { fontSize: '13.5px', lineHeight: '1.65', marginTop: '12px' } },
        configurado
          ? 'Este app já está ligado a um projeto Firebase. Basta entrar com a sua conta Google.'
          : 'Para ativar, você precisa de um projeto Firebase seu (plano Spark, gratuito) e colar as credenciais em assets/js/firebase-config.js.'),
      el('ol', { style: { paddingLeft: '20px', listStyle: 'decimal', fontSize: '13px', lineHeight: '1.75', marginTop: '10px' } }, [
        el('li', { html: 'Crie um projeto em <strong>console.firebase.google.com</strong>.' }),
        el('li', { html: 'Em <strong>Build → Authentication → Sign-in method</strong>, ative <strong>Google</strong>.' }),
        el('li', { html: 'Em <strong>Build → Realtime Database</strong>, crie o banco no modo bloqueado.' }),
        el('li', { html: 'Na aba <strong>Regras</strong>, publique as regras abaixo.' }),
        el('li', { html: 'Em <strong>⚙ Configurações do projeto → Seus apps → Web</strong>, copie o <code>firebaseConfig</code> para <code>assets/js/firebase-config.js</code>.' }),
        el('li', { html: 'Em <strong>Authentication → Settings → Authorized domains</strong>, adicione o endereço onde o app está publicado.' })
      ]),
      el('textarea', { class: 'input textarea', rows: 11, readonly: true, style: { marginTop: '10px' }, text: REGRAS }),
      el('p', {
        class: 'hint',
        html: 'Essas regras são a proteção de verdade: cada conta só lê e escreve em <code>/usuarios/{o próprio uid}</code>. ' +
          'As credenciais do <code>firebase-config.js</code> podem ser públicas — o que não pode é deixar as regras abertas.'
      }),
      el('div', { class: 'parse-info is-warn', style: { marginTop: '14px' } }, el('div', {
        html: '<strong>No primeiro login, os dois lados se somam.</strong> Se este aparelho já tem perfis e a ' +
          'sua conta também, você vai ficar com todos — nada é apagado, mas pode haver duplicata ' +
          '(dois "Pessoal", por exemplo). Apague os que sobrarem em <strong>⚙ Perfis</strong>. ' +
          'Depois disso, cada perfil passa a ser reconhecido pelo mesmo identificador nos dois aparelhos.'
      })),
      el('p', { class: 'hint', style: { marginTop: '10px' } },
        'Backup e Restaurar em JSON continuam disponíveis e funcionam com ou sem login — inclusive para trazer dados de antes de você ter conta.')
    ]);

    UI.openModal({
      title: 'Sincronizar entre aparelhos',
      wide: true,
      body,
      buttons: [
        { label: 'Fechar', class: 'btn-outline', onClick: UI.closeModal },
        configurado && !user
          ? { label: 'Entrar com Google', class: 'btn-primary', onClick: () => { UI.closeModal(); Sync.signIn(); } }
          : null
      ].filter(Boolean)
    });
  };

  /* ---------------- inicialização ---------------- */

  Sync.init = function () {
    // limpa o formato antigo (e-mail/senha coladas à mão)
    try {
      if (localStorage.getItem(CFG_ANTIGA)) {
        localStorage.removeItem(CFG_ANTIGA);
        console.info('Sync: configuração antiga removida — agora o login é com Google.');
      }
    } catch (e) { /* sem localStorage, segue */ }

    Store.onChange((reason) => {
      if (reason === 'theme' || reason === 'sync-apply') return;
      schedulePush();
    });

    if (!Sync.isConfigured()) { setState('off'); return; }

    setState('signed-out');
    // reconecta sozinho se já havia sessão neste aparelho
    ensureApp().catch((e) => {
      console.error('Sync:', e);
      setState('offline', e.message);
    });
  };

  global.Sync = Sync;
})(window);
