// The Node side of the headroom oracle's Chrome run (ORACLE_BROWSER=chrome).
// It bundles test/oracle-chrome-entry.js (the drivers, production and React)
// with esbuild, opens it in the installed Chrome through Playwright, and gives
// the oracle drivers that play each plan there and replay its observations.
// The oracle, its model and its checks stay in Node: @tanstack/oracles runs
// only there.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildSync } from 'esbuild'
import { chromium } from 'playwright'

const ENTRY = resolve(import.meta.dirname, 'oracle-chrome-entry.js')
// The page renders through createRoot (./oracle-react-root.js).
const REACT = Number(
  createRequire(import.meta.url)('react').version.split('.')[0]
)
if (REACT < 18)
  throw new Error(
    `the Chrome run needs React 18 or later, not ${REACT}; React 16 and 17 run in jsdom`
  )

let opened
function page() {
  opened ??= (async () => {
    const bundle = buildSync({
      entryPoints: [ENTRY],
      bundle: true,
      format: 'iife',
      write: false,
      loader: { '.js': 'jsx' },
      // As the published build compiles it: React.createElement.
      jsx: 'transform',
      define: { 'process.env.NODE_ENV': '"development"' },
      logLevel: 'silent',
    })
    const browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      // Chrome's scrollbars, which Playwright hides by default.
      ignoreDefaultArgs: ['--hide-scrollbars'],
    })
    process.on('exit', () => browser.close())
    const tab = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    })
    await tab.setContent(
      '<!doctype html><html><head></head><body></body></html>'
    )
    await tab.addScriptTag({ content: bundle.outputFiles[0].text })
    return tab
  })()
  return opened
}

const remote = name => async (plan, observe) => {
  const trace = await (
    await page()
  ).evaluate(
    ([driver, history]) => window.__oracle.run(driver, history),
    [name, plan]
  )
  for (const { checkpoint, value } of trace) observe(checkpoint, value)
}

export const remoteDrivers = {
  drive: remote('drive'),
  driveBare: remote('driveBare'),
  driveHook: remote('driveHook'),
  driveHookBare: remote('driveHookBare'),
}
