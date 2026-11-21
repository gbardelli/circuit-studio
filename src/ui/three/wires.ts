import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MM, mats, plasticNoise } from './materials';

export interface WireInput {
  id: string;
  color: string;
  /** Extremos (punto de entrada al hueco) y codos intermedios del documento. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  via: { x: number; z: number }[];
}

export interface Footprint {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  top: number;
}

export const WIRE_R = 0.7 * MM;
const TIP_R = 0.32 * MM;
/** Cabezal Dupont macho: carcasa de 2,54 mm × 14 mm y manguito de 2 mm por donde sale el cable. */
const HOUSING = 14 * MM;
const GAP = 0.7 * MM;
const BOOT = 2.2 * MM;
const HEAD = GAP + HOUSING + BOOT;

/** Altura del obstáculo más alto bajo (x, z): protoboards, piezas y mesa. */
export function surfaceAt(fps: Footprint[], floor: number) {
  return (x: number, z: number) => {
    let h = floor;
    for (const f of fps) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.top > h) h = f.top;
    return h;
  };
}

function resample(path: THREE.Vector3[], n: number) {
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + path[i].distanceTo(path[i - 1]));
  const total = lens[lens.length - 1] || 1;
  const out: THREE.Vector3[] = [];
  let j = 1;
  for (let k = 0; k <= n; k++) {
    const d = (k / n) * total;
    while (j < lens.length - 1 && lens[j] < d) j++;
    const t = (d - lens[j - 1]) / (lens[j] - lens[j - 1] || 1);
    out.push(path[j - 1].clone().lerp(path[j], Math.min(1, Math.max(0, t))));
  }
  return { out, total };
}

/**
 * Cable rígido-flexible por Verlet: longitud con holgura, rigidez a flexión, gravedad y choque con
 * todo lo que hay debajo. Los extremos salen verticales del hueco, como un puente real.
 */
export function settleWire(w: WireInput, ground: (x: number, z: number) => number): THREE.Vector3[] {
  // Jumper Dupont: el cable nace en lo alto del cabezal y sigue vertical antes de curvarse.
  const routed = w.via.length > 0;
  const rise = HEAD + 3 * MM;
  const up = (p: THREE.Vector3) => p.clone().add(new THREE.Vector3(0, rise, 0));
  const a1 = up(w.a), b1 = up(w.b);
  const via = w.via.map((v) => new THREE.Vector3(v.x, ground(v.x, v.z) + WIRE_R, v.z));
  const path = [a1, ...via, b1];
  const flat = Math.hypot(w.a.x - w.b.x, w.a.z - w.b.z);
  const seg0 = resample(path, 8).total;
  const n = Math.max(8, Math.min(90, Math.round(seg0 / 5)));
  const { out: nodes, total } = resample(path, n);
  const arch = routed ? 0 : Math.min(0.26 * flat, 26 * MM) + 3 * MM;
  nodes.forEach((p, k) => (p.y += arch * Math.sin((Math.PI * k) / n)));
  const slack = routed ? 1.02 : 1 + Math.min(0.1, 0.03 + 40 / (flat + 200));
  const rest = (total * slack) / n;
  const prev = nodes.map((p) => p.clone());
  const fixed = (k: number) => k === 0 || k === n;
  const tmp = new THREE.Vector3();
  const g = routed ? 0.06 : 0.025;
  for (let it = 0; it < 90; it++) {
    for (let k = 1; k < n; k++) {
      const p = nodes[k];
      tmp.copy(p).sub(prev[k]).multiplyScalar(0.92);
      prev[k].copy(p);
      p.add(tmp);
      p.y -= g;
    }
    for (let pass = 0; pass < 4; pass++) {
      for (let k = 0; k < n; k++) {
        const p = nodes[k], q = nodes[k + 1];
        tmp.copy(q).sub(p);
        const d = tmp.length() || 1e-6;
        const diff = (d - rest) / d;
        const wp = fixed(k) ? 0 : fixed(k + 1) ? 1 : 0.5;
        const wq = fixed(k + 1) ? 0 : fixed(k) ? 1 : 0.5;
        p.addScaledVector(tmp, diff * wp);
        q.addScaledVector(tmp, -diff * wq);
      }
      // Rigidez: cada nodo tiende al punto medio de sus vecinos (alisa sin encoger la longitud).
      for (let k = 1; k < n; k++) {
        tmp.copy(nodes[k - 1]).add(nodes[k + 1]).multiplyScalar(0.5);
        nodes[k].lerp(tmp, routed ? 0.12 : 0.22);
      }
      // Salida vertical del hueco: el segundo nodo queda encima del primero.
      for (const [k, s] of [[1, 0], [n - 1, n]] as const) {
        const anchor = nodes[s];
        nodes[k].x += (anchor.x - nodes[k].x) * 0.6;
        nodes[k].z += (anchor.z - nodes[k].z) * 0.6;
        const lift = Math.min(rest * 0.7, rise);
        if (nodes[k].y < anchor.y + lift) nodes[k].y = anchor.y + lift;
      }
      for (let k = 1; k < n; k++) {
        const p = nodes[k];
        const floor = ground(p.x, p.z) + WIRE_R;
        if (p.y < floor) p.y = floor;
      }
    }
  }
  // Alisado final: un cable real no hace ondas; se respeta el suelo y la salida vertical.
  for (let it = 0, smooth = routed ? 3 : 24; it < smooth; it++) {
    for (let k = 2; k < n - 1; k++) {
      tmp.copy(nodes[k - 1]).add(nodes[k + 1]).multiplyScalar(0.5);
      nodes[k].lerp(tmp, 0.5);
      const floor = ground(nodes[k].x, nodes[k].z) + WIRE_R;
      if (nodes[k].y < floor) nodes[k].y = floor;
    }
  }
  return [w.a.clone().add(new THREE.Vector3(0, HEAD - 0.3 * MM, 0)), ...nodes, w.b.clone().add(new THREE.Vector3(0, HEAD - 0.3 * MM, 0))];
}

