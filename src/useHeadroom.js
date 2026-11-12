'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createHeadroom, initialSnapshot } from './core'

/**
 * The headroom state for a header you render yourself.
 *
 *   const { state, animated, ref } = useHeadroom({ pinStart: 100 })
 *   return <header ref={ref} data-state={state}>…</header>
 *
 * Options are the component's: parent, pin, disable, upTolerance,
 * downTolerance, pinStart, calcHeightOnResize, matchScrollSpeed, onPin,
 * onUnpin and onUnfix. `state` is 'unfixed', 'pinned' or 'unpinned'.
 * `animated` says whether the last change slides (a pin, or a hide from
 * pinned) or snaps (a hide from unfixed, an unfix, disable), and
 * `transitionMs` how long the last slide lasted (200, or 100-400 with
 * matchScrollSpeed); animated is undefined before the first change, and
 * transitionMs before the first slide. Attach `ref` to the header element: the hook
 * measures it and pins it when keyboard focus moves into it while it is
 * hidden.
 */
export default function useHeadroom(options = {}) {
  // What the hook shows starts as what the controller starts from.
  const [shown, setShown] = useState(initialSnapshot)
  // What setShown last got: a snapshot that changes none of it (only the
  // height or the bottom) sets nothing, so the caller does not re-render.
  const last = useRef(shown)
  const headroom = useRef(null)
  const header = useRef(null)
  // The controller lives from mount to unmount; React StrictMode's remount
  // creates a new one.
  useEffect(() => {
    const current = createHeadroom(
      options,
      ({ state, animated, transitionMs }) => {
        const was = last.current
        if (
          state === was.state &&
          animated === was.animated &&
          transitionMs === was.transitionMs
        )
          return
        setShown((last.current = { state, animated, transitionMs }))
      }
    )
    headroom.current = current
    current.setHeader(header.current)
    current.mount()
    return () => {
      current.destroy()
      headroom.current = null
    }
    // Later options reach the controller through the effect below.
  }, [])
  // Every render passes the latest options, so callbacks and props stay current.
  useEffect(() => {
    headroom.current.setOptions(options)
  })
  const ref = useCallback(element => {
    header.current = element
    if (headroom.current) headroom.current.setHeader(element)
  }, [])
  return {
    state: shown.state,
    animated: shown.animated,
    transitionMs: shown.transitionMs,
    ref,
  }
}
