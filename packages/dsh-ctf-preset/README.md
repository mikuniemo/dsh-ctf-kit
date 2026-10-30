# @local/dsh-ctf-preset

把 **CTF 解题模式** 作为一个独立 bundle 交付。

- 只声明 **1 个 agent preset**（`id: ctf`，模式选择器里显示为「CTF」）。
- 29 处包引用 **全部是 `@deepseek-ai/*` 自带插件**，零第三方依赖、不联网、不查 registry。
- 无运行时代码（`index.js` 只有空 `apply`），价值全在 `cordis.patch.yml`。

## 挂载的内容

persona（解题纪律）+ agent-instructions + time-context；执行通道 pwsh/bash/fs/fs-search/jobs/schedule；
技能层 skill-filesystem（`customSkillDirs` 指向 `<DSH_HOME>\skills-ctf`）/tool-skill；目标与任务
goal/plan/todo/ask-user；检索 tool-web；产出 present；上下文压缩 compaction 三件套（pruner 阈值放宽
到 16384 字符，hexdump / 反汇编 / 爆破日志不剪成残废）；委派 delegation 六件套（含 fork 与 workflow）；
插件管理两个工具默认禁用。

设计要点来自实测教训：**"快"不靠砍工具，靠纪律**。22 场 CTF 会话里，少挂 `tool-jobs` 造成 3 次
`no job controller` + 8 次超时，少挂 `agent-instructions` 造成 22/22 场读不到 AGENTS.md。

persona 里固化了几条实测换来的纪律：

- **Challenge board（强制）**：每题开工先读题卡目录，`meta.json` / `runs\*.json` / `solve.md` 按约定落盘。
- **Flag-first**：flag 样式串一旦出现在任何工具输出，下一条回复**首行**先给 flag 原文（未验证标"候选"），
  验证只改标签、绝不延迟首次输出。
- **Contest fan-out**：多题并行 = 一题一个全新 `subagent`，父会话合并题卡并负责所有平台提交。
- **Oracle first, fuzz second**：先确立哪个信号在变（status/size/headers/timing），再谈爆破。
- **技能先查后编**：热技能直挂会话目录，长尾走 `<DSH_HOME>\skill-index\ctf.md` 索引。

## 技能层（可选，不随本包附带）

persona 期望两个可选数据落点，**本仓库不附带任何技能数据**：

- `<DSH_HOME>\skills-ctf\` — 高频 CTF 技能直挂目录（pwn / crypto / reverse / forensics / web / misc …）。
  没有它：`skill-filesystem` 扫到空目录，不报错，只是会话技能目录里没有热技能可 `skill` 加载。
- `<DSH_HOME>\skill-index\ctf.md` — 长尾分类索引。没有它：persona 里"读索引兜底"那步自然跳过。

想要知识层可以自己聚合（上游开源安全技能库很多，注意逐个核对许可），或只装模式裸跑——模式本体
不依赖技能数据。

## 安装期占位符

`cordis.patch.yml` 里 persona 正文的题卡路径写成 `__DSH_HOME__\ctf\...`（含技能目录共 7 处）。
安装时必须替换成本机 `DSH_HOME` 绝对路径（`install.ps1` 会自动做）。忘了替换不会崩，
只是题卡写到了不存在的目录。

## 不要与 @local/dsh-security-presets 同时安装

那个 bundle 里也声明了 `preset-ctf`，preset id 相同 → 重复注册会扰乱模式选择器。
想要 security（授权渗透/红队）模式就装那个，想要纯 CTF 就装这个，二选一。
（`install.ps1` 会预检这个冲突并中止。）

## 前提

- dsh `>= 0.2.1-rc.2`
- node `^22.19.0 || >=24.0.0`
- 不需要本仓库任何其它东西
