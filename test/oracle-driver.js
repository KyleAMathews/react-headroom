// The drivers of the headroom oracle (test/headroom.oracle.js): they mount
// the real <Headroom>, or a header built on the real useHeadroom, play one
// plan, and record what they show. They import only React and production, so
// they run in jsdom (test/headroom-oracle-harness.js) and in a Chrome page
// (test/oracle-chrome-entry.js) alike; the page, the clock and React's root
// come in as an environment.
import React from 'react'
import Headroom, { useHeadroom } from '../src/index.js'
import { frames } from './oracle-frames.js'

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

// The pass-through props' values (README, Props: className, style,
// wrapperStyle, tag, and any other prop for the header element).
export const USER = {
  className: 'site-header',
  style: { zIndex: { zIndex: 5 }, color: { color: 'red' } },
  background: 'red',
  id: 'site',
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
  if (params.wrapperHeight !== null || params.wrapperExtra)
    out.wrapperStyle = {
      ...(params.wrapperHeight !== null && { height: params.wrapperHeight }),
      ...(params.wrapperExtra && { background: USER.background }),
    }
  if (params.className != null) out.className = params.className
  if (params.style != null) out.style = USER.style[params.style]
  if (params.id) out.id = USER.id
  if (params.tag != null) out.tag = params.tag
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
    else if (c !== params.className) stray.push(c)
  }
  return { classes: classes.sort(), stray: stray.sort() }
}

