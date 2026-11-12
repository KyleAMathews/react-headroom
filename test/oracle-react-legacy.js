// React 16 and 17 for the headroom oracle's drivers: they render with
// ReactDOM.render, and act comes from react-dom/test-utils. The harness loads
// this module for React 16 and 17, and ./oracle-react-root.js otherwise.
import ReactDOM from 'react-dom'
import { act } from 'react-dom/test-utils'

export { act }

// A root over ReactDOM.render, with the shape of React 18's createRoot.
export const createRoot = container => ({
  render: element => {
    ReactDOM.render(element, container)
  },
  unmount: () => {
    ReactDOM.unmountComponentAtNode(container)
  },
})
