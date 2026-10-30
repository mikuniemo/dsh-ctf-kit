# @local/dsh-ctf-board

CTF 题板。给 DSH Web 会话页加一个**独立视图**和一条 **ctf 专用状态条**，把"这一天打了哪些题 / 什么 flag / 有没有 wp / 卡在哪"从会话正文里救出来。

## 为什么

实测一个比赛日做了 33 道题：flag 散在会话文本里、wp 只落了两篇、错误和坑只进了记忆库标题；结果是同一道题在 11 个会话里从零重推，同一个 flag 在会话间抄出 4 种写法、平台判错 9 次。**缺的不是能力，是可查的题卡。**

## 做了什么

| 座位 | 内容 |
|---|---|
| `conversation.view`（id `ctf`，order 40） | 视图栏「对话 / 轨迹 / 上下文 / 编队 / **CTF**」里的 CTF 独立视图：一题一卡，按日期分组 |
| `conversation.session.header.actions`（id `ctf-board-chips`，order 18） | **只在 ctf 模式**显示的状态条：解出 / flag / 未解 / 踩坑（今天口径） |

卡片字段：题名、状态、平台、靶机/端口、附件名、flag（可复制）、flag 来源、wp 路径（可复制）、平台提交结果（accepted/incorrect/次数）、**错误**（原样折叠）、**踩坑**（原样折叠）、**历次会话**（每次会话一条：日期+会话 id+状态+结论）。

## 数据模型：项目 → 题目 → 会话

```
<DSH_HOME>\ctf\
  _current.json                      当前项目指针 {"project":"<项目目录名>"}
  _template\                         格式样例（`_` 开头跳过）
  <项目>\
    _project.json                    项目级：{name, platform, url, startedAt, status, dirs[], note}
    <题名>\
      meta.json                      题目级事实（status / flag / wp / submission / errors / pitfalls）
      runs\<日期>-<时间>-<会话id前8>.json   一次会话一条
      solve.md                       最终题解（多会话合并，可缺）
```

- **一个项目 = 一个比赛/一次委托**：不同比赛的题卡不混在一起，这是硬要求。
- 一题目录、多会话记录：同一道题被 N 个会话做过，`runs\` 里就有 N 条，卡片上能看到每次卡在哪。
- 目录即事实源：**不新建账本**，没有第二份需要同步的数据。
- `_` 开头的目录被忽略。
- 缺字段一律降级显示，一个坏文件不会让整块面板失效。

agent 按 **ctf 预设 persona** 里的《Challenge board》段落直接写这些文件——**没有 `ctf_card` 工具**。

## 项目选择（谁决定默认打开哪个）

优先级：

1. Client 传 `?project=<id>`（用户在下拉里选过，存 localStorage）。
2. **会话工作目录匹配**：`<项目>\_project.json` 的 `dirs[]` 经转义后与会话所属的 `sessions\--C-...--` 目录名比对，命中即选它（转义规则：盘符后的 `:\` 折成 `-`，其余分隔符变 `-`，前后各加 `--`）。
3. `_current.json` 指针（agent 维护，新比赛开始时更新）。
4. 最近有更新的项目。

下拉里始终有「全部项目」，选它就把所有项目的卡片按日期聚合。

## 模式判定

Host 半用 `agents.get(sessionId)` → `agentPresets.composedPreset(agent.ctx)` 判断当前会话的预设：

- `ctf` → 状态条显示 CTF 指标（当前选中项目 + 今天）。
- 其它/取不到 → `ctf:false, known:false`，不显示 CTF 状态条。

## HTTP（同源只读）

```
GET /dsh-ctf-board/summary?session=<id>&project=<id|*>
GET /dsh-ctf-board/mode?session=<id>
GET /dsh-ctf-board/report?event=&detail=     # Client 半自报点（诊断槽位崩溃用）
```

## 配置（`cordis.patch.yml` 行 config）

| 键 | 默认 | 说明 |
|---|---|---|
| `rootDir` | `__DSH_HOME__\ctf` | 题卡根目录（安装期替换占位符） |
| `routePrefix` | `/dsh-ctf-board` | HTTP 路由前缀 |
| `refreshMs` | `15000` | Client 轮询间隔（下限 4000） |
| `logDir` | `__DSH_HOME__\logs\ctf-board` | Client 自报点 |

## 依赖与大坑

- **不硬注入任何服务**：`agents` / `agentPresets` / `webServer` 全部在 apply 里惰性取。硬注入 `webServer` 会让非 web profile 起不来；硬注入 `agents` 万一服务名不对会让整行永不激活。
- Client 半是纯 JS（无 JSX、无 import），只 `require('react')`；样式全部走 `--dsw-alias-*` / `--dsw-static-*`。
- 扫描缓存按**题卡指纹**（每个 `meta.json` / `runs` 目录 / `solve.md` 的 mtime+size）判定，改 `meta.json` 内容下一次 15 秒轮询就会刷新。
