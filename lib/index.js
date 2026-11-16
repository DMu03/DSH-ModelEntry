/**
 * dsh-models-entry —— host 半侧。
 *
 * 本包的全部功能在浏览器半侧（lib/client.js）。host 侧只需要一个
 * 无副作用的 Loader entry，让 client bundle 有对应的包行可以被组合、
 * 被 /plugins 路由提供。
 */

export const name = 'dsh-models-entry'

export function apply() {}
