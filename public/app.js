'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let currentPath  = '/';
let allFiles = [], filteredFiles = [];
let viewMode = window.innerWidth <= 767 ? 'grid' : 'list';
let sortMode = 'name';
let selectedFile = null, ctxTarget = null, modalAction = null;
let selectedPaths = {};
let toastTimer = null, lpTimer = null, fabOpen = false, mobileSearchOpen = false;
let terminalLines = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isMobile(){ return window.innerWidth <= 767; }
function joinPath(base, name){ return (base.endsWith('/') ? base : base + '/') + name; }
function getExt(name){ var p = name.split('.'); return p.length > 1 ? p.pop().toLowerCase() : ''; }
function escHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function esc(s){ return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s){ return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fmtSize(b){
  if(!b && b !== 0) return '—';
  if(b < 1024) return b + ' B';
  if(b < 1048576) return (b/1024).toFixed(1) + ' KB';
  if(b < 1073741824) return (b/1048576).toFixed(1) + ' MB';
  return (b/1073741824).toFixed(1) + ' GB';
}
function fmtDate(d){ if(!d) return '—'; return new Date(d).toISOString().replace('T',' ').slice(0,16); }

function selectedList(){
  return Object.keys(selectedPaths).filter(function(p){ return !!selectedPaths[p]; });
}
function clearSelection(){
  selectedPaths = {};
  updateSelectionBar();
  renderFiles();
}
function toggleSelectPath(p){
  selectedPaths[p] = !selectedPaths[p];
  updateSelectionBar();
  renderFiles();
}
function updateSelectionBar(){
  var n = selectedList().length;
  var bar = document.getElementById('selection-bar');
  if(!bar) return;
  bar.style.display = n ? 'flex' : 'none';
  document.getElementById('selection-count').textContent = n + ' SELECTED';
}

function fileIconName(name, isDir){
  if(isDir) return 'folder';
  var e = getExt(name);
  var m = {
    js:'javascript', ts:'javascript', jsx:'javascript', tsx:'javascript',
    py:'code', c:'code', cpp:'code', h:'code', java:'code', go:'code', rs:'code', rb:'code', php:'code',
    sh:'terminal', bash:'terminal',
    html:'language', css:'palette', json:'data_object', yaml:'data_object', yml:'data_object', xml:'data_object',
    md:'description', txt:'description',
    pdf:'picture_as_pdf', doc:'description', docx:'description',
    xls:'table_chart', xlsx:'table_chart',
    zip:'folder_zip', tar:'folder_zip', gz:'folder_zip', rar:'folder_zip',
    png:'image', jpg:'image', jpeg:'image', gif:'image', svg:'image', webp:'image',
    mp4:'video_file', mov:'video_file', avi:'video_file', mkv:'video_file',
    mp3:'audio_file', wav:'audio_file', flac:'audio_file',
    sql:'database', db:'database', sqlite:'database',
    env:'lock', pem:'lock', key:'lock', cert:'lock'
  };
  return m[e] || 'insert_drive_file';
}

function fileTypeBadge(name, isDir){
  if(isDir) return 'DIR';
  var e = getExt(name);
  var m = {
    js:'SRC', ts:'SRC', jsx:'SRC', tsx:'SRC', py:'SRC', c:'SRC', cpp:'SRC', go:'SRC', rs:'SRC', rb:'SRC', php:'SRC',
    sh:'SH', bash:'SH', html:'WEB', css:'WEB',
    zip:'ARC', tar:'ARC', gz:'ARC', rar:'ARC',
    png:'IMG', jpg:'IMG', jpeg:'IMG', gif:'IMG', svg:'IMG', webp:'IMG',
    mp4:'VID', mov:'VID', mkv:'VID', mp3:'AUD', wav:'AUD',
    pdf:'PDF', doc:'DOC', docx:'DOC', json:'CFG', yaml:'CFG', yml:'CFG',
    env:'SEC', pem:'SEC', key:'SEC', cert:'SEC',
    md:'TXT', txt:'TXT', sql:'DB', db:'DB'
  };
  return m[e] || (e ? e.toUpperCase().slice(0,4) : 'FILE');
}

// Set session time
document.getElementById('session-start').textContent =
  new Date().toISOString().replace('T',' ').slice(11,19) + ' UTC';

// ── View toggle UI ────────────────────────────────────────────────────────────
function setViewUI(){
  var lb = document.getElementById('list-btn'), gb = document.getElementById('grid-btn');
  if(!lb || !gb) return;
  if(viewMode === 'list'){
    lb.style.background = '#00FF41'; lb.style.color = '#000';
    gb.style.background = ''; gb.style.color = '';
  } else {
    gb.style.background = '#00FF41'; gb.style.color = '#000';
    lb.style.background = ''; lb.style.color = '';
  }
}
setViewUI();

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(title, sub, pct){
  clearTimeout(toastTimer);
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-sub').textContent = sub || '';
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('toast').style.display = 'block';
}
function autoHideToast(){
  toastTimer = setTimeout(function(){
    document.getElementById('toast').style.display = 'none';
    document.getElementById('progress-fill').style.width = '0%';
  }, 2500);
}

// ── Terminal widget ───────────────────────────────────────────────────────────
function addTerminalLine(line){
  terminalLines.push(line);
  if(terminalLines.length > 7) terminalLines.shift();
  var body = document.getElementById('terminal-log-body');
  if(!body) return;
  body.innerHTML = terminalLines.map(function(l){
    return '<div>&gt; ' + escHtml(l) + '</div>';
  }).join('') +
    '<div class="flex items-center">&gt; WATCHING_FS <span class="inline-block w-2 h-3 bg-[#00FF41] cursor-blink align-middle ml-1"></span></div>';
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function login(){
  var pwd = document.getElementById('pwd-input').value;
  fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pwd})})
    .then(function(r){
      if(r.ok){
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('scanline-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        loadFiles('/');
        loadDisk();
        loadBookmarks();
      } else {
        document.getElementById('login-error').style.display = 'block';
      }
    }).catch(function(){ document.getElementById('login-error').style.display = 'block'; });
}
document.getElementById('pwd-input').addEventListener('keydown', function(e){ if(e.key==='Enter') login(); });

