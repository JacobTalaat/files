require('dotenv').config();
const express = require('express');
const multer = require('multer');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const FileStore = require('session-file-store')(session);
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { pipeline } = require('stream/promises');
const mime = require('mime-types');

const app = express();
const PORT = process.env.PORT || 9000;
const ROOT_DIR = process.env.ROOT_DIR || '/home/jacob';
const PASSWORD = process.env.PASSWORD;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, '.sessions'),
    retries: 0,
    ttl: 86400,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 86400000,
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.SESSION_COOKIE_SECURE,
  }
}));

const auth = (req, res, next) => req.session.auth ? next() : res.status(401).json({ error: 'Unauthorized' });

const httpError = (status, publicMessage) => {
  const err = new Error(publicMessage || 'Error');
  err.status = status;
  err.publicMessage = publicMessage || 'Error';
  return err;
};

const modeToPermString = (mode, isDir) => {
  const type = isDir ? 'd' : '-';
  const flags = ['r', 'w', 'x'];
  let out = type;
  for (let i = 8; i >= 0; i--) {
    out += (mode & (1 << i)) ? flags[(8 - i) % 3] : '-';
  }
  return out;
};

const safe = (relPath) => {
  const abs = path.resolve(path.join(ROOT_DIR, relPath || '/'));
  if (!abs.startsWith(path.resolve(ROOT_DIR))) throw httpError(403, 'Access denied');
  return abs;
};

const wrapAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const copyRecursive = async (src, dest) => {
  const stat = await fsp.stat(src);
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const ent of entries) {
      await copyRecursive(path.join(src, ent.name), path.join(dest, ent.name));
    }
  } else {
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(fs.createReadStream(src), fs.createWriteStream(dest));
  }
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

app.post('/api/login', loginLimiter, (req, res) => {
  if (req.body.password === PASSWORD) { req.session.auth = true; res.json({ ok: true }); }
  else res.status(401).json({ error: 'Wrong password' });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/check', (req, res) => res.json({ auth: !!req.session.auth }));

app.get('/api/hash', auth, wrapAsync(async (req, res) => {
  const abs = safe(req.query.path);
  const stat = await fsp.stat(abs);
  if (stat.isDirectory()) throw httpError(400, 'Cannot hash a directory');
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(abs);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', resolve);
  });
  res.json({ sha256: hash.digest('hex') });
}));

app.get('/api/disk', auth, wrapAsync(async (req, res) => {
  // df output is stable on macOS/Linux with -kP (POSIX format, 1K blocks)
  const { stdout } = await execFileAsync('df', ['-kP', safe('/')]);
  const lines = stdout.trim().split('\n');
  if (lines.length < 2) throw httpError(500, 'Unable to read disk usage');
  const parts = lines[1].replace(/\s+/g, ' ').split(' ');
  // Filesystem 1024-blocks Used Available Capacity Mounted on
  const blocks = Number(parts[1]);
  const used = Number(parts[2]);
  const available = Number(parts[3]);
  const capacityPct = Number(String(parts[4]).replace('%', ''));
  res.json({
    blockSize: 1024,
    blocks,
    usedBlocks: used,
    availableBlocks: available,
    usedPercent: capacityPct,
    usedBytes: used * 1024,
    availableBytes: available * 1024,
    totalBytes: blocks * 1024,
  });
}));

app.get('/api/search', auth, wrapAsync(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) throw httpError(400, 'Missing search query');

  const baseRel = req.query.path ? String(req.query.path) : '/';
  const baseAbs = safe(baseRel);
  const limit = Math.min(Number(req.query.limit || 200) || 200, 500);

  const results = [];
  const stack = [baseAbs];

  while (stack.length && results.length < limit) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      if (results.length >= limit) break;
      const nameLower = ent.name.toLowerCase();
      const absPath = path.join(dir, ent.name);
      const relPath = '/' + path.relative(path.resolve(ROOT_DIR), absPath).replace(/\\/g, '/');
      if (nameLower.includes(q)) {
        results.push({ name: ent.name, path: relPath, isDir: ent.isDirectory() });
      }
      if (ent.isDirectory()) stack.push(absPath);
    }
  }

  res.json({ basePath: baseRel, q, limit, count: results.length, results });
}));

app.get('/api/raw', auth, wrapAsync(async (req, res) => {
  const abs = safe(req.query.path);
  const stat = await fsp.stat(abs);
  if (stat.isDirectory()) throw httpError(400, 'Cannot open a directory');
  const type = mime.lookup(abs) || 'application/octet-stream';
  res.type(type);
  res.sendFile(abs);
}));

app.get('/api/bookmarks', auth, wrapAsync(async (req, res) => {
  const configured = (process.env.BOOKMARKS || '').split(',').map(s => s.trim()).filter(Boolean);
  let relPaths;
  if (configured.length) {
    relPaths = configured;
  } else {
    const rootAbs = safe('/');
    const entries = await fsp.readdir(rootAbs, { withFileTypes: true });
    relPaths = entries
      .filter(e => e.isDirectory())
      .map(e => '/' + e.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 20);
  }
  const bookmarks = [
    { name: 'ROOT', path: '/' },
    ...relPaths.map((p) => ({ name: path.basename(p) || p, path: p.startsWith('/') ? p : '/' + p }))
  ];
  res.json({ bookmarks });
}));

