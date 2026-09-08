require('dotenv').config();
const { verifyEmailTransport } = require('../services/emailService');

verifyEmailTransport()
  .then(() => console.log('SMTP connection and authentication succeeded.'))
  .catch((error) => {
    console.error(`SMTP verification failed: ${error.message}`);
    process.exitCode = 1;
  });
