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
.item{display:flex;justify-content:space-between;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer}
.item small{color:var(--mut)}
.tag{font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid var(--line);color:var(--mut)}
.tag.ok{color:var(--ac);border-color:var(--ac)}
.detail{display:grid;grid-template-columns:minmax(0,300px) 1fr;gap:18px;margin-top:6px}
@media(max-width:760px){.detail{grid-template-columns:1fr}}
video{width:100%;max-height:70vh;background:#000;border-radius:12px}
.words{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;line-height:2.1;min-height:120px}
.w{padding:2px 5px;border-radius:6px;cursor:pointer;user-select:none}
.w:hover{background:#242831}
.w.cur{background:#2c3a33;outline:1px solid var(--ac)}
.w.rep{color:var(--rep);text-decoration:line-through}
.w.usr{color:var(--usr);text-decoration:line-through}
.w.sus{box-shadow:inset 0 -2px 0 var(--sus)}
.w.fil{color:var(--mut);text-decoration:line-through;cursor:default;font-size:14px}
.legend{color:var(--mut);font-size:13px;margin:10px 0}
.bar{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;align-items:center}
.msg{color:var(--mut);font-size:14px}
.top{display:flex;gap:10px;align-items:center;margin-bottom:10px}
a{color:var(--ac)}
.tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.tabs button.on{background:var(--ac);color:#06210f;border-color:var(--ac);font-weight:600}
.w.edt{border-bottom:2px dashed var(--ac)}
.mode{display:flex;gap:8px;margin-bottom:10px}
.mode button.on{border-color:var(--ac);color:var(--ac)}
button.dng{color:var(--usr)}
</style></head><body>
<header><h1>B Edit · Revisión</h1><button id="refresh">Actualizar</button><button id="tok">Token</button></header>
<main id="app"></main>
<script>
var TOKEN = '';
try { TOKEN = localStorage.getItem('bedit_token') || ''; } catch (e) {}
var app = document.getElementById('app');
var cur = null, removed = {}, edits = {}, words = [], poll = null, dirty = false, tab = 'pendiente', mode = 'quitar', lastJobs = [];

function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ Authorization: 'Bearer ' + TOKEN }, opts.headers || {});
  return fetch(path, opts).then(function (r) {
    return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; });
  });
}
function askToken() {
  var t = prompt('Pega tu token de B Edit');
  if (t) { TOKEN = t.trim(); try { localStorage.setItem('bedit_token', TOKEN); } catch (e) {} }
  return !!TOKEN;
}
function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

function stateOf(j) { return j.deleted ? 'eliminado' : (j.approved ? 'aprobado' : 'pendiente'); }
function showList() {
  clearInterval(poll); cur = null;
  if (!TOKEN && !askToken()) { app.innerHTML = '<p class="msg">Falta el token.</p>'; return; }
  app.innerHTML = '<p class="msg">Cargando…</p>';
  api('/jobs').then(function (d) { lastJobs = d.jobs; drawList(); })
    .catch(function (e) { app.innerHTML = '<p class="msg">Error: ' + esc(e.message) + ' — revisa el token.</p>'; });
}
function drawList() {
  var counts = { pendiente: 0, aprobado: 0, eliminado: 0 };
  lastJobs.forEach(function (j) { counts[stateOf(j)]++; });
  var names = { pendiente: 'Pendientes', aprobado: 'Aprobados', eliminado: 'Eliminados' };
  var h = '<div class="tabs">';
  ['pendiente', 'aprobado', 'eliminado'].forEach(function (k) { h += '<button data-tab="' + k + '"' + (tab === k ? ' class="on"' : '') + '>' + names[k] + ' (' + counts[k] + ')</button>'; });
  h += '</div>';
  var rows = lastJobs.filter(function (j) { return stateOf(j) === tab; });
  if (!rows.length) h += '<p class="msg">No hay videos aquí.</p>';
  else {
    h += '<div class="list">';
    rows.forEach(function (j) {
      var st = j.status === 'listo' ? '<span class="tag ok">listo</span>' : '<span class="tag">' + esc(j.status) + (j.progress ? ' ' + Math.round(j.progress * 100) + '%' : '') + '</span>';
      h += '<div class="item" data-id="' + j.id + '"><div>' + esc(j.name || j.id) + '<br><small>' + new Date(j.createdAt).toLocaleString('es-CL') + '</small></div><div>' + st + '</div></div>';
    });
    h += '</div>';
  }
  app.innerHTML = h;
  Array.prototype.forEach.call(app.querySelectorAll('.tabs button'), function (el) { el.onclick = function () { tab = el.getAttribute('data-tab'); drawList(); }; });
  Array.prototype.forEach.call(app.querySelectorAll('.item'), function (el) { el.onclick = function () { openJob(el.getAttribute('data-id')); }; });
}

