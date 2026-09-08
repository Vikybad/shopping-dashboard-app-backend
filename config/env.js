function assertRuntimeConfig() {
  const missing = [];
  if (!(process.env.MONGO_URI || process.env.MONGO_PUBLIC_URL)) missing.push('MONGO_URI');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) missing.push('JWT_SECRET (minimum 24 characters)');
  if (missing.length) throw new Error(`Missing or invalid environment configuration: ${missing.join(', ')}`);
}

function getAllowedOrigins() {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getPort() {
  const value = Number(process.env.PORT || process.env.BACKEND_PORT || 5000);
  return Number.isInteger(value) && value > 0 ? value : 5000;
}

module.exports = { assertRuntimeConfig, getAllowedOrigins, getPort };
