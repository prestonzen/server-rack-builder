// Server Rack Builder: three.js viewer. Expects the three.js r128 UMD build on window.THREE.
const THREE = globalThis.THREE;

export const MAT_COLORS = {
  plywood: 0xdcc096, plank: 0xc0905a, steel: 0x6a727c, chassis: 0x30353c,
  aluminum: 0xc6d2dc, fiber: 0x7a6a58, foam: 0x3b4049, void: 0x0c0c0c,
};

function grainTexture(base, lines) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const y = rnd() * 256;
    g.strokeStyle = lines[i % lines.length];
    g.globalAlpha = 0.12 + rnd() * 0.18;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * (2 + rnd() * 3));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

function makeMaterials() {
  const m = {};
  const ply = grainTexture('#dcc096', ['#a8834f', '#c49d68', '#8f6a3c']);
  const plk = grainTexture('#c0905a', ['#8a5f30', '#a87943', '#734d26']);
  m.plywood = new THREE.MeshStandardMaterial({ color: ply ? 0xffffff : MAT_COLORS.plywood, map: ply, roughness: 0.82 });
  m.plank = new THREE.MeshStandardMaterial({ color: plk ? 0xffffff : MAT_COLORS.plank, map: plk, roughness: 0.85 });
  m.steel = new THREE.MeshStandardMaterial({ color: MAT_COLORS.steel, roughness: 0.45, metalness: 0.35 });
  m.chassis = new THREE.MeshStandardMaterial({ color: MAT_COLORS.chassis, roughness: 0.5, metalness: 0.3 });
  m.aluminum = new THREE.MeshStandardMaterial({ color: MAT_COLORS.aluminum, roughness: 0.3, metalness: 0.25 });
  m.fiber = new THREE.MeshStandardMaterial({ color: MAT_COLORS.fiber, roughness: 1 });
  m.foam = new THREE.MeshStandardMaterial({ color: MAT_COLORS.foam, roughness: 1 });
  m.void = new THREE.MeshStandardMaterial({ color: MAT_COLORS.void, roughness: 1 });
  m.bezel = new THREE.MeshStandardMaterial({ color: 0x4b525b, roughness: 0.4, metalness: 0.3 });
  m.led = new THREE.MeshStandardMaterial({ color: 0x2fd36b, emissive: 0x2fd36b, emissiveIntensity: 0.9 });
  m.edgeWood = new THREE.LineBasicMaterial({ color: 0x5c4326, transparent: true, opacity: 0.55 });
  m.edgeDark = new THREE.LineBasicMaterial({ color: 0x0f1216, transparent: true, opacity: 0.5 });
  return m;
}

export function buildMeshes(model, mats) {
  const group = new THREE.Group();
  const meshes = [];
  for (const b of model.boxes) {
    let geo;
    if (b.shape === 'cyl') {
      geo = new THREE.CylinderGeometry(b.r, b.r, b.len, 32);
      if (b.axis === 'x') geo.rotateZ(Math.PI / 2);
      if (b.axis === 'z') geo.rotateX(Math.PI / 2);
    } else {
      geo = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
    }
    const mesh = new THREE.Mesh(geo, mats[b.mat] || mats.steel);
    mesh.castShadow = b.mat !== 'void';
    mesh.receiveShadow = true;
    mesh.userData.box = b;
    mesh.userData.base = new THREE.Vector3(...b.pos);
    mesh.userData.ex = new THREE.Vector3(...b.ex);
    mesh.position.copy(mesh.userData.base);
    if (b.shape !== 'cyl' && (b.mat === 'plywood' || b.mat === 'plank' || b.mat === 'chassis')) {
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), b.mat === 'chassis' ? mats.edgeDark : mats.edgeWood));
    }
    if (b.device) {
      const [w, h, d] = b.size;
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(w - 6, h - 6, 3), mats.bezel);
      bezel.position.z = d / 2 + 1.5;
      mesh.add(bezel);
      const ears = new THREE.Mesh(new THREE.BoxGeometry(w + 44, h - 2, 3), mats.steel);
      ears.position.z = d / 2 - 1;
      mesh.add(ears);
      const led = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 2), mats.led);
      led.position.set(w / 2 - 34, h / 2 - 10, d / 2 + 3.5);
      mesh.add(led);
      for (let i = 0; i < Math.round(w / 60); i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(30, Math.max(4, h - 22), 1), mats.void);
        v.position.set(-w / 2 + 40 + i * 52, 0, d / 2 + 3.2);
        if (v.position.x < w / 2 - 70) mesh.add(v);
      }
    }
    group.add(mesh);
    meshes.push(mesh);
  }
  return { group, meshes };
}

