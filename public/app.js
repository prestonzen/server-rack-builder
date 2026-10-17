import { solve, DEFAULTS, MATERIALS, LETTERS } from './solver.js';
import { createViewer, MAT_COLORS } from './render.js';

const STORE = 'server-rack-builder.config.v1';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mm = (v) => Math.round(v).toLocaleString('en-US');

let cfg = load();
let result = null;

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable */ }
  return JSON.parse(JSON.stringify(DEFAULTS));
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* storage unavailable */ }
}

// ---------- viewer ----------
const viewer = createViewer($('#cv'), $('#overlay'));
const ui = { mode: 'assembled', lining: true, devices: true, labels: true };

function setMode(mode) {
  ui.mode = mode;
  const ex = mode === 'exploded' ? 1 : 0;
  viewer.setExplode(ex);
  viewer.setOptions({ cutaway: mode === 'cutaway' });
  $('#exr').value = String(ex * 100);
  $('#exo').textContent = `${ex * 100}%`;
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
}
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#exr').addEventListener('input', (e) => {
  const v = +e.target.value;
  viewer.setExplode(v / 100);
  $('#exo').textContent = `${v}%`;
  const mode = ui.mode === 'cutaway' ? 'cutaway' : v >= 50 ? 'exploded' : 'assembled';
  ui.mode = mode;
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
});
document.querySelectorAll('.toggles button').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.layer;
  ui[k] = !ui[k];
  b.setAttribute('aria-pressed', String(ui[k]));
  viewer.setOptions({ [k]: ui[k] });
}));
$('#resetView').addEventListener('click', () => viewer.resetView());

viewer.onPick((b) => {
  const el = $('#pick');
  if (!b) { el.innerHTML = '<span class="pick-empty">Tap any part to see its size and where it comes from.</span>'; return; }
  const m = MATERIALS[b.mat] || { label: b.mat };
  let size = '';
  if (b.shape === 'cyl') size = `Ø ${mm(b.r * 2)} mm`;
  else {
    const s = [...b.size].map(Math.round).sort((a, c) => c - a);
    size = `${mm(s[0])} × ${mm(s[1])} × ${mm(s[2])} mm`;
  }
  const extra = b.device ? `${b.u}U, ${mm(b.depth)} mm deep` : (b.from || '');
  el.innerHTML = `${b.letter ? `<span class="lchip">${esc(b.letter)}</span>` : `<span class="swatch" style="--sw:${hex(MAT_COLORS[b.mat])}"></span>`}
    <span class="pick-name">${esc(b.name)}</span>
    <span class="pick-size mono">${size}</span>
    <span class="pick-meta">${esc(m.label)}${extra ? ' · ' + esc(extra) : ''}</span>`;
});

function hex(n) { return '#' + (n ?? 0).toString(16).padStart(6, '0'); }

function renderLegend() {
  const items = [
    ['plywood', 'Plywood sheet'], ['plank', 'Plywood plank'], ['steel', 'Steel'], ['aluminum', 'Aluminum'],
    ['fiber', 'Dense fiber'], ['foam', 'Acoustic foam'],
  ];
  $('#legend').innerHTML = items.map(([k, l]) => `<span class="lg-item"><span class="swatch" style="--sw:${hex(MAT_COLORS[k])}"></span>${l}</span>`).join('');
}

// ---------- editors ----------
function field(path, label, value, opts = {}) {
  const id = 'f-' + path.join('-');
  const type = opts.text ? 'text' : 'number';
  return `<label class="fld${opts.wide ? ' wide' : ''}" for="${id}"><span>${label}</span>
    <input id="${id}" type="${type}" ${type === 'number' ? `inputmode="decimal" min="0" step="${opts.step || 1}"` : ''} data-path="${path.join('.')}" value="${esc(value)}"></label>`;
}

