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
    await new Promise((resolve) => setTimeout(resolve, 15));
    if (!res.finished) {
      await dispatch();
    }
  }
  await dispatch();
}

async function createFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-root-'));
  const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'files-sessions-'));

  await fs.mkdir(path.join(rootDir, 'subdir'));
  await fs.writeFile(path.join(rootDir, 'hello.txt'), 'hello world', 'utf8');
  await fs.writeFile(path.join(rootDir, 'data.json'), '{"key":"value"}', 'utf8');
  await fs.writeFile(path.join(rootDir, 'binary.dat'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
  await fs.writeFile(path.join(rootDir, 'subdir', 'nested.txt'), 'nested content', 'utf8');
  await fs.writeFile(path.join(rootDir, 'subdir', 'deep.json'), '{"deep":true}', 'utf8');

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
  const auth = (req, res, next) => next();
  const loginLimiter = (req, res, next) => next();
  const router = createApiRouter({ config, service, auth, loginLimiter });

  async function cleanup() {
    await fs.rm(rootDir, { recursive: true, force: true });
    await fs.rm(sessionDir, { recursive: true, force: true });
  }

  return { config, rootDir, service, router, cleanup };
}

test('search finds files by partial name match', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.search('/', 'hello', 100);
    assert.equal(result.count, 1);
    assert.equal(result.results[0].name, 'hello.txt');
    assert.equal(result.results[0].isDir, false);
    assert.match(result.results[0].path, /hello\.txt$/);
  } finally {
    await fixture.cleanup();
  }
});

test('search finds files in nested directories', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.search('/', 'nested', 100);
    assert.equal(result.count, 1);
    assert.equal(result.results[0].name, 'nested.txt');
    assert.match(result.results[0].path, /subdir\/nested\.txt$/);
  } finally {
    await fixture.cleanup();
  }
});

test('search is case-insensitive', async () => {
  const fixture = await createFixture();
  try {
    const upper = await fixture.service.search('/', 'HELLO', 100);
    const lower = await fixture.service.search('/', 'hello', 100);
    assert.equal(upper.count, lower.count);
    assert.equal(upper.count, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('search returns empty results for non-matching query', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.search('/', 'zzznonexistent', 100);
    assert.equal(result.count, 0);
    assert.deepEqual(result.results, []);
  } finally {
    await fixture.cleanup();
  }
});

test('search respects limit parameter', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.search('/', '.txt', 1);
    assert.equal(result.count, 1);
    assert.ok(result.results.length <= 1);
  } finally {
    await fixture.cleanup();
  }
});

test('search rejects empty query', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(() => fixture.service.search('/', '', 100), /Missing search query/);
    await assert.rejects(() => fixture.service.search('/', '  ', 100), /Missing search query/);
  } finally {
    await fixture.cleanup();
  }
});

test('search API route returns results', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/search', 'get');
    const req = { query: { path: '/', q: 'json' }, session: { auth: true } };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.count >= 2);
    const names = res.body.results.map((r) => r.name);
    assert.ok(names.includes('data.json'));
    assert.ok(names.includes('deep.json'));
  } finally {
    await fixture.cleanup();
  }
});

test('move file to new location', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.move('/hello.txt', '/subdir/hello.txt');
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'hello.txt')));
    const content = await fs.readFile(path.join(fixture.rootDir, 'subdir', 'hello.txt'), 'utf8');
    assert.equal(content, 'hello world');
  } finally {
    await fixture.cleanup();
  }
});

test('move directory', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.move('/subdir', '/subdir2');
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'subdir')));
    const content = await fs.readFile(path.join(fixture.rootDir, 'subdir2', 'nested.txt'), 'utf8');
    assert.equal(content, 'nested content');
  } finally {
    await fixture.cleanup();
  }
});

test('move rejects if destination already exists', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.move('/hello.txt', '/data.json'),
      /already exists/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('move to same path is a no-op', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.move('/hello.txt', '/hello.txt');
    const content = await fs.readFile(path.join(fixture.rootDir, 'hello.txt'), 'utf8');
    assert.equal(content, 'hello world');
  } finally {
    await fixture.cleanup();
  }
});

test('move rejects paths outside root', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.move('/hello.txt', '/../../etc/passwd'),
      /denied/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('move API route moves a file', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/move', 'post');
    const req = {
      body: { fromPath: '/hello.txt', toPath: '/subdir/moved.txt' },
      session: { auth: true },
    };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    const content = await fs.readFile(path.join(fixture.rootDir, 'subdir', 'moved.txt'), 'utf8');
    assert.equal(content, 'hello world');
  } finally {
    await fixture.cleanup();
  }
});

test('preview returns text file content', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.getPreview('/hello.txt');
    assert.equal(result.content, 'hello world');
  } finally {
    await fixture.cleanup();
  }
});

