const test = require('node:test');
const assert = require('node:assert/strict');
const { authVersionFilter } = require('../middleware/auth');

test('version zero tokens accept legacy accounts without a persisted auth version', () => {
  assert.deepEqual(authVersionFilter(0), {
    $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }],
  });
  assert.deepEqual(authVersionFilter(undefined), {
    $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }],
  });
});

test('nonzero versions require an exact match and malformed versions are rejected', () => {
  assert.deepEqual(authVersionFilter(2), { authVersion: 2 });
  assert.equal(authVersionFilter(-1), null);
  assert.equal(authVersionFilter('0'), null);
});
