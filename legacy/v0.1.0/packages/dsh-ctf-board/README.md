# @local/dsh-ctf-board

CTF 题板：会话视图栏里新增一个「CTF」独立视图，一题一卡展示 flag / 题解 / 错误 / 踩坑；
进入 ctf 模式后，会话头部还会多一条状态条（解出 / flag / 未解 / 踩坑）。

- 数据**只读**题卡目录（`<DSH_HOME>\ctf\<项目>\<题名>\` 下的 `meta.json` / `runs\*.json` / `solve.md`），
  不新造账本，不写任何业务数据（只写自己的诊断日志）。
- 不硬注入服务：`agents` / `agentPresets` / `webServer` 在 `apply` 里惰性取，取不到就降级
  （模式未知 → 状态条不显示，视图照常可开）。
- 题卡目录不存在时返回 `exists: false`，面板显示空态，不报错。

## 安装期占位符

`cordis.patch.yml` 里 `rootDir` / `sessionsRoot` / `logDir` 写成 `__DSH_HOME__\...`，
安装时替换成本机 `DSH_HOME`（`install.ps1` 自动做）。

## HTTP 端点

- `/dsh-ctf-board/summary` — 题板数据（JSON）
- `/dsh-ctf-board/mode` — 当前模式
- `/dsh-ctf-board/report` — 上报入口

## 前提

- dsh `>= 0.2.1-rc.2`，web 平台（依赖 `@deepseek-ai/dsh-client-ui-conversation` 座位）
- node `^22.19.0 || >=24.0.0`
