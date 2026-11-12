// @vitest-environment node
/*
 * This oracle owns what <Headroom> and useHeadroom show on their first
 * render, before any effect runs: what a server render sends, and what a
 * browser paints before the header mounts. It owns src/index.js,
 * src/Headroom.js, src/useHeadroom.js and the initial snapshot in
 * src/core.js.
 *
 *   renderToString(<Headroom pin {...props}>…</Headroom>) // → headroom--unfixed, in place, no window touched
 *   renderToString(<Header />), Header calling useHeadroom() // → state 'unfixed', animated and transitionMs undefined
 *
 * Why would a header that is pinned by its props render unfixed? Because
 * nothing is measured or scrolled yet: the state changes only on the
 * header's first frame, in the browser. A Next.js App Router page renders
 * the client component on the server, where there is no window at all.
 *
 * The first render (L21): for every set of props, rendering on the server
 * does not throw or log, and shows the header unfixed: the wrapper has
 * headroom-wrapper and headroom-wrapper--unfixed (renamed by classNames) and
 * the user's className, is the tag's element, and has wrapperStyle (a height
 * only when given); the header has headroom and headroom--unfixed and no
 * transition or bottom class, the unfixed inline styles (relative, top, left
 * and right 0, z-index 1, no translate, no transition) with the user's style
 * merged over them, or only that style with disableInlineStyles, and every
 * other prop. useHeadroom's first render returns state 'unfixed' with
 * animated and transitionMs undefined.
 *
 * The model is the docs' CSS for the unfixed state and the class names.
 * The histories vary every prop. The driver renders with react-dom/server in
 * Node, where touching window throws, and parses the HTML with jsdom only as
 * a parser.
 *
 * Limits: one render, no hydration; the browser's first paint before effects
 * is the same markup.
 */
import fc from 'fast-check'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { differs, oracleProperty, pass } from '@tanstack/oracles'
import Headroom, { useHeadroom } from '../src/index.js'

const CLASSES = {
  wrapper: 'headroom-wrapper',
  header: 'headroom',
  unfixed: 'headroom--unfixed',
  pinned: 'headroom--pinned',
  unpinned: 'headroom--unpinned',
  scrolled: 'headroom--scrolled',
  bottom: 'headroom--bottom',
  disableAnimation: 'headroom-disable-animation',
}
const USER_STYLE = { zIndex: { zIndex: 5 }, color: { color: 'red' } }

// Every prop: the behavior options (which do not change the first render),
// the styling props, and the pass-through ones.
const props = fc.record({
  pin: fc.boolean(),
  disable: fc.boolean(),
  pinStart: fc.integer({ min: 0, max: 150 }),
  upTolerance: fc.integer({ min: 0, max: 10 }),
  downTolerance: fc.integer({ min: 0, max: 10 }),
  matchScrollSpeed: fc.boolean(),
  calcHeightOnResize: fc.boolean(),
  disableInlineStyles: fc.boolean(),
  unpinnedOffset: fc.option(fc.constantFrom(48, '2rem', 'calc(100% + 8px)'), {
    nil: null,
  }),
  renamed: fc.record(
    Object.fromEntries(Object.keys(CLASSES).map(key => [key, fc.boolean()]))
  ),
  wrapperHeight: fc.option(fc.constantFrom('0px', '100px'), { nil: null }),
  wrapperExtra: fc.boolean(),
  className: fc.option(fc.constant('site-header'), { nil: null }),
  style: fc.option(fc.constantFrom('zIndex', 'color'), { nil: null }),
  id: fc.boolean(),
  tag: fc.option(fc.constant('nav'), { nil: null }),
})

