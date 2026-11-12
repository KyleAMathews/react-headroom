// The history grammar, the model, and the drivers of the headroom oracle
// (test/headroom.oracle.js). It registers no tests. The oracle file states the
// laws; this module holds the parts they share. See the oracle file's opening
// comment for what each law promises.
import { vi } from 'vitest'
import fc from 'fast-check'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { differs, useOracleClock, violation } from '@tanstack/oracles'
import Headroom, { useHeadroom } from '../src/index.js'
import { frames } from './oracle-frames.js'

// ---------------------------------------------------------------------------
// The browser stand-ins. jsdom computes no layout, runs its own animation
// frames on a timer, and has no ResizeObserver, so the driver owns all three.
// Frames come from ./oracle-frames.js. The header is the element two levels
// under the history's container (container > wrapper > header), for both the
// component and the hook driver; it is `page.headerHeight` tall, and browsers
// round offsetHeight to an integer. The window scrolls a 3000px page in a
// 768px viewport; the div scrolls 2500px in a 500px box with a 10px border.
// ---------------------------------------------------------------------------

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const PAGE_HEIGHT = 3000
const VIEWPORT = 768 // jsdom's innerHeight
const DIV = { client: 500, offset: 520, scroll: 2500 }
// The bottom-most in-bounds position of each scroller.
const MAX = {
  window: PAGE_HEIGHT - VIEWPORT,
  div: DIV.scroll - DIV.client,
  none: 0,
}
export const MAX_Y = MAX.window
// The bottom-most position of each scroller in one history: a horizontal
// scrollbar takes its height from the window's visible area (innerHeight
// still includes it), so the page scrolls that much further.
const maxOf = params => ({ ...MAX, window: MAX.window + params.scrollbar })
export const OVERSCROLL = 80

const page = {
  headerHeight: 60,
  window: 0,
  div: 0,
  scrollbar: 0,
  container: null,
}
const isHeader = element =>
  page.container !== null &&
  element.parentElement != null &&
  element.parentElement.parentElement === page.container
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
for (const element of [document.body, document.documentElement]) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => PAGE_HEIGHT,
  })
}
Object.defineProperty(window, 'pageYOffset', {
  configurable: true,
  get: () => page.window,
})
// The viewport without a horizontal scrollbar; innerHeight stays 768.
Object.defineProperty(document.documentElement, 'clientHeight', {
  configurable: true,
  get: () => VIEWPORT - page.scrollbar,
})

