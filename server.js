const express = require('express');
const multer = require('multer');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9000;
const ROOT_DIR = '/home/jacob';
const PASSWORD = '1242005'; // ← CHANGE THIS

app.use(express.json());
app.use(session({ secret: 'jacob-files-2026', resave: false, saveUninitialized: false, cookie: { maxAge: 86400000 } }));

const auth = (req, res, next) => req.session.auth ? next() : res.status(401).json({ error: 'Unauthorized' });

const safe = (relPath) => {
  const abs = path.resolve(path.join(ROOT_DIR, relPath || '/'));
  if (!abs.startsWith(path.resolve(ROOT_DIR))) throw new Error('Access denied');
  return abs;
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
};

// Auth
app.post('/api/login', (req, res) => {
  if (req.body.password === PASSWORD) { req.session.auth = true; res.json({ ok: true }); }
  else res.status(401).json({ error: 'Wrong password' });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });

app.get('/api/check', (req, res) => res.json({ auth: !!req.session.auth }));

// List files
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

// Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => { try { cb(null, safe(req.query.path)); } catch(e) { cb(e); } },
  filename: (req, file, cb) => cb(null, file.originalname)
});
app.post('/api/upload', auth, multer({ storage }).array('files'), (req, res) => res.json({ ok: true, count: req.files.length }));

// Download
app.get('/api/download', auth, (req, res) => {
  try {
    const abs = safe(req.query.path);
    const filename = path.basename(abs);
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.sendFile(abs);
  } catch(e) { res.status(403).json({ error: e.message }); }
});

