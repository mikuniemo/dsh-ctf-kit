// @local/dsh-ctf-preset —— 纯声明型 bundle，无运行时代码。
//
// 本包的价值全在 cordis.patch.yml：它向 Loader 插入一条
// `@deepseek-ai/dsh-agent-preset` 声明行（preset-ctf）。
//
// 与 @local/dsh-security-presets 的关系：本包是该 bundle 里 preset-ctf 行的
// **独立提取版**（2026-10-29），用于把 CTF 模式单独交付给别人。
// 两者**不可同时安装** —— preset id 都是 `ctf`，同 id 重复注册会让模式选择器出问题。
//
// Host 侧需要一个 `apply` 导出才能被当作合法插件包加载，
// 这里给一个空实现（不注册任何服务、工具、提示段）。
export const VERSION = '0.1.0'

export function apply() {
  // 故意为空：预设由声明行提供，不靠运行时代码。
}

export default { apply, VERSION }
