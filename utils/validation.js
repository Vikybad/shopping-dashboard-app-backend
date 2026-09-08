const { ApiError } = require('../middleware/error');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredString(value, label, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new ApiError(400, `${label} must be between ${min} and ${max} characters.`, 'VALIDATION_ERROR');
  }
  return value.trim();
}

function optionalString(value, label, max = 500) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new ApiError(400, `${label} must be at most ${max} characters.`, 'VALIDATION_ERROR');
  }
  return value.trim();
}

function nonNegativeNumber(value, label, { integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new ApiError(400, `${label} must be a non-negative${integer ? ' integer' : ''}.`, 'VALIDATION_ERROR');
  }
  return parsed;
}

function assertEmail(value) {
  const email = requiredString(value, 'Email', { min: 5, max: 254 }).toLowerCase();
  if (!emailPattern.test(email)) throw new ApiError(400, 'Enter a valid email address.', 'VALIDATION_ERROR');
  return email;
}

function assertStrongPassword(value) {
  const password = requiredString(value, 'Password', { min: 10, max: 72 });
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new ApiError(400, 'Password must not exceed 72 UTF-8 bytes.', 'WEAK_PASSWORD');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, 'Password must include uppercase, lowercase, and numeric characters.', 'WEAK_PASSWORD');
  }
  return password;
}

function escapeRegex(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { assertEmail, assertStrongPassword, escapeRegex, nonNegativeNumber, optionalString, requiredString };
