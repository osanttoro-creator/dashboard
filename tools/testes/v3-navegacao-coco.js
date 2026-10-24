'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'assets/app/app.js'), 'utf8');
const hook = "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();";
assert(source.includes(hook), 'Ponto de entrada da V3 mudou; ajuste este teste.');
const instrumented = source.replace(hook, `  global.__navTest = { renderNav, handleClick, navEditorMarkup, prefs: () => navPrefs };\n${hook}`);

function createApp(saved = '') {
  const entries = new Map(saved ? [['oaze.v3.sidebar', saved]] : []);
  const classes = new Map();
  const desktop = { innerHTML: '' };
  const mobile = { innerHTML: '' };
  const document = {
    readyState: 'loading',
    documentElement: { dataset: { oazeMode: 'demo' } },
    body: { classList: { toggle: (name, enabled) => classes.set(name, enabled) } },
    addEventListener() {},
    querySelector(selector) {
      if (selector === '#v3-desktop-nav') return desktop;
      if (selector === '#v3-mobile-nav') return mobile;
      return null;
    }
  };
  const context = {
    document,
    localStorage: { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) },
    console
  };
  context.window = context;
  vm.runInNewContext(instrumented, context, { filename: 'app.js' });
  return { ...context.__navTest, entries, classes, desktop, mobile };
}

const app = createApp(JSON.stringify({
  order: ['coco', 'wallet', 'bogus', 'coco'], hidden: ['wallet', 'home', 'bogus'], collapsed: true
}));
app.renderNav();
assert.equal(app.classes.get('v3-sidebar-collapsed'), true);
assert(app.desktop.innerHTML.indexOf('data-go="coco"') < app.desktop.innerHTML.indexOf('data-go="home"'));
assert(!app.desktop.innerHTML.includes('data-go="wallet"'));
assert(app.desktop.innerHTML.includes('data-go="home"'), 'Início não pode ser ocultado.');
assert(app.mobile.innerHTML.includes('v3-dock-icon'));
assert(app.navEditorMarkup().includes('data-nav-move="up"'));

function click(dataset) { app.handleClick({ target: { dataset, closest: () => ({ dataset }) } }); }
click({ action: 'sidebar-toggle' });
assert.equal(app.prefs().collapsed, false);
assert.equal(JSON.parse(app.entries.get('oaze.v3.sidebar')).collapsed, false);
click({ navVisibility: 'wallet' });
assert(app.desktop.innerHTML.includes('data-go="wallet"'));
click({ navMove: 'down', navPage: 'coco' });
assert.equal(app.prefs().order[1], 'coco');
click({ action: 'sidebar-reset' });
assert.equal(app.prefs().order[0], 'home');
assert.equal(app.prefs().hidden.length, 0);

const css = fs.readFileSync(path.join(root, 'assets/app/navigation-coco-refinement.css'), 'utf8');
assert(css.includes('pointer: fine') && css.includes('prefers-reduced-motion'));
assert(css.includes('@property --v3-coco-rotation'));
console.log('OK — sidebar persistida/editável, dock e borda da Coco cobertos.');