test('preview returns nested file content', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.getPreview('/subdir/nested.txt');
    assert.equal(result.content, 'nested content');
  } finally {
    await fixture.cleanup();
  }
});

test('preview rejects binary files', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.getPreview('/binary.dat'),
      /Binary file/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('preview rejects directories', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.getPreview('/subdir'),
      /too large|directory|Cannot/i
    );
  } finally {
    await fixture.cleanup();
  }
});

test('preview rejects files exceeding max size', async () => {
  const fixture = await createFixture();
  try {
    const bigFile = path.join(fixture.rootDir, 'big.txt');
    const content = 'x'.repeat(fixture.config.maxPreviewBytes + 100);
    await fs.writeFile(bigFile, content, 'utf8');
    await assert.rejects(
      () => fixture.service.getPreview('/big.txt'),
      /too large/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('preview API route returns content', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/preview', 'get');
    const req = { query: { path: '/hello.txt' }, session: { auth: true } };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.content, 'hello world');
  } finally {
    await fixture.cleanup();
  }
});

test('delete removes a single file', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.remove('/hello.txt');
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'hello.txt')));
    const data = await fs.readFile(path.join(fixture.rootDir, 'data.json'), 'utf8');
    assert.ok(data);
  } finally {
    await fixture.cleanup();
  }
});

test('delete removes a directory recursively', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.remove('/subdir');
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'subdir')));
    const content = await fs.readFile(path.join(fixture.rootDir, 'hello.txt'), 'utf8');
    assert.equal(content, 'hello world');
  } finally {
    await fixture.cleanup();
  }
});

test('batch delete removes multiple paths', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.batchDelete(['/hello.txt', '/data.json']);
    assert.equal(result.deleted, 2);
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'hello.txt')));
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'data.json')));
    const content = await fs.readFile(path.join(fixture.rootDir, 'subdir', 'nested.txt'), 'utf8');
    assert.equal(content, 'nested content');
  } finally {
    await fixture.cleanup();
  }
});

test('delete API route removes a file', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/delete', 'delete');
    const req = { query: { path: '/hello.txt' }, session: { auth: true } };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'hello.txt')));
  } finally {
    await fixture.cleanup();
  }
});

test('batch delete API route removes multiple files', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/batch/delete', 'post');
    const req = {
      body: { paths: ['/hello.txt', '/binary.dat'] },
      session: { auth: true },
    };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'hello.txt')));
    await assert.rejects(() => fs.access(path.join(fixture.rootDir, 'binary.dat')));
  } finally {
    await fixture.cleanup();
  }
});

test('batch delete rejects empty paths array', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.batchDelete([]),
      /No paths provided/
    );
    await assert.rejects(
      () => fixture.service.batchDelete(null),
      /No paths provided/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('write file updates content and preview reflects changes', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.writeFile('/hello.txt', 'updated content');
    const result = await fixture.service.getPreview('/hello.txt');
    assert.equal(result.content, 'updated content');
  } finally {
    await fixture.cleanup();
  }
});

test('write file rejects directories', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.writeFile('/subdir', 'content'),
      /directory/i
    );
  } finally {
    await fixture.cleanup();
  }
});

test('write file rejects missing content', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.writeFile('/hello.txt', null),
      /Missing content/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('touch creates a new empty file', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.touch('/newfile.txt');
    assert.deepEqual(result, { ok: true });
    const content = await fs.readFile(path.join(fixture.rootDir, 'newfile.txt'), 'utf8');
    assert.equal(content, '');
  } finally {
    await fixture.cleanup();
  }
});

test('touch rejects if file already exists', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.touch('/hello.txt'),
      /already exists/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('touch rejects path outside root', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.touch('/../../etc/evil'),
      /denied/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('touch API route creates a file', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/touch', 'post');
    const req = { body: { path: '/created.txt' }, session: { auth: true } };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    const content = await fs.readFile(path.join(fixture.rootDir, 'created.txt'), 'utf8');
    assert.equal(content, '');
  } finally {
    await fixture.cleanup();
  }
});

test('copy duplicates a file', async () => {
  const fixture = await createFixture();
  try {
    const result = await fixture.service.copy('/hello.txt', '/hello-copy.txt');
    assert.deepEqual(result, { ok: true });
    const original = await fs.readFile(path.join(fixture.rootDir, 'hello.txt'), 'utf8');
    const copy = await fs.readFile(path.join(fixture.rootDir, 'hello-copy.txt'), 'utf8');
    assert.equal(original, copy);
  } finally {
    await fixture.cleanup();
  }
});

test('copy duplicates a directory recursively', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.copy('/subdir', '/subdir-backup');
    const content = await fs.readFile(path.join(fixture.rootDir, 'subdir-backup', 'nested.txt'), 'utf8');
    assert.equal(content, 'nested content');
    const original = await fs.readFile(path.join(fixture.rootDir, 'subdir', 'nested.txt'), 'utf8');
    assert.equal(original, 'nested content');
  } finally {
    await fixture.cleanup();
  }
});

