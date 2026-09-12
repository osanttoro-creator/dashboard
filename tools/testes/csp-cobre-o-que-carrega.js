/* =============================================================
   csp-cobre-o-que-carrega.js — a CSP publicada contra a realidade
   -------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE

   Em 12/09/2026 o site ganhou o Google num toque. A CSP liberou
   accounts.google.com em script-src e connect-src -- e esqueceu
   style-src. O script carregava, pedia gsi/style, e o navegador
   recusava em silêncio: a bolha chegaria sem forma nenhuma.

   As doze verificações passaram com o bug no ar. Nenhuma delas
   enxerga cabeçalho HTTP, e a CSP não vive no HTML: vive no
   .htaccess do deploy. O erro só apareceu porque alguém leu o
   console da página publicada.

   O QUE ELE CONFERE

   1. Todo endereço externo que o site carrega de fato está liberado
      na diretiva certa da CSP.
   2. Terceiros que precisam de MAIS de uma diretiva têm todas elas.
      Esta é a parte que nenhuma varredura descobre sozinha: que o
      script do One Tap vai buscar uma folha de estilo não está
      escrito em lugar nenhum do nosso código. Está na tabela
      COMPANHIA abaixo, com o motivo ao lado -- e é justamente o
      conhecimento que faltava em setembro.

   O QUE ELE NÃO CONFERE

   Não abre navegador. Um terceiro novo que busque algo inesperado
   em tempo de execução só será pego quando alguém o acrescentar à
   tabela. O teste transforma o que já se sabe em regra; não
   descobre o que ninguém sabe ainda.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const falhas = [];

/* ---------------------------------------------------------------
   terceiros que pedem mais do que parecem
   --------------------------------------------------------------- */
const COMPANHIA = {
  'https://accounts.google.com': {
    porque: 'o script do One Tap busca a própria folha de estilo (gsi/style), ' +
            'conversa com a própria origem e desenha a bolha num iframe',
    diretivas: ['script-src', 'style-src', 'connect-src', 'frame-src']
  }
};

/* ---------------------------------------------------------------
   1 · a CSP
   --------------------------------------------------------------- */
const htaccess = ler('deploy', 'hostinger', '.htaccess');
const linha = htaccess.match(/Content-Security-Policy\s+"([^"]+)"/);
if (!linha) {
  console.error('FALHOU: não achei o Content-Security-Policy em deploy/hostinger/.htaccess.');
  console.error('  Sem ele o site vai ao ar sem política nenhuma.');
  process.exit(1);
}

const politica = {};
linha[1].split(';').forEach((parte) => {
  const campos = parte.trim().split(/\s+/).filter(Boolean);
  if (!campos.length) return;
  politica[campos[0]] = campos.slice(1);
});

/* Diretiva ausente cai no default-src -- é assim que o navegador lê,
   e ler diferente daria falso "está liberado". */
function fontes(diretiva) {
  return politica[diretiva] || politica['default-src'] || [];
}

function liberado(origem, diretiva) {
  return fontes(diretiva).some((f) => {
    if (f === origem) return true;
    if (f.indexOf('*') < 0) return false;
    const re = new RegExp('^' + f.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
    return re.test(origem);
  });
}

const origemDe = (url) => { try { return new URL(url).origin; } catch (e) { return null; } };

/* ---------------------------------------------------------------
   2 · o que o site carrega
   --------------------------------------------------------------- */
const carregamentos = [];   // { origem, diretiva, onde, url }
function anota(url, diretiva, onde) {
  const o = origemDe(url);
  if (!o) return;
  carregamentos.push({ origem: o, diretiva, onde, url });
}

const paginas = fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html'));
paginas.forEach((pag) => {
  const html = ler(pag);
  /* rel=canonical e rel=preconnect não buscam nada: entrar com eles
     aqui exigiria liberar a nossa própria origem à toa. */
  (html.match(/<script[^>]+src="(https:\/\/[^"]+)"/g) || []).forEach((t) => {
    anota(t.match(/src="([^"]+)"/)[1], 'script-src', pag);
  });
  (html.match(/<link[^>]+>/g) || []).forEach((t) => {
    if (!/rel="?stylesheet/.test(t)) return;
    const h = t.match(/href="(https:\/\/[^"]+)"/);
    if (h) anota(h[1], 'style-src', pag);
  });
  (html.match(/<img[^>]+src="(https:\/\/[^"]+)"/g) || []).forEach((t) => {
    anota(t.match(/src="([^"]+)"/)[1], 'img-src', pag);
  });
});

