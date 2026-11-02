# dsh-ctf-kit

[DSH](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）的**安全模式层**交付包：
两个 agent preset（`security` 安全测试 / `ctf` 解题）+ 一个 Web 题板视图（`ctf-board`）。
两个小包、零第三方依赖。

> **只用于你有权测试的环境**（自有靶场 / 授权赛事 / 本地容器 / 授权 engagements）。
> 本包只是"模式声明 + 执行通道 + 题板"，**不含**任何攻击载荷、凭据、目标数据或技能库。

> v0.3.0 起本仓同时提供 `security` 与 `ctf` 两个 preset。仓库名沿用 `dsh-ctf-kit` 是为了老用户升级无感；
> 若你在找"只有 CTF 模式"的版本，用 [`legacy/v0.2.0/`](legacy/v0.2.0/)。

## 里面有什么

| 包 | 作用 |
|---|---|
| `@local/dsh-security-modes` | 声明两个 agent preset：`security`（授权渗透 / 红队 / 检测验证，标准流程轴）与 `ctf`（pwn / rev / crypto / web / misc / forensics，解题纪律 + 与标准模式齐平的执行通道） |
| `@local/dsh-ctf-board` | Web 会话页新增「CTF」独立视图 + ctf 模式状态条：一题一卡（flag / 题解 / 错误 / 踩坑 / 历次会话），数据就是 `<DSH_HOME>\ctf\` 下的纯文件，不建第二份账本 |

31 处插件引用全部是 dsh 自带包（`@deepseek-ai/*`，另加 `cordis:group`），不联网、不查 registry；
装完重启 `dsh web` 即用。

## 两个模式的区别

| | `security` | `ctf` |
|---|---|---|
| 定位 | 授权渗透 / 红队 / 检测验证 | CTF 解题 |
| 工具 | 标准集 + 委派分组 | 标准集的**超集**（含 jobs / schedule / goal / plan-mode / subagent-fork） |
| 压缩阈值 | 8 KB 剪枝（渗透输出长） | 16 KB 剪枝（hexdump / 反汇编更长） |
| 纪律 | RoE 优先、目标白名单 | flag-first、oracle-first、题卡落盘、竞赛并行 |

`ctf` **不是**精简模式。实测教训写在 patch 注释里：砍掉 `tool-jobs` 会直接 `no job controller`，
砍掉 `agent-instructions` 就拿不到 `AGENTS.md`。

## 三个版本

| 版本 | 位置 | 说明 |
|---|---|---|
| **v0.3.0**（当前） | 仓库根目录 | 新增 `security` preset，两模式合一个 bundle；新增 `-Migrate` 升级路径；security persona 在**没有**授权段时退化为"以用户声明范围为准" |
| v0.2.0 | [`legacy/v0.2.0/`](legacy/v0.2.0/) | 只有 `ctf` preset（`@local/dsh-ctf-preset`），包名不同，**不要与 v0.3.0 同时装** |
| v0.1.0 | [`legacy/v0.1.0/`](legacy/v0.1.0/) | 2026-10-30 最初交付，v0.2.0 的子集 |

## 快速安装

```powershell
git clone https://github.com/mikuniemo/dsh-ctf-kit.git
cd dsh-ctf-kit
pwsh -File .\install.ps1 -DryRun              # 先干跑，看它要改什么
pwsh -File .\install.ps1                      # 真装
pwsh -File .\install.ps1 -Migrate             # 从 v0.2.0 / 旧 security-presets 升级过来
# 重启 dsh web → 模式选择器出现「安全测试」和「CTF」
```

不给 git 也能装——让 agent 直接调插件管理器：

```text
plugin_manager  action: install_bundle
                target: "github:mikuniemo/dsh-ctf-kit#path:packages/dsh-security-modes"
```

（该 spec 形态已实测可用：pnpm 会把 GitHub 子目录装成 `@local/dsh-security-modes@0.3.0`。
注意这种方式**不做** `__DSH_HOME__` 占位符替换，技能/题卡路径会停在字面量上——需要那些路径就还是用 `install.ps1`。）

三种装法（脚本 / 交给 AI agent / 纯手工）、验证清单、卸载、已知坑，全在 **[INSTALL.md](INSTALL.md)**。

## 不随仓库分发的东西

按设计，这三类**不进仓库**（体积或许可原因），需要时自备：

- **知识层**（`skills-ctf\` 热技能目录 / `skill-index\ctf.md` 长尾索引）：没有它们模式照常工作。
  聚合第三方技能库有许可核对成本，请自行按需补（INSTALL.md §8）。
- **任何 MCP 配置**：两个模式本身不需要 MCP。想接 Yakit / Burp / Ghidra / Kali，自己配。
- **任何安全工具二进制**：工具链与许可各自独立（IDA / Burp 属商业授权，不可重分发）。

隐私与脱敏承诺见 INSTALL.md §7。

## 兼容性

- dsh `>= 0.2.1-rc.2`，node `^22.19.0 || >=24.0.0`
- v0.3.0 的两个 preset id（`security` / `ctf`）在本 bundle 内唯一；
  **不要**再装另一个声明同名 preset 的 bundle（同 id 双声明会扰乱模式选择器）
- dsh 社区 rc 之间 preset schema 有过变动；装完模式不出现先看 `dsh --profile web --dump-config`

## License

[MIT](LICENSE)