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
const SOLID_R = 0.55 * MM;
const TIP_R = 0.32 * MM;
/** Cabezal Dupont macho: carcasa de 2,54 mm × 14 mm y manguito de 2 mm por donde sale el cable. */
const HOUSING = 14 * MM;
const GAP = 0.7 * MM;
const BOOT = 2.2 * MM;
const HEAD = GAP + HOUSING + BOOT;

/**
 * Tres cables, como en una mesa real:
 * - rígido cortado a mano (sin cabezal, pegado a la placa) para saltos cortos en la misma superficie;
 * - jumper Dupont de 10 cm para distancias medias;
 * - jumper Dupont de 20 cm para las largas.
 * No hay más medidas: la longitud fija decide la altura del arco.
 */
export const SOLID_MAX = 30 * MM;
export const DUPONT_SHORT = 100 * MM;
export const DUPONT_LONG = 200 * MM;
export type WireKind = 'solid' | 'dupont10' | 'dupont20';

export function wireKind(w: Pick<WireInput, 'a' | 'b'>): WireKind {
  const d = Math.hypot(w.a.x - w.b.x, w.a.z - w.b.z);
  if (Math.abs(w.a.y - w.b.y) < 1 && d <= SOLID_MAX) return 'solid';
  return d + Math.abs(w.a.y - w.b.y) <= DUPONT_SHORT * 0.7 ? 'dupont10' : 'dupont20';
}

/** Altura del obstáculo más alto bajo (x, z): protoboards, piezas y mesa. */
export function surfaceAt(fps: Footprint[], floor: number) {
  return (x: number, z: number) => {
    let h = floor;
    for (const f of fps) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.top > h) h = f.top;
    return h;
  };
}

/** Polilínea con codos de radio fijo (doblez de un cable rígido con alicates). */
function bentPath(points: THREE.Vector3[], radius: number) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let start = points[0].clone();
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const next = points[i + 1];
    if (!next) {
      if (start.distanceTo(p) > 0.01) path.add(new THREE.LineCurve3(start, p.clone()));
      break;
    }
    const inDir = p.clone().sub(points[i - 1]).normalize();
    const outDir = next.clone().sub(p).normalize();
    const r = Math.min(radius, p.distanceTo(points[i - 1]) / 2, next.distanceTo(p) / 2);
    const c0 = p.clone().addScaledVector(inDir, -r);
    const c1 = p.clone().addScaledVector(outDir, r);
    if (start.distanceTo(c0) > 0.01) path.add(new THREE.LineCurve3(start, c0));
    path.add(new THREE.QuadraticBezierCurve3(c0, p.clone(), c1));
    start = c1;
  }
  return path;
}

/** Cable rígido: sube del hueco, se dobla y corre pegado a la placa por los codos del documento. */
function solidCurve(w: WireInput, ground: (x: number, z: number) => number) {
  const flat = [{ x: w.a.x, z: w.a.z }, ...w.via, { x: w.b.x, z: w.b.z }];
  // Altura de apoyo: lo más alto que hay debajo de todo el recorrido.
  let top = Math.max(w.a.y, w.b.y);
  for (let i = 0; i < flat.length - 1; i++)
    for (let t = 0; t <= 1; t += 0.1) top = Math.max(top, ground(flat[i].x + (flat[i + 1].x - flat[i].x) * t, flat[i].z + (flat[i + 1].z - flat[i].z) * t));
  const h = top + SOLID_R + 0.35 * MM;
  const pts = [
    w.a.clone().add(new THREE.Vector3(0, 0.4 * MM, 0)),
    ...flat.map((p) => new THREE.Vector3(p.x, h, p.z)),
    w.b.clone().add(new THREE.Vector3(0, 0.4 * MM, 0)),
  ];
  return bentPath(pts, 0.9 * MM);
}

const cubic = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3) => new THREE.CubicBezierCurve3(p0, p1, p2, p3);

/** Hacia dónde se recuestan los arcos: todos hacia el fondo, como un montaje bien peinado. */
const LEAN = new THREE.Vector3(-0.25, 0, -1).normalize();

/**
 * Jumper Dupont de longitud fija: arco redondo (Bézier cúbica) cuya altura se ajusta por bisección
 * hasta que el cable mide lo que mide de verdad. Los arcos altos se recuestan un poco hacia el fondo.
 */
