const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const path = require('path');
const { wrapAsync, httpError } = require('../lib/errors');

function createApiRouter({ config, service, auth, loginLimiter }) {
  const router = express.Router();

  function normalizeUploadFolderRelativePath(originalname) {
    const raw = String(originalname || '').replace(/\\/g, '/');
    const segments = raw.split('/').filter(Boolean);
    if (!segments.length) throw httpError(400, 'Invalid upload path');
    for (const segment of segments) {
      service.assertSimpleName(segment);
    }
    return segments.join('/');
  }

  const fileStorage = multer.diskStorage({
    destination(req, file, cb) {
      service.ensureDir(req.query.path)
        .then((dest) => cb(null, dest))
        .catch(cb);
    },
    filename(req, file, cb) {
      try {
        cb(null, service.assertSimpleName(file.originalname));
      } catch (error) {
        cb(error);
      }
    },
  });

  const folderStorage = multer.diskStorage({
    destination(req, file, cb) {
      let basePath;
      try {
        basePath = service.safe(req.query.path);
      } catch (error) {
        cb(error);
        return;
      }

      let relativeUploadPath;
      try {
        relativeUploadPath = normalizeUploadFolderRelativePath(file.originalname);
      } catch (error) {
        cb(error);
        return;
      }

      const relDir = path.dirname(relativeUploadPath);
      const destination = relDir && relDir !== '.'
        ? path.join(basePath, relDir)
        : basePath;

      if (!service.withinRoot(destination)) {
        cb(httpError(403, 'Access denied'));
        return;
      }

      service.ensureDir(service.toClientPath(destination))
        .then((dir) => cb(null, dir))
        .catch(cb);
    },
    filename(req, file, cb) {
      try {
        const relativeUploadPath = normalizeUploadFolderRelativePath(file.originalname);
        cb(null, service.assertSimpleName(path.basename(relativeUploadPath)));
      } catch (error) {
        cb(error);
      }
    },
  });

  const uploadFiles = multer({
    storage: fileStorage,
    limits: { fileSize: config.maxUploadBytes },
  }).array('files');

  const uploadFolder = multer({
    storage: folderStorage,
    limits: { fileSize: config.maxUploadBytes },
  }).array('folder');

  router.post('/login', loginLimiter, (req, res, next) => {
    if (req.body.password === config.password) {
      req.session.regenerate((error) => {
        if (error) {
          next(error);
          return;
        }
        req.session.auth = true;
        res.json({ ok: true });
      });
      return;
    }
    res.status(401).json({ error: 'Wrong password' });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  router.get('/check', (req, res) => {
    res.json({ auth: !!req.session.auth });
  });

  router.get('/files', auth, wrapAsync(async (req, res) => {
    res.json(await service.listFiles(req.query.path || '/'));
  }));

  router.get('/bookmarks', auth, wrapAsync(async (req, res) => {
    const envResult = await service.getBookmarks(process.env.BOOKMARKS);
    const custom = await service.loadCustomBookmarks();
    const seen = new Set(envResult.bookmarks.map((b) => b.path));
    res.json({
      bookmarks: [
        ...envResult.bookmarks.map((b) => ({ ...b, custom: false })),
        ...custom.filter((b) => !seen.has(b.path)).map((b) => ({ ...b, custom: true })),
      ],
    });
  }));

  router.post('/bookmarks', auth, wrapAsync(async (req, res) => {
    const { action: bookmarkAction, path: bmPath, name: bmName } = req.body;
    let custom = await service.loadCustomBookmarks();
    if (bookmarkAction === 'add') {
      if (!custom.find((b) => b.path === bmPath)) {
        custom.push({ name: bmName || bmPath.split('/').pop(), path: bmPath });
      }
    } else if (bookmarkAction === 'remove') {
      custom = custom.filter((b) => b.path !== bmPath);
    } else if (bookmarkAction === 'rename') {
      const entry = custom.find((b) => b.path === bmPath);
      if (entry) entry.name = bmName;
    }
    await service.saveCustomBookmarks(custom);
    res.json({ ok: true });
  }));

  router.get('/disk', auth, wrapAsync(async (req, res) => {
    res.json(await service.getDiskUsage());
  }));

  router.get('/search', auth, wrapAsync(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 200) || 200, 500);
    res.json(await service.search(req.query.path || '/', req.query.q, limit));
  }));

  router.get('/hash', auth, wrapAsync(async (req, res) => {
    res.json(await service.getHash(req.query.path));
  }));

  router.get('/stat', auth, wrapAsync(async (req, res) => {
    res.json(await service.statInfo(req.query.path));
  }));

  router.get('/preview', auth, wrapAsync(async (req, res) => {
    res.json(await service.getPreview(req.query.path));
  }));

  router.get('/raw', auth, wrapAsync(async (req, res) => {
    const { abs, stat } = await service.stat(req.query.path);
    if (stat.isDirectory()) throw httpError(400, 'Cannot open a directory');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', service.getContentDisposition(req.query.path));
    res.type(service.getMime(req.query.path));
    res.sendFile(abs);
  }));

  router.post('/upload', auth, (req, res, next) => {
    uploadFiles(req, res, (error) => {
      if (error) next(error);
      else res.json({ ok: true, count: req.files.length });
    });
  });

  router.post('/upload-folder', auth, (req, res, next) => {
    uploadFolder(req, res, (error) => {
      if (error) next(error);
      else res.json({ ok: true, count: req.files.length });
    });
  });

  router.get('/download', auth, wrapAsync(async (req, res) => {
    const { abs, stat } = await service.stat(req.query.path);
    const filename = path.basename(abs);
    if (stat.isDirectory()) {
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename + '.zip') + '"');
      res.setHeader('Content-Type', 'application/zip');
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      archive.pipe(res);
      archive.directory(abs, filename);
      await archive.finalize();
      return;
    }
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(filename) + '"');
    res.sendFile(abs);
  }));

  router.post('/batch/delete', auth, wrapAsync(async (req, res) => {
    res.json(await service.batchDelete(req.body.paths));
  }));

  router.post('/batch/download', auth, wrapAsync(async (req, res) => {
    const paths = service.assertBatchPaths(req.body.paths);

    res.setHeader('Content-Disposition', 'attachment; filename="download.zip"');
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);

    for (const relPath of paths) {
      const { abs, stat } = await service.stat(relPath);
      const name = path.basename(abs) || 'item';
      if (stat.isDirectory()) archive.directory(abs, name);
      else archive.file(abs, { name });
    }

    await archive.finalize();
  }));

  router.post('/mkdir', auth, wrapAsync(async (req, res) => {
    res.json(await service.mkdir(req.body.path));
  }));

  router.delete('/delete', auth, wrapAsync(async (req, res) => {
    res.json(await service.remove(req.query.path));
  }));

  router.post('/rename', auth, wrapAsync(async (req, res) => {
    res.json(await service.rename(req.body.oldPath, req.body.newName));
  }));

  router.post('/move', auth, wrapAsync(async (req, res) => {
    res.json(await service.move(req.body.fromPath, req.body.toPath));
  }));

  router.post('/copy', auth, wrapAsync(async (req, res) => {
    res.json(await service.copy(req.body.fromPath, req.body.toPath));
  }));

  router.post('/touch', auth, wrapAsync(async (req, res) => {
    res.json(await service.touch(req.body.path));
  }));

  router.put('/file', auth, wrapAsync(async (req, res) => {
    res.json(await service.writeFile(req.body.path, req.body.content));
  }));

  return router;
}

module.exports = {
  createApiRouter,
};
