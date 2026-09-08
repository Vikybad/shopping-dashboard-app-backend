const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuthSession = require('../models/AuthSession');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const auth = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');
const { assertEmail, assertStrongPassword, optionalString, requiredString } = require('../utils/validation');
const { clearSessionCookie, issueSession, revokeSession, rotateSession } = require('../services/authService');
const { deleteEntireAccount, verifyAccountPassword } = require('../services/accountDataService');
const { sendPasswordResetOtp } = require('../services/emailService');
const { createOtp, hashOtp, matchesOtp } = require('../services/passwordResetService');

const router = express.Router();

function publicUser(user) {
  const value = user.toObject ? user.toObject() : { ...user };
  delete value.password;
  delete value.__v;
  return value;
}

router.post('/register', asyncHandler(async (req, res) => {
  const username = requiredString(req.body.username, 'Username', { min: 2, max: 60 });
  const email = assertEmail(req.body.email);
  const password = assertStrongPassword(req.body.password);
  const mobileNumber = optionalString(req.body.mobileNumber, 'Mobile number', 20);
  const storeName = optionalString(req.body.storeName, 'Store name', 80) || `${username}'s Store`;

  const identities = [{ email }, { username }];
  if (mobileNumber) identities.push({ mobileNumber });
  const existing = await User.findOne({ $or: identities });
  if (existing) throw new ApiError(409, 'An account with that email or username already exists.', 'USER_EXISTS');

  const user = await User.create({
    username,
    email,
    mobileNumber,
    storeName,
    password: await bcrypt.hash(password, 12),
  });

  const accessToken = await issueSession(user, req, res);
  res.status(201).json({ accessToken, token: accessToken, user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const login = requiredString(req.body.login, 'Email or username', { min: 2, max: 254 });
  const password = requiredString(req.body.password, 'Password', { min: 1, max: 72 });
  const user = await User.findOne({
    $or: [{ email: login.toLowerCase() }, { username: login }, { mobileNumber: login }],
  }).select('+password');

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new ApiError(401, 'The email/username or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  const accessToken = await issueSession(user, req, res);
  res.json({ accessToken, token: accessToken, user: publicUser(user) });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { accessToken, user } = await rotateSession(req, res);
  res.json({ accessToken, user: publicUser(user) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  await revokeSession(req, res);
  res.status(204).end();
}));

router.post('/password-reset/request', asyncHandler(async (req, res) => {
  const email = assertEmail(req.body.email);
  const user = await User.findOne({ email });
  const response = { message: 'If an account exists for that email, a reset code will arrive shortly.' };
  if (!user) return res.status(202).json(response);

  const otp = createOtp();
  await PasswordResetOtp.findOneAndUpdate(
    { userId: user._id },
    { email, otpHash: hashOtp(otp), attempts: 0, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    { upsert: true, new: true, runValidators: true },
  );
  try {
    await sendPasswordResetOtp({ email, name: user.username, otp });
  } catch (error) {
    await PasswordResetOtp.deleteOne({ userId: user._id });
    console.error(`Password reset email delivery failed: ${error.message}`);
  }
  return res.status(202).json(response);
}));

router.post('/password-reset/confirm', asyncHandler(async (req, res) => {
  const email = assertEmail(req.body.email);
  const otp = requiredString(req.body.otp, 'Reset code', { min: 6, max: 6 });
  if (!/^\d{6}$/.test(otp)) throw new ApiError(400, 'Reset code must contain six digits.', 'INVALID_OTP');
  const password = assertStrongPassword(req.body.password);
  const reset = await PasswordResetOtp.findOne({ email });
  if (!reset || reset.expiresAt <= new Date()) throw new ApiError(400, 'The reset code is invalid or expired.', 'INVALID_OTP');
  if (reset.attempts >= 5) throw new ApiError(429, 'Too many incorrect codes. Request a new one.', 'OTP_ATTEMPTS_EXCEEDED');
  if (!matchesOtp(otp, reset.otpHash)) {
    await PasswordResetOtp.updateOne({ _id: reset._id, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } });
    throw new ApiError(400, 'The reset code is invalid or expired.', 'INVALID_OTP');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const consumed = await PasswordResetOtp.findOneAndDelete(
        { _id: reset._id, otpHash: reset.otpHash, expiresAt: { $gt: new Date() } },
        { session },
      );
      if (!consumed) throw new ApiError(400, 'The reset code is invalid or expired.', 'INVALID_OTP');
      await User.updateOne(
        { _id: consumed.userId },
        { $set: { password: passwordHash }, $inc: { authVersion: 1 } },
        { session },
      );
      await AuthSession.deleteMany({ userId: consumed.userId }, { session });
    });
  } finally {
    await session.endSession();
  }
  res.json({ message: 'Password reset successfully. Sign in with your new password.' });
}));

router.get('/me', auth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  res.json({ data: user });
}));

router.patch('/me', auth, asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.username !== undefined) update.username = requiredString(req.body.username, 'Username', { min: 2, max: 60 });
  if (req.body.storeName !== undefined) update.storeName = requiredString(req.body.storeName, 'Store name', { min: 2, max: 80 });
  if (req.body.mobileNumber !== undefined) update.mobileNumber = optionalString(req.body.mobileNumber, 'Mobile number', 20);
  if (req.body.image !== undefined) update.image = optionalString(req.body.image, 'Image URL', 500);
  if (req.body.currency !== undefined) {
    if (!['INR', 'USD', 'EUR', 'GBP'].includes(req.body.currency)) throw new ApiError(400, 'Unsupported currency.', 'VALIDATION_ERROR');
    update.currency = req.body.currency;
  }
  const user = await User.findOneAndUpdate({ _id: req.user.id }, update, { new: true, runValidators: true });
  if (!user) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  res.json({ data: user });
}));

router.delete('/me', auth, asyncHandler(async (req, res) => {
  if (req.body.confirmation !== 'DELETE MY ACCOUNT') {
    throw new ApiError(400, 'Type DELETE MY ACCOUNT to confirm.', 'CONFIRMATION_REQUIRED');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await verifyAccountPassword(req.user.id, req.body.password, session);
      await deleteEntireAccount(req.user.id, session);
    });
  } finally {
    await session.endSession();
  }
  clearSessionCookie(res);
  res.status(204).end();
}));

module.exports = router;
