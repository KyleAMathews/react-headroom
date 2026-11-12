// The animation-frame stand-in for the headroom oracle. The oracle replaces the
// `raf` package with `rafModule`, so a frame runs only when the driver says one
// happens. Each queued frame is { handle, callback }; handles never repeat, so
// a cancel can never hit a later frame. `time` is a virtual frame clock that
// the driver advances; it starts at 0 in each history.
export const frames = Object.assign([], { next: 0, time: 0 })

function requestFrame(callback) {
  frames.next += 1
  frames.push({ handle: frames.next, callback })
  return frames.next
}
requestFrame.cancel = handle => {
  const i = frames.findIndex(f => f.handle === handle)
  if (i !== -1) frames.splice(i, 1)
}

export const rafModule = { default: requestFrame }