function logout(){
  fetch('/api/logout',{method:'POST'}).then(function(){
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('scanline-overlay').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    document.getElementById('pwd-input').value = '';
    document.getElementById('login-error').style.display = 'none';
  });
}

function loadDisk(){
  fetch('/api/disk')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(!d || typeof d.usedPercent !== 'number') return;
      var pct = Math.max(0, Math.min(100, d.usedPercent));
      var elPct = document.getElementById('disk-pct');
      var elBar = document.getElementById('disk-bar');
      if(elPct) elPct.textContent = pct.toFixed(1) + '%';
      if(elBar) elBar.style.width = pct + '%';
    })
    .catch(function(){
      var elPct = document.getElementById('disk-pct');
      if(elPct) elPct.textContent = '—';
    });
}

function loadBookmarks(){
  fetch('/api/bookmarks')
    .then(function(r){ return r.json(); })
    .then(function(d){
      var nav = document.getElementById('sidebar-nav');
      if(!nav) return;
      var bms = (d && d.bookmarks) ? d.bookmarks : [{name:'ROOT',path:'/'}];
      nav.innerHTML = bms.map(function(b, i){
        var icon = (i===0) ? 'folder_open' : 'folder';
        var cls = 'sidebar-link flex items-center gap-2 px-4 py-2 w-full font-grotesk uppercase tracking-tight text-xs cursor-pointer text-zinc-400 hover:bg-[#1A1A1A] hover:text-[#00FF41]';
        if(i===0) cls = 'sidebar-link flex items-center gap-2 px-4 py-2 w-full font-grotesk font-bold uppercase tracking-tight text-xs cursor-pointer';
        return '<button class="'+cls+'" data-path="'+escAttr(b.path)+'" onclick="navigate(\''+esc(b.path)+'\');closeSidebar()">' +
          '<span class="material-symbols-outlined">'+icon+'</span><span>'+escHtml(String(b.name||b.path).toUpperCase())+'</span></button>';
      }).join('');
      updateSidebarActive();
    })
    .catch(function(){});
}

fetch('/api/check').then(function(r){ return r.json(); }).then(function(d){
  if(d.auth){
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    loadFiles('/');
    loadDisk();
    loadBookmarks();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('scanline-overlay').style.display = 'block';
  }
});

