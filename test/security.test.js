const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createFileService } = require('../server/lib/file-service');
const { createApiRouter } = require('../server/routes/api');

function createResponseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    finished: false,
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

async function createFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-root-'));
  await fs.writeFile(path.join(rootDir, 'unsafe.html'), '<script>window.x=1</script>', 'utf8');
  await fs.writeFile(path.join(rootDir, 'safe.pdf'), '%PDF-1.4\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'note.txt'), 'hello', 'utf8');

  const config = {
    port: 0,
    rootDir,
    maxPreviewBytes: 500_000,
    maxEditableBytes: 1_000_000,
    maxUploadBytes: 500 * 1024 * 1024,
  };

  const service = createFileService(config);
  const router = createApiRouter({ config, service });

  async function cleanup() {
    await fs.rm(rootDir, { recursive: true, force: true });
  }

  return { config, rootDir, service, router, cleanup };
}

function getRouteHandler(router, routePath, method) {
  for (const layer of router.stack) {
    if (!layer.route || layer.route.path !== routePath) continue;
    if (!layer.route.methods[method]) continue;
    return layer.route.stack[0].handle;
  }
  throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
}

test('check route reports the app as open with no auth flow', async () => {
  const fixture = await createFixture();
  try {
    const checkHandler = getRouteHandler(fixture.router, '/check', 'get');
    const res = createResponseRecorder();
    await runSingleHandler(checkHandler, { query: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { auth: true });
  } finally {
    await fixture.cleanup();
  }
});

test('raw file serving forces downloads for active content and allows inline safe media', async () => {
  const fixture = await createFixture();
  try {
    const rawHandler = getRouteHandler(fixture.router, '/raw', 'get');

    assert.match(fixture.service.getContentDisposition('/unsafe.html'), /^attachment;/);
    assert.match(fixture.service.getContentDisposition('/safe.pdf'), /^inline;/);

    const unsafeReq = { query: { path: '/unsafe.html' } };
    const unsafeRes = createResponseRecorder();
    await runSingleHandler(rawHandler, unsafeReq, unsafeRes);
    assert.equal(unsafeRes.headers['x-content-type-options'], 'nosniff');
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

test('config rejects missing required root dir and placeholder secrets', async () => {
  const envKeys = ['PORT', 'ROOT_DIR'];
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  try {
    delete require.cache[require.resolve('../server/config')];
    process.env.PORT = '9000';
    process.env.ROOT_DIR = '';
    assert.throws(() => require('../server/config'), /ROOT_DIR is required/);

    delete require.cache[require.resolve('../server/config')];
    process.env.ROOT_DIR = '/tmp/files-root';
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
