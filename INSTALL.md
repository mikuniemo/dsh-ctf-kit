# DSH 安全模式层 · 安装说明（v0.3.0）

把「安全测试」与「CTF」两个模式装进任意一台 DSH 上。**两个小包，零第三方依赖**。

- `@local/dsh-security-modes`（~20 KB）— 声明 `security` 与 `ctf` 两个 preset：31 处引用全是 dsh 自带插件，不联网、不查 registry
- `@local/dsh-ctf-board`（~42 KB）— 题板视图：视图栏「CTF」页签 + ctf 模式头部状态条
- `ctf-template/` — 题卡目录格式样例，装完复制到 `<DSH_HOME>\ctf\_template\`

> **版本说明**：本仓库 `main` 分支即 **v0.3.0**（2026-11-02）——两个模式合一个 bundle，
> 新增 `-Migrate` 升级路径，security persona 在没有授权段时退化为"以用户声明范围为准"。
> 只有 `ctf` 模式的 v0.2.0 在 [`legacy/v0.2.0/`](legacy/v0.2.0/)，最初交付的 v0.1.0 在 [`legacy/v0.1.0/`](legacy/v0.1.0/)。

---

## 0. 30 秒判断

| 你的情况 | 结论 |
|---|---|
| dsh ≥ `0.2.1-rc.2`，profile 是 `web` | ✅ 直接装 |
| dsh 更老（0.2.0 或更早） | ❌ 先升级。preset 用到 `tool-schedule` / `workflow-ptc` / `planMode` 等较新字段，老版本会 `fiberPhase=failed` 且看不出原因 |
| 装过 v0.2.0 的 `@local/dsh-ctf-preset` | ⚠️ 用 `install.ps1 -Migrate`：它会把旧包从 dependencies / bundles 摘掉（不删文件），否则 `preset-ctf` 双声明会扰乱模式选择器 |
| 装过 `@local/dsh-security-presets` | ⚠️ 同上，`-Migrate`。那个 bundle 与本包声明的 preset id 完全重合，不能共存 |
| 只想抄解题方法论、不装插件 | ❌ 别装。直接读 `packages/dsh-security-modes/cordis.patch.yml` 里两个 `persona.prefix` 段落就够 |

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
2. 预检：包完整性、`preset id` 与旧版 bundle 的冲突（冲突时不加 `-Migrate` 会直接中止）
3. 两个包复制到 `<DSH_HOME>\local-bundles\` —— **特别注意**：不是留在解压目录，否则你哪天删了压缩包，`link:` 依赖就断链了
4. 把两份 `cordis.patch.yml` 里的 `__DSH_HOME__` 替换成本机绝对路径
5. 备份并改写 `<DSH_HOME>\profiles\web\package.json`（`dependencies` + `dsh.profile.bundles`）
6. 建 `<DSH_HOME>\ctf\_template\`（已存在则跳过，不覆盖你的题卡）
7. （可选）kit 旁若有 `skills-ctf\` 技能热包则复制到 `<DSH_HOME>\skills-ctf\`
8. `dsh plugin --profile web install` 落实 symlink

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
   - `<DSH_HOME>\profiles\web\package.json` 的 dependencies 里有 @local/dsh-security-modes 与 @local/dsh-ctf-board，
     且 dsh.profile.bundles 末尾有这两条；
   - 这两个包的 cordis.patch.yml 里不再出现字面量 `__DSH_HOME__`；
   - 用 `node -e "require('js-yaml')"` 之类手段确认两份 YAML 能解析（`!!js` 标记是合法的，别当成错误）；
4. 告诉我需要重启 dsh web，以及重启后怎么验证。
注意：如果我机器上已装 @local/dsh-ctf-preset 或 @local/dsh-security-presets，先停下来问我 —— 它们的 preset id 与本包重合，需要 -Migrate。
```

如果不想跑脚本、只想让 agent 用 `plugin_manager` 装，让它按这个顺序做（等价于脚本的 3/4/5 步）：