// ── Sidebar ───────────────────────────────────────────────────────────────────
function toggleSidebar(){
  var s = document.getElementById('app-sidebar');
  var b = document.getElementById('sidebar-backdrop');
  var open = s.classList.toggle('open');
  b.classList.toggle('open', open);
}
function closeSidebar(){
  document.getElementById('app-sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigate(p){ closeSidebar(); showExplorer(); loadFiles(p); }
function refreshFiles(){ loadFiles(currentPath); }
function goBack(){
  var parts = currentPath.split('/').filter(Boolean);
  parts.pop();
  navigate('/' + (parts.join('/') || ''));
}
function showExplorer(){
  document.getElementById('explorer-view').style.display = '';
  document.getElementById('preview-view').style.display = 'none';
  document.getElementById('transfers-view').style.display = 'none';
  document.getElementById('security-view').style.display = 'none';
  if(viewMode === 'grid') document.getElementById('terminal-widget').style.display = 'block';
  else document.getElementById('terminal-widget').style.display = 'none';
  setNav('explorer');
}

function showTransfers(){
  document.getElementById('explorer-view').style.display = 'none';
  document.getElementById('preview-view').style.display = 'none';
  document.getElementById('transfers-view').style.display = '';
  document.getElementById('security-view').style.display = 'none';
  document.getElementById('terminal-widget').style.display = 'none';
  setNav('transfers');
  renderTransfersLog();
}

function showSecurity(){
  document.getElementById('explorer-view').style.display = 'none';
  document.getElementById('preview-view').style.display = 'none';
  document.getElementById('transfers-view').style.display = 'none';
  document.getElementById('security-view').style.display = '';
  document.getElementById('terminal-widget').style.display = 'none';
  setNav('security');
}

function setNav(which){
  var a = {'explorer':'nav-explorer','transfers':'nav-transfers','security':'nav-security'};
  Object.keys(a).forEach(function(k){
    var el = document.getElementById(a[k]);
    if(!el) return;
    el.style.color = (k===which) ? '#00FF41' : '';
    el.style.fontWeight = (k===which) ? '700' : '';
  });
}

var transfers = [];
function addTransferLine(line){
  transfers.push({ t: new Date().toISOString().slice(11,19)+' UTC', line: line });
  if(transfers.length > 50) transfers.shift();
}
function renderTransfersLog(){
  var el = document.getElementById('transfers-log');
  if(!el) return;
  if(!transfers.length){
    el.innerHTML = '<div class="text-zinc-500 uppercase text-[10px]">NO_TRANSFERS_YET</div>';
    return;
  }
  el.innerHTML = transfers.slice().reverse().map(function(x){
    return '<div class="flex justify-between border-b border-[#333333] py-2"><span class="text-zinc-500">'+escHtml(x.t)+'</span><span class="text-zinc-300 uppercase">'+escHtml(x.line)+'</span></div>';
  }).join('');
}

function toggleTerminalWidget(){
  var w = document.getElementById('terminal-widget');
  if(!w) return;
  var open = w.style.display !== 'none';
  w.style.display = open ? 'none' : 'block';
}

function triggerDeepScan(){
  showToast('DEEP_SCAN','SCANNING...',30);
  loadDisk();
  setTimeout(function(){ showToast('DEEP_SCAN','VERIFIED',100); autoHideToast(); }, 600);
}

function loadFiles(dir){
  currentPath = dir;
  selectedPaths = {};
  updateSelectionBar();
  updateBreadcrumb();
  updateSidebarActive();
  updateBackBtn();
  showExplorer();
  addTerminalLine('LS ' + dir.toUpperCase());
  fetch('/api/files?path=' + encodeURIComponent(dir))
    .then(function(r){ return r.json(); })
    .then(function(data){
      allFiles = data.files || [];
      addTerminalLine('FOUND ' + allFiles.length + ' OBJECTS');
      applySort();
      renderFiles();
      updateSizeBar();
      updateSelectionBar();
    })
    .catch(function(){ showEmpty('ERROR: Cannot read directory'); });
}

function updateBackBtn(){
  var btn = document.getElementById('btn-back');
  if(btn) btn.style.display = (isMobile() && currentPath !== '/') ? 'flex' : 'none';
}
function updateSizeBar(){
  var total = allFiles.reduce(function(a,f){ return a + (f.size||0); }, 0);
  document.getElementById('file-count-bar').textContent = 'OBJECTS: ' + allFiles.length;
  document.getElementById('size-bar').textContent = 'SIZE: ' + (total > 0 ? fmtSize(total) : '—');
}

// ── Files ─────────────────────────────────────────────────────────────────────
function filterFiles(q){
  filteredFiles = q
    ? allFiles.filter(function(f){ return f.name.toLowerCase().indexOf(q.toLowerCase()) >= 0; })
    : [].concat(allFiles);
  renderFiles();
}
function applySort(){
  filteredFiles = [].concat(allFiles);
  filteredFiles.sort(function(a,b){
    if(a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if(sortMode==='name') return a.name.localeCompare(b.name);
    if(sortMode==='size') return (b.size||0) - (a.size||0);
    if(sortMode==='date') return new Date(b.modified) - new Date(a.modified);
    if(sortMode==='type') return getExt(a.name).localeCompare(getExt(b.name));
    return 0;
  });
}
function sortFiles(mode){ sortMode = mode; applySort(); renderFiles(); }

function renderFiles(){
  var c = document.getElementById('files-container');
  if(!filteredFiles.length){ showEmpty('EMPTY_DIRECTORY'); return; }
  if(viewMode === 'list'){
    renderListView(c);
    document.getElementById('terminal-widget').style.display = 'none';
  } else {
    renderGridView(c);
    document.getElementById('terminal-widget').style.display = 'block';
  }
}

// ── List view ─────────────────────────────────────────────────────────────────
function renderListView(c){
  var html = '';

  // Header
  html += '<div class="grid border-b border-[#333333] bg-[#1A1A1A] font-grotesk text-[10px] uppercase tracking-widest text-zinc-500 py-2 px-4" style="grid-template-columns:28px 1fr 80px 130px 100px 150px">';
  html += '<div></div><div>NAME</div><div class="text-right">SIZE</div>';
  html += '<div class="text-center hidden md:block">PERMISSIONS</div>';
  html += '<div class="text-center hidden md:block">SHA-256</div>';
  html += '<div class="text-right">LAST_MODIFIED</div>';
  html += '</div>';

  html += '<div class="flex flex-col border-x border-[#333333]">';
  filteredFiles.forEach(function(f){
    var fp = joinPath(currentPath, f.name);
    var sel = selectedFile === f.name;
    var isSel = !!selectedPaths[fp];
    var perms = f.perms || '—';
    var icon  = fileIconName(f.name, f.isDir);

    var rowBase = 'grid border-b py-3 px-4 items-center cursor-pointer font-grotesk text-xs';
    var rowStyle = 'grid-template-columns:1fr 80px 130px 100px 150px';
    var rowCls = (sel || isSel)
      ? rowBase + ' border-[#00FF41] bg-[#1A1A1A]'
      : rowBase + ' border-[#333333] hover:bg-[#1A1A1A] group';

    html += '<div class="' + rowCls + '" style="' + rowStyle + '"'
      + ' data-name="' + escAttr(f.name) + '" data-isdir="' + f.isDir + '"'
      + ' onclick="selectFile(\'' + esc(f.name) + '\',' + f.isDir + ',\'' + esc(fp) + '\')"'
      + ' ondblclick="' + (f.isDir ? 'navigate(\'' + esc(fp) + '\')' : 'previewFile(\'' + esc(f.name) + '\')') + '"'
      + ' oncontextmenu="showCtx(event,\'' + esc(f.name) + '\',' + f.isDir + ')">';

    // Checkbox
    html += '<div class="flex items-center justify-center">';
    html += '<input type="checkbox" ' + (isSel ? 'checked ' : '') +
      'onclick="event.stopPropagation();toggleSelectPath(\''+esc(fp)+'\')" class="h-4 w-4 accent-[#00FF41]" />';
    html += '</div>';

    // Name
    html += '<div class="flex items-center gap-2 min-w-0">';
    html += '<span class="material-symbols-outlined flex-shrink-0 ' + (sel||f.isDir ? 'text-[#00FF41]' : 'text-zinc-400 group-hover:text-[#00FF41]') + '" style="font-size:16px">' + icon + '</span>';
    html += '<span class="truncate font-bold ' + (sel ? 'text-[#00FF41] blink-cursor' : (f.isDir ? 'text-[#00FF41]' : 'text-zinc-300 group-hover:text-[#00FF41]')) + '">' + escHtml(f.name.toUpperCase()) + '</span>';
    html += '</div>';

    // Size
    html += '<div class="text-right ' + (sel ? 'text-[#00FF41]' : 'text-zinc-500') + '">' + (f.isDir ? '--' : fmtSize(f.size)) + '</div>';

    // Permissions
    html += '<div class="text-center hidden md:flex justify-center">';
    html += '<span class="px-1.5 py-0.5 border font-grotesk text-[10px] ' + (sel ? 'border-[#00FF41] text-[#00FF41] bg-[#003907]' : 'border-[#333333] text-zinc-400') + '">' + perms + '</span>';
    html += '</div>';

    // Hash
    html += '<div class="text-center hidden md:block font-grotesk text-[10px] ' + (sel ? 'text-[#00FF41]' : 'text-zinc-600') + '">—</div>';

    // Date
    html += '<div class="text-right ' + (sel ? 'text-[#00FF41]' : 'text-zinc-500') + '">' + fmtDate(f.modified) + '</div>';

    html += '</div>';
  });
  html += '</div>';

  c.innerHTML = html;
  c.style.position = 'relative';
  attachDrop(c);
}

// ── Grid view ─────────────────────────────────────────────────────────────────
function renderGridView(c){
  var html = '<div class="grid gap-px bg-[#333333] border border-[#333333]" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">';

  filteredFiles.forEach(function(f){
    var fp   = joinPath(currentPath, f.name);
    var sel  = selectedFile === f.name;
    var isSel = !!selectedPaths[fp];
    var badge = fileTypeBadge(f.name, f.isDir);
    var icon  = fileIconName(f.name, f.isDir);
    var ext   = getExt(f.name);
    var isCode = ['js','ts','jsx','tsx','py','c','cpp','sh','bash','json','yaml','yml','html','css','go','rs','rb','php','txt','md'].indexOf(ext) >= 0;

    html += '<div class="bg-[#1A1A1A] p-4 flex flex-col gap-3 cursor-pointer border ' + (isSel ? 'border-[#00FF41]' : 'border-transparent') + ' hover:border-[#00FF41] active:bg-[#1A1A1A]/50 relative"'
      + ' data-name="' + escAttr(f.name) + '" data-isdir="' + f.isDir + '"'
      + ' onclick="selectFile(\'' + esc(f.name) + '\',' + f.isDir + ',\'' + esc(fp) + '\')"'
      + ' ondblclick="' + (f.isDir ? 'navigate(\'' + esc(fp) + '\')' : 'previewFile(\'' + esc(f.name) + '\')') + '"'
      + ' oncontextmenu="showCtx(event,\'' + esc(f.name) + '\',' + f.isDir + ')">';

    if(isSel) html += '<div class="absolute top-2 right-2 w-2 h-2 bg-[#00FF41]"></div>';
    html += '<div class="absolute top-2 left-2">';
    html += '<input type="checkbox" ' + (isSel ? 'checked ' : '') +
      'onclick="event.stopPropagation();toggleSelectPath(\''+esc(fp)+'\')" class="h-4 w-4 accent-[#00FF41]" />';
    html += '</div>';

    html += '<div class="flex justify-between items-start">';
    html += '<span class="material-symbols-outlined text-4xl ' + (sel||f.isDir ? 'text-[#00FF41]' : 'text-zinc-500') + '">' + icon + '</span>';
    html += '<span class="font-grotesk text-[10px] px-1 border ' + (sel ? 'border-[#00FF41] text-[#00FF41]' : 'border-zinc-700 text-zinc-600') + '">' + badge + '</span>';
    html += '</div>';

    if(isCode && !f.isDir){
      html += '<div class="h-12 w-full bg-[#131313] border border-[#333333] p-2 overflow-hidden">';
      html += '<div class="font-grotesk text-[8px] text-[#00FF41] opacity-50 leading-tight">' + escHtml(f.name.toUpperCase()) + '</div>';
      html += '</div>';
    }

    html += '<div>';
    html += '<div class="font-grotesk text-xs font-bold ' + (sel ? 'text-[#00FF41]' : 'text-zinc-300') + ' uppercase truncate">' + escHtml(f.name.toUpperCase()) + '</div>';
    html += '<div class="font-grotesk text-[10px] text-zinc-600 uppercase">' + (f.isDir ? '—' : fmtSize(f.size)) + '</div>';
    html += '</div>';
    html += '</div>';
  });

  html += '</div>';
  c.innerHTML = html;
  attachDrop(c);
}

function showEmpty(msg){
  var c = document.getElementById('files-container');
  c.innerHTML = '<div class="border border-[#333333] p-8 text-center">'
    + '<div class="font-grotesk text-[#00FF41] text-xs uppercase tracking-widest mb-2">EMPTY_DIRECTORY</div>'
    + '<div class="font-grotesk text-zinc-600 text-[10px] uppercase">' + escHtml(msg) + '</div>'
    + '</div>';
  attachDrop(c);
}

function selectFile(name, isDir, fp){
  if(isMobile()){ if(isDir) navigate(fp); else previewFile(name); return; }
  selectedFile = (selectedFile === name) ? null : name;
  renderFiles();
}

function downloadSelected(){
  var paths = selectedList();
  if(!paths.length) return;
  showToast('PREPARING_DOWNLOAD...', paths.length+' ITEM(S)', 40);
  fetch('/api/batch/download', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ paths: paths })
  }).then(function(r){
    if(!r.ok) throw new Error();
    return r.blob();
  }).then(function(blob){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'download.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
    showToast('DOWNLOAD_READY','',100); autoHideToast();
  }).catch(function(){
    showToast('ERROR: DOWNLOAD_FAILED','',0); autoHideToast();
  });
}

