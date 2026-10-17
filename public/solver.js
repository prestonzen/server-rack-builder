// Server Rack Builder: geometry + cut-plan solver. Pure functions, no DOM.
// All lengths are millimetres. World axes for the 3D model:
// x = width (centred), y = up from the floor, z = depth (centred, +z is the front).

export const U = 44.45;

export const DEFAULTS = {
  sheets: [
    { name: 'Big sheet', l: 1820, w: 910, t: 10, qty: 1 },
    { name: 'Medium sheet', l: 920, w: 600, t: 10, qty: 1 },
    { name: 'Long sheet', l: 1820, w: 445, t: 10, qty: 1 },
  ],
  boards: [
    { name: 'Long plank', l: 1860, w: 70, t: 15, qty: 14, nailed: 0 },
    { name: 'Short plank', l: 420, w: 70, t: 15, qty: 14, nailed: 0 },
  ],
  devices: [
    { name: '2U server', u: 2, depth: 650, width: 434, level: 1 },
    { name: '1U server', u: 1, depth: 650, width: 434, level: 2 },
    { name: '1U box', u: 1, depth: 500, width: 434, level: 3 },
    { name: 'Switch', u: 1, depth: 250, width: 440, level: 3 },
  ],
  settings: {
    lining: 40,       // total wall lining: dense fiber + foam
    fiber: 15,        // dense fiber layer, part of lining
    floorLining: 15,  // fiber mat under the bottom device
    sideClear: 13,    // air each side of the widest device
    frontGap: 50,     // intake chamber in front of the devices
    rearGap: 150,     // exhaust chamber behind the deepest device
    levelGap: 25,     // air above each level, under the next shelf
    topAir: 50,       // air above the top level
    exhaustGap: 140,  // opening under the back panel
    kerf: 3,
    casterH: 70,
    fans: 2,
    shelfMode: 'auto', // auto | sheet | planks
  },
};

export const MATERIALS = {
  plywood: { label: 'Plywood sheet', kind: 'wood' },
  plank: { label: 'Plywood plank', kind: 'wood' },
  steel: { label: 'Steel', kind: 'metal' },
  chassis: { label: 'Device chassis (steel)', kind: 'metal' },
  aluminum: { label: 'Aluminum', kind: 'aluminum' },
  fiber: { label: 'Dense fiber', kind: 'lining' },
  foam: { label: 'Acoustic foam', kind: 'lining' },
  void: { label: 'Opening', kind: 'other' },
};

export const LETTERS = {
  A: 'Sides', B: 'Top and bottom', C: 'Shelves', D: 'Shelf cleats', E: 'Fan holes',
  F: 'Caster blocks', G: 'Door', H: 'Battens', I: 'Back panel', S: 'Intake slot',
};

const num = (v, d = 0) => (Number.isFinite(+v) && +v >= 0 ? +v : d);

export function normalize(cfg) {
  const c = JSON.parse(JSON.stringify(cfg || DEFAULTS));
  c.sheets = (c.sheets || []).map(s => ({ name: s.name || 'Sheet', l: num(s.l), w: num(s.w), t: num(s.t, 10), qty: Math.floor(num(s.qty)) }))
    .filter(s => s.l > 0 && s.w > 0 && s.qty > 0)
    .map(s => (s.w > s.l ? { ...s, l: s.w, w: s.l } : s));
  c.boards = (c.boards || []).map(b => ({ name: b.name || 'Plank', l: num(b.l), w: num(b.w, 70), t: num(b.t, 15), qty: Math.floor(num(b.qty)), nailed: Math.floor(num(b.nailed)) }))
    .filter(b => b.l > 0 && b.w > 0 && b.qty > 0);
  c.devices = (c.devices || []).map(d => ({ name: d.name || 'Device', u: Math.max(1, Math.round(num(d.u, 1))), depth: num(d.depth, 500), width: num(d.width, 434) || 434, level: Math.max(1, Math.round(num(d.level, 1))) }))
    .filter(d => d.depth > 0);
  const s = { ...DEFAULTS.settings, ...(c.settings || {}) };
  for (const k of Object.keys(DEFAULTS.settings)) if (k !== 'shelfMode') s[k] = num(s[k], DEFAULTS.settings[k]);
  s.fiber = Math.min(s.fiber, s.lining);
  if (!['auto', 'sheet', 'planks'].includes(s.shelfMode)) s.shelfMode = 'auto';
  c.settings = s;
  return c;
}

