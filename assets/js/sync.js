/* =============================================================
   sync.js — conta, login e sincronização entre aparelhos
   ------------------------------------------------------------
   PRINCÍPIO: o localStorage continua sendo a fonte da verdade.
   A nuvem é uma camada opcional por cima. Sem credenciais, sem
   login ou sem rede, o app funciona exatamente como antes —
   offline, isolado por aparelho.

   DOIS PROVEDORES. Este arquivo guarda o que não muda entre eles
   (estado, indicador na barra lateral, mesclagem, envio com
   debounce) e o backend do Firebase. O do Supabase está em
   supabase-auth.js e se registra aqui pelo mesmo contrato.

   Escolhe-se UM: o de menor `prioridade` entre os configurados.
   O Supabase vem na frente porque faz login dentro da própria
   plataforma — e-mail e senha, sem depender de pop-up do Google.

   CONTRATO DE UM BACKEND
     nome         string, aparece no console e na ajuda
     prioridade   número; menor ganha
     rotuloEntrar texto do botão quando ninguém está logado
     marca()      ícone opcional do botão (elemento ou null)
     isConfigured()      → boolean
     conectar()          → Promise, liga SDK e observa a sessão
     entrar()            → Promise, faz o login
     sair()              → Promise, encerra a sessão
     publicar(payload)   → Promise, grava os perfis
     soltar()            desliga os ouvintes do usuário anterior
     ajuda()             → elemento com as instruções de setup

   O backend avisa o núcleo por três funções:
     Sync._onUser(u)      sessão mudou (u = null quando saiu)
     Sync._onRemote(map)  chegaram perfis da nuvem
     Sync._setState(s, d) mudou o estado da conexão

   O QUE SINCRONIZA: apenas `profiles` (contas, cartões,
   categorias, lançamentos, investimentos, faturas).
   O QUE NÃO SINCRONIZA: tema e perfil ativo — são preferências
   de cada aparelho.

   CONFLITO: cada perfil carrega `updatedAt` (ver Store.commit).
   Vence o carimbo mais recente, perfil a perfil.
   ============================================================= */
