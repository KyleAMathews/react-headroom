'use client'
import React from 'react'
import { createHeadroom, DEFAULT_OPTIONS, initialSnapshot } from './core'

// The part of the controller's snapshot that render shows: a height that
// wrapperStyle overrides is not shown.
const shownOf = (props, snapshot) =>
  JSON.stringify(
    props.wrapperStyle && props.wrapperStyle.height !== undefined
      ? { ...snapshot, height: undefined }
      : snapshot
  )

const DEFAULT_CLASS_NAMES = {
  wrapper: 'headroom-wrapper',
  header: 'headroom',
  unfixed: 'headroom--unfixed',
  pinned: 'headroom--pinned',
  unpinned: 'headroom--unpinned',
  scrolled: 'headroom--scrolled',
  bottom: 'headroom--bottom',
  disableAnimation: 'headroom-disable-animation',
}

const classes = list => list.filter(Boolean).join(' ')

/**
 * Hides its children's header while the user scrolls down, and shows it again
 * on the way up. Props:
 *
 * - parent: () => element. The scroller to follow (default: window). It may
 *   return nothing during mount (a ref); the first frame looks again.
 * - pinStart: number. The scroll position in px where pinning starts and stops.
 * - upTolerance / downTolerance: number. How many px one animation frame must
 *   move before the header shows / hides: a speed (defaults 5 and 0).
 * - pin: bool. Keep the header shown below pinStart.
 * - disable: bool. Keep the header in place and ignore scrolling.
 * - onPin / onUnpin / onUnfix: () => void. Called once per change of state.
 * - unpinnedOffset: number (px) | string (CSS length). How far the header
 *   slides up when hidden (default '100%').
 * - matchScrollSpeed: bool. Time the slide to the scroll speed (100-400ms)
 *   instead of 200ms.
 * - classNames: { wrapper, header, unfixed, pinned, unpinned, scrolled,
 *   bottom, disableAnimation }. Replace any of the default class names.
 * - calcHeightOnResize: bool. Track the header's height (default true).
 * - disableInlineStyles: bool. Leave positioning to your CSS.
 * - style / wrapperStyle / className / tag: the header's style, the wrapper's
 *   style (a height here wins), the wrapper's class and element type.
 *
 * Instance methods pin(), unpin() and unfix() change the state directly; a
 * call that names the current state, comes while pin or disable is set, or
 * comes after unmount, does nothing.
 */
export default class Headroom extends React.PureComponent {
  // The controller's latest snapshot; the state holds only what render shows
  // of it, so a change that shows nothing renders nothing.
  snapshot = initialSnapshot()
  state = {}

  // The controller lives from mount to unmount; React StrictMode's remount
  // creates a new one.
  componentDidMount() {
    // `this.shown` is what the last setState asked for: React's state may
    // not have caught up while it batches updates.
    this.headroom = createHeadroom(this.props, snapshot => {
      this.snapshot = snapshot
      const shown = shownOf(this.props, snapshot)
      if (shown !== this.shown) this.setState({ shown: (this.shown = shown) })
    })
    this.headroom.setHeader(this.inner)
    this.headroom.mount()
  }

  componentDidUpdate() {
    this.headroom.setOptions(this.props)
  }

  componentWillUnmount() {
    this.headroom.destroy()
    this.headroom = null
  }

  // A new tag replaces the header element; the controller follows it.
  setRef = ref => {
    this.inner = ref
    this.headroom?.setHeader(ref)
  }

  // Instance methods, for callers that hold a ref to the component. After
  // unmount they do nothing.
  pin = () => this.headroom?.pin()
  unpin = () => this.headroom?.unpin()
  unfix = () => this.headroom?.unfix()

  render() {
    // The rest, without the behavior options, goes to the header element.
    const {
      className,
      tag: Tag = 'div',
      style,
      wrapperStyle,
      classNames,
      unpinnedOffset = '100%',
      disableInlineStyles,
      children,
      ...rest
    } = this.props
    for (const option in DEFAULT_OPTIONS) delete rest[option]
    const names = { ...DEFAULT_CLASS_NAMES, ...classNames }
    const { state, animated, height, bottom, transitionMs } = this.snapshot

    // A number of px is negated as a number (a negative one moves the header
    // down); a leading minus negates a plain length (including a unitless 0,
    // which calc() would turn into a number); calc() negates any other
    // length, including calc() and var().
    const offset =
      typeof unpinnedOffset === 'number'
        ? `${-unpinnedOffset}px`
        : /^(\d+\.?\d*|\.\d+)[a-z%]*$/.test(unpinnedOffset)
          ? `-${unpinnedOffset}`
          : `calc(-1 * (${unpinnedOffset}))`
    const translateY = state === 'unpinned' ? offset : 0
    let innerStyle = {
      position:
        this.props.disable || state === 'unfixed' ? 'relative' : 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1,
      transform: `translate3D(0, ${translateY}, 0)`,
    }

    // Don't add css transitions until after we've done the initial
    // negative transform when transitioning from 'unfixed' to 'unpinned'.
    // If we don't do this, the header will flash into view temporarily
    // while it transitions from 0 — -100%.
    if (animated) {
      innerStyle.transition = `all ${transitionMs}ms ease-in-out`
    }

    innerStyle = disableInlineStyles ? style : { ...innerStyle, ...style }

    return (
      <Tag
        style={{ height: height || null, ...wrapperStyle }}
        className={classes([
          className,
          names.wrapper,
          `${names.wrapper}--${state}`,
        ])}
      >
        <div
          ref={this.setRef}
          {...rest}
          style={innerStyle}
          className={classes([
            names.header,
            names[state],
            // Before the first change, neither transition class.
            animated !== undefined &&
              names[animated ? 'scrolled' : 'disableAnimation'],
            bottom && names.bottom,
          ])}
        >
          {children}
        </div>
      </Tag>
    )
  }
}
