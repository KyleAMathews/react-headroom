// The page of the headroom oracle: stand-ins for what jsdom does not have
// (layout, scroll positions, ResizeObserver). Each stand-in states the browser
// fact it encodes; the facts were checked in Chrome.
//
// The header is the element two levels under the history's container
// (container > wrapper > header), for both the component and the hook. Its
// border box is `headerHeight` tall, `headerPadding` of it outside the content
// box. `scrolls` says what scrolls the page: this window ('main'), an
// iframe's window ('frame'), or the body as its own scroll container ('body').
import { DIV, PAGE_HEIGHT, VIEWPORT, entryOf } from './oracle-geometry.js'

const page = {
  bodyFull: false,
  bodyMargin: 0,
  bodyOverhang: 0,
  viewportOffset: 0,
  headerHeight: 60,
  headerPadding: 0,
  window: 0,
  div: 0,
  scrollbar: 0,
  scrolls: 'main',
  container: null,
}
const isHeader = element =>
  page.container !== null &&
  element.parentElement != null &&
  element.parentElement.parentElement === page.container

// Browsers round offsetHeight to an integer.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    return isHeader(this) ? Math.round(page.headerHeight) : 0
  },
})
HTMLElement.prototype.getBoundingClientRect = function () {
  const height = isHeader(this) ? page.headerHeight : 0
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width: 0,
    right: 0,
    height,
    bottom: height,
  }
}
// The visible height of whatever scrolls the page: the viewport without a
// horizontal scrollbar (innerHeight stays 768).
const visible = () => VIEWPORT - page.scrollbar
// A window's page: its position, and its viewport's visible and full height
// on its scrolling element: the root in a standards-mode document; the body
// in a quirks-mode one, where the root is as tall as the page (Chrome).
function standInPage(win, scrolls, quirks = false) {
  const doc = win.document
  const root = doc.documentElement
  Object.defineProperties(win, {
    pageYOffset: {
      configurable: true,
      // In the margin layouts the viewport can scroll by the body's margin,
      // and sits scrolled by it (Chrome: 477px of 469px, 8px).
      get: () =>
        page.scrolls === scrolls
          ? page.window
          : scrolls === 'main'
            ? page.viewportOffset
            : 0,
    },
  })
  Object.defineProperties(root, {
    clientHeight: {
      configurable: true,
      get: () => (quirks ? PAGE_HEIGHT : visible()),
    },
    // With the body as the scroller, the root does not scroll: its
    // scrollHeight is its clientHeight, plus the body's margins when the body
    // keeps the default 8px (Chrome: 477px of 469px).
    scrollHeight: {
      configurable: true,
      get: () =>
        page.scrolls === 'body' ? visible() + page.bodyMargin : PAGE_HEIGHT,
    },
  })
  Object.defineProperty(doc, 'scrollingElement', {
    configurable: true,
    get: () => (quirks ? doc.body : root),
  })
  // In quirks mode the body is the viewport's box: its scrollTop is the
  // page's position (CSSOM View).
  if (quirks)
    Object.defineProperties(doc.body, {
      clientHeight: { configurable: true, get: visible },
      scrollHeight: { configurable: true, get: () => PAGE_HEIGHT },
      scrollTop: {
        configurable: true,
        get: () => (page.scrolls === scrolls ? page.window : 0),
      },
    })
}
standInPage(window, 'main')
// The body as its own scroll container holds the position and is the
// viewport's height. Otherwise it grows with the page (Chrome: a body with
// overflow-x hidden under html overflow-y scroll is 3000px of 3000px), unless
// html, body { height: 100% } makes it the viewport's height, with the page
// overflowing it while the window scrolls (Chrome: 469px of 5000px).
Object.defineProperties(document.body, {
  scrollTop: {
    configurable: true,
    get: () => (page.scrolls === 'body' ? page.window : 0),
  },
  clientHeight: {
    configurable: true,
    get: () => (page.bodyFull ? visible() : PAGE_HEIGHT),
  },
  // html, body { overflow-x: hidden } with an element 40px past the body's
  // end: the body is a scroll container that overflows a little, while the
  // page scrolls (Chrome).
  scrollHeight: {
    configurable: true,
    get: () => PAGE_HEIGHT + page.bodyOverhang,
  },
})
const frameOf = () => {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  return iframe.contentWindow
}
const frameWindow = frameOf()
standInPage(frameWindow, 'frame')
const quirksWindow = frameOf()
standInPage(quirksWindow, 'quirks', true)

