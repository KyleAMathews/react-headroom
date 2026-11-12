/*
 * This oracle owns what <Headroom> and useHeadroom show while their scroller
 * scrolls: which of three states (unfixed, pinned, unpinned) the header is in
 * after each animation frame, its classes, inline styles and wrapper height,
 * the callbacks, every prop, focus, overscroll, the instance methods, renders,
 * and cleanup after unmount. It owns src/index.js, src/core.js,
 * src/useHeadroom.js and src/shouldUpdate.js.
 *
 *   <Headroom>, scroll down past the header               // → headroom--unpinned: fixed, translate -100%
 *   then scroll up more than upTolerance in one frame     // → headroom--pinned: fixed, translate 0
 *   scroll to pinStart or above                           // → headroom--unfixed: relative, in place
 *   <Headroom pin>, at any scroll position below pinStart // → headroom--pinned
 *   Tab into the hidden header                            // → headroom--pinned
 *   the header's content grows to 72.5px                  // → wrapper height 72.5px
 *   useHeadroom(options).state                            // → the same state <Headroom> shows
 *
 * Why could a header that slid out of view stay out for good? In 3.2, scroll
 * back to the top so that it unfixes, then flick down before the browser runs
 * a 0 ms timeout.
 *
 * Three parts made that possible. The frame: a scroll event only schedules
 * work, and once per animation frame the header reads where its scroller is
 * and decides. The reference: the position and time of the last in-bounds
 * frame, from which a frame measures direction, distance and speed. The unfix
 * gap: 3.2 changed the state one timeout after the class, and the browser
 * chose whether a frame or that timeout ran first. Nothing waits a timeout
 * now; the histories still hold timeouts back at every step, so any timer
 * that comes back is put in front of a frame.
 *
 * The scroll rule (L1): each in-bounds frame leaves the header unfixed at or
 * above pinStart; unpinned after it ends past the header's height plus
 * pinStart moving down, by more than downTolerance from pinned and by any
 * amount (with no transition) from unfixed; pinned, from unpinned, after it
 * moves up more than upTolerance or moves up into the header's region (up to
 * height plus pinStart); and
 * otherwise as it was. A tolerance is a speed: px in one frame. Class and
 * styles (L2): at every checkpoint, the inline styles are the docs' CSS for
 * the state class, the base classes are there, and the wrapper height is the
 * header's measured height or wrapperStyle.height. Callbacks (L3) fire once
 * per change. Pin (L4): pinned below pinStart, unfixed at or above it. Disable
 * (L5): unfixed, unlistened and silent. Parent (L6): the current parent drives
 * the header through passive listeners, including one that resolves after
 * mount. Cleanup (L7): nothing stays attached or runs after unmount.
 * Overscroll (L8) changes nothing, not even the reference. Focus (L9) into a
 * hidden header shows it. Wrapper state (L10): headroom-wrapper--<state>.
 * Bottom (L11): headroom--bottom within 1px of the bottom. Class names (L12):
 * any renaming, with every other law holding under it. The hook (L13) follows
 * L1 and L4-L9 as the component does. Speed (L14): with matchScrollSpeed a
 * transition lasts height ÷ speed, 100-400ms; otherwise 200ms. Instance
 * methods (L15) move the state once, or do nothing (also while pin is true). Defaults (L17): no props
 * behave as the README's defaults. Renders (L18): a step that changes nothing
 * shown does not re-render. calcHeightOnResize (L19): off keeps the measured
 * height. Transition class (L20): headroom--scrolled after a pin or a hide from
 * pinned, headroom-disable-animation after a snap hide, an unfix or disable.
 * Work (W): one pending frame per job (scroll, parent lookup), nothing new on
 * a re-render with the same props, no setState for a step that shows nothing
 * new, and nothing queued after unmount. Attaching (L6) to a scroller, at
 * mount, on a parent change or when disable turns off, measures from its
 * position and hides an in-place header that is already past its region.
 * Each property states its law, authority and limits in full. Sources:
 * www/pages/index.md (the docs at the time), the README (Props), commit
 * messages that state an intent, WCAG 2.2 SC 2.4.11, and decisions by Kyle
 * Mathews (GitHub KyleAMathews), 2026-11-11 and 2026-11-12 (two code reviews'
 * findings). Every law also requires that nothing throws or logs a warning.
 *
 * The model for L1, L6, L8, L9, L11, L14, L15 and L17 steps the state and the
 * reference once per frame of the current parent, with the header height the
 * component has measured. It never models timeouts: their order against frames
 * is the browser's choice. The other laws are rules over each checkpoint. The
 * histories vary every prop, a renaming of any class, StrictMode, whether a
 * ResizeObserver exists and its entry shape; they scroll the parent and
 * another element in small and large moves at 16, 33 or 100ms per frame, toggle
 * props (sometimes with a frame still pending), resize and replace the header,
 * move focus into it, call its methods, overscroll, and leave work pending at
 * unmount; each step chooses whether timeouts run before the next frame. The
 * drivers mount the real component and a header built on the real hook in
 * jsdom, run frames and ResizeObserver notifications themselves, run timeouts
 * on the oracle clock, and record after every step
 * (test/headroom-oracle-harness.js).
 *
 * Limits. jsdom has no layout, so the drivers supply the header height, the
 * scrollers' sizes and ResizeObserver delivery; React renders each update
 * before the next event, where a concurrent root in a browser may not. tag,
 * className and style beyond their
 * defaults are not
 * varied. At mount, onPin may fire or not.
 */
import { vi } from 'vitest'
import fc from 'fast-check'
import { differs, oracleProperty, pass, violation } from '@tanstack/oracles'
import {
  CALLBACK,
  CLASS_KEYS,
  MAX_Y,
  OVERSCROLL,
  anywhere,
  at,
  checkpoints,
  drive,
  driveHook,
  durationMs,
  either,
  everyParent,
  far,
  flickInsideGap,
  fo,
  framedInsideGap,
  hideShowTop,
  historiesOf,
  look,
  matchesPath,
  modeAndSnap,
  noThrow,
  renamedOf,
  replaceAt,
  resolve,
  resolveWithin,
  rs,
  sc,
  scrollRule,
  tg,
  top,
  twoFramesInsideGap,
  unmountOf,
  call,
  DOC_DEFAULTS,
  driveBare,
  driveHookBare,
  wrapperHeights,
} from './headroom-oracle-harness.js'

// The frame stand-in: `raf` queues, and the driver runs the queue.
vi.mock('raf', () => import('./oracle-frames.js').then(m => m.rafModule))

const LIMITS =
  'jsdom with a driver-supplied header height, 3000px page, 768px viewport and ResizeObserver delivery; frames run by the driver, timeouts on the oracle clock; React renders each update before the next event. tag, className and style are not varied.'

// ---------------------------------------------------------------------------
// L1: the scroll rule. Also run through useHeadroom (L13).
// ---------------------------------------------------------------------------

