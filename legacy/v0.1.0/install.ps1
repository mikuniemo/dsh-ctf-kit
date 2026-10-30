#Requires -Version 7.0
<#
.SYNOPSIS
    安装 DSH CTF 模式包（@local/dsh-ctf-preset + @local/dsh-ctf-board）。

.DESCRIPTION
    做的事：
      1) 定位 DSH_HOME（-DshHome，其次 $env:DSH_HOME，其次 $HOME\.dsh）
      2) 把两个包复制到 <DSH_HOME>\local-bundles\（放进 DSH_HOME 内部，避免源目录被删导致 link 断链）
      3) 把包内 cordis.patch.yml 的 __DSH_HOME__ 占位符替换成本机绝对路径
      4) 备份并修改 <DSH_HOME>\profiles\<Profile>\package.json（dependencies + dsh.profile.bundles）
      5) 建 <DSH_HOME>\ctf\_template\（已存在则跳过）
      6) 跑 dsh plugin --profile <Profile> install 落实 symlink

    不会碰：任何凭据文件、任何已有插件、任何会话/账目/日志数据。

.PARAMETER DshHome
    DSH 家目录。默认 $env:DSH_HOME，再退到 $HOME\.dsh。

.PARAMETER Profile
    目标 profile，默认 web。

.PARAMETER DryRun
    只打印将要做什么，不写任何文件。

.PARAMETER SkipInstall
    跳过最后的 pnpm 安装步骤（只改文件，之后自己跑）。

.EXAMPLE
    pwsh -File .\install.ps1 -DryRun
    pwsh -File .\install.ps1
    pwsh -File .\install.ps1 -DshHome 'C:\Users\me\.dsh'
