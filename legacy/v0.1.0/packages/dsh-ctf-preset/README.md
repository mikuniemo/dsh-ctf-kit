# @local/dsh-ctf-preset

把 **CTF 解题模式** 作为一个独立 bundle 交付。

- 只声明 **1 个 agent preset**（`id: ctf`，模式选择器里显示为「CTF」）。
- 29 处包引用 **全部是 `@deepseek-ai/*` 自带插件**，零第三方依赖、不联网、不查 registry。
- 无运行时代码（`index.js` 只有空 `apply`），价值全在 `cordis.patch.yml`。

## 挂载的内容

persona（解题纪律）+ agent-instructions + time-context；执行通道 pwsh/bash/fs/fs-search/jobs/schedule；
技能层 skill-filesystem/tool-skill；目标与任务 goal/plan/todo/ask-user；检索 tool-web；产出 present；
上下文压缩 compaction 三件套；委派 delegation 六件套（含 fork 与 workflow）；插件管理两个工具默认禁用。

设计要点来自实测教训：**"快"不靠砍工具，靠纪律**。22 场 CTF 会话里，少挂 `tool-jobs` 造成 3 次
`no job controller` + 8 次超时，少挂 `agent-instructions` 造成 22/22 场读不到 AGENTS.md。

## 安装期占位符

`cordis.patch.yml` 里 persona 正文的题卡路径写成 `__DSH_HOME__\ctf\...`。
安装时必须替换成本机 `DSH_HOME` 绝对路径（`install.ps1` 会自动做）。忘了替换不会崩，
只是题卡写到了不存在的目录。

## 不要与 @local/dsh-security-presets 同时安装

那个 bundle 里也声明了 `preset-ctf`，preset id 相同 → 重复注册会扰乱模式选择器。
想要 security（授权渗透/红队）模式就装那个，想要纯 CTF 就装这个，二选一。

## 前提

- dsh `>= 0.2.1-rc.2`
- node `^22.19.0 || >=24.0.0`
- 不需要本仓库任何其它东西
