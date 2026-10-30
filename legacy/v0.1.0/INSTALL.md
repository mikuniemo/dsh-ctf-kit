# DSH CTF 模式包 · 安装说明

把「CTF 解题模式」装进任意一台 DSH 上。**两个小包，零第三方依赖**。

- `@local/dsh-ctf-preset`（~11 KB）— 声明 `ctf` 模式：29 处引用全是 dsh 自带插件，不联网、不查 registry
- `@local/dsh-ctf-board`（~42 KB）— 题板视图：视图栏「CTF」页签 + ctf 模式头部状态条
- `ctf-template/` — 题卡目录格式样例，装完复制到 `<DSH_HOME>\ctf\_template\`

---

## 0. 30 秒判断

| 你的情况 | 结论 |
|---|---|
| dsh ≥ `0.2.1-rc.2`，profile 是 `web` | ✅ 直接装 |
| dsh 更老（0.2.0 或更早） | ❌ 先升级。preset 用到 `tool-schedule` / `workflow-ptc` / `planMode` 等较新字段，老版本会 `fiberPhase=failed` 且看不出原因 |
| 已经装了 `@local/dsh-security-presets` | ⚠️ 先卸它。那个 bundle 也声明了 `preset-ctf`，id 相同会扰乱模式选择器 |
| 只想抄解题方法论、不装插件 | ❌ 别装。直接读 `packages/dsh-ctf-preset/cordis.patch.yml` 里 `persona.prefix` 那段（约 40 行英文纪律）就够 |

装之前请先确认能跑 `dsh --version`，并知道自己的 `DSH_HOME` 在哪（`echo $env:DSH_HOME`；不设就是 `~\.dsh`）。

---

## 1. 方式 A：跑脚本（推荐）

```powershell
# 先干跑一遍看它要动什么，不写任何文件
pwsh -File .\install.ps1 -DryRun

# 确认无误后真装
pwsh -File .\install.ps1
```

脚本做的事（`install.ps1` 头部注释里有完整说明）：

1. 定位 `DSH_HOME`（`-DshHome` → `$env:DSH_HOME` → `$HOME\.dsh`）
2. 两个包复制到 `<DSH_HOME>\local-bundles\` —— **特别注意**：不是留在解压目录，否则你哪天删了压缩包，`link:` 依赖就断链了
3. 把两份 `cordis.patch.yml` 里的 `__DSH_HOME__` 替换成本机绝对路径
4. 备份并改写 `<DSH_HOME>\profiles\web\package.json`（`dependencies` + `dsh.profile.bundles`）
5. 建 `<DSH_HOME>\ctf\_template\`（已存在则跳过，不覆盖你的题卡）
6. `dsh plugin --profile web install` 落实 symlink

不会碰凭据、不会碰已有插件、不会碰会话/账目/日志。

**重启 dsh web** 后生效（bundle 与 patch 变更都不走 HMR）。

---

## 2. 方式 B：让你的 AI agent 装

把下面这段直接贴给你的 DSH agent（把 `<解压路径>` 换成实际路径）：

```
我有一个本地 DSH 插件包，解压在 <解压路径>。
请按该目录下的 INSTALL.md 帮我安装 CTF 模式，要求：

1. 先 dry-run：`pwsh -File "<解压路径>\install.ps1" -DryRun`，给我看你打算改哪些文件；
2. 等我确认后执行正式安装（去掉 -DryRun）；
3. 安装完自查：
   - `<DSH_HOME>\profiles\web\package.json` 的 dependencies 里有 @local/dsh-ctf-preset 与 @local/dsh-ctf-board，
     且 dsh.profile.bundles 末尾有这两条；
   - 这两个包的 cordis.patch.yml 里不再出现字面量 `__DSH_HOME__`；
   - 用 `node -e "require('js-yaml')"` 之类手段确认两份 YAML 能解析（`!!js` 标记是合法的，别当成错误）；
4. 告诉我需要重启 dsh web，以及重启后怎么验证。
注意：如果我机器上已装 @local/dsh-security-presets，先停下来问我 —— preset id 会冲突。
```

如果不想跑脚本、只想让 agent 用 `plugin_manager` 装，让它按这个顺序做（等价于脚本的 2/3/4 步）：

```
1. 建目录 <DSH_HOME>\local-bundles\，把 packages\dsh-ctf-preset 和 packages\dsh-ctf-board 复制进去
2. 把这两个包里 cordis.patch.yml 的 __DSH_HOME__ 替换成 <DSH_HOME> 绝对路径（只替换，别改别的）
3. plugin_manager action=install_bundle target=link:<DSH_HOME>/local-bundles/dsh-ctf-preset
4. plugin_manager action=install_bundle target=link:<DSH_HOME>/local-bundles/dsh-ctf-board
5. 把 ctf-template 复制到 <DSH_HOME>\ctf\_template\（若不存在）
6. 重启 dsh web
```

> ⚠️ CTF 模式里 `tool-plugin-manager` / `tool-plugin-market` 是 **disabled: true**（跟标准模式一致）。
> 所以**必须在普通模式里装完再用 CTF 模式**，别进 CTF 模式里装。

---

## 3. 方式 C：纯手工（不跑脚本、不用 agent）

```powershell
$H = $env:DSH_HOME            # 或你的实际路径
$P = "$H\profiles\web"

# 1) 放包（放 DSH_HOME 里面，别放临时目录）
New-Item -ItemType Directory "$H\local-bundles" -Force
Copy-Item .\packages\dsh-ctf-preset "$H\local-bundles\" -Recurse -Force
Copy-Item .\packages\dsh-ctf-board  "$H\local-bundles\" -Recurse -Force