#>
[CmdletBinding()]
param(
    [string]$DshHome,
    [string]$Profile = 'web',
    [switch]$DryRun,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$kit = Split-Path -Parent $MyInvocation.MyCommand.Path
$packages = @('dsh-ctf-preset', 'dsh-ctf-board')

function Say($msg) { Write-Host $msg }
function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

Step '1) 定位 DSH_HOME'
if (-not $DshHome) { $DshHome = $env:DSH_HOME }
if (-not $DshHome) {
    $guess = Join-Path $HOME '.dsh'
    if (Test-Path $guess) { $DshHome = $guess }
}
if (-not $DshHome) {
    throw "找不到 DSH_HOME。请设置环境变量 DSH_HOME，或用 -DshHome <路径> 指定。"
}
if (-not (Test-Path $DshHome)) { throw "DSH_HOME 不存在：$DshHome" }
$DshHome = (Resolve-Path $DshHome).Path.TrimEnd('\')

$profileDir = Join-Path $DshHome "profiles\$Profile"
$pkgJsonPath = Join-Path $profileDir 'package.json'
if (-not (Test-Path $pkgJsonPath)) { throw "profile 不存在：$profileDir" }

Say "  DSH_HOME    : $DshHome"
Say "  profile     : $Profile"
Say "  package.json: $pkgJsonPath"

Step '2) 预检 kit 完整性'
foreach ($p in $packages) {
    $src = Join-Path $kit "packages\$p"
    if (-not (Test-Path (Join-Path $src 'package.json'))) { throw "kit 不完整，缺 $src\package.json" }
    if (-not (Test-Path (Join-Path $src 'cordis.patch.yml'))) { throw "kit 不完整，缺 $src\cordis.patch.yml" }
}
Say "  OK：$($packages -join ' / ')"

Step '3) 检查 preset id 冲突'
$json = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$conflict = $false
if ($json.dependencies.PSObject.Properties['@local/dsh-security-presets']) {
    Say '  !! 该 profile 已装 @local/dsh-security-presets，它同样声明了 preset id "ctf"' -ForegroundColor Yellow
    Say '     => 两者不可共存。请先卸载那个 bundle，或放弃本次安装。' -ForegroundColor Yellow
    $conflict = $true
}
foreach ($p in $packages) {
    $name = "@local/$p"
    $already = $json.dependencies.PSObject.Properties[$name]
    if ($already) { Say "  已装 $name ($($already.Value))，将刷新文件与占位符，不重复加依赖" }
}
if ($conflict -and -not $DryRun) { throw 'preset id 冲突破坏模式选择器，安装中止（确认要装请先卸载 dsh-security-presets）' }

$bundlesRoot = Join-Path $DshHome 'local-bundles'
Step "4) 复制包到 $bundlesRoot"
foreach ($p in $packages) {
    $src = Join-Path $kit "packages\$p"
    $dst = Join-Path $bundlesRoot $p
    Say "  $src  ->  $dst"
    if ($DryRun) { continue }
    New-Item -ItemType Directory -Path $bundlesRoot -Force | Out-Null
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    Copy-Item $src $dst -Recurse -Force

    $patch = Join-Path $dst 'cordis.patch.yml'
    $text = [System.IO.File]::ReadAllText($patch)
    if ($text.Contains('__DSH_HOME__')) {
        $text = $text.Replace('__DSH_HOME__', $DshHome)
        [System.IO.File]::WriteAllText($patch, $text, (New-Object System.Text.UTF8Encoding($false)))
        Say '    占位符 __DSH_HOME__ 已替换'
    } else {
        Say '    警告：未发现占位符，可能是已替换过的副本' -ForegroundColor Yellow
    }
}

Step '5) 修改 profile package.json'
foreach ($p in $packages) {
    $name = "@local/$p"
    $spec = 'link:' + (Join-Path $bundlesRoot $p).Replace('\', '/')
    Say "  + dependency $name = $spec"
}
Say "  + bundles 追加 $($packages.Count) 条"
$backupPath = "$pkgJsonPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Say "  备份 -> $backupPath"
if (-not $DryRun) {
    Copy-Item $pkgJsonPath $backupPath -Force
    foreach ($p in $packages) {
        $name = "@local/$p"
        $spec = 'link:' + (Join-Path $bundlesRoot $p).Replace('\', '/')
        if (-not $json.dependencies.PSObject.Properties[$name]) {
            $json.dependencies | Add-Member -NotePropertyName $name -NotePropertyValue $spec
        } else {
            $json.dependencies.PSObject.Properties[$name].Value = $spec
        }
        $bundles = @($json.dsh.profile.bundles)
        if ($bundles -notcontains $name) { $bundles += $name }
        $json.dsh.profile.bundles = $bundles
    }
    $json | ConvertTo-Json -Depth 100 | Set-Content $pkgJsonPath -Encoding utf8
    Say '  已写入'
}

Step '6) 题卡目录'
$ctfRoot = Join-Path $DshHome 'ctf'
$tpl = Join-Path $ctfRoot '_template'
if (Test-Path $tpl) {
    Say "  已存在，跳过：$tpl"
} else {
    Say "  创建：$ctfRoot  +  _template\"
    if (-not $DryRun) {
        New-Item -ItemType Directory -Path $ctfRoot -Force | Out-Null
        Copy-Item (Join-Path $kit 'ctf-template') $tpl -Recurse -Force
        $readme = Join-Path $tpl 'README.md'
        if (Test-Path $readme) {
            $t = [System.IO.File]::ReadAllText($readme).Replace('__DSH_HOME__', $DshHome)
            [System.IO.File]::WriteAllText($readme, $t, (New-Object System.Text.UTF8Encoding($false)))
        }
    }
}

Step '7) 落实依赖（pnpm install）'
if ($SkipInstall -or $DryRun) {
    Say '  跳过（-SkipInstall / -DryRun）。稍后手动执行：'
    Say "    dsh plugin --profile $Profile install"
} else {
    $dsh = Get-Command dsh -ErrorAction SilentlyContinue
    if (-not $dsh) {
        Say '  未在 PATH 找到 dsh，请手动在 profile 目录执行：pnpm install' -ForegroundColor Yellow
        Say "    目录：$profileDir"
    } else {
        Say "  running: dsh plugin --profile $Profile install"
        & dsh plugin --profile $Profile install
        if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败（exit $LASTEXITCODE），package.json 备份在 $backupPath" }
    }
}

Step '完成'
Say @"
下一步：
  1. 重启 dsh web（bundle 与 patch 变更都需要重启，HMR 不覆盖）
     - 桌面快捷方式「DSH 重启」；或 kill 掉 dsh web 后重新启动
  2. 打开 Web GUI（默认 http://127.0.0.1:3080），新建会话，在模式选择器里确认出现「CTF」
  3. 进 CTF 模式后，视图栏应多出「CTF」页签；题板空态正常（还没建题）
     HTTP 自检：GET http://127.0.0.1:3080/dsh-ctf-board/summary  → 应返回 JSON
  4. 首个赛事：建 $DshHome\ctf\<项目名>\_project.json，并写 _current.json 指向它

回滚：
  pwsh -File .\uninstall.ps1
"@
