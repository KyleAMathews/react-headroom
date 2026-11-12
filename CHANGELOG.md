# Changelog

## 3.3.0 (unreleased)

### Fixed

- The header could stay hidden for good after scrolling to the top and
  flicking down before a 0 ms timeout ran; `onUnfix` could fire twice for one
  return to the top. The state and the inline styles now change together, in
  the same frame. The one-tick delay added for Safari in 3.1.1 (#185, #194) is
  gone: Safari 27 shows no glitch with or without it.
- `pin` now pins on mount, without waiting for the first scroll.
- Changing `parent` while mounted moves the listeners to the new element, and
  unmounting leaves no listener behind. A `parent()` that returns nothing during
  mount (a ref) no longer throws; the first frame looks again (#110).
- A frame, resize or timeout still pending at unmount no longer fires callbacks
  (#138, #208).
- A bounce past the bottom (macOS and iOS overscroll) no longer shows the header
  (#195, #90).
- Keyboard focus moving into a hidden header now shows it (#176).
- The wrapper follows the header's exact height, fractions included, through
  any size change, whatever the parent, with a `ResizeObserver` (#166, #133,
  #174, #92).
- A header that mounts while the page is already scrolled (Back navigation)
  starts hidden, so the first scroll up shows it; re-attaching to a new
  `parent`, or enabling after `disable`, measures from the new position
  instead of the old scroller's.
- Scrolling up slowly shows a hidden header inside its own region, `pinStart`
  included.
- A frame less than 1px past either end (browser zoom) is no longer treated
  as overscroll, and a horizontal scrollbar no longer hides the bottom of the
  page from the header.
- `parent={() => document}` (and `documentElement`, `body`) works again, as in
  3.2.1, and a `body` that scrolls itself (full height, the root's overflow
  hidden and the body's auto) is followed as an element, as in 3.2.1: the
  body when it has more to scroll than the page, otherwise the page, whatever
  their styles say: a full-height body and a body that clips horizontal
  overflow keep following the page. An iframe's window
  works again, and so does its document, in standards or quirks mode.
- The header's height follows a change of its padding or border alone, such as
  a header that shrinks on scroll (the `ResizeObserver` watches its border
  box).
- Changing `tag` no longer leaves height tracking and focus on the old header
  element.
- A shown or hidden header whose `parent` changes to a scroller at or above
  `pinStart` goes back in place at once, not on that scroller's first scroll.
- `pin()`, `unpin()` and `unfix()` on an unmounted component do nothing; they
  threw.
- `unpinnedOffset` accepts any CSS length, including `calc()`, `var()` and `0`.
- With `matchScrollSpeed`, a flick after a pause slides fast, not at the
  slowest speed.
- A `parent()` that returns nothing is looked up once per frame (not once per
  render, forever), and scroll events coalesce into one frame, as in 3.2.1.
- The published package no longer ships `.babelrc` and other config (#129).
- Works in the Next.js App Router: the build starts with `'use client'` (#211).

### Added

- React 19 support (#213).
- `useHeadroom()`, a hook for headers you render yourself (#183). It returns
  `state`, `animated` (whether the last change slides), `transitionMs` (how
  long it slides) and `ref`, and re-renders only when one of them changes.
- `unpinnedOffset`, how far the header slides up when hidden (#115, #163, #116).
- `classNames`, to replace any class name, for CSS Modules (#104, #48).
- `headroom-wrapper--<state>` classes on the wrapper, for sibling selectors
  (#108, #152).
- A `headroom--bottom` class while the scroller is at its bottom (#107).
- `matchScrollSpeed`, to time the slide to the scroll speed (#94).
- `wrapperStyle.height` now replaces the measured height (#179, #166).
- Documented the instance methods `pin()`, `unpin()` and `unfix()`, the
  `calcHeightOnResize` prop, the `headroom-disable-animation` class, and that
  `upTolerance` and `downTolerance` are speeds in px per frame (#172, #113).

### Changed

- With `pin`, the header is `unfixed` (in place) at or above `pinStart`, so a
  pinned header no longer covers the element above it.
- Scrolling up never moves an `unfixed` header.
- A call to `pin()`, `unpin()` or `unfix()` that names the current state, or
  comes while `pin` or `disable` is set, does nothing.
- A step that changes nothing the header shows no longer re-renders it.
- React 16.9 or later is required (the peer range was `^16.3.0`): the tests
  run on React 16.9, 17, 18 and 19, and 16.3 to 16.8 are no longer tested.
- The build targets modern browsers (browserslist `defaults`), not ES5, in
  syntax that webpack 4 still parses (ES2019). React 18 and 19 do not support
  IE 11; with React 16 or 17, an app that still needs it must transpile
  `react-headroom` itself. An ES module build (`dist/esm`, the `module` field)
  ships beside the CommonJS one, marked `"sideEffects": false`, so an app that
  uses only the hook drops the component. Bundled for an app (minified and
  gzipped), the package is about 2.5 kB, down from about 4 kB in 3.2.1.
- The header's height is tracked through a `ResizeObserver` (or window resize
  where there is none) while `calcHeightOnResize` is on, instead of being
  remeasured whenever `children` change. With `calcHeightOnResize={false}` the
  height measured at mount is kept, even if the children grow.

### Removed

- `propTypes` and the `prop-types` dependency (React 19 ignores them); the
  props are documented in the README.
- `Headroom.defaultProps`: the defaults (`tag`, `unpinnedOffset`) apply in
  render, as the README documents them.
- The `raf` dependency: react-headroom calls `requestAnimationFrame` itself,
  and has no dependencies left.
- The `shallowequal` dependency: `<Headroom>` is a `PureComponent` that renders
  only when something it shows changes.
- Vendor-prefixed inline styles and the passive-listener feature check.

### Internal

- Oracle tests (with [@tanstack/oracles](https://github.com/TanStack/oracles)):
  `test/headroom.oracle.js`, 34 properties over `<Headroom>` and
  `useHeadroom`; `test/headroom-server.oracle.js`, their first render on a
  server; and `test/headroom-package.oracle.js`, 7 properties over the packed
  tarball (ES2019 syntax, entry points, `'use client'`, no dependencies,
  tree-shaking, contents, size). They run under React 16.9, 17, 18 and 19, and
  the behavior oracle also runs its histories in Chrome through Playwright, with a
  mutation gap check in CI (all 315 mutants killed).
- Babel 7, ESLint 9, Vitest, pnpm and GitHub Actions replace the old toolchain.
- Credited headroom.js in LICENSE and the README (#144).
