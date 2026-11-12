// The framework-free core of react-headroom. Both <Headroom> and useHeadroom
// are thin views over one controller: it listens to the scroller, decides the
// header's state once per animation frame, tracks the header's height, and
// reports a snapshot to its owner after every change.
import raf from 'raf'
import shouldUpdate from './shouldUpdate'

const noop = () => {}

const DEFAULT_OPTIONS = {
  parent: () => window,
  pin: false,
  disable: false,
  upTolerance: 5,
  downTolerance: 0,
  pinStart: 0,
  calcHeightOnResize: true,
  matchScrollSpeed: false,
  onPin: noop,
  onUnpin: noop,
  onUnfix: noop,
}

export const DEFAULT_CLASS_NAMES = {
  wrapper: 'headroom-wrapper',
  header: 'headroom',
  unfixed: 'headroom--unfixed',
  pinned: 'headroom--pinned',
  unpinned: 'headroom--unpinned',
  scrolled: 'headroom--scrolled',
  bottom: 'headroom--bottom',
  disableAnimation: 'headroom-disable-animation',
}

// What a header shows before its controller mounts.
export const initialSnapshot = () => ({ state: 'unfixed', bottom: false })

// Each action's change of state, and the callback it fires.
const CHANGES = {
  pin: { state: 'pinned', animated: true, callback: 'onPin' },
  unpin: { state: 'unpinned', animated: true, callback: 'onUnpin' },
  'unpin-snap': { state: 'unpinned', animated: false, callback: 'onUnpin' },
  unfix: { state: 'unfixed', animated: false, callback: 'onUnfix' },
}

const PASSIVE = { passive: true }

// The window, the document, its root element and the body all name the page,
// whose scroll events reach the window.
const isPage = element =>
  element === window ||
  element === document ||
  element === document.documentElement ||
  element === document.body
const eventsOf = element => (isPage(element) ? window : element)

// A scroller's position, the height of its visible area (for the page, without
// a horizontal scrollbar), and its full scrollable height.
function extent(element) {
  const box = isPage(element) ? document.documentElement : element
  return {
    y: isPage(element) ? window.pageYOffset : element.scrollTop,
    visible: box.clientHeight,
    total: box.scrollHeight,
  }
}

const withDefaults = given => {
  const merged = {}
  for (const key in DEFAULT_OPTIONS)
    merged[key] = given[key] === undefined ? DEFAULT_OPTIONS[key] : given[key]
  return merged
}

/**
 * Creates the controller for a mounted header; `destroy()` ends it, and a
 * remount (React StrictMode) creates a new one. `onChange(snapshot)` is called
 * once for each change of the snapshot { state, animated, height, bottom,
 * transitionMs }:
 * - state: 'unfixed' | 'pinned' | 'unpinned'
 * - animated: whether the last change animates (unset before the first one)
 * - height: the header's height in px, fractions included
 * - bottom: whether the last in-bounds frame ended at the scroller's bottom
 * - transitionMs: how long the last animated change lasts
 */
