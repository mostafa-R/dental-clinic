import ApiError from '../utils/ApiError.js';

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const target = source === 'query' ? req.query : req.body;
    const result = schema.safeParse(target);
    if (!result.success) {
      const details = result.error.flatten().fieldErrors;
      return next(ApiError.badRequest('Validation failed', details));
    }
    if (source === 'query') {
      req.validatedQuery = result.data;
    } else {
      req.validatedBody = result.data;
      req.body = result.data;
    }
    return next();
  };
}
