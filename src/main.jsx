import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const SORT_OPTIONS = [
  ['name', 'NAME'],
  ['size', 'SIZE'],
  ['date', 'DATE'],
  ['type', 'TYPE'],
];

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'c', 'cpp', 'h', 'java', 'sh', 'bash',
  'json', 'yaml', 'yml', 'env', 'gitignore', 'css', 'html', 'xml', 'sql', 'go', 'rs',
  'php', 'rb', 'toml', 'ini', 'cfg', 'log', 'lock',
]);

const MEDIA_GROUPS = {
  image: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']),
  video: new Set(['mp4', 'mov', 'mkv', 'webm', 'avi']),
  audio: new Set(['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg']),
};

function apiFetch(url, options) {
  return fetch(url, options).then(async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => '');

    if (!response.ok) {
      const error = new Error(
        (payload && payload.error) ||
        (typeof payload === 'string' && payload) ||
        'Request failed'
      );
      error.status = response.status;
      throw error;
    }

    return payload;
  });
}

function fmtSize(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16);
}

function getExt(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function joinPath(base, name) {
  return `${base.endsWith('/') ? base : `${base}/`}${name}`;
}

function iconFor(name, isDir) {
  if (isDir) return 'folder';
  const ext = getExt(name);
  const map = {
    js: 'javascript',
    ts: 'javascript',
    jsx: 'javascript',
    tsx: 'javascript',
    py: 'code',
    c: 'code',
    cpp: 'code',
    java: 'code',
    go: 'code',
    rs: 'code',
    sh: 'terminal',
    bash: 'terminal',
    html: 'language',
    css: 'palette',
    json: 'data_object',
    yaml: 'data_object',
    yml: 'data_object',
    xml: 'data_object',
    md: 'description',
    txt: 'description',
    pdf: 'picture_as_pdf',
    doc: 'description',
    docx: 'description',
    zip: 'folder_zip',
    tar: 'folder_zip',
    gz: 'folder_zip',
    rar: 'folder_zip',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    svg: 'image',
    webp: 'image',
    mp4: 'video_file',
    mov: 'video_file',
    avi: 'video_file',
    mkv: 'video_file',
    mp3: 'audio_file',
    wav: 'audio_file',
    flac: 'audio_file',
    sql: 'database',
    db: 'database',
    sqlite: 'database',
    env: 'lock',
    pem: 'lock',
    key: 'lock',
    cert: 'lock',
  };
  return map[ext] || 'insert_drive_file';
}

function badgeFor(name, isDir) {
  if (isDir) return 'DIR';
  const ext = getExt(name);
  const map = {
    js: 'SRC', ts: 'SRC', jsx: 'SRC', tsx: 'SRC', py: 'SRC', c: 'SRC', cpp: 'SRC', go: 'SRC', rs: 'SRC',
    sh: 'SH', bash: 'SH', html: 'WEB', css: 'WEB', json: 'CFG', yaml: 'CFG', yml: 'CFG',
    png: 'IMG', jpg: 'IMG', jpeg: 'IMG', gif: 'IMG', svg: 'IMG', webp: 'IMG',
    mp4: 'VID', mov: 'VID', mkv: 'VID', webm: 'VID',
    mp3: 'AUD', wav: 'AUD', flac: 'AUD',
    pdf: 'PDF', doc: 'DOC', docx: 'DOC',
    zip: 'ARC', tar: 'ARC', gz: 'ARC', rar: 'ARC',
    sql: 'DB', db: 'DB', env: 'SEC', key: 'SEC', pem: 'SEC',
  };
  return map[ext] || (ext ? ext.slice(0, 4).toUpperCase() : 'FILE');
}

function labelForExtension(ext) {
  const map = {
    js: 'SRC_CODE',
    ts: 'SRC_CODE',
    py: 'SRC_CODE',
    sh: 'EXECUTABLE',
    bash: 'EXECUTABLE',
    env: 'SENSITIVE',
    pem: 'SENSITIVE',
    key: 'SENSITIVE',
    json: 'CONFIG',
    yaml: 'CONFIG',
    yml: 'CONFIG',
    pdf: 'DOCUMENT',
    doc: 'DOCUMENT',
    docx: 'DOCUMENT',
    zip: 'ARCHIVE',
    tar: 'ARCHIVE',
    gz: 'ARCHIVE',
    png: 'MEDIA',
    jpg: 'MEDIA',
    jpeg: 'MEDIA',
    mp4: 'MEDIA',
    mov: 'MEDIA',
    mp3: 'MEDIA',
    sql: 'DATABASE',
    db: 'DATABASE',
  };
  return map[ext] || 'FILE_SYSTEM';
}

function DetailRow({ label, value, accent = false }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong className={accent ? 'accent' : ''}>{value}</strong>
    </div>
  );
}

function Modal({ modal, onClose, onSubmit }) {
  const [value, setValue] = useState(modal.value || '');
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return undefined;
    const focusable = el.querySelectorAll('button, input, [tabindex]');
    if (focusable.length) focusable[0].focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab' && focusable.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div ref={dialogRef} className="modal-shell" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="eyebrow">{modal.title}</div>
        <p>{modal.message}</p>
        {modal.type === 'prompt' ? (
          <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} />
        ) : null}
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">CANCEL</button>
          <button
            className={modal.danger ? 'danger-button' : 'primary-button'}
            onClick={() => onSubmit(value.trim())}
            type="button"
          >
            {modal.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ password, setPassword, loginError, busy, onSubmit }) {
  return (
    <div className="login-screen">
      <div className="login-rings">
        <div />
        <div />
      </div>
      <div className="auth-shell">
        <div className="auth-titlebar">
          <div className="auth-title">JM // SECURE_AUTH_V4.0</div>
          <div className="auth-actions">
            <span />
            <span />
          </div>
        </div>
        <form className="auth-body" onSubmit={onSubmit}>
          <div>
            <h1>JACOB_FS</h1>
            <div className="auth-meta">
              <span>Enter password to continue</span>
            </div>
          </div>
          <label className="auth-field">
            <span>ENTER_PASSWORD</span>
            <div className="auth-input-shell">
              <span className="material-symbols-outlined filled">lock</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoFocus
              />
              <span className="cursor-block" />
            </div>
            {loginError ? <em>{loginError}</em> : null}
          </label>
          <button className="primary-button auth-submit" disabled={busy} type="submit">
            <span>UNLOCK</span>
            <span className="material-symbols-outlined">terminal</span>
          </button>
        </form>
        <div className="auth-footer">
          <span className="status-live">Ready</span>
        </div>
      </div>
    </div>
  );
}

