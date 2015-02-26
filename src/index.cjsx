React = require 'react'
objectAssign = require('react/lib/Object.assign')
PureRenderMixin = require('react/addons').addons.PureRenderMixin
raf = require 'raf'
PropTypes = React.PropTypes

shouldUpdate = require './shouldUpdate'

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
    disable: PropTypes.bool
    upTolerance: PropTypes.number
    downTolerance: PropTypes.number
    onPin: PropTypes.func
    onUnpin: PropTypes.func
    onUnfix: PropTypes.func

  getDefaultProps: ->
    disableInlineStyles: false
    disable: false
    upTolerance: 5
    downTolerance: 0
    onPin: ->
    onUnpin: ->
    onUnfix: ->

  getInitialState: ->
    state: 'unfixed'
    translateY: 0
    className: 'headroom headroom--pinned'

  componentDidMount: ->
    @setState height: @getDOMNode().offsetHeight
    unless @props.disable
      @eventListener = window.addEventListener('scroll', @handleScroll, false)

  componentWillReceiveProps: (nextProps) ->
    if nextProps.disable
      @unfix()

      # Remove the scroll listener if there is one.
      if @eventListener
        window.removeEventListener('scroll', @handleScroll)


  handleScroll: ->
    unless @ticking
      raf(@update)

  unpin: ->
    @props.onUnpin()

    @setState {
      translateY: "-100%"
      className: "headroom headroom--unpinned"
    }, =>
      setTimeout((=>
        @setState state: "unpinned"
      ), 0)

  pin: ->
    @props.onPin()

    @setState {
      translateY: 0
      className: "headroom headroom--pinned"
      state: "pinned"
    }

  unfix: ->
    @props.onUnfix()

    @setState {
      translateY: 0
      className: "headroom headroom--unfixed"
      state: "unfixed"
    }

  update: ->
    @currentScrollY = @getScrollY()
    {action, scrollDirection, distanceScrolled} = shouldUpdate(
      @lastKnownScrollY, @currentScrollY, @props, @state)

    if action is "pin"
      @pin()
    else if action is "unpin"
      @unpin()
    else if action is "unfix"
      @unfix()

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
      position:
        if @props.disable or @state.state is "unfixed"
          'initial'
        else
          'fixed'
      top: 0
      left: 0
      right: 0
      zIndex: 1
      webkitTransform: "translateY(#{@state.translateY})"
      msTransform: "translateY(#{@state.translateY})"
      transform: "translateY(#{@state.translateY})"

    # Don't add css transitions until after we've done the initial
    # negative transform when transitioning from "unfixed" to "unpinned".
    # If we don't do this, the header will flash into view temporarily
    # while it transitions from 0 — -100%.
    if @state.state isnt "unfixed"
      style = objectAssign style, {
        webkitTransition: "all .2s ease-in-out"
        mozTransition: "all .2s ease-in-out"
        oTransition: "all .2s ease-in-out"
        transition: "all .2s ease-in-out"
      }

    unless @props.disableInlineStyles
      style = objectAssign style, @props.style
    else
      style = @props.style

    <div style={{height: if @state.height then @state.height}}>
      <div {...@props} style={style} className={@state.className}>
        {@props.children}
      </div>
    </div>
