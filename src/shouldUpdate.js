// Decides what one animation frame does to the header, from the scroll
// position at the last frame and now. `state` is the header's state
// ('unfixed', 'pinned' or 'unpinned') and its height. Returns { action }, one
// of 'none', 'pin', 'unpin', 'unpin-snap' (unpin without a transition) or
// 'unfix'. The caller skips frames while disabled and frames past either end
// of the scroller.
export default function shouldUpdate(
  lastKnownScrollY = 0,
  currentScrollY = 0,
  props = {},
  state = {}
) {
  const moved = currentScrollY - lastKnownScrollY
  const atTop = currentScrollY <= props.pinStart
  const pastHeader = currentScrollY > state.height + props.pinStart
  let action = 'none'

  if (props.pin) {
    // Pinned: shown below pinStart, in place at or above it.
    if (atTop) action = state.state !== 'unfixed' ? 'unfix' : 'none'
    else action = state.state !== 'pinned' ? 'pin' : 'none'
  } else if (atTop) {
    // At the top: back in place.
    if (state.state !== 'unfixed') action = 'unfix'
  } else if (state.state === 'unfixed') {
    // The in-place header has scrolled out of view: hide it at any speed,
    // without a transition.
    if (pastHeader && moved > 0) action = 'unpin-snap'
  } else if (state.state === 'pinned') {
    // Past the header and scrolling down faster than downTolerance: hide it.
    if (pastHeader && moved > props.downTolerance) action = 'unpin'
  } else if (moved < 0) {
    // Hidden and scrolling up faster than upTolerance, or back inside the
    // header's height: show it, regardless of upTolerance in that case.
    if (-moved > props.upTolerance || currentScrollY <= state.height) {
      action = 'pin'
    }
  }

  return { action }
}
