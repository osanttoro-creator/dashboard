$ErrorActionPreference = 'Stop'
$scratch = "C:\Users\santtoro\AppData\Local\Temp\claude\C--Users-santtoro-Downloads-claude-sites\f14a4ff2-5dca-448e-9ab5-da835a2d583f\scratchpad"
$saida  = "C:\Users\santtoro\Downloads\claude sites\assets\vendor\icons.js"

function Get-Inner([string]$svg) {
  # remove comentarios, o <svg ...> de fora e o </svg>, e colapsa espacos
  $s = [regex]::Replace($svg, '(?s)<!--.*?-->', '')
  $s = [regex]::Replace($s, '(?s)^\s*<svg[^>]*>', '')
  $s = [regex]::Replace($s, '(?s)</svg>\s*$', '')
  $s = [regex]::Replace($s, '\s*\r?\n\s*', ' ')
  $s = [regex]::Replace($s, '>\s+<', '><')
  return $s.Trim()
}
function Get-ViewBox([string]$svg, [string]$fallback) {
  $m = [regex]::Match($svg, 'viewBox="([^"]+)"')
  if ($m.Success) { return $m.Groups[1].Value }
  $w = [regex]::Match($svg, '\bwidth="(\d+)"')
  $h = [regex]::Match($svg, '\bheight="(\d+)"')
  if ($w.Success -and $h.Success) { return "0 0 $($w.Groups[1].Value) $($h.Groups[1].Value)" }
  return $fallback
}
function Esc([string]$s) { return $s.Replace('\', '\\').Replace("'", "\'") }

$sb = New-Object Text.StringBuilder
[void]$sb.AppendLine("/* =============================================================")
[void]$sb.AppendLine("   icons.js — GERADO AUTOMATICAMENTE, não edite à mão.")
[void]$sb.AppendLine("   Regenerar: scripts em scratchpad/gen-icons.ps1")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("   · Logos de bancos: projeto logos-bancos-br (MIT), SVGs")
[void]$sb.AppendLine("     vendorizados aqui para o app funcionar offline e em file://.")
[void]$sb.AppendLine("   · Ícones de categoria: Lucide (ISC), subconjunto curado.")
[void]$sb.AppendLine("   ============================================================= */")
[void]$sb.AppendLine("(function (global) {")
[void]$sb.AppendLine("  'use strict';")
[void]$sb.AppendLine("  var RAW = { banks: {}, lucide: {} };")
[void]$sb.AppendLine("")

# ---- bancos ----
[void]$sb.AppendLine("  /* ---- logos de bancos (coloridos, viewBox próprio) ---- */")
Get-ChildItem "$scratch\svgs" -Filter *.svg | Sort-Object Name | ForEach-Object {
  $key = $_.BaseName
  $txt = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
  $vb  = Get-ViewBox $txt '0 0 512 512'
  $inner = Get-Inner $txt
  [void]$sb.AppendLine("  RAW.banks['$key'] = { vb: '$vb', body: '$(Esc $inner)' };")
}
[void]$sb.AppendLine("")

# ---- lucide ----
[void]$sb.AppendLine("  /* ---- ícones Lucide (traço, herdam currentColor) ---- */")
Get-ChildItem "$scratch\lucide" -Filter *.svg | Sort-Object Name | ForEach-Object {
  $key = $_.BaseName
  $txt = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
  $inner = Get-Inner $txt
  [void]$sb.AppendLine("  RAW.lucide['$key'] = '$(Esc $inner)';")
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("  global.IconData = RAW;")
[void]$sb.AppendLine("})(window);")

[IO.File]::WriteAllText($saida, $sb.ToString(), (New-Object Text.UTF8Encoding $false))
$kb = [math]::Round((Get-Item $saida).Length / 1KB, 1)
Write-Output "gerado: assets/vendor/icons.js ($kb KB)"
