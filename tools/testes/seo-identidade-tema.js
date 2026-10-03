/* Contrato mínimo de identidade, descoberta e preferência visual. */
'use strict';

const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..', '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');
const falhas = [];

const publicas = ['index.html', 'recursos.html', 'precos.html', 'suporte.html', 'privacidade.html', 'termos.html'];
for (const arquivo of publicas) {
  const html = ler(arquivo);
  if (!/<meta name="description" content="[^"]{70,170}">/.test(html)) falhas.push(`${arquivo}: meta description ausente ou fora da faixa útil`);
  if (!/<link rel="canonical" href="https:\/\//.test(html)) falhas.push(`${arquivo}: canonical ausente`);
  if (!/property="og:image" content="https:\/\/[^\"]+\/assets\/img\/oaze-og\.png"/.test(html)) falhas.push(`${arquivo}: preview social ausente`);
  if (!/name="twitter:image" content="https:\/\/[^\"]+\/assets\/img\/oaze-og\.png"/.test(html)) falhas.push(`${arquivo}: preview do X ausente`);
  if (!/rel="icon" href="\/assets\/img\/oaze-48\.png" sizes="48x48"/.test(html)) falhas.push(`${arquivo}: favicon PNG rastreável ausente`);
}

for (const arquivo of ['assets/img/oaze-og.png', 'assets/img/oaze-48.png', 'assets/img/oaze-180.png', 'llms.txt', 'sitemap.xml', 'robots.txt']) {
  if (!fs.existsSync(path.join(raiz, arquivo))) falhas.push(`${arquivo}: arquivo ausente`);
}

function dimensoesPng(arquivo) {
  const b = fs.readFileSync(path.join(raiz, arquivo));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
for (const [arquivo, esperado] of [
  ['assets/img/oaze-og.png', '1200x630'],
  ['assets/img/oaze-48.png', '48x48'],
  ['assets/img/oaze-180.png', '180x180']
]) {
  const obtido = dimensoesPng(arquivo).join('x');
  if (obtido !== esperado) falhas.push(`${arquivo}: ${obtido}, esperado ${esperado}`);
}

const index = ler('index.html');
if (!index.includes('"@type": "Organization"') || !index.includes('"@type": "WebSite"')) falhas.push('index.html: identidade estruturada incompleta');
if (!index.includes('Controle financeiro pessoal')) falhas.push('index.html: termo principal não está no título');

const sitemap = ler('sitemap.xml');
for (const rota of ['/app', '/entrar', '/cadastro', '/recuperar-senha', '/redefinir-senha', '/confirmar-email']) {
  if (sitemap.includes(`<loc>${rota}`) || sitemap.includes(`oaze.site${rota}</loc>`)) falhas.push(`sitemap.xml: rota privada incluída (${rota})`);
}
if (!ler('deploy/hostinger/montar-pacote.ps1').includes("'llms.txt'")) {
  falhas.push('deploy Hostinger: llms.txt ficaria fora da publicação');
}

/* TEMA: UM SÓ, E ISSO É DECISÃO, NÃO FALTA.
   O aplicativo tinha claro e escuro, com a preferência guardada no
   servidor e aplicada antes do CSS para não piscar branco. A V3 tem
   um tema só — pedido explícito —, e com ele saíram o tema.js, a
   sincronização da escolha e o piscar que ela existia para evitar.
   O que sobra do contrato é que ninguém volte a declarar dois sem
   trazer de volta as três coisas que fazem isso funcionar. */
const appV3 = ler('app-v3.html');
if (/data-theme="light"|oaze.tema/.test(appV3)) {
  falhas.push('app-v3.html: voltou a existir escolha de tema sem a máquina que a sustentava');
}
if (!/color-scheme:s*dark/.test(ler('preview-v3/app.css'))) {
  falhas.push('preview-v3/app.css: o tema único deixou de ser declarado');
}

if (falhas.length) {
  console.error('Identidade/SEO/tema incompletos:');
  falhas.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

console.log('OK — tema único declarado; identidade, previews, llms.txt e sitemap estão coerentes.');
