const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const AuthSession = require('../models/AuthSession');
const User = require('../models/User');
const { getCookieOptions } = require('../config/env');
const { ApiError } = require('../middleware/error');

const REFRESH_COOKIE = 'shopboard_refresh';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user) {
  return jwt.sign(
    { user: { id: user.id, role: user.role, version: user.authVersion || 0 } },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m' },
  );
}

async function issueSession(user, req, res) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const cookieOptions = getCookieOptions();
  await AuthSession.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + cookieOptions.maxAge),
    userAgent: req.get('user-agent')?.slice(0, 300),
  });
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  return createAccessToken(user);
}

async function rotateSession(req, res) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (!refreshToken) throw new ApiError(401, 'Your session has expired.', 'REFRESH_REQUIRED');
  const session = await AuthSession.findOneAndDelete({ tokenHash: hashToken(refreshToken) });
  if (!session || session.expiresAt <= new Date()) {
    clearSessionCookie(res);
    throw new ApiError(401, 'Your session has expired.', 'INVALID_REFRESH_TOKEN');
  }
  const user = await User.findById(session.userId);
  if (!user) {
    clearSessionCookie(res);
    throw new ApiError(401, 'Your session has expired.', 'INVALID_REFRESH_TOKEN');
  }
  return { accessToken: await issueSession(user, req, res), user };
}

async function revokeSession(req, res) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) await AuthSession.deleteOne({ tokenHash: hashToken(refreshToken) });
  clearSessionCookie(res);
}

function clearSessionCookie(res) {
  const { maxAge, ...options } = getCookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

module.exports = { REFRESH_COOKIE, clearSessionCookie, createAccessToken, hashToken, issueSession, revokeSession, rotateSession };