// The ResizeObserver stand-in. `observing` is every (observer, element) pair
// still observed; the driver reads it to deliver notifications and to check
// cleanup. Browsers have shipped three entry shapes: borderBoxSize as an array
// (the standard), as a single object (Firefox before 92), or missing (Safari
// before 15.4).
const observing = new Set()
const StandInResizeObserver = class {
  constructor(callback) {
    this.callback = callback
  }
  observe(target) {
    observing.add({ observer: this, target, initial: true })
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
globalThis.ResizeObserver = StandInResizeObserver
// Deliver one notification per observer for each observed element, as a
// browser does after layout: the initial one after observe(), and one after a
// size change.
function deliverResizes(onlyInitial, shape) {
  const byObserver = new Map()
  for (const entry of observing) {
    if (onlyInitial && !entry.initial) continue
    entry.initial = false
    const height = isHeader(entry.target) ? page.headerHeight : 0
    const size = { blockSize: height, inlineSize: 0 }
    const record = {
      target: entry.target,
      contentRect: {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width: 0,
        height,
        right: 0,
        bottom: height,
      },
    }
    if (shape === 'array') {
      record.borderBoxSize = [size]
      record.contentBoxSize = [size]
    } else if (shape === 'object') {
      record.borderBoxSize = size
      record.contentBoxSize = size
    }
    byObserver.set(entry.observer, [
      ...(byObserver.get(entry.observer) || []),
      record,
    ])
  }
  for (const [observer, records] of byObserver)
    observer.callback(records, observer)
}

const other = scroller => (scroller === 'window' ? 'div' : 'window')
// A parent change: window -> div -> none (a ref whose element went away) ->
// window. With no parent, nothing scrolls the header.
const nextParent = { window: 'div', div: 'none', none: 'window' }

// The class names the docs give, by the keys of the `classNames` prop. A
// renamed key renders as `x-<default>`. The wrapper's state classes are the
// wrapper name plus `--<state>`.
export const CLASS_KEYS = {
  wrapper: 'headroom-wrapper',
  header: 'headroom',
  unfixed: 'headroom--unfixed',
  pinned: 'headroom--pinned',
  unpinned: 'headroom--unpinned',
  scrolled: 'headroom--scrolled',
  bottom: 'headroom--bottom',
  disableAnimation: 'headroom-disable-animation',
}
const STATES = ['unfixed', 'pinned', 'unpinned']
export const renamedOf = params =>
  Object.keys(CLASS_KEYS).filter(key => params.classNames[key])

// The documented defaults (README, Props).
export const DOC_DEFAULTS = {
  upTolerance: 5,
  downTolerance: 0,
  pinStart: 0,
  disableInlineStyles: false,
  unpinnedOffset: null,
  matchScrollSpeed: false,
  calcHeightOnResize: true,
  wrapperHeight: null,
  classNames: Object.fromEntries(
    Object.keys(CLASS_KEYS).map(key => [key, false])
  ),
}

// ---------------------------------------------------------------------------
// The history grammar. A history is the props, the mount, a list of actions,
// and what is left pending at unmount. A scroll action moves a scroller by
// `move` px and is followed by a frame `gap` ms after the last one; `on:
// 'other'` scrolls the scroller that is not the parent. A toggle flips `pin`,
// `disable` or `calcHeightOnResize`, or swaps the parent between the window
// and a scrolling div. A resize sets the header's height (in quarter pixels),
// with or without a window resize event. A focus moves keyboard focus into the
// header. A call runs an instance method. `jitter` adds an earlier scroll event
// at another position in the same frame. `settle` says whether pending
// timeouts run before the next step: the browser may order them either way.
// Mount parent `late` is the div, returned by `parent()` only after mount, as
// a ref is. The props vary the tolerances, pinStart, inline styles,
// unpinnedOffset, a renaming of any class, matchScrollSpeed, a wrapperStyle
// height, calcHeightOnResize, whether a ResizeObserver exists, and its entry
// shape.
// ---------------------------------------------------------------------------

export function historiesOf({
  mountY = fc.constant(0),
  mountPin = fc.constant(false),
  mountDisable = fc.constant(false),
  mountParent = fc.constant('window'),
  scrollOn = ['parent'],
  toggles = [],
  resizes = false,
  focus = false,
  calls = false,
  nudges = false,
  swaps = false,
  rerenders = false,
  drops = true,
  pending = fc.constant('none'),
  // How parent() names the page: the window, or the document, its root
  // element or the body, which all scroll with it.
  pageAs = fc.constant('window'),
  matchScrollSpeed = fc.boolean(),
  calcHeightOnResize = fc.constant(true),
  params,
}) {
  const scroll = fc.record({
    kind: fc.constant('scroll'),
    on: fc.constantFrom(...scrollOn),
    move: fc.oneof(
      fc.integer({ min: -12, max: 12 }),
      fc.integer({ min: -400, max: 400 })
    ),
    jitter: fc.option(fc.integer({ min: 0, max: MAX_Y }), { nil: null }),
    // A fractional part, as browser zoom gives scroll positions.
    fraction: fc.constantFrom(0, 0.4),
    // ms since the last frame: steady scrolling, or a pause (101 and 3000).
    gap: fc.constantFrom(16, 33, 100, 101, 3000),
    settle: fc.boolean(),
  })
  const others = [
    toggles.length > 0 &&
      fc.record({
        kind: fc.constant('toggle'),
        prop: fc.constantFrom(...toggles),
        // A scroll event whose frame is still pending when the props change.
        nudge: nudges
          ? fc.option(fc.integer({ min: -400, max: 400 }), { nil: null })
          : fc.constant(null),
        settle: fc.boolean(),
      }),
    // A re-render with the same props (a parent component rendering again).
    rerenders &&
      fc.record({ kind: fc.constant('rerender'), settle: fc.boolean() }),
    swaps &&
      fc.record({
        kind: fc.constant('swap'),
        // The new header element, or none (the header unmounted).
        drop: drops ? fc.boolean() : fc.constant(false),
        // A window resize whose frame is still pending when it happens.
        resizeFirst: fc.boolean(),
        settle: fc.boolean(),
      }),
    resizes &&
      fc.record({
        kind: fc.constant('resize'),
        height: fc.integer({ min: 20, max: 120 }),
        quarters: fc.integer({ min: 0, max: 3 }),
        window: fc.boolean(),
        settle: fc.boolean(),
      }),
    focus && fc.record({ kind: fc.constant('focus'), settle: fc.boolean() }),
    calls &&
      fc.record({
        kind: fc.constant('call'),
        method: fc.constantFrom('pin', 'unpin', 'unfix'),
        settle: fc.boolean(),
      }),
  ].filter(Boolean)
  const action =
    others.length === 0
      ? scroll
      : fc.oneof(
          { arbitrary: scroll, weight: 4 },
          ...others.map(arbitrary => ({ arbitrary, weight: 1 }))
        )
  return fc.record({
    params:
      params ||
      fc.record({
        headerHeight: fc.integer({ min: 20, max: 120 }),
        pinStart: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 150 })),
        upTolerance: fc.integer({ min: 0, max: 10 }),
        downTolerance: fc.integer({ min: 0, max: 10 }),
        disableInlineStyles: fc.boolean(),
        unpinnedOffset: fc.option(
          fc.oneof(
            fc.integer({ min: 0, max: 120 }),
            fc.constantFrom(
              '50%',
              '100%',
              '2rem',
              '0',
              'calc(100% + 8px)',
              'var(--offset, 2rem)',
              '-1rem'
            )
          ),
          {
            nil: null,
          }
        ),
        classNames: fc.record(
          Object.fromEntries(
            Object.keys(CLASS_KEYS).map(key => [key, fc.boolean()])
          )
        ),
        matchScrollSpeed,
        calcHeightOnResize,
        resizeObserver: fc.boolean(),
        strictMode: fc.boolean(),
        // A horizontal scrollbar on the page, in px.
        scrollbar: fc.constantFrom(0, 15),
        resizeEntries: fc.constantFrom('array', 'object', 'contentRect'),
        wrapperHeight: fc.option(fc.constantFrom('0px', '100px', 'auto'), {
          nil: null,
        }),
      }),
    mount: fc.record({
      y: mountY,
      pin: mountPin,
      disable: mountDisable,
      parent: mountParent,
      pageAs,
    }),
    actions: fc.array(action, { maxLength: 14 }),
    pending,
  })
}

