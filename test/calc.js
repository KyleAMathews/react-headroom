/* eslint-disable no-unused-expressions */
import { expect } from 'chai'
import shouldUpdate from '../src/shouldUpdate'

let propDefaults = {}

describe('shouldUpdate', () => {
  beforeEach(() => {
    propDefaults =
      { disableInlineStyles: false,
      disable: false,
      upTolerance: 0,
      downTolerance: 0,
      offset: 0,
      pinStart: 0,
    }
  })

  it('should exist', () => {
    expect(shouldUpdate).to.exist
  })

  it('should return an object', () => {
    expect(shouldUpdate()).to.be.instanceof(Object)
  })

  // Test scrolling direction detection.
  it('should report scrolling down when currentScroll is greater than lastKnownScrollY', () => {
    expect(shouldUpdate(0, 10).scrollDirection).to.equal('down')
  })

  it('should report scrolling upwhen currentScroll is less than lastKnownScrollY', () => {
    expect(shouldUpdate(10, 0).scrollDirection).to.equal('up')
  })

  // Test action logic.
  it('should return an action of "none" if scrolling down and already unpinned', () => {
    const state = {
      height: 0,
      state: 'unpinned',
    }
    const result = shouldUpdate(0, 10, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it('should return an action of "none" if scrolling up and already pinned', () => {
    const state = {
      height: 0,
      state: 'pinned',
    }
    const result = shouldUpdate(100, 90, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it('should return an action of `unpin` if scrolling down and pinned', () => {
    const state = {
      height: 0,
      state: 'pinned',
    }
    const result = shouldUpdate(0, 10, propDefaults, state)
    expect(result.action).to.equal('unpin')
  })

  it('should not return an action of `unpin` if scrolling down and unfixed ' +
  'but the scrolling amount is less than pinStart', () => {
    propDefaults.pinStart = 200
    const state = {
      height: 0,
      state: 'unfixed',
    }
    const result = shouldUpdate(100, 110, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it('should not return an action of `unpin` if scrolling down and pinned ' +
    'but the scrolling amount is less than downTolerance', () => {
    propDefaults.downTolerance = 1000
    const state = {
      height: 0,
      state: 'pinned',
    }
    const result = shouldUpdate(100, 110, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it('should return an action of `pin` if scrolling up and unpinned', () => {
    const state = {
      height: 0,
      state: 'unpinned',
    }
    const result = shouldUpdate(10, 1, propDefaults, state)
    expect(result.action).to.equal('pin')
  })

  it('should not return an action of `pin` if scrolling up and unpinned' +
    'but the scrolling amount is less than upTolerance', () => {
    propDefaults.upTolerance = 1000
    const state = {
      height: 0,
      state: 'unpinned',
    }
    const result = shouldUpdate(110, 100, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it("should return an action of 'none' if haven't scrolled past height of header", () => {
    const state = {
      height: 100,
      state: 'unfixed',
    }
    const result = shouldUpdate(0, 10, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it('should return an action of `none` if scrolling up ' +
  'when pinned within height of header', () => {
    const state = {
      height: 100,
      state: 'pinned',
    }
    const result = shouldUpdate(50, 10, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it('should return an action of `pin` if scrolling up when unpinned within height of header ' +
    'regardless of the upTolerance value', () => {
    propDefaults.upTolerance = 1000
    let state = {
      height: 100,
      state: 'unpinned',
    }
    let result = shouldUpdate(50, 10, propDefaults, state)

    expect(result.action).to.equal('pin')

    state = {
      height: 100,
      state: 'unpinned',
    }
    result = shouldUpdate(50, 1, propDefaults, state)
    expect(result.action).to.equal('pin')
  })

  it('should return an action of `none` if scrolling down ' +
  'when pinned within height of header', () => {
    const state = {
      height: 100,
      state: 'pinned',
    }
    const result = shouldUpdate(50, 80, propDefaults, state)
    expect(result.action).to.equal('none')
  })

  it('should return an action of `none` if scrolling up ' +
  'when pinned within height of header or at the top', () => {
    const state = {
      height: 100,
      state: 'pinned',
    }
    const result = shouldUpdate(100, 1, propDefaults, state)

    expect(result.action).to.equal('none')
  })

  it("should return an action of 'unfix' if currentScroll is less than or equal to pinStart", () => {
    propDefaults.pinStart = 20
    const state = {
      height: 100,
      state: 'pinned',
    }
    let result = shouldUpdate(100, 10, propDefaults, state)

    expect(result.action).to.equal('unfix')

    result = shouldUpdate(100, 20, propDefaults, state)

    expect(result.action).to.equal('unfix')
  })

  it("should not return an action of 'unfix' if currentScroll is more than pinStart", () => {
    propDefaults.pinStart = 20
    const state = {
      height: 100,
      state: 'pinned',
    }
    const result = shouldUpdate(100, 50, propDefaults, state)

    expect(result.action).to.equal('none')
  })

  it("should return an action of 'unpin' if scroll down past height of header", () => {
    const state = {
      height: 100,
      state: 'unfixed',
    }
    const result = shouldUpdate(100, 110, propDefaults, state)
    expect(result.action).to.equal('unpin')
  })
})
