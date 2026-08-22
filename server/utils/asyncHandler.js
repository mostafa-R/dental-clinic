// Returns the promise so callers (Express 5's promise handling and direct
// invocations, e.g. tests) can await completion and observe rejections.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
