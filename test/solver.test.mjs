import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, DEFAULTS, U } from '../public/solver.js';

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('default stock: box panels all come from solid sheets', () => {
  const r = solve(DEFAULTS);
  for (const k of ['top', 'bottom', 'sideL', 'sideR', 'door', 'back']) {
    const p = r.parts.find(x => x.key === k);
    assert.equal(p.material, 'plywood', `${k} should be a sheet piece`);
  }
  assert.equal(r.warnings.filter(w => w.level === 'error').length, 0);
});

test('placements stay inside their sheet and never overlap (kerf included)', () => {
  const r = solve(DEFAULTS);
  const k = DEFAULTS.settings.kerf;
  for (const s of r.sheets) {
    for (const p of s.placed) {
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= s.l + 1e-6 && p.y + p.h <= s.w + 1e-6, `${p.name} inside ${s.name}`);
    }
    for (let i = 0; i < s.placed.length; i++) for (let j = i + 1; j < s.placed.length; j++) {
      const a = s.placed[i], b = s.placed[j];
      assert.ok(!overlap({ ...a, w: a.w + k, h: a.h + k }, b) || !overlap(a, { ...b, w: b.w + k, h: b.h + k }), `${a.name} vs ${b.name}`);
      assert.ok(!overlap(a, b), `${a.name} overlaps ${b.name}`);
    }
  }
});

test('cabinet is big enough for every device', () => {
  const r = solve(DEFAULTS);
  const d = r.dims;
  const stack = d.levels.reduce((a, l) => a + l.h, 0);
  assert.ok(d.Hi - d.L - DEFAULTS.settings.floorLining >= stack, 'height');
  assert.ok(d.Wc >= Math.max(...DEFAULTS.devices.map(x => x.width)), 'width');
  assert.ok(d.D >= Math.max(...DEFAULTS.devices.map(x => x.depth)) + DEFAULTS.settings.lining, 'depth');
  assert.ok(Math.abs(U - 44.45) < 1e-9);
});

test('deep servers push pieces onto planks and report it', () => {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  cfg.devices.forEach(d => { if (d.name.includes('server')) d.depth = 760; });
  const r = solve(cfg);
  assert.ok(r.parts.some(p => p.material === 'plank' && !p.key.startsWith('shelf') && p.key !== 'cleat' && p.key !== 'caster'));
  assert.ok(r.warnings.some(w => w.level === 'info'));
});

test('no sheets at all still produces a plank-only plan', () => {
  const r = solve({ ...DEFAULTS, sheets: [] });
  assert.equal(r.sheets.length, 0);
  assert.ok(r.boards.length > 0);
  assert.ok(r.model.boxes.length > 20);
});

test('nailed planks are used last and flagged', () => {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  cfg.boards[0].nailed = 8;
  const r = solve(cfg);
  const long = r.boardUse[0];
  assert.ok(long.used - long.nailedUsed <= 6);
  if (long.used > 6) assert.ok(r.warnings.some(w => /nails/.test(w.text)));
});

test('shortage is reported, not hidden', () => {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  cfg.boards = [{ name: 'Long plank', l: 1860, w: 70, t: 15, qty: 2, nailed: 0 }];
  const r = solve(cfg);
  assert.ok(r.warnings.some(w => w.level === 'error'));
});

test('cut numbers run 1..n across all sheets', () => {
  const r = solve(DEFAULTS);
  const ns = r.sheets.flatMap(s => s.cuts.map(c => c.n));
  assert.deepEqual(ns, ns.map((_, i) => i + 1));
});

test('garbage input does not throw', () => {
  const r = solve({ sheets: [{ l: 'x', w: -1 }], boards: [], devices: [{ u: 0, depth: 0 }], settings: { lining: 'abc' } });
  assert.ok(r.model.boxes.length > 0);
});
