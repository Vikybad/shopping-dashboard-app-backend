const test = require('node:test');
const assert = require('node:assert/strict');

test('password reset codes are six digits and compare through a keyed hash', () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-24-characters';
  const { createOtp, hashOtp, matchesOtp } = require('../services/passwordResetService');
  const otp = createOtp();
  const hash = hashOtp(otp);
  assert.match(otp, /^\d{6}$/);
  assert.equal(hash.length, 64);
  assert.equal(matchesOtp(otp, hash), true);
  assert.equal(matchesOtp(otp === '999999' ? '888888' : '999999', hash), false);
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
