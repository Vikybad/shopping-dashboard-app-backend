const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

module.exports = async function auth(req, res, next) {
  const authorization = req.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : req.get('x-auth-token');

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.', code: 'AUTH_REQUIRED' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userExists = await User.exists({ _id: decoded.user.id, authVersion: decoded.user.version || 0 });
    if (!userExists) {
      return res.status(401).json({ message: 'Your session is invalid or has expired.', code: 'INVALID_TOKEN' });
    }
    req.user = decoded.user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Your session is invalid or has expired.', code: 'INVALID_TOKEN' });
  }
};