// ---------- dimensions ----------
export function computeDims(cfg, T) {
  const s = cfg.settings, L = s.lining;
  const byLevel = new Map();
  for (const d of cfg.devices) {
    if (!byLevel.has(d.level)) byLevel.set(d.level, []);
    byLevel.get(d.level).push(d);
  }
  let levels = [...byLevel.keys()].sort((a, b) => a - b).map(k => {
    const items = byLevel.get(k);
    return { level: k, items, h: items.reduce((a, d) => a + d.u * U, 0), depth: Math.max(...items.map(d => d.depth)) };
  });
  if (!levels.length) levels = [{ level: 1, items: [], h: U, depth: 400 }];
  const maxW = Math.max(400, ...cfg.devices.map(d => d.width));
  const Dmax = Math.max(...levels.map(l => l.depth));
  const Wc = maxW + 2 * s.sideClear;
  const Wi = Math.ceil(Wc + 2 * L);
  const nShelves = levels.length - 1;
  const Hc = s.floorLining + levels.reduce((a, l) => a + l.h, 0) + nShelves * (s.levelGap + T.shelf) + s.topAir;
  const Hi = Math.ceil(Hc + L);
  const W = Wi + T.sideL + T.sideR;
  const H = Hi + T.top + T.bottom;
  const D = Math.ceil(L + s.frontGap + Dmax + s.rearGap + T.back);
  const backH = Math.max(80, Hi - s.exhaustGap);
  return { levels, maxW, Dmax, Wc, Wi, Hc, Hi, W, H, D, backH, shelfDepth: Math.ceil(Dmax), shelfWidth: Wi - 4, nShelves, L, T };
}

function panelPieces(d) {
  const p = [
    { key: 'bottom', letter: 'B', name: 'Bottom', w: d.D, h: d.Wi, weight: 3.2, strip: 'x', battens: 2 },
    { key: 'top', letter: 'B', name: 'Top', w: d.D, h: d.Wi, weight: 3, strip: 'x', battens: 2 },
    { key: 'sideL', letter: 'A', name: 'Left side', w: d.D, h: d.H, weight: 2, strip: 'z', battens: 2 },
    { key: 'sideR', letter: 'A', name: 'Right side', w: d.D, h: d.H, weight: 2, strip: 'z', battens: 2 },
    { key: 'door', letter: 'G', name: 'Door', w: d.W, h: d.H, weight: 2.2, strip: 'y', battens: 2 },
    { key: 'back', letter: 'I', name: 'Back panel', w: d.Wi, h: d.backH, weight: 1.5, strip: 'x', battens: 2 },
  ];
  for (let i = 0; i < d.nShelves; i++) {
    p.push({ key: 'shelf' + (i + 1), letter: 'C', name: 'Shelf ' + (i + 1), w: d.shelfDepth, h: d.shelfWidth, weight: 1, strip: 'x', battens: 0, shelf: true });
  }
  return p;
}

