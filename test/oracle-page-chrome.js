// The Chrome page of the headroom oracle (ORACLE_BROWSER=chrome): the same
// page as test/oracle-page-jsdom.js, laid out by Chrome. The page, the
// scrolling div, two iframes (a standards and a quirks-mode document) and the
// body layouts are Chrome's; header heights come from CSS (the content's
// height, or the header's padding); scroll positions, the targets where scroll
// events fire, getComputedStyle and ResizeObserver's notifications are
// Chrome's. The driver still owns time: frames come from ./oracle-frames.js,
// timeouts from the page clock, and ResizeObserver notifications, which
// Chrome computes at its own frames, are delivered when the driver says.
//
// Three things Chrome cannot produce here are stood in, only in the histories
// that need them: a position past either end (the macOS and iOS overscroll
// bounce; Chrome clamps scrolling), a fractional position (browser zoom;
// Chrome rounds to whole pixels at this scale), and other browsers'
// ResizeObserver entry shapes.
import { realFrame } from './oracle-frames.js'
import {
  DIV,
  PAGE_HEIGHT,
  SCROLLBAR,
  VIEWPORT,
  entryOf,
} from './oracle-geometry.js'

const frame = () => new Promise(resolve => realFrame(resolve))
const css = (element, text) => (element.style.cssText = text)

// A 3000px page (content in the flow, as a page has), and a wide element
// that gives a horizontal scrollbar when shown.
function fill(doc) {
  css(doc.body, 'margin:0;position:relative')
  const spacer = doc.createElement('div')
  css(spacer, `height:${PAGE_HEIGHT}px`)
  const wide = doc.createElement('div')
  css(
    wide,
    'position:absolute;top:0;left:0;width:3000px;height:1px;display:none'
  )
  doc.body.append(spacer, wide)
  return wide
}
const mainWide = fill(document)
const overhang = document.createElement('div')
css(
  overhang,
  'position:absolute;bottom:-40px;left:0;width:1px;height:40px;display:none'
)
document.body.append(overhang)
const div = document.createElement('div')
css(
  div,
  `position:absolute;top:0;left:0;width:100px;height:${DIV.client}px;border:10px solid;overflow:auto;opacity:0`
)
div.innerHTML = `<div style="height:${DIV.scroll}px"></div>`
document.body.append(div)
function frameOf(doctype) {
  const iframe = document.createElement('iframe')
  css(
    iframe,
    `position:absolute;top:0;left:0;width:800px;height:${VIEWPORT}px;border:0;opacity:0;pointer-events:none`
  )
  document.body.append(iframe)
  const doc = iframe.contentDocument
  doc.open()
  doc.write(`${doctype}<html><head></head><body></body></html>`)
  doc.close()
  return { win: iframe.contentWindow, doc, wide: fill(doc) }
}
// The header's size, by the plan: its content (the h1 inside it) and its top
// padding. A stylesheet sizes the header from its first render, and any
// header element that replaces it.
const sizes = document.createElement('style')
document.head.append(sizes)
const size = (content, padding) => {
  sizes.textContent = `#oracle-root > * > * { padding-top: ${padding}px }
#oracle-root > * > * > h1 { margin: 0; height: ${content}px }`
}

const standard = frameOf('<!doctype html>')
const quirks = frameOf('')
const realms = [window, standard.win, quirks.win]

// Chrome's own scroll events never reach production: the driver dispatches
// the events, at the targets Chrome is measured to use (calibrate below).
let blocking = true
for (const realm of realms)
  realm.addEventListener(
    'scroll',
    event => {
      if (blocking && event.isTrusted) event.stopImmediatePropagation()
    },
    true
  )

// A scroller: how to set its real position, and the properties that read it,
// which stand in a position Chrome cannot hold.
function scrollerOf(target, set, props) {
  const saved = props.map(prop => [
    prop,
    Object.getOwnPropertyDescriptor(target, prop),
  ])
  const clear = () => {
    for (const [prop, descriptor] of saved)
      if (descriptor) Object.defineProperty(target, prop, descriptor)
      else delete target[prop]
  }
  return {
    clear,
    set,
    place(y, max) {
      clear()
      const real = Math.min(max, Math.max(0, Math.round(y)))
      set(real)
      if (real !== y)
        for (const prop of props)
          Object.defineProperty(target, prop, {
            configurable: true,
            get: () => y,
          })
    },
  }
}
const windowScroller = win =>
  scrollerOf(win, y => win.scrollTo(0, y), ['pageYOffset', 'scrollY'])
const elementScroller = element =>
  scrollerOf(element, y => (element.scrollTop = y), ['scrollTop'])
const SCROLLERS = {
  main: windowScroller(window),
  frame: windowScroller(standard.win),
  quirks: windowScroller(quirks.win),
  body: elementScroller(document.body),
  div: elementScroller(div),
}

