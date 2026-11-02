# dsh-ctf-kit

[DSH](https://www.npmjs.com/package/@deepseek-ai/dsh)（DeepSeek Harness）的 **CTF 解题模式**交付包：
一个独立 agent preset（`ctf`）+ 一个 Web 题板视图（`ctf-board`），两个小包、零第三方依赖。

> **只用于你有权测试的环境**（自有靶场 / 授权赛事 / 本地容器）。本包只是"解题纪律 + 执行通道 + 题板"，
> 不含任何攻击载荷、凭据或目标数据。

## 里面有什么

| 包 | 作用 |
|---|---|
| `@local/dsh-ctf-preset` | 声明 `ctf` 模式：解题纪律 persona（题卡落盘 / flag-first / 竞赛并行 / 技能先查后编）+ 与标准模式齐平的执行通道（pwsh/bash、jobs、subagent/workflow 并行、压缩放宽） |
| `@local/dsh-ctf-board` | Web 会话页新增「CTF」独立视图 + ctf 模式状态条：一题一卡（flag / 题解 / 错误 / 踩坑 / 历次会话），数据就是 `<DSH_HOME>\ctf\` 下的纯文件，不建第二份账本 |

29 处插件引用全部是 dsh 自带包（`@deepseek-ai/*`），不联网、不查 registry；装完重启 `dsh web` 即用。

## 两个版本

| 版本 | 位置 | 说明 |
|---|---|---|
| **v0.2.0**（当前） | 仓库根目录 | persona 增三条实测纪律（flag-first / contest fan-out / oracle-first）、`skills-ctf` 热技能直挂位、pruner 阈值放宽；两包版本号升 0.2.0 |
| **v0.1.0**（旧版存档） | [`legacy/v0.1.0/`](legacy/v0.1.0/) | 2026-10-30 交付的原始打包，功能为 v0.2.0 的子集；代码文件与 v0.2.0 字节一致，差异只在 patch 文本与文档 |

两版安装方式完全相同（见 [INSTALL.md](INSTALL.md)）。GitHub Release 里也挂了对应版本的 zip。

## 快速安装

```powershell
git clone https://github.com/mikuniemo/dsh-ctf-kit.git
cd dsh-ctf-kit
pwsh -File .\install.ps1 -DryRun     # 先干跑，看它要改什么
pwsh -File .\install.ps1             # 真装（自动改 profile 的 package.json 并落实 link）
# 重启 dsh web → 模式选择器出现「CTF」
```

三种装法（脚本 / 交给 AI agent / 纯手工）、验证清单、卸载、已知坑，全在 **[INSTALL.md](INSTALL.md)**。

## 不随仓库分发的东西

- **知识层**（技能库 / 技能索引）：CTF 模式可选挂 `<DSH_HOME>\skills-ctf\` 热技能目录与
  `<DSH_HOME>\skill-index\ctf.md` 长尾索引；没有它们模式照常工作。聚合第三方技能库有许可核对成本，
  请自行按需补（INSTALL.md §8）。
- **任何 MCP 配置**（Yakit / Burp 等）——CTF 模式本身不需要。
- 隐私与脱敏承诺见 INSTALL.md §7。

## 兼容性

- dsh `>= 0.2.1-rc.2`，node `^22.19.0 || >=24.0.0`
- ⚠️ 与 `@local/dsh-security-presets` **互斥**（两者都声明 `preset-ctf`，同时装会扰乱模式选择器；`install.ps1` 会预检中止）
- dsh 社区 rc 之间 preset schema 有过变动；装完模式不出现先看 `dsh --profile web --dump-config`

## License

[MIT](LICENSE)
