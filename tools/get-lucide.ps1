$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dir = "C:\Users\santtoro\AppData\Local\Temp\claude\C--Users-santtoro-Downloads-claude-sites\f14a4ff2-5dca-448e-9ab5-da835a2d583f\scratchpad\lucide"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

# conjunto curado para financas pessoais (nao a biblioteca inteira)
$icones = @(
  # mapeamento padrao pedido
  'utensils','car','house','heart-pulse','gamepad-2','graduation-cap','shopping-bag',
  'repeat','receipt','banknote','trending-up','circle-ellipsis',
  # despesas comuns
  'fuel','bus','plane','coffee','shopping-cart','shirt','pill','dumbbell','wifi',
  'smartphone','zap','droplet','flame','wrench','hammer','scissors','dog','baby',
  'book-open','ticket','film','music','cake','gift','umbrella','shield','landmark',
  'building-2','key','sofa','tv','cigarette','church','stethoscope','glasses',
  # receitas / financeiro
  'wallet','piggy-bank','coins','hand-coins','briefcase','laptop','circle-dollar-sign',
  'percent','chart-line','arrow-left-right','credit-card','users','heart-handshake',
  'badge-dollar-sign','sparkles','star','tag','package','truck','map-pin',
  # genericos / interface
  'circle-help','folder','list','calendar','clock','building','banknote-arrow-down'
)

$okCount = 0; $falhas = @()
foreach ($n in $icones) {
  $url = "https://cdn.jsdelivr.net/npm/lucide-static@0.563.0/icons/$n.svg"
  try {
    $wc = New-Object Net.WebClient
    $wc.Encoding = [Text.Encoding]::UTF8
    $txt = $wc.DownloadString($url)
    [IO.File]::WriteAllText("$dir\$n.svg", $txt, (New-Object Text.UTF8Encoding $false))
    $okCount++
  } catch { $falhas += $n }
}
Write-Output ("baixados: $okCount de " + $icones.Count)
if ($falhas) { Write-Output ("falharam: " + ($falhas -join ', ')) }
$tot = (Get-ChildItem $dir -Filter *.svg | Measure-Object Length -Sum).Sum
Write-Output ("tamanho total: " + [math]::Round($tot/1KB,1) + " KB")
