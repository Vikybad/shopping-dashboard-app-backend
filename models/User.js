const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 60 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
  mobileNumber: { type: String, trim: true, unique: true, sparse: true },
  image: { type: String },
  storeName: { type: String, trim: true, default: 'My Store' },
  currency: { type: String, enum: ['INR', 'USD', 'EUR', 'GBP'], default: 'INR' },
  role: { type: String, enum: ['ADMIN'], default: 'ADMIN' },
}, { timestamps: true });

UserSchema.set('toJSON', {
  transform(doc, result) {
    delete result.password;
    delete result.__v;
    return result;
  },
});

module.exports = mongoose.model('User', UserSchema);