const scrollRuleLaw = {
  law: {
    statement:
      'For every history of in-bounds scrolls from a mount at the top, in every order of frames and timeouts, each frame leaves the header unfixed at or above pinStart; unpinned after a frame that ends past headerHeight + pinStart and moves down, by more than downTolerance from pinned and by any amount (with no transition) from unfixed; pinned, from unpinned, after a frame that moves up more than upTolerance, or moves up and ends at or above headerHeight + pinStart (the header region); and otherwise as it was.',
    authority:
      'www/pages/index.md:3 ("When you scroll down, it slides out of view and slides back in when scrolling up"), :73-74 (tolerances), :79 (pinStart); src/shouldUpdate.js ("We transition to pin regardless of upTolerance"); commit e58b75e ("Avoid flash of animation when scrolling from top"); decisions by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: a tolerance compares the distance of one frame (a speed); only an unpinned header shows on the way up; an unfixed header past headerHeight + pinStart hides at any speed; 2026-11-12: the header region for showing is headerHeight + pinStart, as for hiding (review finding R7).',
    limits: `Mount at the top, positions in bounds, no prop changes. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({}),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'showed inside the region below pinStart',
      'hid from unfixed',
      'hid on the way down',
      'showed on a fast scroll up',
      'showed inside the header',
      'unfixed exactly at pinStart',
      'slow scroll up stayed hidden',
      'frame inside the unfix gap',
      'stopped exactly at the end of the header',
      'moved exactly downTolerance while pinned',
    ],
    measured: ['two scroll events in one frame', 'moved exactly a tolerance'],
    constructed: [
      {
        // pinStart above the header's height: the region is pinStart to
        // pinStart + height, and a slow scroll up into it shows the header.
        name: 'pinStart 100, slow scroll up into the header region',
        enters: ['showed inside the region below pinStart'],
        build: g => {
          const params = {
            ...g.params,
            headerHeight: Math.min(g.params.headerHeight, 60),
            pinStart: 100,
            upTolerance: Math.max(2, g.params.upTolerance),
          }
          const end = params.headerHeight + params.pinStart
          return {
            ...g,
            params,
            actions: [sc(end + 1), sc(-1)],
          }
        },
      },
      {
        name: 'hide, show fast, hide again',
        enters: [
          'hid from unfixed',
          'showed on a fast scroll up',
          'hid on the way down',
        ],
        build: g => {
          const p = g.params
          return {
            ...g,
            actions: [
              sc(far(p)),
              sc(-(p.upTolerance + 1)),
              sc(p.downTolerance + 1),
            ],
          }
        },
      },
      {
        // pinStart 0, so the header's own height is above pinStart.
        name: 'show inside the header on a slow scroll up',
        enters: ['showed inside the header'],
        build: g => {
          const params = {
            ...g.params,
            pinStart: 0,
            upTolerance: Math.max(1, g.params.upTolerance),
          }
          return {
            ...g,
            params,
            actions: [sc(params.headerHeight + 1), sc(-1)],
          }
        },
      },
      {
        name: 'return exactly to pinStart while pinned',
        enters: ['unfixed exactly at pinStart'],
        build: g => {
          const p = g.params
          const shown = far(p) - (p.upTolerance + 1)
          return {
            ...g,
            actions: [
              sc(far(p)),
              sc(-(p.upTolerance + 1)),
              sc(-(shown - p.pinStart)),
            ],
          }
        },
      },
      {
        name: 'scroll up by exactly upTolerance while hidden',
        enters: ['slow scroll up stayed hidden'],
        build: g => {
          const params = {
            ...g.params,
            upTolerance: Math.max(1, g.params.upTolerance),
          }
          return {
            ...g,
            params,
            actions: [sc(far(params)), sc(-params.upTolerance)],
          }
        },
      },
      {
        // Pinned just below pinStart, then down to exactly headerHeight +
        // pinStart: not past the header, so it stays pinned.
        name: 'pinned, then down to exactly the end of the header',
        enters: ['stopped exactly at the end of the header'],
        build: g => {
          const p = g.params
          const shown = p.pinStart + 1
          return {
            ...g,
            actions: [
              sc(far(p)),
              sc(-(far(p) - shown)),
              sc(p.headerHeight - 1),
            ],
          }
        },
      },
      {
        name: 'pinned past the header, then down by exactly downTolerance',
        enters: ['moved exactly downTolerance while pinned'],
        build: g => {
          const params = {
            ...g.params,
            downTolerance: Math.max(1, g.params.downTolerance),
          }
          return {
            ...g,
            params,
            actions: [
              sc(far(params)),
              sc(400),
              sc(-(params.upTolerance + 1)),
              sc(params.downTolerance),
            ],
          }
        },
      },
      {
        name: 'flick down inside the unfix gap, then scroll up',
        enters: ['frame inside the unfix gap'],
        build: flickInsideGap,
      },
    ],
  },
  resolve,
  model: plan => scrollRule(plan),
  check: (plan, trace, expected) =>
    noThrow(trace) ??
    matchesPath('scroll rule', trace, expected, modeAndSnap) ??
    pass,
  reached: (plan, trace, expected) => {
    const p = plan.params
    const found = new Set()
    expected.paths[0].forEach((e, i) => {
      if (
        e.rule === 'show inside' &&
        e.from === 'unpinned' &&
        e.y > p.headerHeight &&
        p.pinStart > 0
      )
        found.add('showed inside the region below pinStart')
      if (e.snap) found.add('hid from unfixed')
      if (e.rule === 'hide' && e.from === 'pinned')
        found.add('hid on the way down')
      if (e.rule === 'show fast' && e.from === 'unpinned')
        found.add('showed on a fast scroll up')
      if (e.rule === 'show inside' && e.from === 'unpinned')
        found.add('showed inside the header')
      if (e.rule === 'unfix' && e.y === p.pinStart && e.from !== 'unfixed')
        found.add('unfixed exactly at pinStart')
      if (e.from === 'unpinned' && e.mode === 'unpinned' && e.moved < 0)
        found.add('slow scroll up stayed hidden')
      if (
        e.moved !== 0 &&
        (e.moved === p.downTolerance || -e.moved === p.upTolerance)
      )
        found.add('moved exactly a tolerance')
      if (
        e.from === 'pinned' &&
        e.moved > 0 &&
        e.y === p.headerHeight + p.pinStart
      )
        found.add('stopped exactly at the end of the header')
      if (
        e.from === 'pinned' &&
        e.moved === p.downTolerance &&
        e.y > p.headerHeight + p.pinStart
      )
        found.add('moved exactly downTolerance while pinned')
      if (plan.steps[i].jitter !== null)
        found.add('two scroll events in one frame')
      if (
        e.rule === 'unfix' &&
        e.from !== 'unfixed' &&
        !plan.steps[i].settle &&
        plan.steps[i + 1]
      )
        found.add('frame inside the unfix gap')
    })
    return found
  },
  calibrations: [
    {
      name: 'a pinned header reported as unpinned',
      law: 'scroll rule',
      corrupt: trace => {
        const i = trace.findIndex(
          o => o.checkpoint === 'step' && o.value.mode === 'pinned'
        )
        return i === -1 ? undefined : replaceAt(trace, i, { mode: 'unpinned' })
      },
    },
  ],
}
oracleProperty({
  ...scrollRuleLaw,
  model: scrollRuleLaw.model,
  check: scrollRuleLaw.check,
  id: 'headroom scroll rule',
  owns: ['src/index.js', 'src/core.js', 'src/shouldUpdate.js'],
  driver: drive,
})
oracleProperty({
  ...scrollRuleLaw,
  model: scrollRuleLaw.model,
  check: scrollRuleLaw.check,
  id: 'useHeadroom scroll rule',
  owns: ['src/useHeadroom.js', 'src/core.js', 'src/shouldUpdate.js'],
  driver: driveHook,
})

// ---------------------------------------------------------------------------
// L2: the classes, the inline styles and the wrapper height agree, at every
// settled checkpoint (the mount, and each step after which timeouts ran).
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom class and styles agree',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      "For every history, at every checkpoint (whether or not timeouts have run), the header has exactly one state class, the header has the headroom class and the wrapper the headroom-wrapper class, its inline position and transform are the docs' CSS for that class (unfixed: relative, no translate; pinned: fixed, no translate; unpinned: fixed, translated up by unpinnedOffset, 100% by default) with top, left and right 0 and z-index 1, headroom--scrolled is present exactly when an inline transition is, the wrapper height is wrapperStyle.height when given and otherwise the header's current height (fractions included) after any change of that height, and with disableInlineStyles there is no inline position, transform or transition.",
    authority:
      'www/pages/index.md:42-66 (the state classes and their CSS, and disableInlineStyles), :77 (wrapperStyle "maintains the components vertical space"); decisions by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: the inline styles agree with the class at every checkpoint, with no delay after unfixing (the Safari delay of PR #194 is not needed in Safari 27: tested by hand, with and without it); 2026-11-11: the wrapper tracks the header\'s exact height through any size change, whatever the parent (#166, #133, #92); wrapperStyle.height wins (PR #179); unpinnedOffset sets how far the header slides up (#115, PR #163).',
    limits: `Without a ResizeObserver a new height is owed only after a window resize. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      mountDisable: either,
      mountParent: everyParent,
      scrollOn: ['parent', 'other'],
      toggles: ['pin', 'disable', 'parent'],
      resizes: true,
      calls: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'frame inside the unfix gap',
      'resized without a ResizeObserver',
      'inline styles off',
      'header content resized',
      'resized with a div parent',
      'fractional height',
      'unpinned with an offset',
      'unpinned with a zero offset',
    ],
    measured: ['settled pinned', 'settled unpinned', 'wrapper height given'],
    constructed: [
      {
        name: 'flick down inside the unfix gap',
        enters: ['frame inside the unfix gap'],
        build: flickInsideGap,
      },
      {
        name: 'resize with no ResizeObserver',
        enters: ['resized without a ResizeObserver'],
        build: g => ({
          ...g,
          mount: top,
          params: { ...g.params, resizeObserver: false, wrapperHeight: null },
          actions: [rs(g.params.headerHeight > 60 ? 40 : 90, 1, true)],
        }),
      },
      {
        name: 'hide and show with inline styles off',
        enters: ['inline styles off'],
        build: g => ({
          ...g,
          mount: top,
          params: { ...g.params, disableInlineStyles: true },
          actions: hideShowTop(g.params, true),
        }),
      },
      {
        name: 'header content grows, no window resize',
        enters: ['header content resized', 'fractional height'],
        build: g => ({
          ...g,
          mount: top,
          params: { ...g.params, wrapperHeight: null, resizeObserver: true },
          actions: [rs(g.params.headerHeight > 60 ? 40 : 90, 2, false)],
        }),
      },
      {
        name: 'window resize with a div parent',
        enters: ['resized with a div parent'],
        build: g => ({
          ...g,
          mount: { ...top, parent: 'div' },
          params: { ...g.params, wrapperHeight: null, resizeObserver: true },
          actions: [rs(g.params.headerHeight > 60 ? 40 : 90, 0, true)],
        }),
      },
      {
        // '0' is a CSS length, but calc(-1 * (0)) is a number and invalid.
        name: 'hide with a zero offset',
        enters: ['unpinned with a zero offset'],
        build: g => ({
          ...g,
          mount: top,
          params: {
            ...g.params,
            unpinnedOffset: '0',
            disableInlineStyles: false,
          },
          actions: [sc(far(g.params)), sc(12)],
        }),
      },
      {
        name: 'hide with a 2rem offset',
        enters: ['unpinned with an offset'],
        build: g => ({
          ...g,
          mount: top,
          params: {
            ...g.params,
            unpinnedOffset: '2rem',
            disableInlineStyles: false,
          },
          actions: [sc(far(g.params)), sc(12)],
        }),
      },
    ],
  },
  resolve,
  model: plan => ({ wrapperHeight: wrapperHeights(plan) }),
  driver: drive,
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 0; i < seen.length; i++) {
      const s = seen[i]
      const css = look(s.mode, plan.params)
      if (!css)
        return violation(
          at(i),
          `the header has state classes "${s.mode}"`,
          'class and styles agree'
        )
      const scrolled = s.classes.includes('headroom--scrolled')
      const inline = !plan.params.disableInlineStyles
      const found = differs(
        at(i),
        'class and styles agree',
        {
          base: [
            s.classes.includes('headroom'),
            s.wrapperClasses.includes('headroom-wrapper'),
          ],
          position: s.position,
          box: s.box,
          transform: s.transform,
          transition: s.transition !== '',
          wrapperHeight: s.wrapperHeight,
        },
        {
          base: [true, true],
          position: inline ? css.position : '',
          box: inline
            ? { top: '0px', left: '0px', right: '0px', zIndex: '1' }
            : { top: '', left: '', right: '', zIndex: '' },
          transform: !inline
            ? ''
            : css.transforms.includes(s.transform)
              ? s.transform
              : css.transforms[0],
          transition: inline && scrolled,
          wrapperHeight: expected.wrapperHeight[i],
        },
        `headroom--${s.mode}${scrolled ? ' headroom--scrolled' : ''} with these inline styles`
      )
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace) => {
    const seen = checkpoints(trace)
    const found = new Set()
    if (framedInsideGap(plan, seen)) found.add('frame inside the unfix gap')
    if (plan.params.disableInlineStyles && plan.steps.length > 0)
      found.add('inline styles off')
    if (plan.params.wrapperHeight !== null) found.add('wrapper height given')
    plan.steps.forEach((step, i) => {
      const s = seen[i + 1]
      if (step.settle && s && s.mode === 'pinned') found.add('settled pinned')
      if (step.settle && s && s.mode === 'unpinned')
        found.add('settled unpinned')
      if (
        step.settle &&
        s &&
        s.mode === 'unpinned' &&
        plan.params.unpinnedOffset !== null &&
        !plan.params.disableInlineStyles
      ) {
        found.add('unpinned with an offset')
        if (
          step.settle !== undefined &&
          s &&
          s.mode === 'unpinned' &&
          plan.params.unpinnedOffset === '0' &&
          !plan.params.disableInlineStyles
        )
          found.add('unpinned with a zero offset')
      }
      if (step.kind !== 'resize' || plan.params.wrapperHeight !== null) return
      if (!plan.params.resizeObserver)
        found.add('resized without a ResizeObserver')
      if (!step.window) found.add('header content resized')
      if (step.props.parent === 'div') found.add('resized with a div parent')
      if (!Number.isInteger(step.height)) found.add('fractional height')
    })
    return found
  },
  calibrations: [
    {
      name: 'an unpinned header left in the page flow',
      law: 'class and styles agree',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            o.value.mode === 'unpinned' &&
            plan.steps[o.value.step - 1].settle &&
            !plan.params.disableInlineStyles
        )
        return i === -1
          ? undefined
          : replaceAt(trace, i, { position: 'relative' })
      },
    },
    {
      name: 'a wrapper with the wrong height',
      law: 'class and styles agree',
      corrupt: trace =>
        replaceAt(
          trace,
          trace.findIndex(o => o.checkpoint === 'mount'),
          { wrapperHeight: '1.5px' }
        ),
    },
  ],
})

