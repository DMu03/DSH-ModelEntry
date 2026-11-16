/**
 * dsh-models-entry —— client 半侧（v2：插件栏图标 + 主区面板）。
 *
 * 结构：
 *   - `sidebar.panellist` 注册一个图标（侧栏那排面板图标里的一格），id = 面板 key。
 *   - `main` 注册同 key 的面板。点图标 → 侧栏调 layout.selectPanel(key) → 本面板挂载。
 *   - 面板挂载后立刻唤起设置弹窗的「模型」分区；成功就 selectPanel(null) 切回对话，
 *     失败就在面板里显示原因（不再静默）。
 *
 * 不使用 registration 的 inject / locale 面：所有回调与文案都通过 apply 闭包拿，
 * 少一层「注入到底有没有落到组件」的未知量。
 *
 * 产物形状：脚本自调用 window.__ModuleLoader__.load({ id, factory })，factory 内是
 * CommonJS 作用域，可 require 基线模块（react）。
 */
(() => {
  window.__ModuleLoader__.load({
    id: 'dsh-models-entry',
    factory: (require) => {
      var module = { exports: {} };
      var exports = module.exports;

      const react = require('react');
      const h = react.createElement;

      const NS = 'models-entry';
      /** 面板 id：同时也是 main 槽位的 key。 */
      const PANEL_ID = 'model-manager';
      /** 设置外壳里模型分区的 section id（ui-settings-models 注册的）。 */
      const MODELS_SECTION_ID = 'models';

      const zh = { entry: '模型', open: '打开模型管理', retry: '重试', failed: '没能打开模型管理页' };
      const en = { entry: 'Models', open: 'Open model management', retry: 'Retry', failed: 'Could not open model management' };

      /**
       * 从槽位账本里取设置外壳的 store 实例。
       * ui-settings-general 注册 `sidebar.settings` 时把 shell store 作为 registration
       * option 传进去；core 的 register() 只把 key/id/order/label/priority 归一化进
       * `entry.options`，而 `store/inject/children/locale/registrant` 是与 options
       * 平级的字段。所以先读 entry.store，再兜底 entry.options.store。
       * @returns {{ actions?: Record<string, Function> } | undefined}
       */
      function settingsShell(ctx) {
        const slots = ctx.slots;
        const lookup = typeof slots.entries === 'function'
          ? () => slots.entries('sidebar.settings')
          : typeof slots.entriesOfSlot === 'function'
            ? () => slots.entriesOfSlot('sidebar.settings')
            : undefined;
        if (!lookup) throw new Error('ctx.slots 没有 entries/entriesOfSlot');
        const entries = lookup();
        const entry = entries && entries[0];
        if (!entry) throw new Error('sidebar.settings 还没有注册项');
        const raw = entry.store !== undefined
          ? entry.store
          : entry.options && entry.options.store;
        if (raw === undefined) {
          throw new Error(`sidebar.settings 注册项上找不到 store（entry 字段：${Object.keys(entry).join(',')}）`);
        }
        const store = typeof raw === 'function' ? raw() : raw;
        if (typeof store.create !== 'function') return store;
        return store.create();
      }

      /**
       * 打开设置的模型分区。
       * @returns {{ ok: boolean, reason?: string, detail?: unknown }}
       */
      function openModelsSection(ctx) {
        let shell;
        try {
          shell = settingsShell(ctx);
        } catch (error) {
          const reason = `取设置外壳失败：${error && error.message ? error.message : String(error)}`;
          console.warn('[dsh-models-entry]', reason);
          return { ok: false, reason };
        }
        const actions = shell && shell.actions;
        if (!actions) {
          console.warn('[dsh-models-entry] 设置外壳实例上没有 actions', { shellKeys: shell ? Object.keys(shell) : null });
          return { ok: false, reason: '设置外壳实例上没有 actions' };
        }
        try {
          if (typeof actions.openSection === 'function') {
            actions.openSection(MODELS_SECTION_ID);
          } else if (typeof actions.open === 'function') {
            actions.open();
            if (typeof actions.select === 'function') actions.select(MODELS_SECTION_ID);
          } else {
            return { ok: false, reason: `外壳 actions 里没有 openSection：${Object.keys(actions).join(',')}` };
          }
        } catch (error) {
          const reason = `调用 openSection 失败：${error && error.message ? error.message : String(error)}`;
          console.warn('[dsh-models-entry]', reason);
          return { ok: false, reason };
        }
        // 自查：动作跑完后外壳快照是否真的变成了 open。
        try {
          const snap = typeof shell.getSnapshot === 'function' ? shell.getSnapshot() : undefined;
          if (snap && snap.open !== true) {
            const reason = `openSection 已调用但外壳仍未打开（快照 ${JSON.stringify(snap)}）`;
            console.warn('[dsh-models-entry]', reason);
            return { ok: false, reason };
          }
        } catch {
          /* 快照读不到就不当作失败 */
        }
        return { ok: true };
      }

      /** 16px 图标：分层（模型/目录）隐喻，颜色跟随 currentColor。 */
      function ModelsIcon(props) {
        const size = (props && props.size) || 16;
        const stroke = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' };
        return h(
          'svg',
          { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M8 1.9 14.2 5 8 8.1 1.8 5 8 1.9Z', ...stroke }),
          h('path', { d: 'M2.4 8.1 8 11 13.6 8.1', ...stroke }),
          h('path', { d: 'M2.4 11.2 8 14.1 13.6 11.2', ...stroke }),
        );
      }

      /**
       * 主区面板。挂载 → 唤起设置→模型 → 成功后切回对话；失败则留在面板上说明原因。
       * @param ctx - apply 闭包里的 client 根上下文。
       */
      function createPanel(ctx) {
        return function ModelsPanel() {
          const [failure, setFailure] = react.useState(null);
          react.useEffect(() => {
            const result = openModelsSection(ctx);
            if (result.ok) {
              // 设置弹窗已经盖在上面了，主区还给对话，避免把对话挤掉。
              try {
                if (ctx.layout && typeof ctx.layout.selectPanel === 'function') ctx.layout.selectPanel(null);
              } catch (error) {
                console.warn('[dsh-models-entry] 切回对话失败', error);
              }
              return;
            }
            setFailure(result.reason || '未知原因');
          }, []);
          if (failure === null) return null;
          return h(
            'div',
            { style: { padding: '32px 28px', color: 'var(--dsw-alias-label-primary, inherit)', fontSize: 14, lineHeight: 1.7 } },
            h('div', { style: { fontSize: 15, fontWeight: 600, marginBottom: 6 } }, '没能打开模型管理页'),
            h('div', { style: { color: 'var(--dsw-alias-label-secondary, #8b95a7)' } }, failure),
            h('div', { style: { color: 'var(--dsw-alias-label-tertiary, #8b95a7)', marginTop: 10 } },
              '可以直接点侧栏底部的设置，再选「模型」；也可以把上面这行报错发给我。'),
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  const retry = openModelsSection(ctx);
                  if (retry.ok) {
                    setFailure(null);
                    try {
                      if (ctx.layout && typeof ctx.layout.selectPanel === 'function') ctx.layout.selectPanel(null);
                    } catch { /* 已在上方记录 */ }
                  } else {
                    setFailure(retry.reason || '未知原因');
                  }
                },
                style: {
                  marginTop: 16, padding: '6px 16px', height: 34, cursor: 'pointer',
                  borderRadius: 'var(--dsw-radius-md, 8px)',
                  border: '1px solid var(--dsw-alias-border-l2, #3a4454)',
                  background: 'transparent', color: 'inherit', font: 'inherit',
                },
              },
              '重试',
            ),
          );
        };
      }

      function* apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-models-entry: dictionaries');
        const t = ctx.locale.bind(NS);
        yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('entry'),
        }, ModelsIcon));
        yield ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, createPanel(ctx)));
      }

      module.exports = { name: 'dsh-models-entry', inject: ['slots', 'locale', 'layout'], apply, PANEL_ID };
      return module.exports;
    },
  });
})();
