module.exports = (lastKnownScrollY=0, currentScrollY=0, props={}, state={}) ->
  scrollDirection = if currentScrollY >= lastKnownScrollY then "down" else "up"
  distanceScrolled = Math.abs(currentScrollY - lastKnownScrollY)

  # We're at the top and not fixed yet.
  if currentScrollY < props.pinStart and
      state.state isnt "unfixed"
    return {
      action: "unfix"
      scrollDirection: scrollDirection
      distanceScrolled: distanceScrolled
    }
  # We're unfixed and headed down. Carry on.
  else if currentScrollY <= state.height and
      scrollDirection is "down" and
      state.state is "unfixed"
    return {
      action: "none"
      scrollDirection: scrollDirection
      distanceScrolled: distanceScrolled
    }
  # We're past the header and scrolling down.
  # We transition to "unpinned" if necessary.
  else if scrollDirection is "down" and
      state.state in ["pinned", "unfixed"] and
      currentScrollY > (state.height + props.pinStart) and
      distanceScrolled > props.downTolerance
    return {
      action: "unpin"
      scrollDirection: scrollDirection
      distanceScrolled: distanceScrolled
    }
  # We're scrolling up, we transition to "pinned"
  else if (scrollDirection is "up" and
      distanceScrolled > props.upTolerance and
      state.state not in ["pinned", "unfixed"])
    return {
      action: "pin"
      scrollDirection: scrollDirection
      distanceScrolled: distanceScrolled
    }
  # We're scrolling up, and inside the header.
  # We transition to pin regardless of upTolerance
  else if (scrollDirection is "up" and
      currentScrollY <= state.height and
      state.state not in ["pinned", "unfixed"])
    return {
      action: "pin"
      scrollDirection: scrollDirection
      distanceScrolled: distanceScrolled
    }
  else
    return {
      action: "none"
      scrollDirection: scrollDirection
      distanceScrolled: distanceScrolled
    }
