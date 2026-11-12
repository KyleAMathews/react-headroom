// The Chrome page's side of the headroom oracle (ORACLE_BROWSER=chrome),
// bundled by test/oracle-chrome.js: the drivers over Chrome's page and the
// page clock. `window.__oracle.run(name, plan)` plays one plan with one driver
// and returns its observations.
import { driversOf } from './oracle-driver.js'
import { createPage } from './oracle-page-chrome.js'
import { pageClock } from './oracle-clock-page.js'
import { act, createRoot } from './oracle-react-root.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const drivers = driversOf({ createPage, clock: pageClock, act, createRoot })

window.__oracle = {
  async run(name, plan) {
    const trace = []
    await drivers[name](plan, (checkpoint, value) =>
      trace.push({ checkpoint, value: JSON.parse(JSON.stringify(value)) })
    )
    return trace
  },
}
