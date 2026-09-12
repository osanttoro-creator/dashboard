/* =============================================================
   tools/verificar-tudo.js — a bateria inteira, num comando
   -------------------------------------------------------------
     node tools/verificar-tudo.js

   Roda TODAS as verificações do projeto e devolve um resumo. Sai
   com código 1 se qualquer uma falhar, então serve como passo de
   CI e como último gesto antes de publicar.

   POR QUE ISTO EXISTE
   As verificações estavam espalhadas em dois diretórios e nenhum
   comando as executava juntas. O resultado apareceu na prática:
   tools/testes/confere-planos.js estava FALHANDO no repositório
   havia tempo, com 16 divergências, e ninguém sabia — porque para
   descobrir era preciso lembrar de rodá-lo à mão.

   Uma suíte que ninguém roda não é uma suíte; é documentação
   desatualizada que finge ser código.

   O QUE NÃO ESTÁ AQUI
   Os testes de banco (isolamento-rls.sql, plano-efetivo.sql). Eles
   precisam de uma conexão ao Postgres e de dois usuários de
   verdade; rodá-los exige o ambiente, não só o repositório. Estão
   listados no fim da saída para não serem esquecidos.
   ============================================================= */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

const VERIFICACOES = [
  ['tools/varrer-segredos.js', 'nenhum segredo no que vai ao navegador'],
  ['tools/conferir-rls.js', 'toda tabela exposta tem RLS'],
  ['tools/auditar-cliques.js', 'nenhum botão ou link sem ação'],
  ['tools/testes/navegacao-superior.js', 'navegação superior direta e Planejar visível'],
  ['tools/testes/limites-contextuais.js', 'limites só aparecem durante a ação'],
  ['tools/conferir-planos.js', 'site público e planos.js concordam'],
  ['tools/testes/confere-planos.js', 'planos.js e o banco concordam'],
  ['tools/testes/contraste.js', 'contraste mínimo nos dois temas'],
  ['tools/testes/ida-e-volta.js', 'dados voltam iguais do banco'],
  ['tools/testes/trava-sobrescrita.js', 'o banco não apaga o aparelho'],
  ['tools/testes/assinatura-webhook.js', 'webhook rejeita assinatura inválida']
];

const SQL_MANUAIS = [
  ['tools/testes/isolamento-rls.sql', 'usuário A não alcança dados do usuário B'],
  ['tools/testes/plano-efetivo.sql', 'meus_direitos() devolve o plano certo']
];

console.log('\n  OAZE — verificação completa');
console.log('  ' + '─'.repeat(62) + '\n');

let falharam = 0;

for (const [script, descricao] of VERIFICACOES) {
  let saida = '';
  let ok = true;
  try {
    saida = execFileSync(process.execPath, [script], { cwd: RAIZ, encoding: 'utf8' });
  } catch (e) {
    ok = false;
    saida = (e.stdout || '') + (e.stderr || '');
    falharam++;
  }
  console.log('  ' + (ok ? 'ok   ' : 'FALHA') + '  ' + descricao);
  console.log('         ' + script);
  if (!ok) {
    /* Só o essencial da saída: o log inteiro de nove verificações
       esconderia justamente a que quebrou. */
    saida.split('\n').filter((l) => l.trim()).slice(0, 14)
      .forEach((l) => console.log('         │ ' + l));
  }
  console.log('');
}

console.log('  ' + '─'.repeat(62));
if (falharam) {
  console.log('  ' + falharam + ' verificação(ões) falharam.\n');
} else {
  console.log('  Todas as ' + VERIFICACOES.length + ' verificações passam.\n');
}

console.log('  Precisam de banco, e por isso ficam de fora daqui:');
SQL_MANUAIS.forEach(([f, d]) => console.log('    · ' + f + '  — ' + d));
console.log('');

process.exit(falharam ? 1 : 0);
