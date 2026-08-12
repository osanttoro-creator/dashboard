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

$html = Ler 'index.html'

# ---- 1 · CSS embutido ----
$css = Ler 'assets/css/style.css'
$html = $html.Replace(
  '<link rel="stylesheet" href="assets/css/style.css">',
  "<style>`r`n$css`r`n</style>")

# ---- 2 · Chart.js local no lugar do CDN ----
$chart = Proteger (Ler 'assets/vendor/chart.umd.min.js')
$html = $html.Replace(
  '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>',
  "<script>`r`n$chart`r`n</script>")
$html = [regex]::Replace($html,
  '(?s)<!-- sem internet.*?-->\s*<script>window\.Chart \|\| document\.write.*?</script>', '')

# ---- 3 · scripts do app, na mesma ordem ----
$arquivos = @(
  'assets/vendor/icons.js', 'assets/js/firebase-config.js',
  'assets/js/utils.js', 'assets/js/icons.js', 'assets/js/store.js', 'assets/js/calc.js', 'assets/js/charts.js',
  'assets/js/ui.js', 'assets/js/cards.js', 'assets/js/forms.js', 'assets/js/importer.js',
  'assets/js/sync.js', 'assets/js/ai.js',
  'assets/js/pages/home.js', 'assets/js/pages/transactions.js', 'assets/js/pages/investments.js',
  'assets/js/pages/accounts.js', 'assets/js/pages/categories.js', 'assets/js/pages/annual.js',
  'assets/js/app.js'
)
foreach ($f in $arquivos) {
  $js = Proteger (Ler $f)
  $html = $html.Replace("<script src=""$f""></script>", "<script>`r`n/* ===== $f ===== */`r`n$js`r`n</script>")
}

# ---- 4 · confere que nada ficou apontando para fora ----
#      (so o markup; dentro de <script>/<style> ha strings que so parecem atributos)
$markup = [regex]::Replace($html, '(?is)<(script|style)\b[^>]*>.*?</\1>', '')
$pendentes = [regex]::Matches($markup, '(?:src|href)="(?!data:|https?://)([^"]+)"') |
  ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -ne '' }
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
if ($html -match "apiKey:\s*''") {
  Write-Host ""
  Write-Host "  Sincronizacao: DESLIGADA neste arquivo." -ForegroundColor Yellow
  Write-Host "  O app funciona normal, so nao sincroniza entre aparelhos." -ForegroundColor DarkGray
  Write-Host "  Para ligar: preencha assets/js/firebase-config.js e rode este script de novo." -ForegroundColor DarkGray
} else {
  Write-Host ""
  Write-Host "  Sincronizacao: configurada neste arquivo (login com Google)." -ForegroundColor Green
}
Write-Host ""