export function createHeadroom(initialOptions, onChange) {
  let options = withDefaults(initialOptions)
  const snapshot = initialSnapshot()
  let scroller = null
  let header = null
  let observer = null
  let lastY = 0
  let lastTime = null
  let mounting

  // One pending animation frame per job: scheduling a job again keeps it.
  const pending = {}
  const schedule = (job, fn) => {
    if (!pending[job])
      pending[job] = raf(time => {
        pending[job] = 0
        fn(time)
      })
  }
  const cancel = job => {
    raf.cancel(pending[job])
    pending[job] = 0
  }

  // The owner keeps only what it shows (the component) or bails out by itself
  // (the hook's state setter).
  const emit = () => onChange({ ...snapshot })
  function change(action, moved = 0, gap = 16, silent = false) {
    const { callback, ...next } = CHANGES[action]
    // How long a slide lasts; only an animated change shows it.
    next.transitionMs =
      options.matchScrollSpeed && moved !== 0
        ? Math.min(
            400,
            Math.max(100, Math.round((snapshot.height * gap) / Math.abs(moved)))
          )
        : 200
    Object.assign(snapshot, next)
    if (!silent) options[callback]()
    emit()
  }

  function update(time) {
    const { y, visible, total } = extent(scroller)
    // Overscroll (more than 1px past either end; less is zoom rounding)
    // changes nothing, not even the reference.
    if (y < -1 || y + visible > total + 1) return
    const moved = y - lastY
    // A frame more than 100ms after the last one starts a new scroll: one frame.
    const since = lastTime === null ? Infinity : time - lastTime
    const { action } = shouldUpdate(lastY, y, options, snapshot)
    lastY = y
    lastTime = time
    snapshot.bottom = y + visible >= total - 1
    if (action === 'none') emit()
    else change(action, moved, since > 100 ? 16 : since)
  }
  const onScroll = () => schedule('frame', update)

  // Listen to whatever parent() returns now. A parent that returns nothing yet
  // (a ref during mount) is looked up again on the next frame.
  function attach() {
    const element = options.parent()
    if (element && element === scroller) return
    detach()
    if (!element) return schedule('lookup', attach)
    scroller = element
    // A new scroller's position is the reference; its next frame is a first
    // frame. In place but scrolled past the header's region, the header hides,
    // so the first scroll up can show it (silently while mounting).
    lastY = extent(scroller).y
    lastTime = null
    if (
      !options.pin &&
      snapshot.state === 'unfixed' &&
      lastY > snapshot.height + options.pinStart
    )
      change('unpin-snap', 0, 16, mounting)
    eventsOf(scroller).addEventListener('scroll', onScroll, PASSIVE)
    if (options.pin) schedule('frame', update)
  }
  function detach() {
    if (scroller !== null)
      eventsOf(scroller).removeEventListener('scroll', onScroll, PASSIVE)
    scroller = null
    cancel('frame')
  }

  function measure() {
    snapshot.height = header.getBoundingClientRect().height
    emit()
  }
  const onWindowResize = () => schedule('measure', measure)
  const onFocusIn = () => {
    if (!options.disable && snapshot.state === 'unpinned') change('pin')
  }
  // Track the header's height with a ResizeObserver, which sees any size
  // change whatever the parent; without one, remeasure on window resizes.
  function connectHeader() {
    disconnectHeader()
    if (header === null) return
    header.addEventListener('focusin', onFocusIn)
    measure()
    if (!options.calcHeightOnResize) return
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', onWindowResize, PASSIVE)
      return
    }
    observer = new ResizeObserver(measure)
    observer.observe(header)
  }
  function disconnectHeader() {
    if (observer !== null) observer.disconnect()
    observer = null
    window.removeEventListener('resize', onWindowResize, PASSIVE)
    if (header !== null) header.removeEventListener('focusin', onFocusIn)
    cancel('measure')
  }

  // While pin or disable is true the props own the state, so the instance
  // methods do nothing; nor does a call that names the current state.
  const call = action =>
    !options.pin &&
    !options.disable &&
    snapshot.state !== CHANGES[action].state &&
    change(action)

  return {
    // After setHeader(): start listening. Mounting lasts through the first
    // frame, where a ref parent resolves.
    mount() {
      mounting = true
      if (!options.disable) attach()
      schedule('mount', () => (mounting = false))
    },

    destroy() {
      detach()
      disconnectHeader()
      cancel('lookup')
      cancel('mount')
    },

    setOptions(next) {
      const previous = options
      options = withDefaults(next)
      if (options.disable) {
        detach()
        cancel('lookup')
        // Disabling a fixed header unfixes it, once.
        if (snapshot.state !== 'unfixed') change('unfix')
      } else {
        attach()
        // Turning pin on or off applies at the next frame.
        if (options.pin !== previous.pin && scroller !== null)
          schedule('frame', update)
      }
      if (options.calcHeightOnResize !== previous.calcHeightOnResize)
        connectHeader()
    },

    setHeader(element) {
      disconnectHeader()
      header = element
      connectHeader()
    },

    pin: () => call('pin'),
    unpin: () => call('unpin'),
    unfix: () => call('unfix'),
  }
}