export const anywhere = fc.integer({ min: 0, max: MAX_Y })
export const either = fc.boolean()
export const everyParent = fc.constantFrom('window', 'div')

// Builders for constructed histories. Each value stays inside the grammar.
export const sc = (
  move,
  settle = true,
  on = 'parent',
  gap = 16,
  fraction = 0
) => ({
  kind: 'scroll',
  on,
  move,
  jitter: null,
  fraction,
  gap,
  settle,
})
export const tg = (prop, settle = true, nudge = null) => ({
  kind: 'toggle',
  prop,
  nudge,
  settle,
})
export const rs = (height, quarters, onWindow, settle = true) => ({
  kind: 'resize',
  height,
  quarters,
  window: onWindow,
  settle,
})
export const fo = (settle = true) => ({ kind: 'focus', settle })
export const call = (method, settle = true) => ({
  kind: 'call',
  method,
  settle,
})
export const top = {
  y: 0,
  pin: false,
  disable: false,
  parent: 'window',
  pageAs: 'window',
}
// A move down that hides the header from anywhere near the top.
export const far = p => p.headerHeight + p.pinStart + p.downTolerance + 50
// Hide, show, then return to the top, so the header unfixes from pinned.
export function hideShowTop(p, settleAtTop) {
  const shown = far(p) - (p.upTolerance + 1)
  return [sc(far(p)), sc(-(p.upTolerance + 1)), sc(-shown, settleAtTop)]
}

// The plan: positions resolved per scroller, the props, header height and
// frame time in force at each step. The model and the checks read only this.
// Positions stay in each scroller's bounds, or reach up to `overscroll` px
// past either end.
export const resolveWithin = overscroll => history => {
  const { params, mount } = history
  const parentAtMount = mount.parent === 'late' ? 'div' : mount.parent
  const MAX = maxOf(params)
  const at = { window: 0, div: 0, none: 0 }
  at[parentAtMount] = Math.min(mount.y, MAX[parentAtMount])
  const mountY = at[parentAtMount]
  const props = {
    pin: mount.pin,
    disable: mount.disable,
    parent: parentAtMount,
    calcHeightOnResize: params.calcHeightOnResize,
  }
  let headerHeight = params.headerHeight
  let headerPresent = true
  // The mount's first frame is at 16ms.
  let time = 16
  const steps = history.actions.map(action => {
    const base = { kind: action.kind, settle: action.settle }
    time += action.kind === 'scroll' ? action.gap : 16
    if (action.kind === 'scroll') {
      const scroller =
        action.on === 'parent' && props.parent !== 'none'
          ? props.parent
          : other(props.parent)
      at[scroller] = Math.min(
        MAX[scroller] + overscroll,
        Math.max(-overscroll, Math.round(at[scroller]) + action.move)
      )
      if (at[scroller] >= 0) at[scroller] += action.fraction
      Object.assign(base, {
        scroller,
        y: at[scroller],
        max: MAX[scroller],
        jitter: action.jitter,
        gap: action.gap,
      })
    } else if (action.kind === 'toggle') {
      if (action.nudge !== null && props.parent !== 'none') {
        const scroller = props.parent
        at[scroller] = Math.min(
          MAX[scroller],
          Math.max(0, at[scroller] + action.nudge)
        )
        Object.assign(base, { nudgeScroller: scroller, nudgeY: at[scroller] })
      }
      props[action.prop] =
        action.prop === 'parent'
          ? nextParent[props.parent]
          : !props[action.prop]
      base.prop = action.prop
    } else if (action.kind === 'resize') {
      headerHeight = action.height + action.quarters / 4
      // Without a ResizeObserver only a window resize can reveal a new
      // height, so in that dimension every resize comes with one.
      Object.assign(base, {
        height: headerHeight,
        window: action.window || !params.resizeObserver,
      })
    } else if (action.kind === 'call') {
      base.method = action.method
    } else if (action.kind === 'swap') {
      Object.assign(base, {
        drop: action.drop,
        resizeFirst: action.resizeFirst,
      })
      headerPresent = !action.drop
    }
    base.headerPresent = headerPresent
    return {
      ...base,
      props: { ...props },
      parentY: at[props.parent],
      parentMax: MAX[props.parent],
      headerHeight,
      time,
    }
  })
  return {
    params,
    mount: {
      ...mount,
      y: mountY,
      parent: parentAtMount,
      late: mount.parent === 'late',
    },
    steps,
    pending: history.pending,
  }
}
export const resolve = resolveWithin(0)

// The header height the component has measured at each checkpoint (L2, L19):
// measured at mount, followed after every change while calcHeightOnResize is
// on, and measured again when it turns on. The wrapper owes it unless
// wrapperStyle.height is given; the scroll rule's thresholds read it.
function measuredHeights(plan) {
  let measured = plan.params.headerHeight
  const heights = [measured]
  for (const step of plan.steps) {
    if (step.kind === 'resize' && step.props.calcHeightOnResize)
      measured = step.headerHeight
    if (
      step.kind === 'toggle' &&
      step.prop === 'calcHeightOnResize' &&
      step.props.calcHeightOnResize
    )
      measured = step.headerHeight
    heights.push(measured)
  }
  return heights
}
export const wrapperHeights = plan =>
  measuredHeights(plan).map(h =>
    plan.params.wrapperHeight === null ? `${h}px` : plan.params.wrapperHeight
  )

