/**
 * Used to detect browser support for adding an event listener with options
 * @see https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#Improving_scrolling_performance_with_passive_listeners
 * @returns Boolean
 */
export default function supportsPassiveEvents() {
  let passiveSupported = false

  try {
    const options = {
      get passive() {
        // This function will be called when the browser
        // attempts to access the passive property.
        passiveSupported = true
        return false
      },
    }

    window.addEventListener('test', null, options)
    window.removeEventListener('test', null, options)
  } catch (err) {
    passiveSupported = false
  }

  return passiveSupported
}
