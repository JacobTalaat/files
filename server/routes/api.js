const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const path = require('path');
const { wrapAsync, httpError } = require('../lib/errors');

function createApiRouter({ config, service, auth, loginLimiter }) {
  const router = express.Router();

  const fileStorage = multer.diskStorage({
    destination(req, file, cb) {
      service.ensureDir(req.query.path)
        .then((dest) => cb(null, dest))
        .catch(cb);
    },
    filename(req, file, cb) {
      cb(null, file.originalname);
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

      const relDir = path.dirname(file.originalname);
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
      cb(null, path.basename(file.originalname));
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

  router.post('/login', loginLimiter, (req, res) => {
    if (req.body.password === config.password) {
      req.session.auth = true;
      res.json({ ok: true });
      return;
    }
    res.status(401).json({ error: 'Wrong password' });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get('/check', (req, res) => {
    res.json({ auth: !!req.session.auth });
  });

  router.get('/files', auth, wrapAsync(async (req, res) => {
    res.json(await service.listFiles(req.query.path || '/'));
  }));

  router.get('/bookmarks', auth, wrapAsync(async (req, res) => {
    res.json(await service.getBookmarks(process.env.BOOKMARKS));
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

  router.get('/preview', auth, wrapAsync(async (req, res) => {
    res.json(await service.getPreview(req.query.path));
  }));

  router.get('/raw', auth, wrapAsync(async (req, res) => {
    const { abs, stat } = await service.stat(req.query.path);
    if (stat.isDirectory()) throw httpError(400, 'Cannot open a directory');
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
    const paths = Array.isArray(req.body.paths) ? req.body.paths : [];
    if (!paths.length) throw httpError(400, 'No paths provided');

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

  router.put('/file', auth, wrapAsync(async (req, res) => {
    res.json(await service.writeFile(req.body.path, req.body.content));
  }));

  return router;
}

module.exports = {
  createApiRouter,
};
