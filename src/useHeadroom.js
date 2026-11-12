'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createHeadroom } from './core'

/**
 * The headroom state for a header you render yourself.
 *
 *   const { state, ref } = useHeadroom({ pinStart: 100 })
 *   return <header ref={ref} data-state={state}>…</header>
 *
 * Options are the component's: parent, pin, disable, upTolerance,
 * downTolerance, pinStart, calcHeightOnResize, matchScrollSpeed, onPin,
 * onUnpin and onUnfix. `state` is 'unfixed', 'pinned' or 'unpinned'. Attach
 * `ref` to the header element: the hook measures it and pins it when keyboard
 * focus moves into it while it is hidden.
 */
export default function useHeadroom(options = {}) {
  const [state, setState] = useState('unfixed')
  const headroom = useRef(null)
  const header = useRef(null)
  // The controller lives from mount to unmount; React StrictMode's remount
  // creates a new one.
  useEffect(() => {
    const current = createHeadroom(options, snapshot =>
      setState(snapshot.state)
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
  return { state, ref }
}
