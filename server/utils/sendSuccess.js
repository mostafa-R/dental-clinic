/**
 * Standard success envelope: { success: true, data }.
 * Use for all successful responses so the shape is uniform across the API.
 */
export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}
