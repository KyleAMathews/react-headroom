// The history grammar, the model, and the drivers of the headroom oracle
// (test/headroom.oracle.js). It registers no tests. The oracle file states the
// laws; this module holds the parts they share. See the oracle file's opening
// comment for what each law promises.
import { vi } from 'vitest'
import fc from 'fast-check'
import React from 'react'
import { differs, useOracleClock, violation } from '@tanstack/oracles'
import { CLASS_KEYS, USER, driversOf, renamedOf } from './oracle-driver.js'
import { DIV, PAGE_HEIGHT, VIEWPORT } from './oracle-geometry.js'

export { CLASS_KEYS, USER, renamedOf }

// ---------------------------------------------------------------------------
// The page: jsdom, with stand-ins for its layout, scroll positions and
// ResizeObserver (test/oracle-page-jsdom.js), over the geometry of
// test/oracle-geometry.js. Frames come from ./oracle-frames.js.
// ---------------------------------------------------------------------------

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// React 18 and 19 render through createRoot and export act; React 16 and 17
// (the README supports 16.9 and later) render with ReactDOM.render.
const react =
  Number(React.version.split('.')[0]) >= 18
    ? await import('./oracle-react-root.js')
    : await import('./oracle-react-legacy.js')

// The drivers: in jsdom by default, with the oracle clock; with
// ORACLE_BROWSER=chrome, each history runs in a real Chrome page
// (test/oracle-chrome.js), and its observations come back here.
export const { drive, driveBare, driveHook, driveHookBare } =
  process.env.ORACLE_BROWSER === 'chrome'
    ? (await import('./oracle-chrome.js')).remoteDrivers
    : driversOf({
        createPage: (await import('./oracle-page-jsdom.js')).createPage,
        clock: () => {
          const clock = useOracleClock()
          return {
            runPending: () => vi.runOnlyPendingTimers(),
            release: clock.release,
          }
        },
        act: react.act,
        createRoot: react.createRoot,
      })

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

const other = scroller => (scroller === 'window' ? 'div' : 'window')
// A parent change: window -> div -> none (a ref whose element went away) ->
// window. With no parent, nothing scrolls the header.
const nextParent = { window: 'div', div: 'none', none: 'window' }

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
  // The hook's header element may arrive after mount (a header rendered
  // conditionally); a swap then brings it.
  headerless = false,
  // A second instance method in the same batch, as one event handler that
  // calls two makes.
  batches = false,
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
      fc.record({
        kind: fc.constant('rerender'),
        // New but equal onPin, onUnpin, onUnfix and parent functions, as an
        // owner that writes them inline passes on every render.
        fresh: fc.boolean(),
        settle: fc.boolean(),
      }),
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
        // What changed size: the content (and so the content and border
        // boxes), or only the padding or border (the border box alone).
        box: fc.constantFrom('content', 'padding'),
        window: fc.boolean(),
        settle: fc.boolean(),
      }),
    focus && fc.record({ kind: fc.constant('focus'), settle: fc.boolean() }),
    calls &&
      fc.record({
        kind: fc.constant('call'),
        method: fc.constantFrom('pin', 'unpin', 'unfix'),
        then: batches
          ? fc.option(fc.constantFrom('pin', 'unpin', 'unfix'), { nil: null })
          : fc.constant(null),
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
            // Numbers are px, negative ones too (the header moves down).
            fc.integer({ min: -30, max: 120 }),
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
        // The documented props that only pass through (README, Props): a
        // className for the wrapper, a style for the header (one key it also
        // sets inline, one it does not), another wrapperStyle key, another
        // prop for the header element, and the wrapper's tag.
        className: fc.option(fc.constant(USER.className), { nil: null }),
        style: fc.option(fc.constantFrom('zIndex', 'color'), { nil: null }),
        wrapperExtra: fc.boolean(),
        id: fc.boolean(),
        tag: fc.option(fc.constant('nav'), { nil: null }),
      }),
    mount: fc.record({
      y: mountY,
      pin: mountPin,
      disable: mountDisable,
      parent: mountParent,
      pageAs,
      header: headerless ? fc.boolean() : fc.constant(true),
    }),
    actions: fc.array(action, { maxLength: 14 }),
    pending,
  })
}

