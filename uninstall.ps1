#Requires -Version 7.0
<#
.SYNOPSIS
    卸载 DSH 安全模式层（install.ps1 的逆操作）。

.DESCRIPTION
    去掉 package.json 里的 dependencies 与 bundles 条目，可选删除 <DSH_HOME>\local-bundles 下的副本。
    **不会**删除题卡目录 <DSH_HOME>\ctf（那是你的数据）。
#>
[CmdletBinding()]
param(
    [string]$DshHome,
    [string]$Profile = 'web',
    [switch]$RemoveFiles,
    [switch]$SkipInstall,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$packages = @('dsh-security-modes', 'dsh-ctf-board')

function Say($msg) { Write-Host $msg }

if (-not $DshHome) { $DshHome = $env:DSH_HOME }
if (-not $DshHome) {
    $guess = Join-Path $HOME '.dsh'
    if (Test-Path $guess) { $DshHome = $guess }
}
if (-not $DshHome -or -not (Test-Path $DshHome)) { throw '找不到 DSH_HOME，用 -DshHome 指定' }
$DshHome = (Resolve-Path $DshHome).Path.TrimEnd('\')

$pkgJsonPath = Join-Path $DshHome "profiles\$Profile\package.json"
if (-not (Test-Path $pkgJsonPath)) { throw "profile 不存在：$pkgJsonPath" }

Say "DSH_HOME    : $DshHome"
Say "package.json: $pkgJsonPath"

$json = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$backupPath = "$pkgJsonPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

foreach ($p in $packages) {
    $name = "@local/$p"
    if ($json.dependencies.PSObject.Properties[$name]) {
        Say "  - dependency $name"
        if (-not $DryRun) { $json.dependencies.PSObject.Properties.Remove($name) }
    }
    $bundles = @($json.dsh.profile.bundles)
    if ($bundles -contains $name) {
        Say "  - bundle $name"
        $bundles = $bundles | Where-Object { $_ -ne $name }
        if (-not $DryRun) { $json.dsh.profile.bundles = $bundles }
    }
    if ($RemoveFiles) {
        $dst = Join-Path $DshHome "local-bundles\$p"
        if (Test-Path $dst) {
            Say "  - 目录 $dst"
            if (-not $DryRun) { Remove-Item $dst -Recurse -Force }
        }
    }
}

if (-not $DryRun) {
    Copy-Item $pkgJsonPath $backupPath -Force
    $json | ConvertTo-Json -Depth 100 | Set-Content $pkgJsonPath -Encoding utf8
    Say "已写入（备份 $backupPath）"

    if (-not $SkipInstall) {
        $dsh = Get-Command dsh -ErrorAction SilentlyContinue
        if ($dsh) { & dsh plugin --profile $Profile install } else { Say "请手动执行：pnpm install（目录 $(Join-Path $DshHome "profiles\$Profile")）" }
    }
}

Say "`n完成。重启 dsh web 后生效。题卡目录未删除：$(Join-Path $DshHome 'ctf')"