test('copy rejects if destination already exists', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.copy('/hello.txt', '/data.json'),
      /already exists/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('copy rejects same source and destination', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.copy('/hello.txt', '/hello.txt'),
      /same/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('copy rejects paths outside root', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      () => fixture.service.copy('/hello.txt', '/../../tmp/evil'),
      /denied/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('copy API route copies a file', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/copy', 'post');
    const req = {
      body: { fromPath: '/hello.txt', toPath: '/hello-dup.txt' },
      session: { auth: true },
    };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    const content = await fs.readFile(path.join(fixture.rootDir, 'hello-dup.txt'), 'utf8');
    assert.equal(content, 'hello world');
  } finally {
    await fixture.cleanup();
  }
});

test('statInfo returns file metadata', async () => {
  const fixture = await createFixture();
  try {
    const info = await fixture.service.statInfo('/hello.txt');
    assert.equal(info.name, 'hello.txt');
    assert.equal(info.isDir, false);
    assert.equal(info.size, 11);
    assert.equal(info.perms.length, 10);
    assert.ok(info.modified);
    assert.equal(info.path, '/hello.txt');
  } finally {
    await fixture.cleanup();
  }
});

test('statInfo returns directory metadata', async () => {
  const fixture = await createFixture();
  try {
    const info = await fixture.service.statInfo('/subdir');
    assert.equal(info.name, 'subdir');
    assert.equal(info.isDir, true);
    assert.equal(info.size, null);
    assert.ok(info.perms.startsWith('d'));
  } finally {
    await fixture.cleanup();
  }
});

test('stat API route returns formatted info', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/stat', 'get');
    const req = { query: { path: '/hello.txt' }, session: { auth: true } };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.name, 'hello.txt');
    assert.equal(res.body.isDir, false);
  } finally {
    await fixture.cleanup();
  }
});

test('custom bookmarks can be added and loaded', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.saveCustomBookmarks([{ name: 'projects', path: '/projects' }]);
    const loaded = await fixture.service.loadCustomBookmarks();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].name, 'projects');
    assert.equal(loaded[0].path, '/projects');
  } finally {
    await fixture.cleanup();
  }
});

test('custom bookmarks can be removed', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.saveCustomBookmarks([
      { name: 'a', path: '/a' },
      { name: 'b', path: '/b' },
    ]);
    let loaded = await fixture.service.loadCustomBookmarks();
    assert.equal(loaded.length, 2);
    await fixture.service.saveCustomBookmarks(loaded.filter((b) => b.path !== '/a'));
    loaded = await fixture.service.loadCustomBookmarks();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].name, 'b');
  } finally {
    await fixture.cleanup();
  }
});

test('bookmarks API returns merged env + custom bookmarks', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.saveCustomBookmarks([{ name: 'custom-dir', path: '/custom-dir' }]);
    const handlers = getRouteHandlers(fixture.router, '/bookmarks', 'get');
    const req = { query: {}, session: { auth: true } };
    const res = createResponseRecorder();
    await runHandlers(handlers, req, res);
    assert.equal(res.statusCode, 200);
    const names = res.body.bookmarks.map((b) => b.name);
    assert.ok(names.includes('ROOT'));
    assert.ok(names.includes('custom-dir'));
  } finally {
    await fixture.cleanup();
  }
});

test('bookmarks POST adds and removes bookmarks', async () => {
  const fixture = await createFixture();
  try {
    const handlers = getRouteHandlers(fixture.router, '/bookmarks', 'post');
    const addReq = {
      body: { action: 'add', path: '/my-folder', name: 'My Folder' },
      session: { auth: true },
    };
    const addRes = createResponseRecorder();
    await runHandlers(handlers, addReq, addRes);
    assert.equal(addRes.statusCode, 200);

    let custom = await fixture.service.loadCustomBookmarks();
    assert.equal(custom.length, 1);
    assert.equal(custom[0].name, 'My Folder');

    const removeReq = {
      body: { action: 'remove', path: '/my-folder' },
      session: { auth: true },
    };
    const removeRes = createResponseRecorder();
    await runHandlers(handlers, removeReq, removeRes);
    assert.equal(removeRes.statusCode, 200);

    custom = await fixture.service.loadCustomBookmarks();
    assert.equal(custom.length, 0);
  } finally {
    await fixture.cleanup();
  }
});

test('listFiles hides the bookmarks metadata file', async () => {
  const fixture = await createFixture();
  try {
    await fixture.service.saveCustomBookmarks([{ name: 'test', path: '/test' }]);
    const result = await fixture.service.listFiles('/');
    const names = result.files.map((f) => f.name);
    assert.ok(!names.includes('.files-bookmarks.json'));
  } finally {
    await fixture.cleanup();
  }
});
