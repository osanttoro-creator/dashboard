# =============================================================
#  Gera "financas.html" — o app inteiro em UM arquivo só.
#
#  Por que existe: o Safari do iPhone, ao abrir um .html pelo app
#  Arquivos, NÃO carrega CSS/JS de subpastas. Um arquivo único
#  resolve isso e ainda funciona 100% offline.
#
#  Como usar:  clique com o botão direito neste arquivo
#              > "Executar com o PowerShell"
#  Rode de novo sempre que alterar o CSS ou o JS.
# =============================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$saida = Join-Path $raiz 'financas.html'

function Ler([string]$rel) {
  $caminho = Join-Path $raiz $rel
  if (-not (Test-Path -LiteralPath $caminho)) { throw "Arquivo nao encontrado: $rel" }
  return [IO.File]::ReadAllText($caminho, [Text.Encoding]::UTF8)
}

# fecha-tag dentro de string JS quebraria o <script> que a envolve
function Proteger([string]$js) { return $js -replace '</script', '<\/script' }

# A FONTE É app.html, NÃO index.html.
#
# Isto já foi index.html e quebrou quando o site público tomou a
# raiz: o script passou a inlinar a landing, e o financas.html caiu
# de 1.269 KB para 29 KB -- um arquivo que abre, não dá erro nenhum,
# e não é o aplicativo. Quem só olhasse "gerado com sucesso" não
# perceberia.
$html = Ler 'app.html'

# Cinto e suspensório: se um dia o conteúdo do app.html mudar de
# natureza, é melhor o build FALHAR do que gerar um arquivo errado
# em silêncio. O app tem dezenas de <script src="/assets/...">; a
# landing tem um.
$quantosScripts = ([regex]::Matches($html, '<script\s+src="/assets/')).Count
if ($quantosScripts -lt 20) {
  throw "app.html tem apenas $quantosScripts scripts de assets/ - isso nao parece o aplicativo. Build abortado."
}

# ---- 1 · CSS embutido (a fonte vem primeiro: o @font-face precisa
#         existir antes das regras que a usam) ----
$fonte = Ler 'assets/vendor/fonte.css'
$html = $html.Replace(
  '<link rel="stylesheet" href="/assets/vendor/fonte.css">',
  "<style>`r`n$fonte`r`n</style>")

$css = Ler 'assets/css/style.css'
$html = $html.Replace(
  '<link rel="stylesheet" href="/assets/css/style.css">',
  "<style>`r`n$css`r`n</style>")

# ---- 2 · Chart.js local no lugar do CDN ----
$chart = Proteger (Ler 'assets/vendor/chart.umd.min.js')
$html = $html.Replace(
  '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>',
  "<script>`r`n$chart`r`n</script>")
$html = [regex]::Replace($html,
  '(?s)<!-- sem internet.*?-->\s*<script>window\.Chart \|\| document\.write.*?</script>', '')

