const mongoose = require('mongoose');

const AuthSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  lastUsedAt: { type: Date, default: Date.now },
  userAgent: { type: String, maxlength: 300 },
}, { timestamps: true });

module.exports = mongoose.model('AuthSession', AuthSessionSchema);
