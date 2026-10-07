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
  ['tools/varrer-historico-segredos.js', 'nenhum segredo conhecido no histórico do Git'],
  ['tools/conferir-rls.js', 'toda tabela exposta tem RLS'],
  ['tools/testes/csp-cobre-o-que-carrega.js', 'a CSP libera o que o site carrega'],
  ['tools/auditar-cliques.js', 'nenhum botão ou link sem ação'],
  ['tools/testes/seo-identidade-tema.js', 'tema persistente, identidade e descoberta pública'],
  ['tools/testes/legal-cookies-acessibilidade.js', 'SLA, privacidade, cookies e acessibilidade publicados'],
  ['tools/testes/privacidade-cadastro.js', 'privacidade aceita antes do cadastro e do primeiro uso'],
  ['tools/testes/limites-contextuais.js', 'limites só aparecem durante a ação'],
  ['tools/testes/sem-provedor-pagamento.js', 'nenhum provedor de pagamento antigo no produto'],
  ['tools/testes/stripe-seguro.js', 'Stripe preparada com as travas no lugar'],
  ['tools/testes/seguranca-lancamento.js', 'proteções de lançamento cobertas por teste'],
  ['tools/testes/uglez-openai.js', 'UGLEZ chama a OpenAI pelo servidor e envia só agregados'],
  ['tools/conferir-planos.js', 'site público e planos.js concordam'],
  ['tools/gen-idiomas.js --conferir', 'inglês, francês e espanhol em dia com o português'],
  ['tools/gen-idiomas-app.js --conferir', 'o app fala inglês, francês e espanhol em tudo o que escreve'],
  ['tools/testes/confere-planos.js', 'planos.js e o banco concordam'],
  ['tools/testes/contraste.js', 'contraste mínimo nos dois temas'],
  ['tools/testes/entrada-monetaria.js', 'reais e centavos avançam juntos sem afetar taxas'],
  ['tools/testes/automacoes-financeiras.js', 'automações financeiras são conservadoras e idempotentes'],
  ['tools/testes/funcao-existe.js', 'nenhum módulo chama o ajudante privado de outro'],
  ['tools/testes/preview-v3-isolada.js', 'prévia V3 pública permanece isolada dos dados reais'],
  ['tools/testes/v3-conexao-real.js', 'V3 real separada, autenticada e sem cache entre contas'],
  ['tools/testes/v3-dados-e-conflito.js', 'conflito, lápide e falha no meio continuam cobertos'],
  ['tools/testes/v3-perfis-compartilhados.js', 'perfis editáveis e compartilhamento isolado e revogável'],
  ['tools/testes/v3-carteira-instituicoes.js', 'carteira V3, bancos e ícones preservam a interação'],
  ['tools/testes/v3-corte-principal.js', '/app entrega a V3, sem rota de volta, com aceite obrigatório'],
  ['tools/testes/v3-lancamento-e-categoria.js', 'V3 tem os três estados, o meio de pagamento e os seletores de ícone e cor'],
  ['tools/testes/v3-cofre-e-formularios.js', 'V3 exige e-mail confirmado, PIN e cofre cifrado sem senha bancária'],
  ['tools/testes/v3-score.js', 'o OAZE Score pesa cada pergunta e não julga o que não sabe'],
  ['tools/testes/coco-extratos.js', 'Coco confere extratos locais antes de propor lançamentos'],
  ['tools/testes/coco-conversa-voz.js', 'Coco separa conversa e análises e protege a resposta falada']
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
    /* o nome pode trazer argumentos: 'arquivo.js --conferir' */
    saida = execFileSync(process.execPath, script.split(' '), { cwd: RAIZ, encoding: 'utf8' });
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