```
1. 建目录 <DSH_HOME>\local-bundles\，把 packages\dsh-security-modes 和 packages\dsh-ctf-board 复制进去
2. 把这两个包里 cordis.patch.yml 的 __DSH_HOME__ 替换成 <DSH_HOME> 绝对路径（只替换，别改别的）
3. plugin_manager action=install_bundle target=link:<DSH_HOME>/local-bundles/dsh-security-modes
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
Copy-Item .\packages\dsh-security-modes "$H\local-bundles\" -Recurse -Force
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
#      "@local/dsh-security-modes": "link:<H>/local-bundles/dsh-security-modes",
#      "@local/dsh-ctf-board":      "link:<H>/local-bundles/dsh-ctf-board"
#    "dsh".profile.bundles 数组末尾加两条：
#      "@local/dsh-security-modes",
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
3. **不要和另一个声明同名 preset 的 bundle 共存**（`preset-ctf` / `preset-security`）：同 id 双声明会让模式选择器错乱。
   从 v0.2.0 或 `@local/dsh-security-presets` 升级请用 `-Migrate`（只摘声明、不删文件）。
   回退：把 `profiles\<profile>\package.json.bak-<时间戳>` 覆盖回去，再 `dsh plugin --profile <profile> install`。
4. **`agent-instructions` 会读你自己的 `AGENTS.md`**（`maxBytes: 65536`）。你没有 AGENTS.md 也能跑，只是没有全局指令。
5. **技能层是可选的、不随包附带**：persona 期望 `<DSH_HOME>\skills-ctf\`（高频技能直挂）与 `<DSH_HOME>\skill-index\ctf.md`（长尾索引）两个可选落点。没有它们两个模式照常工作，只是解题时没有热技能可查、长尾兜底为空。想补知识层请自行聚合开源安全技能库（**逐个核对上游许可**再分发）。
6. **本 kit 不带任何 MCP**（Yakit / Burp 等）。两个模式本身不需要，需要时自己配。
7. **`security` 模式不内建授权段**：`authorization-scope` 与参数闸门都是 Host 级插件，由各自 bundle 安装。
   装了它们，本会话上方就有授权声明段；没装，persona 退化为"以你在对话里声明的范围为准"——规则仍然生效，只是没有执行层强制。
7. **dsh 版本敏感**：社区 rc 之间 preset schema 有变动。升级 dsh 后如果 CTF 模式消失，先 `--dump-config` 确认 patch 行还在，再看启动日志里的 `fiberPhase=failed`。
8. **v0.1.0 → v0.2.0 的差异**只有 patch 文本与文档：代码文件（`index.js` / `client.js` / `package.json` 除版本号）两版字节一致，从 v0.1.0 升级只需按上面任一方式重装覆盖。

---

## 7. 这个包里没有的东西（隐私说明）

不含：任何 API key / 凭据、任何会话记录、任何题卡或 flag、任何日志、任何靶场 IP / 赛事 URL。
`ctf-template/` 里的示例已脱敏（`127.0.0.1:8080`、`example.com`、`flag{...}`）。
`install.ps1` / `uninstall.ps1` 只读写上面列出的那些路径。
仓库不含知识层（技能库 / 技能索引 / 路由表）——那些是聚合而来的第三方数据，另有许可问题，不随本仓库分发。

## 8. 可选知识层（不随本仓库分发）

本包只装"模式"。v0.1.0 时代曾附带过一个 1,478 技能的知识层交付包，**现已不再分发**（第三方技能
聚合件的许可核对成本高，且含可能触发杀软的样本文件）。现状：

- 没有 `<DSH_HOME>\skills-ctf\` 时，模式裸跑，一切正常，只是 `skill` 工具目录里没有热技能；
- 想要知识层：从你信任的开源安全技能库自行聚合，放进 `<DSH_HOME>\skills-ctf\`（每技能一个目录、
  含 `SKILL.md`），再为长尾建一份 `<DSH_HOME>\skill-index\ctf.md` 索引即可，无需改本包任何代码。
