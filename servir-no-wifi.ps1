# =============================================================
#  Abre o painel no celular pela rede Wi-Fi de casa.
#
#  Como usar:
#    1. clique com o botao direito neste arquivo
#       > "Executar com o PowerShell"
#    2. o script mostra um endereco tipo http://192.168.x.x:8777
#    3. digite esse endereco no Safari do iPhone
#       (o iPhone precisa estar no MESMO Wi-Fi que este PC)
#    4. para parar, feche a janela ou aperte Ctrl+C
#
#  Na primeira vez o Windows pode perguntar se libera o acesso:
#  marque "Redes privadas" e permita.
# =============================================================

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$porta = 8777

$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js' = 'application/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
  '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
}

$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $porta)
try { $listener.Start() } catch {
  Write-Host ""
  Write-Host "  Nao consegui abrir a porta $porta. Ela ja esta em uso?" -ForegroundColor Red
  Read-Host "  Enter para fechar"; exit 1
}

Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "   Servindo: $raiz"
Write-Host ""
Write-Host "   No Safari do iPhone, digite:" -ForegroundColor Yellow
foreach ($ip in $ips) { Write-Host "      http://$ip`:$porta" -ForegroundColor Green }
Write-Host ""
Write-Host "   Neste PC: http://localhost:$porta"
Write-Host "   Para parar: feche esta janela ou Ctrl+C"
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""

while ($true) {
  $cliente = $null
  try {
    $cliente = $listener.AcceptTcpClient()
    $fluxo = $cliente.GetStream()
    $leitor = New-Object System.IO.StreamReader($fluxo, [System.Text.Encoding]::ASCII)

    $linha = $leitor.ReadLine()
    if (-not $linha) { $cliente.Close(); continue }
    while ($leitor.Peek() -ge 0) { if ($leitor.ReadLine() -eq '') { break } }

    $partes = $linha -split ' '
    $caminho = if ($partes.Length -ge 2) { ($partes[1] -split '\?')[0] } else { '/' }
    $decodificado = [System.Uri]::UnescapeDataString($caminho)
    if ($decodificado -eq '/' -or $decodificado -eq '') { $decodificado = '/index.html' }

    $arquivo = Join-Path $raiz $decodificado.TrimStart('/').Replace('/', '\')
    $raizAbs = [System.IO.Path]::GetFullPath($raiz)
    try { $arquivo = [System.IO.Path]::GetFullPath($arquivo) } catch { $arquivo = '' }

    if ($arquivo -and $arquivo.StartsWith($raizAbs) -and (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
      $corpo = [System.IO.File]::ReadAllBytes($arquivo)
      $ext = [System.IO.Path]::GetExtension($arquivo).ToLower()
      $ctype = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
      $status = '200 OK'
    } else {
      $status = '404 Not Found'; $ctype = 'text/plain; charset=utf-8'
      $corpo = [System.Text.Encoding]::UTF8.GetBytes("404 - $decodificado")
    }

    $cab = "HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($corpo.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $bytesCab = [System.Text.Encoding]::ASCII.GetBytes($cab)
    $fluxo.Write($bytesCab, 0, $bytesCab.Length)
    $fluxo.Write($corpo, 0, $corpo.Length)
    $fluxo.Flush()
    Write-Host "  $status  $decodificado"
    $cliente.Close()
  } catch {
    try { if ($cliente) { $cliente.Close() } } catch {}
  }
}