function deleteSelected(){
  var paths = selectedList();
  if(!paths.length) return;
  showConfirm('CONFIRM_DELETE', 'DELETE ' + paths.length + ' ITEM(S)?\nOPERATION IS IRREVERSIBLE.', 'DELETE', function(){
    showToast('DELETING...', paths.length+' ITEM(S)', 50);
    fetch('/api/batch/delete', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ paths: paths })
    }).then(function(r){ return r.json(); })
      .then(function(d){
        if(d && d.ok){
          showToast('DELETED', (d.deleted||0)+' ITEM(S)', 100); autoHideToast();
          clearSelection();
          refreshFiles();
        } else {
          showToast('ERROR: DELETE_FAILED', (d && d.error) ? d.error : '', 0); autoHideToast();
        }
      })
      .catch(function(){ showToast('ERROR: DELETE_FAILED','',0); autoHideToast(); });
  });
}
function setView(mode){ viewMode = mode; setViewUI(); renderFiles(); }

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function updateBreadcrumb(){
  var parts = currentPath.split('/').filter(Boolean);
  var built = '';
  var html = '<span class="cursor-pointer hover:text-white" onclick="navigate(\'/\')">/ROOT</span>';
  parts.forEach(function(p, i){
    built += '/' + p; var pp = built;
    html += '<span class="text-zinc-700 mx-1">/</span>';
    if(i === parts.length - 1){
      html += '<span>' + escHtml(p.toUpperCase()) + '</span>';
    } else {
      html += '<span class="cursor-pointer hover:text-white" onclick="navigate(\'' + esc(pp) + '\')">' + escHtml(p.toUpperCase()) + '</span>';
    }
  });
  document.getElementById('breadcrumb').innerHTML = html;
}

