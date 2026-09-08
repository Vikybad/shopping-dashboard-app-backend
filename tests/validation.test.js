const test = require('node:test');
const assert = require('node:assert/strict');
const { assertEmail, assertStrongPassword, escapeRegex, nonNegativeNumber, requiredString } = require('../utils/validation');

test('normalizes valid input', () => {
  assert.equal(assertEmail('  OWNER@EXAMPLE.COM '), 'owner@example.com');
  assert.equal(requiredString('  Widget  ', 'Name'), 'Widget');
  assert.equal(nonNegativeNumber('12', 'Stock', { integer: true }), 12);
});

test('rejects invalid numbers and safely escapes search expressions', () => {
  assert.throws(() => nonNegativeNumber(-1, 'Stock'), /non-negative/);
  assert.equal(escapeRegex('ORD.*(1)'), 'ORD\\.\\*\\(1\\)');
});

test('requires a long mixed-case password with a number', () => {
  assert.equal(assertStrongPassword('StrongPass1'), 'StrongPass1');
  assert.throws(() => assertStrongPassword('alllowercase1'), (error) => error.code === 'WEAK_PASSWORD');
  assert.throws(() => assertStrongPassword('Short1A'), /between 10 and 72/);
});