// ---------------------------------------------------------------------------
// L3: one callback per change of the state.
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom one callback per change',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      'For every history, between two checkpoints onPin, onUnpin and onUnfix fire exactly once for a change of the state class into pinned, unpinned and unfixed respectively, and not at all when the class did not change.',
    authority:
      'www/pages/index.md:70-72 ("onPin — callback called when header is pinned", "onUnpin — ... unpinned", "onUnfix — callback called when header position is no longer fixed").',
    limits: `At mount, a header that starts pinned may fire onPin once or not at all. After unmount is L7's. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      mountDisable: either,
      mountParent: everyParent,
      scrollOn: ['parent', 'other'],
      toggles: ['pin', 'disable', 'parent'],
      resizes: true,
      focus: true,
      calls: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'hidden on enabling',
      'frame inside the unfix gap',
      'onPin fired',
      'onUnpin fired',
      'onUnfix fired',
    ],
    constructed: [
      {
        // Mounted disabled partway down; enabling attaches and hides the
        // header, a change after mount, so onUnpin fires.
        name: 'mount disabled mid-page, then enable',
        enters: ['hidden on enabling'],
        build: g => ({
          ...g,
          mount: { ...top, y: 1000, disable: true },
          actions: [tg('disable')],
        }),
      },
      {
        name: 'two frames at the top inside the unfix gap',
        enters: ['frame inside the unfix gap'],
        build: twoFramesInsideGap,
      },
      {
        name: 'hide, show and return to the top',
        enters: ['onPin fired', 'onUnpin fired', 'onUnfix fired'],
        build: g => ({
          ...g,
          mount: top,
          actions: hideShowTop(g.params, true),
        }),
      },
    ],
  },
  resolve,
  model: () => ({}),
  driver: drive,
  check: (plan, trace) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    const first = seen[0]
    const atMount =
      first.mode === 'pinned' && first.callbacks.length === 1 ? ['onPin'] : []
    const mount = differs(
      'mount',
      'one callback per change',
      first.callbacks,
      atMount
    )
    if (mount) return mount
    for (let i = 1; i < seen.length; i++) {
      const changed = seen[i].mode !== seen[i - 1].mode
      const found = differs(
        at(i),
        'one callback per change',
        seen[i].callbacks,
        changed && CALLBACK[seen[i].mode] ? [CALLBACK[seen[i].mode]] : [],
        `the class went ${seen[i - 1].mode} → ${seen[i].mode}`
      )
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace) => {
    const seen = checkpoints(trace)
    const found = new Set()
    if (framedInsideGap(plan, seen)) found.add('frame inside the unfix gap')
    plan.steps.forEach((step, n) => {
      if (
        step.kind === 'toggle' &&
        step.prop === 'disable' &&
        !step.props.disable &&
        seen[n + 1] &&
        seen[n + 1].mode === 'unpinned' &&
        seen[n].mode === 'unfixed'
      )
        found.add('hidden on enabling')
    })
    for (const s of seen) for (const c of s.callbacks) found.add(`${c} fired`)
    return found
  },
  calibrations: [
    {
      name: 'a callback fired twice',
      law: 'one callback per change',
      corrupt: trace => {
        const i = trace.findIndex(
          o => o.checkpoint === 'step' && o.value.callbacks.length === 1
        )
        return i === -1
          ? undefined
          : replaceAt(trace, i, {
              callbacks: [
                ...trace[i].value.callbacks,
                ...trace[i].value.callbacks,
              ],
            })
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// L4: pin. Checked at the mount and at every step while `pin` is true. Also
// run through useHeadroom (L13).
// ---------------------------------------------------------------------------

const pinLaw = {
  law: {
    statement:
      'For every history, after the first frame of the mount and after every step while pin is true, the header is pinned when its scroller is below pinStart and unfixed when it is at or above pinStart, whatever instance method is called.',
    authority:
      'www/pages/index.md:75 ("pin — pins the header so that it is always visible"), :79 (pinStart, "where the header should start and stop pinning"); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: at or above pinStart a pinned header is unfixed; while pin is true, pin(), unpin() and unfix() do nothing.',
    limits: `The window is the scroller. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      toggles: ['pin'],
      calls: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'pin at mount below pinStart',
      'pin at or above pinStart',
      'pin turned on while hidden',
      'pin turned off',
      'called while pinned by the prop',
    ],
    constructed: [
      {
        name: 'pin, then call every method, at the top and below it',
        enters: ['called while pinned by the prop'],
        build: g => ({
          ...g,
          mount: { ...top, pin: true },
          actions: [
            call('unpin'),
            call('pin'),
            sc(far(g.params)),
            call('unpin'),
            call('unfix'),
          ],
        }),
      },
      {
        name: 'mount with pin partway down the page',
        enters: ['pin at mount below pinStart'],
        build: g => ({
          ...g,
          mount: { ...top, y: 1000, pin: true },
          actions: [],
        }),
      },
      {
        name: 'pin, scroll down, return to the top',
        enters: ['pin at or above pinStart'],
        build: g => ({
          ...g,
          mount: { ...top, pin: true },
          actions: [sc(far(g.params)), sc(-far(g.params))],
        }),
      },
      {
        name: 'hide, then turn pin on and off',
        enters: ['pin turned on while hidden', 'pin turned off'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(far(g.params)), tg('pin'), sc(12), tg('pin')],
        }),
      },
    ],
  },
  resolve,
  model: plan => {
    // From the plan alone: where pin is in force, the owed state at each checkpoint.
    const owed = y => (y <= plan.params.pinStart ? 'unfixed' : 'pinned')
    return {
      owed: [
        plan.mount.pin ? owed(plan.mount.y) : null,
        ...plan.steps.map(step => (step.props.pin ? owed(step.parentY) : null)),
      ],
    }
  },
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 0; i < seen.length; i++) {
      if (expected.owed[i] === null) continue
      const found = differs(
        at(i),
        'pin',
        seen[i].mode,
        expected.owed[i],
        'pin is true here'
      )
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace) => {
    const seen = checkpoints(trace)
    const p = plan.params
    const found = new Set()
    if (plan.mount.pin && plan.mount.y > p.pinStart)
      found.add('pin at mount below pinStart')
    plan.steps.forEach((step, i) => {
      if (
        step.kind === 'scroll' &&
        step.props.pin &&
        step.parentY <= p.pinStart
      )
        found.add('pin at or above pinStart')
      if (
        step.kind === 'toggle' &&
        step.props.pin &&
        seen[i] &&
        seen[i].mode === 'unpinned'
      )
        found.add('pin turned on while hidden')
      if (step.kind === 'toggle' && !step.props.pin) found.add('pin turned off')
      if (step.kind === 'call' && step.props.pin)
        found.add('called while pinned by the prop')
    })
    return found
  },
  calibrations: [
    {
      name: 'a pinned header that hid',
      law: 'pin',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            o.value.mode === 'pinned' &&
            plan.steps[o.value.step - 1].props.pin
        )
        return i === -1 ? undefined : replaceAt(trace, i, { mode: 'unpinned' })
      },
    },
  ],
}
oracleProperty({
  ...pinLaw,
  model: pinLaw.model,
  check: pinLaw.check,
  id: 'headroom pin',
  owns: ['src/index.js', 'src/core.js', 'src/shouldUpdate.js'],
  driver: drive,
})
oracleProperty({
  ...pinLaw,
  model: pinLaw.model,
  check: pinLaw.check,
  id: 'useHeadroom pin',
  // The hook has no instance methods.
  histories: {
    ...pinLaw.histories,
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      toggles: ['pin'],
    }),
    states: pinLaw.histories.states.filter(
      state => state !== 'called while pinned by the prop'
    ),
    constructed: pinLaw.histories.constructed.filter(
      c => !c.name.includes('call every method')
    ),
  },
  owns: ['src/useHeadroom.js', 'src/core.js', 'src/shouldUpdate.js'],
  driver: driveHook,
})

// ---------------------------------------------------------------------------
// L5: disable. Checked at the mount and every step while `disable` is true.
// Also run through useHeadroom (L13).
// ---------------------------------------------------------------------------