function updateSidebarActive(){
  document.querySelectorAll('.sidebar-link').forEach(function(btn){
    var path = btn.getAttribute('data-path');
    var isActive = path === currentPath;
    btn.style.background = isActive ? '#00FF41' : '';
    btn.style.color = isActive ? '#000' : '';
    btn.style.fontWeight = isActive ? '900' : '';
  });
}

// ── Drag & drop ───────────────────────────────────────────────────────────────
function attachDrop(c){
  c.ondragover  = function(e){ e.preventDefault(); c.style.outline='2px dashed #00FF41'; c.style.outlineOffset='-4px'; };
  c.ondragleave = function(e){ if(!c.contains(e.relatedTarget)){ c.style.outline=''; c.style.outlineOffset=''; }};
  c.ondrop      = function(e){ e.preventDefault(); c.style.outline=''; c.style.outlineOffset=''; handleDrop(e); };
  c.ontouchstart = function(e){
    var el = e.target.closest('[data-name]'); if(!el) return;
    lpTimer = setTimeout(function(){
      showCtx({clientX:e.touches[0].clientX, clientY:e.touches[0].clientY, preventDefault:function(){}}, el.dataset.name, el.dataset.isdir==='true');
    }, 500);
  };
  c.ontouchend  = function(){ clearTimeout(lpTimer); };
  c.ontouchmove = function(){ clearTimeout(lpTimer); };
}