# 2) 替换占位符（两份文件）
Get-ChildItem "$H\local-bundles" -Recurse -Filter cordis.patch.yml | ForEach-Object {
    (Get-Content $_.FullName -Raw).Replace('__DSH_HOME__', $H) | Set-Content $_.FullName -NoNewline -Encoding utf8
}

# 3) 题卡模板
New-Item -ItemType Directory "$H\ctf" -Force
Copy-Item .\ctf-template "$H\ctf\_template" -Recurse -Force

# 4) 改 package.json（手改也行，下面是最小改动）
#    "dependencies" 里加两条：
#      "@local/dsh-ctf-preset": "link:<H>/local-bundles/dsh-ctf-preset",
#      "@local/dsh-ctf-board":  "link:<H>/local-bundles/dsh-ctf-board"
#    "dsh".profile.bundles 数组末尾加两条：
#      "@local/dsh-ctf-preset",
#      "@local/dsh-ctf-board"

# 5) 落实
dsh plugin --profile web install
```

---

## 4. 验证清单（按顺序做）

1. **重启 dsh web**。bundle 列表、bundle patch 都只在启动时读取。
2. **模式选择器里出现「CTF」**（`order: 11`，排在其它预设之后）。没出现 → 看 `dsh --profile web --dump-config | Select-String ctf` 有没有 `preset-ctf` 行；没有就是 bundle 没进 `dsh.profile.bundles`。
3. **进 CTF 模式，视图栏多出「CTF」页签**。打不开页签 → `GET /dsh-ctf-board/summary` 看是不是 404（那就是 board bundle 没挂上），返回 `{"ok":true,"exists":false}` 是**正常**（还没建题）。
4. **题卡落盘**：在 CTF 模式里让 agent 建一个测试赛事目录，确认它写的路径是你本机的 `<DSH_HOME>\ctf\...`（不是别人的路径）。写错了 = 步骤 2 的占位符没替换。

---

## 5. 卸载

```powershell
pwsh -File .\uninstall.ps1 -RemoveFiles     # -RemoveFiles 连 local-bundles 里的副本一起删
```

题卡目录 `<DSH_HOME>\ctf` **不会**被删。

---

## 6. 边界与已知坑

1. **persona 写死的题卡纪律是强制的** —— 「Challenge board (mandatory, no exceptions)」那段要求每次开工先读 `_current.json`、写 `meta.json` / `runs\*.json` / `solve.md`。不想要这套落盘规则，就编辑 `packages/dsh-ctf-preset/cordis.patch.yml` 里 persona 的 `## Challenge board` 整段删掉再装。
2. **`__DSH_HOME__` 忘记替换不会崩**：题板退化成空态（`exists:false`），但 persona 会把题卡写到错的路径。装完务必 `Select-String -Path <DSH_HOME>\local-bundles\*\cordis.patch.yml -Pattern '__DSH_HOME__'` 确认无残留。
3. **不要和 `@local/dsh-security-presets` 共存**（preset id 都是 `ctf`）。
4. **`agent-instructions` 会读你自己的 `AGENTS.md`**（`maxBytes: 65536`）。你没有 AGENTS.md 也能跑，只是没有全局指令。
5. **技能层是空的**：`skill-filesystem` 会扫你的 skills 目录，没有技能库不报错、也没有技能可查。要 1,478 个安全技能的知识层，见 §8。
6. **本 kit 不带任何 MCP**（Yakit / Burp 等）。CTF 模式本身不需要，需要时自己配。
7. **dsh 版本敏感**：社区 rc 之间 preset schema 有变动。升级 dsh 后如果 CTF 模式消失，先 `--dump-config` 确认 patch 行还在，再看启动日志里的 `fiberPhase=failed`。
8. **`dsh-ctf-board` 的 `index.js` 注释里 VERSION 是 `0.2.0`、`package.json` 是 `0.1.0`** —— 原包就这样，不影响功能，别以为是打错包。

---

## 7. 这个包里没有的东西（隐私说明）

不含：任何 API key / 凭据、任何会话记录、任何题卡或 flag、任何日志、任何靶场 IP / 赛事 URL。
`ctf-template/` 里的示例已脱敏（`127.0.0.1:8080`、`example.com`、`flag{...}`）。
`install.ps1` / `uninstall.ps1` 只读写上面列出的那些路径。

## 8. 可选：知识层（1,478 个安全技能，约 36 MB 压缩包）

本包只装"模式"。要解题时能查的**知识层**（1,478 个已索引技能 + 27 份分类索引 + 58 条路由 +
常驻 `skill-router`），另取配套包 **`dsh-ctf-kit-knowledge-0.1.0.zip`**，两包相互独立：

```powershell
# 解压知识包后：
pwsh -File .\install-knowledge.ps1 -DryRun
pwsh -File .\install-knowledge.ps1
# 纯数据安装：不改 profile、不需要 pnpm，装完重启 dsh web 即可
```

知识层落点：技能库 → `<DSH_HOME>\skill-library\`（**故意不放 `skills\` 下**，否则 1,478 个技能
全部变成常驻技能冲垮上下文）；常驻只挂 1 个 `skill-router`；索引 → `<DSH_HOME>\skill-index\`；
路由表 → `<DSH_HOME>\capabilities\routing.json`。安装器自动把索引里的路径改写成本机位置并自检。

再分发提醒：技能库聚合自 18 个上游仓库（MIT 285 / Apache-2.0 1,074 / CC 43 / GPL-3.0 42 /
UNKNOWN 103，按单元计），公开发布前按包内 `MANIFEST.json` 逐个核对许可；且这是进攻性安全
知识库，只给可信、有授权环境的人。
