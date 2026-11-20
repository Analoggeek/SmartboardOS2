/* 3D Lab — interactive 3D models for teaching (Three.js, lazy loaded) */
import { el, toast, clamp, downloadURL, beep } from '../utils.js';
import { icon } from '../icons.js';

const THREE_URL = '../../vendor/three/three.module.min.js';

/* ------------------------------------------------------------------ */
/* model builders (each returns { object, update?, camera?, background? }) */
/* ------------------------------------------------------------------ */
const PALETTE = {
  indigo: 0x6366f1, violet: 0xa855f7, cyan: 0x22d3ee, sky: 0x0ea5e9,
  emerald: 0x10b981, amber: 0xf59e0b, rose: 0xf43f5e, slate: 0x94a3b8,
};

function makeSolid(THREE, geometry, color = PALETTE.indigo, opts = {}) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color, metalness: 0.35, roughness: 0.3, flatShading: !!opts.flat,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.userData.isMesh = true;
  group.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, opts.threshold ?? 20),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
  );
  edges.userData.isEdge = true;
  group.add(edges);
  return group;
}

function makeAtom(THREE, radius, color, pos) {
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.25 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), mat);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.userData.isMesh = true;
  return mesh;
}

function makeBond(THREE, from, to, radius = 0.07, color = 0xcbd5e1) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, 18);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 }));
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  mesh.userData.isMesh = true;
  return mesh;
}