function handleDrop(e){
  var items = e.dataTransfer.items;
  if(!items || !items.length){ uploadFiles(e.dataTransfer.files, false); return; }
  var collected = [], promises = [];
  function readEntry(entry, basePath){
    if(entry.isFile){
      return new Promise(function(resolve){
        entry.file(function(f){
          var relPath = basePath + f.name;
          var file = new File([f], relPath, {type:f.type, lastModified:f.lastModified});
          file._rel = relPath; collected.push(file); resolve();
        });
      });
    } else if(entry.isDirectory){
      return new Promise(function(resolve){
        var reader = entry.createReader(), all = [];
        function readBatch(){
          reader.readEntries(function(batch){
            if(!batch.length){
              var p = Promise.resolve();
              all.forEach(function(ent){ p = p.then(function(){ return readEntry(ent, basePath+entry.name+'/'); }); });
              p.then(resolve);
            } else { all = all.concat(Array.from(batch)); readBatch(); }
          });
        }
        readBatch();
      });
    }
    return Promise.resolve();
  }
  for(var i=0; i<items.length; i++){
    var entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
    if(entry) promises.push(readEntry(entry,''));
  }
  Promise.all(promises).then(function(){
    if(collected.length > 0) uploadDropped(collected);
    else uploadFiles(e.dataTransfer.files, false);
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────
var UPLOAD_CONCURRENCY = 3;

function uploadConcurrent(arr, getDest, getFormField, doneTitle){
  var total = arr.length;
  var completed = 0;
  var idx = 0;
  var active = 0;
  var failed = 0;

  function pump(){
    while(active < UPLOAD_CONCURRENCY && idx < total){
      (function(file){
        active++;
        var dest = getDest(file);
        showToast('UPLOADING...', (completed+1)+' OF '+total, Math.round((completed/total)*100));
        var fd = new FormData();
        fd.append(getFormField(file), file);
        fetch('/api/upload?path='+encodeURIComponent(dest), { method:'POST', body: fd })
          .then(function(r){ if(!r.ok) throw new Error(); })
          .catch(function(){ failed++; })
          .finally(function(){
            active--; completed++;
            if(completed >= total){
              if(failed) showToast('UPLOAD_COMPLETE_WITH_ERRORS', failed+' FAILED', 100);
              else showToast(doneTitle || 'UPLOAD_COMPLETE', total+' FILE(S)', 100);
              autoHideToast();
              addTransferLine('UPLOAD ' + total + ' FILE(S) -> ' + currentPath);
              refreshFiles();
            } else {
              pump();
            }
          });
      })(arr[idx++]);
    }
  }

  pump();
}

function uploadDropped(files){
  uploadConcurrent(
    files,
    function(f){
      var parts = (f._rel||f.name).split('/'); parts.pop();
      var relDir = parts.join('/');
      return relDir ? (currentPath.replace(/\/$/,'') + '/' + relDir) : currentPath;
    },
    function(){ return 'files'; },
    'UPLOAD_COMPLETE'
  );
}
function triggerUpload(isFolder){
  if(isFolder) document.getElementById('folder-input').click();
  else document.getElementById('file-input').click();
}
function uploadFiles(files, isFolder){
  if(!files||!files.length) return;
  var arr = Array.from(files);
  if(isFolder){
    var folderName = arr[0].webkitRelativePath.split('/')[0];
    showToast('UPLOADING_DIR: '+folderName.toUpperCase(), arr.length+' FILES', 10);
    uploadConcurrent(
      arr,
      function(f){
        var parts = f.webkitRelativePath.split('/'); parts.pop();
        var relDir = parts.join('/');
        return relDir ? (currentPath.replace(/\/$/,'') + '/' + relDir) : currentPath;
      },
      function(){ return 'files'; },
      'DIR_UPLOAD_COMPLETE'
    );
  } else {
    uploadConcurrent(
      arr,
      function(){ return currentPath; },
      function(){ return 'files'; },
      'UPLOAD_COMPLETE'
    );
  }
  document.getElementById('file-input').value='';
  document.getElementById('folder-input').value='';
}

// ── Download ──────────────────────────────────────────────────────────────────
function dlItem(filePath, isDir){
  if(isDir){ showToast('ARCHIVING_DIR...','GENERATING ZIP',70); autoHideToast(); }
  var a=document.createElement('a'); a.href='/api/download?path='+encodeURIComponent(filePath); a.download='';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  addTransferLine('DOWNLOAD ' + (isDir ? 'DIR' : 'FILE') + ' ' + filePath);
}

// ── Preview ───────────────────────────────────────────────────────────────────
function previewFile(name){
  var fp = joinPath(currentPath, name);
  ctxTarget = {name:name, isDir:false, path:fp};
  var file = allFiles.find(function(f){ return f.name===name; });
  var ext = getExt(name);

  document.getElementById('preview-filename-bar').textContent = name.toUpperCase();
  document.getElementById('preview-meta-name').textContent    = name.toUpperCase();
  document.getElementById('meta-size').textContent     = file ? fmtSize(file.size) : '—';
  document.getElementById('meta-type').textContent     = ext.toUpperCase() || 'FILE';
  document.getElementById('meta-modified').textContent = file ? fmtDate(file.modified) : '—';
  document.getElementById('meta-perms').textContent    = (file && file.perms) ? file.perms : '—';
  document.getElementById('meta-hash').textContent     = 'SHA256: [COMPUTING...]';
  document.getElementById('preview-ext-label').textContent = ext.toUpperCase() || 'FILE';
  document.getElementById('preview-mode-label').textContent = 'MODE: READ_ONLY';
  document.getElementById('preview-save-btn').style.display = 'none';

  // Update labels
  var labelMap = {
    js:'SRC_CODE', ts:'SRC_CODE', py:'SRC_CODE', sh:'EXECUTABLE', bash:'EXECUTABLE',
    env:'SENSITIVE', pem:'SENSITIVE', key:'SENSITIVE',
    json:'CONFIG', yaml:'CONFIG', yml:'CONFIG',
    pdf:'DOCUMENT', doc:'DOCUMENT', docx:'DOCUMENT',
    zip:'ARCHIVE', tar:'ARCHIVE', gz:'ARCHIVE',
    png:'MEDIA', jpg:'MEDIA', jpeg:'MEDIA', mp4:'MEDIA', mov:'MEDIA', mp3:'MEDIA',
    sql:'DATABASE', db:'DATABASE'
  };
  var label = labelMap[ext] || 'FILE_SYSTEM';
  document.getElementById('meta-labels').innerHTML =
    '<span class="px-2 py-1 border border-[#00FF41] text-[#00FF41] font-grotesk text-[9px] uppercase">' + label + '</span>' +
    (ext ? '<span class="px-2 py-1 border border-[#333333] text-zinc-500 font-grotesk text-[9px] uppercase">' + ext.toUpperCase() + '</span>' : '');

  document.getElementById('explorer-view').style.display = 'none';
  document.getElementById('preview-view').style.display = 'block';
  document.getElementById('terminal-widget').style.display = 'none';

  var body = document.getElementById('preview-body-editor');
  var textExts = ['txt','md','js','ts','jsx','tsx','py','c','cpp','h','java','sh','bash','json','yaml','yml','env','gitignore','css','html','xml','sql','go','rs','php','rb','toml','ini','cfg','log','lock'];

  if(textExts.indexOf(ext) >= 0 || name.charAt(0) === '.'){
    body.innerHTML = '<div class="font-grotesk text-xs text-zinc-500 uppercase">LOADING_FILE_BUFFER...</div>';
    fetch('/api/preview?path='+encodeURIComponent(fp))
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d.error){
          body.innerHTML = '<div class="font-grotesk text-xs text-[#ffb4ab] uppercase">ERROR: '+escHtml(d.error)+'</div>';
        } else {
          var lines = d.content.split('\n');
          var nums = '';
          lines.forEach(function(_, i){ nums += (i+1)+'<br>'; });
          body.innerHTML =
            '<div class="flex">' +
            '<div class="w-10 text-zinc-700 text-right pr-3 select-none border-r border-[#1a2218] mr-3 font-grotesk text-xs leading-relaxed flex-shrink-0" style="min-width:2.5rem">' + nums + '</div>' +
            '<textarea id="preview-textarea" class="flex-1 bg-transparent text-[#dae6d2] font-grotesk text-xs leading-relaxed outline-none resize-none overflow-auto whitespace-pre" spellcheck="false"></textarea>' +
            '</div>';
          var ta = document.getElementById('preview-textarea');
          if(ta) ta.value = d.content;
          document.getElementById('preview-mode-label').textContent = 'MODE: EDIT';
          document.getElementById('preview-save-btn').style.display = 'inline-flex';
          fetch('/api/hash?path='+encodeURIComponent(fp))
            .then(function(r){ return r.json(); })
            .then(function(h){ if(h && h.sha256) document.getElementById('meta-hash').textContent = 'SHA256: ' + h.sha256; })
            .catch(function(){ document.getElementById('meta-hash').textContent = 'SHA256: —'; });
          addTerminalLine('INSPECT '+name.toUpperCase()+' [OK]');
        }
      })
      .catch(function(){ body.innerHTML = '<div class="font-grotesk text-xs text-[#ffb4ab] uppercase">ERROR: BUFFER_READ_FAILED</div>'; });
  } else {
    var imgExts = ['png','jpg','jpeg','gif','webp','svg'];
    var vidExts = ['mp4','mov','mkv','webm','avi'];
    var audExts = ['mp3','wav','flac','m4a','aac','ogg'];
    var isImg = imgExts.indexOf(ext) >= 0;
    var isVid = vidExts.indexOf(ext) >= 0;
    var isAud = audExts.indexOf(ext) >= 0;
    var isPdf = ext === 'pdf';
    var src = '/api/raw?path=' + encodeURIComponent(fp);

    if(isImg){
      body.innerHTML =
        '<div class="p-4">' +
        '<img src="'+src+'" alt="'+escAttr(name)+'" class="max-w-full max-h-[70vh] border border-[#333333] bg-black mx-auto" />' +
        '</div>';
    } else if(isVid){
      body.innerHTML =
        '<div class="p-4">' +
        '<video controls class="w-full max-h-[70vh] border border-[#333333] bg-black" src="'+src+'"></video>' +
        '</div>';
    } else if(isAud){
      body.innerHTML =
        '<div class="p-6 flex flex-col gap-4">' +
        '<div class="font-grotesk text-xs text-[#00FF41] uppercase">'+escHtml(name.toUpperCase())+'</div>' +
        '<audio controls class="w-full" src="'+src+'"></audio>' +
        '</div>';
    } else if(isPdf){
      body.innerHTML =
        '<div class="p-4">' +
        '<embed src="'+src+'" type="application/pdf" class="w-full border border-[#333333] bg-black" style="height:70vh" />' +
        '</div>';
    } else {
      body.innerHTML =
        '<div class="flex items-center justify-center min-h-48 h-full flex-col gap-4">' +
        '<span class="material-symbols-outlined text-zinc-700" style="font-size:64px">'+fileIconName(name,false)+'</span>' +
        '<div class="text-center">' +
        '<div class="font-grotesk text-xs text-[#00FF41] uppercase mb-1">'+escHtml(name.toUpperCase())+'</div>' +
        '<div class="font-grotesk text-[10px] text-zinc-500 uppercase">PREVIEW_UNAVAILABLE</div>' +
        '</div>' +
        '<button onclick="dlItem(\''+esc(fp)+'\',false)" class="px-4 py-2 bg-[#00FF41] text-black font-grotesk text-xs font-black uppercase hover:bg-white">DOWNLOAD_FILE</button>' +
        '</div>';
    }
    fetch('/api/hash?path='+encodeURIComponent(fp))
      .then(function(r){ return r.json(); })
      .then(function(h){ if(h && h.sha256) document.getElementById('meta-hash').textContent = 'SHA256: ' + h.sha256; })
      .catch(function(){ document.getElementById('meta-hash').textContent = 'SHA256: —'; });
    addTerminalLine('INSPECT '+name.toUpperCase()+' [BINARY]');
  }
}

