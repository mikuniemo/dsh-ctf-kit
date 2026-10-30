# 题卡目录格式（样例，`_` 开头的目录不会被面板扫描）

```
__DSH_HOME__\ctf\
  _current.json                  ← 当前项目指针 {"project":"<项目目录名>"}
  _template\                     ← 本目录（格式样例）
  <项目>\
    _project.json                ← 项目级：name / platform / url / startedAt / status / dirs[] / note
    <题名>\
      meta.json                  ← 题目级事实（见同目录 meta.json 样例）
      runs\<日期>-<时间>-<会话id前8>.json   ← 一次会话一条
      solve.md                   ← 最终题解
```

规则：

1. **一个项目一个目录**，不同比赛的题卡绝不混在一起。
2. **一道题一个目录**，同一道题被多个会话做过时，目录只有一个，`runs\` 里每个会话各一条记录。
3. `_project.json` 的 `dirs` 写这个比赛用过的**工作目录**（比如 `C:\work\contest`）；面板按当前会话的 cwd 自动选中对应项目。
4. 新比赛开始时：建项目目录 + `_project.json`，并把 `_current.json` 指过去。
5. 目录名里的 `: ? * " < > |` 这些非法字符会被面板自动替换成全角，别手写这些字符。