// Each layout: what parent() returns, what scrolls the page, and the root's
// and the body's styles.
const LAYOUTS = {
  window: { parent: window, scrolls: 'main' },
  document: { parent: document, scrolls: 'main' },
  html: { parent: document.documentElement, scrolls: 'main' },
  body: { parent: document.body, scrolls: 'main' },
  frame: { parent: standard.win, scrolls: 'frame' },
  frameDocument: { parent: standard.doc, scrolls: 'frame' },
  frameQuirks: { parent: quirks.win, scrolls: 'quirks' },
  bodyScroller: {
    parent: document.body,
    scrolls: 'body',
    root: 'overflow:hidden;height:100%',
    body: 'margin:0;overflow:auto;height:100%',
  },
  bodyScrollerMargin: {
    parent: document.body,
    scrolls: 'body',
    root: 'overflow:hidden;height:100%',
    body: 'margin:8px;overflow:auto;height:100%',
    viewportOffset: 8,
  },
  bodyOverflow: {
    parent: document.body,
    scrolls: 'main',
    body: 'margin:0;overflow-y:auto',
  },
  bodyOverflowX: {
    parent: document.body,
    scrolls: 'main',
    root: 'overflow-y:scroll',
    body: 'margin:0;overflow-x:hidden',
  },
  bodyFullHeight: {
    parent: document.body,
    scrolls: 'main',
    root: 'height:100%',
    body: 'margin:0;height:100%',
  },
  // html, body { overflow-x: hidden }, and an element 40px past the body's
  // end: the body is a scroll container that overflows a little.
  bodyClipBoth: {
    parent: document.body,
    scrolls: 'main',
    root: 'overflow-x:hidden',
    body: 'margin:0;overflow-x:hidden',
    overhang: true,
  },
  // html, body { overflow-x: hidden; height: 100% }: both overflow-y are
  // auto, the root is exactly the viewport, and the body scrolls itself.
  bodyClipFull: {
    parent: document.body,
    scrolls: 'body',
    root: 'overflow-x:hidden;height:100%',
    body: 'margin:0;overflow-x:hidden;height:100%',
  },
  // The same with the body's default margin: the root overflows by it, so
  // the viewport can scroll 8px too (Chrome: 477px of 469px), while the body
  // scrolls the page's content.
  bodyClipFullMargin: {
    parent: document.body,
    scrolls: 'body',
    root: 'overflow-x:hidden;height:100%',
    body: 'margin:8px;overflow-x:hidden;height:100%',
    viewportOffset: 8,
  },
  // A quirks-mode document's body: the page's scrolling element.
  frameQuirksBody: { parent: quirks.doc.body, scrolls: 'quirks' },
}

// Where Chrome fires a scroller's scroll events in a layout, measured once: a
// real scroll with the blocker off, recording each trusted event's target and
// whether it bubbles.
const calibrated = new Map()
async function calibrate(key, scroller) {
  if (calibrated.has(key)) return calibrated.get(key)
  const seen = []
  const record = event => {
    if (event.isTrusted)
      seen.push({ target: event.target, bubbles: event.bubbles })
  }
  scroller.clear()
  scroller.set(0)
  await frame()
  await frame()
  blocking = false
  for (const realm of realms) realm.addEventListener('scroll', record, true)
  scroller.set(5)
  await frame()
  await frame()
  for (const realm of realms) realm.removeEventListener('scroll', record, true)
  blocking = true
  scroller.set(0)
  await frame()
  await frame()
  if (seen.length === 0)
    throw new Error(`Chrome fired no scroll event for ${key}`)
  calibrated.set(key, seen)
  return seen
}

// Chrome's ResizeObserver, wrapped so notifications wait for the driver.
// `observing` is every (observer, element) pair still observed.
const NativeResizeObserver = window.ResizeObserver
const observing = new Set()
let queued = []
class DriverResizeObserver {
  constructor(callback) {
    this.callback = callback
    this.native = new NativeResizeObserver(entries =>
      queued.push({ observer: this, entries })
    )
  }
  observe(target, options) {
    observing.add({ observer: this, target })
    this.native.observe(target, options)
  }
  unobserve(target) {
    for (const entry of observing)
      if (entry.observer === this && entry.target === target)
        observing.delete(entry)
    this.native.unobserve(target)
  }
  disconnect() {
    for (const entry of observing)
      if (entry.observer === this) observing.delete(entry)
    this.native.disconnect()
    queued = queued.filter(q => q.observer !== this)
  }
}