const MODELS = [
  /* ---------------- geometry ---------------- */
  {
    id: 'cube', name: 'Cube', group: 'Geometry', icon: 'layers',
    desc: '6 square faces · 12 edges · 8 vertices. Volume = a³, surface area = 6a².',
    build: (T) => makeSolid(T, new T.BoxGeometry(1.6, 1.6, 1.6), PALETTE.indigo),
  },
  {
    id: 'cuboid', name: 'Cuboid', group: 'Geometry', icon: 'layers',
    desc: 'Volume = l × b × h. A matchbox or a classroom is a cuboid.',
    build: (T) => makeSolid(T, new T.BoxGeometry(2.0, 1.2, 1.4), PALETTE.sky),
  },
  {
    id: 'sphere', name: 'Sphere', group: 'Geometry', icon: 'circle',
    desc: 'Volume = 4/3 πr³, surface area = 4πr². A ball or the Earth.',
    build: (T) => makeSolid(T, new T.SphereGeometry(1.05, 48, 32), PALETTE.violet),
  },
  {
    id: 'cylinder', name: 'Cylinder', group: 'Geometry', icon: 'layers',
    desc: 'Volume = πr²h. A water pipe, a can, a chalk piece.',
    build: (T) => makeSolid(T, new T.CylinderGeometry(0.85, 0.85, 1.9, 56), PALETTE.emerald),
  },
  {
    id: 'cone', name: 'Cone', group: 'Geometry', icon: 'layers',
    desc: 'Volume = ⅓πr²h. An ice-cream cone, a traffic cone.',
    build: (T) => makeSolid(T, new T.ConeGeometry(1.0, 1.9, 56), PALETTE.amber),
  },
  {
    id: 'prism', name: 'Triangular prism', group: 'Geometry', icon: 'layers',
    desc: 'Two triangular bases joined by three rectangles — a glass prism refracts light.',
    build: (T) => makeSolid(T, new T.CylinderGeometry(1.1, 1.1, 1.8, 3), PALETTE.cyan, { flat: true }),
  },
  {
    id: 'pyramid', name: 'Square pyramid', group: 'Geometry', icon: 'layers',
    desc: 'Volume = ⅓ × base area × height. The Egyptian pyramids are square pyramids.',
    build: (T) => makeSolid(T, new T.ConeGeometry(1.15, 1.8, 4), PALETTE.rose, { flat: true }),
  },
  {
    id: 'torus', name: 'Torus', group: 'Geometry', icon: 'circle',
    desc: 'A donut — used to teach surfaces of revolution.',
    build: (T) => makeSolid(T, new T.TorusGeometry(0.85, 0.32, 28, 72), PALETTE.violet),
  },
  {
    id: 'ico', name: 'Icosahedron', group: 'Geometry', icon: 'sparkles',
    desc: '20 triangular faces, 30 edges, 12 vertices — a Platonic solid.',
    build: (T) => makeSolid(T, new T.IcosahedronGeometry(1.15, 0), PALETTE.emerald, { flat: true }),
  },

  /* ---------------- science ---------------- */
  {
    id: 'solar', name: 'Solar system', group: 'Science', icon: 'sun',
    desc: 'The Sun at the centre, eight planets orbiting. Distances and speeds are simplified for the classroom.',
    camera: { radius: 15, phi: 1.02 },
    build: (T) => {
      const g = new T.Group();
      const sun = new T.Mesh(
        new T.SphereGeometry(0.62, 40, 30),
        new T.MeshStandardMaterial({ color: 0xffb703, emissive: 0xff9500, emissiveIntensity: 1.6, roughness: 0.6 })
      );
      g.add(sun);
      const light = new T.PointLight(0xffd9a0, 90, 40);
      g.add(light);

      const planets = [
        { r: 0.11, d: 1.15, c: 0xa8a29e, s: 1.6 },
        { r: 0.15, d: 1.55, c: 0xf59e0b, s: 1.15 },
        { r: 0.17, d: 2.05, c: 0x3b82f6, s: 0.9 },
        { r: 0.13, d: 2.5, c: 0xef4444, s: 0.72 },
        { r: 0.32, d: 3.15, c: 0xf97316, s: 0.5 },
        { r: 0.27, d: 3.85, c: 0xeab308, s: 0.38 },
        { r: 0.2, d: 4.45, c: 0x22d3ee, s: 0.3 },
        { r: 0.19, d: 4.95, c: 0x6366f1, s: 0.24 },
      ];
      const movers = [];
      planets.forEach((p, i) => {
        const orbit = new T.Mesh(
          new T.RingGeometry(p.d - 0.006, p.d + 0.006, 128),
          new T.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.28, side: T.DoubleSide })
        );
        orbit.rotation.x = -Math.PI / 2;
        g.add(orbit);

        const planet = new T.Mesh(
          new T.SphereGeometry(p.r, 32, 24),
          new T.MeshStandardMaterial({ color: p.c, roughness: 0.55, metalness: 0.15 })
        );
        planet.userData.isMesh = true;
        const pivot = new T.Group();
        pivot.rotation.y = Math.random() * Math.PI * 2;
        planet.position.x = p.d;
        pivot.add(planet);
        g.add(pivot);
        movers.push({ pivot, speed: p.s * 0.35, spin: planet, spinSpeed: 0.6 + i * 0.15 });

        if (i === 4) { // Saturn ring
          const ring = new T.Mesh(
            new T.RingGeometry(p.r * 1.4, p.r * 2.1, 64),
            new T.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.55, side: T.DoubleSide })
          );
          ring.rotation.x = -Math.PI / 2 + 0.35;
          planet.add(ring);
        }
      });

      // starfield
      const starGeo = new T.BufferGeometry();
      const count = 900;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r = 22 + Math.random() * 26;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph);
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      }
      starGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.add(new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 0.14, sizeAttenuation: true })));

      return {
        object: g,
        update: (t) => movers.forEach((m) => {
          m.pivot.rotation.y += m.speed * 0.01;
          m.spin.rotation.y += m.spinSpeed * 0.01;
        }),
      };
    },
  },
  {
    id: 'water', name: 'Water (H₂O)', group: 'Science', icon: 'sparkles',
    desc: 'Two hydrogen atoms bonded to one oxygen at about 104.5°, which makes water a polar molecule.',
    build: (T) => {
      const g = new T.Group();
      const o = [0, 0.22, 0];
      const angle = (104.5 * Math.PI) / 180 / 2;
      const h1 = [Math.sin(angle) * 0.95, 0.22 - Math.cos(angle) * 0.95, 0];
      const h2 = [-Math.sin(angle) * 0.95, 0.22 - Math.cos(angle) * 0.95, 0];
      g.add(makeAtom(T, 0.34, 0xef4444, o));
      g.add(makeAtom(T, 0.2, 0xe2e8f0, h1));
      g.add(makeAtom(T, 0.2, 0xe2e8f0, h2));
      g.add(makeBond(T, o, h1, 0.075));
      g.add(makeBond(T, o, h2, 0.075));
      return g;
    },
  },
  {
    id: 'co2', name: 'Carbon dioxide (CO₂)', group: 'Science', icon: 'sparkles',
    desc: 'A linear molecule: one carbon double-bonded to two oxygens. A greenhouse gas.',
    build: (T) => {
      const g = new T.Group();
      g.add(makeAtom(T, 0.3, 0x334155, [0, 0, 0]));
      g.add(makeAtom(T, 0.26, 0xef4444, [0.95, 0, 0]));
      g.add(makeAtom(T, 0.26, 0xef4444, [-0.95, 0, 0]));
      g.add(makeBond(T, [-0.95, 0, 0], [0, 0, 0], 0.08));
      g.add(makeBond(T, [0, 0, 0], [0.95, 0, 0], 0.08));
      return g;
    },
  },
  {
    id: 'methane', name: 'Methane (CH₄)', group: 'Science', icon: 'sparkles',
    desc: 'One carbon with four hydrogens at the corners of a tetrahedron — the simplest alkane.',
    build: (T) => {
      const g = new T.Group();
      const c = [0, 0, 0];
      g.add(makeAtom(T, 0.3, 0x475569, c));
      const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
      dirs.forEach((d) => {
        const v = new T.Vector3(...d).normalize().multiplyScalar(0.92);
        const p = [v.x, v.y, v.z];
        g.add(makeAtom(T, 0.18, 0xe2e8f0, p));
        g.add(makeBond(T, c, p, 0.065));
      });
      return g;
    },
  },
  {
    id: 'dna', name: 'DNA helix', group: 'Science', icon: 'sparkles',
    desc: 'The double helix — two sugar-phosphate backbones joined by base pairs, one full turn every 10 steps.',
    camera: { radius: 8.5, phi: 1.12 },
    build: (T) => {
      const g = new T.Group();
      const N = 26;
      const turns = 2.4;
      const height = 3.6;
      const radius = 0.85;
      const strands = [[], []];
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const ang = t * Math.PI * 2 * turns;
        const y = -height / 2 + t * height;
        strands[0].push(new T.Vector3(Math.cos(ang) * radius, y, Math.sin(ang) * radius));
        strands[1].push(new T.Vector3(Math.cos(ang + Math.PI) * radius, y, Math.sin(ang + Math.PI) * radius));
      }
      const colors = [0x6366f1, 0x22d3ee];
      strands.forEach((strand, si) => {
        strand.forEach((p) => {
          const m = makeAtom(T, 0.1, colors[si], [p.x, p.y, p.z]);
          g.add(m);
        });
        for (let i = 0; i < strand.length - 1; i++) {
          g.add(makeBond(T, strand[i].toArray(), strand[i + 1].toArray(), 0.035, si === 0 ? 0x6366f1 : 0x22d3ee));
        }
      });
      const baseColors = [0xf59e0b, 0x10b981, 0xf43f5e, 0xa855f7];
      for (let i = 0; i < N; i += 1) {
        g.add(makeBond(T, strands[0][i].toArray(), strands[1][i].toArray(), 0.028, baseColors[i % baseColors.length]));
      }
      g.rotation.z = 0.12;
      return g;
    },
  },
];

