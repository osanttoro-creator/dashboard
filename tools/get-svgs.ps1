$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dir = "C:\Users\santtoro\AppData\Local\Temp\claude\C--Users-santtoro-Downloads-claude-sites\f14a4ff2-5dca-448e-9ab5-da835a2d583f\scratchpad\svgs"
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$mapa = [ordered]@{
  'itau'        = '60701190'
  'bradesco'    = '60746948'
  'santander'   = '90400888'
  'caixa'       = '00360305'
  'bb'          = '00000000'
  'nubank'      = '18236120'
  'inter'       = '00416968'
  'c6'          = '31872495'
  'btg'         = '30306294'
  'sicredi'     = '01181521'
  'sicoob'      = '02038232'
  'picpay'      = '09516419'
  'mercadopago' = '10573521'
  'xp'          = '33264668'
  'safra'       = '58160789'
  'banrisul'    = '92702067'
  'neon'        = '20855875'
  'pagbank'     = '08561701'
  'stone'       = '16501555'
  'bv'          = '59588111'
  'mercantil'   = '17184037'
}

foreach ($k in $mapa.Keys) {
  $url = "https://cdn.jsdelivr.net/npm/logos-bancos-br@0.7.1/logos/svg/$($mapa[$k]).svg"
  try {
    $wc = New-Object Net.WebClient
    $wc.Encoding = [Text.Encoding]::UTF8
    $txt = $wc.DownloadString($url)
    [IO.File]::WriteAllText("$dir\$k.svg", $txt, (New-Object Text.UTF8Encoding $false))
    $vb = ''
    $m = [regex]::Match($txt, 'viewBox="([^"]+)"')
    if ($m.Success) { $vb = $m.Groups[1].Value }
    Write-Output ("{0,-12} {1,7} bytes  viewBox={2}" -f $k, $txt.Length, $vb)
  } catch {
    Write-Output ("{0,-12} FALHA: {1}" -f $k, $_.Exception.Message)
  }
}