/* Scripts injetados em tempo de execução. Só conta como script-src
   num arquivo que de fato cria um <script>; senão um .src de imagem
   entraria na diretiva errada. */
function jsDaPasta(dir) {
  const saida = [];
  fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).forEach((e) => {
    if (e.isDirectory()) saida.push(...jsDaPasta(path.join(dir, e.name)));
    else if (e.name.endsWith('.js')) saida.push(path.join(dir, e.name));
  });
  return saida;
}
jsDaPasta(path.join('assets', 'js')).forEach((rel) => {
  const js = ler(rel);
  if (!/createElement\(\s*['"]script['"]\s*\)/.test(js)) return;
  (js.match(/\.src\s*=\s*['"](https:\/\/[^'"]+)['"]/g) || []).forEach((t) => {
    anota(t.match(/['"](https:\/\/[^'"]+)['"]/)[1], 'script-src', rel);
  });
});

/* O projeto Supabase nunca aparece escrito numa tag: o endereço vem
   da configuração e é concatenado. Sem esta linha, a conexão mais
   importante do produto ficaria fora da conferência. */
const conf = ler('assets', 'js', 'supabase-config.js');
const urlSupabase = (conf.match(/url:\s*'([^']+)'/) || [])[1];
if (urlSupabase) {
  anota(urlSupabase, 'connect-src', 'supabase-config.js');
  anota(urlSupabase.replace(/^https:/, 'wss:'), 'connect-src', 'supabase-config.js (tempo real)');
}

/* ---------------------------------------------------------------
   3 · conferência
   --------------------------------------------------------------- */
const vistos = new Set();
carregamentos.forEach((c) => {
  const chave = c.origem + ' @ ' + c.diretiva;
  if (vistos.has(chave)) return;
  vistos.add(chave);
  if (!liberado(c.origem, c.diretiva)) {
    falhas.push(`${c.diretiva} não libera ${c.origem}\n     carregado em ${c.onde} (${c.url})`);
  }
});

/* A companhia: para cada terceiro da tabela que o site realmente
   carrega, todas as diretivas que ele exige. */
const origensCarregadas = new Set(carregamentos.map((c) => c.origem));
Object.keys(COMPANHIA).forEach((origem) => {
  if (!origensCarregadas.has(origem)) return;
  const regra = COMPANHIA[origem];
  const faltando = regra.diretivas.filter((d) => !liberado(origem, d));
  if (faltando.length) {
    falhas.push(`${origem} está liberado só pela metade: falta ${faltando.join(', ')}\n` +
                `     por quê: ${regra.porque}`);
  }
});

/* ---------------------------------------------------------------
   resultado
   --------------------------------------------------------------- */
if (falhas.length) {
  console.error('FALHOU: a CSP não cobre o que o site carrega.\n');
  falhas.forEach((f) => console.error('  · ' + f));
  console.error('\n  A política está em deploy/hostinger/.htaccess.');
  console.error('  (public_html/.htaccess é cópia gerada pelo montar-pacote.ps1.)');
  process.exit(1);
}

console.log(`CSP confere: ${vistos.size} origem/diretiva verificadas, ` +
            `${Object.keys(COMPANHIA).length} terceiro(s) na tabela de companhia.`);