// Preview text file
app.get('/api/preview', auth, (req, res) => {
  try {
    const abs = safe(req.query.path);
    const content = fs.readFileSync(abs, 'utf8');
    res.json({ content });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Mkdir
app.post('/api/mkdir', auth, (req, res) => {
  try { fs.mkdirSync(safe(req.body.path), { recursive: true }); res.json({ ok: true }); }  catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete
app.delete('/api/delete', auth, (req, res) => {
  try { fs.rmSync(safe(req.query.path), { recursive: true }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// Rename
app.post('/api/rename', auth, (req, res) => {
  try {
    const oldAbs = safe(req.body.oldPath);
    const newAbs = path.join(path.dirname(oldAbs), req.body.newName);
    if (!newAbs.startsWith(path.resolve(ROOT_DIR))) return res.status(403).json({ error: 'Access denied' });
    fs.renameSync(oldAbs, newAbs);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Frontend
app.get('*', (req, res) => res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jacob's Files</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #080b0f;
    --surface: #0d1117;
    --surface2: #161b22;
    --border: #21262d;
    --accent: #58a6ff;
    --accent2: #3fb950;
    --danger: #f85149;
    --text: #e6edf3;
    --dim: #8b949e;
    --font: 'JetBrains Mono', monospace;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100vh; overflow: hidden; }

  /* LOGIN */
  #login-screen {
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh;
    background: radial-gradient(ellipse at 50% 0%, #0d1f3c 0%, var(--bg) 70%);
  }

  .login-box {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 48px 40px; width: 380px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.6);
    animation: slideUp 0.4s ease;
  }

  @keyframes slideUp { from { opacity:0; transform: translateY(20px); } to { opacity:1; transform: translateY(0); } }

  .login-logo { font-size: 13px; color: var(--accent); letter-spacing: 4px; text-transform: uppercase; margin-bottom: 8px; }
  .login-title { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .login-sub { font-size: 12px; color: var(--dim); margin-bottom: 32px; }

  .login-box input[type="password"] {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px 16px; color: var(--text);
    font-family: var(--font); font-size: 14px; margin-bottom: 12px;
    outline: none; transition: border-color 0.2s;
  }
  .login-box input[type="password"]:focus { border-color: var(--accent); }

  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; font-family: var(--font); font-size: 13px; font-weight: 500; transition: all 0.15s; }
  .btn-primary { background: var(--accent); color: #0d1117; width: 100%; justify-content: center; padding: 12px; }
  .btn-primary:hover { opacity: 0.85; }
  .btn-ghost { background: transparent; color: var(--dim); border: 1px solid var(--border); }
  .btn-ghost:hover { background: var(--surface2); color: var(--text); border-color: var(--dim); }
  .btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--border); }
  .btn-danger:hover { background: rgba(248,81,73,0.1); border-color: var(--danger); }
  .btn-green { background: var(--accent2); color: #0d1117; }
  .btn-green:hover { opacity: 0.85; }

  .login-error { color: var(--danger); font-size: 12px; margin-top: 8px; display: none; }

  /* APP */
  #app { display: none; flex-direction: column; height: 100vh; }

  /* TOPBAR */
  .topbar {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px; background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .topbar-logo { font-size: 11px; font-weight: 700; color: var(--accent); letter-spacing: 3px; text-transform: uppercase; margin-right: 8px; }

  .breadcrumb { display: flex; align-items: center; gap: 4px; flex: 1; font-size: 13px; color: var(--dim); overflow: hidden; }
  .breadcrumb span { cursor: pointer; padding: 4px 6px; border-radius: 4px; white-space: nowrap; }
  .breadcrumb span:hover { background: var(--surface2); color: var(--text); }
  .breadcrumb span.current { color: var(--text); cursor: default; }
  .breadcrumb span.current:hover { background: none; }
  .sep { color: var(--border); }

  .topbar-actions { display: flex; gap: 8px; margin-left: auto; }

  /* SEARCH */
  .search-wrap { position: relative; }
  .search-wrap input {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 7px 12px 7px 32px; color: var(--text); font-family: var(--font); font-size: 12px;
    width: 200px; outline: none; transition: border-color 0.2s;
  }
  .search-wrap input:focus { border-color: var(--accent); }
  .search-wrap::before { content: '⌕'; position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--dim); font-size: 16px; }

  /* MAIN */
  .main { display: flex; flex: 1; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: 220px; background: var(--surface); border-right: 1px solid var(--border);
    padding: 16px 12px; flex-shrink: 0; overflow-y: auto;
  }

  .sidebar-section { margin-bottom: 20px; }
  .sidebar-label { font-size: 10px; font-weight: 600; color: var(--dim); letter-spacing: 2px; text-transform: uppercase; padding: 0 8px; margin-bottom: 6px; }
  .sidebar-item {
    display: flex; align-items: center; gap: 8px; padding: 7px 8px;
    border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--dim);
    transition: all 0.15s;
  }
  .sidebar-item:hover, .sidebar-item.active { background: var(--surface2); color: var(--text); }
  .sidebar-item .icon { font-size: 14px; }

  /* FILES AREA */
  .files-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .files-toolbar {
    display: flex; align-items: center; gap: 8px; padding: 10px 16px;
    border-bottom: 1px solid var(--border); background: var(--surface); flex-shrink: 0;
  }

  .view-toggle { display: flex; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .view-btn { padding: 5px 10px; background: none; border: none; color: var(--dim); cursor: pointer; font-size: 14px; transition: all 0.15s; }
  .view-btn.active { background: var(--surface2); color: var(--text); }

  .sort-select {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 5px 10px; color: var(--dim); font-family: var(--font); font-size: 12px;
    outline: none; cursor: pointer;
  }

  .file-count { margin-left: auto; font-size: 11px; color: var(--dim); }

  /* FILE GRID / LIST */
  .files-container { flex: 1; overflow-y: auto; padding: 16px; position: relative; }

  .files-container.drag-over::after {
    content: '⬆ Drop files here to upload'; position: absolute; inset: 0;
    background: rgba(88,166,255,0.05); border: 2px dashed var(--accent);
    border-radius: 8px; display: flex; align-items: center; justify-content: center;
    font-size: 16px; color: var(--accent); pointer-events: none; z-index: 10;
  }

  /* LIST VIEW */
  .file-list { width: 100%; }
  .file-list-header {
    display: grid; grid-template-columns: auto 1fr 100px 160px 60px;
    gap: 8px; padding: 6px 12px; font-size: 10px; color: var(--dim);
    text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .file-row {
    display: grid; grid-template-columns: auto 1fr 100px 160px 60px;
    gap: 8px; padding: 8px 12px; border-radius: 6px; cursor: pointer;
    align-items: center; transition: background 0.1s; border: 1px solid transparent;
  }
  .file-row:hover { background: var(--surface2); }
  .file-row.selected { background: rgba(88,166,255,0.08); border-color: rgba(88,166,255,0.2); }
  .file-icon { font-size: 18px; width: 24px; text-align: center; }
  .file-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-name.dir { color: var(--accent); }
  .file-size, .file-date { font-size: 11px; color: var(--dim); }

  /* GRID VIEW */
  .file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .file-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px 12px; text-align: center; cursor: pointer; transition: all 0.15s;
  }
  .file-card:hover { background: var(--surface2); border-color: var(--dim); transform: translateY(-1px); }
  .file-card.selected { border-color: var(--accent); background: rgba(88,166,255,0.08); }
  .file-card .icon { font-size: 32px; margin-bottom: 8px; }
  .file-card .name { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dim); }
  .file-card .name.dir { color: var(--accent); }

  /* EMPTY STATE */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: var(--dim); gap: 8px; }
  .empty-state .icon { font-size: 48px; opacity: 0.3; }
  .empty-state p { font-size: 13px; }

  /* CONTEXT MENU */
  .context-menu {
    position: fixed; background: var(--surface2); border: 1px solid var(--border);
    border-radius: 8px; padding: 6px; min-width: 180px; z-index: 1000;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    animation: fadeIn 0.1s ease;
  }
  @keyframes fadeIn { from { opacity:0; transform: scale(0.95); } to { opacity:1; transform: scale(1); } }
  .ctx-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 12px;
    border-radius: 5px; cursor: pointer; font-size: 12px; color: var(--text);
    transition: background 0.1s;
  }
  .ctx-item:hover { background: var(--surface); }
  .ctx-item.danger { color: var(--danger); }
  .ctx-item.danger:hover { background: rgba(248,81,73,0.1); }
  .ctx-sep { height: 1px; background: var(--border); margin: 4px 0; }

  /* MODAL */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 2000;
    display: flex; align-items: center; justify-content: center;
    animation: fadeOverlay 0.2s ease;
  }
  @keyframes fadeOverlay { from { opacity:0; } to { opacity:1; } }
  .modal {
    background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
    padding: 28px; width: 400px; box-shadow: 0 24px 80px rgba(0,0,0,0.6);
    animation: slideUp 0.2s ease;
  }
  .modal h3 { font-size: 16px; margin-bottom: 16px; }
  .modal input {
    width: 100%; background: var(--bg); border: 1px solid var(--border);
    border-radius: 6px; padding: 10px 14px; color: var(--text);
    font-family: var(--font); font-size: 13px; outline: none; margin-bottom: 16px;
    transition: border-color 0.2s;
  }
  .modal input:focus { border-color: var(--accent); }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

  /* PREVIEW */
  .preview-panel {
    width: 360px; background: var(--surface); border-left: 1px solid var(--border);
    display: flex; flex-direction: column; flex-shrink: 0;
  }
  .preview-header { padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .preview-header h4 { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin-right: 8px; }
  .preview-close { background: none; border: none; color: var(--dim); cursor: pointer; font-size: 18px; line-height: 1; }
  .preview-body { flex: 1; overflow: auto; padding: 16px; }
  .preview-body pre { font-size: 11px; color: var(--dim); white-space: pre-wrap; word-break: break-word; line-height: 1.6; }
  .preview-info { display: flex; flex-direction: column; gap: 10px; }
  .preview-info-row { display: flex; justify-content: space-between; font-size: 12px; }
  .preview-info-row .label { color: var(--dim); }
  .preview-big-icon { font-size: 64px; text-align: center; margin: 32px 0 16px; }

  /* UPLOAD PROGRESS */
  .upload-toast {
    position: fixed; bottom: 20px; right: 20px;
    background: var(--surface2); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 18px; min-width: 240px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 3000;
    display: none; animation: slideUp 0.3s ease;
  }
  .toast-label { font-size: 12px; color: var(--dim); margin-bottom: 8px; }
  .progress-bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s; }

  /* SCROLLBAR */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--dim); }
</style>
</head>
<body>

<!-- LOGIN -->
<div id="login-screen">
  <div class="login-box">
    <div class="login-logo">Jacob's VPS</div>
    <div class="login-title">File Manager</div>
    <div class="login-sub">Enter your password to continue</div>
    <input type="password" id="pwd-input" placeholder="Password" />
    <div class="login-error" id="login-error">Wrong password. Try again.</div>
    <button class="btn btn-primary" onclick="login()">Unlock →</button>
  </div>
</div>

<!-- APP -->
<div id="app">
  <!-- TOPBAR -->
  <div class="topbar">
    <span class="topbar-logo">JM/Files</span>
    <div class="breadcrumb" id="breadcrumb"></div>
    <div class="topbar-actions">
      <div class="search-wrap">
        <input type="text" id="search-input" placeholder="Filter files..." oninput="filterFiles(this.value)" />
      </div>
      <button class="btn btn-ghost" onclick="triggerUpload()" title="Upload files">⬆ Upload</button>
      <button class="btn btn-ghost" onclick="showMkdir()" title="New folder">📁 New Folder</button>
      <button class="btn btn-ghost" onclick="logout()" title="Logout">⏻</button>
    </div>
  </div>

  <div class="main">
    <!-- SIDEBAR -->
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-label">Quick Access</div>
        <div class="sidebar-item active" onclick="navigate('/')"><span class="icon">🏠</span> Home</div>
        <div class="sidebar-item" onclick="navigate('/Developer')"><span class="icon">💻</span> Developer</div>
        <div class="sidebar-item" onclick="navigate('/assignments')"><span class="icon">📚</span> Assignments</div>
        <div class="sidebar-item" onclick="navigate('/Downloads')"><span class="icon">⬇</span> Downloads</div>
        <div class="sidebar-item" onclick="navigate('/Documents')"><span class="icon">📄</span> Documents</div>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">Actions</div>
        <div class="sidebar-item" onclick="triggerUpload()"><span class="icon">⬆</span> Upload Files</div>
        <div class="sidebar-item" onclick="showMkdir()"><span class="icon">📁</span> New Folder</div>
        <div class="sidebar-item" onclick="refreshFiles()"><span class="icon">↻</span> Refresh</div>
      </div>
    </div>

    <!-- FILES -->
    <div class="files-area">
      <div class="files-toolbar">
        <div class="view-toggle">
          <button class="view-btn active" id="list-btn" onclick="setView('list')" title="List view">☰</button>
          <button class="view-btn" id="grid-btn" onclick="setView('grid')" title="Grid view">⊞</button>
        </div>
        <select class="sort-select" onchange="sortFiles(this.value)">
          <option value="name">Sort: Name</option>
          <option value="size">Sort: Size</option>
          <option value="date">Sort: Date</option>
          <option value="type">Sort: Type</option>
        </select>
        <span class="file-count" id="file-count"></span>
      </div>

      <div style="display:flex;flex:1;overflow:hidden;">
        <div class="files-container" id="files-container">
          <div class="empty-state"><div class="icon">📂</div><p>Loading...</p></div>
        </div>
        <div class="preview-panel" id="preview-panel" style="display:none;">
          <div class="preview-header">
            <h4 id="preview-name"></h4>
            <button class="preview-close" onclick="closePreview()">✕</button>
          </div>
          <div class="preview-body" id="preview-body"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- CONTEXT MENU -->
<div class="context-menu" id="ctx-menu" style="display:none;">
  <div class="ctx-item" onclick="ctxDownload()">⬇ &nbsp;Download</div>
  <div class="ctx-item" onclick="ctxRename()">✏️ &nbsp;Rename</div>
  <div class="ctx-item" onclick="ctxPreview()">👁 &nbsp;Preview</div>
  <div class="ctx-sep"></div>
  <div class="ctx-item danger" onclick="ctxDelete()">🗑 &nbsp;Delete</div>
</div>

<!-- MODAL -->
<div class="modal-overlay" id="modal" style="display:none;" onclick="if(event.target===this)closeModal()">
  <div class="modal">
    <h3 id="modal-title">New Folder</h3>
    <input type="text" id="modal-input" placeholder="" onkeydown="if(event.key==='Enter')modalConfirm()" />
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="modalConfirm()" id="modal-ok">Create</button>
    </div>
  </div>
</div>

<!-- UPLOAD INPUT -->
<input type="file" id="file-input" multiple style="display:none" onchange="uploadFiles(this.files)" />

<!-- UPLOAD TOAST -->
<div class="upload-toast" id="upload-toast">
  <div class="toast-label" id="toast-label">Uploading...</div>
  <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
</div>

<script>
  let currentPath = '/';
  let allFiles = [];
  let filteredFiles = [];
  let viewMode = 'list';
  let sortMode = 'name';
  let selectedFile = null;
  let ctxTarget = null;
  let modalAction = null;

  // === AUTH ===
  async function login() {
    const pwd = document.getElementById('pwd-input').value;
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: pwd }) });
      if (r.ok) { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app').style.display = 'flex'; loadFiles('/'); }
      else { document.getElementById('login-error').style.display = 'block'; }
    } catch(e) { alert('Connection error'); }
  }

  document.getElementById('pwd-input').addEventListener('keydown', e => { if(e.key === 'Enter') login(); });

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('pwd-input').value = '';
  }

  // Check auth on load
  fetch('/api/check').then(r => r.json()).then(d => {
    if (d.auth) { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app').style.display = 'flex'; loadFiles('/'); }
  });

  // === FILES ===
  async function loadFiles(dir) {
    currentPath = dir;
    updateBreadcrumb();
    updateSidebar();
    closePreview();
    try {
      const r = await fetch('/api/files?path=' + encodeURIComponent(dir));
      const data = await r.json();
      allFiles = data.files || [];
      applySort();
      renderFiles();
    } catch(e) { showEmpty('Error loading files'); }
  }

  function navigate(path) { loadFiles(path); }
  function refreshFiles() { loadFiles(currentPath); }

  function filterFiles(q) {
    const query = q.toLowerCase();
    filteredFiles = query ? allFiles.filter(f => f.name.toLowerCase().includes(query)) : [...allFiles];
    renderFiles(true);
  }

  function applySort() {
    filteredFiles = [...allFiles];
    filteredFiles.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'size') return (b.size || 0) - (a.size || 0);
      if (sortMode === 'date') return new Date(b.modified) - new Date(a.modified);
      if (sortMode === 'type') return ext(a.name).localeCompare(ext(b.name));
      return 0;
    });
  }

  function sortFiles(mode) { sortMode = mode; applySort(); renderFiles(); }

  function renderFiles(skipSort) {
    const container = document.getElementById('files-container');
    document.getElementById('file-count').textContent = filteredFiles.length + ' items';
    if (!filteredFiles.length) { showEmpty('No files here'); return; }

    if (viewMode === 'list') {
      container.innerHTML = \`
        <div class="file-list">
          <div class="file-list-header">
            <span></span><span>Name</span><span>Size</span><span>Modified</span><span></span>
          </div>
          \${filteredFiles.map(f => \`
            <div class="file-row \${selectedFile===f.name?'selected':''}"
              onclick="selectFile('\${escape(f.name)}', \${f.isDir})"
              ondblclick="\${f.isDir ? \`navigate('\${joinPath(currentPath, f.name)}')\` : \`previewFile('\${escape(f.name)}')\`}"
              oncontextmenu="showCtx(event, '\${escape(f.name)}', \${f.isDir})">
              <span class="file-icon">\${fileIcon(f.name, f.isDir)}</span>
              <span class="file-name \${f.isDir?'dir':''}">\${f.name}</span>
              <span class="file-size">\${f.isDir ? '—' : formatSize(f.size)}</span>
              <span class="file-date">\${formatDate(f.modified)}</span>
              <span style="display:flex;gap:4px">
                \${!f.isDir ? \`<span onclick="event.stopPropagation();downloadFile('\${escape(joinPath(currentPath, f.name))}')" style="cursor:pointer;color:var(--dim);font-size:12px;" title="Download">⬇</span>\` : ''}
              </span>
            </div>
          \`).join('')}
        </div>\`;
    } else {
      container.innerHTML = \`<div class="file-grid">\${filteredFiles.map(f => \`
        <div class="file-card \${selectedFile===f.name?'selected':''}"
          onclick="selectFile('\${escape(f.name)}', \${f.isDir})"
          ondblclick="\${f.isDir ? \`navigate('\${joinPath(currentPath, f.name)}')\` : \`previewFile('\${escape(f.name)}')\`}"
          oncontextmenu="showCtx(event, '\${escape(f.name)}', \${f.isDir})">
          <div class="icon">\${fileIcon(f.name, f.isDir)}</div>
          <div class="name \${f.isDir?'dir':''}">\${f.name}</div>
        </div>
      \`).join('')}</div>\`;
    }

    // Drag & Drop
    container.ondragover = e => { e.preventDefault(); container.classList.add('drag-over'); };
    container.ondragleave = () => container.classList.remove('drag-over');
    container.ondrop = e => { e.preventDefault(); container.classList.remove('drag-over'); uploadFiles(e.dataTransfer.files); };
  }

  function showEmpty(msg) {
    document.getElementById('files-container').innerHTML = \`<div class="empty-state"><div class="icon">📭</div><p>\${msg}</p></div>\`;
  }

  function selectFile(name, isDir) {
    selectedFile = name;
    renderFiles(true);
  }

  function setView(mode) {
    viewMode = mode;
    document.getElementById('list-btn').classList.toggle('active', mode === 'list');
    document.getElementById('grid-btn').classList.toggle('active', mode === 'grid');
    renderFiles(true);
  }

  // === BREADCRUMB ===
  function updateBreadcrumb() {
    const parts = currentPath.split('/').filter(Boolean);
    const bc = document.getElementById('breadcrumb');
    let html = \`<span onclick="navigate('/')">~</span>\`;
    let built = '';
    parts.forEach((p, i) => {
      built += '/' + p;
      const path = built;
      html += \`<span class="sep">/</span>\`;
      html += i === parts.length - 1
        ? \`<span class="current">\${p}</span>\`
        : \`<span onclick="navigate('\${path}')">\${p}</span>\`;
    });
    bc.innerHTML = html;
  }

  function updateSidebar() {
    document.querySelectorAll('.sidebar-item').forEach(el => {
      el.classList.remove('active');
      const onclick = el.getAttribute('onclick') || '';
      if (onclick.includes(\`'\${currentPath}'\`)) el.classList.add('active');
    });
  }

  // === UPLOAD ===
  function triggerUpload() { document.getElementById('file-input').click(); }

  async function uploadFiles(files) {
    if (!files.length) return;
    const toast = document.getElementById('upload-toast');
    const label = document.getElementById('toast-label');
    const fill = document.getElementById('progress-fill');
    toast.style.display = 'block';

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      label.textContent = \`Uploading \${f.name} (\${i+1}/\${files.length})...\`;
      fill.style.width = Math.round((i / files.length) * 100) + '%';
      const fd = new FormData();
      fd.append('files', f);
      await fetch('/api/upload?path=' + encodeURIComponent(currentPath), { method: 'POST', body: fd });
    }

    fill.style.width = '100%';
    label.textContent = \`✓ Uploaded \${files.length} file(s)\`;
    setTimeout(() => { toast.style.display = 'none'; fill.style.width = '0%'; }, 2000);
    refreshFiles();
    document.getElementById('file-input').value = '';
  }

  // === DOWNLOAD ===
  function downloadFile(filePath) {
    const a = document.createElement('a');
    a.href = '/api/download?path=' + encodeURIComponent(filePath);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // === PREVIEW ===
  async function previewFile(name) {
    const filePath = joinPath(currentPath, name);
    const panel = document.getElementById('preview-panel');
    const body = document.getElementById('preview-body');
    document.getElementById('preview-name').textContent = name;
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    const textExts = ['txt','md','js','ts','jsx','tsx','py','c','cpp','h','java','sh','bash','json','yaml','yml','env','gitignore','css','html','xml','sql','go','rs','php','rb'];
    const e = ext(name);

    if (textExts.includes(e)) {
      body.innerHTML = '<pre style="color:var(--dim)">Loading...</pre>';
      try {
        const r = await fetch('/api/preview?path=' + encodeURIComponent(filePath));
        const d = await r.json();
        body.innerHTML = \`<pre>\${escapeHtml(d.content)}</pre>\`;
      } catch { body.innerHTML = '<pre>Could not preview</pre>'; }
    } else {
      const file = allFiles.find(f => f.name === name);
      body.innerHTML = \`
        <div class="preview-big-icon">\${fileIcon(name, false)}</div>
        <div class="preview-info">
          <div class="preview-info-row"><span class="label">Name</span><span>\${name}</span></div>
          <div class="preview-info-row"><span class="label">Type</span><span>.\${e || 'file'}</span></div>
          \${file ? \`<div class="preview-info-row"><span class="label">Size</span><span>\${formatSize(file.size)}</span></div>
          <div class="preview-info-row"><span class="label">Modified</span><span>\${formatDate(file.modified)}</span></div>\` : ''}
        </div>
        <br>
        <button class="btn btn-primary" style="width:100%" onclick="downloadFile('\${escape(filePath)}')">⬇ Download</button>
      \`;
    }
  }

  function closePreview() {
    document.getElementById('preview-panel').style.display = 'none';
  }

  // === CONTEXT MENU ===
  function showCtx(e, name, isDir) {
    e.preventDefault();
    ctxTarget = { name, isDir, path: joinPath(currentPath, name) };
    const menu = document.getElementById('ctx-menu');
    menu.style.display = 'block';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
  }

  document.addEventListener('click', () => document.getElementById('ctx-menu').style.display = 'none');

  function ctxDownload() { if (ctxTarget && !ctxTarget.isDir) downloadFile(ctxTarget.path); }
  function ctxPreview() { if (ctxTarget && !ctxTarget.isDir) previewFile(ctxTarget.name); }

  function ctxRename() {
    if (!ctxTarget) return;
    showModal('Rename', ctxTarget.name, 'Rename', async (newName) => {
      await fetch('/api/rename', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ oldPath: ctxTarget.path, newName }) });
      refreshFiles();
    });
  }

  async function ctxDelete() {
    if (!ctxTarget) return;
    if (!confirm(\`Delete "\${ctxTarget.name}"? This cannot be undone.\`)) return;
    await fetch('/api/delete?path=' + encodeURIComponent(ctxTarget.path), { method: 'DELETE' });
    refreshFiles();
  }

  // === MKDIR ===
  function showMkdir() {
    showModal('New Folder', 'folder-name', 'Create', async (name) => {
      await fetch('/api/mkdir', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: joinPath(currentPath, name) }) });
      refreshFiles();
    });
  }

  // === MODAL ===
  function showModal(title, placeholder, okLabel, onConfirm) {
    document.getElementById('modal-title').textContent = title;
    const input = document.getElementById('modal-input');
    input.placeholder = placeholder;
    input.value = placeholder === 'folder-name' ? '' : placeholder;
    document.getElementById('modal-ok').textContent = okLabel;
    document.getElementById('modal').style.display = 'flex';
    modalAction = onConfirm;
    setTimeout(() => { input.focus(); input.select(); }, 50);
  }

  function closeModal() { document.getElementById('modal').style.display = 'none'; modalAction = null; }

  async function modalConfirm() {
    const val = document.getElementById('modal-input').value.trim();
    if (!val) return;
    closeModal();
    if (modalAction) await modalAction(val);
  }

  // === HELPERS ===
  function joinPath(base, name) {
    return (base.endsWith('/') ? base : base + '/') + name;
  }

  function ext(name) { return name.split('.').pop().toLowerCase(); }

  function fileIcon(name, isDir) {
    if (isDir) return '📁';
    const e = ext(name);
    const icons = {
      js:'📜', ts:'📜', jsx:'⚛️', tsx:'⚛️', py:'🐍', c:'⚙️', cpp:'⚙️', h:'⚙️',
      java:'☕', go:'🐹', rs:'🦀', rb:'💎', php:'🐘', sh:'🔧', bash:'🔧',
      html:'🌐', css:'🎨', json:'📋', yaml:'📋', yml:'📋', xml:'📋',
      md:'📝', txt:'📄', pdf:'📕', doc:'📘', docx:'📘', xls:'📗', xlsx:'📗',
      zip:'📦', tar:'📦', gz:'📦', rar:'📦',
      png:'🖼', jpg:'🖼', jpeg:'🖼', gif:'🖼', svg:'🖼', ico:'🖼',
      mp4:'🎬', mov:'🎬', avi:'🎬', mp3:'🎵', wav:'🎵',
      sql:'🗄️', db:'🗄️', env:'🔐', pem:'🔐', key:'🔐',
    };
    return icons[e] || '📄';
  }

  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
    return (bytes/1073741824).toFixed(1) + ' GB';
  }

  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function escape(s) { return s.replace(/'/g, "\\\\'").replace(/"/g, '&quot;'); }
  function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
</script>
</body>
</html>`));

app.listen(PORT, '0.0.0.0', () => console.log(`✓ Jacob's File Manager running on port ${PORT}`));
