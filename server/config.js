require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 9000),
  rootDir: process.env.ROOT_DIR || '/home/jacob',
  password: process.env.PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || 'development-secret',
  sessionCookieSecure: !!process.env.SESSION_COOKIE_SECURE,
  sessionDir: '.sessions',
  maxPreviewBytes: 500_000,
  maxEditableBytes: 1_000_000,
  maxUploadBytes: 500 * 1024 * 1024,
};
