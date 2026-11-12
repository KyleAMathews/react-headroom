// The animation-frame stand-in for the headroom oracle. It replaces the
// browser's requestAnimationFrame and cancelAnimationFrame, so a frame runs
// only when the driver says one happens. Each queued frame is
// { handle, callback }; handles never repeat, so a cancel can never hit a
// later frame. `time` is a virtual frame clock that the driver advances; it
// starts at 0 in each history.
export const frames = Object.assign([], { next: 0, time: 0 })

// The browser's own frame, captured before the stand-in replaces it, for a
// page that must let the browser lay out (test/oracle-page-chrome.js).
export const realFrame = globalThis.requestAnimationFrame?.bind(globalThis)

globalThis.requestAnimationFrame = callback => {
  frames.next += 1
  frames.push({ handle: frames.next, callback })
  return frames.next
}
globalThis.cancelAnimationFrame = handle => {
  const i = frames.findIndex(f => f.handle === handle)
  if (i !== -1) frames.splice(i, 1)
}
