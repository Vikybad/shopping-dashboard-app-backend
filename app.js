const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const { getAllowedOrigins } = require('./config/env');
const { errorHandler, notFound } = require('./middleware/error');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const error = new Error('Origin is not allowed by CORS');
    error.status = 403;
    error.code = 'CORS_DENIED';
    return callback(error);
  },
}));
app.use(express.json({ limit: '100kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.', code: 'RATE_LIMITED' },
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'shopboard-api',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/users', require('./routes/users'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/tasks', require('./routes/tasks'));

app.get('/', (req, res) => {
  res.json({ service: 'Shopboard API', version: '1.0.0', health: '/api/health' });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