/* ------------------------------------------------------------------ */
/* mount                                                              */
/* ------------------------------------------------------------------ */
export async function mount({ root, api }) {
  const app = el('div', { class: 'app lab3d' });
  const toolbar = el('div', { class: 'app-toolbar' });
  const body = el('div', { class: 'lab3d-body' });
  const side = el('div', { class: 'lab3d-side' });
  const viewport = el('div', { class: 'lab3d-view' });
  const loader = el('div', { class: 'lab3d-loading' },
    el('div', { class: 'lab3d-spinner' }),
    el('div', { text: 'Loading 3D engine…' })
  );
  viewport.append(loader);
  body.append(side, viewport);
  app.append(toolbar, body);
  root.append(app);

  let THREE = null;
  try {
    THREE = await import(THREE_URL);
  } catch (e) {
    console.error(e);
    loader.innerHTML = '';
    loader.append(el('div', { style: { textAlign: 'center', color: 'var(--text-3)', fontSize: '13px', padding: '20px' }, text: '3D engine could not load.' }));
    return {};
  }

  /* ---------- renderer / scene ---------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'lab3d-canvas';
  viewport.append(renderer.domElement);
  loader.remove();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6366f1, 1.6);
  rim.position.set(-5, -2, -4);
  scene.add(rim);

  const grid = new THREE.GridHelper(12, 24, 0x64748b, 0x334155);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = -1.35;
  scene.add(grid);

  /* ---------- state ---------- */
  let current = MODELS[0];
  let model = null;
  let updater = null;
  let spin = true;
  let wireframe = false;
  let showGrid = true;
  let theta = 0.75;
  let phi = 1.12;
  let radius = 5;
  let baseRadius = 5;
  let zoom = 1;

  const effectiveRadius = () => {
    const comp = camera.aspect < 1 ? clamp(1 / camera.aspect, 1, 2.6) : 1;
    return clamp(baseRadius * comp * zoom, 1.6, 70);
  };
  let raf = null;
  let disposed = false;
  const clock = new THREE.Clock();

  /* ---------- ui ---------- */
  const info = el('div', { class: 'lab3d-info' });
  viewport.append(info);

  const spinBtn = el('button', { class: 'tool-btn active ghost', html: `${icon('refresh')}<span>Spin</span>`, title: 'Auto rotate' });
  const wireBtn = el('button', { class: 'tool-btn ghost', html: `${icon('grid')}<span>Wireframe</span>`, title: 'Wireframe' });
  const gridBtn = el('button', { class: 'tool-btn ghost active', html: `${icon('layers')}<span>Grid</span>`, title: 'Floor grid' });
  const resetBtn = el('button', { class: 'tool-btn', html: icon('rotate'), title: 'Reset camera' });
  const shotBtn = el('button', { class: 'tool-btn', html: icon('download'), title: 'Download PNG' });
  const boardBtn = el('button', { class: 'tool-btn ghost', html: `${icon('board')}<span>Send to board</span>`, title: 'Send image to whiteboard' });

  toolbar.append(
    el('button', { class: 'tool-btn ghost', html: `${icon('grid')}<span>Models</span>`, onclick: () => side.classList.toggle('open') }),
    el('div', { class: 'sep' }),
    spinBtn, wireBtn, gridBtn, resetBtn,
    el('div', { class: 'sep' }),
    shotBtn, boardBtn
  );

  spinBtn.addEventListener('click', () => {
    spin = !spin;
    spinBtn.classList.toggle('active', spin);
  });
  wireBtn.addEventListener('click', () => {
    wireframe = !wireframe;
    wireBtn.classList.toggle('active', wireframe);
    applyWireframe();
  });
  gridBtn.addEventListener('click', () => {
    showGrid = !showGrid;
    gridBtn.classList.toggle('active', showGrid);
    grid.visible = showGrid && current.group === 'Geometry';
  });
  resetBtn.addEventListener('click', () => {
    theta = 0.75;
    phi = current.camera?.phi ?? 1.12;
    zoom = 1;
    radius = effectiveRadius();
    beep({ freq: 520, dur: 0.06, gain: 0.05 });
  });
  shotBtn.addEventListener('click', () => {
    const url = snapshot();
    if (url) { downloadURL(url, `smartboard-3d-${current.id}.png`); toast('3D snapshot downloaded', 'ok'); }
  });
  boardBtn.addEventListener('click', () => {
    const url = snapshot();
    if (!url) return;
    api.open('whiteboard', { image: url, title: `3D · ${current.name}` });
    toast(`${current.name} sent to whiteboard`, 'ok');
  });

  /* ---------- sidebar ---------- */
  function buildSidebar() {
    side.innerHTML = '';
    const groups = {};
    MODELS.forEach((m) => { (groups[m.group] ||= []).push(m); });
    Object.entries(groups).forEach(([group, list]) => {
      side.append(el('div', { class: 'lab3d-group-label', text: group }));
      list.forEach((m) => {
        const btn = el('button', { class: `lab3d-model ${m.id === current.id ? 'active' : ''}`, dataset: { id: m.id } },
          el('span', { class: 'lab3d-model-ico', html: icon(m.icon) }),
          el('span', { text: m.name })
        );
        btn.addEventListener('click', () => { select(m.id); side.classList.remove('open'); });
        side.append(btn);
      });
    });
  }

  /* ---------- model handling ---------- */
  function disposeObject(obj) {
    obj.traverse((n) => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) {
        if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
        else n.material.dispose();
      }
    });
  }

  function select(id) {
    const def = MODELS.find((m) => m.id === id);
    if (!def) return;
    current = def;
    if (model) { scene.remove(model); disposeObject(model); model = null; updater = null; }
    const built = def.build(THREE);
    if (built.isObject3D) {
      model = built;
    } else {
      model = built.object;
      updater = built.update || null;
    }
    scene.add(model);
    grid.visible = showGrid && (def.group === 'Geometry');
    applyWireframe();
    // camera framing — ignore the starfield so the model fills the view nicely
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((n) => {
      if (!n.geometry || n.isPoints) return;
      const b = new THREE.Box3().setFromObject(n);
      if (!b.isEmpty()) box.union(b);
    });
    const size = box.isEmpty() ? 3 : box.getSize(new THREE.Vector3()).length();
    const fitted = clamp(size * 1.75, 3.6, 34);
    baseRadius = def.camera?.radius ?? fitted;
    zoom = 1;
    radius = effectiveRadius();
    phi = def.camera?.phi ?? 1.12;
    theta = 0.75;
    side.querySelectorAll('.lab3d-model').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    renderInfo();
    api.setTitle(`3D Lab · ${def.name}`);
    beep({ freq: 660, dur: 0.05, gain: 0.04 });
  }

  function applyWireframe() {
    scene.traverse((n) => {
      if (n.userData.isMesh && n.material && 'wireframe' in n.material) {
        n.material.wireframe = wireframe;
      }
      if (n.userData.isEdge) n.visible = !wireframe;
    });
  }

  function renderInfo() {
    info.innerHTML = '';
    info.append(
      el('div', { class: 'lab3d-info-title' }, current.name),
      el('div', { class: 'lab3d-info-desc', text: current.desc }),
      el('div', { class: 'lab3d-info-hint', text: 'Drag to orbit · scroll or pinch to zoom' })
    );
  }

  function snapshot() {
    try {
      renderer.render(scene, camera);
      const canvas = renderer.domElement;
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext('2d');
      // readable backdrop for the whiteboard / export
      const light = document.documentElement.dataset.theme === 'light';
      const grad = ctx.createLinearGradient(0, 0, out.width, out.height);
      if (light) { grad.addColorStop(0, '#f8fafc'); grad.addColorStop(1, '#e2e8f0'); }
      else { grad.addColorStop(0, '#101a33'); grad.addColorStop(1, '#070b16'); }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0);
      return out.toDataURL('image/png');
    } catch (e) {
      console.warn(e);
      toast('Could not capture the 3D view', 'err');
      return null;
    }
  }

  /* ---------- orbit controls ---------- */
  const pointers = new Map();
  let pinchStart = 0;
  let pinchRadius = radius;
  let dragging = false;
  let last = { x: 0, y: 0 };

  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', (e) => {
    dom.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, e);
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      pinchStart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRadius = zoom;
    }
  });
  dom.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchStart) zoom = clamp(pinchRadius * (pinchStart / dist), 0.3, 3.2);
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    theta -= dx * 0.008;
    phi = clamp(phi - dy * 0.008, 0.08, Math.PI - 0.08);
  });
  const endDrag = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = 0;
    if (!pointers.size) dragging = false;
  };
  dom.addEventListener('pointerup', endDrag);
  dom.addEventListener('pointercancel', endDrag);
  dom.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = clamp(zoom * (1 + e.deltaY * 0.0012), 0.3, 3.2);
  }, { passive: false });

  /* ---------- resize + loop ---------- */
  function resize() {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(viewport);
  resize();

  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (spin) theta += dt * 0.35;
    radius += (effectiveRadius() - radius) * 0.14;
    camera.position.setFromSphericalCoords(radius, phi, theta);
    camera.lookAt(0, 0, 0);
    if (updater) updater(performance.now());
    renderer.render(scene, camera);
  }

  buildSidebar();
  renderInfo();
  api.setTitle('3D Lab');
  await new Promise((r) => setTimeout(r, 30));
  resize();
  select('cube');
  frame();

  const onTheme = () => { /* grid colour follows CSS vars already; nothing to rebuild */ };
  window.addEventListener('sbos:theme', onTheme);

  return {
    onParams: (p = {}) => { if (p.model && MODELS.some((m) => m.id === p.model)) select(p.model); },
    onResize: () => resize(),
    onClose: () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('sbos:theme', onTheme);
      if (model) disposeObject(model);
      renderer.dispose();
    },
    getModel: () => current.id,
  };
}