// ---------------------------------------------------------------------------
// The model of the scroll rule (L1; L6 through the parent, L8 through bounds,
// L9 through focus, L11 through the bottom, L14 through frame times, L15
// through calls). Its state is the header's state, the reference (position
// and time of the last in-bounds frame), and whether that frame was at the
// bottom. Each rule below is one clause of a law; the order is the laws':
// overscroll first, then pinStart, then hiding, then showing.
// ---------------------------------------------------------------------------

// L14: a transition lasts headerHeight ÷ the frame's speed, clamped to
// 100-400ms, with matchScrollSpeed; 200ms without it. A first frame has no
// previous frame, so its gap is taken as 16ms.
function transitionMs(p, state, moved, time, height) {
  if (!p.matchScrollSpeed) return 200
  // A frame more than 100ms after the last one starts a new scroll: one frame.
  const since = state.lastTime === null ? Infinity : time - state.lastTime
  const gap = since > 100 ? 16 : since
  return Math.min(
    400,
    Math.max(100, Math.round((height * gap) / Math.abs(moved)))
  )
}

function frame(p, state, y, time, max, height) {
  const moved = y - state.lastY
  // L8: overscroll is more than 1px past either end (zoom rounding is less).
  const inBounds = y >= -1 && y <= max + 1
  const next = (mode, rule, animated) => ({
    state: inBounds
      ? { mode, lastY: y, lastTime: time, bottom: y >= max - 1 }
      : { ...state, mode },
    entry: {
      mode,
      snap: state.mode === 'unfixed' && mode === 'unpinned',
      rule,
      from: state.mode,
      moved,
      y,
      bottom: inBounds ? y >= max - 1 : state.bottom,
      ms:
        animated && mode !== state.mode
          ? transitionMs(p, state, moved, time, height)
          : null,
    },
  })
  // L8: a frame past either end changes nothing, not even the reference.
  if (!inBounds) return next(state.mode, 'overscroll', false)
  if (y <= p.pinStart) return next('unfixed', 'unfix', false)
  if (
    y > height + p.pinStart &&
    (state.mode === 'unfixed' ? moved > 0 : moved > p.downTolerance)
  ) {
    // From unfixed the in-place header has already scrolled out of view, so it
    // hides at any speed and without a transition; downTolerance guards only a
    // visible pinned header.
    return next('unpinned', 'hide', state.mode !== 'unfixed')
  }
  // Showing applies only to a header that slid out; an unfixed header is in place.
  if (state.mode === 'unpinned' && -moved > p.upTolerance)
    return next('pinned', 'show fast', true)
  // Inside the header's region: where it sits in the page, up to pinStart + height.
  if (state.mode === 'unpinned' && moved < 0 && y <= height + p.pinStart)
    return next('pinned', 'show inside', true)
  return next(state.mode, 'none', false)
}

const CALLED = { pin: 'pinned', unpin: 'unpinned', unfix: 'unfixed' }

// Every path the rules allow. A frame happens only when the current parent
// scrolls. Attaching to a scroller (a parent change, or disable turning off)
// makes its position the reference (L6). Where a frame left pending by the old
// parent may or may not run against the new one, the path forks. Paths with
// the same past and the same state merge.
export function scrollRule(plan) {
  const p = plan.params
  // L6: attaching while unfixed past the header's region hides the header
  // (without a transition), so the next scroll up can show it.
  const past = (y, height) => y > height + p.pinStart
  const hidesOnAttach = (mode, y, height, props) =>
    mode === 'unfixed' && !props.pin && !props.disable && past(y, height)
  const mountMode = hidesOnAttach(
    'unfixed',
    plan.mount.y,
    p.headerHeight,
    plan.mount
  )
    ? 'unpinned'
    : 'unfixed'
  let paths = [
    {
      state: {
        mode: mountMode,
        lastY: plan.mount.y,
        lastTime: null,
        bottom: false,
      },
      entries: [],
    },
  ]
  const heights = measuredHeights(plan)
  plan.steps.forEach((step, index) => {
    const next = []
    for (const path of paths) {
      const still = {
        mode: path.state.mode,
        snap: false,
        rule: 'none',
        bottom: path.state.bottom,
        ms: null,
      }
      const keep = (state, entry) =>
        next.push({ state, entries: [...path.entries, entry] })
      if (step.kind === 'scroll' && step.props.disable) {
        // Disabled: nothing listens to the scroller.
        keep(path.state, still)
      } else if (
        step.kind === 'scroll' &&
        step.scroller === step.props.parent
      ) {
        // The thresholds read the height measured before this frame.
        const { state, entry } = frame(
          p,
          path.state,
          step.y,
          step.time,
          step.max,
          heights[index]
        )
        keep(state, entry)
      } else if (step.kind === 'scroll') {
        keep(path.state, still)
      } else if (step.kind === 'focus' && !step.headerPresent) {
        // No header element: there is nothing to focus.
        keep(path.state, still)
      } else if (step.kind === 'focus') {
        // L9: focus moving into a hidden header shows it.
        const mode = path.state.mode === 'unpinned' ? 'pinned' : path.state.mode
        keep(
          { ...path.state, mode },
          { ...still, mode, rule: 'focus', from: path.state.mode }
        )
      } else if (step.kind === 'call') {
        // L15: an instance method moves the header into its state; a call that
        // names the current state does nothing. The reference stays.
        const mode = CALLED[step.method]
        keep(
          { ...path.state, mode },
          {
            ...still,
            mode,
            rule: 'call',
            from: path.state.mode,
            ms: mode !== path.state.mode && mode !== 'unfixed' ? 200 : null,
          }
        )
      } else if (step.kind === 'toggle' && step.prop === 'parent') {
        // L6: attaching to a scroller makes its current position the
        // reference, and the next frame a first frame.
        const reattached = {
          ...path.state,
          lastY: step.parentY,
          lastTime: null,
        }
        const hide =
          step.props.parent !== 'none' &&
          hidesOnAttach(
            reattached.mode,
            step.parentY,
            heights[index],
            step.props
          )
        const attached = hide ? { ...reattached, mode: 'unpinned' } : reattached
        keep(
          attached,
          hide
            ? {
                ...still,
                mode: 'unpinned',
                snap: true,
                rule: 'attach',
                from: path.state.mode,
              }
            : still
        )
        // A frame the old parent's scroll left pending may run against the
        // new parent; with no parent it does nothing.
        if (step.nudgeY !== undefined && step.props.parent !== 'none') {
          const { state, entry } = frame(
            p,
            attached,
            step.parentY,
            step.time,
            step.parentMax,
            heights[index]
          )
          keep(state, entry)
        }
      } else if (step.kind === 'toggle' && step.prop === 'disable') {
        // L5: disabling unfixes; L6: enabling attaches again.
        const enabled = { ...path.state, lastY: step.parentY, lastTime: null }
        const state = step.props.disable
          ? { ...path.state, mode: 'unfixed' }
          : hidesOnAttach(
                enabled.mode,
                step.parentY,
                heights[index],
                step.props
              )
            ? { ...enabled, mode: 'unpinned' }
            : enabled
        keep(state, {
          ...still,
          mode: state.mode,
          rule: 'disable',
          from: path.state.mode,
        })
      } else if (
        step.kind === 'resize' ||
        step.kind === 'swap' ||
        step.kind === 'rerender'
      ) {
        keep(path.state, still)
      } else {
        throw new Error(
          `the scroll rule does not cover ${step.kind} ${step.prop || ''}`
        )
      }
    }
    const seen = new Map()
    for (const path of next) {
      seen.set(
        JSON.stringify([
          path.state,
          path.entries.map(e => [e.mode, e.snap, e.bottom, e.ms]),
        ]),
        path
      )
    }
    paths = [...seen.values()]
  })
  return { mount: mountMode, paths: paths.map(path => path.entries) }
}

