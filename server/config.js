require('dotenv').config();

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function assertRootDir(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('ROOT_DIR is required');
  }
  return normalized;
}

function assertRequiredString(name, value, minLength) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  if (normalized.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters long`);
  }
  if (['change-me', 'your_password_here', 'your_secret_here', 'development-secret'].includes(normalized)) {
    throw new Error(`${name} must not use a placeholder value`);
  }
  return normalized;
}

const config = {
  port: Number(process.env.PORT || 9000),
  rootDir: assertRootDir(process.env.ROOT_DIR),
  password: assertRequiredString('PASSWORD', process.env.PASSWORD, 8),
  sessionSecret: assertRequiredString('SESSION_SECRET', process.env.SESSION_SECRET, 24),
  sessionCookieSecure: isEnabled(process.env.SESSION_COOKIE_SECURE),
  sessionDir: '.sessions',
  maxPreviewBytes: 500_000,
  maxEditableBytes: 1_000_000,
  maxUploadBytes: 500 * 1024 * 1024,
};

module.exports = config;