const disableLaw = {
  law: {
    statement:
      'For every history, at the mount and after every step while disable is true, the header is unfixed, nothing listens to its scroller, and no callback fires (whatever pin, focus or an instance method asks), except that the step that turns disable on fires onUnfix once when the header was not unfixed before it.',
    authority:
      'www/pages/index.md:76 ("disable — disable pinning and unpinning"), :72 (onUnfix, "called when header position is no longer fixed"); the v3.2 source comment "Add/remove event listeners when re-enabled/disabled".',
    limits: `The first frame after disable turns off is L6's. The window is the scroller. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountDisable: either,
      mountParent: fc.constantFrom('window', 'late'),
      toggles: ['disable', 'pin'],
      focus: true,
      calls: true,
      nudges: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'disabled while fixed',
      'disabled at mount',
      'scrolled while disabled',
      're-enabled',
      'asked to pin while disabled',
      'disabled with a frame pending',
    ],
    constructed: [
      {
        name: 'hide, show, disable, scroll',
        enters: ['disabled while fixed', 'scrolled while disabled'],
        build: g => {
          const p = g.params
          return {
            ...g,
            mount: top,
            actions: [
              sc(far(p)),
              sc(-(p.upTolerance + 1)),
              tg('disable'),
              sc(-12),
              sc(300),
            ],
          }
        },
      },
      {
        // A scroll up whose frame runs after disable turns on must not pin.
        name: 'hide, then disable with a scroll up pending',
        enters: ['disabled with a frame pending'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(far(g.params)), sc(400), tg('disable', true, -200)],
        }),
      },
      {
        name: 'hide, disable, then ask to pin every way',
        enters: ['asked to pin while disabled'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            sc(far(g.params)),
            tg('disable'),
            call('pin'),
            call('unpin'),
            fo(),
            tg('pin'),
            sc(-12),
          ],
        }),
      },
      {
        name: 'mount disabled, scroll, enable',
        enters: ['disabled at mount', 're-enabled'],
        build: g => ({
          ...g,
          mount: { ...top, disable: true },
          actions: [sc(far(g.params)), tg('disable'), sc(far(g.params))],
        }),
      },
    ],
  },
  resolve,
  model: plan => ({
    disabled: [
      plan.mount.disable,
      ...plan.steps.map(step => step.props.disable),
    ],
    turnedOn: [
      false,
      ...plan.steps.map(
        step =>
          step.kind === 'toggle' &&
          step.prop === 'disable' &&
          step.props.disable
      ),
    ],
  }),
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 0; i < seen.length; i++) {
      if (!expected.disabled[i]) continue
      const callbacks =
        expected.turnedOn[i] && seen[i - 1].mode !== 'unfixed'
          ? ['onUnfix']
          : []
      const found = differs(
        at(i),
        'disable',
        {
          mode: seen[i].mode,
          callbacks: seen[i].callbacks,
          listening: seen[i].listening.filter(l => / scroll/.test(l)),
        },
        { mode: 'unfixed', callbacks, listening: [] },
        'disable is true here'
      )
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace) => {
    const seen = checkpoints(trace)
    const found = new Set()
    if (plan.mount.disable) found.add('disabled at mount')
    plan.steps.forEach((step, i) => {
      const toggledDisable = step.kind === 'toggle' && step.prop === 'disable'
      if (
        toggledDisable &&
        step.props.disable &&
        seen[i] &&
        seen[i].mode !== 'unfixed'
      )
        found.add('disabled while fixed')
      if (step.kind === 'scroll' && step.props.disable)
        found.add('scrolled while disabled')
      if (toggledDisable && !step.props.disable) found.add('re-enabled')
      const asksToPin =
        step.kind === 'call' ||
        step.kind === 'focus' ||
        (step.kind === 'toggle' && step.prop === 'pin')
      if (asksToPin && step.props.disable)
        found.add('asked to pin while disabled')
      if (toggledDisable && step.props.disable && step.nudgeY !== undefined)
        found.add('disabled with a frame pending')
    })
    return found
  },
  calibrations: [
    {
      name: 'a disabled header that pinned',
      law: 'disable',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            plan.steps[o.value.step - 1].props.disable
        )
        return i === -1 ? undefined : replaceAt(trace, i, { mode: 'pinned' })
      },
    },
  ],
}
oracleProperty({
  ...disableLaw,
  model: disableLaw.model,
  check: disableLaw.check,
  id: 'headroom disable',
  owns: ['src/index.js', 'src/core.js', 'src/shouldUpdate.js'],
  driver: drive,
})
oracleProperty({
  ...disableLaw,
  model: disableLaw.model,
  check: disableLaw.check,
  id: 'useHeadroom disable',
  owns: ['src/useHeadroom.js', 'src/core.js', 'src/shouldUpdate.js'],
  // The hook has no instance methods, so its histories ask to pin through
  // focus and the pin prop only.
  histories: {
    ...disableLaw.histories,
    arbitrary: historiesOf({
      mountDisable: either,
      mountParent: fc.constantFrom('window', 'late'),
      toggles: ['disable', 'pin'],
      focus: true,
      nudges: true,
    }),
    constructed: disableLaw.histories.constructed.map(c =>
      c.name.startsWith('hide, disable, then ask')
        ? {
            ...c,
            build: g => {
              const built = c.build(g)
              return {
                ...built,
                actions: built.actions.filter(a => a.kind !== 'call'),
              }
            },
          }
        : c
    ),
  },
  driver: driveHook,
})

// ---------------------------------------------------------------------------
// L6: the current parent drives the header, including a parent that resolves
// only after mount. Also run through useHeadroom (L13).
// ---------------------------------------------------------------------------

const parentLaw = {
  law: {
    statement:
      "For every history of scrolls on the parent and on another element, changes of parent (to the window, a scrolling element or nothing) and toggles of disable, the header follows the scroll rule for frames of the current parent only, through passive listeners (a parent of document, document.documentElement or document.body is the page, as the window is); each time it attaches to a scroller (a parent change, or disable turning off), the next frame measures from that scroller's position at attach and counts as a first frame, and if the header is unfixed past the header's height plus pinStart it hides without a transition (silently at mount, with onUnpin later); a parent() that returns nothing does not throw, and the element it returns by the first frame drives the header.",
    authority:
      'www/pages/index.md:78 ("parent — provide a custom \'parent\' element for scroll events. parent should be a function which resolves to the desired element"); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: parent may change while mounted, and the listeners follow it; issue #110 (a ref-backed parent is empty during mount); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: on attach the reference is the scroller\'s current position (review finding R6); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: a header that attaches past its region starts hidden, so a page restored mid-scroll shows it on the first scroll up (review finding T1); 2026-11-12: the document, its root element and the body name the page, as in 3.2.1 (review finding T4); commit 3f1b2f5 ("feat: support passive event listeners").',
    limits: `pin stays false. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: fc.oneof(fc.constant(0), anywhere),
      mountParent: fc.constantFrom('window', 'div', 'late'),
      pageAs: fc.constantFrom('window', 'document', 'html', 'body'),
      scrollOn: ['parent', 'other'],
      toggles: ['parent', 'disable'],
      nudges: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'mounted exactly at the end of the region',
      'the page named through the body',
      'the page named through the root element',
      'the page named through the document',
      'mounted mid-page, then scrolled up',
      'enabled mid-page, then scrolled up',
      'scrolled down right after a parent change',
      'hid on the first frame after a parent change',
      'showed on the first frame after a parent change',
      'scrolled down right after enabling',
      'parent emptied with a frame pending',
      'listening on the window',
      'parent changed',
      'scrolled the new parent after a change',
      'scrolled the old parent after a change',
      'parent resolved after mount',
    ],
    constructed: [
      {
        // Mounted exactly at headerHeight + pinStart: not past the region, so
        // it stays in place.
        name: 'mount exactly at the end of the header region',
        enters: ['mounted exactly at the end of the region'],
        build: g => ({
          ...g,
          mount: { ...top, y: g.params.headerHeight + g.params.pinStart },
          actions: [sc(0)],
        }),
      },
      {
        name: 'the body as parent: hide, then show',
        enters: ['the page named through the body'],
        build: g => ({
          ...g,
          mount: { ...top, pageAs: 'body' },
          actions: [sc(far(g.params)), sc(-(g.params.upTolerance + 1))],
        }),
      },
      {
        name: 'the root element as parent: hide, then show',
        enters: ['the page named through the root element'],
        build: g => ({
          ...g,
          mount: { ...top, pageAs: 'html' },
          actions: [sc(far(g.params)), sc(-(g.params.upTolerance + 1))],
        }),
      },
      {
        // parent={() => document} (or its root element, or the body) is the
        // page, as it was in 3.2.1.
        name: 'the document as parent: hide, then show',
        enters: ['the page named through the document'],
        build: g => ({
          ...g,
          mount: { ...top, pageAs: 'document' },
          actions: [sc(far(g.params)), sc(-(g.params.upTolerance + 1))],
        }),
      },
      {
        // A page restored mid-scroll (Back navigation): the header starts
        // hidden, and the first fast scroll up shows it.
        name: 'mount at 1000, then scroll up',
        enters: ['mounted mid-page, then scrolled up'],
        build: g => ({
          ...g,
          mount: { ...top, y: 1000 },
          actions: [sc(-(g.params.upTolerance + 1))],
        }),
      },
      {
        name: 'disable, scroll far down, enable, scroll up',
        enters: ['enabled mid-page, then scrolled up'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            tg('disable'),
            sc(400),
            sc(400),
            tg('disable'),
            sc(-(g.params.upTolerance + 1)),
          ],
        }),
      },
      {
        // Hidden on the window; the div sits at 300. The first frame after the
        // switch moves 50px up from 300: it shows. Measured from anywhere but
        // 300, it would not.
        name: 'hidden on the window, switch to the div, show on the first frame',
        enters: ['showed on the first frame after a parent change'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            sc(far(g.params)),
            sc(400),
            sc(300, true, 'other'),
            tg('parent'),
            sc(-50),
          ],
        }),
      },
      {
        // Pinned on the window; the div sits at 300. The first frame after the
        // switch moves 50px down from 300, past the header: it hides.
        name: 'pinned on the window, switch to the div, hide on the first frame',
        enters: ['hid on the first frame after a parent change'],
        build: g => {
          const p = g.params
          return {
            ...g,
            mount: top,
            actions: [
              sc(far(p)),
              sc(-(p.upTolerance + 1)),
              sc(300, true, 'other'),
              tg('parent'),
              sc(50),
            ],
          }
        },
      },
      {
        // Hidden far down the window; the div sits at 300. After the switch
        // a 10px scroll down must not count as a 1000px move up.
        name: 'hidden on the window, switch to the div, scroll it down',
        enters: ['scrolled down right after a parent change'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            sc(far(g.params)),
            sc(400),
            sc(400),
            sc(300, true, 'other'),
            tg('parent'),
            sc(10),
          ],
        }),
      },
      {
        // Hidden at 1000+, disabled, scrolled to 300, enabled, then down:
        // the frame measures from 300.
        name: 'hidden, disable, scroll up a lot, enable, scroll down',
        enters: ['scrolled down right after enabling'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            sc(far(g.params)),
            sc(400),
            sc(400),
            tg('disable'),
            sc(-400),
            sc(-400),
            tg('disable'),
            sc(10),
          ],
        }),
      },
      {
        // The parent's element goes away (a ref to a container that
        // unmounted) while a scroll's frame is still pending.
        name: 'scroll the div, then its element goes away before the frame',
        enters: ['parent emptied with a frame pending'],
        build: g => ({
          ...g,
          mount: { ...top, parent: 'div' },
          actions: [sc(far(g.params)), tg('parent', true, 40)],
        }),
      },
      {
        name: 'pinned, move to a new parent, scroll both',
        enters: [
          'listening on the window',
          'parent changed',
          'scrolled the new parent after a change',
          'scrolled the old parent after a change',
        ],
        build: g => {
          const p = g.params
          const shown = far(p) - (p.upTolerance + 1)
          return {
            ...g,
            mount: { ...top, parent: 'window' },
            actions: [
              sc(far(p)),
              sc(-(p.upTolerance + 1)),
              tg('parent'),
              sc(Math.min(400, shown + p.downTolerance + 51)),
              sc(-(p.upTolerance + 1), true, 'other'),
            ],
          }
        },
      },
      {
        name: 'a ref parent, then hide',
        enters: ['parent resolved after mount'],
        build: g => ({
          ...g,
          mount: { ...top, parent: 'late' },
          actions: [sc(far(g.params))],
        }),
      },
    ],
  },
  resolve,
  model: plan => scrollRule(plan),
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    // Every scroll and resize listener is passive: headroom never blocks scrolling.
    const seen = checkpoints(trace)
    for (let i = 0; i < seen.length; i++) {
      const blocking = seen[i].listening.filter(l =>
        l.endsWith('(not passive)')
      )
      const found = differs(
        at(i),
        'parent',
        blocking,
        [],
        'a listener that is not passive'
      )
      if (found) return found
    }
    // A header that starts hidden does so silently.
    const silent = differs(
      'mount',
      'parent',
      seen[0].callbacks,
      [],
      'callbacks at mount'
    )
    if (silent) return silent
    return matchesPath('parent', trace, expected, modeAndSnap) ?? pass
  },
  reached: (plan, trace) => {
    const found = new Set()
    // The premise of the passive clause: the window's listener is recorded.
    if (checkpoints(trace).some(s => s.listening.includes('window scroll')))
      found.add('listening on the window')
    if (plan.mount.late && plan.steps.length > 0)
      found.add('parent resolved after mount')
    for (const step of plan.steps) {
      if (
        step.kind === 'toggle' &&
        step.props.parent === 'none' &&
        step.nudgeY !== undefined
      )
        found.add('parent emptied with a frame pending')
    }
    if (
      plan.mount.pageAs !== 'window' &&
      plan.steps.some(
        step =>
          step.kind === 'scroll' &&
          step.scroller === 'window' &&
          step.props.parent === 'window'
      )
    )
      found.add('the page named through the document')
    if (
      plan.mount.y === plan.params.headerHeight + plan.params.pinStart &&
      plan.mount.y > 0
    )
      found.add('mounted exactly at the end of the region')
    const pageScrolled = plan.steps.some(
      step =>
        step.kind === 'scroll' &&
        step.scroller === 'window' &&
        step.props.parent === 'window'
    )
    if (pageScrolled && plan.mount.pageAs === 'body')
      found.add('the page named through the body')
    if (pageScrolled && plan.mount.pageAs === 'html')
      found.add('the page named through the root element')
    const p = plan.params
    const first = plan.steps[0]
    if (
      plan.mount.y > p.headerHeight + p.pinStart &&
      first &&
      first.kind === 'scroll' &&
      first.scroller === first.props.parent &&
      plan.mount.y - first.y > p.upTolerance
    )
      found.add('mounted mid-page, then scrolled up')
    plan.steps.forEach((step, n) => {
      const after = plan.steps[n + 1]
      if (
        after &&
        step.kind === 'toggle' &&
        step.prop === 'disable' &&
        !step.props.disable &&
        step.parentY > p.headerHeight + p.pinStart &&
        after.kind === 'scroll' &&
        after.scroller === after.props.parent &&
        step.parentY - after.y > p.upTolerance
      )
        found.add('enabled mid-page, then scrolled up')
    })
    plan.steps.forEach((step, n) => {
      const next = plan.steps[n + 1]
      if (
        !next ||
        next.kind !== 'scroll' ||
        next.scroller !== next.props.parent ||
        next.y <= step.parentY
      )
        return
      if (
        step.kind === 'toggle' &&
        step.prop === 'parent' &&
        step.props.parent !== 'none'
      )
        found.add('scrolled down right after a parent change')
      if (
        step.kind === 'toggle' &&
        step.prop === 'parent' &&
        step.props.parent !== 'none' &&
        next.y - step.parentY > plan.params.downTolerance &&
        next.y > plan.params.headerHeight + plan.params.pinStart
      )
        found.add('hid on the first frame after a parent change')
    })
    plan.steps.forEach((step, n) => {
      const next = plan.steps[n + 1]
      if (
        next &&
        step.kind === 'toggle' &&
        step.prop === 'parent' &&
        step.props.parent !== 'none' &&
        next.kind === 'scroll' &&
        next.scroller === next.props.parent &&
        step.parentY - next.y > plan.params.upTolerance &&
        next.y > plan.params.pinStart
      )
        found.add('showed on the first frame after a parent change')
      if (
        step.kind === 'toggle' &&
        step.prop === 'disable' &&
        !step.props.disable
      )
        found.add('scrolled down right after enabling')
    })
    let changed = false
    for (const step of plan.steps) {
      if (step.kind === 'toggle') {
        changed = true
        found.add('parent changed')
      } else if (changed && step.scroller === step.props.parent)
        found.add('scrolled the new parent after a change')
      else if (changed) found.add('scrolled the old parent after a change')
    }
    return found
  },
  calibrations: [
    {
      name: 'the new parent ignored',
      law: 'parent',
      corrupt: trace => {
        const i = trace.findIndex(
          o => o.checkpoint === 'step' && o.value.mode !== 'unfixed'
        )
        return i === -1 ? undefined : replaceAt(trace, i, { mode: 'unfixed' })
      },
    },
  ],
}
oracleProperty({
  ...parentLaw,
  model: parentLaw.model,
  check: parentLaw.check,
  id: 'headroom parent',
  owns: ['src/index.js', 'src/core.js'],
  driver: drive,
})
oracleProperty({
  ...parentLaw,
  model: parentLaw.model,
  check: parentLaw.check,
  id: 'useHeadroom parent',
  owns: ['src/useHeadroom.js', 'src/core.js'],
  driver: driveHook,
})

// ---------------------------------------------------------------------------
// L7: cleanup after unmount. Also run through useHeadroom (L13).
// ---------------------------------------------------------------------------