// ---------------------------------------------------------------------------
// The drivers. `drive` mounts the real <Headroom>; `driveHook` mounts a header
// built on the real useHeadroom; the `Bare` drivers pass no optional props at
// all, only the callbacks. All play the same plan and record after the mount's
// first frame and after every step: the state, the classes (mapped back to
// their default names), the inline position, box, transform and transition,
// the wrapper height, the listeners attached, the renders since the last
// checkpoint, and the callbacks fired since the last checkpoint. At the end
// each leaves the history's pending work, unmounts, runs what was pending, and
// records the scroll, resize and focusin listeners and ResizeObservers still
// attached, the callbacks fired after unmount, and anything logged after
// unmount.
// ---------------------------------------------------------------------------

function headroomProps(params, props) {
  const out = {
    pinStart: params.pinStart,
    upTolerance: params.upTolerance,
    downTolerance: params.downTolerance,
    disableInlineStyles: params.disableInlineStyles,
    matchScrollSpeed: params.matchScrollSpeed,
    calcHeightOnResize: props.calcHeightOnResize,
    pin: props.pin,
    disable: props.disable,
  }
  if (params.unpinnedOffset !== null) out.unpinnedOffset = params.unpinnedOffset
  const renamed = renamedOf(params)
  if (renamed.length > 0)
    out.classNames = Object.fromEntries(
      renamed.map(key => [key, `x-${CLASS_KEYS[key]}`])
    )
  if (params.wrapperHeight !== null)
    out.wrapperStyle = { height: params.wrapperHeight }
  return out
}

// The rendered classes of one element, mapped back to their default names.
// `stray` lists every class that is neither a mapped name nor the user's: a
// default name whose key was renamed, or an unknown class.
function readClasses(element, params) {
  const renamed = new Set(renamedOf(params))
  const toDefault = new Map()
  for (const [key, name] of Object.entries(CLASS_KEYS))
    toDefault.set(renamed.has(key) ? `x-${name}` : name, name)
  const wrapperName = renamed.has('wrapper')
    ? `x-${CLASS_KEYS.wrapper}`
    : CLASS_KEYS.wrapper
  for (const state of STATES)
    toDefault.set(`${wrapperName}--${state}`, `${CLASS_KEYS.wrapper}--${state}`)
  const classes = []
  const stray = []
  for (const c of element.classList) {
    if (toDefault.has(c)) classes.push(toDefault.get(c))
    else stray.push(c)
  }
  return { classes: classes.sort(), stray: stray.sort() }
}

