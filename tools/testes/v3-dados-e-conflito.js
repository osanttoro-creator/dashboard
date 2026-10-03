'use strict';

/* =============================================================
   OS DADOS DO APARELHO E OS DO BANCO, QUANDO DIVERGEM
   -------------------------------------------------------------
   Este teste substitui quatro que mediam a camada de sincronização
   do painel anterior — fila, repositório, mesclagem e retomada no
   celular. Aquele código foi apagado junto com o painel; os RISCOS
   que ele cobria continuam existindo, e são estes:

     1 · gravar por cima do que outro aparelho acabou de salvar;
     2 · uma resposta antiga do servidor chegar depois de uma edição
         nova e desfazê-la;
     3 · um perfil apagado voltar à vida porque o banco ainda o
         tinha quando o aparelho sincronizou;
     4 · uma falha no meio da gravação deixar a tela mostrando algo
         que o banco não guardou.

   A V3 resolve os quatro de um jeito diferente do anterior: em vez
   de fila e mesclagem no navegador, uma gravação por vez, com a
   revisão esperada indo junto no pedido. O banco recusa se alguém
   chegou primeiro, e a tela volta ao que era e avisa.

   Trocar a solução é legítimo. Perder as garantias no caminho, não
   — e é só isso que este arquivo verifica.
   ============================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..', '..');
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const backend = ler('preview-v3/live-backend.js');
const store = ler('assets/js/store.js');

/* 1 · UMA GRAVAÇÃO POR VEZ, COM A REVISÃO ESPERADA JUNTO.
   Sem a revisão no pedido, dois aparelhos salvam e o último escreve
   por cima do primeiro sem que ninguém perceba. */
assert.match(backend, /p_expected_updated_at: expected/,
  'a gravação parou de dizer de que versão ela partiu');
assert.match(backend, /if \(saving\) throw new Error/,
  'duas gravações podem acontecer ao mesmo tempo');
assert.match(backend, /error\.code === '40001'/,
  'o conflito do banco deixou de ser reconhecido');
assert.match(backend, /Este espaço mudou em outro aparelho/,
  'o conflito deixou de ser explicado a quem está na tela');

/* 2 · RESPOSTA ANTIGA NÃO VENCE EDIÇÃO NOVA.
   Enquanto grava, a atualização remota fica pendente e só roda
   depois — e roda, senão a tela fica velha de propósito. */
assert.match(backend, /if \(saving\) \{ refreshPending = true; return false; \}/,
  'uma atualização remota pode atropelar uma gravação em curso');
assert.match(backend, /refreshPending = false;\s*\n\s*await V3Backend\.reload\(\)/,
  'a atualização adiada deixou de acontecer depois da gravação');

/* 3 · PERFIL APAGADO NÃO RESSUSCITA.
   O aparelho guarda a hora em que apagou; o perfil só volta se for
   MAIS NOVO do que essa hora. Sem esta comparação, apagar num
   aparelho e abrir noutro trazia o perfil de volta. */
assert.match(backend, /stamp\(profile\) > \(Number\(removed\[id\]\) \|\| 0\)/,
  'a lápide do perfil apagado deixou de ser respeitada');
assert.match(backend, /\.select\('profiles,removidos'\)/,
  'a leitura parou de trazer o registro do que foi apagado');
assert.match(store, /normalizarRemovidos/,
  'o Store deixou de normalizar as lápides');

/* 4 · FALHA NO MEIO DEIXA A TELA IGUAL AO BANCO.
   O estado anterior é guardado antes de mexer e reposto no erro;
   sem isso, a pessoa continuaria vendo um lançamento que não existe
   em lugar nenhum. */
assert.match(backend, /const before = JSON\.parse\(JSON\.stringify\(profile\)\)/,
  'a gravação não guarda o estado anterior');
assert.match(backend, /Store\.normalizeProfile\(before\)/,
  'o estado anterior não é reposto quando a gravação falha');

/* 5 · A SESSÃO É CONFERIDA ANTES DE QUALQUER DADO, e de novo a cada
   recarga: uma aba esquecida aberta depois de trocar de conta não
   pode carregar o espaço de quem saiu. */
assert.match(backend, /if \(!verified \|\| verified\.id !== user\?\.id\)/,
  'a recarga não confere mais de quem é a sessão');
assert.match(backend, /authData\.user\.id !== verified\.id/,
  'o início não confere se o token e a sessão falam do mesmo usuário');
assert.match(backend, /event === 'SIGNED_OUT'/,
  'sair em outra aba não derruba esta');

/* 6 · O APARELHO QUE VOLTA DO BOLSO SE ATUALIZA. É o que resolvia o
   celular que reabria mostrando o mês de ontem. */
assert.match(backend, /visibilitychange/,
  'voltar para o app deixou de disparar atualização');
assert.match(backend, /postgres_changes/,
  'a mudança em outro aparelho deixou de chegar em tempo real');

console.log('OK — conflito, lápide, falha no meio e sessão conferida continuam cobertos.');
