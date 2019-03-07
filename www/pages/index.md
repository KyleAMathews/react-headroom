[Code on Github](https://github.com/KyleAMathews/react-headroom)

React Headroom is a React Component to hide/show your header on scroll. The header on this site is a living example. When you scroll down, it slides out of view and slides back in when scrolling up.

Fixed headers are nice for persistent navigation but they can also get in the way by taking up valuable vertical screen space. Using this component lets you have your persistent navigation while preserving screen space when the navigation is not needed.

## Install

`npm install react-headroom`

## Using React Headroom

It's very simple actually :)

Here's an example:

```javascript
<Headroom>
  <h1>You can put anything you'd like inside the Headroom Component</h1>
</Headroom>
```

[See the code for this website.](https://github.com/KyleAMathews/react-headroom/blob/master/www/page-templates/index.js)

### Overriding animation

The component is intended to be plug 'n play meaning it has sensible defaults for animating the header in and out. If you'd like to override the default animation, you have two options.

One option is you can override the default inline styles like the following example:

```javascript
<Headroom style={{
  webkitTransition: 'all .5s ease-in-out'
  mozTransition: 'all .5s ease-in-out'
  oTransition: 'all .5s ease-in-out'
  transition: 'all .5s ease-in-out'
}}>
  <h1>You can put anything you'd like inside the Headroom Component</h1>
</Headroom>
```

Another option is to use CSS. The component has a `headroom` class as well as a `headroom--pinned` or `headroom--unpinned` depending on its pinned state. As CSS can't override inline styles, first disable the animation styles by passing in the `disableInlineStyles` prop. Then in your CSS do something like:

```javascript
.headroom {
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
}
.headroom--unfixed {
  position: relative;
  transform: translate3D(0, 0, 0);
}
.headroom--scrolled {
  transition: transform 200ms ease-in-out;
}
.headroom--unpinned {
  position: fixed;
  transform: translate3D(0, -100%, 0);
}
.headroom--pinned {
  position: fixed;
  transform: translate3D(0, 0, 0);
}
```

### Other props

*   `onPin` — callback called when header is pinned
*   `onUnpin` — callback called when header is unpinned
*   `onUnfix` — callback called when header position is no longer fixed
*   `upTolerance` — scroll tolerance in px when scrolling up before component is pinned
*   `downTolerance` — scroll tolerance in px when scrolling down before component is pinned
*   `disable` — disable pinning and unpinning
*   `wrapperStyle` — pass styles for the wrapper div (this maintains the components vertical space at the top of the page).
*   `parent` — provide a custom 'parent' element for scroll events. `parent` should be a function which resolves to the desired element.
*   `pinStart` — height in px where the header should start and stop pinning. Useful when you have another element above Headroom component.
*   `stickySubheaderStart` - height in px of the main header that should not be sticky (only provide this value if you want a sticky subheader)