function createDriver(mountView, readView, { bare = false } = {}) {
  return function driver(plan, observe) {
    const clock = useOracleClock()
    const logged = []
    const realError = console.error
    const realWarn = console.warn
    console.error = (...args) => logged.push(args.map(String).join(' '))
    console.warn = console.error
    observing.clear()
    frames.length = 0
    frames.time = 0
    const div = document.createElement('div')
    Object.defineProperties(div, {
      scrollTop: { configurable: true, get: () => page.div },
      offsetHeight: { value: DIV.offset },
      clientHeight: { value: DIV.client },
      scrollHeight: { value: DIV.scroll },
    })
    const container = document.createElement('div')
    document.body.append(container, div)
    page.container = container
    // Listener bookkeeping: the scroll and resize listeners on the window and
    // the div, and the focusin listeners on the header, still attached.
    const named = target =>
      target === document
        ? 'document'
        : target === window
          ? 'window'
          : target === div
            ? 'div'
            : isHeader(target)
              ? 'header'
              : null
    const live = new Set()
    const realAdd = EventTarget.prototype.addEventListener
    const realRemove = EventTarget.prototype.removeEventListener
    // In Vitest's jsdom the window has its own (bound) add/remove methods,
    // which bypass EventTarget.prototype, so both are wrapped.
    const windowAdd = window.addEventListener
    const windowRemove = window.removeEventListener
    function track(type, fn, options) {
      const name = named(this)
      const tracked =
        (name === 'header' && type === 'focusin') ||
        (name !== null &&
          name !== 'header' &&
          (type === 'scroll' || type === 'resize'))
      if (tracked) adds += 1
      if (tracked)
        live.add({
          target: this,
          name,
          type,
          fn,
          passive: Boolean(options && options.passive),
        })
    }
    function untrack(type, fn) {
      for (const entry of live)
        if (entry.target === this && entry.type === type && entry.fn === fn)
          live.delete(entry)
    }
    EventTarget.prototype.addEventListener = function (type, fn, options) {
      track.call(this, type, fn, options)
      return realAdd.call(this, type, fn, options)
    }
    EventTarget.prototype.removeEventListener = function (type, fn, options) {
      untrack.call(this, type, fn)
      return realRemove.call(this, type, fn, options)
    }
    window.addEventListener = (type, fn, options) => {
      track.call(window, type, fn, options)
      return windowAdd(type, fn, options)
    }
    window.removeEventListener = (type, fn, options) => {
      untrack.call(window, type, fn)
      return windowRemove(type, fn, options)
    }
    const listening = () =>
      [...live]
        .map(
          ({ name, type, passive }) =>
            `${name} ${type}${passive || type === 'focusin' ? '' : ' (not passive)'}`
        )
        .sort()
    page.headerHeight = plan.params.headerHeight
    page.scrollbar = plan.params.scrollbar
    page.window = 0
    page.div = 0
    page[plan.mount.parent] = plan.mount.y

    const callbacks = []
    const handlers = {
      onPin: () => callbacks.push('onPin'),
      onUnpin: () => callbacks.push('onUnpin'),
      onUnfix: () => callbacks.push('onUnfix'),
    }
    // A late parent is a ref: it returns nothing until the mount has committed.
    let attached = !plan.mount.late
    const pageTarget = {
      window,
      document,
      html: document.documentElement,
      body: document.body,
    }[plan.mount.pageAs]
    const parents = {
      window: () => pageTarget,
      div: () => (attached ? div : null),
      none: () => null,
    }
    const root = createRoot(container)
    let mounted = false
    const instance = React.createRef()
    // Work counters: renders and setState calls (the component's onChange),
    // listeners added, and frames queued.
    let renders = 0
    let setStates = 0
    let adds = 0
    const onRender = {
      render: () => (renders += 1),
      setState: () => (setStates += 1),
    }
    // The history may run without a ResizeObserver, as an old browser does.
    if (!plan.params.resizeObserver) delete globalThis.ResizeObserver
    let headerKey = 0
    const render = props =>
      React.act(() =>
        root.render(
          React.createElement(
            plan.params.strictMode ? React.StrictMode : React.Fragment,
            null,
            React.createElement(
              RenderCount.Provider,
              { value: onRender },
              mountView(
                instance,
                {
                  ...(bare ? {} : headroomProps(plan.params, props)),
                  ...handlers,
                  ...(bare &&
                  props.parent === 'window' &&
                  plan.mount.pageAs === 'window'
                    ? {}
                    : { parent: parents[props.parent] }),
                },
                headerKey
              )
            )
          )
        )
      )
    const runFrames = gap =>
      React.act(() => {
        frames.time += gap
        for (const { callback } of frames.splice(0)) callback(frames.time)
      })
    const runTimeouts = () => React.act(() => vi.runOnlyPendingTimers())
    const scrollers = { window, div }
    // The page's scroll fires at the document and bubbles to the window, as
    // in a browser; an element's scroll fires at the element.
    const scrollTo = (scroller, y) => {
      page[scroller] = y
      const target = scroller === 'window' ? document : scrollers[scroller]
      target.dispatchEvent(
        new Event('scroll', { bubbles: scroller === 'window' })
      )
    }
    const resizes = onlyInitial =>
      React.act(() => deliverResizes(onlyInitial, plan.params.resizeEntries))
    const snapshot = () => {
      const view = {
        ...readView(container, plan.params),
        listening: listening(),
        renders,
        setStates,
        adds,
        callbacks: callbacks.splice(0),
      }
      renders = 0
      setStates = 0
      adds = 0
      return view
    }

    try {
      render({
        ...plan.mount,
        calcHeightOnResize: plan.params.calcHeightOnResize,
      })
      mounted = true
      attached = true
      // 'immediate': unmount before the mount's first frame, with no steps.
      const immediate = plan.pending === 'immediate'
      if (!immediate) {
        resizes(true)
        runFrames(16)
      }
      observe('mount', snapshot())
      ;(immediate ? [] : plan.steps).forEach((step, index) => {
        const queuedBefore = frames.length
        if (step.kind === 'scroll') {
          if (step.jitter !== null) scrollTo(step.scroller, step.jitter)
          scrollTo(step.scroller, step.y)
        } else if (step.kind === 'toggle') {
          if (step.nudgeY !== undefined)
            scrollTo(step.nudgeScroller, step.nudgeY)
          render(step.props)
        } else if (step.kind === 'rerender') {
          render(step.props)
        } else if (step.kind === 'swap') {
          if (step.resizeFirst) window.dispatchEvent(new Event('resize'))
          headerKey = step.drop ? null : (headerKey || 0) + 1
          render(step.props)
        } else if (step.kind === 'resize') {
          page.headerHeight = step.height
          resizes(false)
          if (step.window) window.dispatchEvent(new Event('resize'))
        } else if (step.kind === 'call') {
          React.act(() => instance.current[step.method]())
        } else if (container.querySelector('a')) {
          const link = container.querySelector('a')
          link.blur()
          React.act(() => link.focus())
        }
        resizes(true)
        const queued = frames.length
        runFrames(step.time - frames.time)
        if (step.settle) runTimeouts()
        observe('step', {
          step: index + 1,
          queuedBefore,
          queued,
          ...snapshot(),
        })
      })
      // Work a browser may still have queued when the component unmounts.
      const parentName = plan.steps.length
        ? plan.steps.at(-1).props.parent
        : plan.mount.parent
      // With no parent, the pending scroll is the window's.
      if (plan.pending === 'scroll')
        scrollTo(parentName === 'none' ? 'window' : parentName, 0)
      if (plan.pending === 'resize') window.dispatchEvent(new Event('resize'))
      const loggedBefore = logged.length
      React.act(() => root.unmount())
      mounted = false
      const queuedAfterUnmount = frames.length
      runFrames(16)
      runTimeouts()
      observe('unmount', {
        queued: queuedAfterUnmount,
        listeners: listening(),
        observers: observing.size,
        callbacks: callbacks.splice(0),
        logged: logged.slice(loggedBefore),
      })
    } catch (error) {
      observe('error', { message: String(error && error.message) })
    } finally {
      if (logged.length > 0) observe('console', logged.slice())
      if (mounted) React.act(() => root.unmount())
      frames.length = 0
      clock.release()
      console.error = realError
      console.warn = realWarn
      EventTarget.prototype.addEventListener = realAdd
      EventTarget.prototype.removeEventListener = realRemove
      window.addEventListener = windowAdd
      window.removeEventListener = windowRemove
      globalThis.ResizeObserver = StandInResizeObserver
      container.remove()
      div.remove()
      page.container = null
    }
  }
}