const cleanupLaw = {
  law: {
    statement:
      'For every history, after unmount no scroll or resize listener on the scrollers, no focusin listener on the header and no ResizeObserver that was added remains, and a frame, resize or timeout that was pending at unmount fires no callback and logs nothing.',
    authority:
      'Decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: unmount leaves nothing behind and nothing runs afterwards (PR #208, issue #138); www/pages/index.md:78 (parent).',
    limits: `Pending work is one scroll to the top or one window resize, plus any unfix timeout the last step left. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      mountDisable: either,
      mountParent: everyParent,
      scrollOn: ['parent', 'other'],
      toggles: ['pin', 'disable', 'parent', 'calcHeightOnResize'],
      resizes: true,
      swaps: true,
      pending: fc.constantFrom('none', 'scroll', 'resize'),
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'header dropped with a resize pending',
      'unmounted with a frame pending',
      'unmounted with a resize pending',
      'unmounted after a parent change',
      'unmounted inside the unfix gap',
      'unmounted in StrictMode',
      'unmounted after tracking toggled',
    ],
    constructed: [
      {
        // Without a ResizeObserver a window resize queues a measure; the
        // header element unmounts before that frame runs.
        name: 'no ResizeObserver, hide, drop the header with a resize pending',
        enters: ['header dropped with a resize pending'],
        build: g => ({
          ...g,
          params: { ...g.params, resizeObserver: false },
          mount: top,
          actions: [
            sc(far(g.params)),
            { kind: 'swap', drop: true, resizeFirst: true, settle: true },
            { kind: 'swap', drop: false, resizeFirst: false, settle: true },
          ],
        }),
      },
      {
        name: 'pinned, then unmount with a scroll to the top pending',
        enters: ['unmounted with a frame pending'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(far(g.params)), sc(-(g.params.upTolerance + 1))],
          pending: 'scroll',
        }),
      },
      {
        name: 'unmount with a resize pending',
        enters: ['unmounted with a resize pending'],
        build: g => ({ ...g, mount: top, actions: [], pending: 'resize' }),
      },
      {
        name: 'change parent, then unmount',
        enters: ['unmounted after a parent change'],
        build: g => ({
          ...g,
          mount: top,
          actions: [tg('parent')],
          pending: 'none',
        }),
      },
      {
        name: 'StrictMode, hide, replace the header, unmount',
        enters: ['unmounted in StrictMode'],
        build: g => ({
          ...g,
          params: { ...g.params, strictMode: true },
          mount: top,
          actions: [
            sc(far(g.params)),
            { kind: 'swap', drop: false, resizeFirst: false, settle: true },
          ],
          pending: 'scroll',
        }),
      },
      {
        // With a ResizeObserver, so a second observer would be seen.
        name: 'toggle tracking off and on, then unmount',
        enters: ['unmounted after tracking toggled'],
        build: g => ({
          ...g,
          params: { ...g.params, resizeObserver: true },
          mount: top,
          actions: [tg('calcHeightOnResize'), tg('calcHeightOnResize')],
          pending: 'resize',
        }),
      },
      {
        name: 'unmount inside the unfix gap',
        enters: ['unmounted inside the unfix gap'],
        build: g => ({
          ...g,
          mount: top,
          actions: hideShowTop(g.params, false),
          pending: 'none',
        }),
      },
    ],
  },
  resolve,
  model: () => ({ listeners: [], observers: 0, callbacks: [], logged: [] }),
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    return (
      differs(
        'unmount',
        'cleanup',
        (({ listeners, observers, callbacks, logged }) => ({
          listeners,
          observers,
          callbacks,
          logged,
        }))(unmountOf(trace).value),
        expected,
        'left behind or ran after unmount'
      ) ?? pass
    )
  },
  reached: (plan, trace) => {
    const seen = checkpoints(trace)
    const found = new Set()
    if (
      plan.steps.some(
        step =>
          step.kind === 'swap' &&
          step.drop &&
          step.resizeFirst &&
          !plan.params.resizeObserver
      )
    )
      found.add('header dropped with a resize pending')
    if (plan.pending === 'scroll') found.add('unmounted with a frame pending')
    if (plan.params.strictMode) found.add('unmounted in StrictMode')
    if (
      plan.steps.some(
        step => step.kind === 'toggle' && step.prop === 'calcHeightOnResize'
      )
    )
      found.add('unmounted after tracking toggled')
    if (plan.pending === 'resize') found.add('unmounted with a resize pending')
    if (
      plan.steps.some(step => step.kind === 'toggle' && step.prop === 'parent')
    )
      found.add('unmounted after a parent change')
    const last = plan.steps.length
    if (
      last > 0 &&
      !plan.steps[last - 1].settle &&
      seen[last].mode === 'unfixed' &&
      seen[last - 1].mode !== 'unfixed'
    ) {
      found.add('unmounted inside the unfix gap')
    }
    return found
  },
  calibrations: [
    {
      name: 'a listener left after unmount',
      law: 'cleanup',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'unmount'
            ? { ...o, value: { ...o.value, listeners: ['window resize'] } }
            : o
        ),
    },
    {
      name: 'a callback after unmount',
      law: 'cleanup',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'unmount'
            ? { ...o, value: { ...o.value, callbacks: ['onUnfix'] } }
            : o
        ),
    },
  ],
}
oracleProperty({
  ...cleanupLaw,
  model: cleanupLaw.model,
  check: cleanupLaw.check,
  id: 'headroom cleanup',
  // The component always renders its header, so its swaps never drop it.
  histories: {
    ...cleanupLaw.histories,
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      mountDisable: either,
      mountParent: everyParent,
      scrollOn: ['parent', 'other'],
      toggles: ['pin', 'disable', 'parent', 'calcHeightOnResize'],
      resizes: true,
      swaps: true,
      drops: false,
      pending: fc.constantFrom('none', 'scroll', 'resize'),
    }),
    states: cleanupLaw.histories.states.filter(
      state => state !== 'header dropped with a resize pending'
    ),
    constructed: cleanupLaw.histories.constructed.filter(
      c => !c.name.includes('drop the header')
    ),
  },
  owns: ['src/index.js', 'src/core.js'],
  driver: drive,
})
oracleProperty({
  ...cleanupLaw,
  model: cleanupLaw.model,
  check: cleanupLaw.check,
  id: 'useHeadroom cleanup',
  owns: ['src/useHeadroom.js', 'src/core.js'],
  driver: driveHook,
})

// ---------------------------------------------------------------------------
// L8: overscroll changes nothing. Also run through useHeadroom (L13).
// ---------------------------------------------------------------------------

const overscrollLaw = {
  law: {
    statement:
      'For every history of scrolls that may pass up to 80px beyond the top or the bottom, a frame more than 1px past either end leaves the header as it was and does not move the reference, and every in-bounds frame follows the scroll rule.',
    authority:
      'Commit c17a809 ("Ignore OSX bounce", PR #90); issue #195; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: overscroll changes nothing, including the reference; 2026-11-12: up to 1px past either end is in bounds, as browser zoom gives fractional positions (review finding R5).',
    limits: `The window is the scroller; mount at the top, no prop changes. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({}),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'exactly 1px past the top',
      'exactly 1px past the bottom',
      'bounced past the bottom',
      'bounced past the top',
    ],
    constructed: [
      {
        // Pinned near the top, then exactly 1px past it: in bounds, so the
        // header unfixes at pinStart or above.
        name: 'pinned, then exactly 1px past the top',
        enters: ['exactly 1px past the top'],
        build: g => {
          const p = g.params
          const shown = far(p) - (p.upTolerance + 1)
          return {
            ...g,
            params: { ...g.params, scrollbar: 0 },
            mount: top,
            actions: [sc(far(p)), sc(-(p.upTolerance + 1)), sc(-(shown + 1))],
          }
        },
      },
      {
        // Pinned near the bottom, then exactly 1px past it while moving down:
        // in bounds, so it hides.
        name: 'pinned near the bottom, then exactly 1px past it',
        enters: ['exactly 1px past the bottom'],
        build: g => {
          const steps = []
          for (let y = 0; y < MAX_Y - 100; y += 400)
            steps.push(sc(Math.min(400, MAX_Y - 100 - y)))
          return {
            ...g,
            params: {
              ...g.params,
              scrollbar: 0,
              downTolerance: 0,
              upTolerance: 0,
            },
            mount: top,
            actions: [...steps, sc(-1), sc(102)],
          }
        },
      },
      {
        name: 'hide, reach the bottom, bounce, settle',
        enters: ['bounced past the bottom'],
        build: g => {
          const steps = [sc(far(g.params))]
          for (let y = far(g.params); y < MAX_Y; y += 400)
            steps.push(sc(Math.min(400, MAX_Y - y)))
          return {
            ...g,
            params: { ...g.params, scrollbar: 0 },
            mount: top,
            actions: [...steps.slice(0, 12), sc(40), sc(-40)],
          }
        },
      },
      {
        name: 'pinned near the top, bounce past it, settle',
        enters: ['bounced past the top'],
        build: g => {
          const p = g.params
          const shown = far(p) - (p.upTolerance + 1)
          return {
            ...g,
            mount: top,
            actions: [
              sc(far(p)),
              sc(-(p.upTolerance + 1)),
              sc(-(shown + 40)),
              sc(40),
            ],
          }
        },
      },
    ],
  },
  resolve: resolveWithin(OVERSCROLL),
  model: plan => scrollRule(plan),
  check: (plan, trace, expected) =>
    noThrow(trace) ??
    matchesPath('overscroll', trace, expected, modeAndSnap) ??
    pass,
  reached: plan => {
    const found = new Set()
    for (const step of plan.steps) {
      if (step.kind === 'scroll' && step.y === -1)
        found.add('exactly 1px past the top')
      if (
        step.kind === 'scroll' &&
        step.y === MAX_Y + plan.params.scrollbar + 1
      )
        found.add('exactly 1px past the bottom')
    }
    for (const step of plan.steps) {
      if (step.kind === 'scroll' && step.y > MAX_Y)
        found.add('bounced past the bottom')
      if (step.kind === 'scroll' && step.y < 0)
        found.add('bounced past the top')
    }
    return found
  },
  calibrations: [
    {
      name: 'a bounce that showed the header',
      law: 'overscroll',
      corrupt: trace => {
        const i = trace.findIndex(
          o => o.checkpoint === 'step' && o.value.mode === 'unpinned'
        )
        return i === -1 ? undefined : replaceAt(trace, i, { mode: 'pinned' })
      },
    },
  ],
}
oracleProperty({
  ...overscrollLaw,
  model: overscrollLaw.model,
  check: overscrollLaw.check,
  id: 'headroom overscroll',
  owns: ['src/index.js', 'src/core.js'],
  driver: drive,
})
oracleProperty({
  ...overscrollLaw,
  model: overscrollLaw.model,
  check: overscrollLaw.check,
  id: 'useHeadroom overscroll',
  owns: ['src/useHeadroom.js', 'src/core.js'],
  driver: driveHook,
})

// ---------------------------------------------------------------------------
// L9: focus shows a hidden header. Also run through useHeadroom (L13).
// ---------------------------------------------------------------------------

