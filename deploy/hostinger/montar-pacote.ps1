# =============================================================
# OAZE — monta o pacote para a Hostinger
# -------------------------------------------------------------
#   .\deploy\hostinger\montar-pacote.ps1
#
# Gera deploy/hostinger/public_html/ com exatamente o que vai para
# o servidor, e um .zip pronto para o Gerenciador de Arquivos.
#
# O QUE ESTE SCRIPT NÃO FAZ: publicar. Ele monta e confere. A
# subida é sua, depois de olhar o checklist.
#
# O QUE ELE CONFERE, ANTES DE EMPACOTAR
#   · nenhum segredo no que vai ser servido
#   · nenhum arquivo de código-fonte que não deveria ir junto
#   · o .htaccess presente (sem ele, /precos dá 404 no Apache)
# =============================================================
$ErrorActionPreference = 'Stop'

$raiz    = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$destino = Join-Path $PSScriptRoot 'public_html'
$zip     = Join-Path $PSScriptRoot 'oaze-public_html.zip'

Write-Host ""
Write-Host "  Montando o pacote a partir de: $raiz" -ForegroundColor Cyan

# ---- 1 · limpa a pasta anterior ----
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Force -Path $destino | Out-Null

# ---- 2 · o que VAI ----
# Lista explícita, não exclusão: a lista de exclusão esquece o
# arquivo novo que alguem acabou de criar; a de inclusão, não.
$arquivos = @('index.html', 'robots.txt')
$pastas   = @('assets')

foreach ($f in $arquivos) {
  $o = Join-Path $raiz $f
  if (Test-Path $o) { Copy-Item $o -Destination $destino }
  else { Write-Warning "nao encontrado: $f" }
}
foreach ($d in $pastas) {
  $o = Join-Path $raiz $d
  if (Test-Path $o) { Copy-Item $o -Destination $destino -Recurse }
}

Copy-Item (Join-Path $PSScriptRoot '.htaccess') -Destination $destino
Copy-Item (Join-Path $PSScriptRoot '404.html')  -Destination $destino

# ---- 3 · conferencia de segredos ----
# A ultima chance de perceber uma chave antes de ela virar publica.
#
# O -Force nao e detalhe: no Linux, Get-ChildItem sem ele ignora
# tudo que comeca com ponto. No runner do GitHub isso fazia a
# varredura pular justamente o .htaccess -- ela passava por nao ter
# olhado. No Windows o mesmo arquivo era lido, porque la "oculto" e
# um atributo, nao o nome. Uma conferencia que muda de alcance
# conforme o sistema e pior que nenhuma: da confianca sem cobertura.
Write-Host ""
Write-Host "  Conferindo segredos no que vai ser servido..." -ForegroundColor Cyan

$padroes = @(
  @{ nome = 'chave OpenAI';      re = 'sk-(proj|svcacct)-[A-Za-z0-9_-]{40,}' },
  @{ nome = 'chave Anthropic';   re = 'sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}' },
  @{ nome = 'segredo Supabase';  re = 'sb_secret_[A-Za-z0-9_-]{20,}' },
  @{ nome = 'service_role JWT';  re = 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*(c2VydmljZV9yb2xl|cm9sZSI6InNlcnZpY2U)' }
)

$achados = @()
Get-ChildItem $destino -Recurse -File -Force | ForEach-Object {
  $conteudo = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -eq $conteudo) { return }
  foreach ($p in $padroes) {
    if ($conteudo -match $p.re) {
      $achados += "$($p.nome) em $($_.FullName.Replace($destino, ''))"
    }
  }
}

if ($achados.Count -gt 0) {
  Write-Host ""
  Write-Host "  PACOTE NAO GERADO - segredo encontrado:" -ForegroundColor Red
  $achados | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
  Remove-Item $destino -Recurse -Force
  exit 1
}
Write-Host "  nenhum segredo encontrado" -ForegroundColor Green

# ---- 4 · conferencia de arquivos indevidos ----
$indevidos = Get-ChildItem $destino -Recurse -File -Force |
  Where-Object { $_.Name -match '\.(ps1|sql|md)$' -or $_.Name -eq '.env' }
if ($indevidos) {
  Write-Host ""
  Write-Host "  Arquivos que nao deveriam ir:" -ForegroundColor Yellow
  $indevidos | ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor Yellow }
  $indevidos | Remove-Item -Force
  Write-Host "  removidos do pacote" -ForegroundColor Green
}

# ---- 5 · o .htaccess precisa estar la ----
if (-not (Test-Path (Join-Path $destino '.htaccess'))) {
  Write-Host "  .htaccess AUSENTE - /precos daria 404 no Apache" -ForegroundColor Red
  exit 1
}

# ---- 6 · zip ----
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $destino '*') -DestinationPath $zip -Force

# O Compress-Archive ignora arquivos que comecam com ponto; o
# .htaccess e o mais importante do pacote, entao entra a mao.
#
# O Add-Type so e necessario no Windows PowerShell 5.1. No
# PowerShell 7 (o do runner do GitHub) a montagem ja faz parte do
# framework e o Add-Type falha dizendo que nao acha a DLL -- por
# isso ele e tentado, nao exigido.
try { Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop } catch { }

$arquivo = [System.IO.Compression.ZipFile]::Open($zip, 'Update')
try {
  # No Linux o curinga do Compress-Archive PODE ter pego o .htaccess.
  # Adicionar de novo criaria uma segunda entrada com o mesmo nome:
  # o zip aceita, o unzip fica com a ultima, e o pacote passa a
  # depender de qual das duas venceu. Melhor nao criar a duvida.
  if (-not ($arquivo.Entries | Where-Object { $_.FullName -eq '.htaccess' })) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $arquivo, (Join-Path $destino '.htaccess'), '.htaccess') | Out-Null
  }
} finally { $arquivo.Dispose() }

$n  = (Get-ChildItem $destino -Recurse -File -Force).Count
$kb = [math]::Round((Get-Item $zip).Length / 1KB)

Write-Host ""
Write-Host "  OK - pacote pronto" -ForegroundColor Green
Write-Host "    pasta: $destino"
Write-Host "    zip:   $zip  ($kb KB, $n arquivos)"
Write-Host ""
Write-Host "  Proximo passo: deploy/hostinger/README.md" -ForegroundColor Cyan
Write-Host "  NAO publique sem passar pelo checklist de la." -ForegroundColor Yellow
Write-Host ""
