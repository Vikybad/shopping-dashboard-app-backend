require('dotenv').config();
const serverless = require('serverless-http');
const app = require('../../app');
const connectDB = require('../../config/db');
const { assertRuntimeConfig } = require('../../config/env');

const expressHandler = serverless(app);

function normalizePath(event) {
  const marker = '/.netlify/functions/api/';
  if (event.path?.includes(marker)) {
    const suffix = event.path.slice(event.path.indexOf(marker) + marker.length);
    return { ...event, path: `/api/${suffix}`, rawPath: `/api/${suffix}` };
  }
  return event;
}

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  assertRuntimeConfig();
  await connectDB();
  return expressHandler(normalizePath(event), context);
};