// ---------- sheet packing (guillotine, so every layout is cuttable with a straight saw) ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function packSheets(order, sheets, kerf, rule) {
  const bins = [];
  sheets.forEach((s, si) => {
    for (let q = 0; q < s.qty; q++) bins.push({ si, q, stock: s, W: s.l, H: s.w, free: [{ x: 0, y: 0, w: s.l + kerf, h: s.w + kerf }], placed: [], cuts: [] });
  });
  const unplaced = [];
  for (const pc of order) {
    let best = null;
    bins.forEach((b, bi) => {
      b.free.forEach((f, fi) => {
        for (const rot of [false, true]) {
          const pw = (rot ? pc.h : pc.w) + kerf, ph = (rot ? pc.w : pc.h) + kerf;
          if (pw <= f.w + 1e-6 && ph <= f.h + 1e-6) {
            const score = (b.placed.length ? 0 : 1e12) + (f.w * f.h - pw * ph);
            if (!best || score < best.score) best = { bi, fi, rot, pw, ph, score };
          }
        }
      });
    });
    if (!best) { unplaced.push(pc); continue; }
    const b = bins[best.bi], f = b.free[best.fi];
    b.free.splice(best.fi, 1);
    const w = best.rot ? pc.h : pc.w, h = best.rot ? pc.w : pc.h;
    b.placed.push({ piece: pc, x: f.x, y: f.y, w, h, rot: best.rot });
    const rw = f.w - best.pw, rh = f.h - best.ph;
    let horiz;
    if (rule === 'maxarea') horiz = Math.max(f.w * rh, rw * best.ph) >= Math.max(rw * f.h, best.pw * rh);
    else if (rule === 'shortaxis') horiz = f.w <= f.h;
    else horiz = f.w > f.h;
    const X = Math.min(b.W, f.x + f.w), Y = Math.min(b.H, f.y + f.h);
    const cutY = f.y + best.ph - kerf / 2, cutX = f.x + best.pw - kerf / 2;
    if (horiz) {
      if (rh > 0.5) b.cuts.push({ x1: f.x, y1: cutY, x2: X, y2: cutY, rel: cutY - f.y - kerf / 2, dir: 'rip' });
      if (rw > 0.5) b.cuts.push({ x1: cutX, y1: f.y, x2: cutX, y2: Math.min(b.H, f.y + best.ph - kerf / 2), rel: cutX - f.x - kerf / 2, dir: 'cross' });
      b.free.push({ x: f.x, y: f.y + best.ph, w: f.w, h: rh }, { x: f.x + best.pw, y: f.y, w: rw, h: best.ph });
    } else {
      if (rw > 0.5) b.cuts.push({ x1: cutX, y1: f.y, x2: cutX, y2: Y, rel: cutX - f.x - kerf / 2, dir: 'cross' });
      if (rh > 0.5) b.cuts.push({ x1: f.x, y1: cutY, x2: Math.min(b.W, f.x + best.pw - kerf / 2), y2: cutY, rel: cutY - f.y - kerf / 2, dir: 'rip' });
      b.free.push({ x: f.x + best.pw, y: f.y, w: rw, h: f.h }, { x: f.x, y: f.y + best.ph, w: best.pw, h: rh });
    }
    b.free = b.free.filter(r => r.w > kerf + 5 && r.h > kerf + 5);
  }
  return { bins, unplaced };
}

function bestPack(pieces, sheets, kerf) {
  if (!pieces.length || !sheets.length) return { bins: [], unplaced: [...pieces], score: 0 };
  const base = [...pieces].sort((a, b) => b.weight * b.w * b.h - a.weight * a.w * a.h);
  const rng = mulberry32(20261017);
  const orders = [base];
  for (let i = 0; i < 250; i++) {
    const o = [...base];
    const swaps = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < swaps; k++) {
      const a = Math.floor(rng() * o.length), c = Math.floor(rng() * o.length);
      [o[a], o[c]] = [o[c], o[a]];
    }
    orders.push(o);
  }
  let best = null;
  for (const order of orders) {
    for (const rule of ['maxarea', 'shortaxis', 'longaxis']) {
      const r = packSheets(order, sheets, kerf, rule);
      const score = r.bins.reduce((a, b) => a + b.placed.reduce((s2, p) => s2 + p.piece.weight * p.piece.w * p.piece.h, 0), 0);
      const used = r.bins.filter(b => b.placed.length).length;
      if (!best || score > best.score + 1e-6 || (Math.abs(score - best.score) < 1e-6 && used < best.used)) best = { ...r, score, used };
    }
  }
  return best;
}

