// @local/dsh-security-modes —— 纯声明型 bundle，无运行时代码。
//
// 本包的价值全在 cordis.patch.yml：它向 Loader 插入两个 `@deepseek-ai/dsh-agent-preset` 声明行
// （preset-security / preset-ctf）。Host 侧需要一个 `apply` 导出才能被当作合法插件包加载，
// 这里给空实现（不注册任何服务、工具、提示段、HTTP 路由）。
//
// 两个预设必须待在同一个 bundle 里：它们各自声明唯一的 preset id，拆成两个 bundle 会很难说清
// "能不能同时装"，而同 id 双声明会直接扰乱模式选择器（dsh-ctf-kit v0.2.0 的踩坑，见 INSTALL.md §6）。
export const VERSION = '0.3.0'

export function apply() {
  // 故意为空：预设由声明行提供，不靠运行时代码。
}

export default { apply, VERSION }