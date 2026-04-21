const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createFileService } = require('../server/lib/file-service');
const { createApiRouter } = require('../server/routes/api');

function getRouteHandlers(router, routePath, method) {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== routePath) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack.map((entry) => entry.handle);
  }
  throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
}

function createResponseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    finished: false,
    clearedCookie: null,
    type(value) {
      this.headers['content-type'] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    json(payload) {
      this.body = payload;
      this.finished = true;
      return this;
    },
    clearCookie(name) {
      this.clearedCookie = name;
      this.headers['set-cookie'] = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return this;
    },
    sendFile(filePath) {
      this.sentFile = filePath;
      this.finished = true;
      return this;
    },
  };
}

async function runSingleHandler(handler, req, res) {
  await new Promise((resolve, reject) => {
    try {
      const value = handler(req, res, (error) => (error ? reject(error) : resolve()));
      Promise.resolve(value).then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
}

async function runHandlers(handlers, req, res) {
  let index = 0;

  async function dispatch(error) {
    if (error) throw error;
    const handler = handlers[index];
    index += 1;
    if (!handler) return;

    await new Promise((resolve, reject) => {
      let resolved = false;
      function done(err) {
        if (resolved) return;
        resolved = true;
        if (err) reject(err);
        else resolve();
      }

      try {
        const value = handler(req, res, done);
        Promise.resolve(value).then(() => {
          if (!resolved) resolve();
        }, reject);
      } catch (err) {
        reject(err);
      }
    });

    if (!res.finished) {
      await dispatch();
    }
  }

  await dispatch();
}

async function createFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-root-'));
  const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-sessions-'));
  await fs.writeFile(path.join(rootDir, 'unsafe.html'), '<script>window.x=1</script>', 'utf8');
  await fs.writeFile(path.join(rootDir, 'safe.pdf'), '%PDF-1.4\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'note.txt'), 'hello', 'utf8');

  const config = {
    port: 0,
    rootDir,
    password: 'testpass123',
    sessionSecret: 'test-session-secret-1234567890',
    sessionCookieSecure: false,
    sessionDir,
    maxPreviewBytes: 500_000,
    maxEditableBytes: 1_000_000,
    maxUploadBytes: 500 * 1024 * 1024,
  };

  const service = createFileService(config);
  const auth = (req, res, next) => (req.session && req.session.auth
    ? next()
    : res.status(401).json({ error: 'Unauthorized' }));
  const loginLimiter = (req, res, next) => next();
  const router = createApiRouter({ config, service, auth, loginLimiter });

  async function cleanup() {
    await fs.rm(rootDir, { recursive: true, force: true });
    await fs.rm(sessionDir, { recursive: true, force: true });
  }

  return { config, rootDir, service, router, cleanup };
}

function getRouteHandler(router, routePath, method) {
  return getRouteHandlers(router, routePath, method)[0];
}

test('protected routes require auth and logout clears the session cookie', async () => {
  const fixture = await createFixture();
  try {
    const filesHandlers = getRouteHandlers(fixture.router, '/files', 'get');
    const loginHandlers = getRouteHandlers(fixture.router, '/login', 'post');
    const logoutHandlers = getRouteHandlers(fixture.router, '/logout', 'post');

    const unauthReq = { query: { path: '/' }, session: {} };
    const unauthRes = createResponseRecorder();
    await runHandlers(filesHandlers, unauthReq, unauthRes);
    assert.equal(unauthRes.statusCode, 401);

    let regenerated = false;
    let destroyed = false;
    const session = {
      auth: false,
      regenerate(callback) {
        regenerated = true;
        this.auth = false;
        callback();
      },
      destroy(callback) {
        destroyed = true;
        this.auth = false;
        callback();
      },
    };

    const loginReq = { body: { password: fixture.config.password }, session };
    const loginRes = createResponseRecorder();
    await runHandlers(loginHandlers, loginReq, loginRes);
    assert.equal(loginRes.statusCode, 200);
    assert.equal(session.auth, true);
    assert.equal(regenerated, true);

    const authReq = { query: { path: '/' }, session };
    const authRes = createResponseRecorder();
    await runHandlers(filesHandlers, authReq, authRes);
    assert.equal(authRes.statusCode, 200);

    const logoutReq = { session };
    const logoutRes = createResponseRecorder();
    await runHandlers(logoutHandlers, logoutReq, logoutRes);
    assert.equal(logoutRes.statusCode, 200);
    assert.equal(destroyed, true);
    assert.equal(logoutRes.clearedCookie, 'connect.sid');
  } finally {
    await fixture.cleanup();
  }
});

test('raw file serving forces downloads for active content and allows inline safe media', async () => {
  const fixture = await createFixture();
  try {
    assert.match(fixture.service.getContentDisposition('/unsafe.html'), /^attachment;/);
    assert.match(fixture.service.getContentDisposition('/safe.pdf'), /^inline;/);
  } finally {
    await fixture.cleanup();
  }
});

test('rename rejects path separators and destination collisions', async () => {
  const fixture = await createFixture();
  try {
    await fs.writeFile(path.join(fixture.rootDir, 'existing.txt'), 'data', 'utf8');

    await assert.rejects(() => fixture.service.rename('/note.txt', '../escape.txt'), /path separators/);
    await assert.rejects(() => fixture.service.rename('/note.txt', 'existing.txt'), /already exists/);
  } finally {
    await fixture.cleanup();
  }
});

test('config rejects missing required root dir and secrets', async () => {
  const envKeys = ['PORT', 'ROOT_DIR', 'PASSWORD', 'SESSION_SECRET', 'SESSION_COOKIE_SECURE'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  try {
    delete require.cache[require.resolve('../server/config')];
    process.env.PORT = '9000';
    process.env.ROOT_DIR = '';
    assert.throws(() => require('../server/config'), /ROOT_DIR is required/);

    delete require.cache[require.resolve('../server/config')];
    process.env.ROOT_DIR = '/tmp/files-root';
    process.env.PASSWORD = '';
    process.env.SESSION_SECRET = '';
    assert.throws(() => require('../server/config'), /PASSWORD is required/);

    delete require.cache[require.resolve('../server/config')];
    process.env.ROOT_DIR = '/tmp/files-root';
    process.env.PASSWORD = 'testpass123';
    process.env.SESSION_SECRET = 'test-session-secret-1234567890';
    const config = require('../server/config');
    assert.equal(config.rootDir, '/tmp/files-root');
  } finally {
    delete require.cache[require.resolve('../server/config')];
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
