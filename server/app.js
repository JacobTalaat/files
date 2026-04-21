const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const FileStore = require('session-file-store')(session);
const { createFileService } = require('./lib/file-service');
const { createApiRouter } = require('./routes/api');

function createApp(config) {
  const app = express();
  const service = createFileService(config);
  const publicDir = path.join(process.cwd(), 'public');

  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        objectSrc: ["'self'", 'blob:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json());
  app.use(session({
    store: new FileStore({
      path: path.join(process.cwd(), config.sessionDir),
      retries: 0,
      ttl: 86400,
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.sessionCookieSecure,
    },
  }));

  const auth = (req, res, next) => (
    req.session.auth
      ? next()
      : res.status(401).json({ error: 'Unauthorized' })
  );
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' },
  });

  app.use(express.static(publicDir));
  app.use('/api', createApiRouter({ config, service, auth, loginLimiter }));

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err && err.status ? err.status : 500;
    const publicMessage = err && err.publicMessage
      ? err.publicMessage
      : (status >= 500 ? 'Internal server error' : 'Request failed');
    console.error('[error]', req.method, req.originalUrl, err);
    res.status(status).json({ error: publicMessage });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

module.exports = {
  createApp,
};