export const anywhere = fc.integer({ min: 0, max: MAX_Y })
export const either = fc.boolean()
export const everyParent = fc.constantFrom('window', 'div')
// Every way parent() can name the page, and the page layouts: an iframe's
// window or document, a quirks-mode iframe, and the body layouts (one that
// scrolls itself; two whose overflow styles leave the page scrolling; and
// html, body { height: 100% }, where the body overflows and the page scrolls).
export const everyPage = fc.constantFrom(
  'window',
  'document',
  'html',
  'body',
  'frame',
  'frameDocument',
  'frameQuirks',
  'bodyScroller',
  'bodyOverflow',
  'bodyOverflowX',
  'bodyFullHeight',
  'bodyScrollerMargin',
  'bodyClipBoth',
  'bodyClipFull',
  'bodyClipFullMargin',
  'frameQuirksBody'
)

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
export const rs = (
  height,
  quarters,
  onWindow,
  settle = true,
  box = 'content'
) => ({
  kind: 'resize',
  height,
  quarters,
  box,
  window: onWindow,
  settle,
})
export const fo = (settle = true) => ({ kind: 'focus', settle })
export const rr = (fresh, settle = true) => ({
  kind: 'rerender',
  fresh,
  settle,
})
export const call = (method, settle = true, then = null) => ({
  kind: 'call',
  method,
  then,
  settle,
})
export const top = {
  y: 0,
  pin: false,
  disable: false,
  parent: 'window',
  pageAs: 'window',
  header: true,
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
// The layouts that clip horizontal overflow, so show no horizontal scrollbar.
const NO_SCROLLBAR = [
  'bodyOverflowX',
  'bodyClipBoth',
  'bodyClipFull',
  'bodyClipFullMargin',
]
export const resolveWithin = overscroll => history => {
  const { mount } = history
  const params = NO_SCROLLBAR.includes(mount.pageAs)
    ? { ...history.params, scrollbar: 0 }
    : history.params
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
  // The header's border box is its content plus its top padding.
  let content = params.headerHeight
  let padding = 0
  let headerPresent = mount.header
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
      // A padding change keeps the content, so it can only grow the header
      // past its content; any other change is the content's, and padding
      // larger than the new height goes.
      const box =
        action.box === 'padding' && headerHeight >= content
          ? 'padding'
          : 'content'
      if (box === 'padding') padding = headerHeight - content
      else {
        padding = Math.min(padding, headerHeight)
        content = headerHeight - padding
      }
      // Without a ResizeObserver only a window resize can reveal a new
      // height, so in that dimension every resize comes with one.
      Object.assign(base, {
        height: headerHeight,
        box,
        content,
        padding,
        window: action.window || !params.resizeObserver,
      })
    } else if (action.kind === 'rerender') {
      base.fresh = action.fresh
    } else if (action.kind === 'call') {
      base.method = action.method
      base.then = action.then
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
// A header that has never been measured (the hook's, before its element
// arrives) is 0px tall.
function measuredHeights(plan) {
  let measured = plan.mount.header ? plan.params.headerHeight : 0
  const heights = [measured]
  for (const step of plan.steps) {
    // A header element that arrives is measured.
    if (step.kind === 'swap' && step.headerPresent) measured = step.headerHeight
    if (
      step.kind === 'resize' &&
      step.props.calcHeightOnResize &&
      step.headerPresent
    )
      measured = step.headerHeight
    if (
      step.kind === 'toggle' &&
      step.prop === 'calcHeightOnResize' &&
      step.props.calcHeightOnResize &&
      step.headerPresent
    )
      measured = step.headerHeight
    heights.push(measured)
  }
  return heights
}
// L11 over pin: whether the header is at its scroller's bottom at each
// checkpoint. Every in-bounds frame of the current parent decides it: a
// scroll's, and the frame that pin asks for at mount and whenever it changes.
export function bottomsOf(plan) {
  const max = maxOf(plan.params)
  let bottom = false
  const frame = (y, end) => {
    if (y >= -1 && y <= end + 1) bottom = y >= end - 1
  }
  if (plan.mount.pin && !plan.mount.disable)
    frame(plan.mount.y, max[plan.mount.parent])
  const bottoms = [bottom]
  for (const step of plan.steps) {
    const { props } = step
    if (!props.disable && props.parent !== 'none') {
      if (step.kind === 'scroll' && step.scroller === props.parent)
        frame(step.y, step.max)
      if (step.kind === 'toggle' && step.prop === 'pin')
        frame(step.parentY, step.parentMax)
    }
    bottoms.push(bottom)
  }
  return bottoms
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
  const heights = measuredHeights(plan)
  const mountMode = hidesOnAttach(
    'unfixed',
    plan.mount.y,
    heights[0],
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
        // names the current state does nothing. The reference stays. A second
        // call in the same batch applies after the first.
        const first = CALLED[step.method]
        const mode = step.then ? CALLED[step.then] : first
        const last = mode !== first ? first : path.state.mode
        // L3: one callback for each call that changes the state.
        const callbacks = [path.state.mode, first, mode]
          .slice(1)
          .filter((to, i, all) => to !== [path.state.mode, ...all][i])
          .map(to => CALLBACK[to])
        keep(
          { ...path.state, mode },
          {
            ...still,
            mode,
            rule: 'call',
            from: path.state.mode,
            callbacks: step.then ? callbacks : callbacks.slice(0, 1),
            ms: mode !== last && mode !== 'unfixed' ? 200 : null,
          }
        )
      } else if (step.kind === 'toggle' && step.prop === 'parent') {
        // L6: attaching to a scroller makes its current position the
        // reference, and the next frame a first frame.
        // Attaching where the header belongs in place (at or above pinStart)
        // unfixes a fixed header at once.
        const reattached = {
          ...path.state,
          lastY: step.parentY,
          lastTime: null,
        }
        const attachedMode =
          step.props.parent === 'none' || step.props.pin
            ? reattached.mode
            : hidesOnAttach(
                  reattached.mode,
                  step.parentY,
                  heights[index],
                  step.props
                )
              ? 'unpinned'
              : reattached.mode !== 'unfixed' && step.parentY <= p.pinStart
                ? 'unfixed'
                : reattached.mode
        const attached = { ...reattached, mode: attachedMode }
        keep(
          attached,
          attachedMode !== path.state.mode
            ? {
                ...still,
                mode: attachedMode,
                snap: attachedMode === 'unpinned',
                rule: 'attach',
                from: path.state.mode,
                moved: 0,
                y: step.parentY,
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
        step.kind === 'rerender' ||
        (step.kind === 'toggle' && step.prop === 'calcHeightOnResize')
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

// The wrapper's tag at each checkpoint: params.tag (div when not given),
// and header after an odd number of swaps.
export const tagsOf = plan => {
  let swaps = 0
  const base = plan.params.tag ?? 'div'
  return [
    base,
    ...plan.steps.map(step => {
      if (step.kind === 'swap' && !step.drop) swaps += 1
      return swaps % 2 === 1 ? 'header' : base
    }),
  ]
}

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
  // A negative plain length negates to the length without its minus.
  if (/^-(\d+\.?\d*|\.\d+)[a-z%]*$/.test(offset))
    return [offset.slice(1), `calc(-1 * ${offset})`, `calc(-1 * (${offset}))`]
  const plain = /^(\d+\.?\d*|\.\d+)[a-z%]*$/.test(offset)
  // A unitless 0 is a length only outside calc(): calc(-1 * (0)) is a number.
  if (plain && /^[\d.]+$/.test(offset)) return [`-${offset}`]
  const forms = [`calc(-1 * ${offset})`, `calc(-1 * (${offset}))`]
  if (!plain) return forms
  // A length of zero is its own negation (0px is -0px).
  const zero = Number.parseFloat(offset) === 0 ? [offset] : []
  return [`-${offset}`, ...zero, ...forms]
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
// How far each unpinnedOffset of the grammar moves the header up, in px, for
// a header `height` px tall (1rem is 16px).
const OFFSET_PX = {
  '100%': h => h,
  '50%': h => h / 2,
  '2rem': () => 32,
  0: () => 0,
  'calc(100% + 8px)': h => h + 8,
  'var(--offset, 2rem)': () => 32,
  '-1rem': () => -16,
}
const offsetPx = (offset, height) =>
  typeof offset === 'number' ? offset : OFFSET_PX[offset ?? '100%'](height)
// The header's transform as the docs' CSS for `mode`, from one checkpoint:
// in jsdom, the inline value, any valid way of writing the move; in a
// browser, the computed translation, which an invalid value leaves at 0.
// Returns the docs' form when it agrees, and what was shown otherwise.
export function transformOf(s, mode, params, height) {
  const css = look(mode, params)
  if (s.translateY === null)
    return css.transforms.includes(s.transform)
      ? css.transforms[0]
      : s.transform
  const owed =
    mode === 'unpinned' ? -offsetPx(params.unpinnedOffset, height) : 0
  return Math.abs(s.translateY - owed) < 0.01
    ? css.transforms[0]
    : `${s.transform} (moved ${s.translateY}px)`
}
// The header's height at each checkpoint, as laid out (not as measured).
export const heightsOf = plan => [
  plan.params.headerHeight,
  ...plan.steps.map(step => step.headerHeight),
]

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