const focusLaw = {
  law: {
    statement:
      'For every history of scrolls and of keyboard focus moving into the header, focus moving into a hidden (unpinned) header pins it, focus into a pinned or unfixed header changes nothing, and frames follow the scroll rule.',
    authority:
      'WCAG 2.2 SC 2.4.11 ("Focus Not Obscured (Minimum)"); issue #176; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11.',
    limits: `Focus moves to a link inside the header; blur and focus leaving the header are not judged. The window is the scroller; no prop changes. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({ focus: true, swaps: true }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'header dropped with a resize pending',
      'focused while hidden',
      'focused while shown',
      'focused a replaced header',
    ],
    constructed: [
      {
        // Without a ResizeObserver a window resize queues a measure; the
        // header element unmounts before that frame runs.
        name: 'no ResizeObserver, hide, drop the header with a resize pending',
        enters: ['header dropped with a resize pending'],
        build: g => ({
          ...g,
          params: { ...g.params, resizeObserver: false },
          mount: top,
          actions: [
            sc(far(g.params)),
            { kind: 'swap', drop: true, resizeFirst: true, settle: true },
            { kind: 'swap', drop: false, resizeFirst: false, settle: true },
          ],
        }),
      },
      {
        // The hook's ref moves to a new element; focus there must still pin.
        name: 'hide, replace the header element, then Tab into it',
        enters: ['focused a replaced header'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            sc(far(g.params)),
            { kind: 'swap', drop: false, resizeFirst: false, settle: true },
            fo(),
          ],
        }),
      },
      {
        name: 'hide, then Tab into the header',
        enters: ['focused while hidden'],
        build: g => ({ ...g, mount: top, actions: [sc(far(g.params)), fo()] }),
      },
      {
        name: 'hide, show, then Tab into the header',
        enters: ['focused while shown'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(far(g.params)), sc(-(g.params.upTolerance + 1)), fo()],
        }),
      },
    ],
  },
  resolve,
  model: plan => scrollRule(plan),
  check: (plan, trace, expected) =>
    noThrow(trace) ??
    matchesPath('focus', trace, expected, modeAndSnap) ??
    pass,
  reached: (plan, trace, expected) => {
    const found = new Set()
    if (
      plan.steps.some(
        step =>
          step.kind === 'swap' &&
          step.drop &&
          step.resizeFirst &&
          !plan.params.resizeObserver
      )
    )
      found.add('header dropped with a resize pending')
    let swapped = false
    expected.paths[0].forEach((e, i) => {
      if (plan.steps[i].kind === 'swap') swapped = true
      if (e.rule === 'focus' && e.from === 'unpinned')
        found.add(
          swapped ? 'focused a replaced header' : 'focused while hidden'
        )
      if (e.rule === 'focus' && e.from !== 'unpinned')
        found.add('focused while shown')
    })
    return found
  },
  calibrations: [
    {
      name: 'focus left the header hidden',
      law: 'focus',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            plan.steps[o.value.step - 1].kind === 'focus' &&
            o.value.mode === 'pinned'
        )
        return i === -1 ? undefined : replaceAt(trace, i, { mode: 'unpinned' })
      },
    },
  ],
}
oracleProperty({
  ...focusLaw,
  model: focusLaw.model,
  check: focusLaw.check,
  id: 'headroom focus',
  // The component always renders its header, so its swaps never drop it.
  histories: {
    ...focusLaw.histories,
    arbitrary: historiesOf({ focus: true, swaps: true, drops: false }),
    states: focusLaw.histories.states.filter(
      state => state !== 'header dropped with a resize pending'
    ),
    constructed: focusLaw.histories.constructed.filter(
      c => !c.name.includes('drop the header')
    ),
  },
  owns: ['src/index.js', 'src/core.js'],
  driver: drive,
})
oracleProperty({
  ...focusLaw,
  model: focusLaw.model,
  check: focusLaw.check,
  id: 'useHeadroom focus',
  owns: ['src/useHeadroom.js', 'src/core.js'],
  driver: driveHook,
})

// ---------------------------------------------------------------------------
// L10: the wrapper carries the header's state.
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom wrapper state class',
  owns: ['src/index.js'],
  law: {
    statement:
      "For every history, at every checkpoint the wrapper has exactly one headroom-wrapper--<state> class, and it names the header's state.",
    authority:
      'Issues #108 and #152 (sibling selectors such as .headroom-wrapper--pinned + .main); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11.',
    limits: LIMITS,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      mountDisable: either,
      toggles: ['pin', 'disable'],
    }),
    runs: 40,
    fixedSeeds: [1],
    states: ['wrapper pinned', 'wrapper unpinned'],
    constructed: [
      {
        name: 'hide and show',
        enters: ['wrapper pinned', 'wrapper unpinned'],
        build: g => ({
          ...g,
          mount: top,
          actions: hideShowTop(g.params, true),
        }),
      },
    ],
  },
  resolve,
  model: () => ({}),
  driver: drive,
  check: (plan, trace) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 0; i < seen.length; i++) {
      const states = seen[i].wrapperClasses.filter(c =>
        c.startsWith('headroom-wrapper--')
      )
      const found = differs(at(i), 'wrapper state class', states, [
        `headroom-wrapper--${seen[i].mode}`,
      ])
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace) =>
    new Set(
      checkpoints(trace)
        .filter(s => s.mode !== 'unfixed')
        .map(s => `wrapper ${s.mode}`)
    ),
  calibrations: [
    {
      name: 'a wrapper that missed a change',
      law: 'wrapper state class',
      corrupt: trace => {
        const i = trace.findIndex(
          o => o.checkpoint === 'step' && o.value.mode === 'pinned'
        )
        return i === -1
          ? undefined
          : replaceAt(trace, i, {
              wrapperClasses: [
                'headroom-wrapper',
                'headroom-wrapper--unpinned',
              ],
            })
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// L11: headroom--bottom.
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom bottom class',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      "For every history of scrolls that may overscroll, the header has headroom--bottom exactly when the last in-bounds frame of its scroller ended within 1px of the scroller's bottom, and never before the first such frame.",
    authority:
      'Issue #107 ("headroom--bottom", as headroom.js has); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11.',
    limits: `The window is the scroller; mount at the top. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({}),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'reached the bottom',
      'left the bottom',
      'one pixel above the bottom',
      'bottom with a horizontal scrollbar',
      'fractional bottom',
    ],
    constructed: [
      {
        // Zoom: the true bottom is 0.4px past the rounded scrollHeight.
        name: 'scroll to 0.4px past the rounded bottom',
        enters: ['fractional bottom'],
        build: g => {
          const steps = []
          for (let y = 0; y < MAX_Y - 2; y += 400)
            steps.push(sc(Math.min(400, MAX_Y - 2 - y)))
          return {
            ...g,
            params: { ...g.params, scrollbar: 0 },
            mount: top,
            actions: [...steps, sc(2, true, 'parent', 16, 0.4)],
          }
        },
      },
      {
        name: 'scroll to one pixel above the bottom',
        enters: ['one pixel above the bottom'],
        build: g => {
          const steps = []
          for (let y = 0; y < MAX_Y - 1; y += 400)
            steps.push(sc(Math.min(400, MAX_Y - 1 - y)))
          return {
            ...g,
            params: { ...g.params, scrollbar: 0 },
            mount: top,
            actions: steps,
          }
        },
      },
      {
        name: 'scroll to the bottom, bounce, leave',
        enters: ['reached the bottom', 'left the bottom'],
        build: g => {
          const steps = []
          for (let y = 0; y < MAX_Y; y += 400)
            steps.push(sc(Math.min(400, MAX_Y - y)))
          return {
            ...g,
            params: { ...g.params, scrollbar: 0 },
            mount: top,
            actions: [...steps, sc(30), sc(-30), sc(-12)],
          }
        },
      },
      {
        // A 15px horizontal scrollbar: the page scrolls 15px further than
        // scrollHeight - innerHeight.
        name: 'scroll to the bottom of a page with a horizontal scrollbar',
        enters: ['bottom with a horizontal scrollbar'],
        build: g => {
          const max = MAX_Y + 15
          const steps = []
          for (let y = 0; y < max; y += 400)
            steps.push(sc(Math.min(400, max - y)))
          return {
            ...g,
            params: { ...g.params, scrollbar: 15 },
            mount: top,
            actions: steps,
          }
        },
      },
    ],
  },
  resolve: resolveWithin(OVERSCROLL),
  model: plan => scrollRule(plan),
  driver: drive,
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    const mount = differs(
      'mount',
      'bottom class',
      seen[0].classes.includes('headroom--bottom'),
      false
    )
    if (mount) return mount
    return (
      matchesPath('bottom class', trace, expected, (e, s) => ({
        owed: { bottom: e.bottom },
        observed: { bottom: s.classes.includes('headroom--bottom') },
      })) ?? pass
    )
  },
  reached: (plan, trace, expected) => {
    const found = new Set()
    expected.paths[0].forEach((e, i, all) => {
      if (
        e.bottom &&
        e.y > MAX_Y + plan.params.scrollbar &&
        e.y <= MAX_Y + plan.params.scrollbar + 1
      )
        found.add('fractional bottom')
      if (e.bottom && plan.params.scrollbar > 0)
        found.add('bottom with a horizontal scrollbar')
      if (e.bottom) found.add('reached the bottom')
      if (e.bottom && e.y === MAX_Y - 1) found.add('one pixel above the bottom')
      if (i > 0 && all[i - 1].bottom && !e.bottom) found.add('left the bottom')
    })
    return found
  },
  calibrations: [
    {
      name: 'bottom class missing at the bottom',
      law: 'bottom class',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' && plan.steps[o.value.step - 1].y === MAX_Y
        )
        return i === -1
          ? undefined
          : replaceAt(trace, i, {
              classes: trace[i].value.classes.filter(
                c => c !== 'headroom--bottom'
              ),
            })
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// L12: class names. Every other law above already runs with a random renaming
// (the drivers map rendered classes back to their default names); this law
// checks that nothing outside the mapping is rendered.
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom class names',
  owns: ['src/index.js'],
  law: {
    statement:
      'For every history and every renaming through classNames (keys wrapper, header, unfixed, pinned, unpinned, scrolled, bottom, disableAnimation), every class on the wrapper and the header is the mapped name of a default class or the wrapper name plus --<state>, and no default name of a renamed key appears.',
    authority:
      'Issues #104 and #48 (CSS Modules need their own class names); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11.',
    limits: `The user's className is not varied. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      mountDisable: either,
      toggles: ['pin', 'disable'],
    }),
    runs: 40,
    fixedSeeds: [1],
    states: ['every key renamed'],
    measured: ['some keys renamed'],
    constructed: [
      {
        name: 'rename every key, hide, show, go to the bottom',
        enters: ['every key renamed'],
        build: g => ({
          ...g,
          mount: top,
          params: {
            ...g.params,
            classNames: Object.fromEntries(
              Object.keys(CLASS_KEYS).map(key => [key, true])
            ),
          },
          actions: [...hideShowTop(g.params, true), sc(far(g.params))],
        }),
      },
    ],
  },
  resolve,
  model: () => ({ stray: [] }),
  driver: drive,
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 0; i < seen.length; i++) {
      const found = differs(
        at(i),
        'class names',
        seen[i].stray,
        expected.stray,
        'classes outside the classNames mapping'
      )
      if (found) return found
    }
    return pass
  },
  reached: plan => {
    const renamed = renamedOf(plan.params).length
    return new Set(
      renamed === Object.keys(CLASS_KEYS).length
        ? ['every key renamed']
        : renamed > 0
          ? ['some keys renamed']
          : []
    )
  },
  calibrations: [
    {
      name: 'a default class left in place',
      law: 'class names',
      corrupt: trace =>
        replaceAt(
          trace,
          trace.findIndex(o => o.checkpoint === 'mount'),
          { stray: ['headroom'] }
        ),
    },
  ],
})

// ---------------------------------------------------------------------------
// L14: transition speed.
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom transition speed',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      "For every history of scrolls at 16, 33, 100, 101 or 3000ms per frame, when a frame pins or unpins the header with a transition, the inline transition lasts round(headerHeight × the frame's gap ÷ the distance it moved) clamped to 100-400ms with matchScrollSpeed (a first frame's gap, and any gap over 100ms, counts as 16ms: it starts a new scroll), and 200ms without it.",
    authority:
      'Issue #94 ("So header moves into view at same speed person is scrolling"); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: opt-in through matchScrollSpeed, clamped to 100-400ms; 2026-11-12: a gap over 100ms starts a new scroll and counts as one frame (review finding T2).',
    limits: `Inline styles on; the window is the scroller; mount at the top. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({}),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'matched a fast scroll',
      'matched a slow scroll',
      'fixed 200ms',
      'unpinned at a new speed',
      'flicked after a pause',
    ],
    constructed: [
      {
        // Hidden, a 3s pause, then a 60px flick up in one frame: a fast slide.
        name: 'hidden, pause 3s, flick up',
        enters: ['flicked after a pause'],
        build: g => {
          const p = {
            ...g.params,
            matchScrollSpeed: true,
            disableInlineStyles: false,
            upTolerance: 0,
          }
          return {
            ...g,
            params: p,
            mount: top,
            actions: [sc(far(p)), sc(400), sc(-60, true, 'parent', 3000)],
          }
        },
      },
      {
        name: 'hide, then show fast at 33ms per frame',
        enters: ['matched a fast scroll'],
        build: g => {
          const p = {
            ...g.params,
            matchScrollSpeed: true,
            disableInlineStyles: false,
            upTolerance: 0,
          }
          // A 100px move up in 33ms, far below pinStart: about 3px/ms, so a short transition.
          return {
            ...g,
            params: p,
            mount: top,
            actions: [sc(far(p)), sc(400), sc(-100, true, 'parent', 33)],
          }
        },
      },
      {
        name: 'hide, then show inside the header at 100ms per frame',
        enters: ['matched a slow scroll'],
        build: g => {
          const p = {
            ...g.params,
            matchScrollSpeed: true,
            disableInlineStyles: false,
            pinStart: 0,
            upTolerance: Math.max(1, g.params.upTolerance),
          }
          return {
            ...g,
            params: p,
            mount: top,
            actions: [sc(p.headerHeight + 1), sc(-1, true, 'parent', 100)],
          }
        },
      },
      {
        name: 'show slowly, then hide fast',
        enters: ['unpinned at a new speed'],
        build: g => {
          const p = {
            ...g.params,
            matchScrollSpeed: true,
            disableInlineStyles: false,
            upTolerance: 0,
            downTolerance: 0,
          }
          return {
            ...g,
            params: p,
            mount: top,
            actions: [
              sc(far(p)),
              sc(400),
              sc(-1, true, 'parent', 100),
              sc(300, true, 'parent', 16),
            ],
          }
        },
      },
      {
        name: 'hide and show without matchScrollSpeed',
        enters: ['fixed 200ms'],
        build: g => {
          const p = {
            ...g.params,
            matchScrollSpeed: false,
            disableInlineStyles: false,
          }
          return {
            ...g,
            params: p,
            mount: top,
            actions: [sc(far(p)), sc(-(p.upTolerance + 1))],
          }
        },
      },
    ],
  },
  resolve,
  model: plan => scrollRule(plan),
  driver: drive,
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    if (plan.params.disableInlineStyles) return pass
    return (
      matchesPath('transition speed', trace, expected, (e, s) =>
        e.ms === null
          ? { owed: {}, observed: {} }
          : { owed: { ms: e.ms }, observed: { ms: durationMs(s.transition) } }
      ) ?? pass
    )
  },
  reached: (plan, trace, expected) => {
    const found = new Set()
    if (plan.params.disableInlineStyles) return found
    plan.steps.forEach((step, n) => {
      const e = expected.paths[0][n]
      if (
        step.kind === 'scroll' &&
        step.gap > 100 &&
        e.ms !== null &&
        plan.params.matchScrollSpeed
      )
        found.add('flicked after a pause')
    })
    let lastMs = null
    for (const e of expected.paths[0]) {
      if (
        e.ms !== null &&
        lastMs !== null &&
        e.ms !== lastMs &&
        e.mode === 'unpinned'
      )
        found.add('unpinned at a new speed')
      if (e.ms !== null) lastMs = e.ms
    }
    for (const e of expected.paths[0]) {
      if (e.ms === null) continue
      if (!plan.params.matchScrollSpeed) found.add('fixed 200ms')
      else if (e.ms < 200) found.add('matched a fast scroll')
      else found.add('matched a slow scroll')
    }
    return found
  },
  calibrations: [
    {
      name: 'a transition that kept 200ms',
      law: 'transition speed',
      corrupt: (trace, plan) => {
        if (!plan.params.matchScrollSpeed || plan.params.disableInlineStyles)
          return undefined
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            durationMs(o.value.transition) !== null &&
            durationMs(o.value.transition) !== 200
        )
        return i === -1
          ? undefined
          : replaceAt(trace, i, { transition: 'all 200ms ease-in-out' })
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// L15: the instance methods pin(), unpin() and unfix().
// ---------------------------------------------------------------------------

const CALL_TARGET = { pin: 'pinned', unpin: 'unpinned', unfix: 'unfixed' }

oracleProperty({
  id: 'headroom instance methods',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      "For every history of scrolls and of calls to the instance methods pin(), unpin() and unfix(), a call moves the header into pinned, unpinned or unfixed and fires that state's callback once; a call that names the current state, or comes while pin or disable is true, changes nothing and fires nothing; and frames afterwards follow the scroll rule from the same reference.",
    authority:
      'Issue #116 ("You can set a reference and use this.ref.pin() or this.ref.unpin()"); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: keep and document the instance methods; while pin is true they do nothing. Calls while pin or disable is true are judged by L4 and L5.',
    limits: `The window is the scroller; mount at the top, no prop changes. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({ calls: true }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'called into a new state',
      'called the current state',
      'still frame after a manual unfix below the header',
      'still frame after a manual unpin inside the header',
    ],
    constructed: [
      {
        // A frame that does not move is neither a scroll down nor up.
        name: 'unfix by hand far down, then a still frame',
        enters: ['still frame after a manual unfix below the header'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(400), call('unfix'), sc(0)],
        }),
      },
      {
        name: 'unpin by hand inside the header, then a still frame',
        enters: ['still frame after a manual unpin inside the header'],
        build: g => ({
          ...g,
          params: { ...g.params, pinStart: 0 },
          mount: top,
          actions: [sc(1), call('unpin'), sc(0)],
        }),
      },
      {
        name: 'unpin, pin and unfix by hand, twice each',
        enters: ['called into a new state', 'called the current state'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            sc(far(g.params)),
            { kind: 'call', method: 'pin', settle: true },
            { kind: 'call', method: 'pin', settle: true },
            { kind: 'call', method: 'unpin', settle: true },
            { kind: 'call', method: 'unfix', settle: true },
            { kind: 'call', method: 'unfix', settle: true },
            sc(12),
          ],
        }),
      },
    ],
  },
  resolve,
  model: plan => scrollRule(plan),
  driver: drive,
  check: (plan, trace, expected) =>
    noThrow(trace) ??
    matchesPath('instance methods', trace, expected, (e, s) =>
      e.rule === 'call'
        ? {
            owed: {
              mode: e.mode,
              callbacks: e.mode !== e.from ? [CALLBACK[e.mode]] : [],
            },
            observed: { mode: s.mode, callbacks: s.callbacks },
          }
        : modeAndSnap(e, s)
    ) ??
    pass,
  reached: (plan, trace, expected) => {
    const found = new Set()
    const p = plan.params
    expected.paths[0].forEach((e, i, all) => {
      const before = all[i - 1]
      if (e.rule === 'call')
        found.add(
          e.mode !== e.from
            ? 'called into a new state'
            : 'called the current state'
        )
      if (
        before &&
        before.rule === 'call' &&
        e.moved === 0 &&
        plan.steps[i].kind === 'scroll'
      ) {
        if (before.mode === 'unfixed' && e.y > p.headerHeight + p.pinStart)
          found.add('still frame after a manual unfix below the header')
        if (
          before.mode === 'unpinned' &&
          e.y > p.pinStart &&
          e.y <= p.headerHeight
        )
          found.add('still frame after a manual unpin inside the header')
      }
    })
    return found
  },
  calibrations: [
    {
      name: 'a repeated call that fired again',
      law: 'instance methods',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            plan.steps[o.value.step - 1].kind === 'call' &&
            o.value.callbacks.length === 0
        )
        if (i === -1) return undefined
        const target = CALL_TARGET[plan.steps[trace[i].value.step - 1].method]
        return replaceAt(trace, i, { callbacks: [CALLBACK[target]] })
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// L17: documented defaults. The bare drivers pass no optional prop at all; the
// histories hold every prop at its documented default, so the laws above,
// computed with those values, must hold. Also run through useHeadroom.
// ---------------------------------------------------------------------------

const defaultParams = fc.record({
  headerHeight: fc.integer({ min: 20, max: 120 }),
  pinStart: fc.constant(DOC_DEFAULTS.pinStart),
  upTolerance: fc.constant(DOC_DEFAULTS.upTolerance),
  downTolerance: fc.constant(DOC_DEFAULTS.downTolerance),
  disableInlineStyles: fc.constant(DOC_DEFAULTS.disableInlineStyles),
  unpinnedOffset: fc.constant(DOC_DEFAULTS.unpinnedOffset),
  classNames: fc.record(
    Object.fromEntries(
      Object.keys(CLASS_KEYS).map(key => [key, fc.constant(false)])
    )
  ),
  matchScrollSpeed: fc.constant(DOC_DEFAULTS.matchScrollSpeed),
  calcHeightOnResize: fc.constant(DOC_DEFAULTS.calcHeightOnResize),
  resizeObserver: fc.constant(true),
  strictMode: fc.constant(false),
  scrollbar: fc.constant(0),
  resizeEntries: fc.constant('array'),
  wrapperHeight: fc.constant(DOC_DEFAULTS.wrapperHeight),
})

const defaultsLaw = {
  law: {
    statement:
      "For every history of scrolls and header resizes with no optional prop given, the header behaves as the laws above say for the documented defaults: upTolerance 5, downTolerance 0, pinStart 0, the window as parent, inline styles on, unpinned translate -100%, a 200ms transition, calcHeightOnResize on, and a div wrapper that keeps the header's height.",
    authority:
      'README, Props (the documented defaults); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: an omitted prop behaves as its documented default.',
    limits: `pin and disable are left out too, so they are false. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({ resizes: true, params: defaultParams }),
    runs: 30,
    fixedSeeds: [1],
    states: ['shown with defaults', 'default upTolerance held'],
    constructed: [
      {
        name: 'hide, then scroll up 6px',
        enters: ['shown with defaults'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(far(g.params)), sc(-6)],
        }),
      },
      {
        name: 'hide, then scroll up exactly 5px',
        enters: ['default upTolerance held'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(far(g.params)), sc(-5)],
        }),
      },
    ],
  },
  resolve,
  model: plan => ({ ...scrollRule(plan), wrapperHeight: wrapperHeights(plan) }),
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const rule = matchesPath('defaults', trace, expected, modeAndSnap)
    if (rule) return rule
    const seen = checkpoints(trace)
    if (seen[0].wrapperTag === '') return pass // the hook renders nothing of its own
    for (let i = 0; i < seen.length; i++) {
      const s = seen[i]
      const css = look(s.mode, plan.params)
      const scrolled = s.classes.includes('headroom--scrolled')
      const found = differs(
        at(i),
        'defaults',
        {
          position: s.position,
          transform: s.transform,
          transitionMs: durationMs(s.transition),
          wrapperHeight: s.wrapperHeight,
          wrapperTag: s.wrapperTag,
        },
        {
          position: css.position,
          transform: css.transforms.includes(s.transform)
            ? s.transform
            : css.transforms[0],
          transitionMs: scrolled ? 200 : null,
          wrapperHeight: expected.wrapperHeight[i],
          wrapperTag: 'div',
        },
        'with every optional prop left out'
      )
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace, expected) => {
    const found = new Set()
    for (const e of expected.paths[0]) {
      if (e.rule === 'show fast') found.add('shown with defaults')
      if (e.from === 'unpinned' && e.mode === 'unpinned' && e.moved === -5)
        found.add('default upTolerance held')
    }
    return found
  },
  calibrations: [
    {
      name: 'a default tolerance of 0',
      law: 'defaults',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            plan.steps[o.value.step - 1].kind === 'scroll' &&
            plan.steps[o.value.step - 1].y < plan.steps[o.value.step - 2]?.y &&
            o.value.mode === 'unpinned'
        )
        return i === -1 ? undefined : replaceAt(trace, i, { mode: 'pinned' })
      },
    },
  ],
}
oracleProperty({
  ...defaultsLaw,
  model: defaultsLaw.model,
  check: defaultsLaw.check,
  id: 'headroom defaults',
  owns: ['src/index.js', 'src/core.js'],
  driver: driveBare,
})
oracleProperty({
  ...defaultsLaw,
  model: defaultsLaw.model,
  check: defaultsLaw.check,
  id: 'useHeadroom defaults',
  owns: ['src/useHeadroom.js', 'src/core.js'],
  driver: driveHookBare,
})

