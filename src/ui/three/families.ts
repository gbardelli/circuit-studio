import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PartData, PinDef } from '../../core/types';
import type { PartDef, Visual } from '../../parts/types';
import { LED_COLORS } from '../../parts/outputs';
import { MM, mats, plasticNoise } from './materials';
import type { BuildCtx, Model } from './generic';

// ───────────────────────── utilidades ─────────────────────────

function canvasTex(w: number, h: number, k: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = Math.max(4, Math.round(w * k));
  c.height = Math.max(4, Math.round(h * k));
  const g = c.getContext('2d')!;
  g.scale(k, k);
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Plano horizontal con textura (serigrafía, caras), en coordenadas locales. */
function topDecal(tex: THREE.Texture, cx: number, cz: number, w: number, h: number, y: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
  m.position.set(cx, y + 0.02, cz);
  m.userData.noPick = false;
  return m;
}

/** Pata de alambre: tubo por una polilínea con codos redondeados (resistencias, LED, condensadores). */
function wireLeg(points: THREE.Vector3[], r: number, mat: THREE.Material) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const bend = 1.1 * MM;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const prevDir = i > 0 ? b.clone().sub(a).normalize() : null;
    const start = prevDir ? a.clone().addScaledVector(prevDir, Math.min(bend, a.distanceTo(b) / 2)) : a.clone();
    const next = points[i + 2];
    const end = next ? b.clone().addScaledVector(b.clone().sub(a).normalize(), -Math.min(bend, a.distanceTo(b) / 2)) : b.clone();
    if (start.distanceTo(end) > 0.01) path.add(new THREE.LineCurve3(start, end));
    if (next) {
      const out = b.clone().addScaledVector(next.clone().sub(b).normalize(), Math.min(bend, b.distanceTo(next) / 2));
      path.add(new THREE.QuadraticBezierCurve3(end, b.clone(), out));
    }
  }
  const segs = Math.max(8, points.length * 10);
  const g = new THREE.TubeGeometry(path, segs, r, 8, false);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTex(32, 32, 2, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  });
  glowTex.userData.shared = true;
  return glowTex;
}

const legDepth = (ctx: BuildCtx) => (ctx.onBoard ? -3 * MM : 0);

// ───────────────────────── DIP ─────────────────────────

/** Integrado DIP si sus patillas forman dos filas a 0,3" con paso 0,1". */
export function isDip(pins: PinDef[]) {
  if (pins.length < 4 || pins.length % 2 || pins.some((p) => p.kind !== 'leg')) return false;
  const ys = new Set(pins.map((p) => p.y));
  if (ys.size !== 2) return false;
  const [y0, y1] = [...ys].sort((a, b) => a - b);
  return y1 - y0 === 30 && pins.every((p) => p.x % 10 === 0) && pins.filter((p) => p.y === y0).length === pins.length / 2;
}

const dipLegGeo = (() => {
  // Origen en el hueco, la pata sale del cuerpo hacia −z (fila inferior del documento).
  const t = 0.26 * MM;
  const parts = [
    new THREE.BoxGeometry(1.5 * MM, t, 3.2).translate(0, 4.4, -1.3), // hombro horizontal
    new THREE.BoxGeometry(1.5 * MM, 3.6, t).translate(0, 2.8, 0.2), // tramo ancho
    new THREE.BoxGeometry(0.5 * MM, 3 * MM + 1.2, t).translate(0, -(3 * MM) / 2 + 0.6 + 0.2, 0.2), // punta que entra al hueco
  ];
  const g = mergeGeometries(parts)!;
  g.userData.shared = true;
  return g;
})();

const dipTexCache = new Map<string, THREE.CanvasTexture>();

