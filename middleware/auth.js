const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

function authVersionFilter(version) {
  const normalizedVersion = version ?? 0;
  if (!Number.isSafeInteger(normalizedVersion) || normalizedVersion < 0) return null;

  // Accounts created before session versioning do not have this field persisted.
  if (normalizedVersion === 0) {
    return { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] };
  }
  return { authVersion: normalizedVersion };
}

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
    const versionFilter = authVersionFilter(decoded.user?.version);
    if (!decoded.user?.id || !versionFilter) {
      return res.status(401).json({ message: 'Your session is invalid or has expired.', code: 'INVALID_TOKEN' });
    }
    const userExists = await User.exists({ _id: decoded.user.id, ...versionFilter });
    if (!userExists) {
      return res.status(401).json({ message: 'Your session is invalid or has expired.', code: 'INVALID_TOKEN' });
    }
    req.user = decoded.user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Your session is invalid or has expired.', code: 'INVALID_TOKEN' });
  }
};

module.exports.authVersionFilter = authVersionFilter;
