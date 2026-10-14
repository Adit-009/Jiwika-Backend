/**
 * Generic validation middleware using Zod.
 * Parses and validates `req.body` against the provided schema.
 * Responds with 400 Bad Request on failure.
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  // Sanitize req.body to contain only validated and parsed data
  req.body = result.data;
  next();
};

module.exports = validate;
