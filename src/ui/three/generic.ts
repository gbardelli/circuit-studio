import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PartData, PinDef } from '../../core/types';
import type { Category, PartDef } from '../../parts/types';
import { MM, labelTexture, mats } from './materials';

/** Resultado de modelar una pieza: malla en coordenadas locales y anclajes de sus patillas. */
export interface Model {
  group: THREE.Group;
  /** Altura (local, sobre la base) donde entra el cable en cada patilla tipo hueco. */
  anchorY(pin: PinDef): number;
  /** Altura del techo de la pieza (para que los cables pasen por encima). */
  top: number;
  /** Huella física real (local) si difiere de bounds (p. ej. un LED de pie). */
  footprint?: { x: number; y: number; w: number; h: number };
  /** Refleja el estado de la simulación (LED encendido, segmentos…). */
  update?(visual: import('../../parts/types').Visual | null): void;
}

export interface BuildCtx {
  /** La pieza está pinchada en una protoboard (base en y = 0) o apoyada en la mesa. */
  onBoard: boolean;
}

const CATEGORY_COLOR: Record<Category, string> = {
  Placas: '#0f6e7a',
  Protoboards: '#f4f2ec',
  Básicos: '#2a2c30',
  Salidas: '#26282c',
  Entradas: '#2b2d31',
  Semiconductores: '#1d1e20',
  Lógica: '#1d1e20',
  Integrados: '#1d1e20',
  Energía: '#30343a',
  Instrumentos: '#3a3d44',
};

const pinGeo = (() => {
  const g = new THREE.BoxGeometry(0.64 * MM, 1, 0.64 * MM);
  g.translate(0, 0.5, 0);
  g.userData.shared = true;
  return g;
})();
const headerGeo = (() => {
  const g = new RoundedBoxGeometry(2.5 * MM, 8.5 * MM, 2.5 * MM, 1, 0.15 * MM);
  g.translate(0, 4.25 * MM, 0);
  g.userData.shared = true;
  return g;
})();
const socketHoleGeo = (() => {
  const g = new THREE.PlaneGeometry(5.6, 5.6);
  g.rotateX(-Math.PI / 2);
  g.userData.shared = true;
  return g;
})();

/** Patas metálicas instanciadas: cada una baja de `from` a `to` (alturas locales) en su posición. */
export function legs(pins: PinDef[], from: number, to: number, mat: THREE.Material = mats().tin) {
  const inst = new THREE.InstancedMesh(pinGeo, mat, pins.length);
  const m = new THREE.Matrix4();
  pins.forEach((p, i) => {
    m.makeScale(1, Math.max(0.01, from - to), 1).setPosition(p.x, to, p.y);
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = true;
  return inst;
}

/** Cabezales hembra: bloque negro por patilla con su orificio arriba. Devuelve la altura del orificio. */
export function femaleHeaders(pins: PinDef[], base: number, group: THREE.Group) {
  if (!pins.length) return base;
  const m = new THREE.Matrix4();
  const blocks = new THREE.InstancedMesh(headerGeo, mats().header, pins.length);
  const holes = new THREE.InstancedMesh(socketHoleGeo, mats().hole, pins.length);
  const top = base + 8.5 * MM;
  pins.forEach((p, i) => {
    m.makeTranslation(p.x, base, p.y);
    blocks.setMatrixAt(i, m);
    m.makeTranslation(p.x, top + 0.04, p.y);
    holes.setMatrixAt(i, m);
  });
  blocks.castShadow = blocks.receiveShadow = true;
  holes.userData.noPick = true;
  group.add(blocks, holes);
  return top;
}

/** Caja redondeada apoyada en `bottom`, ocupando el rectángulo local (x, y, w, h). */
export function body(x: number, y: number, w: number, h: number, bottom: number, height: number, mat: THREE.Material, radius = 0.6 * MM) {
  const r = Math.min(radius, w / 2.01, h / 2.01, height / 2.01);
  const g = new RoundedBoxGeometry(w, height, h, 2, r);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(x + w / 2, bottom + height / 2, y + h / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function decal(tex: THREE.Texture, x: number, y: number, w: number, h: number, at: number) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
  mesh.position.set(x + w / 2, at + 0.03, y + h / 2);
  mesh.userData.noPick = true;
  return mesh;
}

/** Respaldo para cualquier pieza sin modelo propio: cuerpo del tamaño de su huella, rótulo y patillas reales. */
export function buildGeneric(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const b = def.bounds(part.props);
  const pins = def.pins(part.props);
  const legsList = pins.filter((p) => p.kind === 'leg');
  const sockets = pins.filter((p) => p.kind === 'socket');
  const isBoard = def.category === 'Placas' || sockets.length > 0;
  const color = CATEGORY_COLOR[def.category] ?? '#2a2c30';
  const lift = ctx.onBoard && legsList.length ? 2.2 * MM : 0;
  const height = isBoard ? 1.6 * MM : def.category === 'Instrumentos' || def.category === 'Energía' ? 14 * MM : 4 * MM;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: isBoard ? 0.5 : 0.55, metalness: 0 });
  group.add(body(b.x, b.y, b.w, b.h, lift, height, mat, isBoard ? 0.8 * MM : 1 * MM));
  const top = lift + height;
  if (legsList.length) group.add(legs(legsList, lift + 0.2, ctx.onBoard ? -3 * MM : 0));
  const socketTop = femaleHeaders(sockets, top, group);
  const name = def.partNumber ?? def.name;
  const labelW = Math.min(b.w * 0.9, 220), labelH = Math.min(b.h * 0.5, 40);
  group.add(decal(labelTexture([name], labelW, labelH, { color: isBoard ? 'rgba(255,255,255,0.88)' : 'rgba(220,220,215,0.8)' }), b.x + (b.w - labelW) / 2, b.y + (b.h - labelH) / 2, labelW, labelH, top));
  return { group, anchorY: (p) => (p.kind === 'socket' ? socketTop : lift), top: Math.max(top, sockets.length ? socketTop : 0) };
}