// The ResizeObserver stand-in. `observing` is every (observer, element) pair
// still observed, with the box it observes (content-box by default) and that
// box's size at the last notification. As in a browser, a pair is notified
// once after observe() and then only when its own box changes size, so a
// change of padding or border alone never reaches a content-box observer.
const observing = new Set()
const boxSize = (target, box) => {
  if (!isHeader(target)) return 0
  return box === 'border-box'
    ? page.headerHeight
    : page.headerHeight - page.headerPadding
}
const StandInResizeObserver = class {
  constructor(callback) {
    this.callback = callback
  }
  observe(target, options) {
    const box = (options && options.box) || 'content-box'
    observing.add({ observer: this, target, box, size: null, initial: true })
  }
  unobserve(target) {
    for (const entry of observing)
      if (entry.observer === this && entry.target === target)
        observing.delete(entry)
  }
  disconnect() {
    for (const entry of observing)
      if (entry.observer === this) observing.delete(entry)
  }
}

// What scrolls the page, by how parent() names it (pageAs), and the root's
// and the body's overflow-y for the body layouts.
const SCROLLS = {
  window: 'main',
  document: 'main',
  html: 'main',
  body: 'main',
  frame: 'frame',
  frameDocument: 'frame',
  frameQuirks: 'quirks',
  bodyScroller: 'body',
  bodyOverflow: 'main',
  bodyOverflowX: 'main',
  bodyFullHeight: 'main',
  bodyScrollerMargin: 'body',
  bodyClipBoth: 'main',
  bodyClipFull: 'body',
  bodyClipFullMargin: 'body',
  frameQuirksBody: 'quirks',
}
// Computed overflow-x and overflow-y of the root and the body (Chrome: one
// axis that is not visible makes a visible other axis auto).
const OVERFLOW = {
  bodyScroller: ['hidden', 'hidden', 'auto', 'auto'],
  bodyScrollerMargin: ['hidden', 'hidden', 'auto', 'auto'],
  bodyClipBoth: ['hidden', 'auto', 'hidden', 'auto'],
  bodyClipFull: ['hidden', 'auto', 'hidden', 'auto'],
  bodyClipFullMargin: ['hidden', 'auto', 'hidden', 'auto'],
  bodyOverflow: ['visible', 'visible', 'auto', 'auto'],
  bodyOverflowX: ['auto', 'scroll', 'hidden', 'auto'],
}

