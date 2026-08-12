$ErrorActionPreference = 'Stop'
$dir = "C:\Users\santtoro\AppData\Local\Temp\claude\C--Users-santtoro-Downloads-claude-sites\f14a4ff2-5dca-448e-9ab5-da835a2d583f\scratchpad"
$json = [IO.File]::ReadAllText("$dir\bancos.json", [Text.Encoding]::UTF8)
$arr = ($json | ConvertFrom-Json).banks

# chave interna do app -> padroes de busca (ordem importa: 1o match vence)
$alvos = [ordered]@{
  'itau'         = @('^ITA. UNIBANCO S\.A\.$', 'ITA. UNIBANCO')
  'bradesco'     = @('^BCO BRADESCO S\.A\.$', 'BRADESCO S\.A\.')
  'santander'    = @('SANTANDER \(BRASIL\)')
  'caixa'        = @('CAIXA ECONOMICA FEDERAL')
  'bb'           = @('^BCO DO BRASIL S\.A\.$')
  'nubank'       = @('^NU PAGAMENTOS')
  'inter'        = @('^BANCO INTER$', '^BCO INTER$')
  'c6'           = @('^BANCO C6 S\.A\.$', '^BCO C6 S\.A\.$', 'C6 S\.A\.')
  'btg'          = @('^BCO BTG PACTUAL S\.A\.$', 'BTG PACTUAL S\.A\.')
  'sicredi'      = @('^BCO COOPERATIVO SICREDI S\.A\.$', 'SICREDI')
  'sicoob'       = @('^BANCO SICOOB S\.A\.$', 'SICOOB S\.A\.', 'BANCOOB')
  'picpay'       = @('^PICPAY BANK', 'PICPAY')
  'mercadopago'  = @('MERCADO PAGO')
  'xp'           = @('^BANCO XP S\.A\.$', '^XP INVESTIMENTOS', 'XP S\.A\.')
  'safra'        = @('^BANCO SAFRA S\.A\.$', 'SAFRA S\.A\.')
  'banrisul'     = @('BANRISUL')
  'neon'         = @('^NEON PAGAMENTOS', 'NEON')
  'pagbank'      = @('^BCO PAN', 'PAGSEGURO', 'PAGBANK')
  'original'     = @('^BCO ORIGINAL S\.A\.$', 'ORIGINAL S\.A\.')
  'will'         = @('^WILL FINANCEIRA', 'WILL BANK')
  'stone'        = @('^STONE ', 'STONE PAGAMENTOS')
  'bv'           = @('^BCO VOTORANTIM', 'BANCO BV')
  'daycoval'     = @('DAYCOVAL')
  'modal'        = @('^BCO MODAL', 'MODAL S\.A\.')
}

$resultado = @()
foreach ($k in $alvos.Keys) {
  $achou = $null
  foreach ($pat in $alvos[$k]) {
    $achou = $arr | Where-Object { ($_.shortName -match $pat) -or ($_.name -match $pat) } |
             Where-Object { $_.logo -and $_.logo.svg } | Select-Object -First 1
    if ($achou) { break }
  }
  if ($achou) {
    $resultado += [pscustomobject]@{
      key = $k; ispb = $achou.ispb; nome = $achou.name; svg = $achou.logo.svg
    }
  } else {
    $resultado += [pscustomobject]@{ key = $k; ispb = ''; nome = '(NAO ENCONTRADO)'; svg = '' }
  }
}
$resultado | Format-Table -AutoSize
$resultado | ConvertTo-Json | Set-Content "$dir\bank-map.json" -Encoding UTF8
