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
- The published package no longer ships `.babelrc` and other config (#129).
- Works in the Next.js App Router: the build starts with `'use client'` (#211).

### Added

- React 19 support (#213).
- `useHeadroom()`, a hook for headers you render yourself (#183).
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

### Removed

- `propTypes` and the `prop-types` dependency (React 19 ignores them); the
  props are documented in the README.
- Vendor-prefixed inline styles and the passive-listener feature check.

### Internal

- Oracle tests (`test/headroom.oracle.js`, with
  [@tanstack/oracles](https://github.com/TanStack/oracles)): 25 properties over
  `<Headroom>` and `useHeadroom`, run under React 18 and 19, with a mutation
  gap check in CI.
- Babel 7, ESLint 9, Vitest, pnpm and GitHub Actions replace the old toolchain.
- Credited headroom.js in LICENSE and the README (#144).