function openJob(id) {
  cur = id; removed = {}; edits = {}; dirty = false; mode = 'quitar'; clearInterval(poll);
  app.innerHTML = '<p class="msg">Cargando…</p>';
  api('/jobs/' + id + '/review').then(function (d) { render(d); }).catch(function (e) { app.innerHTML = '<p class="msg">Error: ' + esc(e.message) + '</p><button onclick="showList()">Volver</button>'; });
}

function render(d) {
  words = d.words;
  words.forEach(function (w) { if (w.i >= 0 && w.x) removed[w.i] = true; });
  var busy = d.status !== 'listo';
  var h = '<div class="top"><button id="back">← Videos</button><b>' + esc(d.name || cur) + '</b>' + (d.approved ? ' <span class="tag ok">aprobado</span>' : '') + '</div>';
  if (busy) {
    h += '<p class="msg" id="st">Procesando: ' + esc(d.status) + ' ' + Math.round((d.progress || 0) * 100) + '%…</p>';
    app.innerHTML = h; document.getElementById('back').onclick = showList;
    poll = setInterval(function () { api('/jobs/' + cur + '/review').then(function (n) { if (n.status === 'listo' || n.status === 'error') { clearInterval(poll); render(n); } else document.getElementById('st').textContent = 'Procesando: ' + n.status + ' ' + Math.round((n.progress || 0) * 100) + '%…'; }); }, 5000);
    return;
  }
  if (d.status === 'error') h += '<p class="msg">Hubo un error: ' + esc(d.error || '') + '</p>';
  var st = d.deleted ? 'eliminado' : (d.approved ? 'aprobado' : 'pendiente');
  h += '<div class="detail"><div><video id="v" controls playsinline src="/jobs/' + cur + '/result?t=' + encodeURIComponent(TOKEN) + '&v=' + Date.now() + '"></video></div><div>';
  if (d.editable) {
    h += '<div class="mode"><button id="m1">Quitar palabras</button><button id="m2">Editar texto</button></div>';
    h += '<div class="words" id="words"></div>';
    h += '<div class="legend"><span style="color:var(--rep)">naranja</span> = repetición quitada sola · <span style="color:var(--usr)">rojo</span> = la quitaste tú · <span style="box-shadow:inset 0 -2px 0 var(--sus)">subrayado</span> = sospechoso · gris = muletilla. En "Quitar palabras" toca una palabra para quitarla o recuperarla. En "Editar texto" toca una palabra para corregirla.</div>';
  } else {
    h += '<p class="msg">Este video es de una versión anterior: se puede ver y aprobar, pero no editar palabras.</p>';
  }
  h += '<div class="bar">';
  if (d.editable) h += '<button class="pri" id="apply" disabled>Aplicar cambios</button>';
  if (st === 'pendiente') h += '<button id="approve">Aprobar ✔</button><button class="dng" id="del">Eliminar</button>';
  else h += '<button id="restore">Devolver a pendientes</button>' + (st === 'aprobado' ? '<button class="dng" id="del">Eliminar</button>' : '');
  h += '<span class="msg" id="info"></span></div></div></div>';
  app.innerHTML = h;
  document.getElementById('back').onclick = showList;
  if (d.editable) {
    drawWords(true); setMode(mode);
    document.getElementById('m1').onclick = function () { setMode('quitar'); };
    document.getElementById('m2').onclick = function () { setMode('editar'); };
    document.getElementById('apply').onclick = apply;
  }
  var v = document.getElementById('v');
  v.ontimeupdate = function () {
    var t = v.currentTime, best = null;
    for (var k = 0; k < words.length; k++) { if (words[k].o >= 0 && words[k].o <= t) best = k; else if (words[k].o > t) break; }
    Array.prototype.forEach.call(document.querySelectorAll('.w.cur'), function (e) { e.classList.remove('cur'); });
    if (best !== null) { var el = document.getElementById('w' + best); if (el) el.classList.add('cur'); }
  };
  var ap = document.getElementById('approve'), dl = document.getElementById('del'), rs = document.getElementById('restore');
  if (ap) ap.onclick = function () { if (dirty && !confirm('Tienes cambios sin aplicar. ¿Aprobar igual el video actual?')) return; setState('aprobado'); };
  if (dl) dl.onclick = function () { if (confirm('¿Mandar este video a Eliminados?')) setState('eliminado'); };
  if (rs) rs.onclick = function () { setState('pendiente'); };
}