function createDriver(env, mountView, readView, { bare = false } = {}) {
  // React 16 and 17's act warns when its callback returns a value.
  const act = fn =>
    env.act(() => {
      fn()
    })
  const { createRoot } = env
  return async function driver(plan, observe) {
    const page = await env.createPage(plan)
    const { container, div } = page
    const clock = env.clock()
    const logged = []
    const realError = console.error
    const realWarn = console.warn
    console.error = (...args) => logged.push(args.map(String).join(' '))
    console.warn = console.error
    frames.length = 0
    frames.time = 0
    // Listener bookkeeping: the scroll and resize listeners on the windows,
    // documents, body and div, and the focusin listeners on the header, still
    // attached. Each realm (an iframe is another) has its own
    // EventTarget.prototype.
    const live = new Set()
    const prototypes = [
      ...new Set(page.realms.map(realm => realm.EventTarget.prototype)),
    ].map(proto => ({
      proto,
      add: proto.addEventListener,
      remove: proto.removeEventListener,
    }))
    // In Vitest's jsdom the window has its own (bound) add/remove methods,
    // which bypass EventTarget.prototype, so both are wrapped.
    const windowAdd = window.addEventListener
    const windowRemove = window.removeEventListener
    function track(type, fn, options) {
      const name = page.named(this)
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
    for (const { proto, add, remove } of prototypes) {
      proto.addEventListener = function (type, fn, options) {
        track.call(this, type, fn, options)
        return add.call(this, type, fn, options)
      }
      proto.removeEventListener = function (type, fn, options) {
        untrack.call(this, type, fn)
        return remove.call(this, type, fn, options)
      }
    }
    window.addEventListener = (type, fn, options) => {
      track.call(window, type, fn, options)
      return windowAdd.call(window, type, fn, options)
    }
    window.removeEventListener = (type, fn, options) => {
      untrack.call(window, type, fn)
      return windowRemove.call(window, type, fn, options)
    }
    const listening = () =>
      [...live]
        .map(
          ({ name, type, passive }) =>
            `${name} ${type}${passive || type === 'focusin' ? '' : ' (not passive)'}`
        )
        .sort()

    const callbacks = []
    // Each fresh re-render passes new callback and parent functions; a
    // callback from an earlier render records itself as stale.
    let generation = 0
    const handlersOf = born => {
      const fire = name => () =>
        callbacks.push(born === generation ? name : `stale ${name}`)
      return {
        onPin: fire('onPin'),
        onUnpin: fire('onUnpin'),
        onUnfix: fire('onUnfix'),
      }
    }
    // A late parent is a ref: it returns nothing until the mount has committed.
    let attached = !plan.mount.late
    const parentsOf = () => ({
      window: () => page.pageTarget,
      div: () => (attached ? div : null),
      none: () => null,
    })
    let handlers = handlersOf(generation)
    let parents = parentsOf()
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
    let headerKey = plan.mount.header ? 0 : null
    const render = props =>
      act(() =>
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
      act(() => {
        frames.time += gap
        for (const { callback } of frames.splice(0)) callback(frames.time)
      })
    const runTimeouts = () => act(() => clock.runPending())
    // ResizeObserver notifications the page has due, in the history's entry
    // shape.
    const resizes = () => act(() => page.deliver(plan.params.resizeEntries))
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
        await page.layout()
        resizes()
        runFrames(16)
      }
      observe('mount', snapshot())
      for (const [index, step] of (immediate ? [] : plan.steps).entries()) {
        const queuedBefore = frames.length
        // Steps that can change the header's layout let the page lay out.
        let laidOut = false
        if (step.kind === 'scroll') {
          if (step.jitter !== null) page.scrollTo(step.scroller, step.jitter)
          page.scrollTo(step.scroller, step.y)
        } else if (step.kind === 'toggle') {
          if (step.nudgeY !== undefined)
            page.scrollTo(step.nudgeScroller, step.nudgeY)
          render(step.props)
          laidOut = true
        } else if (step.kind === 'rerender') {
          if (step.fresh) {
            generation += 1
            handlers = handlersOf(generation)
            parents = parentsOf()
          }
          render(step.props)
        } else if (step.kind === 'swap') {
          if (step.resizeFirst) window.dispatchEvent(new Event('resize'))
          headerKey = step.drop ? null : (headerKey || 0) + 1
          render(step.props)
          laidOut = true
        } else if (step.kind === 'resize') {
          page.resizeHeader(step.content, step.padding)
          await page.layout()
          resizes()
          if (step.window) window.dispatchEvent(new Event('resize'))
        } else if (step.kind === 'call') {
          act(() => {
            instance.current[step.method]()
            if (step.then) instance.current[step.then]()
          })
        } else if (container.querySelector('a')) {
          // Keyboard focus moves into the header; the page does not scroll.
          const link = container.querySelector('a')
          link.blur()
          act(() => link.focus({ preventScroll: true }))
        }
        if (laidOut) await page.layout()
        resizes()
        const queued = frames.length
        runFrames(step.time - frames.time)
        if (step.settle) runTimeouts()
        observe('step', {
          step: index + 1,
          queuedBefore,
          queued,
          ...snapshot(),
        })
      }
      // Work a browser may still have queued when the component unmounts.
      const parentName = plan.steps.length
        ? plan.steps.at(-1).props.parent
        : plan.mount.parent
      // With no parent, the pending scroll is the window's.
      if (plan.pending === 'scroll')
        page.scrollTo(parentName === 'none' ? 'window' : parentName, 0)
      if (plan.pending === 'resize') window.dispatchEvent(new Event('resize'))
      const loggedBefore = logged.length
      // A caller that kept the instance (the component's) past unmount.
      const kept = instance.current
      act(() => root.unmount())
      mounted = false
      const queuedAfterUnmount = frames.length
      if (plan.pending === 'call')
        act(() => {
          for (const method of ['pin', 'unpin', 'unfix']) kept[method]()
        })
      runFrames(16)
      runTimeouts()
      observe('unmount', {
        queued: queuedAfterUnmount,
        listeners: listening(),
        observers: page.observers(),
        callbacks: callbacks.splice(0),
        logged: logged.slice(loggedBefore),
      })
    } catch (error) {
      observe('error', { message: String(error && error.message) })
    } finally {
      if (logged.length > 0) observe('console', logged.slice())
      if (mounted) act(() => root.unmount())
      // Release what the history left attached, so one history's leak cannot
      // reach the next.
      for (const { target, type, fn } of [...live])
        target.removeEventListener(type, fn)
      frames.length = 0
      clock.release()
      console.error = realError
      console.warn = realWarn
      for (const { proto, add, remove } of prototypes) {
        proto.addEventListener = add
        proto.removeEventListener = remove
      }
      window.addEventListener = windowAdd
      window.removeEventListener = windowRemove
      page.release()
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
// A swap switches the wrapper's tag between div and header, so React replaces
// the wrapper and the header element under the same component.
const componentView = (ref, props, headerKey) =>
  React.createElement(
    CountedHeadroom,
    { ...props, ref, ...(headerKey % 2 === 1 ? { tag: 'header' } : {}) },
    header
  )
const JSDOM = navigator.userAgent.includes('jsdom')
// The header's transform where its transition ends: a slide still running
// is finished first.
const translateOf = element => {
  if (JSDOM) return null
  for (const animation of element.getAnimations()) animation.finish()
  const computed = getComputedStyle(element).transform
  const matrix = /^matrix\(([^)]*)\)$/.exec(computed)
  return matrix ? Number(matrix[1].split(',')[5]) : 0
}
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
    // In a browser, how far the header moves down (px); jsdom computes no
    // transform.
    translateY: translateOf(inner),
    transition: inner.style.transition,
    wrapperHeight: wrapper.style.height,
    wrapperTag: wrapper.tagName.toLowerCase(),
    // The pass-through props, where they land.
    passed: {
      wrapperClass: wrapper.classList.contains(USER.className),
      headerClass: inner.classList.contains(USER.className),
      color: inner.style.color,
      background: wrapper.style.background,
      id: inner.id,
    },
  }
}

