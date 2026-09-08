class ApiError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} was not found.`, code: 'NOT_FOUND' });
}

function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'An unexpected error occurred.';
  let details = error.details;

  if (error.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Some fields are invalid.';
    details = Object.values(error.errors).map((item) => item.message);
  } else if (error.name === 'CastError') {
    status = 400;
    code = 'INVALID_ID';
    message = 'The supplied identifier is invalid.';
  } else if (error.code === 11000) {
    status = 409;
    code = 'DUPLICATE_RESOURCE';
    message = `A record with that ${Object.keys(error.keyPattern || {})[0] || 'value'} already exists.`;
  } else if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    status = 400;
    code = 'INVALID_JSON';
    message = 'The request body contains invalid JSON.';
  }

  if (status >= 500) console.error(error);
  res.status(status).json({ message, code, ...(details ? { details } : {}) });
}

module.exports = { ApiError, asyncHandler, errorHandler, notFound };
