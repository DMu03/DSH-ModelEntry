# dsh-models-entry

[English](README.md) | 中文

DSH（DeepSeek Harness）附加组件：在**侧栏面板图标列**里加一个「模型」图标，点它就直接打开 DSH 的模型管理页（设置 → 模型）。

独立插件，**不修改应用本体**（`resources\app` / `app.asar` 一个字节都不碰），只走插件官方槽位，所以 DSH 更新覆盖不到它。

## 安装与使用

### 装之前

- DSH Desktop 0.2.1-rc.1 或更新（写在 `engines.dsh` 里；实测线是 0.2.x）。
- 下面两种装法任选一种，**都要重启 DSH**——插件是在启动时组合的。

### 装法 A：一条命令（推荐）

DSH 有一个官方 CLI，npm 上的包名是 `@deepseek-ai/dsh`；它的 `plugin` 子命令把参数交给 `pnpm`，装完还会自动把新组合包选进 `dsh.profile.bundles`：

```powershell
npx -y @deepseek-ai/dsh@latest plugin --profile desktop add github:DMu03/DSH-ModelEntry#v1.0.0
```

- 换别的来源也行：tarball 地址（如 `https://github.com/DMu03/DSH-ModelEntry/archive/refs/tags/v1.0.0.tar.gz`）、本机绝对路径，或者等它发布到 npm 后直接用包名 `dsh-models-entry`。
- 建议钉 tag 或完整提交号，别用分支。
- 环境要求：Node ≥ 24.9，且 `pnpm` 在 `PATH` 里。桌面版先启动过一次让 profile 初始化，跑命令前把它完全退出。
- 装完重新打开 DSH。
- 卸载同理：`npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-models-entry`。

### 装法 B：手动改 profile

1. `~/.dsh/profiles/desktop/package.json` 里，`dependencies` 加 `"dsh-models-entry": "file:<本仓库的绝对路径>"`，`dsh.profile.bundles` 加 `"dsh-models-entry"`。
2. 在 profile 目录跑 `pnpm install`（应用自带的 `runtime/primary-runtime` 里的 pnpm 也行），或直接把 `package.json` + `lib` + `cordis.patch.yml` 拷进 `node_modules/dsh-models-entry`。
3. 重启 DSH。

桌面版的**设置 → 插件**页面能列出已装的组合包，也能在这里开关它们。

### 怎么用

- 侧栏那排面板图标里多一格（分层图标）。
- 点它 → 设置弹窗立刻弹在「模型」分区，主区自动切回对话（不会把对话挤掉）。
- 关掉弹窗就回到对话；想再看一次再点一次图标。
- 如果唤起失败，主区会显示具体原因 + 「重试」，不会静默什么都不发生。手动的等价路径是**设置 → 模型**。

## 效果

- 侧栏那排面板图标里多一格（分层图标，`order: 20`，排在「插件」等官方面板之后）。
- 点击 → 设置弹窗立刻弹在「模型」分区，主区自动切回对话。
- 如果唤起失败，主区会显示一行具体原因 + 「重试」。

## 原理（为什么不打补丁）

| 部件 | 走的官方接口 |
| --- | --- |
| 侧栏图标 | 槽位 `sidebar.panellist`（`list`，id 同时是面板 key） |
| 主区面板 | 槽位 `main`（`keyed`，key 与图标 id 相同） |
| 唤起模型页 | `ctx.slots.entries('sidebar.settings')[0].store.create().actions.openSection('models')` |
| 切回对话 | `ctx.layout.selectPanel(null)` |
| 文案 | `ctx.locale.register('models-entry', { zh, en })` |

关键是第三行。`openSettings(sectionId)` 这个回调只发给 `settings.launcher` 的占位者，而那个位子被账号菜单占着，第三方拿不到；但设置弹窗的开关状态本来就属于 `sidebar.settings` 这个注册项的 store。core 的 `register()` 会把 registration options 拆成两部分：`key/id/order/label/priority` 进 `entry.options`，而 `store/inject/children/locale/registrant` 是与 `options` **平级**的字段——所以正确取法是 `entry.store`（`entry.options.store` 拿不到，这就是第一版"点了没反应"的原因）。store 的 `create()` 由 ui-settings-general 固定返回同一实例。

面板为什么要在挂载时唤起：`sidebar.panellist` 的点击语义是 `layout.selectPanel(id)`（切换主区面板），不是弹窗。所以图标点击的唯一入口是面板挂载，挂载那一刻唤起设置、再把主区还给对话。

组件不用 registration 的 `inject` / `locale` 注入面，回调与文案全走 `apply` 闭包，少一层"注入有没有落到组件"的未知量。

## 目录

```
lib/client.js       client bundle（__ModuleLoader__ 工厂，手写，无构建步骤）
lib/index.js        host 半：无副作用的 Loader entry
test/client-selftest.mjs  离线自测（假 window/react/ctx，不需要 DSH）
cordis.patch.yml    bundle patch：插入本插件
package.json        含 dsh.bundle.patch / dsh.client 声明
LICENSE             MIT
```

## 自检

```bash
node --check lib/client.js
node --check lib/index.js
node test/client-selftest.mjs
```

离线链路自测：假 `window`/`react`/`ctx` 走一遍 `apply()`，断言图标注册进 `sidebar.panellist`（id `model-manager`）、面板注册进 `main`（同 key）、面板挂载后调用 `openSection('models')` 并 `selectPanel(null)`；另一个用例让外壳缺失，断言面板画出失败原因。

## 卸载

`npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-models-entry`，或手动从 `dsh.profile.bundles` 与 `dependencies` 删掉两行后重启。

## 已知边界

- 依赖 `sidebar.settings` 注册项上的 store 形状（`actions.openSection`）。若官方大版本改了设置外壳的 store，面板会显示具体失败原因，界面不会崩。
- 模型分区 id 是 `models`（ui-settings-models 注册的）；若官方改了 id，改 `lib/client.js` 的 `MODELS_SECTION_ID`。
- 图标点击会让主区闪一下面板再切回对话（面板挂载→立即返还），这是 `sidebar.panellist` 语义决定的。
- 不涉及任何模型请求或凭据。

## 许可

MIT（见 [`LICENSE`](LICENSE)）。
