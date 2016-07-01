import React, { Component, PropTypes } from 'react' // eslint-disable-line import/no-unresolved
import PureRenderMixin from 'react-addons-pure-render-mixin'
import shouldUpdate from './shouldUpdate'
import raf from 'raf'

const noop = () => {}

export default class Headroom extends Component {
  static propTypes = {
    parent: PropTypes.func,
    children: PropTypes.any.isRequired,
    disableInlineStyles: PropTypes.bool,
    disable: PropTypes.bool,
    upTolerance: PropTypes.number,
    downTolerance: PropTypes.number,
    onPin: PropTypes.func,
    onUnpin: PropTypes.func,
    onUnfix: PropTypes.func,
    wrapperStyle: PropTypes.object,
    pinStart: PropTypes.number,
    style: PropTypes.object,
  };

  static defaultProps = {
    parent: () => window,
    disableInlineStyles: false,
    disable: false,
    upTolerance: 5,
    downTolerance: 0,
    onPin: noop,
    onUnpin: noop,
    onUnfix: noop,
    wrapperStyle: {},
    pinStart: 0,
  };

  constructor (props) {
    super(props)
    // Class variables.
    this.currentScrollY = 0
    this.lastKnownScrollY = 0
    this.ticking = false
    this.state = {
      state: 'unfixed',
      translateY: 0,
      className: 'headroom headroom--unfixed',
    }

    this.shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate.bind(this)
  }

  componentDidMount () {
    this.setHeightOffset()
    if (!this.props.disable) {
      this.props.parent().addEventListener('scroll', this.handleScroll)
    }
  }

  componentWillReceiveProps (nextProps) {
    if (nextProps.disable && !this.props.disable) {
      this.unfix()
      this.props.parent().removeEventListener('scroll', this.handleScroll)
    } else if (!nextProps.disable && this.props.disable) {
      this.props.parent().addEventListener('scroll', this.handleScroll)
    }
  }
  componentDidUpdate (prevProps) {
    // If children have changed, remeasure height.
    if (prevProps.children !== this.props.children) {
      this.setHeightOffset()
    }
  }

  componentWillUnmount () {
    this.props.parent().removeEventListener('scroll', this.handleScroll)
    window.removeEventListener('scroll', this.handleScroll)
  }

  setHeightOffset = () => {
    this.setState({
      height: this.refs.inner.offsetHeight,
    })
  }

  getScrollY = () => {
    if (this.props.parent().pageYOffset !== undefined) {
      return this.props.parent().pageYOffset
    } else if (this.props.parent().scrollTop !== undefined) {
      return this.props.parent().scrollTop
    } else {
      return (document.documentElement || document.body.parentNode || document.body).scrollTop
    }
  }

  handleScroll = () => {
    if (!this.ticking) {
      this.ticking = true
      raf(this.update)
    }
  }


  unpin = () => {
    this.props.onUnpin()

    this.setState({
      translateY: '-100%',
      className: 'headroom headroom--unpinned',
    }, () => {
      setTimeout(() => {
        this.setState({ state: 'unpinned' })
      }, 0)
    })
  }

  pin = () => {
    this.props.onPin()

    this.setState({
      translateY: 0,
      className: 'headroom headroom--pinned',
      state: 'pinned',
    })
  }

  unfix = () => {
    this.props.onUnfix()

    this.setState({
      translateY: 0,
      className: 'headroom headroom--unfixed',
      state: 'unfixed',
    })
  }

  update = () => {
    this.currentScrollY = this.getScrollY()
    const { action } = shouldUpdate(
      this.lastKnownScrollY,
      this.currentScrollY,
      this.props,
      this.state
    )

    if (action === 'pin') {
      this.pin()
    } else if (action === 'unpin') {
      this.unpin()
    } else if (action === 'unfix') {
      this.unfix()
    }
    this.lastKnownScrollY = this.currentScrollY
    this.ticking = false
  }

  render () {
    let style = {
      position: this.props.disable || this.state.state === 'unfixed' ? 'relative' : 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1,
      WebkitTransform: `translateY(${this.state.translateY})`,
      MsTransform: `translateY(${this.state.translateY})`,
      transform: `translateY(${this.state.translateY})`,
    }

    let className = this.state.className

    // Don't add css transitions until after we've done the initial
    // negative transform when transitioning from 'unfixed' to 'unpinned'.
    // If we don't do this, the header will flash into view temporarily
    // while it transitions from 0 — -100%.
    if (this.state.state !== 'unfixed') {
      style = {
        ...style,
        WebkitTransition: 'all .2s ease-in-out',
        MozTransition: 'all .2s ease-in-out',
        OTransition: 'all .2s ease-in-out',
        transition: 'all .2s ease-in-out',
      }
      className += ' headroom--scrolled'
    }

    if (!this.props.disableInlineStyles) {
      style = {
        ...style,
        ...this.props.style,
      }
    } else {
      style = this.props.style
    }

    const wrapperStyles = {
      ...this.props.wrapperStyle,
      height: this.state.height ? this.state.height : null,
    }

    return (
      <div style={wrapperStyles} className="headroom-wrapper">
        <div
          ref="inner"
          {...this.props}
          style={style}
          className={className}
        >
          {this.props.children}
        </div>
      </div>
    )
  }
}
