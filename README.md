# react-headroom

Hide your header until you need it. When the user scrolls down, the header
slides out of view; when they scroll up, it slides back in.

[Demo](http://kyleamathews.github.io/react-headroom) · [Changelog](CHANGELOG.md)

## Install

```sh
npm install react-headroom
```

Works with React 16.3 and later, including React 18 and 19. `useHeadroom`
needs React 16.8 or later.

## Usage

```jsx
import Headroom from 'react-headroom'

;<Headroom>
  <h1>You can put anything you'd like inside the Headroom Component</h1>
</Headroom>
```

Or keep your own markup and use the hook:

```jsx
import { useHeadroom } from 'react-headroom'

function Header() {
  const { state, ref } = useHeadroom({ pinStart: 100 })
  // state is 'unfixed', 'pinned' or 'unpinned'
  return (
    <header ref={ref} className={`site-header site-header--${state}`}>
      …
    </header>
  )
}
```

The hook takes the same behavior options as the component (`parent`, `pin`,
`disable`, `upTolerance`, `downTolerance`, `pinStart`, `calcHeightOnResize`,
`matchScrollSpeed`, `onPin`, `onUnpin`, `onUnfix`) and leaves positioning and
styling to you. Attach `ref` to the header element: the hook measures it, and
shows it when keyboard focus moves into it.

In a Next.js App Router project, react-headroom is a client component (its
files start with `'use client'`), so you can render it from a server component.

## How it behaves

The header is in one of three states:

| State      | Class                | Inline styles                                   |
| ---------- | -------------------- | ----------------------------------------------- |
| `unfixed`  | `headroom--unfixed`  | `position: relative`, in its place in the page  |
| `pinned`   | `headroom--pinned`   | `position: fixed`, shown at the top             |
| `unpinned` | `headroom--unpinned` | `position: fixed`, slid up by `unpinnedOffset`  |

Once per animation frame, it compares the scroll position with the last
frame's:

- At or above `pinStart` it is `unfixed`.
- Scrolling down past the header (its height plus `pinStart`) hides it. A
  pinned header hides only when one frame moves more than `downTolerance`.
- Scrolling up shows a hidden header when one frame moves more than
  `upTolerance`, or when it is back inside the header's own height.
- Scrolling up never moves an `unfixed` header: it is already in place.
- Overscroll (the bounce past the top or bottom on macOS and iOS) changes
  nothing.
- Keyboard focus moving into a hidden header shows it.

The tolerances are a **speed**, in pixels per frame: `upTolerance={10}` shows
the header when the user scrolls up faster than 10px per frame, not after they
have scrolled up 10px in total. A slow scroll up does not show the header.

`onPin`, `onUnpin` and `onUnfix` are called once for each change into that
state, and never after unmount.

## Props

| Prop                  | Default        | What it does                                                                                                                                                  |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pinStart`            | `0`            | The scroll position (px) where pinning starts and stops. Set it to the height of anything above the header.                                                    |
| `upTolerance`         | `5`            | px one frame must move up to show a hidden header.                                                                                                            |
| `downTolerance`       | `0`            | px one frame must move down to hide a shown header.                                                                                                           |
| `pin`                 | `false`        | Keep the header shown (pinned below `pinStart`, in place above it), for example while a menu is open.                                                         |
| `disable`             | `false`        | Keep the header in place and stop listening to scrolling.                                                                                                     |
| `parent`              | `() => window` | The scroller to follow, as a function. It may return nothing during mount (a ref); the first frame looks again, and a new element can replace the old one.     |
| `onPin`               | none           | Called when the header is shown.                                                                                                                              |
| `onUnpin`             | none           | Called when the header is hidden.                                                                                                                             |
| `onUnfix`             | none           | Called when the header goes back in place.                                                                                                                    |
| `unpinnedOffset`      | `'100%'`       | How far the header slides up when hidden: a number (px) or a CSS length. `48` keeps the bottom of a taller header visible.                                     |
| `matchScrollSpeed`    | `false`        | Time the slide to the scroll speed (header height ÷ px per ms, between 100 and 400 ms) instead of 200 ms.                                                     |
| `calcHeightOnResize`  | `true`         | Track the header's height (with a `ResizeObserver`; without one, on window resize). With `false`, the height measured at mount is kept.                        |
| `wrapperStyle`        | `{}`           | Styles for the wrapper, which keeps the header's space in the page. A `height` here replaces the measured height (for example `0` for an overlay header).    |
| `style`               | none           | Styles for the header, merged over the inline styles.                                                                                                         |
| `disableInlineStyles` | `false`        | Render no inline position, transform or transition; style the classes yourself.                                                                               |
| `classNames`          | defaults below | Replace any class name, for CSS Modules: `{ wrapper, header, unfixed, pinned, unpinned, scrolled, bottom, disableAnimation }`.                                |
| `className`           | none           | An extra class on the wrapper.                                                                                                                                |
| `tag`                 | `'div'`        | The wrapper's element type.                                                                                                                                   |

## Classes

| Element | Class                              | When                                                                    |
| ------- | ---------------------------------- | ----------------------------------------------------------------------- |
| wrapper | `headroom-wrapper`                 | always                                                                  |
| wrapper | `headroom-wrapper--<state>`        | always, for sibling selectors such as `.headroom-wrapper--pinned + main` |
| header  | `headroom`                         | always                                                                  |
| header  | `headroom--<state>`                | always                                                                  |
| header  | `headroom--scrolled`               | the last change slides (a pin, or a hide from pinned)                   |
| header  | `headroom-disable-animation`       | the last change does not slide (a hide from `unfixed`, an unfix, `disable`) |
| header  | `headroom--bottom`                 | the scroller is at its bottom                                           |

To animate with CSS instead of inline styles, pass `disableInlineStyles` and
style the classes:

```css
.headroom {
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
}
.headroom--unfixed {
  position: relative;
  transform: translateY(0);
}
.headroom--scrolled {
  transition: transform 200ms ease-in-out;
}
.headroom--unpinned {
  position: fixed;
  transform: translateY(-100%);
}
.headroom--pinned {
  position: fixed;
  transform: translateY(0%);
}
```

## Instance methods

With a ref to the component, `pin()`, `unpin()` and `unfix()` change the state
directly. A call that names the current state, or comes while `pin` or
`disable` is set, does nothing. The `pin` prop is usually simpler.

## Recipes

- **An element above the header** (a banner, #109): set `pinStart` to its
  height.
- **A header inside a scrolling container** (a modal, a drawer, #111, #130,
  #212): pass the container as `parent`, for example
  `parent={() => containerRef.current}`.
- **Only on small screens** (#146): render `<Headroom>` conditionally with a
  media-query hook, or pass `disable` on large screens.
- **Hidden until the user scrolls** (#156): style `.headroom--unfixed` as
  hidden, for example `visibility: hidden`.
- **Different content per state** (#174): style `headroom--<state>`, or use
  `useHeadroom` and branch on `state`.
- **Keep the header shown while a menu is open** (#155): `pin={menuOpen}`.
- **Two headers** (#85): give the second one a `pinStart` of the first one's
  height and `style={{ top: firstHeight }}`.
- **Show the header on hover or after an anchor link** (#173, #126): set `pin`
  from your own `onMouseEnter` or `hashchange` handler.

## Testing

This library is tested with [oracle testing](https://github.com/TanStack/oracles):
`test/headroom.oracle.js` states each behavior above as a law, generates
histories of scrolls, prop changes, resizes and focus, and checks the real
component and hook against an independent model. Run it with
`npm run test:oracles`.

## Credits

react-headroom started as a React port of
[headroom.js](https://github.com/WickyNilliams/headroom.js) by Nick Williams.
