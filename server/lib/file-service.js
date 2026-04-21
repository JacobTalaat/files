const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');
const { execFile } = require('child_process');
const util = require('util');
const { pipeline } = require('stream/promises');
const { httpError } = require('./errors');

const execFileAsync = util.promisify(execFile);

function createFileService(config) {
  const rootResolved = path.resolve(config.rootDir);
  const withinRoot = (candidate) => candidate === rootResolved || candidate.startsWith(rootResolved + path.sep);

  function safe(relPath) {
    const abs = path.resolve(path.join(rootResolved, relPath || '/'));
    if (!withinRoot(abs)) {
      throw httpError(403, 'Access denied');
    }
    return abs;
  }

  function modeToPermString(mode, isDir) {
    const type = isDir ? 'd' : '-';
    const flags = ['r', 'w', 'x'];
    let output = type;
    for (let i = 8; i >= 0; i -= 1) {
      output += (mode & (1 << i)) ? flags[(8 - i) % 3] : '-';
    }
    return output;
  }

  function toClientPath(absPath) {
    const relative = path.relative(rootResolved, absPath).replace(/\\/g, '/');
    return '/' + relative;
  }

  async function listFiles(relPath) {
    const abs = safe(relPath);
    const entries = await fsp.readdir(abs, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const stat = await fsp.stat(path.join(abs, entry.name));
      return {
        name: entry.name,
        isDir: entry.isDirectory(),
        size: entry.isFile() ? stat.size : null,
        modified: stat.mtime,
        perms: modeToPermString(stat.mode, entry.isDirectory()),
      };
    }));

    files.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { files, path: relPath || '/' };
  }

  async function getDiskUsage() {
    const { stdout } = await execFileAsync('df', ['-kP', safe('/')]);
    const lines = stdout.trim().split('\n');
    if (lines.length < 2) throw httpError(500, 'Unable to read disk usage');
    const parts = lines[1].replace(/\s+/g, ' ').split(' ');
    const blocks = Number(parts[1]);
    const used = Number(parts[2]);
    const available = Number(parts[3]);
    const capacityPct = Number(String(parts[4]).replace('%', ''));
    return {
      blockSize: 1024,
      blocks,
      usedBlocks: used,
      availableBlocks: available,
      usedPercent: capacityPct,
      usedBytes: used * 1024,
      availableBytes: available * 1024,
      totalBytes: blocks * 1024,
    };
  }

  async function getBookmarks(bookmarksEnv) {
    const configured = String(bookmarksEnv || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    let relPaths;
    if (configured.length) {
      relPaths = configured;
    } else {
      const rootEntries = await fsp.readdir(safe('/'), { withFileTypes: true });
      relPaths = rootEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => '/' + entry.name)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 20);
    }

    return {
      bookmarks: [
        { name: 'ROOT', path: '/' },
        ...relPaths.map((relPath) => ({
          name: path.basename(relPath) || relPath,
          path: relPath.startsWith('/') ? relPath : '/' + relPath,
        })),
      ],
    };
  }

  async function search(baseRel, query, limit) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) throw httpError(400, 'Missing search query');

    const resolvedBase = baseRel ? String(baseRel) : '/';
    const stack = [safe(resolvedBase)];
    const results = [];

    while (stack.length && results.length < limit) {
      const directory = stack.pop();
      let entries;
      try {
        entries = await fsp.readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (results.length >= limit) break;
        const absPath = path.join(directory, entry.name);
        const nameLower = entry.name.toLowerCase();
        if (nameLower.includes(q)) {
          results.push({
            name: entry.name,
            path: toClientPath(absPath),
            isDir: entry.isDirectory(),
          });
        }
        if (entry.isDirectory()) stack.push(absPath);
      }
    }

    return {
      basePath: resolvedBase,
      q,
      limit,
      count: results.length,
      results,
    };
  }

  async function getHash(relPath) {
    const abs = safe(relPath);
    const stat = await fsp.stat(abs);
    if (stat.isDirectory()) throw httpError(400, 'Cannot hash a directory');
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(abs);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', resolve);
    });
    return { sha256: hash.digest('hex') };
  }

  async function getPreview(relPath) {
    const abs = safe(relPath);
    const stat = await fsp.stat(abs);
    if (stat.size > config.maxPreviewBytes) {
      throw httpError(400, 'File too large to preview');
    }
    const buffer = await fsp.readFile(abs);
    if (buffer.slice(0, 8192).indexOf(0) !== -1) {
      throw httpError(400, 'Binary file cannot be previewed');
    }
    return { content: buffer.toString('utf8') };
  }

  async function writeFile(relPath, content) {
    const abs = safe(relPath);
    const stat = await fsp.stat(abs);
    if (stat.isDirectory()) throw httpError(400, 'Cannot write to a directory');
    if (typeof content !== 'string') throw httpError(400, 'Missing content');
    if (Buffer.byteLength(content, 'utf8') > config.maxEditableBytes) {
      throw httpError(400, 'File too large');
    }
    await fsp.writeFile(abs, content, 'utf8');
    return { ok: true };
  }

  async function remove(relPath) {
    await fsp.rm(safe(relPath), { recursive: true, force: true });
    return { ok: true };
  }

  async function mkdir(relPath) {
    await fsp.mkdir(safe(relPath), { recursive: true });
    return { ok: true };
  }

  async function rename(oldPath, newName) {
    const source = safe(oldPath);
    const destination = path.join(path.dirname(source), newName);
    if (!withinRoot(destination)) throw httpError(403, 'Access denied');
    await fsp.rename(source, destination);
    return { ok: true };
  }

  async function copyRecursive(src, dest) {
    const stat = await fsp.stat(src);
    if (stat.isDirectory()) {
      await fsp.mkdir(dest, { recursive: true });
      const entries = await fsp.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        await copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
      }
      return;
    }

    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(fs.createReadStream(src), fs.createWriteStream(dest));
  }

  async function move(fromPath, toPath) {
    const source = safe(fromPath);
    const destination = safe(toPath);
    try {
      await fsp.rename(source, destination);
    } catch (error) {
      if (error && error.code === 'EXDEV') {
        await copyRecursive(source, destination);
        await fsp.rm(source, { recursive: true, force: true });
      } else {
        throw error;
      }
    }
    return { ok: true };
  }

  async function batchDelete(paths) {
    if (!Array.isArray(paths) || !paths.length) throw httpError(400, 'No paths provided');
    let deleted = 0;
    for (const relPath of paths) {
      await fsp.rm(safe(relPath), { recursive: true, force: true });
      deleted += 1;
    }
    return { ok: true, deleted };
  }

  async function stat(relPath) {
    const abs = safe(relPath);
    const value = await fsp.stat(abs);
    return { abs, stat: value };
  }

  async function ensureDir(relPath) {
    const abs = safe(relPath);
    await fsp.mkdir(abs, { recursive: true });
    return abs;
  }

  function getMime(relPath) {
    return mime.lookup(safe(relPath)) || 'application/octet-stream';
  }

  return {
    safe,
    stat,
    listFiles,
    getDiskUsage,
    getBookmarks,
    search,
    getHash,
    getPreview,
    writeFile,
    remove,
    mkdir,
    rename,
    move,
    batchDelete,
    ensureDir,
    getMime,
    toClientPath,
    rootResolved,
    withinRoot,
  };
}

module.exports = {
  createFileService,
};
