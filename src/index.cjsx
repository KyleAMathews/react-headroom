React = require 'react'
objectAssign = require('react/lib/Object.assign')
PureRenderMixin = require('react/addons').addons.PureRenderMixin
raf = require 'raf'

PropTypes = React.PropTypes

module.exports = React.createClass
  displayName: 'Headroom'

  mixins: [PureRenderMixin]

  # Class variables.
  currentScrollY: 0
  lastKnownScrollY: 0
  ticking: false

  propTypes:
    children: PropTypes.any.isRequired
    disableInlineStyles: PropTypes.bool
    upTolerance: PropTypes.number
    downTolerance: PropTypes.number
    offset: PropTypes.number
    onPin: PropTypes.func
    onUnpin: PropTypes.func

  getDefaultProps: ->
    upTolerance: 20
    downTolerance: 10
    offset: 100
    onPin: ->
    onUnpin: ->

  getInitialState: ->
    pinned: true
    translateY: 0
    className: 'headroom headroom--pinned'

  componentDidMount: ->
    window.addEventListener('scroll', @handleScroll, false)

  handleScroll: ->
    unless @ticking
      raf(@update)

  unpin: ->
    # If component is already pinned, call onUnpin callback.
    if @state.pinned
      @props.onUnpin()

    @setState {
      translateY: "-100%"
      className: "headroom headroom--unpinned"
      pinned: false
    }

  pin: ->
    # If component is unpinned, call onPin callback.
    unless @state.pinned
      @props.onPin()

    @setState {
      translateY: 0
      className: "headroom headroom--pinned"
      pinned: true
    }

  update: ->
    @currentScrollY = @getScrollY()
    scrollDirection = if @currentScrollY > @lastKnownScrollY then "down" else "up"
    distanceScrolled = Math.abs(@currentScrollY - @lastKnownScrollY)

    if scrollDirection is "down" and
        @currentScrollY > @props.offset and
        distanceScrolled > @props.downTolerance
      @unpin()
    else if scrollDirection is "up" and
        distanceScrolled > @props.upTolerance or
        @currentScrollY < @props.offset
      @pin()

    @lastKnownScrollY = @currentScrollY
    @ticking = false

  getScrollY: ->
    if window.pageYOffset != undefined
      window.pageYOffset
    else if window.scrollTop != undefined
      window.scrollTop
    else (document.documentElement or
      document.body.parentNode or
      document.body).scrollTop

  render: ->
    style =
      position: 'fixed'
      left: 0
      right: 0
      top: 0
      zIndex: 1
      webkitTransform: "translateY(#{@state.translateY})"
      msTransform: "translateY(#{@state.translateY})"
      transform: "translateY(#{@state.translateY})"
      webkitTransition: "all .25s ease-in-out"
      mozTransition: "all .25s ease-in-out"
      oTransition: "all .25s ease-in-out"
      transition: "all .25s ease-in-out"

    unless @props.disableInlineStyles
      style = objectAssign style, @props.style
    else
      style = @props.style

    <div {...@props} style={style} className={@state.className}>
      {@props.children}
    </div>
