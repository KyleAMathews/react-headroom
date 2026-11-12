// The page clock of the headroom oracle's Chrome run: the oracle clock's part
// that the drivers use. Timeouts and intervals queue until runPending() runs
// the ones queued so far; release() restores the browser's.
export function pageClock() {
  const real = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  }
  const timers = new Map()
  let next = 0
  const add =
    repeat =>
    (callback, ms, ...args) => {
      next += 1
      timers.set(next, { callback, args, repeat })
      return next
    }
  const remove = id => timers.delete(id)
  Object.assign(globalThis, {
    setTimeout: add(false),
    clearTimeout: remove,
    setInterval: add(true),
    clearInterval: remove,
  })
  return {
    runPending() {
      for (const [id, timer] of [...timers]) {
        // An earlier callback in this pass may have cleared it.
        if (!timers.has(id)) continue
        if (!timer.repeat) timers.delete(id)
        if (typeof timer.callback === 'function') timer.callback(...timer.args)
      }
    },
    release: () => Object.assign(globalThis, real),
  }
}
