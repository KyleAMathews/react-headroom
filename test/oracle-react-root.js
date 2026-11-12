// React 18 and 19 for the headroom oracle's drivers: createRoot, and act.
// React 18.3 and 19 export act; 18.0 to 18.2 have it only in
// react-dom/test-utils. The harness loads this module or
// ./oracle-react-legacy.js by React's major version.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act as testUtilsAct } from 'react-dom/test-utils'

export const act = React.act ?? testUtilsAct
export { createRoot }