export async function createPage(plan) {
  observing.clear()
  globalThis.ResizeObserver = StandInResizeObserver
  // The history may run without a ResizeObserver, as an old browser does.
  if (!plan.params.resizeObserver) delete globalThis.ResizeObserver
  const div = document.createElement('div')
  Object.defineProperties(div, {
    scrollTop: { configurable: true, get: () => page.div },
    offsetHeight: { value: DIV.offset },
    clientHeight: { value: DIV.client },
    scrollHeight: { value: DIV.scroll },
  })
  const container = document.createElement('div')
  document.body.append(container, div)
  Object.assign(page, {
    container,
    headerHeight: plan.params.headerHeight,
    headerPadding: 0,
    scrollbar: plan.params.scrollbar,
    scrolls: SCROLLS[plan.mount.pageAs],
    bodyFull: [
      'bodyScroller',
      'bodyScrollerMargin',
      'bodyFullHeight',
      'bodyClipFull',
      'bodyClipFullMargin',
    ].includes(plan.mount.pageAs),
    bodyMargin: ['bodyScrollerMargin', 'bodyClipFullMargin'].includes(
      plan.mount.pageAs
    )
      ? 8
      : 0,
    bodyOverhang: plan.mount.pageAs === 'bodyClipBoth' ? 40 : 0,
    viewportOffset: ['bodyScrollerMargin', 'bodyClipFullMargin'].includes(
      plan.mount.pageAs
    )
      ? 8
      : 0,
    window: 0,
    div: 0,
  })
  page[plan.mount.parent] = plan.mount.y
  const overflow = OVERFLOW[plan.mount.pageAs] || ['', '', '', '']
  Object.assign(document.documentElement.style, {
    overflowX: overflow[0],
    overflowY: overflow[1],
  })
  Object.assign(document.body.style, {
    overflowX: overflow[2],
    overflowY: overflow[3],
  })
  const frameDocument = frameWindow.document
  const targets = new Map([
    [document, 'document'],
    [window, 'window'],
    [document.body, 'body'],
    [frameWindow, 'frame window'],
    [frameDocument, 'frame document'],
    [quirksWindow, 'frame window'],
    [quirksWindow.document, 'frame document'],
    [div, 'div'],
  ])
  return {
    container,
    div,
    pageTarget: {
      window,
      document,
      html: document.documentElement,
      body: document.body,
      frame: frameWindow,
      frameDocument,
      frameQuirks: quirksWindow,
      bodyScroller: document.body,
      bodyOverflow: document.body,
      bodyOverflowX: document.body,
      bodyFullHeight: document.body,
      bodyScrollerMargin: document.body,
      bodyClipBoth: document.body,
      bodyClipFull: document.body,
      bodyClipFullMargin: document.body,
      frameQuirksBody: quirksWindow.document.body,
    }[plan.mount.pageAs],
    realms: [window, frameWindow, quirksWindow],
    named: target =>
      targets.get(target) || (isHeader(target) ? 'header' : null),
    // A page's scroll fires at its document and bubbles to its window; an
    // element's scroll (the div, or a body that scrolls itself) fires at the
    // element and does not bubble.
    scrollTo(scroller, y) {
      page[scroller] = y
      const target =
        scroller === 'div'
          ? div
          : {
              main: document,
              frame: frameDocument,
              quirks: quirksWindow.document,
              body: document.body,
            }[page.scrolls]
      const realm = target.defaultView || window
      target.dispatchEvent(
        new realm.Event('scroll', {
          bubbles: target !== div && target !== document.body,
        })
      )
    },
    resizeHeader(content, padding) {
      page.headerHeight = content + padding
      page.headerPadding = padding
    },
    // jsdom has no layout to wait for.
    async layout() {},
    // One notification per observer for each observed element whose box is
    // due: the initial one after observe(), and one after its box changes.
    // Browsers have shipped three entry shapes: borderBoxSize as an array
    // (the standard), as a single object (Firefox before 92), or missing
    // (Safari before 15.4).
    deliver(shape) {
      const byObserver = new Map()
      for (const entry of observing) {
        const size = boxSize(entry.target, entry.box)
        if (!entry.initial && size === entry.size) continue
        entry.initial = false
        entry.size = size
        const border = boxSize(entry.target, 'border-box')
        const content = boxSize(entry.target, 'content-box')
        byObserver.set(entry.observer, [
          ...(byObserver.get(entry.observer) || []),
          entryOf(entry.target, border, content, shape),
        ])
      }
      for (const [observer, records] of byObserver)
        observer.callback(records, observer)
    },
    observers: () => observing.size,
    release() {
      for (const element of [document.documentElement, document.body])
        Object.assign(element.style, { overflowX: '', overflowY: '' })
      page.scrolls = 'main'
      page.container = null
      container.remove()
      div.remove()
    },
  }
}
