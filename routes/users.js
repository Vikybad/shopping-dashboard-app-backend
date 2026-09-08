const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');
const { assertEmail, optionalString, requiredString } = require('../utils/validation');

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    { user: { id: user.id, role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );
}

function publicUser(user) {
  const value = user.toObject ? user.toObject() : { ...user };
  delete value.password;
  delete value.__v;
  return value;
}

router.post('/register', asyncHandler(async (req, res) => {
  const username = requiredString(req.body.username, 'Username', { min: 2, max: 60 });
  const email = assertEmail(req.body.email);
  const password = requiredString(req.body.password, 'Password', { min: 8, max: 72 });
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

  res.status(201).json({ token: createToken(user), user: publicUser(user) });
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

  res.json({ token: createToken(user), user: publicUser(user) });
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

module.exports = router;
