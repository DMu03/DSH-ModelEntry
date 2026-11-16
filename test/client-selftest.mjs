/**
 * Offline self-test for lib/client.js — no DSH, no browser needed.
 *
 * It fakes `window`, `react` and a client `ctx`, runs the plugin's `apply()`,
 * then asserts the whole wiring:
 *   1. the icon registers into `sidebar.panellist` with id `model-manager`
 *   2. the panel registers into `main` with the same key
 *   3. mounting the panel calls the settings shell's `openSection('models')`
 *      and then hands the main column back to the conversation
 *   4. when the settings shell is missing, the panel renders the failure reason
 *
 * Run: node test/client-selftest.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')

let loaded
globalThis.window = { __ModuleLoader__: { load: (entry) => { loaded = entry } } }

const react = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children } }),
  useState: (init) => [init, () => {}],
  useEffect: (fn) => { fn() },
}

/**
 * Minimal hooks driver: render once, run the effects (which may set state),
 * then render again to get the committed tree. Not a React re-implementation —
 * just enough to verify that the failure UI can be painted in plain Node.
 */
function mount(component, props) {
  const states = []
  let cursor = 0
  react.useState = (init) => {
    const index = cursor++
    if (!(index in states)) states[index] = init
    return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
  }
  cursor = 0
  const effects = []
  react.useEffect = (fn) => { effects.push(fn) }
  const first = component(props)
  for (const fn of effects) fn()
  cursor = 0
  react.useEffect = () => {}
  const second = component(props)
  return second === null ? first : second
}

const requireStub = (id) => {
  if (id === 'react') return react
  throw new Error(`unexpected require: ${id}`)
}

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

new Function('require', bundle)(requireStub)
if (!loaded || loaded.id !== 'dsh-models-entry') fail('the bundle did not register its module')
const mod = loaded.factory(requireStub)

function makeCtx() {
  const opened = []
  const selected = []
  const registered = []
  const shellStore = {
    create: () => ({
      actions: { openSection: (id) => { opened.push(id) } },
      getSnapshot: () => ({ open: opened.length > 0, activeId: opened[opened.length - 1] }),
    }),
  }
  const ctx = {
    slots: {
      // Real entry shape: `store` is a sibling of `options`, not inside it.
      entries: (key) => (key === 'sidebar.settings'
        ? [{ component: () => null, options: { locale: 'settings' }, store: shellStore }]
        : []),
      inject: (key, cb) => cb(),
      register: (options, component) => { registered.push({ options, component }); return () => {} },
    },
    locale: {
      register: () => () => {},
      bind: () => (key) => ({ entry: 'Models' }[key] || key),
    },
    layout: { selectPanel: (id) => { selected.push(id) } },
    effect: (fn) => { fn(); return () => {} },
  }
  return { ctx, opened, selected, registered }
}

function applyAll(plugin, ctx) {
  const run = plugin.apply(ctx)
  if (run && typeof run.next === 'function') {
    while (!run.next().done) { /* generator-style apply: yield = effect */ }
  }
}

// --- happy path ---
{
  const { ctx, opened, selected, registered } = makeCtx()
  applyAll(mod, ctx)

  const icon = registered.find((r) => r.options.name === 'sidebar.panellist')
  const main = registered.find((r) => r.options.name === 'main')
  if (!icon) fail('no sidebar.panellist registration')
  if (!main) fail('no main registration')
  if (icon.options.id !== 'model-manager') fail(`icon id is ${icon.options.id}`)
  if (main.options.key !== 'model-manager') fail(`main key is ${main.options.key}`)
  if (icon.options.label() !== 'Models') fail('label thunk does not resolve')

  const svg = icon.component({ size: 16, active: false })
  if (svg.type !== 'svg' || svg.props.width !== 16) fail('icon is not a 16px svg')

  const tree = mount(main.component, {})
  if (opened[0] !== 'models') fail(`openSection called with ${JSON.stringify(opened)}`)
  if (selected[0] !== null) fail(`selectPanel called with ${JSON.stringify(selected)}`)
  if (tree !== null) fail('panel should render nothing when the dialog opens')
}

// --- missing settings shell ---
{
  const { ctx, registered } = makeCtx()
  ctx.slots.entries = () => []
  applyAll(mod, ctx)
  const main = registered.find((r) => r.options.name === 'main')
  const warn = console.warn
  console.warn = () => {}
  let tree
  try {
    tree = mount(main.component, {})
  } finally {
    console.warn = warn
  }
  const text = JSON.stringify(tree)
  if (!text.includes('sidebar.settings')) fail('failure UI does not explain the missing shell')
  if (text.toLowerCase().indexOf('retry') === -1 && text.indexOf('重试') === -1) fail('failure UI has no retry action')
}

console.log('OK: icon slot, panel slot, open chain and failure UI all behave as expected')