// ---------------------------------------------------------------------------
// L18: no idle renders.
// ---------------------------------------------------------------------------

const shownOf = s => ({
  mode: s.mode,
  classes: s.classes,
  wrapperClasses: s.wrapperClasses,
  position: s.position,
  box: s.box,
  transform: s.transform,
  transition: s.transition,
  wrapperHeight: s.wrapperHeight,
})

oracleProperty({
  id: 'headroom no idle renders',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      'For every history of scrolls, header resizes, focus and instance-method calls, a step that changes nothing the header shows and fires no callback does not re-render the component.',
    authority:
      'Commit 6306f49 ("Use shallowequal instead of react-addons-pure-render-mixin", the pure-render intent); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11.',
    limits: `Renders are counted in the component's render(), through a subclass that only counts. Prop changes are not judged: they re-render by design. useHeadroom is not judged. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      scrollOn: ['parent', 'other'],
      resizes: true,
      focus: true,
      calls: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: ['idle frame', 'idle step on another scroller'],
    constructed: [
      {
        name: 'small scrolls inside the header, and the other scroller',
        enters: ['idle frame', 'idle step on another scroller'],
        build: g => ({
          ...g,
          params: { ...g.params, pinStart: 0 },
          mount: top,
          actions: [sc(5), sc(5), sc(-3), sc(50, true, 'other')],
        }),
      },
    ],
  },
  resolve,
  model: () => ({ renders: 0 }),
  driver: drive,
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 1; i < seen.length; i++) {
      const idle =
        seen[i].callbacks.length === 0 &&
        JSON.stringify(shownOf(seen[i])) ===
          JSON.stringify(shownOf(seen[i - 1]))
      if (!idle) continue
      const found = differs(
        at(i),
        'no idle renders',
        seen[i].renders,
        expected.renders,
        'renders in a step that changed nothing'
      )
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace) => {
    const seen = checkpoints(trace)
    const found = new Set()
    plan.steps.forEach((step, i) => {
      const s = seen[i + 1]
      if (!s || JSON.stringify(shownOf(s)) !== JSON.stringify(shownOf(seen[i])))
        return
      if (step.kind === 'scroll' && step.scroller === step.props.parent)
        found.add('idle frame')
      if (step.kind === 'scroll' && step.scroller !== step.props.parent)
        found.add('idle step on another scroller')
    })
    return found
  },
  calibrations: [
    {
      name: 'a render on every frame',
      law: 'no idle renders',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'step'
            ? { ...o, value: { ...o.value, renders: 1 } }
            : o
        ),
    },
  ],
})

// ---------------------------------------------------------------------------
// L19: calcHeightOnResize.
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom calcHeightOnResize',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      "For every history of header resizes and toggles of calcHeightOnResize, at every checkpoint, the wrapper height is the header's height measured at mount, followed through every change while calcHeightOnResize is true, measured again when it turns true, and left as it was while it is false (wrapperStyle.height wins when given).",
    authority:
      'Issue #138 (calcHeightOnResize, added in v2.2.0, undocumented); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: calcHeightOnResize={false} keeps the height measured at mount.',
    limits: `Without a ResizeObserver a new height is owed only after a window resize. ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      calcHeightOnResize: fc.boolean(),
      toggles: ['calcHeightOnResize', 'pin'],
      resizes: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: ['resized while not tracking', 'tracking turned back on'],
    constructed: [
      {
        name: 'not tracking, resize, track again, resize',
        enters: ['resized while not tracking', 'tracking turned back on'],
        build: g => ({
          ...g,
          params: {
            ...g.params,
            calcHeightOnResize: false,
            wrapperHeight: null,
          },
          mount: top,
          actions: [
            rs(g.params.headerHeight > 60 ? 40 : 90, 1, true),
            tg('pin'),
            tg('calcHeightOnResize'),
            rs(70, 3, true),
          ],
        }),
      },
    ],
  },
  resolve,
  model: plan => ({ wrapperHeight: wrapperHeights(plan) }),
  driver: drive,
  check: (plan, trace, expected) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 0; i < seen.length; i++) {
      const found = differs(
        at(i),
        'calcHeightOnResize',
        seen[i].wrapperHeight,
        expected.wrapperHeight[i]
      )
      if (found) return found
    }
    return pass
  },
  reached: plan => {
    const found = new Set()
    for (const step of plan.steps) {
      if (step.kind === 'resize' && !step.props.calcHeightOnResize)
        found.add('resized while not tracking')
      if (step.kind === 'toggle' && step.props.calcHeightOnResize)
        found.add('tracking turned back on')
    }
    return found
  },
  calibrations: [
    {
      name: 'a wrapper that followed a resize while not tracking',
      law: 'calcHeightOnResize',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            plan.steps[o.value.step - 1].kind === 'resize' &&
            !plan.steps[o.value.step - 1].props.calcHeightOnResize &&
            plan.params.wrapperHeight === null &&
            plan.steps[o.value.step - 1].settle
        )
        if (i === -1) return undefined
        return replaceAt(trace, i, {
          wrapperHeight: `${plan.steps[trace[i].value.step - 1].headerHeight}px`,
        })
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// L20: headroom-disable-animation.
// ---------------------------------------------------------------------------

oracleProperty({
  id: 'headroom disable-animation class',
  owns: ['src/index.js', 'src/core.js'],
  law: {
    statement:
      "For every history, once the header's state has changed it has exactly one of headroom--scrolled and headroom-disable-animation: headroom--scrolled when the last change was a pin, a hide from pinned, or a call to unpin(), and headroom-disable-animation when it was a hide from unfixed by scrolling, an unfix, or disable; before its first change it has neither.",
    authority:
      'Commit e58b75e ("Avoid flash of animation when scrolling from top", which added the class); decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-11: keep and document headroom-disable-animation.',
    limits: LIMITS,
  },
  histories: {
    arbitrary: historiesOf({
      mountY: anywhere,
      mountPin: either,
      mountDisable: either,
      toggles: ['pin', 'disable'],
      calls: true,
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'changed without a transition',
      'changed with a transition',
      'unpinned by hand from unfixed',
    ],
    constructed: [
      {
        name: 'hide, unfix by hand, unpin by hand',
        enters: ['unpinned by hand from unfixed'],
        build: g => ({
          ...g,
          mount: top,
          actions: [sc(far(g.params)), call('unfix'), call('unpin')],
        }),
      },
      {
        name: 'hide, show, return to the top',
        enters: ['changed without a transition', 'changed with a transition'],
        build: g => ({
          ...g,
          mount: top,
          actions: hideShowTop(g.params, true),
        }),
      },
    ],
  },
  resolve,
  model: () => ({}),
  driver: drive,
  check: (plan, trace) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    // The flag the last change owes: a pin, a call to unpin(), or a hide from
    // pinned has a transition; a hide from unfixed by scrolling, an unfix, or
    // disable has none. Before the first change, neither.
    let owed =
      seen[0].mode === 'pinned'
        ? 'headroom--scrolled'
        : seen[0].mode === 'unpinned'
          ? 'headroom-disable-animation'
          : null
    for (let i = 0; i < seen.length; i++) {
      if (i > 0 && seen[i].mode !== seen[i - 1].mode) {
        const step = plan.steps[i - 1]
        const from = seen[i - 1].mode
        const to = seen[i].mode
        const animated =
          to === 'pinned' ||
          (to === 'unpinned' && (from === 'pinned' || step.kind === 'call'))
        owed = animated ? 'headroom--scrolled' : 'headroom-disable-animation'
      }
      const flags = ['headroom--scrolled', 'headroom-disable-animation'].filter(
        c => seen[i].classes.includes(c)
      )
      const found = differs(
        at(i),
        'disable-animation class',
        flags,
        owed === null ? [] : [owed],
        `the header is ${seen[i].mode}`
      )
      if (found) return found
    }
    return pass
  },
  reached: (plan, trace) => {
    const found = new Set()
    plan.steps.forEach((step, n) => {
      if (step.kind === 'call' && step.method === 'unpin') {
        const seen = checkpoints(trace)
        if (
          seen[n] &&
          seen[n].mode === 'unfixed' &&
          seen[n + 1] &&
          seen[n + 1].mode === 'unpinned'
        )
          found.add('unpinned by hand from unfixed')
      }
    })
    for (const s of checkpoints(trace)) {
      if (s.classes.includes('headroom-disable-animation'))
        found.add('changed without a transition')
      if (s.classes.includes('headroom--scrolled'))
        found.add('changed with a transition')
    }
    return found
  },
  calibrations: [
    {
      name: 'both classes at once',
      law: 'disable-animation class',
      corrupt: trace => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            o.value.classes.includes('headroom--scrolled')
        )
        return i === -1
          ? undefined
          : replaceAt(trace, i, {
              classes: [
                ...trace[i].value.classes,
                'headroom-disable-animation',
              ],
            })
      },
    },
  ],
})