function setMode(m) {
  mode = m;
  document.getElementById('m1').className = m === 'quitar' ? 'on' : '';
  document.getElementById('m2').className = m === 'editar' ? 'on' : '';
}

function setState(s) {
  api('/jobs/' + cur + '/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: s }) })
    .then(function () { tab = s === 'eliminado' ? 'eliminado' : s; showList(); })
    .catch(function (e) { document.getElementById('info').textContent = 'Error: ' + e.message; });
}

function wcls(w) {
  var c = 'w';
  if (removed[w.i]) c += w.x === 'rep' ? ' rep' : ' usr';
  if (w.s) c += ' sus';
  if (w.e || edits[w.i] !== undefined) c += ' edt';
  return c;
}
function drawWords() {
  var box = document.getElementById('words'), h = '';
  words.forEach(function (w, k) {
    if (w.f) { h += '<span class="w fil" id="w' + k + '">' + esc(w.t) + '</span> '; return; }
    h += '<span class="' + wcls(w) + '" id="w' + k + '" data-k="' + k + '">' + esc(edits[w.i] !== undefined ? edits[w.i] : w.t) + '</span> ';
  });
  box.innerHTML = h;
  Array.prototype.forEach.call(box.querySelectorAll('.w[data-k]'), function (el) {
    el.onclick = function () {
      var w = words[+el.getAttribute('data-k')];
      if (mode === 'editar') {
        var t = prompt('Corregir texto de esta palabra', edits[w.i] !== undefined ? edits[w.i] : w.t);
        if (t === null || !t.trim()) return;
        edits[w.i] = t.trim(); el.textContent = edits[w.i];
      } else {
        if (removed[w.i]) delete removed[w.i]; else removed[w.i] = true;
      }
      dirty = true;
      el.className = wcls(w);
      document.getElementById('apply').disabled = false;
      document.getElementById('info').textContent = Object.keys(removed).length + ' quitadas · ' + Object.keys(edits).length + ' corregidas';
    };
  });
}

function apply() {
  var btn = document.getElementById('apply'); btn.disabled = true;
  document.getElementById('info').textContent = 'Enviando…';
  api('/jobs/' + cur + '/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ removed: Object.keys(removed).map(Number), edits: edits }) })
    .then(function () { openJob(cur); })
    .catch(function (e) { document.getElementById('info').textContent = 'Error: ' + e.message; btn.disabled = false; });
}
document.getElementById('refresh').onclick = function () { cur ? openJob(cur) : showList(); };
document.getElementById('tok').onclick = function () { askToken(); showList(); };
showList();
</script></body></html>`;