function closePreview(){
  document.getElementById('explorer-view').style.display = '';
  document.getElementById('preview-view').style.display = 'none';
  if(viewMode === 'grid') document.getElementById('terminal-widget').style.display = 'block';
  ctxTarget = null;
}

function savePreview(){
  if(!ctxTarget || ctxTarget.isDir) return;
  var ta = document.getElementById('preview-textarea');
  if(!ta) return;
  showToast('SAVING...','',60);
  fetch('/api/file', {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ path: ctxTarget.path, content: ta.value })
  }).then(function(r){ return r.json(); })
    .then(function(d){
      if(d && d.ok){
        showToast('SAVED','',100); autoHideToast(); refreshFiles();
      } else {
        showToast('ERROR: SAVE_FAILED', (d && d.error) ? d.error : '', 0); autoHideToast();
      }
    })
    .catch(function(){ showToast('ERROR: SAVE_FAILED','',0); autoHideToast(); });
}

// ── Context menu ──────────────────────────────────────────────────────────────
function showCtx(e, name, isDir){
  e.preventDefault();
  ctxTarget = {name:name, isDir:isDir, path:joinPath(currentPath, name)};
  if(isMobile()){
    document.getElementById('sheet-title').textContent = name.toUpperCase();
    document.getElementById('sheet-preview-btn').style.display = isDir ? 'none' : 'flex';
    document.getElementById('sheet-backdrop').style.display = 'block';
    setTimeout(function(){ document.getElementById('ctx-sheet').classList.add('open'); }, 10);
  } else {
    document.getElementById('ctx-preview-btn').style.display = isDir ? 'none' : 'flex';
    var menu = document.getElementById('ctx-menu'); menu.style.display = 'block';
    menu.style.left = Math.min(e.clientX, window.innerWidth-200) + 'px';
    menu.style.top  = Math.min(e.clientY, window.innerHeight-180) + 'px';
  }
}
function closeSheet(){
  document.getElementById('ctx-sheet').classList.remove('open');
  document.getElementById('sheet-backdrop').style.display = 'none';
}
document.addEventListener('click', function(ev){
  document.getElementById('ctx-menu').style.display = 'none';
  if(fabOpen && !ev.target.closest('#fab-mobile') && !ev.target.closest('#fab-btn-mobile')) closeFab();
});

