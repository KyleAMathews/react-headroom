// The framework-free core of react-headroom. Both <Headroom> and useHeadroom
// are thin views over one controller: it listens to the scroller, decides the
// header's state once per animation frame, tracks the header's height, and
// reports a snapshot to its owner after every change.
import raf from 'raf'
import shouldUpdate from './shouldUpdate'

const noop = () => {}

export const DEFAULT_OPTIONS = {
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

const withDefaults = options => {
  const merged = {}
  for (const key of Object.keys(DEFAULT_OPTIONS)) {
    merged[key] =
      options[key] === undefined ? DEFAULT_OPTIONS[key] : options[key]
  }
  return merged
}

const isPage = element => element === window

// The scroller's position, the height of its visible area, and its full
// scrollable height. Overscroll is outside [0, total - visible].
const scrollYOf = element =>
  isPage(element) ? window.pageYOffset : element.scrollTop
const visibleHeight = element =>
  isPage(element) ? window.innerHeight : element.clientHeight
const scrollHeight = element =>
  isPage(element) ? document.documentElement.scrollHeight : element.scrollHeight

// Scroll and resize listeners never call preventDefault.
const LISTENER = { passive: true }

// What a header shows before its controller mounts.
export const initialSnapshot = () => ({ state: 'unfixed', bottom: false })

/**
 * Creates the controller for a mounted header; `destroy()` ends it, and a
 * remount (React StrictMode) creates a new one. `onChange(snapshot)` is called
 * after every change of the snapshot. A snapshot is { state, animated,
 * height, bottom, transitionMs }:
 * - state: 'unfixed' | 'pinned' | 'unpinned'
 * - animated: whether the last change animates (unset before the first one)
 * - height: the header's height in px, fractions included
 * - bottom: whether the last in-bounds frame ended at the scroller's bottom
 * - transitionMs: how long the last animated change lasts
 */
export function createHeadroom(initialOptions, onChange) {
  let options = withDefaults(initialOptions)
  const snapshot = initialSnapshot()
  let lastY = 0
  let lastTime = null
  let live = true
  let scroller = null
  let header = null
  let observer = null

  // Work for a later frame; it does nothing once the controller is destroyed.
  const later = fn => raf(time => live && fn(time))
  const emit = () => onChange({ ...snapshot })

  function change(next, callback) {
    Object.assign(snapshot, next)
    callback()
    emit()
  }

  function apply(action, moved = 0, gap = 16) {
    const transitionMs =
      options.matchScrollSpeed && moved !== 0
        ? Math.min(
            400,
            Math.max(100, Math.round((snapshot.height * gap) / Math.abs(moved)))
          )
        : 200
    if (action === 'pin') {
      change({ state: 'pinned', animated: true, transitionMs }, () =>
        options.onPin()
      )
    } else if (action === 'unpin') {
      change({ state: 'unpinned', animated: true, transitionMs }, () =>
        options.onUnpin()
      )
    } else if (action === 'unpin-snap') {
      change({ state: 'unpinned', animated: false }, () => options.onUnpin())
    } else {
      change({ state: 'unfixed', animated: false }, () => options.onUnfix())
    }
  }

  function update(time) {
    if (options.disable) return
    const y = scrollYOf(scroller)
    const visible = visibleHeight(scroller)
    const total = scrollHeight(scroller)
    // Overscroll (a bounce past either end) changes nothing, not even the reference.
    if (y < 0 || y + visible > total) return
    const moved = y - lastY
    const gap = lastTime === null ? 16 : time - lastTime
    const { action } = shouldUpdate(lastY, y, options, snapshot)
    lastY = y
    lastTime = time
    snapshot.bottom = y + visible >= total - 1
    if (action === 'none') emit()
    else apply(action, moved, gap)
  }

  const requestFrame = () => scroller !== null && later(update)
  const onScroll = () => later(update)

  // Listen to whatever parent() returns now. A parent that returns nothing yet
  // (a ref during mount) is looked up again on the next frame.
  function attach() {
    detach()
    const element = options.parent()
    if (!element) {
      later(() => !options.disable && attach())
      return
    }
    scroller = element
    scroller.addEventListener('scroll', onScroll, LISTENER)
    if (options.pin) requestFrame()
  }
  function detach() {
    if (scroller !== null)
      scroller.removeEventListener('scroll', onScroll, LISTENER)
    scroller = null
  }

  function measure() {
    snapshot.height = header.getBoundingClientRect().height
    emit()
  }
  const onWindowResize = () => later(measure)
  const onFocusIn = () => {
    if (!options.disable && snapshot.state === 'unpinned') apply('pin')
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
      window.addEventListener('resize', onWindowResize, LISTENER)
      return
    }
    observer = new ResizeObserver(measure)
    observer.observe(header)
  }
  function disconnectHeader() {
    if (observer !== null) observer.disconnect()
    observer = null
    window.removeEventListener('resize', onWindowResize, LISTENER)
    if (header !== null) header.removeEventListener('focusin', onFocusIn)
  }

  return {
    // After setHeader(): start listening to the parent.
    mount() {
      if (!options.disable) attach()
    },

    destroy() {
      live = false
      detach()
      disconnectHeader()
    },

    setOptions(next) {
      const previous = options
      options = withDefaults(next)
      if (options.disable) {
        detach()
        // Disabling a fixed header unfixes it, once.
        if (snapshot.state !== 'unfixed') {
          change({ state: 'unfixed', animated: false }, () => options.onUnfix())
        }
      } else {
        // attach() also requests a frame while pin is true.
        attach()
      }
      if (options.calcHeightOnResize !== previous.calcHeightOnResize)
        connectHeader()
    },

    setHeader(element) {
      disconnectHeader()
      header = element
      connectHeader()
    },

    // The component's instance methods. A call that names the current state,
    // or comes while pin or disable is true (the props own the state then),
    // does nothing.
    pin: () =>
      !options.pin &&
      !options.disable &&
      snapshot.state !== 'pinned' &&
      apply('pin'),
    unpin: () =>
      !options.pin &&
      !options.disable &&
      snapshot.state !== 'unpinned' &&
      apply('unpin'),
    unfix: () => !options.pin && snapshot.state !== 'unfixed' && apply('unfix'),
  }
}