// ---------- plank (1D) packing ----------
function packBoards(items, boards, kerf) {
  const stocks = [];
  boards.forEach((b, bi) => {
    const clean = Math.max(0, b.qty - b.nailed);
    for (let i = 0; i < b.qty; i++) stocks.push({ bi, board: b, nailed: i >= clean, len: b.l, used: 0, cuts: [] });
  });
  const sorted = [...items].sort((a, b) => b.len - a.len);
  const unplaced = [];
  for (const it of sorted) {
    let cand = null;
    for (const s of stocks) {
      if (!s.cuts.length || s.board.w < it.width - 0.5) continue;
      if (s.len - s.used >= it.len + kerf - 1e-6 && (!cand || s.len - s.used < cand.len - cand.used)) cand = s;
    }
    if (!cand) {
      const fresh = stocks.filter(s => !s.cuts.length && s.len >= it.len && s.board.w >= it.width - 0.5)
        .sort((a, b) => (a.nailed - b.nailed) || (a.len - b.len));
      cand = fresh[0] || null;
    }
    if (!cand) { unplaced.push(it); continue; }
    const off = cand.cuts.length ? cand.used + kerf : 0;
    cand.cuts.push({ ...it, offset: off });
    cand.used = off + it.len;
  }
  return { stocks: stocks.filter(s => s.cuts.length), unplaced };
}

function stripWidth(boards) {
  return boards.length ? Math.max(...boards.map(b => b.w)) : 70;
}

// How a plank-built panel is made: strips run across `len`, `count` of them.
function plankPlan(piece, d, boards) {
  const bw = stripWidth(boards);
  let len, span;
  if (piece.strip === 'x') { len = piece.key === 'back' ? d.Wi : piece.h; span = piece.w; }
  else if (piece.strip === 'z') { len = piece.w; span = piece.h; }
  else { len = piece.h; span = piece.w; }
  if (piece.key === 'back') { len = d.Wi; span = d.backH; }
  const count = Math.ceil(span / bw);
  const battenLen = piece.battens ? Math.max(100, Math.round(span - 2 * bw)) : 0;
  return { len: Math.round(len), count, bw, battenLen, battens: piece.battens };
}