const nameOf = (p, key) => (p.renamed[key] ? `x-${CLASSES[key]}` : CLASSES[key])
function headroomProps(p) {
  const out = {
    pin: p.pin,
    disable: p.disable,
    pinStart: p.pinStart,
    upTolerance: p.upTolerance,
    downTolerance: p.downTolerance,
    matchScrollSpeed: p.matchScrollSpeed,
    calcHeightOnResize: p.calcHeightOnResize,
    disableInlineStyles: p.disableInlineStyles,
  }
  if (p.unpinnedOffset !== null) out.unpinnedOffset = p.unpinnedOffset
  const renamed = Object.keys(CLASSES).filter(key => p.renamed[key])
  if (renamed.length > 0)
    out.classNames = Object.fromEntries(
      renamed.map(key => [key, nameOf(p, key)])
    )
  if (p.wrapperHeight !== null || p.wrapperExtra)
    out.wrapperStyle = {
      ...(p.wrapperHeight !== null && { height: p.wrapperHeight }),
      ...(p.wrapperExtra && { background: 'red' }),
    }
  if (p.className !== null) out.className = p.className
  if (p.style !== null) out.style = USER_STYLE[p.style]
  if (p.id) out.id = 'site'
  if (p.tag !== null) out.tag = p.tag
  return out
}

function HookHeader(options) {
  const { state, animated, transitionMs, ref } = useHeadroom(options)
  return React.createElement('header', {
    ref,
    'data-state': state,
    'data-animated': String(animated),
    'data-transition-ms': String(transitionMs),
  })
}

const read = element => ({
  tag: element.tagName.toLowerCase(),
  classes: [...element.classList].sort(),
  style: {
    position: element.style.position,
    top: element.style.top,
    left: element.style.left,
    right: element.style.right,
    zIndex: element.style.zIndex,
    transform: element.style.transform,
    transition: element.style.transition,
    color: element.style.color,
    height: element.style.height,
    background: element.style.background,
  },
  id: element.id,
})