export async function createPage(plan) {
  if (window.innerHeight !== VIEWPORT)
    throw new Error(
      `the oracle needs a ${VIEWPORT}px viewport, not ${window.innerHeight}px`
    )
  const layout = LAYOUTS[plan.mount.pageAs]
  css(document.documentElement, layout.root || '')
  css(document.body, `margin:0;position:relative;${layout.body || ''}`)
  css(quirks.doc.documentElement, layout.frameRoot || '')
  css(quirks.doc.body, layout.frameBody || 'margin:0;position:relative')
  overhang.style.display = layout.overhang ? 'block' : 'none'
  const scrollbar = plan.params.scrollbar > 0
  for (const wide of [mainWide, standard.wide, quirks.wide])
    wide.style.display = scrollbar ? 'block' : 'none'
  for (const scroller of Object.values(SCROLLERS)) {
    scroller.clear()
    scroller.set(0)
  }
  observing.clear()
  queued = []
  globalThis.ResizeObserver = DriverResizeObserver
  if (!plan.params.resizeObserver) delete globalThis.ResizeObserver
  // The header's container is out of the flow, so its height is not the
  // page's.
  const container = document.createElement('div')
  container.id = 'oracle-root'
  css(container, 'position:absolute;top:0;left:0;right:0')
  document.body.prepend(container)
  size(plan.params.headerHeight, 0)
  const pageScroller = SCROLLERS[layout.scrolls]
  const targets = {
    window: await calibrate(`${plan.mount.pageAs} page`, pageScroller),
    div: await calibrate('div', SCROLLERS.div),
  }
  // The horizontal scrollbar of what scrolls is Chrome's own: it must be the
  // plan's, 15px or none.
  const visibleOf = {
    main: () => document.documentElement.clientHeight,
    frame: () => standard.doc.documentElement.clientHeight,
    quirks: () => quirks.doc.body.clientHeight,
    body: () => document.body.clientHeight,
  }
  const boxOf = {
    main: () => window.innerHeight,
    frame: () => VIEWPORT,
    quirks: () => VIEWPORT,
    body: () => document.body.getBoundingClientRect().height,
  }
  const measured = boxOf[layout.scrolls]() - visibleOf[layout.scrolls]()
  const owed = plan.params.scrollbar > 0 ? SCROLLBAR : 0
  if (measured !== owed)
    throw new Error(
      `${plan.mount.pageAs}: the horizontal scrollbar is ${measured}px, not ${owed}px`
    )
  const largest = scroller =>
    scroller === 'div'
      ? DIV.scroll - DIV.client
      : PAGE_HEIGHT - VIEWPORT + plan.params.scrollbar
  const scrollers = { window: pageScroller, div: SCROLLERS.div }
  scrollers[plan.mount.parent]?.place(plan.mount.y, largest(plan.mount.parent))
  // In the margin layouts the viewport can scroll by the body's margin (8px),
  // and sits scrolled by it.
  if (layout.viewportOffset) SCROLLERS.main.set(layout.viewportOffset)
  const header = () => container.firstElementChild?.firstElementChild ?? null
  const names = new Map([
    [document, 'document'],
    [window, 'window'],
    [document.body, 'body'],
    [standard.win, 'frame window'],
    [standard.doc, 'frame document'],
    [quirks.win, 'frame window'],
    [quirks.doc, 'frame document'],
    [div, 'div'],
  ])
  return {
    container,
    div,
    pageTarget: layout.parent,
    realms,
    named: target =>
      names.get(target) ||
      (target !== null && target === header() ? 'header' : null),
    scrollTo(scroller, y) {
      scrollers[scroller].place(y, largest(scroller))
      for (const { target, bubbles } of targets[scroller]) {
        const realm = (target.ownerDocument || target).defaultView || target
        target.dispatchEvent(new realm.Event('scroll', { bubbles }))
      }
    },
    resizeHeader: size,
    // Let Chrome run a frame: its layout, and its ResizeObserver
    // notifications, which then wait for deliver(). A size change that the
    // header's own transition animates (its inline transition is `all`)
    // lands first: the model's heights are where a change lands.
    async layout() {
      const element = header()
      if (element !== null)
        for (const animation of element.getAnimations()) animation.finish()
      await frame()
    },
    deliver(shape) {
      for (const { observer, entries } of queued.splice(0))
        observer.callback(
          entries.map(entry =>
            entryOf(
              entry.target,
              entry.borderBoxSize[0].blockSize,
              entry.contentBoxSize[0].blockSize,
              shape
            )
          ),
          observer
        )
    },
    observers: () => observing.size,
    release() {
      for (const scroller of Object.values(SCROLLERS)) scroller.clear()
      css(document.documentElement, '')
      css(document.body, 'margin:0;position:relative')
      css(quirks.doc.documentElement, '')
      css(quirks.doc.body, 'margin:0;position:relative')
      globalThis.ResizeObserver = DriverResizeObserver
      container.remove()
    },
  }
}
