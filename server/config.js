require('dotenv').config();

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
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

function optionalString(value) {
  const normalized = String(value || '').trim();
  return normalized || '';
}

function assertRootDir(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error('ROOT_DIR is required');
  }
  return normalized;
}

function getAuthConfig(password, sessionSecret) {
  const normalizedPassword = optionalString(password);
  const normalizedSecret = optionalString(sessionSecret);

  if (!normalizedPassword) {
    return {
      authRequired: false,
      password: '',
      sessionSecret: normalizedSecret || 'local-dev-session-secret',
    };
  }

  return {
    authRequired: true,
    password: assertRequiredString('PASSWORD', normalizedPassword, 12),
    sessionSecret: assertRequiredString('SESSION_SECRET', normalizedSecret, 24),
  };
}

const authConfig = getAuthConfig(process.env.PASSWORD, process.env.SESSION_SECRET);

const config = {
  port: Number(process.env.PORT || 9000),
  rootDir: assertRootDir(process.env.ROOT_DIR),
  authRequired: authConfig.authRequired,
  password: authConfig.password,
  sessionSecret: authConfig.sessionSecret,
  sessionCookieSecure: isEnabled(process.env.SESSION_COOKIE_SECURE),
  sessionDir: '.sessions',
  maxPreviewBytes: 500_000,
  maxEditableBytes: 1_000_000,
  maxUploadBytes: 500 * 1024 * 1024,
};

module.exports = config;