function ctxDownload(){ if(ctxTarget) dlItem(ctxTarget.path, ctxTarget.isDir); }
function ctxPreview(){  if(ctxTarget && !ctxTarget.isDir) previewFile(ctxTarget.name); }
function ctxRename(){
  if(!ctxTarget) return;
  showModal('RENAME_OBJECT', ctxTarget.name, 'EXECUTE', function(newName){
    fetch('/api/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oldPath:ctxTarget.path,newName:newName})})
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d.error){ showToast('RENAME_FAILED', d.error, 0); autoHideToast(); }
        else refreshFiles();
      });
  });
}
function ctxDelete(){
  if(!ctxTarget) return;
  var msg = 'PURGE \"' + ctxTarget.name.toUpperCase() + '\"?\n' +
    (ctxTarget.isDir ? 'WARNING: ALL CONTENTS WILL BE DELETED.\n' : '') +
    'OPERATION IS IRREVERSIBLE.';
  showConfirm('CONFIRM_PURGE', msg, 'PURGE', function(){
    fetch('/api/delete?path='+encodeURIComponent(ctxTarget.path),{method:'DELETE'})
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d.error){ showToast('PURGE_FAILED', d.error, 0); autoHideToast(); }
        else { addTerminalLine('PURGE '+ctxTarget.name.toUpperCase()+' [OK]'); closePreview(); refreshFiles(); }
      });
  });
}

// ── Create folder ─────────────────────────────────────────────────────────────
function showMkdir(){
  showModal('CREATE_DIRECTORY','','EXECUTE',function(name){
    fetch('/api/mkdir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:joinPath(currentPath,name)})})
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(d.error){ showToast('ERROR', d.error, 0); autoHideToast(); }
        else { addTerminalLine('MKDIR '+name.toUpperCase()+' [OK]'); refreshFiles(); }
      });
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(title, val, okLabel, onConfirm, opts){
  opts = opts || {};
  document.getElementById('modal-title').textContent = title;
  var msg = document.getElementById('modal-message');
  msg.style.display = opts.message ? 'block' : 'none';
  msg.textContent = opts.message || '';

  var input = document.getElementById('modal-input');
  input.style.display = opts.hideInput ? 'none' : 'block';
  input.value = val;
  document.getElementById('modal-ok').textContent = okLabel;
  document.getElementById('modal').style.display = 'flex';
  modalAction = onConfirm;
  setTimeout(function(){
    if(!opts.hideInput){ input.focus(); input.select(); }
  }, 80);
}
function closeModal(){ document.getElementById('modal').style.display='none'; modalAction=null; }
function modalConfirm(){
  var val = document.getElementById('modal-input').value.trim();
  if(!val && document.getElementById('modal-input').style.display !== 'none') return;
  var action = modalAction; closeModal();
  if(action) action(val);
}

function showConfirm(title, message, okLabel, onConfirm){
  showModal(title, '', okLabel, function(){ onConfirm(); }, { message: message, hideInput: true });
}

// ── FAB ───────────────────────────────────────────────────────────────────────
function toggleFab(){
  fabOpen = !fabOpen;
  var btn  = document.getElementById('fab-btn-mobile');
  var menu = document.getElementById('fab-menu-mobile');
  if(btn) btn.innerHTML = fabOpen
    ? '<span class="material-symbols-outlined font-bold" style="font-variation-settings:\'FILL\' 1;font-size:24px">close</span>'
    : '<span class="material-symbols-outlined font-bold" style="font-variation-settings:\'FILL\' 1;font-size:24px">add</span>';
  if(menu) menu.style.display = fabOpen ? 'flex' : 'none';
}
function closeFab(){
  if(!fabOpen) return; fabOpen=false;
  var btn  = document.getElementById('fab-btn-mobile');
  var menu = document.getElementById('fab-menu-mobile');
  if(btn) btn.innerHTML = '<span class="material-symbols-outlined font-bold" style="font-variation-settings:\'FILL\' 1;font-size:24px">add</span>';
  if(menu) menu.style.display = 'none';
}

// ── Mobile search ─────────────────────────────────────────────────────────────
function toggleMobileSearch(){
  mobileSearchOpen = !mobileSearchOpen;
  var row = document.getElementById('mobile-search-row');
  row.style.display = mobileSearchOpen ? 'block' : 'none';
  if(mobileSearchOpen) setTimeout(function(){ document.getElementById('search-input-mobile').focus(); }, 60);
  else { document.getElementById('search-input-mobile').value=''; filterFiles(''); }
}
function clearMobileSearch(){
  document.getElementById('search-input-mobile').value='';
  filterFiles('');
  document.getElementById('search-input-mobile').focus();
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', function(){ updateBackBtn(); });

// ── Keyboard shortcuts ─────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e){
  var t = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
  if(t === 'input' || t === 'textarea') return;
  if(document.getElementById('app').style.display === 'none') return;

  if(e.key === 'Escape'){
    if(document.getElementById('modal').style.display === 'flex') { closeModal(); return; }
    if(document.getElementById('preview-view').style.display !== 'none') { closePreview(); return; }
    document.getElementById('ctx-menu').style.display = 'none';
    closeSheet();
    closeSidebar();
    closeFab();
    return;
  }

  if(e.key === 'Delete' || e.key === 'Backspace'){
    var sel = selectedList();
    if(sel.length){ e.preventDefault(); deleteSelected(); return; }
    if(selectedFile){
      var f = allFiles.find(function(x){ return x.name === selectedFile; });
      if(!f) return;
      ctxTarget = {name: f.name, isDir: f.isDir, path: joinPath(currentPath, f.name)};
      e.preventDefault();
      ctxDelete();
    }
    return;
  }

  if(e.key === 'F2'){
    if(selectedFile){
      var f2 = allFiles.find(function(x){ return x.name === selectedFile; });
      if(!f2) return;
      ctxTarget = {name: f2.name, isDir: f2.isDir, path: joinPath(currentPath, f2.name)};
      e.preventDefault();
      ctxRename();
    }
    return;
  }

  if(e.key === 'Enter'){
    if(selectedFile){
      var f3 = allFiles.find(function(x){ return x.name === selectedFile; });
      if(!f3) return;
      e.preventDefault();
      if(f3.isDir) navigate(joinPath(currentPath, f3.name));
      else previewFile(f3.name);
    }
  }
});

