/* =============================================================
   sync.js — sincronização entre dispositivos via Firebase
   ------------------------------------------------------------
   PRINCÍPIO: o localStorage continua sendo a fonte da verdade.
   O Firebase é uma camada opcional por cima. Se as credenciais
   não forem configuradas, ou se a rede cair, o app funciona
   exatamente como antes — offline, isolado por dispositivo.

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

  const CFG_KEY = 'financas.sync.config';
  const SDK = [
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'
  ];

  let cfg = null;          // { apiKey, databaseURL, projectId, email }
  let app = null, auth = null, db = null, ref = null;
  let uid = null;
  let state = 'off';       // off | connecting | ok | syncing | error
  let detail = '';
  let applying = false;    // ignora o commit gerado ao aplicar dados remotos
  let pushTimer = null;

  /* ---------------- configuração local ---------------- */

  function readCfg() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeCfg(c) {
    try {
      if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c));
      else localStorage.removeItem(CFG_KEY);
      return true;
    } catch (e) { return false; }
  }

  Sync.isConfigured = () => !!readCfg();
  Sync.status = () => ({ state, detail });

  /* ---------------- indicador visual ---------------- */

  const LABEL = {
    off: 'Sincronização desativada',
    connecting: 'Conectando…',
    ok: 'Sincronizado',
    syncing: 'Sincronizando…',
    error: 'Offline / erro de conexão'
  };

  function setState(next, msg) {
    state = next;
    detail = msg || '';
    const dot = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    if (!dot || !label) return;
    dot.className = 'sync-dot' + (
      next === 'ok' ? ' is-ok' :
      next === 'error' ? ' is-error' :
      next === 'connecting' || next === 'syncing' ? ' is-loading' : '');
    label.textContent = LABEL[next] || LABEL.off;
    const chip = document.getElementById('syncChip');
    if (chip) chip.title = detail || LABEL[next];
  }
  Sync.refreshIndicator = () => setState(state, detail);

  /* ---------------- carregamento do SDK ---------------- */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('não foi possível carregar o Firebase (sem internet?)'));
      document.head.appendChild(s);
    });
  }

  async function loadSDK() {
    if (global.firebase && global.firebase.database) return;
    for (const src of SDK) await loadScript(src);
    if (!global.firebase) throw new Error('SDK do Firebase indisponível.');
  }

  /* ---------------- mesclagem ---------------- */

  /**
   * Junta os perfis remotos com os locais. Vence o `updatedAt` maior.
   * Devolve { changed, profiles } — `changed` diz se o local mudou.
   */
  function mergeProfiles(remoteMap) {
    const st = Store.state();
    const locals = st.profiles;
    const byId = new Map(locals.map((p) => [p.id, p]));
    let changed = false;

    Object.keys(remoteMap || {}).forEach((id) => {
      const remote = remoteMap[id];
      if (!remote || typeof remote !== 'object') return;
      const normalized = Store.normalizeProfile(remote);
      normalized.id = id;
      const local = byId.get(id);
      if (!local) {
        locals.push(normalized);
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

  function profilesPayload() {
    const map = {};
    Store.state().profiles.forEach((p) => {
      // JSON puro: o Firebase rejeita undefined e não guarda arrays esparsos
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
    ref.child('profiles').set(profilesPayload())
      .then(() => {
        ref.child('meta').set({ updatedAt: Date.now(), device: navigator.userAgent.slice(0, 120) });
        setState('ok');
      })
      .catch((e) => setState('error', 'Falha ao enviar: ' + e.message));
  }

  Sync.pushNow = () => { clearTimeout(pushTimer); pushNow(); };

  /* ---------------- conexão ---------------- */

  Sync.connect = async function (password) {
    cfg = readCfg();
    if (!cfg) { setState('off'); return false; }

    setState('connecting');
    try {
      await loadSDK();

      if (!app) {
        app = global.firebase.apps.length
          ? global.firebase.app()
          : global.firebase.initializeApp({
            apiKey: cfg.apiKey,
            databaseURL: cfg.databaseURL,
            projectId: cfg.projectId || undefined,
            authDomain: cfg.projectId ? cfg.projectId + '.firebaseapp.com' : undefined
          });
        auth = global.firebase.auth();
        db = global.firebase.database();
      }

      // sessão persistida pelo próprio SDK: a senha só é pedida na 1ª vez
      let user = auth.currentUser;
      if (!user && password) {
        try {
          user = (await auth.signInWithEmailAndPassword(cfg.email, password)).user;
        } catch (e) {
          if (e.code === 'auth/user-not-found') {
            user = (await auth.createUserWithEmailAndPassword(cfg.email, password)).user;
          } else throw e;
        }
      }
      if (!user) {
        user = await new Promise((resolve) => {
          const off = auth.onAuthStateChanged((u) => { off(); resolve(u); });
        });
      }
      if (!user) {
        setState('error', 'Entre com a senha para sincronizar.');
        return false;
      }

      uid = user.uid;
      ref = db.ref('financas/' + uid);

      // escuta contínua: outro aparelho gravou -> mescla aqui
      ref.child('profiles').on('value', (snap) => {
        const remote = snap.val();
        if (!remote) { pushNow(); return; }   // nuvem vazia: publica o que temos
        const changed = mergeProfiles(remote);
        if (changed) {
          applying = true;
          Store.commit('sync-apply');          // não re-carimba updatedAt
          applying = false;
          UI.toast('Dados atualizados a partir de outro dispositivo.');
        }
        setState('ok');
      }, (e) => setState('error', e.message));

      db.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === false && state !== 'off') setState('error', 'Sem conexão com o Firebase.');
      });

      return true;
    } catch (e) {
      console.error('Sync:', e);
      setState('error', e.message);
      return false;
    }
  };

  Sync.disconnect = function (forget) {
    clearTimeout(pushTimer);
    if (ref) { try { ref.child('profiles').off(); } catch (e) { /* ignora */ } }
    if (auth && auth.currentUser) { try { auth.signOut(); } catch (e) { /* ignora */ } }
    ref = null; uid = null;
    if (forget) { writeCfg(null); cfg = null; }
    setState('off');
  };

  /* ---------------- tela de configuração ---------------- */

  const REGRAS = `{
  "rules": {
    "financas": {
      "$uid": {
        ".read":  "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}`;

  Sync.openConfig = function () {
    const c = readCfg() || {};
    const field = (label, input, hint) => {
      const w = el('div', { class: 'field span-2' }, [el('span', { class: 'field-label', text: label }), input]);
      if (hint) w.appendChild(el('p', { class: 'hint', text: hint }));
      w._control = input;
      return w;
    };
    const inp = (attrs) => el('input', Object.assign({ class: 'input', type: 'text' }, attrs));

    const fApiKey = field('apiKey', inp({ value: c.apiKey || '', placeholder: 'AIzaSy…' }));
    const fDbUrl = field('databaseURL', inp({ value: c.databaseURL || '', placeholder: 'https://SEU-PROJETO-default-rtdb.firebaseio.com' }));
    const fProject = field('projectId (opcional)', inp({ value: c.projectId || '', placeholder: 'seu-projeto' }));
    const fEmail = field('E-mail da conta de sincronização', inp({ type: 'email', value: c.email || '', placeholder: 'voce@exemplo.com' }),
      'Uma conta de e-mail/senha criada no Authentication do seu Firebase. Use o MESMO e-mail nos dois aparelhos.');
    const fPass = field('Senha', inp({ type: 'password', placeholder: '••••••••' }),
      'A senha não é guardada: o Firebase mantém a sessão iniciada neste aparelho.');

    const body = el('div', {}, [
      el('div', { class: 'parse-info' }, el('div', {
        html: 'Sincronização é <strong>opcional</strong>. Sem ela o app funciona normalmente, isolado por aparelho. ' +
          'Você usa <strong>o seu próprio</strong> projeto Firebase (plano gratuito) — nenhuma credencial vem embutida no código.'
      })),
      el('div', { class: 'form-grid' }, [fApiKey, fDbUrl, fProject, fEmail, fPass]),
      el('details', { style: { marginTop: '14px' } }, [
        el('summary', { style: { cursor: 'pointer', fontSize: '13px', fontWeight: '600' }, text: 'Como criar o projeto no Firebase (passo a passo)' }),
        el('ol', { style: { paddingLeft: '20px', listStyle: 'decimal', fontSize: '13px', lineHeight: '1.7', marginTop: '8px' } }, [
          el('li', { html: 'Acesse <strong>console.firebase.google.com</strong> e crie um projeto (plano Spark, gratuito).' }),
          el('li', { html: 'Em <strong>Build → Realtime Database</strong>, crie o banco e escolha "Iniciar no modo bloqueado".' }),
          el('li', { html: 'Em <strong>Build → Authentication → Sign-in method</strong>, ative <strong>E-mail/senha</strong>.' }),
          el('li', { html: 'Em <strong>Configurações do projeto → Seus apps → Web</strong>, registre um app e copie <code>apiKey</code> e <code>databaseURL</code>.' }),
          el('li', { html: 'Na aba <strong>Regras</strong> do Realtime Database, cole as regras abaixo e publique.' })
        ]),
        el('textarea', { class: 'input textarea', rows: 11, readonly: true, style: { marginTop: '8px' }, text: REGRAS }),
        el('p', { class: 'hint', html: 'Essas regras garantem que <strong>só a sua conta</strong> lê e escreve os seus dados. Não use regras abertas: qualquer pessoa conseguiria ler suas finanças.' })
      ])
    ]);

    UI.openModal({
      title: 'Sincronização entre dispositivos',
      wide: true,
      body,
      buttons: [
        Sync.isConfigured() ? {
          label: 'Desativar', class: 'btn-ghost', align: 'left',
          onClick: async () => {
            const ok = await UI.confirm({
              title: 'Desativar sincronização',
              message: 'Os dados continuam salvos neste aparelho e na sua nuvem, mas param de sincronizar. Continuar?',
              confirmLabel: 'Desativar', danger: true
            });
            if (ok) { Sync.disconnect(true); UI.toast('Sincronização desativada.'); UI.closeModal(); }
          }
        } : null,
        { label: 'Cancelar', class: 'btn-outline', onClick: UI.closeModal },
        {
          label: 'Conectar', class: 'btn-primary',
          onClick: async () => {
            const next = {
              apiKey: fApiKey._control.value.trim(),
              databaseURL: fDbUrl._control.value.trim(),
              projectId: fProject._control.value.trim(),
              email: fEmail._control.value.trim()
            };
            if (!next.apiKey || !next.databaseURL || !next.email) {
              UI.toast('Preencha apiKey, databaseURL e e-mail.', 'error');
              return;
            }
            if (!/^https?:\/\//.test(next.databaseURL)) {
              UI.toast('A databaseURL precisa começar com https://', 'error');
              return;
            }
            writeCfg(next);
            cfg = next;
            const senha = fPass._control.value;
            UI.closeModal();
            const ok = await Sync.connect(senha);
            UI.toast(ok ? 'Sincronização ativa.' : 'Não foi possível conectar — veja o indicador na barra lateral.',
              ok ? 'success' : 'error');
          }
        }
      ].filter(Boolean)
    });
  };

  /* ---------------- inicialização ---------------- */

  Sync.init = function () {
    setState('off');
    const chip = document.getElementById('syncChip');
    if (chip) chip.addEventListener('click', () => Sync.openConfig());

    Store.onChange((reason) => {
      if (reason === 'theme' || reason === 'sync-apply') return;
      schedulePush();
    });

    if (Sync.isConfigured()) Sync.connect(null);
  };

  global.Sync = Sync;
})(window);
