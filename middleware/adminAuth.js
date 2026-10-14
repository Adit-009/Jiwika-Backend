/**
 * Middleware that validates the admin password from the request body.
 * Expects `req.body.password` to match `process.env.ADMIN_PASSWORD`.
 */
function adminAuth(req, res, next) {
  const { password } = req.body;

  if (!password) {
    return res.status(401).json({ error: 'Password is required' });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;

  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = adminAuth;