# ---- 2.5 · SDK do Supabase ----
# Sync.loadScript tenta o CDN e cai no arquivo vendorizado. No arquivo
# unico nao existe assets/vendor/ ao lado, entao a queda nao teria onde
# cair: o SDK vai inline, pelo mesmo motivo do Chart.js.
$sb = Proteger (Ler 'assets/vendor/supabase.js')
$html = $html.Replace(
  '<script src="/assets/js/firebase-config.js"></script>',
  "<script>`r`n/* ===== assets/vendor/supabase.js ===== */`r`n$sb`r`n</script>`r`n<script src=`"/assets/js/firebase-config.js`"></script>")

# ---- 3 · scripts do app, na mesma ordem ----
$arquivos = @(
  'assets/vendor/bancos.js', 'assets/vendor/icons.js', 'assets/js/firebase-config.js', 'assets/js/supabase-config.js',
  'assets/js/utils.js', 'assets/js/icons.js', 'assets/js/store.js', 'assets/js/calc.js', 'assets/js/charts.js',
  'assets/js/ui.js', 'assets/js/cards.js', 'assets/js/forms.js', 'assets/js/importer.js',
  'assets/js/sync.js', 'assets/js/supabase-auth.js',
  'assets/js/planos.js', 'assets/js/limites.js', 'assets/js/checkout.js',
  'assets/js/repo.js', 'assets/js/fila.js',
  'assets/js/dados.js', 'assets/js/estado-sync.js',
  'assets/js/migracao.js', 'assets/js/onboarding.js', 'assets/js/conta.js',
  'assets/js/ai.js', 'assets/js/shell.js',
  'assets/js/pages/home.js', 'assets/js/pages/transactions.js', 'assets/js/pages/investments.js',
  'assets/js/pages/accounts.js', 'assets/js/pages/categories.js',
  'assets/js/pages/budget.js', 'assets/js/pages/goals.js', 'assets/js/pages/recurring.js', 'assets/js/pages/calendar.js', 'assets/js/pages/reports.js', 'assets/js/pages/uglez.js', 'assets/js/pages/precos.js', 'assets/js/pages/settings.js',
  'assets/js/app.js'
)
foreach ($f in $arquivos) {
  $js = Proteger (Ler $f)
  # A barra inicial: o app.html usa caminhos ABSOLUTOS desde que passou
  # a ser servido em /app/qualquer-coisa. A lista acima e de caminhos de
  # DISCO, sem barra, porque e ela que o Ler() usa.
  $html = $html.Replace("<script src=""/$f""></script>", "<script>`r`n/* ===== $f ===== */`r`n$js`r`n</script>")
}

# ---- 4 · confere que nada ficou apontando para fora ----
#      (so o markup; dentro de <script>/<style> ha strings que so
#      parecem atributos)
#
# SO OS BLOCOS COM CORPO SAO REMOVIDOS. Um <script src=...></script>
# tem corpo vazio e sobrevive de proposito -- era exatamente ele que
# escapava. A versao anterior removia os dois, entao um modulo
# esquecido na lista acima virava referencia externa e a conferencia
# nao tinha como reclamar.
#
# Foi assim que dados.js e estado-sync.js passaram: no arquivo unico
# do iPhone eles ficariam como <script src="/assets/..."> e dariam
# 404. O app abriria, a tela desenharia, e a sincronizacao
# simplesmente nao existiria -- sem erro visivel.
$markup = [regex]::Replace($html, '(?is)<(script|style)\b[^>]*>(?!\s*</\1>).+?</\1>', '')
# Ancora interna (#id) nao e referencia externa: o link "Pular para o
# conteudo" aponta para #content e sempre apontou. Aviso falso treina
# a ignorar aviso verdadeiro.
$pendentes = [regex]::Matches($markup, '(?:src|href)="(?!data:|#|https?://)([^"]+)"') |
  ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -ne '' }
# Referencia a /assets/ que sobrou e SEMPRE um modulo esquecido na
# lista acima -- e o resultado e um arquivo unico que abre, desenha e
# nao funciona. Isso e erro, nao aviso: um build quebrado e melhor
# nao existir do que ir para o iPhone parecendo bom.
$faltaram = $pendentes | Where-Object { $_ -like '/assets/*' }
if ($faltaram) {
  throw ("Estes modulos ficaram de fora da lista de inlining e continuariam externos no arquivo unico: " + ($faltaram -join ', '))
}
if ($pendentes) {
  Write-Warning ("Ainda ha referencias externas: " + ($pendentes -join ', '))
}

[IO.File]::WriteAllText($saida, $html, (New-Object Text.UTF8Encoding $false))
$kb = [math]::Round((Get-Item $saida).Length / 1KB, 0)
Write-Host ""
Write-Host "  OK - gerado: financas.html  ($kb KB)" -ForegroundColor Green
Write-Host "  Esse e o arquivo para mandar para o iPhone." -ForegroundColor Green

# O financas.html e um retrato do codigo no momento da geracao. Se voce
# preencher o firebase-config.js e esquecer de rodar este script, o PC
# sincroniza e o iPhone nao - falha silenciosa. Por isso o aviso abaixo.
$temFirebase = $html -notmatch "apiKey:\s*''"
$temSupabase = $html -notmatch "url:\s*''"
Write-Host ""
if ($temSupabase) {
  Write-Host "  Sincronizacao: Supabase (login com e-mail e senha dentro do app)." -ForegroundColor Green
} elseif ($temFirebase) {
  Write-Host "  Sincronizacao: Firebase (login com Google)." -ForegroundColor Green
} else {
  Write-Host "  Sincronizacao: DESLIGADA neste arquivo." -ForegroundColor Yellow
  Write-Host "  O app funciona normal, so nao sincroniza entre aparelhos." -ForegroundColor DarkGray
  Write-Host "  Para ligar: preencha assets/js/supabase-config.js (ou firebase-config.js)" -ForegroundColor DarkGray
  Write-Host "  e rode este script de novo." -ForegroundColor DarkGray
}
Write-Host ""
