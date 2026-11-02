# @local/dsh-security-modes

DSH（DeepSeek Harness）的**安全模式层**：在模式选择器里加两个 agent preset ——「安全测试」（`security`）与「CTF」（`ctf`）。

纯声明型 bundle：`index.js` 无可执行逻辑，全部价值在 `cordis.patch.yml` 的两条 preset 声明行。
**零第三方依赖** —— 两个预设引用的全是 dsh 自带包（`@deepseek-ai/*` 与 `cordis:group`），不联网、不查 registry。

## 两个模式

| preset id | 名称 | 定位 |
|---|---|---|
| `security` | 安全测试 | 授权渗透 / 红队 / 检测验证。标准流程轴（recon → scan → web → ad），压缩阈值收窄，带委派分组 |
| `ctf` | CTF | pwn / rev / crypto / web / misc / forensics 解题。与标准模式**齐平**的执行通道（不是精简版），另加解题纪律：flag-first、oracle-first、竞赛并行、题卡落盘 |

`ctf` 并不是把工具砍掉的"轻量模式"。实测教训写进 patch 注释里了：少挂 `tool-jobs` 会直接 `no job controller`，
少挂 `agent-instructions` 就拿不到 `AGENTS.md`。

## ctf 模式带了什么纪律

persona 里写死的几条，安装即生效，不想要就编辑 patch 删对应段落：

- **Flag first**：任何 flag 形状的字符串一出现在工具输出里，下一条回复必须以它开头，再写题解。
- **Oracle first**：fuzzing 之前先确认哪个信号真的会变（状态码 / 长度 / 头 / 时序），
  不把"响应体非空"当唯一成功判据。
- **题卡落盘**：`<DSH_HOME>\ctf\<项目>\<题目>\` 下 `meta.json` + `runs\*.json` + `solve.md`，跨会话复用。
- **竞赛并行**：多题时按目标分组 fan-out，父会话负责合并与提交。

## 安装期占位符

本包所有机器相关路径都写成 `__DSH_HOME__`，安装时替换成本机 DSH 家目录绝对路径：

| 落点 | 用途 |
|---|---|
| `__DSH_HOME__\skills-ctf` | `skill-filesystem.customSkillDirs`：热技能直挂目录 |
| `__DSH_HOME__\skill-index\ctf.md` | persona 里写明的长尾技能索引 |
| `__DSH_HOME__\ctf\...` | 题卡目录（persona 与 ctf-board 共用同一棵树） |

**忘了替换不会崩**：热技能目录为空、题板空态，但 persona 会把题卡写到字面路径 `__DSH_HOME__\...` 下。
所以装完必须自检一次：`Select-String -Path <DSH_HOME>\local-bundles\*\cordis.patch.yml -Pattern '__DSH_HOME__'` 应无输出。

## 和 guard / 授权段的边界

`security` 预设本身**不声明** `authorization-scope` 段，也**不挂** params-guard：
这两者都是 Host 级（全局）插件，由各自的 bundle 安装，预设里再挂会重复注册 → 预设激活冲突。
所以：

- 装了授权/闸门包 → 本会话上方有 `authorization-scope` 段，persona 按它工作；
- 没装 → persona 退化为"用户在对话里声明的范围即边界"，同样可用，但没有执行层强制。

## 兼容性

- dsh `>= 0.2.1-rc.2`，node `^22.19.0 || >=24.0.0`
- 声明 `preset-security`（order 10）与 `preset-ctf`（order 11），两者 id 在本 bundle 内唯一
- **不要**再和另一个声明同名 preset 的 bundle 共存（同 id 双声明会扰乱模式选择器）
- 装后必须重启 `dsh web`：bundle 列表与 bundle patch 只在启动时读取，HMR 不覆盖

## License

MIT —— 见仓库根 `LICENSE`。仅用于你有权测试的环境。