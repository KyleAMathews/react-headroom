'use client'
import React, { Component } from 'react'
import shallowequal from 'shallowequal'
import { createHeadroom, DEFAULT_CLASS_NAMES, initialSnapshot } from './core'

export { default as useHeadroom } from './useHeadroom'

// Props that configure the component and are not passed to the header element.
const OWN_PROPS = [
  'className',
  'tag',
  'style',
  'wrapperStyle',
  'classNames',
  'unpinnedOffset',
  'disableInlineStyles',
  'disable',
  'pin',
  'parent',
  'children',
  'upTolerance',
  'downTolerance',
  'pinStart',
  'calcHeightOnResize',
  'matchScrollSpeed',
  'onPin',
  'onUnpin',
  'onUnfix',
]

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
 * call that names the current state, or comes while pin or disable is set,
 * does nothing.
 */
// The part of the controller's snapshot that render shows: a height that
// wrapperStyle overrides is not shown.
const shownState = (props, state) =>
  props.wrapperStyle && props.wrapperStyle.height !== undefined
    ? { ...state, height: undefined }
    : state

export default class Headroom extends Component {
  static defaultProps = {
    tag: 'div',
    unpinnedOffset: '100%',
  }

  state = initialSnapshot()

  // The controller lives from mount to unmount; React StrictMode's remount
  // creates a new one.
  componentDidMount() {
    this.headroom = createHeadroom(this.props, snapshot =>
      this.setState(snapshot)
    )
    this.headroom.setHeader(this.inner)
    this.headroom.mount()
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      !shallowequal(this.props, nextProps) ||
      !shallowequal(
        shownState(this.props, this.state),
        shownState(nextProps, nextState)
      )
    )
  }

  componentDidUpdate() {
    this.headroom.setOptions(this.props)
  }

  componentWillUnmount() {
    this.headroom.destroy()
    this.headroom = null
  }

  // The header element never changes while mounted; the controller reads it
  // at mount.
  setRef = ref => {
    this.inner = ref
  }

  // Instance methods, for callers that hold a ref to the component.
  pin = () => this.headroom.pin()
  unpin = () => this.headroom.unpin()
  unfix = () => this.headroom.unfix()

  render() {
    const {
      className: userClassName,
      tag: Tag,
      style,
      wrapperStyle,
      unpinnedOffset,
    } = this.props
    const rest = { ...this.props }
    for (const prop of OWN_PROPS) delete rest[prop]
    const names = { ...DEFAULT_CLASS_NAMES, ...this.props.classNames }
    const { state, animated, height, bottom, transitionMs } = this.state

    const offset =
      typeof unpinnedOffset === 'number'
        ? `${unpinnedOffset}px`
        : unpinnedOffset
    const translateY = state === 'unpinned' ? `-${offset}` : 0
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

    innerStyle = this.props.disableInlineStyles
      ? style
      : { ...innerStyle, ...style }

    const className = [
      names.header,
      names[state],
      animated ? names.scrolled : null,
      animated === false ? names.disableAnimation : null,
      bottom ? names.bottom : null,
    ]
      .filter(Boolean)
      .join(' ')

    const wrapperStyles = { height: height ? height : null, ...wrapperStyle }
    const wrapperClassName = [
      userClassName,
      names.wrapper,
      `${names.wrapper}--${state}`,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <Tag style={wrapperStyles} className={wrapperClassName}>
        <div
          ref={this.setRef}
          {...rest}
          style={innerStyle}
          className={className}
        >
          {this.props.children}
        </div>
      </Tag>
    )
  }
}
