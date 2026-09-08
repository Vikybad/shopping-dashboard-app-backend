const bcrypt = require('bcryptjs');
const AuthSession = require('../models/AuthSession');
const InventoryMovement = require('../models/InventoryMovement');
const Order = require('../models/Order');
const PasswordResetOtp = require('../models/PasswordResetOtp');
const Product = require('../models/Product');
const Task = require('../models/Tasks');
const User = require('../models/User');
const { ApiError } = require('../middleware/error');

async function verifyAccountPassword(userId, password, session) {
  const user = await User.findById(userId).select('+password').session(session || null);
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password))) {
    throw new ApiError(401, 'Password confirmation failed.', 'INVALID_PASSWORD');
  }
  return user;
}

async function deleteOperationalData(userId, session) {
  // The MongoDB driver does not support parallel operations on one transaction session.
  await InventoryMovement.deleteMany({ userId }).session(session);
  await Order.deleteMany({ userId }).session(session);
  await Product.deleteMany({ userId }).session(session);
  await Task.deleteMany({ userId }).session(session);
}

async function deleteEntireAccount(userId, session) {
  await deleteOperationalData(userId, session);
  await AuthSession.deleteMany({ userId }).session(session);
  await PasswordResetOtp.deleteMany({ userId }).session(session);
  await User.deleteOne({ _id: userId }).session(session);
}

module.exports = { deleteEntireAccount, deleteOperationalData, verifyAccountPassword };