function TopBar({
  isMobile,
  setSidebarOpen,
  currentPath,
  goBack,
  activePanel,
  setActivePanel,
  mobileSearchOpen,
  setMobileSearchOpen,
  filterQuery,
  setFilterQuery,
  onLogout,
}) {
  return (
    <header className="topbar">
      <div className="topbar-group">
        {isMobile ? (
          <button className="icon-button" onClick={() => setSidebarOpen(true)} type="button" aria-label="Open menu">
            <span className="material-symbols-outlined">menu</span>
          </button>
        ) : null}
        {isMobile && currentPath !== '/' ? (
          <button className="icon-button" onClick={goBack} type="button" aria-label="Go back">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        ) : null}
        <div className="brand">JM</div>
        {!isMobile ? (
          <nav className="topnav">
            {['explorer', 'transfers', 'security'].map((panel) => (
              <button
                key={panel}
                className={activePanel === panel ? 'active' : ''}
                onClick={() => setActivePanel(panel)}
                type="button"
              >
                {panel.toUpperCase()}
              </button>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="topbar-group">
        {!isMobile || mobileSearchOpen ? (
          <div className="search-shell">
            <span className="material-symbols-outlined">search</span>
            <input
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setFilterQuery(''); }}
              placeholder="Search files..."
            />
          </div>
        ) : null}
        {isMobile ? (
          <button className="icon-button" onClick={() => setMobileSearchOpen((current) => !current)} type="button" aria-label="Search">
            <span className="material-symbols-outlined">search</span>
          </button>
        ) : null}
        <button className="icon-button" onClick={() => setActivePanel('explorer')} type="button" aria-label="Explorer">
          <span className="material-symbols-outlined">terminal</span>
        </button>
        <button className="icon-button" onClick={onLogout} type="button" aria-label="Logout">
          <span className="material-symbols-outlined">power_settings_new</span>
        </button>
      </div>
    </header>
  );
}

function AppSidebar({ isOpen, bookmarks, currentPath, onNavigate, onClose, disk, onToggleBookmark }) {
  const isBookmarked = bookmarks.some((b) => b.path === currentPath && currentPath !== '/');
  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-head">
          <h2>Files</h2>
          {currentPath !== '/' ? (
            <button
              className={`icon-button bookmark-btn ${isBookmarked ? 'active' : ''}`}
              onClick={() => onToggleBookmark(currentPath)}
              type="button"
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark directory'}
            >
              <span className="material-symbols-outlined">{isBookmarked ? 'bookmark' : 'bookmark_add'}</span>
            </button>
          ) : null}
        </div>
        <div className="sidebar-nav">
          {bookmarks.map((bookmark) => (
            <div key={bookmark.path} className="sidebar-link-shell">
              <button
                className={bookmark.path === currentPath ? 'sidebar-link active' : 'sidebar-link'}
                onClick={() => {
                  onClose();
                  onNavigate(bookmark.path);
                }}
                type="button"
              >
                <span className="material-symbols-outlined">
                  {bookmark.path === '/' ? 'folder_open' : 'folder'}
                </span>
                <span>{bookmark.name.toUpperCase()}</span>
              </button>
              {bookmark.custom ? (
                <button
                  className="sidebar-remove-btn"
                  onClick={() => onToggleBookmark(bookmark.path)}
                  type="button"
                  aria-label="Remove bookmark"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="metric-line">
            <span>DISK_LOAD</span>
            <span>{disk ? `${disk.usedPercent.toFixed(1)}%` : '—'}</span>
          </div>
          <div className="meter"><div style={{ width: `${disk ? disk.usedPercent : 0}%` }} /></div>
        </div>
      </aside>
      {isOpen ? <button className="sidebar-backdrop" onClick={onClose} type="button" aria-label="Close sidebar" /> : null}
    </>
  );
}

function FileListRow({ file, pathname, selected, isSelected, onSelect, onActivate, onContextMenu, onToggleSelect }) {
  return (
    <div
      key={pathname}
      className={`list-row ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(file)}
      onDoubleClick={() => onActivate(file)}
      onContextMenu={(event) => onContextMenu(event, file)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(file);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <label className="row-checkbox" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(pathname)}
        />
      </label>
      <div className="row-name">
        <span className="material-symbols-outlined">{iconFor(file.name, file.isDir)}</span>
        <span>{file.name.toUpperCase()}</span>
      </div>
      <span>{file.isDir ? '—' : fmtSize(file.size)}</span>
      <span className="pill">{file.perms}</span>
      <div className="row-tail">
        <span>{fmtDate(file.modified)}</span>
        <button
          className="more-button"
          onClick={(event) => {
            event.stopPropagation();
            onContextMenu(event, file);
          }}
          type="button"
        >
          <span className="material-symbols-outlined">more_vert</span>
        </button>
      </div>
    </div>
  );
}

function FileGridCard({ file, pathname, selected, isSelected, onSelect, onActivate, onContextMenu, onToggleSelect }) {
  return (
    <article
      key={pathname}
      className={`file-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(file)}
      onDoubleClick={() => onActivate(file)}
      onContextMenu={(event) => onContextMenu(event, file)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(file);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <label className="card-checkbox" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(pathname)}
        />
      </label>
      <div className="card-head">
        <span className="material-symbols-outlined card-icon">{iconFor(file.name, file.isDir)}</span>
        <span className="pill">{badgeFor(file.name, file.isDir)}</span>
      </div>
      <div className="card-preview">
        {file.isDir ? 'Directory' : fmtSize(file.size)}
      </div>
      <div className="card-meta">
        <strong>{file.name.toUpperCase()}</strong>
        <span>{file.isDir ? 'DIRECTORY' : fmtSize(file.size)}</span>
      </div>
      <button
        className="more-button floating"
        onClick={(event) => {
          event.stopPropagation();
          onContextMenu(event, file);
        }}
        type="button"
      >
        <span className="material-symbols-outlined">more_vert</span>
      </button>
    </article>
  );
}

function PreviewPanel({ preview, setPreview, onNavigateBack, onSave, onDownload, onConfirmAction, onDeletePaths, confirmIfDirty }) {
  return (
    <section className="preview-layout">
      <div className="editor-shell">
        <div className="editor-toolbar">
          <div className="editor-meta">
            <span className="eyebrow active">{preview.file.path.toUpperCase()}</span>
            <span>{preview.file.ext.toUpperCase() || 'FILE'}</span>
          </div>
          <div className="editor-actions">
            <button className="secondary-button" onClick={() => confirmIfDirty(() => onNavigateBack())} type="button">CLOSE</button>
            {preview.editable ? (
              <button className="primary-button" onClick={onSave} type="button" disabled={!preview.dirty}>SAVE</button>
            ) : null}
            <button className="secondary-button" onClick={() => onDownload(preview.file.path)} type="button">DOWNLOAD</button>
          </div>
        </div>
        <div className="editor-body">
          {preview.loading ? <div className="empty-state compact"><h3>LOADING_BUFFER</h3></div> : null}
          {!preview.loading && preview.error ? <div className="empty-state compact"><h3>PREVIEW_ERROR</h3><p>{preview.error}</p></div> : null}
          {!preview.loading && !preview.error && preview.mediaType === 'text' ? (
            <div className="code-shell">
              <div className="line-gutter">
                {preview.content.split('\n').map((_, index) => <span key={index + 1}>{index + 1}</span>)}
              </div>
              <textarea
                className="editor-textarea"
                value={preview.content}
                onChange={(event) => setPreview((current) => ({ ...current, content: event.target.value, dirty: true }))}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
                    event.preventDefault();
                    if (preview.dirty) onSave();
                  }
                }}
                spellCheck={false}
              />
            </div>
          ) : null}
          {!preview.loading && !preview.error && preview.mediaType === 'image' ? (
            <div className="media-shell"><img alt={preview.file.name} src={`/api/raw?path=${encodeURIComponent(preview.file.path)}`} /></div>
          ) : null}
          {!preview.loading && !preview.error && preview.mediaType === 'video' ? (
            <div className="media-shell"><video controls src={`/api/raw?path=${encodeURIComponent(preview.file.path)}`} /></div>
          ) : null}
          {!preview.loading && !preview.error && preview.mediaType === 'audio' ? (
            <div className="media-shell"><audio controls src={`/api/raw?path=${encodeURIComponent(preview.file.path)}`} /></div>
          ) : null}
          {!preview.loading && !preview.error && preview.mediaType === 'pdf' ? (
            <div className="media-shell"><embed src={`/api/raw?path=${encodeURIComponent(preview.file.path)}`} type="application/pdf" /></div>
          ) : null}
          {!preview.loading && !preview.error && preview.mediaType === 'binary' ? (
            <div className="empty-state compact">
              <h3>PREVIEW_UNAVAILABLE</h3>
              <p>BINARY FILES MUST BE DOWNLOADED OR INSPECTED EXTERNALLY.</p>
            </div>
          ) : null}
        </div>
        <div className="editor-status">
          <span>{preview.editable ? 'Editable' : 'Read only'}</span>
        </div>
      </div>
      <aside className="meta-shell">
        <div className="section-card">
          <div className="eyebrow">METADATA_EXPLORER</div>
          <h3>{preview.file.name.toUpperCase()}</h3>
          <DetailRow label="SIZE" value={fmtSize(preview.file.size)} />
          <DetailRow label="TYPE" value={preview.file.ext.toUpperCase() || 'FILE'} />
          <DetailRow label="MODIFIED" value={fmtDate(preview.file.modified)} />
          <DetailRow label="PERMISSIONS" value={preview.file.perms} />
          <div className="checksum-card">SHA256: {preview.hash}</div>
          <div className="tag-row">
            <span className="pill active">{labelForExtension(preview.file.ext)}</span>
            {preview.file.ext ? <span className="pill">{preview.file.ext.toUpperCase()}</span> : null}
          </div>
          <button
            className="danger-button wide"
            onClick={() => onConfirmAction(
              'CONFIRM_PURGE',
              `DELETE ${preview.file.name.toUpperCase()}? THIS CANNOT BE UNDONE.`,
              async () => onDeletePaths([preview.file.path], preview.file.name.toUpperCase()),
              'PURGE',
              true
            )}
            type="button"
          >
            PURGE_FILE
          </button>
        </div>
      </aside>
    </section>
  );
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [bookmarks, setBookmarks] = useState([{ name: 'ROOT', path: '/' }]);
  const [disk, setDisk] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortMode, setSortMode] = useState('name');
  const [viewMode, setViewMode] = useState(window.innerWidth <= 900 ? 'grid' : 'list');
  const [activePanel, setActivePanel] = useState('explorer');
  const [selectedPaths, setSelectedPaths] = useState([]);
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [transfers, setTransfers] = useState([]);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [propertiesInfo, setPropertiesInfo] = useState(null);
  const [preview, setPreview] = useState({
    open: false,
    file: null,
    content: '',
    loading: false,
    editable: false,
    hash: '—',
    error: '',
    dirty: false,
    mediaType: '',
  });

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const searchTimerRef = useRef(null);
  const previewGenerationRef = useRef(0);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, []);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (mobile) setViewMode((current) => current || 'grid');
      if (!mobile) {
        setSidebarOpen(false);
        setMobileSearchOpen(false);
      }
    }

    function hideContextMenu() {
      setContextMenu(null);
    }

    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'a' && activePanel === 'explorer' && !modal && !preview.open) {
        event.preventDefault();
        const allPaths = filteredFiles.map((f) => f.path || joinPath(currentPath, f.name));
        setSelectedPaths(allPaths);
      }
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('click', hideContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', hideContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePanel, modal, preview.open, filteredFiles, currentPath]);

  useEffect(() => {
    apiFetch('/api/check')
      .then((data) => {
        setIsAuthed(!!data.auth);
        if (data.auth) bootstrap('/');
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), toast.persist ? 6000 : 2500);
    return () => clearTimeout(toastTimerRef.current);
  }, [toast]);

  useEffect(() => {
    if (!filterQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return undefined;
    }
    setSearchLoading(true);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      apiFetch(`/api/search?path=${encodeURIComponent(currentPath)}&q=${encodeURIComponent(filterQuery.trim())}`)
        .then((data) => setSearchResults(data.results || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [filterQuery, currentPath]);

  const filteredFiles = useMemo(() => {
    if (searchResults !== null) return searchResults;
    const visible = [...files];
    visible.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'size') return (b.size || 0) - (a.size || 0);
      if (sortMode === 'date') return new Date(b.modified) - new Date(a.modified);
      if (sortMode === 'type') return getExt(a.name).localeCompare(getExt(b.name));
      return 0;
    });
    return visible;
  }, [files, searchResults, sortMode]);

  const selectedCount = selectedPaths.length;
  const selectedFile = files.find((file) => joinPath(currentPath, file.name) === selectedFilePath) || null;
  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);

  function addToast(title, detail, progress = 100, persist = false) {
    setToast({ title, detail, progress, persist });
  }

  function addTransfer(line) {
    setTransfers((current) => [{ time: new Date().toISOString().slice(11, 19) + ' UTC', line }, ...current].slice(0, 50));
  }

  async function bootstrap(pathname) {
    await Promise.all([loadDisk(), loadBookmarks(), loadFiles(pathname)]);
  }

  async function loadDisk() {
    try {
      const data = await apiFetch('/api/disk');
      setDisk(data);
    } catch {
      setDisk(null);
    }
  }

  async function loadBookmarks() {
    try {
      const data = await apiFetch('/api/bookmarks');
      setBookmarks(data.bookmarks || [{ name: 'ROOT', path: '/', custom: false }]);
    } catch {
      setBookmarks([{ name: 'ROOT', path: '/', custom: false }]);
    }
  }

  async function loadFiles(pathname) {
    const data = await apiFetch(`/api/files?path=${encodeURIComponent(pathname)}`);
    setFiles(data.files || []);
    setCurrentPath(pathname);
    setSelectedPaths([]);
    setSelectedFilePath('');
    setActivePanel('explorer');
    setPreview((current) => ({ ...current, open: false }));
    setFilterQuery('');
  }

  function confirmIfDirty(callback) {
    if (!preview.dirty || !preview.open) {
      callback();
      return;
    }
    confirmAction('UNSAVED_CHANGES', 'You have unsaved changes. Discard them?', callback, 'DISCARD', true);
  }

  function navigate(pathname) {
    confirmIfDirty(() => loadFiles(pathname).catch((error) => addToast('DIRECTORY_ERROR', error.message, 0)));
  }

  function goBack() {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    navigate('/' + parts.join('/'));
  }

  function toggleSelect(pathname) {
    setSelectedPaths((current) => (
      current.includes(pathname)
        ? current.filter((item) => item !== pathname)
        : [...current, pathname]
    ));
  }

  function selectFile(file) {
    const pathname = file.path || joinPath(currentPath, file.name);
    setSelectedFilePath((current) => (current === pathname ? '' : pathname));
  }

  function handleItemActivate(file) {
    const pathname = file.path || joinPath(currentPath, file.name);
    if (file.isDir) {
      navigate(pathname);
      return;
    }
    confirmIfDirty(() => openPreview({ ...file, path: pathname }));
  }

  async function openPreview(file) {
    const pathname = file.path || joinPath(currentPath, file.name);
    const ext = getExt(file.name);
    const mediaType = MEDIA_GROUPS.image.has(ext)
      ? 'image'
      : MEDIA_GROUPS.video.has(ext)
        ? 'video'
        : MEDIA_GROUPS.audio.has(ext)
          ? 'audio'
          : ext === 'pdf'
            ? 'pdf'
            : 'binary';

    const gen = ++previewGenerationRef.current;

    setPreview({
      open: true,
      file: { ...file, path: pathname, ext },
      content: '',
      loading: true,
      editable: false,
      hash: 'COMPUTING...',
      error: '',
      dirty: false,
      mediaType,
    });
    setActivePanel('preview');

    apiFetch(`/api/hash?path=${encodeURIComponent(pathname)}`)
      .then((data) => {
        if (previewGenerationRef.current !== gen) return;
        setPreview((current) => ({ ...current, hash: data.sha256 || '—' }));
      })
      .catch(() => {
        if (previewGenerationRef.current !== gen) return;
        setPreview((current) => ({ ...current, hash: '—' }));
      });

    if (TEXT_EXTENSIONS.has(ext) || file.name.startsWith('.')) {
      try {
        const data = await apiFetch(`/api/preview?path=${encodeURIComponent(pathname)}`);
        if (previewGenerationRef.current !== gen) return;
        setPreview((current) => ({
          ...current,
          content: data.content || '',
          loading: false,
          editable: true,
          mediaType: 'text',
        }));
      } catch (error) {
        if (previewGenerationRef.current !== gen) return;
        setPreview((current) => ({
          ...current,
          loading: false,
          editable: false,
          error: error.message,
        }));
      }
      return;
    }

    if (previewGenerationRef.current !== gen) return;
    setPreview((current) => ({
      ...current,
      loading: false,
      editable: false,
    }));
  }

  async function savePreview() {
    if (!preview.file || !preview.editable) return;
    addToast('SAVING_FILE', preview.file.name.toUpperCase(), 60);
    try {
      await apiFetch('/api/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: preview.file.path, content: preview.content }),
      });
      addToast('SAVE_COMPLETE', preview.file.name.toUpperCase(), 100);
      setPreview((current) => ({ ...current, dirty: false }));
      await loadFiles(currentPath);
      await openPreview(preview.file);
    } catch (error) {
      addToast('SAVE_FAILED', error.message, 0);
    }
  }

  function triggerFileUpload() {
    fileInputRef.current?.click();
  }

  function triggerFolderUpload() {
    folderInputRef.current?.click();
  }

  async function uploadCollection(fileList, isFolder) {
    const filesToUpload = Array.from(fileList || []);
    if (!filesToUpload.length) return;
    const form = new FormData();
    const field = isFolder ? 'folder' : 'files';
    filesToUpload.forEach((file) => form.append(field, file, file.webkitRelativePath || file.name));
    const totalSize = filesToUpload.reduce((sum, f) => sum + f.size, 0);
    const label = isFolder ? 'UPLOADING_DIRECTORY' : 'UPLOADING_FILES';

    addToast(label, `${filesToUpload.length} ITEM(S) — ${fmtSize(totalSize)}`, 30, true);
    try {
      const response = await fetch(`/api/${isFolder ? 'upload-folder' : 'upload'}?path=${encodeURIComponent(currentPath)}`, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }
      const result = await response.json().catch(() => ({}));
      addToast('UPLOAD_COMPLETE', `${result.count || filesToUpload.length} ITEM(S) — ${fmtSize(totalSize)}`, 100);
      addTransfer(`UPLOAD ${result.count || filesToUpload.length} ITEM(S) (${fmtSize(totalSize)}) -> ${currentPath}`);
      await loadFiles(currentPath);
    } catch (error) {
      addToast('UPLOAD_FAILED', error.message, 0);
      addTransfer(`UPLOAD FAILED: ${error.message}`);
    }
  }

  function startDownload(pathname) {
    const link = document.createElement('a');
    link.href = `/api/download?path=${encodeURIComponent(pathname)}`;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function downloadSelected() {
    if (!selectedPaths.length) return;
    addToast('PREPARING_ARCHIVE', `${selectedPaths.length} ITEM(S)`, 30, true);
    try {
      const response = await fetch('/api/batch/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: selectedPaths }),
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'download.zip';
      link.click();
      URL.revokeObjectURL(url);
      addToast('DOWNLOAD_READY', `${selectedPaths.length} ITEM(S) — ${fmtSize(blob.size)}`, 100);
      addTransfer(`DOWNLOAD ${selectedPaths.length} ITEM(S) (${fmtSize(blob.size)})`);
    } catch (error) {
      addToast('DOWNLOAD_FAILED', error.message, 0);
      addTransfer(`DOWNLOAD FAILED: ${error.message}`);
    }
  }

  function confirmAction(title, message, onConfirm, confirmLabel = 'EXECUTE', danger = false) {
    setModal({
      title,
      message,
      type: 'confirm',
      confirmLabel,
      danger,
      onConfirm,
    });
  }

  function promptAction(title, initialValue, onConfirm, confirmLabel = 'EXECUTE') {
    setModal({
      title,
      value: initialValue,
      type: 'prompt',
      confirmLabel,
      danger: false,
      onConfirm,
    });
  }

  async function deletePaths(paths, label) {
    try {
      if (paths.length === 1) {
        await apiFetch(`/api/delete?path=${encodeURIComponent(paths[0])}`, { method: 'DELETE' });
      } else {
        await apiFetch('/api/batch/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths }),
        });
      }
      addToast('PURGE_COMPLETE', label, 100);
      addTransfer(`PURGE ${label}`);
      await loadFiles(currentPath);
    } catch (error) {
      addToast('PURGE_FAILED', error.message, 0);
    }
  }

  function deleteSelected() {
    if (!selectedPaths.length) return;
    confirmAction(
      'CONFIRM_PURGE',
      `DELETE ${selectedPaths.length} SELECTED ITEM(S)? THIS CANNOT BE UNDONE.`,
      async () => deletePaths(selectedPaths, `${selectedPaths.length} ITEM(S)`),
      'PURGE',
      true
    );
  }

  function moveSelected() {
    if (!selectedPaths.length) return;
    promptAction('MOVE_OBJECT', currentPath, async (destDir) => {
      for (const fromPath of selectedPaths) {
        const name = fromPath.split('/').pop();
        const toPath = joinPath(destDir, name);
        await apiFetch('/api/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromPath, toPath }),
        });
      }
      addToast('MOVE_COMPLETE', `${selectedPaths.length} item(s) moved`, 100);
      setSelectedPaths([]);
      await loadFiles(currentPath);
    }, 'MOVE');
  }

  function renamePath(pathname, currentName) {
    promptAction('RENAME_OBJECT', currentName, async (newName) => {
      await apiFetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: pathname, newName }),
      });
      addToast('RENAME_COMPLETE', `${currentName} -> ${newName}`, 100);
      await loadFiles(currentPath);
    });
  }

  function movePath(pathname, currentName) {
    promptAction('MOVE_OBJECT', pathname, async (destPath) => {
      await apiFetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPath: pathname, toPath: destPath }),
      });
      addToast('MOVE_COMPLETE', `${currentName} -> ${destPath}`, 100);
      await loadFiles(currentPath);
    }, 'MOVE');
  }

  function createDirectory() {
    promptAction('CREATE_DIRECTORY', '', async (name) => {
      await apiFetch('/api/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: joinPath(currentPath, name) }),
      });
      addToast('DIRECTORY_CREATED', name.toUpperCase(), 100);
      await loadFiles(currentPath);
    });
  }

  function createFile() {
    promptAction('CREATE_FILE', '', async (name) => {
      const filePath = joinPath(currentPath, name);
      await apiFetch('/api/touch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      addToast('FILE_CREATED', name.toUpperCase(), 100);
      addTransfer(`CREATE ${name.toUpperCase()}`);
      await loadFiles(currentPath);
      const ext = getExt(name);
      if (TEXT_EXTENSIONS.has(ext) || name.startsWith('.')) {
        confirmIfDirty(() => openPreview({ name, path: filePath, isDir: false, size: 0, modified: new Date(), perms: '' }));
      }
    }, 'CREATE');
  }

  function generateCopyName(originalName) {
    const nameSet = new Set(files.map((f) => f.name));
    const ext = getExt(originalName);
    const baseName = ext ? originalName.slice(0, -(ext.length + 1)) : originalName;
    const extPart = ext ? `.${ext}` : '';
    let candidate = `${baseName} copy${extPart}`;
    if (!nameSet.has(candidate)) return candidate;
    let n = 2;
    while (nameSet.has(`${baseName} copy ${n}${extPart}`)) n++;
    return `${baseName} copy ${n}${extPart}`;
  }

  async function duplicatePath(pathname, currentName) {
    const copyName = generateCopyName(currentName);
    const destPath = joinPath(currentPath, copyName);
    try {
      await apiFetch('/api/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromPath: pathname, toPath: destPath }),
      });
      addToast('COPY_COMPLETE', `${currentName} -> ${copyName}`, 100);
      addTransfer(`COPY ${currentName.toUpperCase()} -> ${copyName.toUpperCase()}`);
      await loadFiles(currentPath);
    } catch (error) {
      addToast('COPY_FAILED', error.message, 0);
    }
  }

  async function duplicateSelected() {
    if (!selectedPaths.length) return;
    addToast('COPYING', `${selectedPaths.length} ITEM(S)`, 40, true);
    let copied = 0;
    for (const fromPath of selectedPaths) {
      const name = fromPath.split('/').pop();
      const copyName = generateCopyName(name);
      const destPath = joinPath(currentPath, copyName);
      try {
        await apiFetch('/api/copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromPath, toPath: destPath }),
        });
        copied += 1;
      } catch {}
    }
    addToast('COPY_COMPLETE', `${copied}/${selectedPaths.length} ITEM(S) COPIED`, 100);
    addTransfer(`BATCH COPY ${copied} ITEM(S)`);
    setSelectedPaths([]);
    await loadFiles(currentPath);
  }

  function selectAll() {
    const allPaths = filteredFiles.map((f) => f.path || joinPath(currentPath, f.name));
    setSelectedPaths(allPaths);
  }

  function openContextMenu(event, file) {
    event.preventDefault();
    const x = isMobile ? 24 : event.clientX;
    const y = isMobile ? window.innerHeight - 260 : event.clientY;
    const pathname = file.path || joinPath(currentPath, file.name);
    setContextMenu({
      x,
      y,
      file: { ...file, path: pathname },
    });
  }

  async function showProperties(file) {
    setPropertiesInfo({ loading: true, data: null, hash: null });
    try {
      const data = await apiFetch(`/api/stat?path=${encodeURIComponent(file.path)}`);
      setPropertiesInfo({ loading: false, data, hash: null });
      if (!data.isDir) {
        apiFetch(`/api/hash?path=${encodeURIComponent(file.path)}`)
          .then((hashData) => setPropertiesInfo((current) => current ? { ...current, hash: hashData.sha256 } : current))
          .catch(() => {});
      }
    } catch (error) {
      setPropertiesInfo({ loading: false, data: null, hash: null, error: error.message });
    }
  }

  async function toggleBookmark(pathname) {
    const existing = bookmarks.find((b) => b.path === pathname);
    try {
      if (existing) {
        await apiFetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove', path: pathname }),
        });
      } else {
        const name = pathname === '/' ? 'ROOT' : pathname.split('/').pop();
        await apiFetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', path: pathname, name }),
        });
      }
      await loadBookmarks();
    } catch (error) {
      addToast('BOOKMARK_ERROR', error.message, 0);
    }
  }

  function runContextAction(action, file = contextMenu?.file) {
    if (!file) return;
    setContextMenu(null);
    if (action === 'inspect' && !file.isDir) confirmIfDirty(() => openPreview(file));
    if (action === 'download') {
      startDownload(file.path);
      addTransfer(`DOWNLOAD ${file.name}`);
    }
    if (action === 'rename') renamePath(file.path, file.name);
    if (action === 'move') movePath(file.path, file.name);
    if (action === 'duplicate') duplicatePath(file.path, file.name);
    if (action === 'properties') showProperties(file);
    if (action === 'bookmark') toggleBookmark(file.path);
    if (action === 'delete') {
      confirmAction(
        'CONFIRM_PURGE',
        `DELETE ${file.name.toUpperCase()}? THIS CANNOT BE UNDONE.`,
        async () => deletePaths([file.path], file.name.toUpperCase()),
        'PURGE',
        true
      );
    }
  }

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setLoginError('');
    try {
      await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setIsAuthed(true);
      setPassword('');
      await bootstrap('/');
    } catch (error) {
      setLoginError(error.message || 'ACCESS_DENIED');
    } finally {
      setBusy(false);
      setAuthChecked(true);
    }
  }

  async function handleLogout() {
    if (preview.dirty) {
      confirmAction('UNSAVED_CHANGES', 'You have unsaved changes. Discard them and logout?', async () => {
        await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
        setIsAuthed(false);
        setFiles([]);
        setPreview({ open: false, file: null, content: '', loading: false, editable: false, hash: '—', error: '', dirty: false, mediaType: '' });
        setActivePanel('explorer');
      }, 'DISCARD', true);
      return;
    }
    await apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
    setIsAuthed(false);
    setFiles([]);
    setPreview({ open: false, file: null, content: '', loading: false, editable: false, hash: '—', error: '', dirty: false, mediaType: '' });
    setActivePanel('explorer');
  }

  if (!authChecked) {
    return <div className="boot-screen">Loading...</div>;
  }

  if (!isAuthed) {
    return (
      <LoginScreen
        password={password}
        setPassword={setPassword}
        loginError={loginError}
        busy={busy}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        isMobile={isMobile}
        setSidebarOpen={setSidebarOpen}
        currentPath={currentPath}
        goBack={goBack}
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        mobileSearchOpen={mobileSearchOpen}
        setMobileSearchOpen={setMobileSearchOpen}
        filterQuery={filterQuery}
        setFilterQuery={setFilterQuery}
        onLogout={handleLogout}
      />

      <AppSidebar
        isOpen={sidebarOpen}
        bookmarks={bookmarks}
        currentPath={currentPath}
        onNavigate={navigate}
        onClose={() => setSidebarOpen(false)}
        disk={disk}
        onToggleBookmark={toggleBookmark}
      />

      <main className="main-shell">
        {activePanel === 'explorer' ? (
          <section className="panel explorer-panel">
            <div className="hero-card">
              <div>
                <div className="eyebrow">SYSTEM PATH</div>
                <div className="breadcrumb">
                  <button onClick={() => navigate('/')} type="button">/ROOT</button>
                  {breadcrumbs.map((crumb, index) => {
                    const crumbPath = '/' + breadcrumbs.slice(0, index + 1).join('/');
                    const isLast = index === breadcrumbs.length - 1;
                    return (
                      <React.Fragment key={crumbPath}>
                        <span>/</span>
                        {isLast ? (
                          <strong>{crumb.toUpperCase()}</strong>
                        ) : (
                          <button onClick={() => navigate(crumbPath)} type="button">{crumb.toUpperCase()}</button>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="hero-meta">
                  <span>Objects: {files.length}</span>
                  <span>Size: {fmtSize(totalBytes)}</span>
                </div>
              </div>
              <div className="hero-actions">
                <div className="toggle-shell">
                  <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} type="button">
                    <span className="material-symbols-outlined">format_list_bulleted</span>
                  </button>
                  <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} type="button">
                    <span className="material-symbols-outlined">grid_view</span>
                  </button>
                </div>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                  {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>SORT: {label}</option>)}
                </select>
                <button className="secondary-button" onClick={createDirectory} type="button">NEW_DIR</button>
                <button className="secondary-button" onClick={createFile} type="button">NEW_FILE</button>
                <button className="secondary-button" onClick={triggerFileUpload} type="button">UPLOAD</button>
                <button className="primary-button" onClick={triggerFolderUpload} type="button">UPLOAD_DIR</button>
              </div>
            </div>

            {selectedCount ? (
              <div className="selection-bar">
                <div className="eyebrow">SELECTION</div>
                <strong>{selectedCount} SELECTED</strong>
                <div className="selection-actions">
                  <button className="secondary-button" onClick={selectAll} type="button">SELECT_ALL</button>
                  <button className="secondary-button" onClick={duplicateSelected} type="button">DUPLICATE</button>
                  <button className="secondary-button" onClick={downloadSelected} type="button">DOWNLOAD</button>
                  <button className="secondary-button" onClick={moveSelected} type="button">MOVE</button>
                  <button className="danger-button" onClick={deleteSelected} type="button">DELETE</button>
                  <button className="secondary-button" onClick={() => setSelectedPaths([])} type="button">CLEAR</button>
                </div>
              </div>
            ) : null}

            <div
              className="file-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                uploadCollection(event.dataTransfer.files, false);
              }}
            >
              {searchResults !== null ? (
                <div>
                  <div className="selection-bar">
                    <div className="eyebrow">{searchLoading ? 'Searching...' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}</div>
                    <button className="secondary-button" onClick={() => setFilterQuery('')} type="button">CLEAR</button>
                  </div>
                  {!searchResults.length && !searchLoading ? (
                    <div className="empty-state compact">
                      <h3>No results</h3>
                      <p>No files matching "{filterQuery}" were found.</p>
                    </div>
                  ) : (
                    filteredFiles.map((result) => {
                      const pathname = result.path;
                      return (
                        <div
                          key={pathname}
                          className="list-row"
                          onClick={() => handleItemActivate(result)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleItemActivate(result);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="row-name">
                            <span className="material-symbols-outlined">{iconFor(result.name, result.isDir)}</span>
                            <div>
                              <span>{result.name}</span>
                              <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>{pathname}</span>
                            </div>
                          </div>
                          <span className="pill">{result.isDir ? 'DIR' : badgeFor(result.name, false)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : !filteredFiles.length ? (
                <div className="empty-state">
                  <h3>EMPTY_DIRECTORY</h3>
                  <p>THIS LOCATION HAS NO VISIBLE OBJECTS.</p>
                </div>
              ) : viewMode === 'list' ? (
                <div className="list-table">
                  <div className="list-header">
                    <span />
                    <span>NAME</span>
                    <span>SIZE</span>
                    <span>PERMISSIONS</span>
                    <span>LAST_MODIFIED</span>
                  </div>
                  {filteredFiles.map((file) => {
                    const pathname = file.path || joinPath(currentPath, file.name);
                    const selected = selectedPaths.includes(pathname) || pathname === selectedFilePath;
                    return (
                      <FileListRow
                        key={pathname}
                        file={file}
                        pathname={pathname}
                        selected={selected}
                        isSelected={selectedPaths.includes(pathname)}
                        onSelect={selectFile}
                        onActivate={handleItemActivate}
                        onContextMenu={openContextMenu}
                        onToggleSelect={toggleSelect}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="grid-view">
                  {filteredFiles.map((file) => {
                    const pathname = file.path || joinPath(currentPath, file.name);
                    const selected = selectedPaths.includes(pathname) || pathname === selectedFilePath;
                    return (
                      <FileGridCard
                        key={pathname}
                        file={file}
                        pathname={pathname}
                        selected={selected}
                        isSelected={selectedPaths.includes(pathname)}
                        onSelect={selectFile}
                        onActivate={handleItemActivate}
                        onContextMenu={openContextMenu}
                        onToggleSelect={toggleSelect}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activePanel === 'transfers' ? (
          <section className="panel">
            <div className="section-card">
              <div className="eyebrow">TRANSFERS_LOG</div>
              {transfers.length ? (
                <table className="transfers-table">
                  <thead>
                    <tr>
                      <th>TIME</th>
                      <th>OPERATION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((transfer, i) => (
                      <tr key={`${transfer.time}-${i}`}>
                        <td className="transfer-time">{transfer.time}</td>
                        <td className="transfer-op">{transfer.line}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="muted-copy">NO_TRANSFERS_YET</p>}
            </div>
          </section>
        ) : null}

        {activePanel === 'security' ? (
          <section className="panel">
            <div className="section-card">
              <div className="eyebrow">SECURITY_STATUS</div>
              <DetailRow label="SESSION" value="ACTIVE" accent />
              <DetailRow label="COOKIE_MODE" value="HTTPONLY / SAMESITE=LAX" />
              <DetailRow label="ROOT_DIR" value={currentPath} />
              <DetailRow label="DISK_USAGE" value={disk ? `${disk.usedPercent.toFixed(1)}%` : '—'} />
              <button className="primary-button" onClick={handleLogout} type="button">LOGOUT</button>
            </div>
          </section>
        ) : null}

        {activePanel === 'preview' && preview.file ? (
          <PreviewPanel
            preview={preview}
            setPreview={setPreview}
            onNavigateBack={() => setActivePanel('explorer')}
            onSave={savePreview}
            onDownload={startDownload}
            onConfirmAction={confirmAction}
            onDeletePaths={deletePaths}
            confirmIfDirty={confirmIfDirty}
          />
        ) : null}
      </main>

      <footer className="statusbar">
        <div className="status-group">
          <span className="status-dot" />
          <span>Connected</span>
        </div>
        <div className="status-group">
          <span>{files.length} items</span>
        </div>
      </footer>

      <input ref={fileInputRef} hidden multiple type="file" onChange={(event) => uploadCollection(event.target.files, false)} />
      <input ref={folderInputRef} hidden multiple type="file" onChange={(event) => uploadCollection(event.target.files, true)} />

      {contextMenu ? (
        <div
          className="context-menu"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 340), left: Math.min(contextMenu.x, window.innerWidth - 210) }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === 'Escape') setContextMenu(null); }}
        >
          {!contextMenu.file.isDir ? (
            <button onClick={() => runContextAction('inspect')} type="button">
              <span className="material-symbols-outlined">visibility</span>
              INSPECT
            </button>
          ) : null}
          <button onClick={() => runContextAction('download')} type="button">
            <span className="material-symbols-outlined">download</span>
            DOWNLOAD
          </button>
          <button onClick={() => runContextAction('duplicate')} type="button">
            <span className="material-symbols-outlined">content_copy</span>
            DUPLICATE
          </button>
          <button onClick={() => runContextAction('rename')} type="button">
            <span className="material-symbols-outlined">edit</span>
            RENAME
          </button>
          <button onClick={() => runContextAction('move')} type="button">
            <span className="material-symbols-outlined">drive_file_move</span>
            MOVE
          </button>
          {contextMenu.file.isDir ? (
            <button onClick={() => runContextAction('bookmark')} type="button">
              <span className="material-symbols-outlined">{bookmarks.find((b) => b.path === contextMenu.file.path) ? 'bookmark_remove' : 'bookmark_add'}</span>
              {bookmarks.find((b) => b.path === contextMenu.file.path) ? 'UNBOOKMARK' : 'BOOKMARK'}
            </button>
          ) : null}
          <button onClick={() => runContextAction('properties')} type="button">
            <span className="material-symbols-outlined">info</span>
            PROPERTIES
          </button>
          <button className="danger" onClick={() => runContextAction('delete')} type="button">
            <span className="material-symbols-outlined">delete_forever</span>
            PURGE
          </button>
        </div>
      ) : null}

      {modal ? (
        <Modal
          modal={modal}
          onClose={() => setModal(null)}
          onSubmit={async (value) => {
            const action = modal.onConfirm;
            setModal(null);
            try {
              await action(value);
            } catch (error) {
              addToast('ACTION_FAILED', error.message || 'Request failed', 0);
            }
          }}
        />
      ) : null}

      {toast ? (
        <div className="toast">
          <strong>{toast.title}</strong>
          <span>{toast.detail}</span>
          <div className="meter"><div style={{ width: `${toast.progress}%` }} /></div>
        </div>
      ) : null}

      {propertiesInfo ? (
        <div className="modal-backdrop" onClick={() => setPropertiesInfo(null)} role="presentation">
          <div className="modal-shell properties-shell" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            {propertiesInfo.loading ? (
              <div className="empty-state compact"><h3>LOADING_PROPERTIES</h3></div>
            ) : propertiesInfo.error ? (
              <div className="empty-state compact"><h3>PROPERTIES_ERROR</h3><p>{propertiesInfo.error}</p></div>
            ) : propertiesInfo.data ? (
              <>
                <div className="eyebrow">PROPERTIES_INSPECTOR</div>
                <h3>{propertiesInfo.data.name.toUpperCase()}</h3>
                <DetailRow label="TYPE" value={propertiesInfo.data.isDir ? 'DIRECTORY' : 'FILE'} />
                <DetailRow label="PATH" value={propertiesInfo.data.path} />
                {!propertiesInfo.data.isDir ? (
                  <DetailRow label="SIZE" value={fmtSize(propertiesInfo.data.size)} />
                ) : null}
                <DetailRow label="MODIFIED" value={fmtDate(propertiesInfo.data.modified)} />
                <DetailRow label="PERMISSIONS" value={propertiesInfo.data.perms} />
                {!propertiesInfo.data.isDir ? (
                  <div className="checksum-card">SHA256: {propertiesInfo.hash || 'COMPUTING...'}</div>
                ) : null}
                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => setPropertiesInfo(null)} type="button">CLOSE</button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
