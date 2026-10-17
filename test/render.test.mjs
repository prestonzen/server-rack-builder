import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.THREE = THREE;
const { buildMeshes } = await import('../public/render.js');
const { solve, DEFAULTS } = await import('../public/solver.js');

test('3D model builds with three r128 and every mesh has finite geometry', () => {
  const r = solve(DEFAULTS);
  const mats = new Proxy({}, { get: () => new THREE.MeshBasicMaterial() });
  const { group, meshes } = buildMeshes(r.model, mats);
  assert.equal(meshes.length, r.model.boxes.length);
  const box = new THREE.Box3().setFromObject(group);
  for (const v of [box.min, box.max]) for (const c of ['x', 'y', 'z']) assert.ok(Number.isFinite(v[c]));
  assert.ok(box.min.y >= -1, 'nothing below the floor');
  const kinds = new Set(r.model.boxes.map(b => b.mat));
  for (const m of ['plywood', 'plank', 'steel', 'aluminum', 'foam', 'fiber', 'chassis']) assert.ok(kinds.has(m), m);
});

test('devices sit inside the lined interior when assembled', () => {
  const r = solve(DEFAULTS);
  const d = r.dims, s = DEFAULTS.settings;
  for (const b of r.model.boxes.filter(x => x.device)) {
    assert.ok(Math.abs(b.pos[0]) + b.size[0] / 2 <= d.Wi / 2 - s.lining + 0.5, `${b.name} width`);
    assert.ok(b.pos[2] + b.size[2] / 2 <= d.D / 2 - s.lining, `${b.name} front`);
    assert.ok(b.pos[2] - b.size[2] / 2 >= -d.D / 2, `${b.name} back`);
    assert.ok(b.pos[1] + b.size[1] / 2 <= r.model.y0 + d.T.bottom + d.Hi - s.lining + 0.5, `${b.name} top`);
  }
});
