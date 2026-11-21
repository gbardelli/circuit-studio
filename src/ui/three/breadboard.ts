import * as THREE from 'three';
import type { PartData } from '../../core/types';
import type { PartDef } from '../../parts/types';
import { BOARD_H, MM, mats } from './materials';

/** Rectángulo redondeado (esquinas seleccionables) en el plano del documento. */
function roundedRect(x: number, y: number, w: number, h: number, r: number, corners = [true, true, true, true]) {
  const s = new THREE.Shape();
  const [tl, tr, br, bl] = corners.map((c) => (c ? r : 0));
  s.moveTo(x + tl, y);
  s.lineTo(x + w - tr, y);
  if (tr) s.quadraticCurveTo(x + w, y, x + w, y + tr);
  s.lineTo(x + w, y + h - br);
  if (br) s.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  s.lineTo(x + bl, y + h);
  if (bl) s.quadraticCurveTo(x, y + h, x, y + h - bl);
  s.lineTo(x, y + tl);
  if (tl) s.quadraticCurveTo(x, y, x + tl, y);
  return s;
}

/** Losa extruida con la cara superior en y = top, en coordenadas locales de la pieza (x, z = y del doc). */
export function slab(shape: THREE.Shape, top: number, depth: number, bevel = 0.9) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, top - bevel, 0);
  return g;
}

const texCache = new Map<string, THREE.CanvasTexture>();
/** Serigrafía de la protoboard: franjas de rieles, letras de fila y números de columna. */
function silkTexture(def: PartDef, part: PartData, w: number, h: number) {
  const key = `${def.type}:${w}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const k = 4;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f2ec';
  g.fillRect(0, 0, c.width, c.height);
  g.scale(k, k);
  const pins = def.pins(part.props);
  const rows = new Map<string, number>();
  const cols = new Map<number, number>();
  for (const p of pins) {
    const m = /^([a-j])(\d+)$/.exec(p.id);
    if (m) {
      rows.set(m[1], p.y);
      cols.set(Number(m[2]), p.x);
    }
  }
  const railY = (id: string) => pins.find((p) => p.id.startsWith(id))?.y;
  const stripe = (y: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(20, y - 0.55, w - 40, 1.1);
  };
  const tp = railY('tp'), tn = railY('tn'), bp = railY('bp'), bn = railY('bn');
  if (tp !== undefined && tn !== undefined) {
    stripe(tp - 8, '#d64541');
    stripe(tn + 8, '#3f6fd1');
  }
  if (bp !== undefined && bn !== undefined) {
    stripe(bp - 8, '#d64541');
    stripe(bn + 8, '#3f6fd1');
  }
  g.font = '600 5.2px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#9a958a';
  const rowYs = [...rows.values()];
  const top = Math.min(...rowYs), bottom = Math.max(...rowYs);
  for (const [n, x] of cols) {
    if (n === 1 || n % 5 === 0) {
      g.fillText(String(n), x, top - 9);
      g.fillText(String(n), x, bottom + 9);
    }
  }
  for (const [r, y] of rows) {
    g.fillText(r, 14, y + 0.3);
    g.fillText(r, w - 14, y + 0.3);
  }
  g.font = '700 8px ui-sans-serif, system-ui, sans-serif';
  for (const [y, s, col] of [[tp, '+', '#d64541'], [tn, '−', '#3f6fd1'], [bp, '+', '#d64541'], [bn, '−', '#3f6fd1']] as const) {
    if (y === undefined) continue;
    g.fillStyle = col;
    g.fillText(s, 12, y);
    g.fillText(s, w - 12, y);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  t.anisotropy = 8;
  t.repeat.set(1 / w, 1 / h);
  t.userData.shared = true;
  texCache.set(key, t);
  return t;
}

const holeGeo = (() => {
  const g = new THREE.PlaneGeometry(6.4, 6.4);
  g.rotateX(-Math.PI / 2);
  g.userData.shared = true;
  return g;
})();

/** Protoboard: cuerpo de ABS en dos bloques separados por el canal central, huecos instanciados. */
export function buildBreadboard(def: PartDef, part: PartData): THREE.Group {
  const group = new THREE.Group();
  const b = def.bounds(part.props);
  const w = b.w, h = b.h;
  const m = mats();
  const pins = def.pins(part.props);
  const rowY = (r: string) => pins.find((p) => p.id === `${r}1`)?.y ?? 0;
  const chTop = (rowY('e') + rowY('f')) / 2 - 5;
  const chBot = chTop + 10;
  const chDepth = 1.6 * MM;
  const r = 2.2 * MM;

  const silk = new THREE.MeshStandardMaterial({ map: silkTexture(def, part, w, h), roughness: 0.58, bumpMap: (m.abs as THREE.MeshStandardMaterial).bumpMap, bumpScale: 0.25 });
  const sides = m.absSide;
  const base = slab(roundedRect(0, 0, w, h, r), -chDepth, BOARD_H - chDepth, 0.6);
  const topA = slab(roundedRect(0, 0, w, chTop, r, [true, true, false, false]), 0, chDepth + 0.4, 0.5);
  const topB = slab(roundedRect(0, chBot, w, h - chBot, r, [false, false, true, true]), 0, chDepth + 0.4, 0.5);
  for (const geo of [base, topA, topB]) {
    const mesh = new THREE.Mesh(geo, [silk, sides]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Fondo del canal: un tono más cálido y en sombra.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.2, 10).rotateX(-Math.PI / 2), m.channel);
  floor.position.set(w / 2, -chDepth + 0.02, (chTop + chBot) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // Huecos: una sola llamada de dibujo para todos (830 en la grande).
  const holes = new THREE.InstancedMesh(holeGeo, m.hole, pins.length);
  const mtx = new THREE.Matrix4();
  pins.forEach((p, i) => {
    mtx.makeTranslation(p.x, 0.05, p.y);
    holes.setMatrixAt(i, mtx);
  });
  holes.instanceMatrix.needsUpdate = true;
  holes.receiveShadow = true;
  holes.userData.noPick = true;
  group.add(holes);

  // Patas adhesivas no se ven; sí la línea de unión del molde bajo los rieles.
  group.userData.top = 0;
  group.userData.height = BOARD_H;
  return group;
}

export const isBreadboard = (type: string) => type.startsWith('breadboard-') && type !== 'breadboard-power';