/** DIP de plástico moldeado: perfil con línea de partición, muesca, punto de patilla 1 y serigrafía. */
export function buildDip(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const ys = [...new Set(pins.map((p) => p.y))].sort((a, b) => a - b);
  const [yTop, yBot] = ys;
  const xs = pins.map((p) => p.x);
  const x0 = Math.min(...xs) - 5 + 0.25 * MM, x1 = Math.max(...xs) + 5 - 0.25 * MM;
  const zc = (yTop + yBot) / 2;
  const seat = 0.5 * MM, H = 3.3 * MM, half = 6.35 * MM / 2;
  // Perfil transversal (z, y): ligeramente cónico arriba y abajo, como sale del molde.
  const prof = new THREE.Shape();
  const pts: [number, number][] = [
    [-(half - 0.25 * MM), 0], [half - 0.25 * MM, 0], [half, H * 0.45], [half - 0.2 * MM, H], [-(half - 0.2 * MM), H], [-half, H * 0.45],
  ];
  prof.moveTo(-pts[0][0], pts[0][1]);
  for (const [z, y] of pts.slice(1)) prof.lineTo(-z, y);
  prof.closePath();
  const len = x1 - x0;
  const geo = new THREE.ExtrudeGeometry(prof, { depth: len - 0.6, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelOffset: -0.3, bevelSegments: 2 });
  geo.rotateY(Math.PI / 2);
  geo.translate(x0 + 0.3, seat, zc);
  const body = new THREE.Mesh(geo, mats().epoxy);
  body.castShadow = body.receiveShadow = true;
  group.add(body);

  // Patas: una sola malla instanciada; la fila superior se gira 180°.
  const legs = new THREE.InstancedMesh(dipLegGeo, mats().tin, pins.length);
  const m = new THREE.Matrix4();
  const rot = new THREE.Matrix4().makeRotationY(Math.PI);
  const base = ctx.onBoard ? 0 : 3 * MM;
  pins.forEach((p, i) => {
    m.makeTranslation(p.x, base, p.y);
    if (p.y === yTop) m.multiply(rot);
    legs.setMatrixAt(i, m);
  });
  legs.castShadow = true;
  group.add(legs);
  body.position.y += base;

  // Cara superior: muesca, punto de patilla 1 y referencia del fabricante.
  const topW = len, topH = 2 * (half - 0.2 * MM);
  const label = def.partNumber ?? def.name;
  const key = `${label}:${Math.round(topW)}`;
  let tex = dipTexCache.get(key);
  if (!tex) {
    tex = canvasTex(topW, topH, 10, (g) => {
      // Muesca semicircular en el extremo de la patilla 1 (izquierda).
      const r = 1.1 * MM;
      const grad = g.createRadialGradient(0.2, topH / 2 - 0.3, 0.2, 0, topH / 2, r);
      grad.addColorStop(0, 'rgba(0,0,0,0.75)');
      grad.addColorStop(0.75, 'rgba(0,0,0,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0.10)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, topH / 2, r, -Math.PI / 2, Math.PI / 2);
      g.fill();
      // Hoyuelo de expulsión junto a la patilla 1.
      const pin1 = pins[0];
      const dx = pin1.x - x0, dz = pin1.y === yBot ? topH - 1.6 * MM : 1.6 * MM;
      const d = g.createRadialGradient(dx + 0.3, dz - 0.3, 0.2, dx, dz, 0.55 * MM);
      d.addColorStop(0, 'rgba(0,0,0,0.6)');
      d.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = d;
      g.beginPath();
      g.arc(dx, dz, 0.55 * MM, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(214,218,224,0.86)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const size = Math.min(5.2, (topW - 10) / (label.length * 0.62));
      g.font = `600 ${size}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
      g.fillText(label, topW / 2 + 1, topH / 2 - 1.6);
      g.font = `500 ${size * 0.62}px ui-sans-serif, system-ui, sans-serif`;
      g.fillStyle = 'rgba(190,195,202,0.6)';
      g.fillText('E4 · 2147', topW / 2 + 1, topH / 2 + 3.6);
    });
    tex.userData.shared = true;
    dipTexCache.set(key, tex);
  }
  const top = topDecal(tex, x0 + topW / 2, zc, topW, topH, seat + base + H, { roughness: 0.6, bumpMap: plasticNoise(), bumpScale: 0.3 });
  (top.material as THREE.Material).userData.shared = false;
  group.add(top);
  return {
    group,
    anchorY: () => base + seat,
    top: base + seat + H,
    footprint: { x: x0, y: zc - half, w: len, h: half * 2 },
  };
}

// ───────────────────────── Resistencia ─────────────────────────

const BAND = ['#1a1a1a', '#7a4a22', '#d42a1f', '#f2771b', '#f2d01b', '#2a9d3c', '#2457c9', '#7d3fc1', '#8a8d92', '#f4f4f2'];
const GOLD = '#c9a24a', SILVER = '#bfc3c7';

/** Código de colores de 4 bandas (5 %) a partir del valor: dos cifras, multiplicador y tolerancia. */
export function resistorBands(ohms: number): string[] {
  if (!(ohms > 0) || !Number.isFinite(ohms)) return [BAND[0], BAND[0], BAND[0], GOLD];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / Math.pow(10, exp));
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    exp += 1;
  }
  const d1 = Math.floor(digits / 10), d2 = digits % 10;
  const mult = exp === -1 ? GOLD : exp === -2 ? SILVER : BAND[Math.max(0, Math.min(9, exp))];
  return [BAND[d1], BAND[d2], mult, GOLD];
}

const resTexCache = new Map<string, THREE.CanvasTexture>();

/** Resistencia axial de película de carbono: cuerpo de «hueso» por torno, bandas pintadas, patas dobladas a 90°. */
export function buildResistor(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const watts = Number(part.props.power ?? 0.25);
  const scale = watts >= 1 ? 1.9 : watts >= 0.5 ? 1.4 : watts <= 0.125 ? 0.8 : 1;
  const bands = resistorBands(Number(part.props.resistance ?? 220));
  return buildAxial(def, part, ctx, 'r:' + bands.join(), 6.3 * MM * scale, 1.2 * MM * Math.sqrt(scale), true, (g) => {
    g.fillStyle = '#d8c29a';
    g.fillRect(0, 0, 8, 64);
    // Bandas en v (a lo largo): tres juntas cerca de un extremo y la tolerancia separada.
    const at = [0.27, 0.36, 0.45, 0.72];
    bands.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, (1 - at[i] - 0.035) * 64, 8, 0.07 * 64);
    });
  });
}

/** Diodo 1N4148/1N400x: cuerpo negro (o vidrio) con la franja plateada del cátodo. */
export function buildDiode(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const pins = def.pins(part.props);
  const kAtEnd = (pins.find((p) => p.id === 'K')?.x ?? 1) > (pins.find((p) => p.id === 'A')?.x ?? 0);
  return buildAxial(def, part, ctx, 'd:' + kAtEnd, 5.2 * MM, 1.35 * MM, false, (g) => {
    g.fillStyle = '#1b1c1e';
    g.fillRect(0, 0, 8, 64);
    g.fillStyle = '#c9ccd0';
    const v = kAtEnd ? 0.16 : 0.74;
    g.fillRect(0, v * 64, 8, 0.1 * 64);
  });
}

function buildAxial(def: PartDef, part: PartData, ctx: BuildCtx, key: string, L: number, R: number, dogbone: boolean, draw: (g: CanvasRenderingContext2D) => void): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const [p1, p2] = pins;
  const span = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const lift = ctx.onBoard ? R + 0.6 * MM : R;
  // Perfil del torno con nodos equiespaciados: la coordenada v de la textura es proporcional al largo.
  const N = 48;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (t - 0.5) * L;
    const e = Math.abs(t - 0.5) * 2; // 0 centro, 1 extremos
    const cap = !dogbone ? 1 : e > 0.72 ? 1 + 0.12 * Math.sin(((e - 0.72) / 0.28) * Math.PI) : 0.94;
    const end = e > 0.96 ? Math.sqrt(Math.max(0, 1 - ((e - 0.96) / 0.04) ** 2)) : 1;
    prof.push(new THREE.Vector2(Math.max(0.05, R * cap * end), x));
  }
  const geo = new THREE.LatheGeometry(prof, 24);
  geo.rotateZ(-Math.PI / 2); // eje del torno a lo largo de x
  let tex = resTexCache.get(key);
  if (!tex) {
    tex = canvasTex(8, 64, 4, draw);
    tex.userData.shared = true;
    resTexCache.set(key, tex);
  }
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const body = new THREE.Mesh(geo, mat);
  const cx = (p1.x + p2.x) / 2, cz = (p1.y + p2.y) / 2;
  body.position.set(cx, lift, cz);
  body.rotation.y = -ang;
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const d = legDepth(ctx);
  const ux = Math.cos(ang), uz = Math.sin(ang);
  const e = Math.min(L / 2 - 0.2, span / 2);
  for (const [p, s] of [[p1, -1], [p2, 1]] as const) {
    group.add(
      wireLeg(
        [new THREE.Vector3(p.x, d, p.y), new THREE.Vector3(p.x, lift, p.y), new THREE.Vector3(cx + ux * e * s, lift, cz + uz * e * s)],
        0.3 * MM,
        mats().tin,
      ),
    );
  }
  return { group, anchorY: () => 0, top: lift + R * 1.15, footprint: { x: Math.min(p1.x, p2.x) - 3, y: Math.min(p1.y, p2.y) - R - 1, w: Math.abs(p2.x - p1.x) + 6, h: Math.abs(p2.y - p1.y) + 2 * R + 2 } };
}

// ───────────────────────── LED 5 mm ─────────────────────────

/** LED de 5 mm: epoxi tintado con cúpula, valona con cara plana del cátodo, yunque y poste dentro. */
export function buildLed(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const K = pins.find((p) => p.id === 'K') ?? pins[0];
  const A = pins.find((p) => p.id === 'A') ?? pins[1];
  const c = LED_COLORS[String(part.props.color)] ?? LED_COLORS.red;
  const cx = (K.x + A.x) / 2, cz = (K.y + A.y) / 2;
  const standoff = (ctx.onBoard ? 2.5 : 3) * MM;
  const r = 2.5 * MM, h = 8.6 * MM, flange = 1 * MM;
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(r + 0.4 * MM, 0), new THREE.Vector2(r + 0.4 * MM, flange), new THREE.Vector2(r, flange), new THREE.Vector2(r, h - r)];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.max(0.01, r * Math.cos(a)), h - r + r * Math.sin(a)));
  }
  const geo = new THREE.LatheGeometry(prof, 32);
  // Cara plana del cátodo: aplana los vértices de la valona hacia K.
  const kx = K.x - cx, kz = K.y - cz;
  const kl = Math.hypot(kx, kz) || 1;
  const nx = kx / kl, nz = kz / kl;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const along = x * nx + z * nz;
    const limit = r + 0.05 * MM;
    if (y <= flange + 0.01 && along > limit) {
      pos.setX(i, x - (along - limit) * nx);
      pos.setZ(i, z - (along - limit) * nz);
    }
  }
  geo.computeVertexNormals();
  const tint = new THREE.Color(c.body);
  const mat = new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.78,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    ior: 1.5,
    emissive: new THREE.Color(c.light),
    emissiveIntensity: 0,
    depthWrite: false,
  });
  const body = new THREE.Mesh(geo, mat);
  body.position.set(cx, standoff, cz);
  body.castShadow = true;
  body.renderOrder = 2;
  group.add(body);
  // Marco interior: yunque (cátodo, ancho) y poste (ánodo, fino), visibles a través del epoxi.
  const frame = mats().nickel;
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.4 * MM, 3.2 * MM, 0.45 * MM), frame);
  anvil.position.set(cx + nx * 0.9 * MM, standoff + 2.4 * MM, cz + nz * 0.9 * MM);
  anvil.rotation.y = -Math.atan2(nz, nx) + Math.PI / 2;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.6 * MM, 3.8 * MM, 0.45 * MM), frame);
  post.position.set(cx - nx * 0.9 * MM, standoff + 2.6 * MM, cz - nz * 0.9 * MM);
  post.rotation.y = anvil.rotation.y;
  const die = new THREE.Mesh(new THREE.BoxGeometry(0.35 * MM, 0.25 * MM, 0.35 * MM), new THREE.MeshStandardMaterial({ color: '#222', emissive: new THREE.Color(c.light), emissiveIntensity: 0 }));
  die.position.set(anvil.position.x, standoff + 4.1 * MM, anvil.position.z);
  group.add(anvil, post, die);
  const d = legDepth(ctx);
  // El ánodo (más largo) lleva un codo: así se reconoce en la mesa.
  group.add(wireLeg([new THREE.Vector3(K.x, d, K.y), new THREE.Vector3(K.x, standoff + 0.5, K.y)], 0.25 * MM, mats().tin));
  group.add(
    wireLeg(
      [new THREE.Vector3(A.x, d, A.y), new THREE.Vector3(A.x, standoff * 0.45, A.y), new THREE.Vector3(A.x - (A.x - cx) * 0.25, standoff * 0.7, A.y - (A.y - cz) * 0.25), new THREE.Vector3(A.x - (A.x - cx) * 0.25, standoff + 0.5, A.y - (A.y - cz) * 0.25)],
      0.25 * MM,
      mats().tin,
    ),
  );
  // Halo aditivo en lugar de una luz real: no recompila sombreadores ni cuesta por píxel.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(c.light), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  halo.position.set(cx, standoff + h * 0.62, cz);
  halo.scale.setScalar(16 * MM);
  halo.userData.noPick = true;
  halo.visible = false;
  group.add(halo);
  return {
    group,
    anchorY: () => 0,
    top: standoff + h,
    footprint: { x: cx - r, y: cz - r, w: 2 * r, h: 2 * r },
    update(v: Visual | null) {
      const i = Number(v?.i ?? 0);
      const k = i > 0.06 ? 0 : Math.min(1, Math.sqrt(Math.max(0, i) / 0.02));
      mat.emissiveIntensity = k * 3.2;
      mat.opacity = 0.78 + 0.2 * k;
      (die.material as THREE.MeshStandardMaterial).emissiveIntensity = k * 14;
      (die.material as THREE.MeshStandardMaterial).emissive.set(k > 0 ? '#ffffff' : c.light).lerp(new THREE.Color(c.light), 0.5);
      halo.visible = k > 0.01;
      halo.material.opacity = Math.min(1, 1.1 * k);
      halo.scale.setScalar((14 + 14 * k) * MM);
      mat.color.set(i > 0.06 ? '#3a2b28' : c.body);
    },
  };
}

// ───────────────────────── Condensadores ─────────────────────────

/** Electrolítico radial: lata de aluminio con funda, franja del negativo y cruz de alivio en la tapa. */
export function buildElectrolytic(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const neg = pins.find((p) => p.id === '-') ?? pins[0];
  const pos = pins.find((p) => p.id === '+') ?? pins[1];
  const cx = (neg.x + pos.x) / 2, cz = (neg.y + pos.y) / 2;
  const F = Number(part.props.capacitance ?? 100e-6);
  const D = (F >= 470e-6 ? 10 : F >= 100e-6 ? 6.3 : 5) * MM, H = (F >= 470e-6 ? 16 : 11) * MM;
  const lift = (ctx.onBoard ? 0.8 : 0.5) * MM;
  const angle = Math.atan2(neg.y - cz, neg.x - cx);
  const tex = canvasTex(64, 32, 4, (g) => {
    g.fillStyle = '#1f3e8c';
    g.fillRect(0, 0, 64, 32);
    // La franja queda del lado del negativo (u = 0,25 apunta a +x en la geometría girada).
    g.fillStyle = '#c9ced6';
    g.fillRect(64 * 0.17, 0, 64 * 0.16, 32);
    g.fillStyle = '#1f3e8c';
    g.font = '700 4px sans-serif';
    for (let y = 5; y < 30; y += 6) g.fillText('−', 64 * 0.23, y);
    g.fillStyle = '#e8ecf2';
    g.font = '600 3px sans-serif';
    g.fillText(`${Math.round(F * 1e6)}µF ${part.props.voltage ?? 16}V`, 64 * 0.55, 18);
  });
  const sleeve = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.35, clearcoat: 0.5 });
  const can = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, H, 36, 1, true), sleeve);
  can.position.set(cx, lift + H / 2, cz);
  can.rotation.y = -angle - Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(D / 2 - 0.25 * MM, 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 1, roughness: 0.35 }));
  cap.position.set(cx, lift + H - 0.15 * MM, cz);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(D / 2 - 0.2 * MM, 0.22 * MM, 6, 36).rotateX(Math.PI / 2), sleeve);
  rim.position.set(cx, lift + H - 0.1 * MM, cz);
  const vent = topDecal(canvasTex(16, 16, 8, (g) => {
    g.strokeStyle = 'rgba(40,44,50,0.65)';
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(3, 8); g.lineTo(13, 8); g.moveTo(8, 3); g.lineTo(8, 13); g.stroke();
  }), cx, cz, D * 0.7, D * 0.7, lift + H - 0.14 * MM);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(D / 2, 24).rotateX(Math.PI / 2), mats().header);
  bottom.position.set(cx, lift, cz);
  for (const m of [can, cap, rim]) m.castShadow = m.receiveShadow = true;
  group.add(can, cap, rim, vent, bottom);
  const d = legDepth(ctx);
  for (const p of [neg, pos]) group.add(wireLeg([new THREE.Vector3(p.x, d, p.y), new THREE.Vector3(p.x, lift + 0.2, p.y)], 0.25 * MM, mats().tin));
  return { group, anchorY: () => 0, top: lift + H, footprint: { x: cx - D / 2, y: cz - D / 2, w: D, h: D } };
}

/** Cerámico de disco: gota de esmalte ocre con su código impreso. */
export function buildCeramic(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const [a, b] = def.pins(part.props);
  const cx = (a.x + b.x) / 2, cz = (a.y + b.y) / 2;
  const D = 5 * MM, T = 2.4 * MM, lift = (ctx.onBoard ? 3 : 2) * MM;
  const geo = new THREE.SphereGeometry(D / 2, 28, 16);
  geo.scale(1, 1, T / D);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const F = Number(part.props.capacitance ?? 100e-9);
  const pf = F * 1e12;
  const e = Math.max(0, Math.floor(Math.log10(pf)) - 1);
  const code = `${Math.round(pf / 10 ** e)}${e}`;
  const tex = canvasTex(32, 16, 8, (g) => {
    g.fillStyle = '#d4892f';
    g.fillRect(0, 0, 32, 16);
    g.fillStyle = 'rgba(40,24,10,0.85)';
    g.font = '700 4.4px sans-serif';
    g.textAlign = 'center';
    g.fillText(code, 8, 9.5);
    g.fillText(code, 24, 9.5);
  });
  const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.25 }));
  body.position.set(cx, lift + D / 2, cz);
  body.rotation.y = -ang;
  body.castShadow = true;
  group.add(body);
  const d = legDepth(ctx);
  for (const p of [a, b]) {
    const inX = cx + (p.x - cx) * 0.45, inZ = cz + (p.y - cz) * 0.45;
    group.add(wireLeg([new THREE.Vector3(p.x, d, p.y), new THREE.Vector3(p.x, lift * 0.6, p.y), new THREE.Vector3(inX, lift + 1.2 * MM, inZ)], 0.25 * MM, mats().tin));
  }
  return { group, anchorY: () => 0, top: lift + D, footprint: { x: cx - D / 2, y: cz - T, w: D, h: 2 * T } };
}

// ───────────────────────── Display de 7 segmentos ─────────────────────────

const SEG: Record<string, string> = {
  a: 'M8 -52 h20 l-3 4 h-14 z',
  b: 'M29 -51 l3 3 -2 18 -3 2 -2 -3 2 -16 z',
  c: 'M27 -27 l3 2 -2 18 -3 3 -2 -4 2 -16 z',
  d: 'M4 -4 h18 l3 -4 h-18 z',
  e: 'M5 -27 l3 2 -2 16 -2 4 -3 -3 2 -18 z',
  f: 'M8 -51 l3 3 -2 16 -3 3 -2 -2 2 -18 z',
  g: 'M9 -29 h16 l2 2 -2 2 h-16 l-2 -2 z',
  dp: 'M30 -6 a2.6 2.6 0 1 0 0.01 0 z',
};

/** Display de 0,56": cuerpo negro, cara gris oscuro con segmentos difusores; se iluminan por emisión. */
export function buildSevenSeg(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const xs = pins.map((p) => p.x), zs = pins.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  // El documento dibuja la cara en (−6..46, −4..64): misma huella, mismos segmentos.
  const fx0 = -6, fz0 = -4, fw = 52, fh = 68;
  const W = fw + 2, Hh = fh + 2, T = 8 * MM;
  const lift = ctx.onBoard ? 0.4 * MM : 3 * MM;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, T, Hh), new THREE.MeshStandardMaterial({ color: '#191a1c', roughness: 0.7, bumpMap: plasticNoise(), bumpScale: 0.3 }));
  body.position.set(cx, lift + T / 2, cz);
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const paint = (g: CanvasRenderingContext2D, lit: Record<string, number> | null) => {
    if (!lit) {
      g.fillStyle = '#26272a';
      g.fillRect(0, 0, fw, fh);
    } else g.clearRect(0, 0, fw, fh);
    g.save();
    g.translate(8 - fx0, 62 - fz0);
    g.transform(1, 0, Math.tan((-6 * Math.PI) / 180), 1, 0, 0);
    for (const [s, d] of Object.entries(SEG)) {
      const k = lit ? lit[s] ?? 0 : 0;
      if (lit && k <= 0.02) continue;
      g.fillStyle = lit ? `rgba(255,34,14,${Math.min(1, 0.4 + 0.6 * k)})` : '#3b3334';
      g.fill(new Path2D(d));
    }
    g.restore();
  };
  const faceTex = canvasTex(fw, fh, 8, (g) => paint(g, null));
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = fw * 8;
  glowCanvas.height = fh * 8;
  const glowCtx = glowCanvas.getContext('2d')!;
  glowCtx.scale(8, 8);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, emissive: new THREE.Color('#ffffff'), emissiveMap: glowTex, emissiveIntensity: 1.25 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh).rotateX(-Math.PI / 2), faceMat);
  face.position.set(fx0 + fw / 2, lift + T + 0.02, fz0 + fh / 2);
  group.add(face);
  const legsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5 * MM, 1, 0.3 * MM).translate(0, 0.5, 0), mats().tin, pins.length);
  const m = new THREE.Matrix4();
  const d = legDepth(ctx);
  pins.forEach((p, i) => {
    m.makeScale(1, lift - d + 0.2, 1).setPosition(p.x, d, p.y);
    legsMesh.setMatrixAt(i, m);
  });
  group.add(legsMesh);
  let lastKey = '';
  return {
    group,
    anchorY: () => 0,
    top: lift + T,
    footprint: { x: fx0 - 1, y: fz0 - 1, w: W, h: Hh },
    update(v: Visual | null) {
      const lit: Record<string, number> = {};
      for (const s of Object.keys(SEG)) {
        const i = Number(v?.[s] ?? 0);
        lit[s] = i > 0 ? Math.min(1, Math.sqrt(i / 0.01)) : 0;
      }
      const key = JSON.stringify(lit);
      if (key === lastKey) return;
      lastKey = key;
      glowCtx.clearRect(0, 0, fw, fh);
      paint(glowCtx, lit);
      glowTex.needsUpdate = true;
    },
  };
}