const header = React.createElement(
  'h1',
  null,
  React.createElement('a', { href: '#top' }, 'Header')
)

// The component: container > wrapper > header.
// Renders are counted in render() itself, so a bailout counts as none.
const RenderCount = React.createContext({ render() {}, setState() {} })
class CountedHeadroom extends Headroom {
  static contextType = RenderCount
  render() {
    this.context.render()
    return super.render()
  }
  setState(...args) {
    this.context.setState()
    return super.setState(...args)
  }
}
const componentView = (ref, props) =>
  React.createElement(CountedHeadroom, { ...props, ref }, header)
const readComponent = (container, params) => {
  const wrapper = container.firstElementChild
  const inner = wrapper.firstElementChild
  const own = readClasses(inner, params)
  const outer = readClasses(wrapper, params)
  const modes = own.classes
    .filter(c => /^headroom--(unfixed|pinned|unpinned)$/.test(c))
    .map(c => c.slice('headroom--'.length))
  return {
    mode: modes.length === 1 ? modes[0] : modes.join('+') || 'none',
    classes: own.classes,
    wrapperClasses: outer.classes,
    stray: [...own.stray, ...outer.stray],
    position: inner.style.position,
    box: {
      top: inner.style.top,
      left: inner.style.left,
      right: inner.style.right,
      zIndex: inner.style.zIndex,
    },
    transform: inner.style.transform,
    transition: inner.style.transition,
    wrapperHeight: wrapper.style.height,
    wrapperTag: wrapper.tagName.toLowerCase(),
  }
}
export const drive = createDriver(componentView, readComponent)
export const driveBare = createDriver(componentView, readComponent, {
  bare: true,
})

// The hook: a header the test renders itself, built on useHeadroom, with the
// same container > wrapper > header shape. It shows the hook's state in a
// data attribute; it has no classes or inline styles of its own.
// A swap gives the header element a new key, so React replaces it and the
// hook's ref moves to the new element; a null key renders no header at all.
function HookHeader({ headerKey, ...options }) {
  const { state, ref } = useHeadroom(options)
  return React.createElement(
    'div',
    { 'data-state': state },
    headerKey === null
      ? null
      : React.createElement('div', { ref, key: headerKey }, header)
  )
}
const hookView = (ref, props, headerKey) =>
  React.createElement(HookHeader, { ...props, headerKey })
// The hook renders no classes or inline styles of its own.
const NO_DOM = {
  classes: [],
  wrapperClasses: [],
  stray: [],
  position: '',
  box: {},
  transform: '',
  transition: '',
  wrapperHeight: '',
  wrapperTag: '',
}
const readHook = container => ({
  mode: container.firstElementChild.getAttribute('data-state') || 'none',
  ...NO_DOM,
})
export const driveHook = createDriver(hookView, readHook)
export const driveHookBare = createDriver(hookView, readHook, { bare: true })

