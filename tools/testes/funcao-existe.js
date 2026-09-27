/* =============================================================
   funcao-existe.js — ajudante de um módulo não atende em outro
   -------------------------------------------------------------
   POR QUE ESTE TESTE EXISTE
   Em 27/09/2026 o formulário de metas parou inteiro: pages/goals.js
   chamava `checkbox(...)`, que existe — mas PRIVADO dentro da IIFE
   de forms.js. Abrir "Nova meta" ou "Editar" jogava um
   ReferenceError e o modal simplesmente não abria. A suíte inteira
   continuou verde: todos os testes do projeto ou leem o arquivo
   como texto ou exercitam funções puras, e um ReferenceError
   desses só acontece na hora do clique.

   O app não tem bundler nem import/export — cada arquivo é uma
   IIFE que pendura um objeto em `window`. É uma decisão do projeto
   e não está em discussão, mas ela tem um custo: nada avisa quando
   um arquivo usa um nome que só existe dentro de outro. Este teste
   é esse aviso.

   A REGRA, E POR QUE ELA É ESTREITA
   Só acusa quando o nome chamado é uma função declarada no TOPO da
   IIFE de OUTRO módulo e não existe neste. Essa é exatamente a
   forma do erro do `checkbox`, e é estreita de propósito: uma
   varredura genérica de "nome não declarado" precisa de um
   analisador de escopo de verdade, e sem ele enche a tela de
   falso-positivo — que é como um teste aprende a ser ignorado.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const dirJs = path.join(RAIZ, 'assets', 'js');

/** Tira comentários e literais: dentro deles não há chamada. */
function semRuido(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\[\s\S]|[^'\\])*'/g, "''")
    .replace(/"(?:\\[\s\S]|[^"\\])*"/g, '""');
}

/**
 * Funções declaradas no primeiro nível da IIFE — as que o módulo
 * trata como ajudantes internos. A indentação é o sinal: o projeto
 * inteiro escreve `  function nome(` dentro da IIFE.
 */
function ajudantesInternos(src) {
  const nomes = new Set();
  let m;
  const re = /^ {2}function\s+([a-z_$][\w$]*)\s*\(/gm;
  while ((m = re.exec(src))) nomes.add(m[1]);
  return nomes;
}

/** Todo nome que o arquivo declara, de qualquer forma. */
function declaradosNoArquivo(src) {
  const nomes = new Set();
  let m;
  const res = [
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /\b([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?function\b/g,
    /\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /* Método de objeto na forma curta — `conta(box) {` é DECLARAÇÃO,
       não chamada, e sem esta linha o onboarding parecia invadir o
       ajudante de mesmo nome das Configurações. */
    /^\s*([a-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm
  ];
  res.forEach((re) => { while ((m = re.exec(src))) nomes.add(m[1]); });
  return nomes;
}

const arquivos = [];
(function varrer(dir, prefixo) {
  fs.readdirSync(dir).forEach((f) => {
    const cheio = path.join(dir, f);
    if (fs.statSync(cheio).isDirectory()) { varrer(cheio, prefixo + f + '/'); return; }
    if (f.endsWith('.js') && prefixo !== 'i18n/') arquivos.push(prefixo + f);
  });
})(dirJs, '');

const fonte = {};
arquivos.forEach((rel) => { fonte[rel] = semRuido(fs.readFileSync(path.join(dirJs, rel), 'utf8')); });

/* Quem é dono de cada ajudante interno. Um nome que aparece em dois
   módulos já é local nos dois e não interessa aqui. */
const donos = {};
arquivos.forEach((rel) => {
  ajudantesInternos(fonte[rel]).forEach((nome) => {
    donos[nome] = donos[nome] || [];
    donos[nome].push(rel);
  });
});

const falhas = [];
arquivos.forEach((rel) => {
  const src = fonte[rel];
  const meus = declaradosNoArquivo(src);
  const chamadas = new Set();
  let m;
  const re = /(^|[^\w$.?])([a-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(src))) chamadas.add(m[2]);

  chamadas.forEach((nome) => {
    if (meus.has(nome)) return;                 // é daqui mesmo
    const de = donos[nome];
    if (!de || de.indexOf(rel) >= 0) return;    // não é ajudante de ninguém
    falhas.push(rel + ' chama ' + nome + '(), que é ajudante privado de ' + de.join(', '));
  });
});

if (falhas.length) {
  console.error('Ajudante de um módulo sendo chamado de outro:');
  falhas.forEach((f) => console.error('  - ' + f));
  console.error('\nCada arquivo é uma IIFE: o que está dentro de uma não existe na outra.');
  console.error('Declare o ajudante no arquivo que o usa, ou pendure-o num módulo global.');
  process.exit(1);
}

console.log('OK — ' + arquivos.length + ' módulos, nenhum ajudante privado chamado de fora.');
