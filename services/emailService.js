const nodemailer = require('nodemailer');
const { ApiError } = require('../middleware/error');

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new ApiError(503, 'Password reset email is not configured.', 'EMAIL_NOT_CONFIGURED');
  }
  const port = Number(SMTP_PORT);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

async function sendPasswordResetOtp({ email, name, otp }) {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `Shopboard <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Shopboard password reset code',
    text: `Hi ${name}, your Shopboard password reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1d2433"><h2>Reset your Shopboard password</h2><p>Hi ${escapeHtml(name)},</p><p>Use this one-time code to reset your password:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#5b5bd6">${otp}</p><p>This code expires in 10 minutes. If you did not request a reset, you can safely ignore this email.</p></div>`,
  });
}

async function verifyEmailTransport() {
  return getTransporter().verify();
}

module.exports = { escapeHtml, sendPasswordResetOtp, verifyEmailTransport };
