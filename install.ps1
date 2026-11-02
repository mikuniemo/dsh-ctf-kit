#Requires -Version 7.0
<#
.SYNOPSIS
    安装 DSH 安全模式层（@local/dsh-security-modes + @local/dsh-ctf-board）v0.3.0。

.DESCRIPTION
    做的事：
      1) 定位 DSH_HOME（-DshHome，其次 $env:DSH_HOME，其次 $HOME\.dsh）
      2) 预检：包的完整性、占位符、preset id 与既有 bundle 的冲突
      3) 把两个包复制到 <DSH_HOME>\local-bundles\（放进 DSH_HOME 内部，避免源目录被删导致 link 断链）
      4) 把包内 cordis.patch.yml 的 __DSH_HOME__ 占位符替换成本机绝对路径
      5) 备份并修改 <DSH_HOME>\profiles\<Profile>\package.json（dependencies + dsh.profile.bundles）
      6) 建 <DSH_HOME>\ctf\_template\（已存在则跳过）
      7) 可选：若 kit 旁有 skills-ctf\ 技能热包目录，复制到 <DSH_HOME>\skills-ctf\
      8) 跑 dsh plugin --profile <Profile> install 落实依赖

    不会碰：任何凭据文件、任何已有插件（除 -Migrate 明确迁移的旧包）、任何会话/账目/日志数据。

.PARAMETER DshHome
    DSH 家目录。默认 $env:DSH_HOME，再退到 $HOME\.dsh。

.PARAMETER Profile
    目标 profile，默认 web。

.PARAMETER DryRun
    只打印将要做什么，不写任何文件。

.PARAMETER SkipInstall
    跳过最后的 pnpm 安装步骤（只改文件，之后自己跑）。

.PARAMETER Migrate
    允许迁移：若已装 v0.2.x 的 @local/dsh-ctf-preset 或旧 @local/dsh-security-presets，
    先把它们从 dependencies / bundles 里摘掉（文件副本保留在原地，仅解除装载）。

.EXAMPLE
    pwsh -File .\install.ps1 -DryRun
    pwsh -File .\install.ps1
    pwsh -File .\install.ps1 -Migrate          # 从 v0.2.0 / 本地 security-presets 升级过来
    pwsh -File .\install.ps1 -DshHome 'C:\Users\me\.dsh'
#>
[CmdletBinding()]
param(
    [string]$DshHome,
    [string]$Profile = 'web',
    [switch]$DryRun,
    [switch]$SkipInstall,
    [switch]$Migrate
)

$ErrorActionPreference = 'Stop'
$kit = Split-Path -Parent $MyInvocation.MyCommand.Path
$packages = @('dsh-security-modes', 'dsh-ctf-board')
$legacyNames = @('@local/dsh-ctf-preset', '@local/dsh-security-presets')

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

Step '3) 预检 preset id 冲突与旧版迁移'
$json = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$legacyFound = @()
foreach ($n in $legacyNames) {
    if ($json.dependencies.PSObject.Properties[$n]) { $legacyFound += $n }
}
$conflict = $false
if ($legacyFound.Count -gt 0) {
    Say ("  发现旧版声明：{0}" -f ($legacyFound -join ', ')) -ForegroundColor Yellow
    Say '    它们声明的 preset id（ctf / security）与本包重合，同时装载会让模式选择器错乱。' -ForegroundColor Yellow
    if ($Migrate) {
        Say '    -Migrate 已指定：将从 dependencies / bundles 摘掉旧包（不删文件）。'
    } else {
        $conflict = $true
    }
}
foreach ($p in $packages) {
    $name = "@local/$p"
    $already = $json.dependencies.PSObject.Properties[$name]
    if ($already) { Say "  已装 $name ($($already.Value))，将刷新文件与占位符，不重复加依赖" }
}
if ($conflict -and -not $DryRun) {
    throw 'preset id 冲突：请加 -Migrate 迁移旧包，或先手动卸载旧 bundle 后重跑'
}

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
if ($legacyFound.Count -gt 0 -and $Migrate) { Say "  - 摘掉旧版：$($legacyFound -join ', ')" }
$backupPath = "$pkgJsonPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Say "  备份 -> $backupPath"
if (-not $DryRun) {
    Copy-Item $pkgJsonPath $backupPath -Force

    if ($Migrate) {
        foreach ($n in $legacyFound) {
            if ($json.dependencies.PSObject.Properties[$n]) { $json.dependencies.PSObject.Properties.Remove($n) }
        }
        $json.dsh.profile.bundles = @($json.dsh.profile.bundles | Where-Object { $legacyFound -notcontains $_ })
    }

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

Step '6.5) 可选：skills-ctf 技能热包（本仓库默认不含）'
$skillsPayload = Join-Path $kit 'skills-ctf'
$skillsDst = Join-Path $DshHome 'skills-ctf'
if (Test-Path $skillsPayload) {
    Say "  发现 $skillsPayload  ->  $skillsDst"
    if (-not $DryRun) {
        if (Test-Path $skillsDst) {
            Say '    目标已存在，合并复制（同名文件覆盖，不删除已有技能）'
            Copy-Item "$skillsPayload\*" $skillsDst -Recurse -Force
        } else {
            Copy-Item $skillsPayload $skillsDst -Recurse -Force
        }
    }
} else {
    Say '  kit 旁没有 skills-ctf\ 目录，跳过。'
    Say '  说明：没有技能热包两个模式照样能跑（技能层为空不报错）；'
    Say '  persona 期望的 <DSH_HOME>\skills-ctf 与 <DSH_HOME>\skill-index\ctf.md 属可选知识层，自行按需补。'
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
   2. 打开 Web GUI（默认 http://127.0.0.1:3080），新建会话，模式选择器里应出现「安全测试」与「CTF」
   3. 进 CTF 模式，视图栏应多出「CTF」页签；题板空态正常（还没建题）
      HTTP 自检：GET http://127.0.0.1:3080/dsh-ctf-board/summary  → 应返回 JSON
   4. 占位符自检（应无输出）：
      Select-String -Path "$bundlesRoot\*\cordis.patch.yml" -Pattern '__DSH_HOME__'
   5. 首个赛事：建 $DshHome\ctf\<项目名>\_project.json，并写 _current.json 指向它

 回滚：
   pwsh -File .\uninstall.ps1
"@