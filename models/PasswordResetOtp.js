const mongoose = require('mongoose');

const PasswordResetOtpSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  email: { type: String, required: true, lowercase: true },
  otpHash: { type: String, required: true },
  attempts: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

module.exports = mongoose.model('PasswordResetOtp', PasswordResetOtpSchema);
