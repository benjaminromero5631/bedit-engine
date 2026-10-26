// Página de revisión de B Edit (HTML en un solo archivo, se sirve en /review).
export const REVIEW_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>B Edit · Revisión</title>
<style>
:root{--bg:#0e0f12;--card:#17191e;--line:#262a31;--tx:#e9ebef;--mut:#8b919c;--ac:#6ee7a8;--rep:#f59e0b;--usr:#f43f5e;--sus:#facc15}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
header h1{font-size:17px;margin:0;flex:1}
button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--tx);padding:10px 14px;border-radius:10px;cursor:pointer}
button.pri{background:var(--ac);color:#06210f;border-color:var(--ac);font-weight:600}
button:disabled{opacity:.4;cursor:default}
main{max-width:1000px;margin:0 auto;padding:16px}
.list{display:grid;gap:8px}
.list-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.list-tools .tabs{margin:0}
.clear-deleted{border-color:var(--usr);color:#fda4af}
.clear-deleted:hover{background:#351b23}
.recut-pending{border-color:#e7a640;color:#ffd083}
.item{display:flex;justify-content:space-between;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer}
.item-info{min-width:0;overflow-wrap:anywhere}
.item-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.gallery-save{display:inline-flex;align-items:center;justify-content:center;background:#262a31;color:var(--tx);border:1px solid #424854;font-weight:600;padding:8px 11px;border-radius:10px;white-space:nowrap}
.mark-published{display:inline-flex;align-items:center;justify-content:center;background:#202b25;color:var(--ac);border:1px solid #397953;font-weight:650;padding:8px 11px;border-radius:10px;white-space:nowrap}
.item small{color:var(--mut)}
.tag{font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--mut)}
.tag.ok{color:var(--ac);border-color:var(--ac)}
.detail{display:grid;grid-template-columns:minmax(0,300px) 1fr;gap:18px;margin-top:6px}
@media(max-width:760px){.detail{grid-template-columns:1fr}}
.detail>div{min-width:0}
video{width:100%;max-height:70vh;background:#000;border-radius:12px}
.words{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;line-height:2.1;min-height:120px}
.w{padding:2px 5px;border-radius:6px;cursor:pointer;user-select:none}
.w:hover{background:#242831}
.w.cur{background:#2c3a33;outline:1px solid var(--ac)}
.w.rep{color:var(--rep);text-decoration:line-through}
.w.usr{color:var(--usr);text-decoration:line-through}
.w.keep{color:#7ee5b3;text-decoration:none;box-shadow:inset 0 -2px 0 #38c787}
.w.sus{box-shadow:inset 0 -2px 0 var(--sus)}
.w.fil{color:var(--mut);text-decoration:line-through;cursor:default;font-size:14px}
.w.cut{color:#717782;text-decoration:line-through;opacity:.72}
.legend{color:var(--mut);font-size:13px;margin:10px 0}
.bar{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center}
.msg{color:var(--mut);font-size:14px}
.auth{max-width:440px;margin:10vh auto 0;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}
.auth h2{font-size:18px;margin:0 0 6px}
.auth p{color:var(--mut);margin:0 0 14px}
.auth form{display:flex;gap:8px;flex-wrap:wrap}
.auth input{flex:1;min-width:200px;background:#0e0f12;color:var(--tx);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit}
.auth .err{color:#fda4af;margin:0 0 12px}
.top{display:flex;gap:10px;align-items:center;margin-bottom:10px}
a{color:var(--ac)}
.tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.tabs button.on{background:var(--ac);color:#06210f;border-color:var(--ac);font-weight:600}
.w.edt{border-bottom:2px dashed var(--ac)}
.mode{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.mode button.on{border-color:var(--ac);color:var(--ac)}
button.dng{color:var(--usr)}
.tl{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px}
.tl-scroll{overflow-x:auto;overflow-y:hidden;border-radius:8px}
.tl-wrap{position:relative;height:90px;background:#101216;border-radius:8px;cursor:crosshair}
.tl-wave{position:absolute;inset:0;display:flex;align-items:flex-end;gap:1px;padding:0 1px;pointer-events:none}
.tl-wave b{flex:1;background:#3a4049;min-width:1px;border-radius:1px}
.tl-auto-cut{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,rgba(250,204,21,.12),rgba(250,204,21,.12) 4px,rgba(250,204,21,.28) 4px,rgba(250,204,21,.28) 7px);border-left:1px solid rgba(250,204,21,.6);border-right:1px solid rgba(250,204,21,.6);pointer-events:none;z-index:1}
.tl-cut{position:absolute;top:0;bottom:0;background:rgba(244,63,94,.35);border:1px solid var(--usr);cursor:pointer;z-index:2}
.tl-cut .h{position:absolute;top:0;bottom:0;width:10px;cursor:ew-resize;z-index:3}
.tl-cut .h.l{left:-5px}.tl-cut .h.r{right:-5px}
.tl-sel{position:absolute;top:0;bottom:0;background:rgba(110,231,168,.25);border:1px dashed var(--ac);pointer-events:none;z-index:1}
.tl-play{position:absolute;top:0;bottom:0;width:2px;background:#fff;pointer-events:none;z-index:4}
.tl-warning{color:#facc15;font-size:13px;margin-top:8px}
.tl-list{margin-top:10px;display:grid;gap:6px}
.tl-row{display:flex;align-items:center;gap:6px;background:#1c1f25;border-radius:8px;padding:6px 8px;font-size:13px;flex-wrap:wrap}
.tl-row button{padding:3px 8px;font-size:13px}
.tl-row span.t{color:var(--mut)}
.music{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px}
.broll{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px}
.broll-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:10px}
.broll-card{background:#1c1f25;border:1px solid var(--line);border-radius:10px;padding:10px;min-width:0}
.broll-card video{width:100%;height:180px;object-fit:cover;background:#000;border-radius:8px}
#previewWrap{position:relative}#brollPreview{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;pointer-events:none;background:#000}
.broll-card .controls{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
.broll>.controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.broll-card input,.broll-card select,.library-form input{min-width:0;background:#101216;color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit}
.broll-card input[type=number]{width:90px}
.library-form{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.library-form input{flex:1;min-width:180px}
.library-card{display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;margin:8px 0}
.library-card video{width:150px;height:100px;object-fit:cover}
@media(max-width:550px){.library-card{grid-template-columns:1fr}.library-card video{width:100%;height:180px}}
.music .mhead{display:flex;justify-content:space-between;align-items:center;gap:8px}
.mlist{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.mtrk{display:flex;align-items:center;gap:6px;background:#1c1f25;border:1px solid var(--line);border-radius:99px;padding:6px 10px;font-size:13px;cursor:pointer}
.mtrk.on{border-color:var(--ac);color:var(--ac)}
.mtrk .star{color:var(--mut);cursor:pointer}
.mtrk .star.on{color:var(--sus)}
.mtrk .x{color:var(--mut);cursor:pointer}
.mtrk .x:hover{color:var(--usr)}
</style></head><body>
<header><h1>B Edit · Revisión</h1><button id="library">Biblioteca B-roll</button><button id="refresh">Actualizar</button><button id="tok">Token</button></header>
<main id="app"></main>
<script>
var TOKEN = '';
try { TOKEN = localStorage.getItem('bedit_token') || ''; } catch (e) {}
var app = document.getElementById('app');
var cur = null, removed = {}, restored = {}, edits = {}, times = {}, manualCuts = [], words = [], poll = null, dirty = false, tab = 'pendiente', mode = 'quitar', lastJobs = [], listNotice = '', brollClips = [], brollSuggestions = [], brollEvents = [], brollPreviewEvent = null, formatFilter = 'talking-head';
var tlPxPerSec = 0, tlDur = 0, tlKeep = [];

function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ Authorization: 'Bearer ' + TOKEN }, opts.headers || {});
  return fetch(path, opts).then(function (r) {
    return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; });
  });
}
function showTokenForm(message) {
  app.innerHTML = '<section class="auth"><h2>Conecta con B Edit</h2><p>Ingresa el token para cargar tus videos y borradores.</p>' +
    (message ? '<p class="err">' + esc(message) + '</p>' : '') +
    '<form id="tokenForm"><input id="tokenInput" type="password" autocomplete="off" placeholder="Token de B Edit" required><button class="pri" type="submit">Continuar</button></form></section>';
  var form = document.getElementById('tokenForm');
  form.onsubmit = function (e) {
    e.preventDefault();
    var field = document.getElementById('tokenInput');
    var value = field.value.trim();
    if (!value) return;
    TOKEN = value;
    try { localStorage.setItem('bedit_token', TOKEN); } catch (e) {}
    showList();
  };
  document.getElementById('tokenInput').focus();
}
function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

function stateOf(j) { return j.deleted ? 'eliminado' : (j.published ? 'publicado' : (j.approved ? 'aprobado' : 'pendiente')); }
function showList() {
  clearInterval(poll); cur = null;
  if (!TOKEN) { showTokenForm(''); return; }
  app.innerHTML = '<p class="msg">Cargando…</p>';
  api('/jobs').then(function (d) { lastJobs = d.jobs; drawList(); })
    .catch(function (e) {
      if (e.message === 'No autorizado' || e.message === '401') {
        TOKEN = '';
        try { localStorage.removeItem('bedit_token'); } catch (storageError) {}
        showTokenForm('El token no fue aceptado. Revísalo e inténtalo de nuevo.');
      } else app.innerHTML = '<p class="msg">No se pudieron cargar los videos: ' + esc(e.message) + ' <button id="retry">Reintentar</button></p>';
      var retry = document.getElementById('retry'); if (retry) retry.onclick = showList;
    });
}
function showLibrary() {
  cur = null; clearInterval(poll);
  app.innerHTML = '<div class="top"><button id="libraryBack">← Videos</button><b>Biblioteca B-roll</b></div><p class="legend">Sube clips tuyos de apoyo, idealmente verticales y de 1–3 segundos. Se normalizan a MP4 para que el navegador pueda previsualizarlos. Las etiquetas ayudan a proponer momentos; cada inserción requiere tu aprobación.</p><form id="brollUpload" class="library-form"><input id="brollFile" type="file" accept="video/mp4,video/quicktime,video/webm,.mov,.mp4,.webm" required><input id="brollName" maxlength="80" placeholder="Nombre: escribiendo en computador"><input id="brollTags" maxlength="200" placeholder="Etiquetas separadas por coma: trabajo, negocio"><button class="pri">Subir clip</button></form><div id="brollLibrary"><p class="msg">Cargando biblioteca…</p></div>';
  document.getElementById('libraryBack').onclick = showList;
  document.getElementById('brollUpload').onsubmit = function (ev) {
    ev.preventDefault();
    var file = document.getElementById('brollFile').files[0]; if (!file) return;
    var fd = new FormData(); fd.append('file', file); fd.append('name', document.getElementById('brollName').value || file.name); fd.append('tags', document.getElementById('brollTags').value);
    var btn = ev.currentTarget.querySelector('button'); btn.disabled = true; btn.textContent = 'Subiendo y preparando…';
    fetch('/broll', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function () { showLibrary(); }).catch(function (e) { alert('No se pudo subir: ' + e.message); btn.disabled = false; btn.textContent = 'Subir clip'; });
  };
  loadBrollLibrary();
}
function loadBrollLibrary() {
  var box = document.getElementById('brollLibrary'); if (!box) return;
  api('/broll').then(function (d) {
    brollClips = d.clips || [];
    if (!brollClips.length) { box.innerHTML = '<p class="msg">Todavía no hay clips. Empieza con tomas cotidianas de trabajo, negocio, IA o situaciones relacionadas con miedo y decisiones.</p>'; return; }
    box.innerHTML = brollClips.map(function (c) { return '<div class="library-card"><video muted playsinline controls src="/broll/' + c.id + '/file?t=' + encodeURIComponent(TOKEN) + '"></video><div><b>' + esc(c.name) + '</b><div class="legend">' + (c.duration || 0).toFixed(1) + ' s · ' + esc((c.tags || []).join(', ') || 'sin etiquetas') + '</div></div><button data-broll-del="' + c.id + '" class="dng">Eliminar</button></div>'; }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-broll-del]'), function (btn) { btn.onclick = function () { var id = btn.getAttribute('data-broll-del'); if (!confirm('¿Eliminar este clip de la biblioteca? B Edit lo rechazará si todavía está aplicado a una edición.')) return; api('/broll/' + id, { method: 'DELETE' }).then(loadBrollLibrary).catch(function (e) { alert(e.message); }); }; });
  }).catch(function (e) { box.innerHTML = '<p class="msg">No se pudo cargar la biblioteca: ' + esc(e.message) + '</p>'; });
}
function drawList() {
  var formatJobs = lastJobs.filter(function (j) { return (j.format || 'talking-head') === formatFilter; });
  var counts = { pendiente: 0, aprobado: 0, publicado: 0, eliminado: 0 };
  formatJobs.forEach(function (j) { counts[stateOf(j)]++; });
  var names = { pendiente: 'Pendientes', aprobado: 'Listos', publicado: 'Publicados', eliminado: 'Eliminados' };
  var formatNames = { 'talking-head': '🎙 Talking Head', 'pantalla-compartida': '🖥 Pantalla Compartida' };
  var h = '';
  if (listNotice) { h += '<p class="msg">' + esc(listNotice) + '</p>'; listNotice = ''; }
  h += '<div class="tabs" style="margin-bottom:8px">';
  ['talking-head', 'pantalla-compartida'].forEach(function (f) { h += '<button data-format="' + f + '"' + (formatFilter === f ? ' class="on"' : '') + '>' + formatNames[f] + '</button>'; });
  h += '</div>';
  h += '<div class="list-tools"><div class="tabs">';
  ['pendiente', 'aprobado', 'publicado', 'eliminado'].forEach(function (k) { h += '<button data-tab="' + k + '"' + (tab === k ? ' class="on"' : '') + '>' + names[k] + ' (' + counts[k] + ')</button>'; });
  h += '</div>';
  if (tab === 'eliminado') h += '<button id="clearDeleted" class="clear-deleted">Limpiar historial</button>';
  var recutCount = formatJobs.filter(function (j) { return stateOf(j) === 'pendiente' && j.status === 'listo'; }).length;
  if (tab === 'pendiente' && recutCount) h += '<button id="recutPending" class="recut-pending">Aplicar cortes más fuertes (' + recutCount + ')</button>';
  h += '</div>';
  var rows = formatJobs.filter(function (j) { return stateOf(j) === tab; });
  if (!rows.length) h += '<p class="msg">No hay videos aquí.</p>';
  else {
    h += '<div class="list">';
    rows.forEach(function (j) {
      var st = j.status === 'listo' ? '<span class="tag ok">listo</span>' : '<span class="tag">' + esc(j.status) + (j.progress ? ' ' + Math.round(j.progress * 100) + '%' : '') + '</span>';
      h += '<div class="item" data-id="' + j.id + '"><div class="item-info">' + esc(j.name || j.id) + '<br><small>' + new Date(j.createdAt).toLocaleString('es-CL') + '</small></div><div class="item-actions">' + st;
      if (['aprobado', 'publicado'].includes(tab) && j.status === 'listo') { h += '<button class="gallery-save" data-gallery-id="' + j.id + '">📱 Guardar en galería</button>'; h += '<a class="gallery-save" href="/jobs/' + j.id + '/result?t=' + encodeURIComponent(TOKEN) + '" download>⬇️ Descargar</a>'; }
      if (tab === 'aprobado' && j.status === 'listo') h += '<button class="mark-published" data-publish-id="' + j.id + '">✓ Marcar publicado</button>';
      h += '</div></div>';
    });
    h += '</div>';
  }
  app.innerHTML = h;
  Array.prototype.forEach.call(app.querySelectorAll('.tabs button[data-format]'), function (el) { el.onclick = function () { formatFilter = el.getAttribute('data-format'); tab = 'pendiente'; drawList(); }; });
  Array.prototype.forEach.call(app.querySelectorAll('.tabs button[data-tab]'), function (el) { el.onclick = function () { tab = el.getAttribute('data-tab'); drawList(); }; });
  Array.prototype.forEach.call(app.querySelectorAll('.item'), function (el) { el.onclick = function () { openJob(el.getAttribute('data-id')); }; });
  Array.prototype.forEach.call(app.querySelectorAll('[data-gallery-id]'), function (el) { el.onclick = function (event) { event.stopPropagation(); saveToGallery(el.getAttribute('data-gallery-id'), el); }; });
  observeGalleryButtons();
  Array.prototype.forEach.call(app.querySelectorAll('[data-publish-id]'), function (el) { el.onclick = function (event) {
    event.stopPropagation();
    var id = el.getAttribute('data-publish-id');
    el.disabled = true; el.textContent = 'Guardando…';
    api('/jobs/' + id + '/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'publicado' }) })
      .then(function () { tab = 'publicado'; listNotice = 'Video marcado como publicado.'; showList(); })
      .catch(function (e) { el.disabled = false; el.textContent = '✓ Marcar publicado'; alert('No se pudo mover a Publicados: ' + e.message); });
  }; });
  var clear = document.getElementById('clearDeleted');
  if (clear) clear.onclick = function () {
    if (!confirm('¿Eliminar definitivamente el historial de videos en Eliminados? Esto borra sus archivos y no se puede deshacer. Los videos pendientes y aprobados no se tocarán.')) return;
    clear.disabled = true; clear.textContent = 'Limpiando…';
    api('/jobs/clear-deleted', { method: 'POST' }).then(function (result) {
      listNotice = 'Historial limpiado: ' + result.removed + ' video(s) eliminados.' + (result.skipped ? ' ' + result.skipped + ' en procesamiento se conservaron por ahora.' : '');
      showList();
    }).catch(function (e) { listNotice = 'No se pudo limpiar el historial: ' + e.message; showList(); });
  };
  var recut = document.getElementById('recutPending');
  if (recut) recut.onclick = function () {
    var count = lastJobs.filter(function (j) { return stateOf(j) === 'pendiente' && j.status === 'listo'; }).length;
    if (!count || !confirm('Se recalcularán y renderizarán los cortes de ' + count + ' videos pendientes con el perfil más estricto. Cada archivo actual se conserva si falla su nuevo render. ¿Continuar?')) return;
    recut.disabled = true; recut.textContent = 'Preparando ' + count + ' videos…';
    api('/jobs/recut-pending', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function (result) {
        listNotice = 'En cola para aplicar cortes más fuertes: ' + result.queued.length + ' video(s).' + (result.skipped.length ? ' Se omitieron ' + result.skipped.length + ' por falta de datos compatibles.' : '');
        showList();
      }).catch(function (e) { listNotice = 'No se pudieron actualizar los cortes: ' + e.message; showList(); });
  };
}

function openJob(id) {
  cur = id; removed = {}; restored = {}; edits = {}; times = {}; manualCuts = []; dirty = false; mode = 'quitar'; clearInterval(poll);
  app.innerHTML = '<p class="msg">Cargando…</p>';
  api('/jobs/' + id + '/review').then(function (d) { render(d); }).catch(function (e) { app.innerHTML = '<p class="msg">Error: ' + esc(e.message) + '</p><button onclick="showList()">Volver</button>'; });
}

function render(d) {
  brollPreviewEvent = null;
  brollClips = d.brollClips || [];
  brollSuggestions = d.brollSuggestions || [];
  brollEvents = (d.brollEvents || []).map(function (e) { return { clipId: e.clipId, at: e.at, sourceAt: e.sourceAt, duration: e.duration }; });
  words = d.words;
  words.forEach(function (w) { if (w.i >= 0 && w.x) removed[w.i] = true; if (w.i >= 0 && w.k) restored[w.i] = true; });
  var busy = ['en cola', 'analizando', 'transcribiendo', 'renderizando', 'cancelando'].indexOf(d.status) >= 0;
  var h = '<div class="top"><button id="back">← Videos</button><b>' + esc(d.name || cur) + '</b>' + (d.published ? ' <span class="tag ok">publicado</span>' : (d.approved ? ' <span class="tag ok">listo</span>' : '')) + '</div>';
  if (busy) {
    h += '<p class="msg" id="st">' + (d.status === 'cancelando' ? 'Cancelando render…' : 'Procesando: ' + esc(d.status) + ' ' + Math.round((d.progress || 0) * 100) + '%…') + '</p>';
    if (d.kind === 'rerender' && d.status !== 'cancelando') h += '<button class="dng" id="cancelRender">Cancelar render</button>';
    app.innerHTML = h; document.getElementById('back').onclick = showList;
    var cancelButton = document.getElementById('cancelRender');
    if (cancelButton) cancelButton.onclick = function () {
      cancelButton.disabled = true; cancelButton.textContent = 'Cancelando…';
      api('/jobs/' + cur + '/cancel', { method: 'POST' }).then(function () { openJob(cur); }).catch(function (e) { alert('No se pudo cancelar: ' + e.message); openJob(cur); });
    };
    poll = setInterval(function () { api('/jobs/' + cur + '/review').then(function (n) { if (n.status === 'listo' || n.status === 'error') { clearInterval(poll); render(n); } else document.getElementById('st').textContent = n.status === 'cancelando' ? 'Cancelando render…' : 'Procesando: ' + n.status + ' ' + Math.round((n.progress || 0) * 100) + '%…'; }); }, 3000);
    return;
  }
  if (d.lastRenderCancelled) h += '<p class="msg">Render cancelado. Se conservó la versión anterior del video.</p>';
  if (d.status === 'error') h += '<p class="msg">Hubo un error: ' + esc(d.error || '') + '</p>';
  var st = d.deleted ? 'eliminado' : (d.published ? 'publicado' : (d.approved ? 'aprobado' : 'pendiente'));
  h += '<div class="detail"><div id="previewWrap"><video id="v" controls playsinline src="/jobs/' + cur + '/result?t=' + encodeURIComponent(TOKEN) + '&v=' + Date.now() + '"></video><video id="brollPreview" muted playsinline></video></div><div>';
  if (['aprobado', 'publicado'].includes(st) && d.status === 'listo') { h += '<button class=”gallery-save” id=”gallerySave”>📱 Guardar en galería</button>'; h += '<a class=”gallery-save” href=”/jobs/' + cur + '/result?t=' + encodeURIComponent(TOKEN) + '” download>⬇️ Descargar</a>'; h += '<p class=”legend”>En el teléfono se abrirá el menú del sistema para elegir “Guardar video” o Fotos. El navegador requiere esa confirmación. Si el primer toque falla, vuelve a tocar el botón (el video ya quedó preparado y la segunda vez funciona).</p>'; prefetchGallery(cur); }
  if (d.editable) {
    h += '<div class="mode"><button id="m1">Quitar palabras</button><button id="m2">Editar texto</button><button id="m3">Mover tiempo</button></div>';
    h += '<div class="words" id="words"></div>';
  h += '<div class="legend"><span style="color:var(--rep)">naranja</span> = repetición quitada sola · <span style="color:var(--usr)">rojo</span> = la quitaste tú · <span style="box-shadow:inset 0 -2px 0 var(--sus)">subrayado</span> = revisar (incluye confianza baja de Whisper; pasa el cursor para ver el dato) · gris = muletilla/corte · <span style="border-bottom:2px dashed var(--ac)">subrayado punteado</span> = editada/movida. La confianza baja solo marca revisión, no borra la palabra. "Quitar palabras": toca para quitar/recuperar; las palabras restauradas desde cortes se marcan en verde. "Editar texto": toca para corregir. "Mover tiempo": toca y escribe cuántos cuadros (1/30s) desplazar esa palabra/subtítulo.</div>';
  h += '<div class="tl"><div class="legend" style="margin-top:0">Línea de tiempo del video original: amarillo rayado = tramo que se quitará automáticamente; rojo = corte manual. El cursor sigue el video aunque haya cortes. Arrastra sobre el audio para añadir un corte manual; si toca palabras, aparecerá un aviso antes de aplicar.</div><div class="tl-scroll"><div id="tlwrap" class="tl-wrap"></div></div><div id="tllist" class="tl-list"></div><div id="tlwarning" class="tl-warning"></div></div>';
  } else {
    h += '<p class="msg">Este video es de una versión anterior: se puede ver y aprobar, pero no editar palabras.</p>';
  }
  if (d.editable) h += '<section class="broll"><b>🎬 B-roll sugerido</b><p class="legend">Propuestas por coincidencia de etiquetas y palabras; no se agregan solas. El clip reemplaza la imagen por 1 segundo (máximo 2), manteniendo tu voz y música. Añade, cambia o quita clips y luego pulsa “Aplicar cambios”.</p><div id="brollBox"></div></section>';
  h += '<div class="music"><div class="mhead"><b>🎵 Música</b><button id="mUp">Subir canción</button></div>' +
    '<input type="file" id="mFile" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,video/mp4,video/quicktime,.mov" style="display:none">' +
    '<div class="legend" style="margin:6px 0 0">Click en una pista para aplicarla al toque (queda de fondo, bajo volumen, sin tapar tu voz). Dale play al video para escucharla ya mezclada. ★ = predeterminada para videos nuevos.</div>' +
    '<div class="mlist" id="mList"><span class="msg">Cargando…</span></div></div>';
  h += '<div class="bar">';
  if (d.editable) h += '<button class="pri" id="apply" disabled>Aplicar cambios</button>';
  if (st === 'pendiente') h += '<button id="approve">Aprobar ✔</button><button class="dng" id="del">Eliminar</button>';
  else if (st === 'aprobado') h += '<button class="pri" id="publish">Marcar como publicado</button><button id="restore">Devolver a pendientes</button><button class="dng" id="del">Eliminar</button>';
  else if (st === 'publicado') h += '<button id="unpublish">Mover a listos</button><button class="dng" id="del">Eliminar</button>';
  else h += '<button id="restore">Devolver a pendientes</button>';
  h += '<span class="msg" id="info"></span></div></div></div>';
  app.innerHTML = h;
  document.getElementById('back').onclick = showList;
  drawBrollSection();
  wireBrollPreview();
  if (d.editable) {
    drawWords(true); setMode(mode);
    document.getElementById('m1').onclick = function () { setMode('quitar'); };
    document.getElementById('m2').onclick = function () { setMode('editar'); };
    document.getElementById('m3').onclick = function () { setMode('mover'); };
    document.getElementById('apply').onclick = apply;
    initTimeline(d);
    refreshInfo();
  }
  wireMusic(d);
  var v = document.getElementById('v');
  v.ontimeupdate = function () {
    var t = v.currentTime, best = null;
    for (var k = 0; k < words.length; k++) {
      if (words[k].o >= 0 && words[k].o <= t && t < words[k].oe) { best = k; break; }
    }
    Array.prototype.forEach.call(document.querySelectorAll('.w.cur'), function (e) { e.classList.remove('cur'); });
    if (best !== null) { var el = document.getElementById('w' + best); if (el) el.classList.add('cur'); }
    var pl = document.getElementById('tlplay');
    if (pl && tlPxPerSec) pl.style.left = (sourceAtOutput(v.currentTime) * tlPxPerSec) + 'px';
  };
  var ap = document.getElementById('approve'), dl = document.getElementById('del'), rs = document.getElementById('restore');
  var publish = document.getElementById('publish'), unpublish = document.getElementById('unpublish'), gallery = document.getElementById('gallerySave');
  if (ap) ap.onclick = function () { if (dirty && !confirm('Tienes cambios sin aplicar. ¿Aprobar igual el video actual?')) return; setState('aprobado'); };
  if (publish) publish.onclick = function () { setState('publicado'); };
  if (unpublish) unpublish.onclick = function () { setState('aprobado'); };
  if (gallery) gallery.onclick = function () { saveToGallery(cur, gallery); };
  if (dl) dl.onclick = function () { if (confirm('¿Mandar este video a Eliminados?')) setState('eliminado'); };
  if (rs) rs.onclick = function () { setState('pendiente'); };
}

function drawBrollSection() {
  var box = document.getElementById('brollBox'); if (!box) return;
  var h = '';
  if (!brollClips.length) h += '<p class="msg">Aún no hay clips en la biblioteca. <button id="openBrollLibrary">Abrir biblioteca</button></p>';
  else h += '<div class="controls"><select id="brollManualSelect" aria-label="Elegir B-roll"><option value="">Elegir un clip…</option>' + brollClips.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select><button id="brollAtCursor"' + (brollEvents.length >= 3 ? ' disabled' : '') + '>Añadir en el cursor · 1 s</button></div><div class="legend">También puedes colocar manualmente un clip en la posición actual del video.</div>';
  if (brollSuggestions.length) {
    h += '<b>Propuestas para este video</b><div class="broll-grid">';
    brollSuggestions.forEach(function (s, i) {
      var already = brollEvents.some(function (e) { return e.clipId === s.clipId && Math.abs(e.at - s.at) < 0.1; });
      h += '<div class="broll-card"><video muted playsinline controls preload="metadata" src="/broll/' + s.clipId + '/file?t=' + encodeURIComponent(TOKEN) + '"></video><div><b>' + esc(s.clipName) + '</b><div class="legend">Sugerido en ' + s.at.toFixed(1) + ' s · ' + esc(s.reason) + '</div></div><div class="controls"><button data-broll-preview="' + i + '">Ver en el momento</button><button class="pri" data-broll-add="' + i + '"' + (already || brollEvents.length >= 3 ? ' disabled' : '') + '>Añadir propuesta · 1 s</button></div></div>';
    });
    h += '</div>';
  } else if (brollClips.length) h += '<p class="msg">No encontré coincidencias claras entre las etiquetas de tu biblioteca y el guion. No propongo clips para este video.</p>';
  h += '<div style="margin-top:12px"><b>Clips elegidos (' + brollEvents.length + '/3)</b>';
  if (brollEvents.length) {
    h += '<div class="broll-grid">';
    brollEvents.forEach(function (e, i) {
      var options = brollClips.map(function (c) { return '<option value="' + c.id + '"' + (c.id === e.clipId ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
      var clip = brollClips.find(function (c) { return c.id === e.clipId; });
      h += '<div class="broll-card">' + (clip ? '<video muted playsinline controls preload="metadata" src="/broll/' + clip.id + '/file?t=' + encodeURIComponent(TOKEN) + '"></video>' : '<p class="msg">Clip ya no disponible</p>') + '<div class="controls"><select data-broll-clip="' + i + '" aria-label="Elegir clip">' + options + '</select><label>En <input type="number" min="0" step="0.03" value="' + e.at.toFixed(2) + '" data-broll-at="' + i + '"> s</label><label><select data-broll-duration="' + i + '" aria-label="Duración"><option value="1"' + (e.duration === 1 ? ' selected' : '') + '>1 s</option><option value="1.5"' + (e.duration === 1.5 ? ' selected' : '') + '>1,5 s</option><option value="2"' + (e.duration === 2 ? ' selected' : '') + '>2 s</option></select></label><button class="dng" data-broll-remove="' + i + '">Quitar</button></div></div>';
    });
    h += '</div>';
  } else h += '<p class="msg">Ninguna propuesta seleccionada. Si no hay una relación clara, déjalo así.</p>';
  h += '</div>';
  box.innerHTML = h;
  var libraryBtn = document.getElementById('openBrollLibrary'); if (libraryBtn) libraryBtn.onclick = showLibrary;
  var manualSelect = document.getElementById('brollManualSelect'), atCursor = document.getElementById('brollAtCursor');
  if (atCursor) atCursor.onclick = function () { var v = document.getElementById('v'), clipId = manualSelect.value; if (!clipId || !v) { alert('Elige un clip y coloca el cursor del video en el momento deseado.'); return; } if (brollEvents.length >= 3) return; var at = Math.min(v.currentTime, Math.max(0, v.duration - 1)); if (brollEvents.some(function (e) { return at < e.at + e.duration && at + 1 > e.at; })) { alert('Ese momento se cruza con otro B-roll; mueve el cursor a un espacio libre.'); return; } brollEvents.push({ clipId: clipId, at: Math.round(at * 30) / 30, sourceAt: sourceAtOutput(at), duration: 1 }); brollEvents.sort(function (a, b) { return a.at - b.at; }); dirty = true; refreshInfo(); drawBrollSection(); };
  Array.prototype.forEach.call(box.querySelectorAll('[data-broll-preview]'), function (btn) { btn.onclick = function () { var s = brollSuggestions[Number(btn.getAttribute('data-broll-preview'))], v = document.getElementById('v'); if (!s || !v) return; brollPreviewEvent = { clipId: s.clipId, at: s.at, duration: 1 }; v.currentTime = s.at; v.play().catch(function () {}); syncBrollPreview(); }; });
  Array.prototype.forEach.call(box.querySelectorAll('[data-broll-add]'), function (btn) { btn.onclick = function () { var s = brollSuggestions[Number(btn.getAttribute('data-broll-add'))]; if (!s || brollEvents.length >= 3) return; brollEvents.push({ clipId: s.clipId, at: Math.round(s.at * 30) / 30, sourceAt: s.sourceAt, duration: 1 }); brollEvents.sort(function (a, b) { return a.at - b.at; }); dirty = true; refreshInfo(); drawBrollSection(); }; });
  Array.prototype.forEach.call(box.querySelectorAll('[data-broll-remove]'), function (btn) { btn.onclick = function () { brollEvents.splice(Number(btn.getAttribute('data-broll-remove')), 1); dirty = true; refreshInfo(); drawBrollSection(); }; });
  Array.prototype.forEach.call(box.querySelectorAll('[data-broll-clip]'), function (el) { el.onchange = function () { brollEvents[Number(el.getAttribute('data-broll-clip'))].clipId = el.value; dirty = true; refreshInfo(); }; });
  Array.prototype.forEach.call(box.querySelectorAll('[data-broll-at]'), function (el) { el.onchange = function () { var i = Number(el.getAttribute('data-broll-at')); brollEvents[i].at = Math.max(0, Number(el.value) || 0); brollEvents[i].sourceAt = sourceAtOutput(brollEvents[i].at); dirty = true; refreshInfo(); }; });
  Array.prototype.forEach.call(box.querySelectorAll('[data-broll-duration]'), function (el) { el.onchange = function () { brollEvents[Number(el.getAttribute('data-broll-duration'))].duration = Number(el.value); dirty = true; refreshInfo(); }; });
}

function wireBrollPreview() {
  var v = document.getElementById('v'); if (!v) return;
  ['timeupdate', 'play', 'pause', 'seeked'].forEach(function (name) { v.addEventListener(name, syncBrollPreview); });
}
function syncBrollPreview() {
  var v = document.getElementById('v'), overlay = document.getElementById('brollPreview'); if (!v || !overlay) return;
  var t = v.currentTime, event = brollPreviewEvent && t >= brollPreviewEvent.at && t < brollPreviewEvent.at + brollPreviewEvent.duration ? brollPreviewEvent : brollEvents.find(function (e) { return t >= e.at && t < e.at + e.duration; });
  if (!event) { overlay.pause(); overlay.style.display = 'none'; return; }
  var src = '/broll/' + event.clipId + '/file?t=' + encodeURIComponent(TOKEN);
  if (overlay.dataset.clip !== event.clipId) { overlay.dataset.clip = event.clipId; overlay.src = src; }
  overlay.style.display = 'block';
  var offset = t - event.at;
  if (overlay.readyState >= 1 && Math.abs(overlay.currentTime - offset) > 0.12) { try { overlay.currentTime = offset; } catch (e) {} }
  if (!v.paused && overlay.paused) overlay.play().catch(function () {}); else if (v.paused && !overlay.paused) overlay.pause();
}

function setMode(m) {
  mode = m;
  document.getElementById('m1').className = m === 'quitar' ? 'on' : '';
  document.getElementById('m2').className = m === 'editar' ? 'on' : '';
  document.getElementById('m3').className = m === 'mover' ? 'on' : '';
}

var galleryFiles = {}; // id -> Promise<File>, precargado en segundo plano para no perder el permiso de compartir
var galleryQueue = [], galleryActive = 0, GALLERY_MAX_CONCURRENT = 1, GALLERY_MAX_CACHED = 3, galleryOrder = [];

function fetchGalleryFile(id) {
  return fetch('/jobs/' + id + '/result?t=' + encodeURIComponent(TOKEN)).then(function (response) {
    if (!response.ok) throw new Error('No se pudo descargar el video.');
    return response.blob().then(function (blob) {
      var disposition = response.headers.get('content-disposition') || '';
      var match = disposition.match(/filename="?([^";]+)"?/i);
      return new File([blob], match ? match[1] : 'b-edit-' + id + '.mp4', { type: 'video/mp4' });
    });
  });
}

function pumpGalleryQueue() {
  if (galleryActive >= GALLERY_MAX_CONCURRENT || !galleryQueue.length) return;
  var id = galleryQueue.shift();
  if (galleryFiles[id]) { pumpGalleryQueue(); return; }
  galleryActive++;
  galleryFiles[id] = fetchGalleryFile(id)
    .catch(function (e) { delete galleryFiles[id]; throw e; })
    .finally(function () { galleryActive--; pumpGalleryQueue(); });
  galleryFiles[id].catch(function () {}); // evita "unhandled rejection" mientras nadie más lo espera todavía
  galleryOrder.push(id);
  while (galleryOrder.length > GALLERY_MAX_CACHED) { var old = galleryOrder.shift(); if (old !== id) delete galleryFiles[old]; }
}

// Precarga en segundo plano, con concurrencia limitada: evita que varios videos
// completos se descarguen a la vez y agoten memoria/red en el teléfono ("Load failed").
function prefetchGallery(id) {
  if (galleryFiles[id] || galleryQueue.indexOf(id) !== -1) return;
  galleryQueue.push(id);
  pumpGalleryQueue();
}

var galleryObserver = null;
function observeGalleryButtons() {
  var buttons = app.querySelectorAll('[data-gallery-id]');
  if (!('IntersectionObserver' in window)) { Array.prototype.forEach.call(buttons, function (el) { prefetchGallery(el.getAttribute('data-gallery-id')); }); return; }
  if (galleryObserver) galleryObserver.disconnect();
  galleryObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (entry.isIntersecting) { prefetchGallery(entry.target.getAttribute('data-gallery-id')); galleryObserver.unobserve(entry.target); } });
  }, { rootMargin: '200px' });
  Array.prototype.forEach.call(buttons, function (el) { galleryObserver.observe(el); });
}

async function saveToGallery(id, button) {
  if (!navigator.share || !navigator.canShare) { alert('Este navegador no permite enviar videos a la galería.'); return; }
  var oldText = button.textContent;
  try {
    var cached = galleryFiles[id];
    var warm = !!cached;
    if (!warm) {
      button.disabled = true; button.textContent = 'Preparando video…';
      var qi = galleryQueue.indexOf(id); if (qi !== -1) galleryQueue.splice(qi, 1); // toque directo del usuario: no esperar en la cola de fondo
      cached = galleryFiles[id] = fetchGalleryFile(id).catch(function (e) { delete galleryFiles[id]; throw e; });
      cached.catch(function () {});
    }
    var file = await cached;
    if (!warm) { button.disabled = false; button.textContent = oldText; }
    if (!navigator.canShare({ files: [file] })) throw new Error('El teléfono no ofrece guardar este archivo desde el menú Compartir.');
    await navigator.share({ files: [file], title: 'Video editado' });
    delete galleryFiles[id];
  } catch (e) {
    button.disabled = false;
    if (e && e.name === 'NotAllowedError') { button.textContent = '📱 Toca de nuevo para guardar'; }
    else { button.textContent = oldText; if (!e || e.name !== 'AbortError') alert((e && e.message) || 'No se pudo abrir el menú para guardar el video.'); }
  }
}

function setState(s) {
  api('/jobs/' + cur + '/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: s }) })
    .then(function () { tab = s === 'eliminado' ? 'eliminado' : s; showList(); })
    .catch(function (e) { document.getElementById('info').textContent = 'Error: ' + e.message; });
}

function refreshInfo() {
  var apBtn = document.getElementById('apply'); if (apBtn) apBtn.disabled = false;
  var info = document.getElementById('info');
  if (info) info.textContent = Object.keys(removed).length + ' quitadas · ' + Object.keys(restored).length + ' recuperadas · ' + Object.keys(edits).length + ' corregidas · ' + Object.keys(times).length + ' movidas · ' + manualCuts.length + ' cortes manuales';
  var warning = document.getElementById('tlwarning');
  if (warning) {
    var hit = {};
    manualCuts.forEach(function (c) { words.forEach(function (w) {
      if (!w.f && w.i >= 0 && !removed[w.i] && Math.min(w.end, c.e) - Math.max(w.start, c.s) >= 1 / 60) hit[w.i] = true;
    }); });
    var count = Object.keys(hit).length;
    warning.textContent = count ? '⚠ Estos cortes también quitarán ' + count + ' palabra' + (count === 1 ? '' : 's') + ' hablada' + (count === 1 ? '' : 's') + '. Revisa el video antes de aplicar.' : '';
  }
  dirty = true;
}

function wcls(w) {
  var c = 'w';
  if (w.o < 0 && !w.x && !restored[w.i]) c += ' cut';
  if (removed[w.i]) c += w.x === 'rep' ? ' rep' : ' usr';
  if (restored[w.i]) c += ' keep';
  if (w.s) c += ' sus';
  if (w.e || edits[w.i] !== undefined || times[w.i] !== undefined) c += ' edt';
  return c;
}
function drawWords() {
  var box = document.getElementById('words'), h = '';
  words.forEach(function (w, k) {
    if (w.f) { h += '<span class="w fil" id="w' + k + '">' + esc(w.t) + '</span> '; return; }
    var title = typeof w.c === 'number' ? (w.c < 0.45 ? 'Revisar: confianza de Whisper ' : 'Confianza de Whisper ') + Math.round(w.c * 100) + '%' : '';
    h += '<span class="' + wcls(w) + '" id="w' + k + '" data-k="' + k + '" title="' + title + '">' + esc(edits[w.i] !== undefined ? edits[w.i] : w.t) + '</span> ';
  });
  box.innerHTML = h;
  Array.prototype.forEach.call(box.querySelectorAll('.w[data-k]'), function (el) {
    el.onclick = function () {
      var w = words[+el.getAttribute('data-k')];
      if (mode === 'editar') {
        var t = prompt('Corregir texto de esta palabra', edits[w.i] !== undefined ? edits[w.i] : w.t);
        if (t === null || !t.trim()) return;
        edits[w.i] = t.trim(); el.textContent = edits[w.i];
      } else if (mode === 'mover') {
        var base = times[w.i] ? Math.round((times[w.i].start - w.start) * 30) : 0;
        var inp = prompt('Mover esta palabra/subtítulo: cuadros a desplazar (1 cuadro = 1/30s). Positivo = más tarde, negativo = más temprano. 0 = deshacer.', base);
        if (inp === null) return;
        var n = parseInt(inp, 10); if (!isFinite(n)) return;
        if (n === 0) delete times[w.i]; else times[w.i] = { start: w.start + n / 30, end: w.end + n / 30 };
      } else {
        if (removed[w.i]) delete removed[w.i];
        else if (restored[w.i]) delete restored[w.i];
        else if (w.o < 0 && !w.x) restored[w.i] = true;
        else removed[w.i] = true;
      }
      el.className = wcls(w);
      refreshInfo();
    };
  });
}

function initTimeline(d) {
  manualCuts = (d.manualCuts || []).map(function (m) { return { s: m.s, e: m.e }; });
  tlKeep = d.keep || [];
  tlDur = d.duration || 1;
  var wrap = document.getElementById('tlwrap');
  if (!wrap) return;
  tlPxPerSec = Math.max(30, Math.min(160, 900 / tlDur));
  var W = Math.max(300, tlDur * tlPxPerSec);
  wrap.style.width = W + 'px';
  wrap.innerHTML = '<div class="tl-wave" id="tlwave"></div><div class="tl-play" id="tlplay" style="left:0"></div>';

  function edgesOf() {
    var e = [0, tlDur];
    words.forEach(function (w) { if (w.i >= 0) { e.push(w.start); e.push(w.end); } });
    return e.sort(function (a, b) { return a - b; });
  }
  function magnet(t) {
    var e = edgesOf(), best = t, bd = Infinity;
    e.forEach(function (x) { var dd = Math.abs(x - t); if (dd < bd) { bd = dd; best = x; } });
    return bd <= 0.12 ? best : t;
  }
  function snapRange(a, b) {
    var s = magnet(Math.max(0, Math.min(a, b)));
    var en = magnet(Math.max(a, b));
    if (en - s < 1 / 30) en = Math.min(tlDur, s + 1 / 30);
    return { s: Math.round(s * 1000) / 1000, e: Math.round(en * 1000) / 1000 };
  }
  function drawCuts() {
    Array.prototype.forEach.call(wrap.querySelectorAll('.tl-auto-cut'), function (e) { e.remove(); });
    Array.prototype.forEach.call(wrap.querySelectorAll('.tl-cut'), function (e) { e.remove(); });
    (d.cuts || []).forEach(function (c) {
      var el = document.createElement('div'); el.className = 'tl-auto-cut';
      el.style.left = (c.s * tlPxPerSec) + 'px'; el.style.width = Math.max(1, (c.e - c.s) * tlPxPerSec) + 'px';
      el.title = 'Tramo que se quitará automáticamente'; wrap.appendChild(el);
    });
    manualCuts.forEach(function (c, idx) {
      var el = document.createElement('div'); el.className = 'tl-cut';
      el.style.left = (c.s * tlPxPerSec) + 'px'; el.style.width = Math.max(3, (c.e - c.s) * tlPxPerSec) + 'px';
      el.title = 'Corte manual';
      var hl = document.createElement('div'); hl.className = 'h l';
      var hr = document.createElement('div'); hr.className = 'h r';
      el.appendChild(hl); el.appendChild(hr);
      hl.onmousedown = function (ev) { dragEdge(ev, idx, 's'); };
      hr.onmousedown = function (ev) { dragEdge(ev, idx, 'e'); };
      el.onclick = function (ev) {
        if (ev.target === hl || ev.target === hr) return;
        if (confirm('¿Quitar este corte manual?')) { manualCuts.splice(idx, 1); drawCuts(); refreshInfo(); }
      };
      wrap.appendChild(el);
    });
    drawList();
  }
  function dragEdge(ev, idx, side) {
    ev.stopPropagation(); ev.preventDefault();
    var scroller = wrap.parentElement, rect = scroller.getBoundingClientRect();
    function move(e2) {
      var t = (e2.clientX - rect.left + scroller.scrollLeft) / tlPxPerSec;
      var c = manualCuts[idx];
      if (side === 's') c.s = Math.max(0, Math.min(c.e - 1 / 30, t)); else c.e = Math.min(tlDur, Math.max(c.s + 1 / 30, t));
      drawCuts();
    }
    function up() {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      manualCuts[idx] = snapRange(manualCuts[idx].s, manualCuts[idx].e);
      drawCuts(); refreshInfo();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  function drawList() {
    var box = document.getElementById('tllist'); if (!box) return;
    if (!manualCuts.length) { box.innerHTML = '<span class="msg">Sin cortes manuales todavía.</span>'; return; }
    var hh = '';
    manualCuts.forEach(function (c, idx) {
      hh += '<div class="tl-row"><span>' + c.s.toFixed(2) + 's → ' + c.e.toFixed(2) + 's <span class="t">(' + (c.e - c.s).toFixed(2) + 's)</span></span>' +
        '<span class="t">inicio</span><button data-nudge="' + idx + ',s,-1">«</button><button data-nudge="' + idx + ',s,1">»</button>' +
        '<span class="t">fin</span><button data-nudge="' + idx + ',e,-1">«</button><button data-nudge="' + idx + ',e,1">»</button>' +
        '<button class="dng" data-rm="' + idx + '">Quitar</button></div>';
    });
    box.innerHTML = hh;
    Array.prototype.forEach.call(box.querySelectorAll('[data-nudge]'), function (btn) {
      btn.onclick = function () {
        var parts = btn.getAttribute('data-nudge').split(',');
        var idx = +parts[0], side = parts[1], dir = +parts[2];
        var c = manualCuts[idx], step = dir / 30;
        if (side === 's') c.s = Math.max(0, Math.min(c.e - 1 / 30, c.s + step));
        else c.e = Math.min(tlDur, Math.max(c.s + 1 / 30, c.e + step));
        drawCuts(); refreshInfo();
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-rm]'), function (btn) {
      btn.onclick = function () { manualCuts.splice(+btn.getAttribute('data-rm'), 1); drawCuts(); refreshInfo(); };
    });
  }

  api('/jobs/' + cur + '/envelope').then(function (env) {
    var box = document.getElementById('tlwave');
    if (!box) return;
    var hh = '';
    (env.values || []).forEach(function (v) { hh += '<b style="height:' + Math.max(3, Math.round(v * 86)) + 'px"></b>'; });
    box.innerHTML = hh;
  }).catch(function () {});

  wrap.onmousedown = function (ev) {
    if (ev.target.closest('.tl-cut')) return;
    var scroller = wrap.parentElement, rect = scroller.getBoundingClientRect();
    var x0 = ev.clientX - rect.left + scroller.scrollLeft;
    var sel = document.createElement('div'); sel.className = 'tl-sel'; wrap.appendChild(sel);
    function upd(x1) { var a = Math.min(x0, x1), b = Math.max(x0, x1); sel.style.left = a + 'px'; sel.style.width = (b - a) + 'px'; }
    function move(e2) { upd(e2.clientX - rect.left + scroller.scrollLeft); }
    function up(e2) {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      var x1 = e2.clientX - rect.left + scroller.scrollLeft;
      var a = Math.min(x0, x1) / tlPxPerSec, b = Math.max(x0, x1) / tlPxPerSec;
      sel.remove();
      if (b - a < 0.05) {
        var player = document.getElementById('v');
        if (player) player.currentTime = outputAtSource(x1 / tlPxPerSec);
        return;
      }
      manualCuts.push(snapRange(a, b));
      drawCuts(); refreshInfo();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  drawCuts();
}

function sourceAtOutput(t) {
  if (!tlKeep.length) return t;
  for (var i = 0; i < tlKeep.length; i++) {
    var k = tlKeep[i], len = k.e - k.s;
    if (t < k.o + len) return k.s + Math.max(0, t - k.o);
  }
  var last = tlKeep[tlKeep.length - 1];
  return last.e;
}

function outputAtSource(t) {
  if (!tlKeep.length) return t;
  for (var i = 0; i < tlKeep.length; i++) {
    var k = tlKeep[i];
    if (t < k.s) return k.o;
    if (t < k.e) return k.o + (t - k.s);
  }
  var last = tlKeep[tlKeep.length - 1];
  return last.o + (last.e - last.s);
}

function wireMusic(d) {
  var up = document.getElementById('mUp'), file = document.getElementById('mFile');
  if (up) up.onclick = function () { file.click(); };
  if (file) file.onchange = function () {
    var f = file.files[0]; if (!f) return;
    var fd = new FormData(); fd.append('file', f); fd.append('name', f.name);
    var box = document.getElementById('mList'); if (box) box.innerHTML = '<span class="msg">Subiendo…</span>';
    fetch('/music', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
      .then(function () { file.value = ''; loadMusicList(d); })
      .catch(function (e) { alert('Error al subir: ' + e.message); loadMusicList(d); });
  };
  loadMusicList(d);
}
function loadMusicList(d) {
  var box = document.getElementById('mList'); if (!box) return;
  api('/music').then(function (r) {
    var tracks = r.tracks || [], def = r.default || null;
    var sel = d.musicOff ? null : (d.musicName || def || null);
    var h = '<span class="mtrk' + (sel === null ? ' on' : '') + '" data-pick="">Sin música</span>';
    tracks.forEach(function (t) {
      h += '<span class="mtrk' + (sel === t ? ' on' : '') + '" data-pick="' + esc(t) + '">' +
        '<span class="star' + (def === t ? ' on' : '') + '" data-star="' + esc(t) + '" title="Hacer predeterminada">★</span> ' +
        esc(t) + ' <span class="x" data-del="' + esc(t) + '" title="Borrar">✕</span></span>';
    });
    if (!tracks.length) h += '<span class="msg">Sube tu primera canción.</span>';
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll('[data-pick]'), function (el) {
      el.onclick = function (ev) {
        if (ev.target.closest('[data-star],[data-del]')) return;
        pickMusic(d, el.getAttribute('data-pick') || null);
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-star]'), function (el) {
      el.onclick = function (ev) {
        ev.stopPropagation();
        api('/music/default', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: el.getAttribute('data-star') }) })
          .then(function () { loadMusicList(d); });
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-del]'), function (el) {
      el.onclick = function (ev) {
        ev.stopPropagation();
        var name = el.getAttribute('data-del');
        if (!confirm('¿Borrar "' + name + '" de la biblioteca?')) return;
        api('/music/' + encodeURIComponent(name), { method: 'DELETE' }).then(function () { loadMusicList(d); });
      };
    });
  }).catch(function () { box.innerHTML = '<span class="msg">No se pudo cargar la música.</span>'; });
}
function pickMusic(d, name) {
  var box = document.getElementById('mList');
  if (box) box.innerHTML = '<span class="msg">Aplicando…</span>';
  api('/jobs/' + cur + '/music', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ musicName: name }) })
    .then(function () { openJob(cur); })
    .catch(function (e) { alert('Error: ' + e.message); loadMusicList(d); });
}

function apply() {
  var hit = {};
  manualCuts.forEach(function (c) { words.forEach(function (w) {
    if (!w.f && w.i >= 0 && !removed[w.i] && Math.min(w.end, c.e) - Math.max(w.start, c.s) >= 1 / 60) hit[w.i] = true;
  }); });
  var hitCount = Object.keys(hit).length;
  if (hitCount && !confirm('Los cortes seleccionados eliminarán ' + hitCount + ' palabra' + (hitCount === 1 ? '' : 's') + ' hablada' + (hitCount === 1 ? '' : 's') + '. ¿Aplicar de todos modos?')) return;
  var btn = document.getElementById('apply'); btn.disabled = true;
  document.getElementById('info').textContent = 'Enviando…';
  api('/jobs/' + cur + '/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ removed: Object.keys(removed).map(Number), restored: Object.keys(restored).map(Number), edits: edits, times: times, manualCuts: manualCuts, brollEvents: brollEvents }) })
    .then(function () { openJob(cur); })
    .catch(function (e) { document.getElementById('info').textContent = 'Error: ' + e.message; btn.disabled = false; });
}
document.getElementById('library').onclick = showLibrary;
document.getElementById('refresh').onclick = function () { cur ? openJob(cur) : showList(); };
document.getElementById('tok').onclick = function () { showTokenForm(''); };
showList();
</script></body></html>`;