// ---------------------------------------------------------------------------
// Check helpers. `checkpoints(trace)` is [mount, step 1, step 2, ...].
// ---------------------------------------------------------------------------

export const checkpoints = trace =>
  trace
    .filter(o => o.checkpoint === 'mount' || o.checkpoint === 'step')
    .map(o => o.value)
export const at = i => (i === 0 ? 'mount' : `step ${i}`)
export const unmountOf = trace => trace.find(o => o.checkpoint === 'unmount')
export const replaceAt = (trace, i, change) =>
  trace.map((o, j) =>
    j === i ? { ...o, value: { ...o.value, ...change } } : o
  )

export function noThrow(trace) {
  const error = trace.find(o => o.checkpoint === 'error')
  if (error)
    return violation('error', `threw: ${error.value.message}`, 'no throw')
  const logged = trace.find(o => o.checkpoint === 'console')
  if (logged)
    return violation('console', `logged: ${logged.value[0]}`, 'no throw')
  return undefined
}

// One allowed path must explain the whole trace. `compare(entry, seen)` gives
// the owed and the observed shape of one step. The failure shows the path that
// explains the longest prefix, at its first difference.
export function matchesPath(law, trace, expected, compare) {
  const seen = checkpoints(trace)
  const mount = differs('mount', law, seen[0].mode, expected.mount)
  if (mount) return mount
  let best
  for (const entries of expected.paths) {
    const miss = entries.findIndex((e, i) => {
      const { owed, observed } = compare(e, seen[i + 1])
      return JSON.stringify(owed) !== JSON.stringify(observed)
    })
    if (miss === -1) return undefined
    if (!best || miss > best.miss) best = { miss, entries }
  }
  const e = best.entries[best.miss]
  const { owed, observed } = compare(e, seen[best.miss + 1])
  const why =
    e.rule === 'focus'
      ? `focus moved into the header while ${e.from}`
      : `${e.rule}: moved ${e.moved} to ${e.y} from ${e.from}`
  return violation(
    at(best.miss + 1),
    `the rules owe ${JSON.stringify(owed)} here (${why})`,
    law,
    {
      actual: observed,
      expected: owed,
    }
  )
}

// L1, L6, L8, L9: the state, and no transition on a hide from unfixed.
export const modeAndSnap = (e, s) =>
  e.snap
    ? {
        owed: { mode: e.mode, scrolled: false },
        observed: {
          mode: s.mode,
          scrolled: s.classes.includes('headroom--scrolled'),
        },
      }
    : { owed: { mode: e.mode }, observed: { mode: s.mode } }

// A step whose frame unfixed the header, with timeouts held, then a frame.
export function framedInsideGap(plan, seen) {
  return plan.steps.some(
    (step, i) =>
      !step.settle &&
      seen[i + 1] &&
      seen[i + 1].mode === 'unfixed' &&
      seen[i].mode !== 'unfixed' &&
      plan.steps[i + 1] &&
      plan.steps[i + 1].kind === 'scroll' &&
      plan.steps[i + 1].scroller === plan.steps[i + 1].props.parent
  )
}

// The CSS values that move the header up by `offset` (any CSS length): a
// leading minus is valid CSS only before a plain non-negative length;
// calc(-1 * …) is valid for every length, including calc() and var().
function negations(offset) {
  const plain = /^(\d+\.?\d*|\.\d+)[a-z%]*$/.test(offset)
  // A unitless 0 is a length only outside calc(): calc(-1 * (0)) is a number.
  if (plain && /^[\d.]+$/.test(offset)) return [`-${offset}`]
  const forms = [`calc(-1 * ${offset})`, `calc(-1 * (${offset}))`]
  return plain ? [`-${offset}`, ...forms] : forms
}

// The docs' CSS for each state class (index.md:45-65), with unpinnedOffset.
// `transforms` is the allowed set: any valid way to write the same move.
export function look(mode, params) {
  const offset =
    params.unpinnedOffset === null
      ? '100%'
      : typeof params.unpinnedOffset === 'number'
        ? `${params.unpinnedOffset}px`
        : params.unpinnedOffset
  const at = y => `translate3D(0, ${y}, 0)`
  return {
    unfixed: { position: 'relative', transforms: [at(0)] },
    pinned: { position: 'fixed', transforms: [at(0)] },
    unpinned: { position: 'fixed', transforms: negations(offset).map(at) },
  }[mode]
}
export const CALLBACK = {
  pinned: 'onPin',
  unpinned: 'onUnpin',
  unfixed: 'onUnfix',
}
// A transition's duration in ms, from an inline `transition` value.
export function durationMs(transition) {
  const match = /(\d*\.?\d+)(ms|s)\b/.exec(transition)
  if (!match) return null
  return Math.round(Number(match[1]) * (match[2] === 's' ? 1000 : 1))
}

// Constructed histories shared by several laws.
export const flickInsideGap = g => ({
  ...g,
  mount: top,
  actions: [
    ...hideShowTop(g.params, false),
    sc(far(g.params)),
    sc(-(g.params.upTolerance + 1)),
  ],
})
export const twoFramesInsideGap = g => ({
  ...g,
  mount: top,
  actions: [...hideShowTop(g.params, false), sc(0)],
})
