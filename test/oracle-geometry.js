// The page geometry of the headroom oracle, shared by the model and the page
// (test/oracle-page-jsdom.js). The window scrolls a
// 3000px page in a 768px viewport; the div scrolls 2500px in a 500px box with
// a 10px border; a horizontal scrollbar, when there is one, is 15px.
export const PAGE_HEIGHT = 3000
export const VIEWPORT = 768
export const DIV = { client: 500, offset: 520, scroll: 2500 }
export const SCROLLBAR = 15

// A ResizeObserver entry for an element whose border and content boxes are
// `border` and `content` px tall. Browsers have shipped three shapes:
// borderBoxSize as an array (the standard), as a single object (Firefox
// before 92), or missing (Safari before 15.4).
export const entryOf = (target, border, content, shape) => {
  const record = {
    target,
    contentRect: {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      width: 0,
      height: content,
      right: 0,
      bottom: content,
    },
  }
  if (shape === 'array') {
    record.borderBoxSize = [{ blockSize: border, inlineSize: 0 }]
    record.contentBoxSize = [{ blockSize: content, inlineSize: 0 }]
  } else if (shape === 'object') {
    record.borderBoxSize = { blockSize: border, inlineSize: 0 }
    record.contentBoxSize = { blockSize: content, inlineSize: 0 }
  }
  return record
}