function renderEditors() {
  $('#sheetsEd').innerHTML = cfg.sheets.map((s, i) => `
    <div class="row-card">
      <div class="row-head">${field(['sheets', i, 'name'], 'Name', s.name, { text: true, wide: true })}
        <button class="icon-btn" data-remove="sheets.${i}" aria-label="Remove ${esc(s.name)}">×</button></div>
      <div class="grid4">${field(['sheets', i, 'l'], 'Length', s.l)}${field(['sheets', i, 'w'], 'Width', s.w)}${field(['sheets', i, 't'], 'Thick', s.t)}${field(['sheets', i, 'qty'], 'Qty', s.qty)}</div>
    </div>`).join('');
  $('#boardsEd').innerHTML = cfg.boards.map((b, i) => `
    <div class="row-card">
      <div class="row-head">${field(['boards', i, 'name'], 'Name', b.name, { text: true, wide: true })}
        <button class="icon-btn" data-remove="boards.${i}" aria-label="Remove ${esc(b.name)}">×</button></div>
      <div class="grid3">${field(['boards', i, 'l'], 'Length', b.l)}${field(['boards', i, 'w'], 'Width', b.w)}${field(['boards', i, 't'], 'Thick', b.t)}
        ${field(['boards', i, 'qty'], 'Qty', b.qty)}${field(['boards', i, 'nailed'], 'With nails', b.nailed || 0)}</div>
    </div>`).join('');
  $('#devicesEd').innerHTML = cfg.devices.map((d, i) => `
    <div class="row-card">
      <div class="row-head">${field(['devices', i, 'name'], 'Name', d.name, { text: true, wide: true })}
        <button class="icon-btn" data-remove="devices.${i}" aria-label="Remove ${esc(d.name)}">×</button></div>
      <div class="grid4">${field(['devices', i, 'u'], 'Height (U)', d.u)}${field(['devices', i, 'depth'], 'Depth', d.depth)}${field(['devices', i, 'width'], 'Width', d.width)}${field(['devices', i, 'level'], 'Level', d.level)}</div>
    </div>`).join('');
  const s = cfg.settings;
  const set = [
    ['lining', 'Wall lining', 'Fiber + foam total'], ['fiber', 'Fiber layer', 'Part of the lining'],
    ['floorLining', 'Floor mat', 'Under the bottom device'], ['sideClear', 'Side air', 'Each side of the widest device'],
    ['frontGap', 'Intake chamber', 'In front of the devices'], ['rearGap', 'Exhaust chamber', 'Behind the deepest device'],
    ['levelGap', 'Air between levels', 'Above each level'], ['topAir', 'Air at the top', 'Above the top level'],
    ['exhaustGap', 'Back opening', 'Under the back panel'], ['casterH', 'Caster height', 'Floor to cabinet'],
    ['kerf', 'Saw kerf', 'Blade width'], ['fans', 'Top fans', 'Number of fans'],
  ];
  $('#settingsEd').innerHTML = set.map(([k, l, h]) => `<label class="fld" for="f-settings-${k}"><span>${l}</span>
      <input id="f-settings-${k}" type="number" inputmode="decimal" min="0" step="1" data-path="settings.${k}" value="${s[k]}"><small>${h}</small></label>`).join('') +
    `<label class="fld" for="f-settings-shelfMode"><span>Shelves from</span>
      <select id="f-settings-shelfMode" data-path="settings.shelfMode">
        ${[['auto', 'Best use of stock'], ['sheet', 'Sheets if they fit'], ['planks', 'Planks']].map(([v, l]) => `<option value="${v}"${s.shelfMode === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select><small>Planks span the cleats</small></label>`;
}

function setPath(path, value) {
  const keys = path.split('.');
  let o = cfg;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  const last = keys[keys.length - 1];
  o[last] = last === 'name' || last === 'shelfMode' ? value : value === '' ? 0 : +value;
}

let timer = null;
$('#inputs').addEventListener('input', (e) => {
  const p = e.target.dataset.path;
  if (!p) return;
  setPath(p, e.target.value);
  clearTimeout(timer);
  timer = setTimeout(() => { save(); recompute(); }, 180);
});
$('#inputs').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-remove]');
  const add = e.target.closest('[data-add]');
  if (rm) {
    const [list, i] = rm.dataset.remove.split('.');
    cfg[list].splice(+i, 1);
  } else if (add) {
    const k = add.dataset.add;
    if (k === 'sheets') cfg.sheets.push({ name: 'Sheet', l: 1200, w: 600, t: 10, qty: 1 });
    if (k === 'boards') cfg.boards.push({ name: 'Plank', l: 1000, w: 70, t: 15, qty: 4, nailed: 0 });
    if (k === 'devices') cfg.devices.push({ name: 'New device', u: 1, depth: 400, width: 434, level: (Math.max(0, ...cfg.devices.map((d) => d.level || 1)) + 1) });
  } else return;
  save(); renderEditors(); recompute();
});
$('#resetDefaults').addEventListener('click', () => {
  const b = $('#resetDefaults');
  if (b.dataset.armed !== '1') {
    b.dataset.armed = '1'; b.textContent = 'Tap again to reset';
    setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Reset to my stock'; }, 3000);
    return;
  }
  cfg = JSON.parse(JSON.stringify(DEFAULTS));
  b.dataset.armed = ''; b.textContent = 'Reset to my stock';
  save(); renderEditors(); recompute();
});
$('#copyConfig').addEventListener('click', async () => {
  const txt = JSON.stringify(cfg, null, 2);
  const b = $('#copyConfig');
  try { await navigator.clipboard.writeText(txt); b.textContent = 'Copied'; }
  catch (e) { const ta = $('#cfgOut'); ta.hidden = false; ta.value = txt; ta.select(); b.textContent = 'Select and copy below'; }
  setTimeout(() => { b.textContent = 'Copy settings'; }, 2500);
});

// ---------- output ----------
function renderStats(r) {
  const d = r.dims;
  const sheetsUsed = r.sheets.length, sheetsAll = r.cfg.sheets.reduce((a, s) => a + s.qty, 0);
  const planks = r.boardUse.map((b) => `${b.used}/${b.qty}`).join(' · ');
  $('#stats').innerHTML = `
    <div class="stat"><span class="k">Outside</span><span class="v mono">${mm(d.W)} × ${mm(d.H + r.cfg.settings.casterH)} × ${mm(d.D + d.T.door)}</span><span class="u">W × H × D mm, on casters</span></div>
    <div class="stat"><span class="k">Inside, lined</span><span class="v mono">${mm(d.Wc)} × ${mm(d.Hi - d.L)}</span><span class="u">Devices up to ${mm(d.Dmax)} mm deep</span></div>
    <div class="stat"><span class="k">Sheets used</span><span class="v mono">${sheetsUsed}/${sheetsAll}</span><span class="u">${r.unusedSheets.length ? 'Spare: ' + esc(r.unusedSheets.join(', ')) : 'All in use'}</span></div>
    <div class="stat"><span class="k">Planks used</span><span class="v mono">${planks}</span><span class="u">${esc(r.boardUse.map((b) => b.name.toLowerCase()).join(' · '))}</span></div>`;
}

function renderWarnings(r) {
  const el = $('#warnings');
  if (!r.warnings.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = r.warnings.map((w) => `<p class="note note-${w.level}">${esc(w.text)}</p>`).join('');
}

function sheetSVG(s) {
  const pad = Math.max(s.l, s.w) * 0.02;
  const fs = Math.max(s.l, s.w) * 0.027;
  const vb = `${-pad} ${-pad} ${s.l + pad * 2} ${s.w + pad * 2}`;
  const pieces = s.placed.map((p) => {
    const small = Math.min(p.w, p.h) < fs * 3.2 || p.w < fs * 7;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const dimTxt = `${mm(p.pw)} × ${mm(p.ph)}`;
    return `<g><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" class="pc"/>
      ${small
        ? `<text x="${cx}" y="${cy}" class="pc-t" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${esc(p.letter)}</text>`
        : `<text x="${cx}" y="${cy - fs * 0.7}" class="pc-t" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${esc(p.letter)} · ${esc(p.name)}</text>
           <text x="${cx}" y="${cy + fs * 0.75}" class="pc-d" font-size="${fs * 0.85}" text-anchor="middle" dominant-baseline="central">${dimTxt}</text>`}
    </g>`;
  }).join('');
  const r = fs * 0.62;
  const cuts = s.cuts.map((c) => {
    const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
    const vert = Math.abs(c.x1 - c.x2) < 1;
    const lx = vert ? mx : Math.min(c.x2 - r * 1.6, c.x1 + r * 1.6 + (c.n % 3) * r * 2.4);
    const ly = vert ? Math.min(c.y2 - r * 1.6, c.y1 + r * 1.6 + (c.n % 3) * r * 2.4) : my;
    return `<line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" class="cut"/>
      <circle cx="${lx}" cy="${ly}" r="${r}" class="cut-dot"/><text x="${lx}" y="${ly}" font-size="${fs * 0.72}" class="cut-n" text-anchor="middle" dominant-baseline="central">${c.n}</text>`;
  }).join('');
  return `<svg viewBox="${vb}" role="img" aria-label="${esc(s.name)} cut layout">
    <rect x="0" y="0" width="${s.l}" height="${s.w}" class="sheet"/>
    <rect x="0" y="0" width="${s.l}" height="${s.w}" fill="url(#hatch)" class="offcut"/>
    ${pieces}${cuts}
    <rect x="0" y="0" width="${s.l}" height="${s.w}" class="sheet-edge"/></svg>`;
}

function renderCutPlan(r) {
  const defs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="hatch" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="24" class="hatch-l"/></pattern></defs></svg>`;
  $('#sheets').innerHTML = defs + (r.sheets.length ? r.sheets.map((s) => {
    const util = Math.round((s.usedArea / (s.l * s.w)) * 100);
    const steps = s.cuts.map((c) => {
      const vert = c.dir === 'cross';
      const len = vert ? Math.abs(c.y2 - c.y1) : Math.abs(c.x2 - c.x1);
      return `<li><span class="cut-badge">${c.n}</span><span>${vert ? 'Cross-cut' : 'Rip'} at <span class="mono">${mm(c.rel)}</span> mm from the ${vert ? 'left' : 'top'} edge <span class="muted">· runs ${mm(len)} mm</span></span></li>`;
    }).join('');
    return `<article class="sheet-card">
      <header><h3>${esc(s.name)}</h3><span class="mono muted">${mm(s.l)} × ${mm(s.w)} × ${s.t} mm · ${util}% used</span></header>
      <div class="svgwrap">${sheetSVG(s)}</div>
      <ol class="cut-steps">${steps}</ol></article>`;
  }).join('') : '<p class="muted">No sheet pieces. Add sheets under Your stock.</p>');
  const groups = new Map();
  r.boards.forEach((b) => { if (!groups.has(b.name)) groups.set(b.name, []); groups.get(b.name).push(b); });
  $('#boards').innerHTML = [...groups].map(([name, list]) => `<div class="board-group"><h4>${esc(name)} <span class="mono muted">${mm(list[0].len)} mm · ${list.length} used</span></h4>
    ${list.map((b, i) => `<div class="board${b.nailed ? ' nailed' : ''}" title="${b.nailed ? 'Has nails' : ''}">
      <span class="board-n mono">${i + 1}</span>
      <div class="bar">${b.cuts.map((c) => `<span class="seg-c" style="left:${(c.offset / b.len) * 100}%;width:${(c.len / b.len) * 100}%" title="${esc(c.label)}"><b>${esc(c.letter)}</b> ${mm(c.len)}</span>`).join('')}</div>
    </div>`).join('')}</div>`).join('') || '<p class="muted">No planks needed.</p>';
}

function renderParts(r) {
  const rows = r.parts.map((p) => `<tr><td><span class="lchip">${esc(p.letter)}</span></td><td>${esc(p.name)}</td>
    <td class="mono">${mm(p.a)} × ${mm(p.b)}</td><td class="mono">${p.t}</td><td class="mono">${p.qty || 1}</td><td>${esc(p.from)}</td></tr>`).join('');
  $('#parts').innerHTML = `<thead><tr><th></th><th>Part</th><th>Size (mm)</th><th>Thick</th><th>Qty</th><th>From</th></tr></thead><tbody>${rows}</tbody>`;
  $('#letterKey').innerHTML = Object.entries(LETTERS).map(([k, v]) => `<span><span class="lchip">${k}</span>${v}</span>`).join('');
}

function recompute() {
  try {
    result = solve(cfg);
  } catch (e) {
    $('#warnings').hidden = false;
    $('#warnings').innerHTML = `<p class="note note-error">These numbers don't make a cabinet yet: ${esc(e.message)}. Check the stock and device sizes.</p>`;
    return;
  }
  viewer.setModel(result.model);
  renderStats(result);
  renderWarnings(result);
  renderCutPlan(result);
  renderParts(result);
}

renderLegend();
renderEditors();
recompute();
setMode('assembled');
