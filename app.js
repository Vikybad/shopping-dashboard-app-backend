const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const mongoose = require('mongoose');
const { getAllowedOrigins } = require('./config/env');
const { errorHandler, notFound } = require('./middleware/error');

const app = express();

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    const unrestrictedLocalDevelopment = allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production';
    if (!origin || unrestrictedLocalDevelopment || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const error = new Error('Origin is not allowed by CORS');
    error.status = 403;
    error.code = 'CORS_DENIED';
    return callback(error);
  },
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.', code: 'RATE_LIMITED' },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many password reset attempts. Please try again later.', code: 'RATE_LIMITED' },
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
app.use('/api/users/refresh', authLimiter);
app.use('/api/users/password-reset', passwordResetLimiter);
app.use('/api/users', require('./routes/users'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/data', require('./routes/data'));

app.get('/', (req, res) => {
  res.json({ service: 'Shopboard API', version: '1.0.0', health: '/api/health' });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