const tipGeo = (() => {
  const g = new THREE.CylinderGeometry(TIP_R, TIP_R, 1, 8, 1);
  g.translate(0, 0.5, 0);
  g.userData.shared = true;
  return g;
})();

const headGeo = (() => {
  const body = new RoundedBoxGeometry(2.5 * MM, HOUSING, 2.5 * MM, 2, 0.25 * MM);
  body.translate(0, GAP + HOUSING / 2, 0);
  // Ventana del enganche: una muesca poco profunda en una cara.
  const boot = new THREE.CylinderGeometry(0.95 * MM, 1.15 * MM, BOOT, 16, 1);
  boot.translate(0, GAP + HOUSING + BOOT / 2, 0);
  const g = mergeGeometries([body.toNonIndexed(), boot.toNonIndexed()])!;
  g.userData.shared = true;
  return g;
})();

let headMat: THREE.MeshStandardMaterial | null = null;
const headMaterial = () =>
  (headMat ??= new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.48, metalness: 0, bumpMap: plasticNoise(), bumpScale: 0.3 }));

export interface WireMeshes {
  group: THREE.Group;
  /** Rango de índices de cada cable en la malla fusionada (para seleccionar y resaltar). */
  ranges: { id: string; start: number; end: number; vStart: number; vEnd: number; color: THREE.Color }[];
  mesh: THREE.Mesh | null;
}

/** Todos los cables en una sola malla con color por vértice; las puntas peladas, instanciadas. */
const settled = new Map<string, THREE.Vector3[]>();
/** Física cacheada: un cable solo se vuelve a asentar si cambian sus extremos, sus codos o lo que tiene debajo. */
function settledWire(w: WireInput, ground: (x: number, z: number) => number, groundSig: string) {
  const key = `${groundSig}|${w.a.toArray()}|${w.b.toArray()}|${JSON.stringify(w.via)}`;
  let pts = settled.get(key);
  if (!pts) {
    pts = settleWire(w, ground);
    if (settled.size > 2000) settled.clear();
    settled.set(key, pts);
  }
  return pts;
}

export function buildWires(list: WireInput[], ground: (x: number, z: number) => number, groundSig = ''): WireMeshes {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const ranges: WireMeshes['ranges'] = [];
  let idx = 0, vtx = 0;
  const tips = new THREE.InstancedMesh(tipGeo, mats().tin, Math.max(1, list.length * 2));
  tips.count = 0;
  const heads = new THREE.InstancedMesh(headGeo, headMaterial(), Math.max(1, list.length * 2));
  heads.count = 0;
  const m = new THREE.Matrix4();
  for (const w of list) {
    const pts = settledWire(w, ground, groundSig);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const len = curve.getLength();
    const geo = new THREE.TubeGeometry(curve, Math.max(12, Math.min(220, Math.round(len / 2.2))), WIRE_R, 10, false);
    const color = new THREE.Color(w.color);
    const n = geo.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(cols, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(geo);
    const count = geo.index!.count;
    ranges.push({ id: w.id, start: idx, end: idx + count, vStart: vtx, vEnd: vtx + n, color });
    idx += count;
    vtx += n;
    for (const p of [w.a, w.b]) {
      m.makeScale(1, 3.4 * MM, 1).setPosition(p.x, p.y - 2.4 * MM, p.z);
      tips.setMatrixAt(tips.count++, m);
      m.makeTranslation(p.x, p.y, p.z);
      heads.setMatrixAt(heads.count++, m);
    }
  }
  let mesh: THREE.Mesh | null = null;
  if (geos.length) {
    const merged = mergeGeometries(geos, false)!;
    geos.forEach((g) => g.dispose());
    mesh = new THREE.Mesh(merged, mats().pvc);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.wires = true;
    group.add(mesh);
  }
  tips.instanceMatrix.needsUpdate = true;
  tips.castShadow = true;
  tips.userData.noPick = true;
  heads.instanceMatrix.needsUpdate = true;
  heads.castShadow = heads.receiveShadow = true;
  heads.userData.noPick = true;
  group.add(tips, heads);
  return { group, ranges, mesh };
}
