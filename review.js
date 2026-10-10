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
.detail>div{min-width:0}
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
.mode{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.mode button.on{border-color:var(--ac);color:var(--ac)}
button.dng{color:var(--usr)}
.tl{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px}
.tl-scroll{overflow-x:auto;overflow-y:hidden;border-radius:8px}
.tl-wrap{position:relative;height:90px;background:#101216;border-radius:8px;cursor:crosshair}
.tl-wave{position:absolute;inset:0;display:flex;align-items:flex-end;gap:1px;padding:0 1px;pointer-events:none}
.tl-wave b{flex:1;background:#3a4049;min-width:1px;border-radius:1px}
.tl-cut{position:absolute;top:0;bottom:0;background:rgba(244,63,94,.35);border:1px solid var(--usr);cursor:pointer;z-index:2}
.tl-cut .h{position:absolute;top:0;bottom:0;width:10px;cursor:ew-resize;z-index:3}
.tl-cut .h.l{left:-5px}.tl-cut .h.r{right:-5px}
.tl-sel{position:absolute;top:0;bottom:0;background:rgba(110,231,168,.25);border:1px dashed var(--ac);pointer-events:none;z-index:1}
.tl-play{position:absolute;top:0;bottom:0;width:2px;background:#fff;pointer-events:none;z-index:4}
.tl-list{margin-top:10px;display:grid;gap:6px}
.tl-row{display:flex;align-items:center;gap:6px;background:#1c1f25;border-radius:8px;padding:6px 8px;font-size:13px;flex-wrap:wrap}
.tl-row button{padding:3px 8px;font-size:13px}
.tl-row span.t{color:var(--mut)}
.music{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:12px}
.music .mhead{display:flex;justify-content:space-between;align-items:center;gap:8px}
.mlist{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.mtrk{display:flex;align-items:center;gap:6px;background:#1c1f25;border:1px solid var(--line);border-radius:99px;padding:6px 10px;font-size:13px;cursor:pointer}
.mtrk.on{border-color:var(--ac);color:var(--ac)}
.mtrk .star{color:var(--mut);cursor:pointer}
.mtrk .star.on{color:var(--sus)}
.mtrk .x{color:var(--mut);cursor:pointer}
.mtrk .x:hover{color:var(--usr)}
</style></head><body>
<header><h1>B Edit · Revisión</h1><button id="refresh">Actualizar</button><button id="tok">Token</button></header>
<main id="app"></main>
<script>
var TOKEN = '';
try { TOKEN = localStorage.getItem('bedit_token') || ''; } catch (e) {}
var app = document.getElementById('app');
var cur = null, removed = {}, edits = {}, times = {}, manualCuts = [], words = [], poll = null, dirty = false, tab = 'pendiente', mode = 'quitar', lastJobs = [];
var tlPxPerSec = 0, tlDur = 0;

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
  cur = id; removed = {}; edits = {}; times = {}; manualCuts = []; dirty = false; mode = 'quitar'; clearInterval(poll);
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
    h += '<div class="mode"><button id="m1">Quitar palabras</button><button id="m2">Editar texto</button><button id="m3">Mover tiempo</button></div>';
    h += '<div class="words" id="words"></div>';
    h += '<div class="legend"><span style="color:var(--rep)">naranja</span> = repetición quitada sola · <span style="color:var(--usr)">rojo</span> = la quitaste tú · <span style="box-shadow:inset 0 -2px 0 var(--sus)">subrayado</span> = sospechoso · gris = muletilla · <span style="border-bottom:2px dashed var(--ac)">subrayado punteado</span> = editada/movida. "Quitar palabras": toca para quitar/recuperar. "Editar texto": toca para corregir. "Mover tiempo": toca y escribe cuántos cuadros (1/30s) desplazar esa palabra/subtítulo.</div>';
    h += '<div class="tl"><div class="legend" style="margin-top:0">Línea de tiempo: arrastra sobre el audio para cortar un tramo libre, a tu gusto (si quedas muy cerca de una palabra, se pega solo). Arrastra los bordes rojos para ajustarlos, o usa los botones de cuadro a cuadro.</div><div class="tl-scroll"><div id="tlwrap" class="tl-wrap"></div></div><div id="tllist" class="tl-list"></div></div>';
  } else {
    h += '<p class="msg">Este video es de una versión anterior: se puede ver y aprobar, pero no editar palabras.</p>';
  }
  h += '<div class="music"><div class="mhead"><b>🎵 Música</b><button id="mUp">Subir canción</button></div>' +
    '<input type="file" id="mFile" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,video/mp4,video/quicktime,.mov" style="display:none">' +
    '<div class="legend" style="margin:6px 0 0">Click en una pista para aplicarla al toque (queda de fondo, bajo volumen, sin tapar tu voz). Dale play al video para escucharla ya mezclada. ★ = predeterminada para videos nuevos.</div>' +
    '<div class="mlist" id="mList"><span class="msg">Cargando…</span></div></div>';
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
    document.getElementById('m3').onclick = function () { setMode('mover'); };
    document.getElementById('apply').onclick = apply;
    initTimeline(d);
    refreshInfo();
  }
  wireMusic(d);
  var v = document.getElementById('v');
  v.ontimeupdate = function () {
    var t = v.currentTime, best = null;
    for (var k = 0; k < words.length; k++) { if (words[k].o >= 0 && words[k].o <= t) best = k; else if (words[k].o > t) break; }
    Array.prototype.forEach.call(document.querySelectorAll('.w.cur'), function (e) { e.classList.remove('cur'); });
    if (best !== null) { var el = document.getElementById('w' + best); if (el) el.classList.add('cur'); }
    var pl = document.getElementById('tlplay'); if (pl && tlPxPerSec) pl.style.left = (v.currentTime * tlPxPerSec) + 'px';
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
  document.getElementById('m3').className = m === 'mover' ? 'on' : '';
}

function setState(s) {
  api('/jobs/' + cur + '/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: s }) })
    .then(function () { tab = s === 'eliminado' ? 'eliminado' : s; showList(); })
    .catch(function (e) { document.getElementById('info').textContent = 'Error: ' + e.message; });
}

function refreshInfo() {
  var apBtn = document.getElementById('apply'); if (apBtn) apBtn.disabled = false;
  var info = document.getElementById('info');
  if (info) info.textContent = Object.keys(removed).length + ' quitadas · ' + Object.keys(edits).length + ' corregidas · ' + Object.keys(times).length + ' movidas · ' + manualCuts.length + ' cortes manuales';
  dirty = true;
}

function wcls(w) {
  var c = 'w';
  if (removed[w.i]) c += w.x === 'rep' ? ' rep' : ' usr';
  if (w.s) c += ' sus';
  if (w.e || edits[w.i] !== undefined || times[w.i] !== undefined) c += ' edt';
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
      } else if (mode === 'mover') {
        var base = times[w.i] ? Math.round((times[w.i].start - w.start) * 30) : 0;
        var inp = prompt('Mover esta palabra/subtítulo: cuadros a desplazar (1 cuadro = 1/30s). Positivo = más tarde, negativo = más temprano. 0 = deshacer.', base);
        if (inp === null) return;
        var n = parseInt(inp, 10); if (!isFinite(n)) return;
        if (n === 0) delete times[w.i]; else times[w.i] = { start: w.start + n / 30, end: w.end + n / 30 };
      } else {
        if (removed[w.i]) delete removed[w.i]; else removed[w.i] = true;
      }
      el.className = wcls(w);
      refreshInfo();
    };
  });
}

function initTimeline(d) {
  manualCuts = (d.manualCuts || []).map(function (m) { return { s: m.s, e: m.e }; });
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
    Array.prototype.forEach.call(wrap.querySelectorAll('.tl-cut'), function (e) { e.remove(); });
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
    var rect = wrap.getBoundingClientRect();
    function move(e2) {
      var t = (e2.clientX - rect.left + wrap.parentElement.scrollLeft) / tlPxPerSec;
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
    var rect = wrap.getBoundingClientRect();
    var x0 = ev.clientX - rect.left;
    var sel = document.createElement('div'); sel.className = 'tl-sel'; wrap.appendChild(sel);
    function upd(x1) { var a = Math.min(x0, x1), b = Math.max(x0, x1); sel.style.left = a + 'px'; sel.style.width = (b - a) + 'px'; }
    function move(e2) { upd(e2.clientX - rect.left); }
    function up(e2) {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      var x1 = e2.clientX - rect.left;
      var a = Math.min(x0, x1) / tlPxPerSec, b = Math.max(x0, x1) / tlPxPerSec;
      sel.remove();
      if (b - a < 0.05) return;
      manualCuts.push(snapRange(a, b));
      drawCuts(); refreshInfo();
    }
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  drawCuts();
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
  var btn = document.getElementById('apply'); btn.disabled = true;
  document.getElementById('info').textContent = 'Enviando…';
  api('/jobs/' + cur + '/edit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ removed: Object.keys(removed).map(Number), edits: edits, times: times, manualCuts: manualCuts }) })
    .then(function () { openJob(cur); })
    .catch(function (e) { document.getElementById('info').textContent = 'Error: ' + e.message; btn.disabled = false; });
}
document.getElementById('refresh').onclick = function () { cur ? openJob(cur) : showList(); };
document.getElementById('tok').onclick = function () { askToken(); showList(); };
showList();
</script></body></html>`;
