const crypto = require('crypto');

function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(String(otp)).digest('hex');
}

function matchesOtp(otp, expectedHash) {
  const actual = Buffer.from(hashOtp(otp), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { createOtp, hashOtp, matchesOtp };
