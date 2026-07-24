/**
 * Standard success envelope: { success: true, data, meta? }.
 * Use for all successful responses so the shape is uniform across the API.
 */
export function sendSuccess(res, data, statusCode = 200, meta = undefined) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}
