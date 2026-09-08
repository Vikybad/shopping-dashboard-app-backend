require('dotenv').config();
const connectDB = require('./config/db');
const app = require('./app');
const { assertRuntimeConfig, getPort } = require('./config/env');

let server;

async function start() {
  assertRuntimeConfig();
  await connectDB();
  const port = getPort();
  server = app.listen(port, () => console.log(`Shopboard API listening on port ${port}`));
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const mongoose = require('mongoose');
  await mongoose.connection.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((error) => {
  console.error('Failed to start Shopboard API:', error.message);
  process.exit(1);
});