function dupontCurve(w: WireInput, length: number, ground: (x: number, z: number) => number) {
  const up = new THREE.Vector3(0, 1, 0);
  const a = w.a.clone().add(new THREE.Vector3(0, HEAD - 0.3 * MM, 0));
  const b = w.b.clone().add(new THREE.Vector3(0, HEAD - 0.3 * MM, 0));
  const d = a.distanceTo(b);
  const cable = Math.max(length, d * 1.05);
  const axis = b.clone().sub(a);
  axis.y = 0;
  const flatD = axis.length();
  // Lado hacia el que se recuesta el arco: perpendicular al tramo, el más cercano a LEAN.
  let side = flatD > 1e-3 ? new THREE.Vector3(-axis.z, 0, axis.x).normalize() : LEAN.clone();
  if (side.dot(LEAN) < 0) side.negate();
  const build = (k: number) => {
    const tilt = Math.min(0.85, 0.12 + Math.atan2(k, flatD + 20) * 0.6);
    const dir = up.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt));
    // El primer tramo sale vertical del cabezal; luego el arco se abre.
    const p1 = a.clone().addScaledVector(up, k * 0.45).addScaledVector(dir, k * 0.55);
    const p2 = b.clone().addScaledVector(up, k * 0.45).addScaledVector(dir, k * 0.55);
    const c = cubic(a, p1, p2, b);
    // 24 tramos bastan para medir el cable con error < 0,5 mm (200 por defecto es 8 veces más caro).
    c.arcLengthDivisions = 24;
    return c;
  };
  let lo = 0, hi = cable;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (build(mid).getLength() < cable) lo = mid;
    else hi = mid;
  }
  const curve = build(lo);
  // Muestras para el tubo; nada atraviesa lo que hay debajo.
  const pts = curve.getPoints(64);
  for (const p of pts) {
    const floor = ground(p.x, p.z) + WIRE_R;
    if (p.y < floor) p.y = floor;
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
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
  const boot = new THREE.CylinderGeometry(0.95 * MM, 1.15 * MM, BOOT, 16, 1);
  boot.translate(0, GAP + HOUSING + BOOT / 2, 0);
  const g = mergeGeometries([body.index ? body.toNonIndexed() : body, boot.index ? boot.toNonIndexed() : boot])!;
  g.userData.shared = true;
  return g;
})();

let headMat: THREE.MeshStandardMaterial | null = null;
const headMaterial = () =>
  (headMat ??= new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.48, metalness: 0, bumpMap: plasticNoise(), bumpScale: 0.3 }));

export interface WireMeshes {
  group: THREE.Group;
  /** Rango de índices de cada cable en la malla fusionada (para seleccionar y resaltar). */
  ranges: { id: string; start: number; end: number; vStart: number; vEnd: number; color: THREE.Color; kind: WireKind }[];
  mesh: THREE.Mesh | null;
}

/** Todos los cables en una sola malla con color por vértice; cabezales y puntas, instanciados. */
export function buildWires(list: WireInput[], ground: (x: number, z: number) => number): WireMeshes {
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
    const kind = wireKind(w);
    const curve = kind === 'solid' ? solidCurve(w, ground) : dupontCurve(w, kind === 'dupont10' ? DUPONT_SHORT : DUPONT_LONG, ground);
    const len = curve.getLength();
    const r = kind === 'solid' ? SOLID_R : WIRE_R;
    // Un tramo cada ~1,5 mm basta para un arco suave; 8 lados para un cable de 1,4 mm.
    const geo = new THREE.TubeGeometry(curve as THREE.Curve<THREE.Vector3>, Math.max(12, Math.min(96, Math.round(len / 6))), r, 8, false);
    const color = new THREE.Color(w.color);
    const n = geo.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(cols, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(geo);
    const count = geo.index!.count;
    ranges.push({ id: w.id, start: idx, end: idx + count, vStart: vtx, vEnd: vtx + n, color, kind });
    idx += count;
    vtx += n;
    for (const p of [w.a, w.b]) {
      // Punta pelada: en el rígido apenas asoma; en el Dupont es el pin del cabezal.
      m.makeScale(1, (kind === 'solid' ? 3 : 3.4) * MM, 1).setPosition(p.x, p.y - 2.4 * MM, p.z);
      tips.setMatrixAt(tips.count++, m);
      if (kind !== 'solid') {
        m.makeTranslation(p.x, p.y, p.z);
        heads.setMatrixAt(heads.count++, m);
      }
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