app.get('/api/files', auth, wrapAsync(async (req, res) => {
  const abs = safe(req.query.path);
  const items = await fsp.readdir(abs, { withFileTypes: true });
  const files = await Promise.all(items.map(async (item) => {
    const stat = await fsp.stat(path.join(abs, item.name));
    return {
      name: item.name,
      isDir: item.isDirectory(),
      size: item.isFile() ? stat.size : null,
      modified: stat.mtime,
      perms: modeToPermString(stat.mode, item.isDirectory()),
    };
  }));
  files.sort((a, b) => { if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; return a.name.localeCompare(b.name); });
  res.json({ files, path: req.query.path || '/' });
}));

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dest;
    try { dest = safe(req.query.path); }
    catch (e) { return cb(e); }
    fsp.mkdir(dest, { recursive: true }).then(() => cb(null, dest)).catch(cb);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
app.post(
  '/api/upload',
  auth,
  multer({ storage: fileStorage, limits: { fileSize: 500 * 1024 * 1024 } }).array('files'),
  (req, res) => res.json({ ok: true, count: req.files.length })
);

const folderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let basePath;
    try { basePath = safe(req.query.path); }
    catch (e) { return cb(e); }
    const relPath = file.originalname;
    const relDir = path.dirname(relPath);
    const destDir = (relDir && relDir !== '.') ? path.join(basePath, relDir) : basePath;
    if (!destDir.startsWith(path.resolve(ROOT_DIR))) return cb(new Error('Access denied'));
    fsp.mkdir(destDir, { recursive: true }).then(() => cb(null, destDir)).catch(cb);
  },
  filename: (req, file, cb) => cb(null, path.basename(file.originalname))
});
app.post(
  '/api/upload-folder',
  auth,
  multer({ storage: folderStorage, limits: { fileSize: 500 * 1024 * 1024 } }).array('folder'),
  (req, res) => res.json({ ok: true, count: req.files.length })
);

app.get('/api/download', auth, wrapAsync(async (req, res) => {
  const abs = safe(req.query.path);
  const filename = path.basename(abs);
  const stat = await fsp.stat(abs);
  if (stat.isDirectory()) {
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename + '.zip') + '"');
    res.setHeader('Content-Type', 'application/zip');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);
    archive.directory(abs, filename);
    await archive.finalize();
  } else {
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
    res.sendFile(abs);
  }
}));

app.post('/api/batch/delete', auth, wrapAsync(async (req, res) => {
  const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
  if (!paths.length) throw httpError(400, 'No paths provided');
  let deleted = 0;
  for (const p of paths) {
    const abs = safe(p);
    await fsp.rm(abs, { recursive: true, force: true });
    deleted++;
  }
  res.json({ ok: true, deleted });
}));

app.post('/api/batch/download', auth, wrapAsync(async (req, res) => {
  const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
  if (!paths.length) throw httpError(400, 'No paths provided');

  res.setHeader('Content-Disposition', 'attachment; filename="download.zip"');
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
  archive.pipe(res);

  for (const p of paths) {
    const abs = safe(p);
    const name = path.basename(abs) || 'item';
    const stat = await fsp.stat(abs);
    if (stat.isDirectory()) archive.directory(abs, name);
    else archive.file(abs, { name });
  }

  await archive.finalize();
}));

app.get('/api/preview', auth, wrapAsync(async (req, res) => {
  const abs = safe(req.query.path);
  const stat = await fsp.stat(abs);
  if (stat.size > 500000) return res.status(400).json({ error: 'File too large to preview' });
  const buf = await fsp.readFile(abs);
  // Reject binary files by checking for null bytes in the first 8KB
  if (buf.slice(0, 8192).indexOf(0) !== -1) return res.status(400).json({ error: 'Binary file cannot be previewed' });
  res.json({ content: buf.toString('utf8') });
}));

app.post('/api/mkdir', auth, wrapAsync(async (req, res) => {
  await fsp.mkdir(safe(req.body.path), { recursive: true });
  res.json({ ok: true });
}));

app.delete('/api/delete', auth, wrapAsync(async (req, res) => {
  await fsp.rm(safe(req.query.path), { recursive: true, force: true });
  res.json({ ok: true });
}));

app.post('/api/rename', auth, wrapAsync(async (req, res) => {
  const oldAbs = safe(req.body.oldPath);
  const newAbs = path.join(path.dirname(oldAbs), req.body.newName);
  if (!newAbs.startsWith(path.resolve(ROOT_DIR))) return res.status(403).json({ error: 'Access denied' });
  await fsp.rename(oldAbs, newAbs);
  res.json({ ok: true });
}));

app.post('/api/move', auth, wrapAsync(async (req, res) => {
  const fromAbs = safe(req.body.fromPath);
  const toAbs = safe(req.body.toPath);
  try {
    await fsp.rename(fromAbs, toAbs);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      await copyRecursive(fromAbs, toAbs);
      await fsp.rm(fromAbs, { recursive: true, force: true });
    } else {
      throw e;
    }
  }
  res.json({ ok: true });
}));

app.put('/api/file', auth, wrapAsync(async (req, res) => {
  const abs = safe(req.body.path);
  const stat = await fsp.stat(abs);
  if (stat.isDirectory()) throw httpError(400, 'Cannot write to a directory');
  const content = req.body.content;
  if (typeof content !== 'string') throw httpError(400, 'Missing content');
  if (Buffer.byteLength(content, 'utf8') > 1_000_000) throw httpError(400, 'File too large');
  await fsp.writeFile(abs, content, 'utf8');
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err && err.status ? err.status : 500;
  const publicMessage = err && err.publicMessage
    ? err.publicMessage
    : (status >= 500 ? 'Internal server error' : 'Request failed');
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(status).json({ error: publicMessage });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log('Jacob File Manager running on port ' + PORT));