(function (global) {
  'use strict';

  const Sync = {};
  const el = U.el;

  const CFG_ANTIGA = 'financas.sync.config';   // formato anterior (e-mail/senha coladas à mão)

  const backends = [];
  let backend = null;
  let user = null;
  let state = 'off';        // off | signed-out | connecting | ok | syncing | offline
  let detail = '';
  let applying = false;     // ignora o commit gerado ao aplicar dados remotos
  let pushTimer = null;

  /* ---------------- registro de backends ---------------- */

  Sync.registerBackend = function (b) {
    backends.push(b);
    backends.sort((a, z) => (a.prioridade || 50) - (z.prioridade || 50));
  };

  /** O primeiro backend configurado, na ordem de prioridade. */
  function escolher() {
    return backends.find((b) => {
      try { return b.isConfigured(); } catch (e) { return false; }
    }) || null;
  }

  Sync.isConfigured = () => !!escolher();
  Sync.backendAtivo = () => backend;
  Sync.status = () => ({ state, detail, user, backend: backend && backend.nome });
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
  Sync._setState = setState;
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

    if (!backend) {
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
      const marca = backend.marca ? backend.marca() : null;
      box.appendChild(el('button', {
        class: 'btn btn-outline btn-sm' + (marca ? ' btn-google' : ''), type: 'button',
        onclick: () => Sync.signIn()
      }, [marca, el('span', { text: backend.rotuloEntrar || 'Entrar' })].filter(Boolean)));
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
        el('span', { class: 'account-name', text: user.displayName || 'Minha conta' }),
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
    const svg = U.svg('svg', { viewBox: '0 0 48 48', width: '16', height: '16', 'aria-hidden': 'true' });
    svg.innerHTML =
      '<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17.5z"/>' +
      '<path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.8-6.1C.9 16.7 0 20.2 0 24s.9 7.3 2.6 10.4l7.8-5.7z"/>' +
      '<path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.5-5.8c-2.1 1.4-4.8 2.2-7.8 2.2-6.3 0-11.7-3.7-13.6-9.2l-7.8 5.7C6.5 42.6 14.6 48 24 48z"/>';
    return svg;
  }
  Sync._googleMark = googleMark;

  /* ---------------- carregamento de SDK ---------------- */

  /**
   * Carrega um script externo uma única vez. `alternativa` é o
   * caminho vendorizado: sem internet, o CDN falha e caímos nele —
   * mesma ideia do document.write do Chart.js no index.html.
   */
  Sync.loadScript = function (src, alternativa) {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[data-src="' + src + '"]')) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.setAttribute('data-src', src);
      s.onload = () => resolve();
      s.onerror = () => {
        if (!alternativa) { reject(new Error('não foi possível carregar ' + src)); return; }
        const v = document.createElement('script');
        v.src = alternativa;
        v.setAttribute('data-src', src);
        v.onload = () => resolve();
        v.onerror = () => reject(new Error('não foi possível carregar ' + alternativa));
        document.head.appendChild(v);
      };
      document.head.appendChild(s);
    });
  };

  /* ---------------- login ---------------- */

  Sync.signIn = async function () {
    if (!backend) { Sync.openHelp(); return; }
    try {
      setState('connecting');
      await backend.conectar();
      await backend.entrar();
      // o restante acontece em _onUser()
    } catch (e) {
      console.error('Sync/login:', e);
      const msg = (e && e.message) || 'erro desconhecido';
      setState('signed-out', msg);
      if (!e || !e.silencioso) UI.toast(msg, 'error', 8000);
    }
  };

  Sync.signOut = async function () {
    const ok = await UI.confirm({
      title: 'Sair da conta',
      message: 'Os dados continuam salvos <strong>neste aparelho</strong> e na sua nuvem, mas param de sincronizar até você entrar de novo. Sair?',
      confirmLabel: 'Sair'
    });
    if (!ok) return;
    solta();
    try { await backend.sair(); } catch (e) { /* ignora */ }
    UI.toast('Você saiu. O app continua funcionando com os dados deste aparelho.');
  };

  function solta() {
    clearTimeout(pushTimer);
    if (backend) { try { backend.soltar(); } catch (e) { /* ignora */ } }
  }

  /* ---------------- ciclo de autenticação ---------------- */

  /** Chamado pelo backend quando a sessão muda. `u` = null ao sair. */
  Sync._onUser = function (u) {
    const anterior = user && user.uid;
    user = u || null;

    // A troca de sessão dispara também em renovação de token e re-login.
    // Sem soltar o ouvinte antigo, cada disparo empilha outro e a
    // mesclagem (e o toast) rodariam duplicadas.
    solta();

    if (!user) { setState('signed-out'); return; }

    setState('connecting');
    try { backend.observar(user); } catch (e) {
      console.error('Sync/observar:', e);
      setState('offline', e.message);
    }

    // só avisa quando a conta realmente muda — não a cada reabertura do app
    if (anterior !== user.uid) {
      UI.toast('Sincronizando como ' + (user.displayName || user.email) + '.', 'success');
    }

    /* Com o esquema normalizado disponível, a entrada é o momento de
       oferecer a migração — e de drenar o que ficou pendente offline
       na sessão anterior. */
    if (global.Mig && Mig.aoEntrar) Mig.aoEntrar();
    if (global.Fila && Fila.drenar) Fila.drenar();
  };

  /** Chamado pelo backend quando chegam perfis da nuvem. */
  Sync._onRemote = function (remote) {
    if (!remote || !Object.keys(remote).length) { pushNow(); return; }  // nuvem vazia: publica o que temos
    if (mergeProfiles(remote)) {
      applying = true;
      Store.commit('sync-apply');               // não re-carimba updatedAt
      applying = false;
      UI.toast('Dados atualizados a partir de outro dispositivo.');
    }
    setState('ok');
  };

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
      // JSON puro: undefined não sobrevive nem ao Firebase nem ao Postgres
      map[p.id] = JSON.parse(JSON.stringify(p));
    });
    return map;
  }

  /* ---------------- envio (com debounce) ---------------- */

  function schedulePush() {
    if (!backend || !user || applying) return;
    clearTimeout(pushTimer);
    setState('syncing');
    pushTimer = setTimeout(pushNow, 1500);
  }

  function pushNow() {
    if (!backend || !user) return;
    Promise.resolve(backend.publicar({
      profiles: profilesPayload(),
      meta: { updatedAt: Date.now(), device: navigator.userAgent.slice(0, 120) }
    })).then(() => setState('ok'))
      .catch((e) => setState('offline', 'Falha ao enviar: ' + e.message));
  }
  Sync.pushNow = () => { clearTimeout(pushTimer); pushNow(); };

  /* ---------------- ajuda ---------------- */

  Sync.openHelp = function () {
    const body = el('div', {}, [
      el('div', { class: 'parse-info' }, el('div', {
        html: 'Sincronizar é <strong>opcional</strong>. Sem login, o app funciona igual — os dados ficam ' +
          'neste aparelho, no <code>localStorage</code>. A conta serve só para ver os mesmos dados no ' +
          'PC e no celular.'
      })),
      backend
        ? backend.ajuda()
        : el('div', {}, [
          el('p', { style: { fontSize: '13.5px', lineHeight: '1.65', marginTop: '12px' } },
            'Nenhum provedor está configurado. Você pode usar qualquer um dos dois — escolha um:'),
          el('ul', { style: { paddingLeft: '20px', listStyle: 'disc', fontSize: '13px', lineHeight: '1.8', marginTop: '8px' } }, [
            el('li', { html: '<strong>Supabase</strong> — login com e-mail e senha dentro do próprio app. Cole a URL e a chave anon em <code>assets/js/supabase-config.js</code> e rode <code>docs/supabase.sql</code>.' }),
            el('li', { html: '<strong>Firebase</strong> — login com Google, em pop-up. Cole o <code>firebaseConfig</code> em <code>assets/js/firebase-config.js</code>.' })
          ]),
          el('p', { class: 'hint', style: { marginTop: '10px' } },
            'Se os dois estiverem configurados, o Supabase é usado — ele não depende de pop-up, que muitos navegadores bloqueiam.')
        ]),
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
        backend && !user
          ? { label: backend.rotuloEntrar || 'Entrar', class: 'btn-primary', onClick: () => { UI.closeModal(); Sync.signIn(); } }
          : null
      ].filter(Boolean)
    });
  };

  /* =============================================================
     BACKEND: Firebase (Google, em pop-up)
     ------------------------------------------------------------
     Caminho no banco: /usuarios/{uid}/dados
     ============================================================= */

  const FB = (function () {
    const SDK = [
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
      'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
    ];
    let app = null, auth = null, db = null, ref = null, sdkPromise = null;

    function cfg() {
      const c = global.FirebaseConfig;
      if (!c || typeof c !== 'object') return null;
      if (!c.apiKey || !c.databaseURL) return null;
      return c;
    }

    function loadSDK() {
      if (global.firebase && global.firebase.database) return Promise.resolve();
      if (!sdkPromise) {
        sdkPromise = (async () => {
          for (const src of SDK) await Sync.loadScript(src);
          if (!global.firebase) throw new Error('SDK do Firebase indisponível.');
        })().catch((e) => { sdkPromise = null; throw e; });
      }
      return sdkPromise;
    }

    function mapUser(u) {
      return u ? { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL } : null;
    }

    function erroLogin(e) {
      const code = (e && e.code) || '';
      if (code === 'auth/popup-blocked') return 'O navegador bloqueou a janela de login. Libere pop-ups para este site e tente de novo.';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Login cancelado.';
      if (code === 'auth/unauthorized-domain') return 'Este endereço não está autorizado no Firebase. Adicione-o em Authentication → Settings → Authorized domains.';
      if (code === 'auth/operation-not-allowed') return 'O login com Google não está ativado no seu projeto Firebase (Authentication → Sign-in method).';
      if (code === 'auth/network-request-failed') return 'Sem conexão para completar o login.';
      return 'Não foi possível entrar: ' + ((e && e.message) || 'erro desconhecido');
    }

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

    return {
      nome: 'firebase',
      prioridade: 20,
      rotuloEntrar: 'Entrar com Google',
      marca: () => googleMark(),
      isConfigured: () => !!cfg(),

      async conectar() {
        const c = cfg();
        if (!c) throw new Error('Firebase não configurado.');
        await loadSDK();
        if (app) return;
        app = global.firebase.apps.length ? global.firebase.app() : global.firebase.initializeApp(c);
        auth = global.firebase.auth();
        db = global.firebase.database();
        // mantém a sessão entre aberturas do app
        try { await auth.setPersistence(global.firebase.auth.Auth.Persistence.LOCAL); } catch (e) { /* segue */ }
        auth.onAuthStateChanged((u) => Sync._onUser(mapUser(u)));
        db.ref('.info/connected').on('value', (snap) => {
          const st = Sync.status();
          if (snap.val() === false && st.user) Sync._setState('offline', 'Sem conexão com o Firebase.');
          else if (snap.val() === true && st.user && st.state === 'offline') Sync._setState('ok');
        });
      },

      async entrar() {
        const provider = new global.firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          await auth.signInWithPopup(provider);
        } catch (e) {
          const err = new Error(erroLogin(e));
          err.silencioso = (e && e.code) === 'auth/popup-closed-by-user';
          throw err;
        }
      },

      sair: () => auth.signOut(),

      observar(u) {
        ref = db.ref('usuarios/' + u.uid + '/dados');
        ref.child('profiles').on('value', (snap) => {
          Sync._onRemote(snap.val());
        }, (e) => {
          console.error('Sync/leitura:', e);
          Sync._setState('offline', e.code === 'PERMISSION_DENIED'
            ? 'Sem permissão: confira as regras do Realtime Database (veja o README).'
            : e.message);
        });
      },

      publicar: (payload) => ref.update(payload),

      soltar() {
        if (ref) { try { ref.child('profiles').off(); } catch (e) { /* ignora */ } }
        ref = null;
      },

      ajuda() {
        return el('div', {}, [
          el('p', { style: { fontSize: '13.5px', lineHeight: '1.65', marginTop: '12px' } },
            'Este app está ligado a um projeto Firebase. Basta entrar com a sua conta Google.'),
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
          })
        ]);
      }
    };
  })();

  Sync.registerBackend(FB);

  /* ---------------- inicialização ---------------- */

  Sync.init = function () {
    // limpa o formato antigo (e-mail/senha coladas à mão)
    try {
      if (localStorage.getItem(CFG_ANTIGA)) {
        localStorage.removeItem(CFG_ANTIGA);
        console.info('Sync: configuração antiga removida.');
      }
    } catch (e) { /* sem localStorage, segue */ }

    Store.onChange((reason) => {
      if (reason === 'theme' || reason === 'sync-apply') return;
      schedulePush();
    });

    backend = escolher();
    if (!backend) { setState('off'); return; }

    setState('signed-out');
    // reconecta sozinho se já havia sessão neste aparelho
    backend.conectar().catch((e) => {
      console.error('Sync/' + backend.nome + ':', e);
      setState('offline', e.message);
    });
  };

  global.Sync = Sync;
})(window);
