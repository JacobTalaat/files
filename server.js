require('dotenv').config();
const express = require('express');
const multer = require('multer');
const session = require('express-session');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9000;
const ROOT_DIR = process.env.ROOT_DIR || '/home/jacob';
const PASSWORD = process.env.PASSWORD;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { maxAge: 86400000, httpOnly: true } }));

const auth = (req, res, next) => req.session.auth ? next() : res.status(401).json({ error: 'Unauthorized' });

const safe = (relPath) => {
  const abs = path.resolve(path.join(ROOT_DIR, relPath || '/'));
  if (!abs.startsWith(path.resolve(ROOT_DIR))) throw new Error('Access denied');
  return abs;
};

app.post('/api/login', (req, res) => {
  if (req.body.password === PASSWORD) { req.session.auth = true; res.json({ ok: true }); }
  else res.status(401).json({ error: 'Wrong password' });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/check', (req, res) => res.json({ auth: !!req.session.auth }));

app.get('/api/files', auth, (req, res) => {
  try {
    const abs = safe(req.query.path);
    const items = fs.readdirSync(abs, { withFileTypes: true });
    const files = items.map(item => {
      const stat = fs.statSync(path.join(abs, item.name));
      return { name: item.name, isDir: item.isDirectory(), size: item.isFile() ? stat.size : null, modified: stat.mtime };
    }).sort((a, b) => { if (a.isDir !== b.isDir) return a.isDir ? -1 : 1; return a.name.localeCompare(b.name); });
    res.json({ files, path: req.query.path || '/' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dest = safe(req.query.path);
      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    } catch(e) { cb(e); }
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
app.post('/api/upload', auth, multer({ storage: fileStorage }).array('files'), (req, res) => res.json({ ok: true, count: req.files.length }));

const folderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const basePath = safe(req.query.path);
      const relPath = file.originalname;
      const relDir = path.dirname(relPath);
      const destDir = (relDir && relDir !== '.') ? path.join(basePath, relDir) : basePath;
      if (!destDir.startsWith(path.resolve(ROOT_DIR))) return cb(new Error('Access denied'));
      fs.mkdirSync(destDir, { recursive: true });
      cb(null, destDir);
    } catch(e) { cb(e); }
  },
  filename: (req, file, cb) => cb(null, path.basename(file.originalname))
});
app.post('/api/upload-folder', auth, multer({ storage: folderStorage }).array('folder'), (req, res) => res.json({ ok: true, count: req.files.length }));

app.get('/api/download', auth, (req, res) => {
  try {
    const abs = safe(req.query.path);
    const filename = path.basename(abs);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename + '.zip') + '"');
      res.setHeader('Content-Type', 'application/zip');
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', e => { if (!res.headersSent) res.status(500).end(); });
      archive.pipe(res);
      archive.directory(abs, filename);
      archive.finalize();
    } else {
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
      res.sendFile(abs);
    }
  } catch(e) { res.status(403).json({ error: e.message }); }
});

app.get('/api/preview', auth, (req, res) => {
  try {
    const abs = safe(req.query.path);
    const stat = fs.statSync(abs);
    if (stat.size > 500000) return res.status(400).json({ error: 'File too large to preview' });
    const buf = fs.readFileSync(abs);
    // Reject binary files by checking for null bytes in the first 8KB
    if (buf.slice(0, 8192).indexOf(0) !== -1) return res.status(400).json({ error: 'Binary file cannot be previewed' });
    res.json({ content: buf.toString('utf8') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mkdir', auth, (req, res) => {
  try { fs.mkdirSync(safe(req.body.path), { recursive: true }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/delete', auth, (req, res) => {
  try { fs.rmSync(safe(req.query.path), { recursive: true }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rename', auth, (req, res) => {
  try {
    const oldAbs = safe(req.body.oldPath);
    const newAbs = path.join(path.dirname(oldAbs), req.body.newName);
    if (!newAbs.startsWith(path.resolve(ROOT_DIR))) return res.status(403).json({ error: 'Access denied' });
    fs.renameSync(oldAbs, newAbs);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log('Jacob File Manager running on port ' + PORT));