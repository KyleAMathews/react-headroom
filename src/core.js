// The framework-free core of react-headroom. Both <Headroom> and useHeadroom
// are thin views over one controller: it listens to the scroller, decides the
// header's state once per animation frame, tracks the header's height, and
// reports a snapshot to its owner after every change.
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

// What a header shows before its controller mounts.
export const initialSnapshot = () => ({
  state: 'unfixed',
  bottom: false,
  // Until the header is measured (a hook's ref not attached yet), 0px.
  height: 0,
})

// Each action's [state, animated, callback].
const CHANGES = {
  pin: ['pinned', true, 'onPin'],
  unpin: ['unpinned', true, 'onUnpin'],
  'unpin-snap': ['unpinned', false, 'onUnpin'],
  unfix: ['unfixed', false, 'onUnfix'],
}

const PASSIVE = { passive: true }

// The window whose page a parent names, or null for an element. Any window
// names its page (an iframe's too), as do its document, root element and
// body.
function windowOf(element) {
  if (element.window === element) return element
  const doc = element.ownerDocument || element
  return element === doc ||
    element === doc.documentElement ||
    element === doc.body
    ? doc.defaultView
    : null
}

// How far a box can scroll.
const range = box => box.scrollHeight - box.clientHeight

const withDefaults = given => {
  const merged = {}
  for (const key in DEFAULT_OPTIONS)
    merged[key] = given[key] === undefined ? DEFAULT_OPTIONS[key] : given[key]
  return merged
}

/**
 * Creates the controller for a mounted header; `destroy()` ends it, and a
 * remount (React StrictMode) creates a new one. `onChange(snapshot)` is called
 * after each change of the snapshot, the controller's own live object
 * { state, animated, height, bottom, transitionMs }:
 * - state: 'unfixed' | 'pinned' | 'unpinned'
 * - animated: whether the last change animates (unset before the first one)
 * - height: the header's height in px, fractions included (0 until measured)
 * - bottom: whether the last in-bounds frame ended at the scroller's bottom
 * - transitionMs: how long the last slide lasts (unset before the first)
 */
export function createHeadroom(initialOptions, onChange) {
  let options = withDefaults(initialOptions)
  const snapshot = initialSnapshot()
  // The scroller; the window whose page it names (null for an element) and
  // that page's scrolling element (the root, or the body in quirks mode);
  // whether the scroller is the page's body; and the targets listened to.
  let scroller = null
  let view = null
  let page = null
  let body
  let targets = []
  let header = null
  let observer = null
  let lastY = 0
  let lastTime = null
  let mounting

  // One pending animation frame per job: scheduling a job again keeps it.
  const pending = {}
  const schedule = (job, fn) => {
    if (!pending[job])
      pending[job] = requestAnimationFrame(time => {
        pending[job] = 0
        fn(time)
      })
  }
  const cancel = job => {
    cancelAnimationFrame(pending[job])
    pending[job] = 0
  }

  // The owner keeps only what it shows (the component), or only state,
  // animated and transitionMs (the hook).
  const emit = () => onChange(snapshot)
  function change(action, moved = 0, gap = 16, silent = false) {
    const [state, animated, callback] = CHANGES[action]
    snapshot.state = state
    snapshot.animated = animated
    // How long a slide lasts; a change that does not slide keeps the last.
    if (animated)
      snapshot.transitionMs =
        options.matchScrollSpeed && moved !== 0
          ? Math.min(
              400,
              Math.max(
                100,
                Math.round((snapshot.height * gap) / Math.abs(moved))
              )
            )
          : 200
    if (!silent) options[callback]()
    emit()
  }

  // The scroller's position, the height of its visible area (for a page,
  // without a horizontal scrollbar), and its full scrollable height. A page's
  // box is its scrolling element: the root, or the body in quirks mode. A
  // body parent is followed as the body when it has more to scroll than its
  // page, and otherwise as the page (in quirks mode the body is the page's
  // scrolling element, so the page).
  function extent() {
    const own = !view || (body && range(scroller) > range(page))
    const box = own ? scroller : page
    return {
      y: own ? scroller.scrollTop : view.pageYOffset,
      visible: box.clientHeight,
      total: box.scrollHeight,
    }
  }

  function update(time) {
    const { y, visible, total } = extent()
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
    view = windowOf(element)
    const doc = view && view.document
    page = doc && (doc.scrollingElement || doc.documentElement)
    body = Boolean(doc) && element === doc.body
    // A body is listened to as its page and as itself: its page's scroll
    // events reach the window, its own fire on it.
    targets = body ? [view, element] : [view || element]
    for (const target of targets)
      target.addEventListener('scroll', onScroll, PASSIVE)
    // A new scroller's position is the reference; its next frame is a first
    // frame. It also decides at once where the header belongs: in place at or
    // above pinStart, and hidden if it is in place but scrolled past its
    // region, so the first scroll up can show it (silently while mounting).
    lastY = extent().y
    lastTime = null
    const inPlace = snapshot.state === 'unfixed'
    if (options.pin) schedule('frame', update)
    else if (inPlace && lastY > snapshot.height + options.pinStart)
      change('unpin-snap', 0, 16, mounting)
    else if (!inPlace && lastY <= options.pinStart) change('unfix')
  }
  function detach() {
    for (const target of targets) target.removeEventListener('scroll', onScroll)
    targets = []
    scroller = view = null
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
  // Track the header's height with a ResizeObserver on its border box (the
  // height measured), which sees any size change, padding and border
  // included, whatever the parent; without one, remeasure on window resizes.
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
    observer.observe(header, { box: 'border-box' })
  }
  function disconnectHeader() {
    if (observer !== null) observer.disconnect()
    observer = null
    window.removeEventListener('resize', onWindowResize)
    if (header !== null) header.removeEventListener('focusin', onFocusIn)
    cancel('measure')
  }

  // While pin or disable is true the props own the state, so the instance
  // methods do nothing; nor does a call that names the current state.
  const call = action =>
    !options.pin &&
    !options.disable &&
    snapshot.state !== CHANGES[action][0] &&
    change(action)

  return {
    // After setHeader(): start listening. Mounting lasts through the first
    // frame, where a ref parent resolves: attaching first queues its lookup
    // ahead of the end of mounting.
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