// ---------- main ----------
export function solve(cfgIn) {
  const cfg = normalize(cfgIn);
  const s = cfg.settings;
  const sheetT = cfg.sheets.length ? Math.max(...cfg.sheets.map(x => x.t)) : 0;
  const plankT = cfg.boards.length ? Math.max(...cfg.boards.map(x => x.t)) : 15;
  const baseT = sheetT || plankT;
  let T = { sideL: baseT, sideR: baseT, top: baseT, bottom: baseT, back: baseT, door: baseT, shelf: s.shelfMode === 'planks' ? plankT : baseT };
  let dims, pieces, pack, planked;
  for (let iter = 0; iter < 4; iter++) {
    dims = computeDims(cfg, T);
    pieces = panelPieces(dims);
    const forced = pieces.filter(p => p.shelf && s.shelfMode === 'planks');
    const sheetPieces = pieces.filter(p => !forced.includes(p));
    pack = bestPack(sheetPieces, cfg.sheets, s.kerf);
    planked = [...forced, ...pack.unplaced];
    const nt = { ...T };
    for (const k of ['sideL', 'sideR', 'top', 'bottom', 'back', 'door']) nt[k] = planked.some(p => p.key === k) ? plankT : sheetT || plankT;
    nt.shelf = planked.some(p => p.shelf) ? plankT : sheetT || plankT;
    if (Object.keys(T).every(k => T[k] === nt[k])) break;
    T = nt;
  }

  // Where each panel comes from
  const source = {};
  pack.bins.forEach((b, bi) => b.placed.forEach(pl => { source[pl.piece.key] = { type: 'sheet', bin: bi, sheet: b.stock.name, rot: pl.rot }; }));
  const strips = [];
  for (const p of planked) {
    const plan = plankPlan(p, dims, cfg.boards);
    source[p.key] = { type: 'planks', ...plan };
    for (let i = 0; i < plan.count; i++) strips.push({ len: plan.len, width: plan.bw, label: p.name + ' strip', letter: p.letter, part: p.key });
    for (let i = 0; i < (plan.battens || 0); i++) strips.push({ len: plan.battenLen, width: plan.bw, label: p.name + ' batten', letter: 'H', part: p.key });
  }
  for (let i = 0; i < dims.nShelves; i++) for (let k = 0; k < 2; k++) strips.push({ len: dims.shelfDepth, width: stripWidth(cfg.boards), label: 'Cleat, shelf ' + (i + 1), letter: 'D', part: 'cleat' });
  for (let i = 0; i < 4; i++) strips.push({ len: 100, width: stripWidth(cfg.boards), label: 'Caster block', letter: 'F', part: 'caster' });
  const boards = packBoards(strips, cfg.boards, s.kerf);

  // Cut numbers in sheet order
  let n = 0;
  const sheets = pack.bins.filter(b => b.placed.length).map(b => ({
    name: b.stock.name, l: b.W, w: b.H, t: b.stock.t,
    placed: b.placed.map(p => ({ key: p.piece.key, letter: p.piece.letter, name: p.piece.name, x: p.x, y: p.y, w: p.w, h: p.h, pw: p.piece.w, ph: p.piece.h })),
    cuts: b.cuts.map(c => ({ ...c, n: ++n })),
    usedArea: b.placed.reduce((a, p) => a + p.w * p.h, 0),
  }));
  const unusedSheets = pack.bins.filter(b => !b.placed.length).map(b => b.stock.name);

  // Parts list
  const parts = pieces.map(p => {
    const src = source[p.key];
    return {
      key: p.key, letter: p.letter, name: p.name, a: Math.round(p.w), b: Math.round(p.h),
      t: src.type === 'sheet' ? sheetT : plankT,
      from: src.type === 'sheet' ? src.sheet : `${src.count} strips × ${src.len}` + (src.battens ? ` + ${src.battens} battens × ${src.battenLen}` : ''),
      material: src.type === 'sheet' ? 'plywood' : 'plank',
    };
  });
  parts.push({ key: 'cleat', letter: 'D', name: 'Shelf cleats', a: dims.shelfDepth, b: stripWidth(cfg.boards), t: plankT, qty: dims.nShelves * 2, from: 'Planks', material: 'plank' });
  parts.push({ key: 'caster', letter: 'F', name: 'Caster blocks', a: 100, b: stripWidth(cfg.boards), t: plankT, qty: 4, from: 'Planks', material: 'plank' });

  // Board usage summary
  const boardUse = cfg.boards.map((b, bi) => {
    const used = boards.stocks.filter(x => x.bi === bi);
    return { name: b.name, l: b.l, qty: b.qty, used: used.length, nailedUsed: used.filter(x => x.nailed).length };
  });

  // Warnings
  const warnings = [];
  if (boards.unplaced.length) {
    const byLen = {};
    boards.unplaced.forEach(u => { byLen[u.len] = (byLen[u.len] || 0) + 1; });
    warnings.push({ level: 'error', text: 'Not enough planks for: ' + Object.entries(byLen).map(([l, c]) => `${c} × ${l} mm`).join(', ') + '. Add stock or shorten the cabinet.' });
  }
  boardUse.forEach(b => { if (b.nailedUsed) warnings.push({ level: 'warn', text: `Uses ${b.nailedUsed} ${b.name.toLowerCase()}${b.nailedUsed > 1 ? 's' : ''} with nails. Pull the nails before cutting.` }); });
  for (const k of ['bottom', 'top', 'sideL', 'sideR', 'door', 'back']) {
    if (source[k] && source[k].type === 'planks') {
      const nm = pieces.find(p => p.key === k).name;
      warnings.push({ level: 'info', text: `${nm} doesn't fit on any sheet, so it's built from ${source[k].count} plank strips${source[k].battens ? ' held by ' + source[k].battens + ' battens' : ''}.` });
    }
  }
  if (s.rearGap < 130) warnings.push({ level: 'warn', text: 'Rear chamber is under 130 mm, so the top fans drop to 80 mm.' });
  if (s.frontGap < 30) warnings.push({ level: 'warn', text: 'Front intake chamber is under 30 mm. Servers may starve for air.' });

  const model = buildModel(dims, source, cfg);
  return {
    cfg, dims, T, parts, sheets, unusedSheets, boards: boards.stocks.map(x => ({ name: x.board.name, len: x.len, nailed: x.nailed, cuts: x.cuts.map(c => ({ len: c.len, letter: c.letter, label: c.label, offset: c.offset })) })),
    boardUse, warnings, model,
  };
}