// The hook: a header the test renders itself, built on useHeadroom, with the
// same container > wrapper > header shape. It shows the hook's state in a
// data attribute; it has no classes or inline styles of its own.
// A swap gives the header element a new key, so React replaces it and the
// hook's ref moves to the new element; a null key renders no header at all.
function HookHeader({ headerKey, ...options }) {
  React.useContext(RenderCount).render()
  const { state, animated, transitionMs, ref } = useHeadroom(options)
  return React.createElement(
    'div',
    {
      'data-state': state,
      'data-animated': String(animated),
      'data-transition-ms': String(transitionMs),
    },
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
  translateY: null,
  transition: '',
  wrapperHeight: '',
  wrapperTag: '',
  passed: {},
}
// The hook's `animated` plays the part of the component's two transition
// classes (L20): true is headroom--scrolled, false headroom-disable-animation;
// its `transitionMs`, while animated, the part of the inline transition (L14).
const ANIMATED_CLASS = {
  true: ['headroom--scrolled'],
  false: ['headroom-disable-animation'],
}
const readHook = container => {
  const shown = container.firstElementChild
  const animated = shown.getAttribute('data-animated')
  return {
    ...NO_DOM,
    mode: shown.getAttribute('data-state') || 'none',
    classes: ANIMATED_CLASS[animated] || [],
    transition:
      animated === 'true'
        ? `all ${shown.getAttribute('data-transition-ms')}ms ease-in-out`
        : '',
    // The hook's transitionMs as it is, slide or not.
    transitionMs: shown.getAttribute('data-transition-ms'),
  }
}

// The four drivers over one environment: the page (createPage), the clock
// (clock(), with runPending() and release()), and React's act and createRoot.
export const driversOf = env => ({
  drive: createDriver(env, componentView, readComponent),
  driveBare: createDriver(env, componentView, readComponent, { bare: true }),
  driveHook: createDriver(env, hookView, readHook),
  driveHookBare: createDriver(env, hookView, readHook, { bare: true }),
})