export function createViewer(canvas, overlay) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 10, 30000);
  const mats = makeMaterials();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f98a3, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 0.72);
  key.position.set(2200, 2200, 2400);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2200, right: 2200, top: 2200, bottom: -2200, near: 100, far: 9000 });
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.38);
  fill.position.set(-1600, 900, -1300);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const root = new THREE.Group();
  scene.add(root);
  let meshes = [], model = null, labels = [];
  const st = { exT: 0, ex: 0, yaw: 0.72, pitch: 0.36, zoom: 1, dist: 3000, target: new THREE.Vector3(), lining: true, devices: true, labels: true, cutaway: false, auto: true, picked: null };
  let dirty = true, pickCb = null;

  function setModel(m) {
    model = m;
    root.clear();
    const built = buildMeshes(m, mats);
    meshes = built.meshes;
    root.add(built.group);
    buildLabels();
    if (st.picked) {
      const same = meshes.find(x => x.userData.box.key === st.picked.key && x.userData.box.name === st.picked.name);
      st.picked = null;
      if (same) highlight(same);
    }
    applyVisibility();
    dirty = true;
  }

  function buildLabels() {
    overlay.textContent = '';
    labels = [];
    const groups = new Map();
    for (const mesh of meshes) {
      const b = mesh.userData.box;
      if (!b.letter) continue;
      const pref = b.letter === 'A' ? b.key === 'sideR' : true;
      if (!groups.has(b.letter)) groups.set(b.letter, { key: b.key, list: [], pref });
      const g = groups.get(b.letter);
      if (!g.pref && pref) { g.key = b.key; g.list = []; g.pref = true; }
      if (b.key === g.key) g.list.push(mesh);
    }
    for (const [letter, g] of groups) {
      const el = document.createElement('div');
      el.className = 'chip3d';
      el.textContent = letter;
      overlay.appendChild(el);
      labels.push({ el, list: g.list });
    }
  }

  function applyVisibility() {
    for (const mesh of meshes) {
      const b = mesh.userData.box;
      let v = true;
      if (b.lining && !st.lining) v = false;
      if (b.device && !st.devices) v = false;
      if (st.cutaway && (b.cut || b.door)) v = false;
      mesh.visible = v;
    }
    dirty = true;
  }

  function highlight(mesh) {
    if (st.picked) {
      st.picked.mesh.material = st.picked.orig;
      st.picked = null;
    }
    if (!mesh) return;
    const orig = mesh.material;
    const hl = orig.clone();
    hl.emissive = new THREE.Color(0x2b57c9);
    hl.emissiveIntensity = 0.45;
    mesh.material = hl;
    st.picked = { mesh, orig, key: mesh.userData.box.key, name: mesh.userData.box.name };
    dirty = true;
  }

  function fitDistance() {
    if (!model) return 3000;
    const { W, H, D } = model.bounds;
    const f = st.ex;
    const ex = W * (1 + 1.5 * f), ey = H * (1 + 1.2 * f), ez = D * (1 + 1.5 * f);
    // Horizontal footprint seen from an angle is roughly the diagonal of width and depth.
    const halfW = 0.5 * Math.sqrt(ex * ex + ez * ez);
    const halfH = 0.5 * (ey + Math.sin(st.pitch) * Math.max(ex, ez) * 0.6);
    const vf = (camera.fov * Math.PI) / 360;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    return Math.max(halfH / Math.tan(vf), halfW / Math.tan(hf)) * 1.08 + Math.max(ex, ez) * 0.35;
  }

  function updateCamera() {
    if (model) {
      const f = st.ex;
      st.target.set(0, model.bounds.H * (0.45 + 0.1 * f), model.bounds.D * 0.2 * f);
    }
    const d = fitDistance() * st.zoom;
    const cp = Math.cos(st.pitch);
    camera.position.set(st.target.x + d * cp * Math.sin(st.yaw), st.target.y + d * Math.sin(st.pitch), st.target.z + d * cp * Math.cos(st.yaw));
    camera.lookAt(st.target);
  }

  const v3 = new THREE.Vector3();
  const occRay = new THREE.Raycaster();
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of labels) {
      const vis = st.labels && l.list.some(m => m.visible);
      if (!vis) { l.el.hidden = true; continue; }
      v3.set(0, 0, 0);
      const shown = l.list.filter(m => m.visible);
      shown.forEach(m => v3.add(m.position));
      v3.multiplyScalar(1 / shown.length);
      const top = shown[0].userData.box;
      if (top.size) v3.y += top.size[1] * 0.25;
      const world = v3.clone();
      v3.project(camera);
      if (v3.z > 1 || Math.abs(v3.x) > 1.05 || Math.abs(v3.y) > 1.05) { l.el.hidden = true; continue; }
      l.el.hidden = false;
      occRay.set(camera.position, world.clone().sub(camera.position).normalize());
      const dist = camera.position.distanceTo(world);
      const hit = occRay.intersectObjects(meshes.filter(m => m.visible), false).find(h => h.distance < dist - 30);
      l.el.classList.toggle('behind', !!(hit && !l.list.includes(hit.object)));
      l.el.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) st.auto = false;

  function frame() {
    const moving = Math.abs(st.exT - st.ex) > 0.001;
    if (moving) { st.ex += (st.exT - st.ex) * (reduced ? 1 : 0.14); dirty = true; }
    else if (st.ex !== st.exT) { st.ex = st.exT; dirty = true; }
    if (st.auto) { st.yaw += 0.0022; dirty = true; }
    if (dirty) {
      for (const mesh of meshes) mesh.position.copy(mesh.userData.base).addScaledVector(mesh.userData.ex, st.ex);
      updateCamera();
      renderer.render(scene, camera);
      placeLabels();
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Orbit, pinch and tap
  const pointers = new Map();
  let downAt = null, pinch0 = null, zoom0 = 1, moved = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.auto = false;
    if (pointers.size === 1) { downAt = { x: e.clientX, y: e.clientY }; moved = 0; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = st.zoom; moved = 99;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      st.yaw -= dx * 0.008;
      st.pitch = Math.max(-0.15, Math.min(1.35, st.pitch + dy * 0.006));
      dirty = true;
    } else if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()];
      st.zoom = Math.max(0.35, Math.min(2.5, zoom0 * pinch0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y))));
      dirty = true;
    }
  });
  const up = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = null;
    if (pointers.size === 0 && downAt && moved < 8) pick(e);
    if (pointers.size === 0) downAt = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinch0 = null; downAt = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    st.zoom = Math.max(0.35, Math.min(2.5, st.zoom * Math.exp(e.deltaY * 0.0012)));
    st.auto = false;
    dirty = true;
  }, { passive: false });

  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const hits = ray.intersectObjects(meshes.filter(m => m.visible), false);
    const mesh = hits.length ? hits[0].object : null;
    if (mesh && st.picked && st.picked.mesh === mesh) { highlight(null); pickCb && pickCb(null); return; }
    highlight(mesh);
    pickCb && pickCb(mesh ? mesh.userData.box : null);
  }

  return {
    setModel,
    setExplode(f) { st.exT = Math.max(0, Math.min(1, f)); dirty = true; },
    setOptions(o) { Object.assign(st, o); applyVisibility(); },
    onPick(fn) { pickCb = fn; },
    clearPick() { highlight(null); },
    resetView() { st.yaw = 0.72; st.pitch = 0.36; st.zoom = 1; dirty = true; },
    get explode() { return st.exT; },
  };
}
