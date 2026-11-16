# dsh-models-entry

[中文](README.zh-CN.md) | English

A DSH (DeepSeek Harness) add-on: adds a **Models** icon to the sidebar's panel icon list. Clicking it opens DSH's model management page (Settings → Models) directly.

An independent plugin that **does not modify the application itself** — not a single byte of `resources/app.asar` is touched. It only uses official plugin slots, so DSH updates cannot overwrite it.

## Install and use

### Before you start

- DSH Desktop 0.2.1-rc.1 or newer (declared in `engines.dsh`; 0.2.x is the tested line).
- One of the two install routes below. Both end with a **DSH restart**, because plugins are composed at startup.

### Route A: one command (recommended)

DSH ships an official CLI, published on npm as `@deepseek-ai/dsh`, and its `plugin` subcommand hands its arguments to `pnpm` and then selects the new bundle into `dsh.profile.bundles` for you:

```powershell
npx -y @deepseek-ai/dsh@latest plugin --profile desktop add github:DMu03/DSH-ModelEntry#v1.0.0
```

- Any other source works too: a tarball URL such as `https://github.com/DMu03/DSH-ModelEntry/archive/refs/tags/v1.0.0.tar.gz`, an absolute local path, or the bare package name `dsh-models-entry` once it is published to npm.
- Pin the tag (or a full commit) rather than a branch.
- Requirements: Node ≥ 24.9 and `pnpm` on `PATH`. Open the desktop app once first so its profile exists, and quit it before running the command.
- Then start DSH again.
- Uninstall the same way: `npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-models-entry`.

### Route B: edit the profile by hand

1. In `~/.dsh/profiles/desktop/package.json`, add `"dsh-models-entry": "file:<absolute path to this repo>"` to `dependencies`, and add `"dsh-models-entry"` to `dsh.profile.bundles`.
2. Run `pnpm install` in that profile directory (the bundled `pnpm` under `runtime/primary-runtime` works too), or copy `package.json` + `lib` + `cordis.patch.yml` into `node_modules/dsh-models-entry`.
3. Restart DSH.

The desktop app's **Settings → Plugins** page lists the installed bundles and lets you switch them on and off.

### How to use it

- One new icon (layered stack glyph) shows up in the sidebar panel icon column.
- Click it: the Settings dialog opens on the **Models** section, and the main column returns to the conversation.
- Closing the dialog leaves you back in the conversation; click the icon again to reopen.
- If opening fails, the main column shows the concrete reason plus a **Retry** button, so it never fails silently. The same page is reachable by hand from **Settings → Models**.

## What it does

- Adds one icon (layered stack glyph, `order: 20`) to the sidebar panel icon column.
- Click it: the Settings dialog opens on the **Models** section, and the main column returns to the conversation (the conversation is not displaced).
- If opening fails, the main column shows the concrete reason plus a **Retry** button instead of failing silently.

## How it works

| Piece | Official interface used |
| --- | --- |
| Sidebar icon | slot `sidebar.panellist` (`list`; the registration `id` doubles as the panel key) |
| Main panel | slot `main` (`keyed`, `key` equals the icon id) |
| Opening the Models page | `ctx.slots.entries('sidebar.settings')[0].store.create().actions.openSection('models')` |
| Returning to the chat | `ctx.layout.selectPanel(null)` |
| Copy | `ctx.locale.register('models-entry', { zh, en })` |

The third row is the interesting one. The `openSettings(sectionId)` callback is only handed to the occupant of `settings.launcher`, and that seat is taken by the account menu, so third-party plugins cannot receive it. The open/close state of the Settings dialog already belongs to the store of the `sidebar.settings` registration. The core's `register()` splits registration options in two: `key/id/order/label/priority` go into `entry.options`, while `store/inject/children/locale/registrant` stay as **sibling fields** of `options` — so the store must be read as `entry.store` (`entry.options.store` is `undefined`). `ui-settings-general` pins `create()` so it always returns the same instance.

Why the panel exists at all: a click in `sidebar.panellist` means `layout.selectPanel(id)` — it switches the main panel, it does not open a dialog. So the only entry point for an icon click is the panel mount: on mount it opens Settings, then hands the main column back to the conversation.

The components deliberately do not use the registration `inject` / `locale` faces; callbacks and copy come from the `apply` closure, which removes one unknown from the "did the injected face reach the component" question.

## Repository layout

```
lib/client.js       client bundle (hand-written __ModuleLoader__ factory, no build step)
lib/index.js        host half: a side-effect-free loader entry
test/client-selftest.mjs  offline self-test (fake window/react/ctx, no DSH needed)
cordis.patch.yml    bundle patch: inserts this plugin
package.json        declares dsh.bundle.patch / dsh.client
LICENSE             MIT
```

## Self-test

```bash
node --check lib/client.js
node --check lib/index.js
node test/client-selftest.mjs
```

The self-test fakes `window`, `react` and `ctx`, runs `apply()`, then asserts: the icon registers into `sidebar.panellist` with id `model-manager`, the panel registers into `main` with the same key, mounting the panel calls `openSection('models')` and then `selectPanel(null)`. A second case removes the settings shell and asserts the panel renders the failure reason.

## Uninstall

`npx -y @deepseek-ai/dsh@latest plugin --profile desktop remove dsh-models-entry`, or remove the two lines from `dsh.profile.bundles` / `dependencies` by hand. Restart afterwards.

## Known limits

- Depends on the store shape behind the `sidebar.settings` registration (`actions.openSection`). If a major DSH release changes the settings shell store, the panel displays the concrete failure instead of breaking the UI.
- The Models section id is `models` (registered by `ui-settings-models`). If upstream renames it, change `MODELS_SECTION_ID` in `lib/client.js`.
- Clicking the icon briefly mounts the panel and immediately returns to the conversation — a consequence of `sidebar.panellist` semantics.
- No model requests and no credentials are involved.

## License

MIT — see [LICENSE](LICENSE).
