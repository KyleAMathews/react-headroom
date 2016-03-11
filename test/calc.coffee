chai = require 'chai'
expect = chai.expect
_ = require 'underscore'

shouldUpdate = require '../src/shouldUpdate'

propDefaults = {}

describe 'shouldUpdate', ->
  beforeEach ->
    propDefaults =
      disableInlineStyles: false
      disable: false
      upTolerance: 0
      downTolerance: 0
      offset: 0
      pinStart: 0

  it 'should exist', ->
    expect(shouldUpdate).to.exist

  it 'should return an object', ->
    expect(shouldUpdate()).to.be.instanceof(Object)

  # Test scrolling direction detection.
  it 'should report scrolling down when currentScroll
      is greater than lastKnownScrollY', ->
    expect(shouldUpdate(0, 10).scrollDirection).to.equal('down')

  it 'should report scrolling upwhen currentScroll
      is less than lastKnownScrollY', ->
    expect(shouldUpdate(10, 0).scrollDirection).to.equal('up')

  # Test action logic.
  it 'should return an action of "none" if scrolling down and
      already unpinned', ->
    state =
      height: 0
      state: "unpinned"
    result = shouldUpdate(0, 10, propDefaults, state)
    expect(result.action).to.equal('none')

  it 'should return an action of "none" if scrolling up and already pinned', ->
    state =
      height: 0
      state: "pinned"
    result = shouldUpdate(100, 90, propDefaults, state)
    expect(result.action).to.equal('none')

  it 'should return an action of "unpin" if scrolling down and pinned', ->
    state =
      height: 0
      state: "pinned"
    result = shouldUpdate(0, 10, propDefaults, state)
    expect(result.action).to.equal('unpin')

  it 'should not return an action of "unpin" if scrolling down and unfixed
      but the scrolling amount is less than pinStart', ->
    propDefaults.pinStart = 200
    state =
      height: 0
      state: "unfixed"
    result = shouldUpdate(100, 110, propDefaults, state)
    expect(result.action).to.equal('none')

  it 'should not return an action of "unpin" if scrolling down and pinned
      but the scrolling amount is less than downTolerance', ->
    propDefaults.downTolerance = 1000
    state =
      height: 0
      state: "pinned"
    result = shouldUpdate(100, 110, propDefaults, state)
    expect(result.action).to.equal('none')

  it 'should return an action of "pin" if scrolling up and unpinned', ->
    state =
      height: 0
      state: "unpinned"
    result = shouldUpdate(10, 1, propDefaults, state)
    expect(result.action).to.equal('pin')

  it 'should not return an action of "pin" if scrolling up and unpinned
      but the scrolling amount is less than upTolerance', ->
    propDefaults.upTolerance = 1000
    state =
      height: 0
      state: "unpinned"
    result = shouldUpdate(110, 100, propDefaults, state)
    expect(result.action).to.equal('none')

  it "should return an action of 'none' if haven't scrolled
      past height of header", ->
    state =
      height: 100
      state: "unfixed"
    result = shouldUpdate(0, 10, propDefaults, state)
    expect(result.action).to.equal('none')

  it "should return an action of 'none' if scrolling up when pinned within
      height of header", ->
    state =
      height: 100
      state: "pinned"
    result = shouldUpdate(50, 10, propDefaults, state)
    expect(result.action).to.equal('none')

  it "should return an action of 'pin' if scrolling up when unpinned within
      height of header regardless of the upTolerance value", ->
    propDefaults.upTolerance = 1000
    state =
      height: 100
      state: "unpinned"
    result = shouldUpdate(50, 10, propDefaults, state)
    expect(result.action).to.equal('pin')

    state =
      height: 100
      state: "unpinned"
    result = shouldUpdate(50, 0, propDefaults, state)
    expect(result.action).to.equal('pin')

  it "should return an action of 'none' if scrolling down when pinned within
      height of header", ->
    state =
      height: 100
      state: "pinned"
    result = shouldUpdate(50, 80, propDefaults, state)
    expect(result.action).to.equal('none')

  it "should return an action of 'none' if scrolling up when pinned within
      height of header or at the top", ->
    state =
      height: 100
      state: "pinned"
    result = shouldUpdate(100, 0, propDefaults, state)

    expect(result.action).to.equal('none')

  it "should return an action of 'unfix' if
      currentScroll is less than pinStart", ->
    propDefaults.pinStart = 20
    state =
      height: 100
      state: "pinned"
    result = shouldUpdate(100, 10, propDefaults, state)

    expect(result.action).to.equal('unfix')

  it "should not return an action of 'unfix' if
      currentScroll is more than pinStart", ->
    propDefaults.pinStart = 20
    state =
      height: 100
      state: "pinned"
    result = shouldUpdate(100, 50, propDefaults, state)

    expect(result.action).to.equal('none')

  it "should return an action of 'unpin' if scroll down past height
      of header", ->
    state =
      height: 100
      state: "unfixed"
    result = shouldUpdate(100, 110, propDefaults, state)
    expect(result.action).to.equal("unpin")
