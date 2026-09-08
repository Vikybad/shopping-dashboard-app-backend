const crypto = require('crypto');

function createOrderNumber() {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `ORD-${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

module.exports = createOrderNumber;