// ---------- 3D model ----------
export function buildModel(d, source, cfg) {
  const s = cfg.settings, L = s.lining, fib = s.fiber, foamT = Math.max(0, L - fib), T = d.T;
  const y0 = s.casterH;
  const floorY = y0 + T.bottom, ceilY = floorY + d.Hi;
  const zFront = d.D / 2, zBack = -d.D / 2;
  const xIn = d.Wi / 2;
  const boxes = [];
  let id = 0;
  const add = (o) => { o.id = 'p' + (id++); o.shape = o.shape || 'box'; o.ex = o.ex || [0, 0, 0]; boxes.push(o); return o; };

  // Panel or its plank strips. axis: strip direction ('x'|'y'|'z'); thick: thickness axis.
  const panel = (key, letter, name, size, pos, ex, stripAxis, thickAxis, extra = {}) => {
    const src = source[key];
    if (!src || src.type === 'sheet') {
      add({ key, letter, name, size, pos, ex, mat: 'plywood', from: src ? src.sheet : '', ...extra });
      return;
    }
    const ax = { x: 0, y: 1, z: 2 };
    const sa = ax[stripAxis], ta = ax[thickAxis];
    const wa = [0, 1, 2].find(i => i !== sa && i !== ta);
    const span = size[wa], bw = src.bw, n = src.count;
    for (let i = 0; i < n; i++) {
      const start = -span / 2 + i * bw;
      const wdt = Math.min(bw, span / 2 - start) - 1.5;
      const sz = [...size]; sz[wa] = Math.max(4, wdt);
      const p = [...pos]; p[wa] = pos[wa] + start + sz[wa] / 2;
      add({ key, letter, name, size: sz, pos: p, ex, mat: 'plank', from: `${n} strips`, strip: true, ...extra });
    }
  };

  const W = d.W, H = d.H, D = d.D;
  // Sides
  panel('sideL', 'A', 'Left side', [T.sideL, H, D], [-(xIn + T.sideL / 2), y0 + H / 2, 0], [-0.8 * W, 0, 0], 'z', 'x', { cut: false });
  panel('sideR', 'A', 'Right side', [T.sideR, H, D], [xIn + T.sideR / 2, y0 + H / 2, 0], [0.8 * W, 0, 0], 'z', 'x', { cut: true });
  // Top and bottom between the sides
  panel('top', 'B', 'Top', [d.Wi, T.top, D], [0, ceilY + T.top / 2, 0], [0, 0.95 * H, 0], 'x', 'y');
  panel('bottom', 'B', 'Bottom', [d.Wi, T.bottom, D], [0, y0 + T.bottom / 2, 0], [0, -0.32 * H, 0], 'x', 'y');
  // Back panel, open underneath for exhaust
  const backY0 = floorY + (d.Hi - d.backH);
  panel('back', 'I', 'Back panel', [d.Wi, d.backH, T.back], [0, backY0 + d.backH / 2, zBack + T.back / 2], [0, 0, -0.6 * D], 'x', 'z');
  // Door (overlay, hinged on the left)
  panel('door', 'G', 'Door', [W, H, T.door], [0, y0 + H / 2, zFront + T.door / 2 + 2], [0, 0, 1.05 * D], 'y', 'z', { door: true });

  // Lining: fiber against the wood, foam facing in
  const liningLen = D - T.back;
  const zLin = (zFront + zBack + T.back) / 2;
  const hLin = d.Hi;
  [[-1, 'L'], [1, 'R']].forEach(([sgn, side]) => {
    add({ key: 'lining' + side, letter: '', name: 'Wall lining, dense fiber', size: [fib, hLin, liningLen], pos: [sgn * (xIn - fib / 2), floorY + hLin / 2, zLin], ex: [sgn * 0.42 * W, 0, 0], mat: 'fiber', lining: true, cut: sgn > 0 });
    if (foamT > 0) add({ key: 'lining' + side, letter: '', name: 'Wall lining, foam', size: [foamT, hLin, liningLen], pos: [sgn * (xIn - fib - foamT / 2), floorY + hLin / 2, zLin], ex: [sgn * 0.3 * W, 0, 0], mat: 'foam', lining: true, cut: sgn > 0 });
  });
  const innerW = d.Wi - 2 * L;
  add({ key: 'liningTop', letter: '', name: 'Ceiling lining, dense fiber', size: [innerW, fib, liningLen], pos: [0, ceilY - fib / 2, zLin], ex: [0, 0.65 * H, 0], mat: 'fiber', lining: true });
  if (foamT > 0) add({ key: 'liningTop', letter: '', name: 'Ceiling lining, foam', size: [innerW, foamT, liningLen], pos: [0, ceilY - fib - foamT / 2, zLin], ex: [0, 0.5 * H, 0], mat: 'foam', lining: true });
  const intakeD = Math.max(30, s.frontGap - 10);
  const floorLen = liningLen - L - intakeD;
  add({ key: 'liningFloor', letter: '', name: 'Floor mat, dense fiber', size: [innerW, s.floorLining, floorLen], pos: [0, floorY + s.floorLining / 2, zBack + T.back + floorLen / 2], ex: [0, -0.14 * H, 0], mat: 'fiber', lining: true });
  const backLinH = d.backH;
  add({ key: 'liningBack', letter: '', name: 'Back lining, foam', size: [innerW, backLinH, Math.max(10, L)], pos: [0, backY0 + backLinH / 2, zBack + T.back + L / 2], ex: [0, 0, -0.35 * D], mat: 'foam', lining: true });
  add({ key: 'liningDoor', letter: '', name: 'Door lining, foam', size: [innerW - 4, d.Hi - L - s.floorLining - 4, L], pos: [0, floorY + s.floorLining + (d.Hi - L - s.floorLining) / 2, zFront - L / 2], ex: [0, 0, 0.8 * D], mat: 'foam', lining: true, door: true });

  // Devices, shelves and cleats, level by level
  const zf = zFront - L - s.frontGap;
  let base = floorY + s.floorLining;
  d.levels.forEach((lv, i) => {
    if (i > 0) {
      const shelfY = base + s.levelGap;
      const key = 'shelf' + i;
      panel(key, 'C', 'Shelf ' + i, [d.shelfWidth, T.shelf, d.shelfDepth], [0, shelfY + T.shelf / 2, zf - d.shelfDepth / 2], [0, 0, 0], 'x', 'y');
      const bw = 70;
      [-1, 1].forEach(sg => add({ key: 'cleat', letter: 'D', name: 'Shelf cleat', size: [15, bw, d.shelfDepth], pos: [sg * (xIn - 7.5), shelfY - bw / 2, zf - d.shelfDepth / 2], ex: [sg * 0.8 * W, 0, 0], mat: 'plank', cut: sg > 0 }));
      base = shelfY + T.shelf;
    }
    let y = base;
    lv.items.forEach((dev, j) => {
      const h = dev.u * U;
      add({ key: 'dev', letter: '', name: dev.name, size: [dev.width, h - 1, dev.depth], pos: [0, y + h / 2, zf - dev.depth / 2], ex: [0, 0.04 * H * j, (0.42 + 0.06 * i) * D], mat: 'chassis', device: true, u: dev.u, depth: dev.depth });
      y += h;
    });
    base += lv.h;
  });

  // Intake slot and its aluminum grille, in the bottom at the front
  const slotW = Math.round(d.Wc - 40);
  add({ key: 'slot', letter: 'S', name: 'Intake slot', size: [slotW, T.bottom + 1, intakeD], pos: [0, y0 + T.bottom / 2, zFront - L - intakeD / 2], ex: [0, -0.32 * H, 0], mat: 'void' });
  add({ key: 'grille', letter: '', name: 'Intake grille', size: [slotW + 20, 1.5, intakeD + 20], pos: [0, y0 - 1, zFront - L - intakeD / 2], ex: [0, -0.4 * H, 0], mat: 'aluminum' });

  // Fan holes in the top, over the rear chamber
  const chamberMid = (zf - d.Dmax + zBack + T.back + L) / 2;
  const fanD = s.rearGap >= 130 ? 120 : 80;
  for (let i = 0; i < s.fans; i++) {
    const x = s.fans === 1 ? 0 : (i - (s.fans - 1) / 2) * (innerW / s.fans);
    add({ key: 'fan', letter: 'E', name: `Fan hole Ø${fanD - 10}`, shape: 'cyl', axis: 'y', r: (fanD - 10) / 2, len: T.top + 2, pos: [x, ceilY + T.top / 2, chamberMid], ex: [0, 0.95 * H, 0], mat: 'void' });
    add({ key: 'fanguard', letter: '', name: `${fanD} mm fan guard`, shape: 'cyl', axis: 'y', r: fanD / 2, len: 3, pos: [x, ceilY + T.top + 1.5, chamberMid], ex: [0, 1.0 * H, 0], mat: 'aluminum' });
    add({ key: 'fanbody', letter: '', name: `${fanD} mm fan`, size: [fanD, 25, fanD], pos: [x, ceilY - L - 13, chamberMid], ex: [0, 0.75 * H, 0], mat: 'steel', lining: false });
  }

  // Casters and blocks
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => {
    const x = sx * (W / 2 - 60), z = sz * (D / 2 - 60);
    add({ key: 'caster', letter: 'F', name: 'Caster block', size: [100, 15, 70], pos: [x, y0 - 7.5, z], ex: [0, -0.55 * H, 0], mat: 'plank' });
    add({ key: 'casterplate', letter: '', name: 'Caster', size: [60, 4, 60], pos: [x, y0 - 17, z], ex: [0, -0.62 * H, 0], mat: 'steel' });
    const r = Math.max(15, (y0 - 25) / 2);
    add({ key: 'wheel', letter: '', name: 'Caster wheel', shape: 'cyl', axis: 'x', r, len: 24, pos: [x, r, z], ex: [0, -0.62 * H, 0], mat: 'steel' });
  });

  // Door hardware
  const dz = zFront + T.door + 2;
  [0.2, 0.8].forEach(f => add({ key: 'hinge', letter: '', name: 'Hinge', size: [30, 50, 4], pos: [-W / 2 + 12, y0 + H * f, dz + 2], ex: [0, 0, 1.05 * D], mat: 'steel', door: true }));
  add({ key: 'handle', letter: '', name: 'Handle', size: [14, Math.min(160, H * 0.4), 20], pos: [W / 2 - 40, y0 + H / 2, dz + 12], ex: [0, 0, 1.05 * D], mat: 'aluminum', door: true });

  return { boxes, bounds: { W, H: H + y0, D }, y0 };
}