oracleProperty({
  id: 'headroom first render',
  owns: [
    'src/index.js',
    'src/Headroom.js',
    'src/useHeadroom.js',
    'src/core.js#initialSnapshot',
  ],
  law: {
    statement:
      "For every set of props, the first render of <Headroom> and of a component that calls useHeadroom, on a server with no window, does not throw or log, and shows the header unfixed: the wrapper is the tag's element with headroom-wrapper, headroom-wrapper--unfixed (as renamed) and className, and wrapperStyle; the header has headroom and headroom--unfixed and no other state, transition or bottom class, the unfixed inline styles with style merged over them (only style with disableInlineStyles), and every other prop; useHeadroom returns state 'unfixed' with animated and transitionMs undefined.",
    authority:
      'README ("react-headroom is a client component (its files start with \'use client\'), so you can render it from a server component"; the states table: unfixed is "in its place in the page"); issue #211; decision by Kyle Mathews (GitHub KyleAMathews), 2026-11-12: cover what the oracles should (the first render, review round 3 item N3).',
    limits:
      'One render with react-dom/server; no hydration, which renders the same markup first.',
  },
  histories: {
    arbitrary: fc.record({ props }),
    runs: 100,
    fixedSeeds: [1],
    states: ['pinned by its props', 'no inline styles', 'every class renamed'],
    constructed: [
      {
        name: 'pin, with every pass-through prop',
        enters: ['pinned by its props'],
        build: g => ({
          props: {
            ...g.props,
            pin: true,
            className: 'site-header',
            style: 'zIndex',
            id: true,
            tag: 'nav',
            wrapperExtra: true,
          },
        }),
      },
      {
        name: 'no inline styles, with a style',
        enters: ['no inline styles'],
        build: g => ({
          props: { ...g.props, disableInlineStyles: true, style: 'color' },
        }),
      },
      {
        name: 'every class renamed',
        enters: ['every class renamed'],
        build: g => ({
          props: {
            ...g.props,
            renamed: Object.fromEntries(
              Object.keys(CLASSES).map(key => [key, true])
            ),
          },
        }),
      },
    ],
  },
  // The docs' CSS for the unfixed state, with the user's style over it.
  model: ({ props: p }) => {
    const user = p.style === null ? {} : USER_STYLE[p.style]
    const inline = !p.disableInlineStyles
    return {
      wrapper: {
        tag: p.tag ?? 'div',
        classes: [
          ...(p.className === null ? [] : [p.className]),
          nameOf(p, 'wrapper'),
          `${nameOf(p, 'wrapper')}--unfixed`,
        ].sort(),
        style: {
          position: '',
          top: '',
          left: '',
          right: '',
          zIndex: '',
          transform: '',
          transition: '',
          color: '',
          height: p.wrapperHeight ?? '',
          background: p.wrapperExtra ? 'red' : '',
        },
        id: '',
      },
      header: {
        tag: 'div',
        classes: [nameOf(p, 'header'), nameOf(p, 'unfixed')].sort(),
        style: {
          position: inline ? 'relative' : '',
          top: inline ? '0px' : '',
          left: inline ? '0px' : '',
          right: inline ? '0px' : '',
          zIndex:
            user.zIndex !== undefined ? String(user.zIndex) : inline ? '1' : '',
          transform: inline ? 'translate3D(0, 0, 0)' : '',
          transition: '',
          color: user.color ?? '',
          height: '',
          background: '',
        },
        id: p.id ? 'site' : '',
      },
      hook: {
        state: 'unfixed',
        animated: 'undefined',
        transitionMs: 'undefined',
      },
    }
  },
  driver: (plan, observe) => {
    const logged = []
    const realError = console.error
    const realWarn = console.warn
    console.error = (...args) => logged.push(args.map(String).join(' '))
    console.warn = console.error
    try {
      const html = renderToString(
        React.createElement(
          Headroom,
          headroomProps(plan.props),
          React.createElement('h1', null, 'Header')
        )
      )
      const wrapper = JSDOM.fragment(html).firstElementChild
      observe('component', {
        wrapper: read(wrapper),
        header: read(wrapper.firstElementChild),
      })
      // The hook takes the same options; it ignores the styling props.
      const hook = JSDOM.fragment(
        renderToString(
          React.createElement(HookHeader, headroomProps(plan.props))
        )
      ).firstElementChild
      observe('hook', {
        state: hook.getAttribute('data-state'),
        animated: hook.getAttribute('data-animated'),
        transitionMs: hook.getAttribute('data-transition-ms'),
      })
    } catch (error) {
      observe('error', { message: String(error && error.message) })
    } finally {
      console.error = realError
      console.warn = realWarn
      if (logged.length > 0) observe('console', logged)
    }
  },
  check: (plan, trace, expected) => {
    const failed = trace.find(
      o => o.checkpoint === 'error' || o.checkpoint === 'console'
    )
    if (failed)
      return differs(
        failed.checkpoint,
        'first render',
        failed.value,
        null,
        'thrown or logged'
      )
    const component = trace.find(o => o.checkpoint === 'component').value
    const hook = trace.find(o => o.checkpoint === 'hook').value
    return (
      differs(
        'component',
        'first render',
        component.wrapper,
        expected.wrapper,
        'the wrapper'
      ) ??
      differs(
        'component',
        'first render',
        component.header,
        expected.header,
        'the header'
      ) ??
      differs(
        'hook',
        'first render',
        {
          state: hook.state,
          animated: hook.animated,
          transitionMs: hook.transitionMs,
        },
        expected.hook,
        'useHeadroom'
      ) ??
      pass
    )
  },
  reached: plan => {
    const found = new Set()
    if (plan.props.pin) found.add('pinned by its props')
    if (plan.props.disableInlineStyles) found.add('no inline styles')
    if (Object.values(plan.props.renamed).every(Boolean))
      found.add('every class renamed')
    return found
  },
  calibrations: [
    {
      name: 'a header that renders pinned',
      law: 'first render',
      corrupt: trace =>
        trace.map(o =>
          o.checkpoint === 'component'
            ? {
                ...o,
                value: {
                  ...o.value,
                  header: {
                    ...o.value.header,
                    classes: [...o.value.header.classes, 'headroom--pinned'],
                  },
                },
              }
            : o
        ),
    },
  ],
})
