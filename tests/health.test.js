const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../app');

test('health endpoint exposes service state without requiring authentication', async (context) => {
  const server = app.listen(0);
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'shopboard-api');
  assert.equal(body.database, 'disconnected');

  const protectedResponse = await fetch(`http://127.0.0.1:${port}/api/orders`);
  const protectedBody = await protectedResponse.json();
  assert.equal(protectedResponse.status, 401);
  assert.equal(protectedBody.code, 'AUTH_REQUIRED');

  const missingResponse = await fetch(`http://127.0.0.1:${port}/api/not-real`);
  const missingBody = await missingResponse.json();
  assert.equal(missingResponse.status, 404);
  assert.equal(missingBody.code, 'NOT_FOUND');
});