// ---------------------------------------------------------------------------
// W: work. Counted from the drivers: frames queued before each step's frame
// runs, listeners added in the step, the component's setState calls (its
// onChange), and frames still queued right after unmount.
// ---------------------------------------------------------------------------

const workLaw = {
  law: {
    statement:
      "For every history, the frames queued before a frame runs hold at most one scroll frame (exactly one after the current parent scrolls, however many scroll events it fired, none while disabled) and at most one parent lookup while the parent is empty (none while disabled); a re-render with the same props adds no listener and queues nothing new; a step that changes nothing the header shows calls the component's setState zero times; and right after unmount, even before the first frame, nothing is queued.",
    authority:
      'Decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: a work law with one pending handle per kind, cancelled on detach and unmount (review findings R3, R8, R9, T5, T10); 3.2.1 coalesced scroll events into one frame (scrollTicking).',
    limits: `Frames are counted in the driver's frame queue; setState calls are counted for the component only (the hook's state setter bails out by itself). ${LIMITS}`,
  },
  histories: {
    arbitrary: historiesOf({
      mountPin: either,
      mountParent: fc.constantFrom('window', 'div', 'late'),
      scrollOn: ['parent', 'other'],
      toggles: ['pin', 'disable', 'parent'],
      resizes: true,
      focus: true,
      rerenders: true,
      pending: fc.constantFrom('none', 'scroll', 'resize', 'immediate'),
    }),
    runs: 40,
    fixedSeeds: [1],
    states: [
      'two scroll events in one frame',
      're-rendered with pin',
      'parent empty across re-renders',
      'idle frame',
      'unmounted with work pending',
      'unmounted before the first frame',
      'disabled with the parent empty',
    ],
    constructed: [
      {
        // A ref parent, unmounted before its first frame: its lookup and the
        // end of mounting are both cancelled.
        name: 'a ref parent, unmounted before the first frame',
        enters: ['unmounted before the first frame'],
        build: g => ({
          ...g,
          mount: { ...top, parent: 'late' },
          actions: [],
          pending: 'immediate',
        }),
      },
      {
        name: 'the parent empties, then disable',
        enters: ['disabled with the parent empty'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            tg('parent'),
            tg('parent'),
            tg('disable'),
            { kind: 'rerender', settle: true },
          ],
        }),
      },
      {
        name: 'two scroll events before one frame',
        enters: ['two scroll events in one frame'],
        build: g => ({
          ...g,
          mount: top,
          actions: [{ ...sc(far(g.params)), jitter: 10 }],
        }),
      },
      {
        name: 'pin, then re-render with the same props',
        enters: ['re-rendered with pin'],
        build: g => ({
          ...g,
          mount: { ...top, pin: true },
          actions: [
            sc(far(g.params)),
            { kind: 'rerender', settle: true },
            { kind: 'rerender', settle: true },
          ],
        }),
      },
      {
        name: 'the parent empties, then three re-renders',
        enters: ['parent empty across re-renders'],
        build: g => ({
          ...g,
          mount: top,
          actions: [
            tg('parent'),
            tg('parent'),
            { kind: 'rerender', settle: true },
            { kind: 'rerender', settle: true },
            { kind: 'rerender', settle: true },
          ],
        }),
      },
      {
        name: 'small scrolls inside the header, then unmount with a scroll pending',
        enters: ['idle frame', 'unmounted with work pending'],
        build: g => ({
          ...g,
          params: { ...g.params, pinStart: 0 },
          mount: top,
          actions: [sc(5), sc(0), sc(0)],
          pending: 'scroll',
        }),
      },
    ],
  },
  resolve,
  model: () => ({}),
  check: (plan, trace) => {
    const thrown = noThrow(trace)
    if (thrown) return thrown
    const seen = checkpoints(trace)
    for (let i = 1; i < seen.length; i++) {
      const step = plan.steps[i - 1]
      const s = seen[i]
      const lookingUp = step.props.parent === 'none' && !step.props.disable
      const at = `step ${i}`
      const found =
        (step.kind === 'scroll' &&
        step.props.parent !== 'none' &&
        step.scroller === step.props.parent
          ? differs(
              at,
              'work',
              s.queued,
              step.props.disable ? 0 : 1,
              'frames queued after the parent scrolled'
            )
          : undefined) ??
        (step.kind === 'rerender'
          ? differs(
              at,
              'work',
              { added: s.queued - s.queuedBefore, adds: s.adds },
              { added: 0, adds: 0 },
              'a re-render with the same props'
            )
          : undefined) ??
        (step.props.disable &&
        step.props.parent === 'none' &&
        step.kind !== 'resize' &&
        step.kind !== 'swap'
          ? differs(at, 'work', s.queued, 0, 'lookups queued while disabled')
          : undefined) ??
        (lookingUp &&
        step.kind !== 'resize' &&
        step.kind !== 'swap' &&
        s.queued > 1
          ? violation(
              at,
              `${s.queued} lookups queued for an empty parent`,
              'work'
            )
          : undefined) ??
        (s.callbacks.length === 0 &&
        JSON.stringify(shownOf(s)) === JSON.stringify(shownOf(seen[i - 1]))
          ? differs(
              at,
              'work',
              s.setStates,
              0,
              'setState in a step that changed nothing'
            )
          : undefined)
      if (found) return found
    }
    return (
      differs(
        'unmount',
        'work',
        unmountOf(trace).value.queued,
        0,
        'frames queued after unmount'
      ) ?? pass
    )
  },
  reached: (plan, trace) => {
    const seen = checkpoints(trace)
    const found = new Set()
    if (plan.pending === 'scroll' || plan.pending === 'resize')
      found.add('unmounted with work pending')
    if (plan.pending === 'immediate')
      found.add('unmounted before the first frame')
    if (
      plan.steps.some(
        step => step.props.disable && step.props.parent === 'none'
      )
    )
      found.add('disabled with the parent empty')
    plan.steps.forEach((step, n) => {
      const s = seen[n + 1]
      if (
        step.kind === 'scroll' &&
        step.jitter !== null &&
        step.scroller === step.props.parent &&
        step.props.parent !== 'none'
      )
        found.add('two scroll events in one frame')
      if (
        step.kind === 'rerender' &&
        step.props.pin &&
        step.props.parent !== 'none'
      )
        found.add('re-rendered with pin')
      if (step.kind === 'rerender' && step.props.parent === 'none')
        found.add('parent empty across re-renders')
      if (
        step.kind === 'scroll' &&
        s &&
        s.callbacks.length === 0 &&
        JSON.stringify(shownOf(s)) === JSON.stringify(shownOf(seen[n]))
      )
        found.add('idle frame')
    })
    return found
  },
  calibrations: [
    {
      name: 'one frame per scroll event',
      law: 'work',
      corrupt: (trace, plan) => {
        const i = trace.findIndex(
          o =>
            o.checkpoint === 'step' &&
            plan.steps[o.value.step - 1].kind === 'scroll' &&
            plan.steps[o.value.step - 1].scroller ===
              plan.steps[o.value.step - 1].props.parent &&
            plan.steps[o.value.step - 1].props.parent !== 'none' &&
            !plan.steps[o.value.step - 1].props.disable &&
            o.value.queued === 1
        )
        return i === -1 ? undefined : replaceAt(trace, i, { queued: 2 })
      },
    },
    {
      name: 'a frame left queued after unmount',
      law: 'work',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'unmount'
            ? { ...o, value: { ...o.value, queued: 1 } }
            : o
        ),
    },
  ],
}
oracleProperty({
  ...workLaw,
  model: workLaw.model,
  check: workLaw.check,
  id: 'headroom work',
  owns: ['src/index.js', 'src/core.js'],
  driver: drive,
})
oracleProperty({
  ...workLaw,
  model: workLaw.model,
  check: workLaw.check,
  id: 'useHeadroom work',
  owns: ['src/useHeadroom.js', 'src/core.js'],
  driver: driveHook,
})
