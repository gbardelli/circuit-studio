import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { PartData, PinDef } from '../../core/types';
import type { Bounds, PartDef, Visual } from '../../parts/types';
import { LED_COLORS } from '../../parts/outputs';
import { MM, mats, plasticNoise } from './materials';
import { body, femaleHeaders, legs, type BuildCtx, type Model } from './generic';
import { slab } from './breadboard';
import { partSkin, skinPlane } from './skin';

// ───────────────────────── utilidades ─────────────────────────

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/** Material PBR compartido: piezas iguales reutilizan el mismo programa y estado de GPU. */
const std = (color: string, roughness = 0.5, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => {
  const shareable = Object.keys(extra).every((k) => k === 'bumpMap' || k === 'bumpScale');
  const key = `${color}|${roughness}|${metalness}|${extra.bumpScale ?? ''}`;
  if (shareable) {
    const hit = matCache.get(key);
    if (hit) return hit;
  }
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  if (shareable) {
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
};
const metal = () => std('#d3d7db', 0.3, 1);
const blackPlastic = () => std('#18191b', 0.55, 0, { bumpMap: plasticNoise(), bumpScale: 0.25 });

function rrect(b: Bounds, r: number) {
  const s = new THREE.Shape();
  const { x, y, w, h } = b;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const insideBounds = (p: { x: number; y: number }, b: Bounds) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

const spacerGeo = (() => {
  const g = new THREE.BoxGeometry(2.5 * MM, 2.5 * MM, 2.5 * MM);
  g.translate(0, 1.25 * MM, 0);
  g.userData.shared = true;
  return g;
})();

/** Tira de pines macho: separador negro en la base y pin cuadrado que atraviesa el PCB. */
function maleHeaders(pins: PinDef[], group: THREE.Group, bottom: number, pcbTop: number, ctx: BuildCtx) {
  if (!pins.length) return;
  const sp = new THREE.InstancedMesh(spacerGeo, mats().header, pins.length);
  const m = new THREE.Matrix4();
  pins.forEach((p, i) => {
    m.makeTranslation(p.x, bottom, p.y);
    sp.setMatrixAt(i, m);
  });
  sp.castShadow = true;
  group.add(sp, legs(pins, pcbTop + 1.6 * MM, ctx.onBoard ? -3 * MM : bottom, mats().gold));
}

/** Bornas de tornillo (azules) en lugar de cabezales: relés, fuentes. */
function screwTerminals(pins: PinDef[], group: THREE.Group, base: number) {
  if (!pins.length) return base;
  const H = 10 * MM;
  const block = new THREE.InstancedMesh(new RoundedBoxGeometry(2.54 * MM, H, 7.5 * MM, 1, 0.3 * MM).translate(0, H / 2, 0), std('#2f6fc9', 0.45), pins.length);
  const screw = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1 * MM, 1.1 * MM, 0.6 * MM, 16).translate(0, 0.3 * MM, 0), metal(), pins.length);
  const m = new THREE.Matrix4();
  pins.forEach((p, i) => {
    m.makeTranslation(p.x, base, p.y);
    block.setMatrixAt(i, m);
    m.makeTranslation(p.x, base + H, p.y);
    screw.setMatrixAt(i, m);
  });
  block.castShadow = screw.castShadow = true;
  group.add(block, screw);
  return base + H;
}

/** Bornes de laboratorio rojo/negro (fuentes, instrumentos). */
function bindingPosts(pins: PinDef[], group: THREE.Group, base: number) {
  let top = base;
  for (const p of pins) {
    const neg = /-|GND|COM/i.test(p.id);
    const H = 9 * MM;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(2.6 * MM, 3 * MM, H, 24), std(neg ? '#1b1c1e' : '#c8312a', 0.35));
    post.position.set(p.x, base + H / 2, p.y);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(1 * MM, 1 * MM, 1.2 * MM, 16), std('#e2c68a', 0.25, 1));
    tip.position.set(p.x, base + H + 0.6 * MM, p.y);
    post.castShadow = true;
    group.add(post, tip);
    top = Math.max(top, base + H);
  }
  return top;
}

interface Feature {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Altura en mm sobre el PCB. */
  mm: number;
  kind: 'metal' | 'black' | 'chip' | 'cream' | 'button' | 'crystal' | 'cap';
}

/** Relieve de cada placa, en las mismas coordenadas que su dibujo 2D. */
const FEATURES: Record<string, { pcb?: Bounds; color: string; features: Feature[] }> = {
  'arduino-uno': {
    pcb: { x: 0, y: 0, w: 270, h: 210 },
    color: '#0e6f75',
    features: [
      { x: -8, y: 30, w: 46, h: 40, mm: 10.9, kind: 'metal' },
      { x: -6, y: 146, w: 44, h: 36, mm: 11, kind: 'black' },
      { x: 114, y: 126, w: 136, h: 32, mm: 4.2, kind: 'chip' },
      { x: 64, y: 124, w: 30, h: 10, mm: 3.5, kind: 'crystal' },
      { x: 48, y: 150, w: 20, h: 14, mm: 2.3, kind: 'chip' },
      { x: 73, y: 155, w: 14, h: 14, mm: 6, kind: 'cap' },
      { x: 89, y: 155, w: 14, h: 14, mm: 6, kind: 'cap' },
      { x: 18, y: 6, w: 18, h: 18, mm: 3.1, kind: 'button' },
    ],
  },
  'arduino-mega': {
    pcb: { x: 0, y: 0, w: 400, h: 210 },
    color: '#0e6f75',
    features: [
      { x: -8, y: 30, w: 46, h: 40, mm: 10.9, kind: 'metal' },
      { x: -6, y: 146, w: 44, h: 36, mm: 11, kind: 'black' },
      { x: 178, y: 90, w: 44, h: 44, mm: 1.4, kind: 'chip' },
    ],
  },
  'arduino-giga': {
    pcb: { x: 0, y: 0, w: 400, h: 210 },
    color: '#121416',
    features: [
      { x: -8, y: 34, w: 20, h: 14, mm: 3.3, kind: 'metal' },
      { x: -10, y: 140, w: 40, h: 30, mm: 7, kind: 'metal' },
      { x: -6, y: 92, w: 22, h: 18, mm: 5, kind: 'black' },
      { x: 176, y: 70, w: 58, h: 60, mm: 1.6, kind: 'chip' },
      { x: 292, y: 120, w: 52, h: 44, mm: 2.6, kind: 'metal' },
      { x: 300, y: 58, w: 46, h: 10, mm: 2, kind: 'cream' },
    ],
  },
  'arduino-nano': {
    pcb: { x: -8, y: -7, w: 156, h: 74 },
    color: '#1d4fa6',
    features: [
      { x: -22, y: 20, w: 20, h: 20, mm: 4, kind: 'metal' },
      { x: 51, y: 19, w: 22, h: 22, mm: 1.4, kind: 'chip' },
    ],
  },
};

const MODULE_COLOR: Record<string, string> = {
  'level-converter-4': '#1e4fae',
  'level-converter-8': '#1e4fae',
  'dfplayer-mini': '#1c1d20',
  'mb102-power': '#d9d9d6',
  'lcd-1602': '#1d6b3a',
  'lcd-i2c': '#1d6b3a',
  'hc-sr04': '#1c55a7',
  relay: '#1e4fae',
  'nextion-28': '#121315',
  'giga-display-shield': '#121315',
};

/** Pantallas: cuerpo grueso sobre el PCB (el vidrio y el marco). */
const DISPLAY_BODY: Record<string, { inset: number; mm: number }> = {
  'lcd-1602': { inset: 0.08, mm: 7.5 },
  'lcd-i2c': { inset: 0.14, mm: 7.5 },
  'nextion-28': { inset: 0.05, mm: 4.5 },
  'giga-display-shield': { inset: 0.04, mm: 3.2 },
};

function featureMesh(f: Feature, top: number) {
  const h = f.mm * MM;
  const mat =
    f.kind === 'metal' ? metal() : f.kind === 'black' ? blackPlastic() : f.kind === 'chip' ? mats().epoxy : f.kind === 'cream' ? std('#e9e4d6', 0.6) : f.kind === 'crystal' ? metal() : f.kind === 'cap' ? metal() : std('#c9cdd1', 0.35, 1);
  if (f.kind === 'cap') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(f.w / 2, f.w / 2, h, 24), mat);
    c.position.set(f.x + f.w / 2, top + h / 2, f.y + f.h / 2);
    c.castShadow = true;
    return c;
  }
  const m = body(f.x, f.y, f.w, f.h, top, h, mat, f.kind === 'crystal' ? f.h / 2 : 0.4 * MM);
  if (f.kind === 'button') {
    const g = new THREE.Group();
    g.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(f.w * 0.3, f.w * 0.3, 1.2 * MM, 20), std('#b23a2c', 0.45));
    cap.position.set(f.x + f.w / 2, top + h + 0.6 * MM, f.y + f.h / 2);
    g.add(cap);
    return g;
  }
  return m;
}

// ───────────────────────── Placas y módulos ─────────────────────────

/**
 * Placa o módulo: PCB de 1,6 mm con su dibujo 2D como serigrafía, cabezales hembra donde hay
 * huecos, pines macho donde hay patas (pinchado en la protoboard) y el relieve de sus componentes.
 */
export function buildPcbModule(def: PartDef, part: PartData, ctx: BuildCtx, base = 0): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const spec = FEATURES[def.type];
  const area = spec?.pcb ?? def.bounds(part.props);
  const legsList = pins.filter((p) => p.kind === 'leg');
  const sockets = pins.filter((p) => p.kind === 'socket');
  // Con pines macho pinchados, el PCB descansa sobre el separador de plástico.
  const bottom = legsList.length && ctx.onBoard ? 2.5 * MM : legsList.length ? 6 * MM : 1.5 * MM;
  const T = 1.6 * MM;
  const pcbTop = base + bottom + T;
  const color = spec?.color ?? MODULE_COLOR[def.type] ?? '#1b5e3a';
  const pcbMat = std(color, 0.45, 0, { bumpMap: plasticNoise(), bumpScale: 0.15 });
  const pcb = new THREE.Mesh(slab(rrect(area, 1.2 * MM), pcbTop, T, 0.3), pcbMat);
  pcb.castShadow = pcb.receiveShadow = true;
  group.add(pcb);
  const disp = DISPLAY_BODY[def.type];
  let top = pcbTop;
  if (disp) {
    const ins = { x: area.x + area.w * disp.inset * 0.5, y: area.y + area.h * disp.inset * 0.5, w: area.w * (1 - disp.inset), h: area.h * (1 - disp.inset) };
    group.add(body(ins.x, ins.y, ins.w, ins.h, pcbTop, disp.mm * MM, std('#1a1b1d', 0.4, 0.4)));
    top = pcbTop + disp.mm * MM;
    // La cara de la pantalla (y lo que dibuja el 2D) arriba del todo.
    group.add(skinPlane(partSkin(def, part, area), area, top, { roughness: 0.25, metalness: 0.1 }));
  } else {
    group.add(skinPlane(partSkin(def, part, area), area, pcbTop, { roughness: 0.5 }));
  }
  for (const f of spec?.features ?? []) group.add(featureMesh(f, pcbTop));
  maleHeaders(legsList, group, base, pcbTop, ctx);
  const terminals = def.type === 'relay';
  const socketTop = terminals ? screwTerminals(sockets, group, pcbTop) : femaleHeaders(sockets, pcbTop, group);
  group.userData.pcbTop = pcbTop;
  return {
    group,
    anchorY: (p) => (p.kind === 'socket' ? socketTop : base),
    top: Math.max(top + 1, sockets.length ? socketTop : 0) - base,
    footprint: area,
  };
}

/** HC-SR04: el módulo se pincha de pie, con los dos transductores mirando al frente. */
export function buildUltrasonic(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const b = def.bounds(part.props);
  const T = 1.6 * MM;
  const bottom = (ctx.onBoard ? 2.5 : 3) * MM;
  const height = 20 * MM;
  const x0 = b.x, w = b.w;
  // PCB vertical en el plano x-y, justo detrás de la fila de patas.
  const pcb = new THREE.Mesh(new RoundedBoxGeometry(w, height, T, 2, 0.4 * MM), std('#1c55a7', 0.45));
  pcb.position.set(x0 + w / 2, bottom + 2.5 * MM + height / 2, -T / 2);
  pcb.castShadow = true;
  group.add(pcb);
  const face = partSkin(def, part, b);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, height), new THREE.MeshStandardMaterial({ map: face, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  front.position.set(x0 + w / 2, pcb.position.y, 0.02);
  group.add(front);
  for (const dx of [-0.25, 0.25]) {
    const cx = x0 + w / 2 + dx * w;
    const can = new THREE.Mesh(new THREE.CylinderGeometry(8 * MM, 8 * MM, 12 * MM, 40, 1, true).rotateX(Math.PI / 2), metal());
    can.position.set(cx, pcb.position.y, 6 * MM);
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(7.6 * MM, 40), std('#2a2b2e', 0.85, 0, { bumpMap: plasticNoise(), bumpScale: 1.2 }));
    mesh.position.set(cx, pcb.position.y, 11.6 * MM);
    can.castShadow = true;
    group.add(can, mesh);
  }
  maleHeaders(pins, group, 0, bottom, ctx);
  return { group, anchorY: () => 0, top: bottom + height + 2.5 * MM, footprint: { x: x0, y: -T - 2, w, h: 12 * MM + T + 4 } };
}

// ───────────────────────── Instrumentos y fuentes ─────────────────────────

const INSTRUMENT: Record<string, { mm: number; color: string }> = {
  'bench-supply': { mm: 26, color: '#2b2e33' },
  multimeter: { mm: 14, color: '#f2c230' },
  oscilloscope: { mm: 32, color: '#2a2d31' },
  clock: { mm: 9, color: '#2b2e33' },
};

/** Equipo de banco: carcasa redondeada con el panel 2D arriba y bornes reales en los huecos. */
export function buildInstrument(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  void ctx;
  const group = new THREE.Group();
  const b = def.bounds(part.props);
  const pins = def.pins(part.props);
  const spec = INSTRUMENT[def.type] ?? { mm: 12, color: '#2b2e33' };
  const H = spec.mm * MM;
  const shell = body(b.x, b.y, b.w, b.h, 0, H, std(spec.color, 0.5, 0, { bumpMap: plasticNoise(), bumpScale: 0.3 }), 3 * MM);
  group.add(shell);
  group.add(skinPlane(partSkin(def, part, b), { x: b.x + 1.5, y: b.y + 1.5, w: b.w - 3, h: b.h - 3 }, H, { roughness: 0.4 }));
  const sockets = pins.filter((p) => p.kind === 'socket');
  const legsList = pins.filter((p) => p.kind === 'leg');
  const postTop = bindingPosts(sockets, group, H);
  if (legsList.length) group.add(legs(legsList, H * 0.2, ctx.onBoard ? -3 * MM : 0));
  return { group, anchorY: (p) => (p.kind === 'socket' ? postTop : 0), top: H, footprint: b };
}

// ───────────────────────── Piezas con cables ─────────────────────────

const TETHER: Record<string, { mm: number; color: string; leads: string[]; zone: number }> = {
  'battery-9v': { mm: 17, color: '#2a2b2e', leads: ['#1a1a1a', '#d63a2f'], zone: 34 },
  'aa-pack': { mm: 15, color: '#1b1c1e', leads: ['#1a1a1a', '#d63a2f'], zone: 30 },
  servo: { mm: 22, color: '#1f5fc4', leads: ['#5a3a22', '#d63a2f', '#f2a91c'], zone: 30 },
  'dc-motor': { mm: 20, color: '#c9cdd2', leads: ['#d63a2f', '#1a1a1a'], zone: 26 },
};

/** Batería, portapilas, servo o motor: el cuerpo descansa donde lo dibuja el 2D y sus cables bajan a los huecos. */
export function buildTethered(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const spec = TETHER[def.type];
  const b = def.bounds(part.props);
  const pins = def.pins(part.props);
  const maxPinY = Math.max(...pins.map((p) => p.y));
  const area: Bounds = { x: b.x, y: b.y, w: b.w, h: Math.max(20, maxPinY - spec.zone - b.y) };
  const H = spec.mm * MM;
  const lift = ctx.onBoard ? 0 : 0;
  const isMetal = def.type === 'dc-motor';
  const shell = body(area.x, area.y, area.w, area.h, lift, H, std(spec.color, isMetal ? 0.3 : 0.45, isMetal ? 1 : 0), (isMetal ? 6 : 2) * MM);
  group.add(shell);
  group.add(skinPlane(partSkin(def, part, area), area, lift + H, { roughness: 0.45 }));
  // Cables: salen del borde inferior del cuerpo y bajan en curva a cada hueco.
  const exitZ = area.y + area.h;
  const d = ctx.onBoard ? -3 * MM : 0;
  pins.forEach((p, i) => {
    const color = spec.leads[i % spec.leads.length];
    const start = new THREE.Vector3(p.x, lift + H * 0.35, exitZ - 1);
    const end = new THREE.Vector3(p.x, 1.2 * MM, p.y);
    const mid = new THREE.Vector3(p.x, Math.max(H * 0.35, 4 * MM), (exitZ + p.y) / 2);
    const curve = new THREE.CatmullRomCurve3([start, mid, end.clone().add(new THREE.Vector3(0, 3 * MM, 0)), end]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.65 * MM, 8, false), new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.35 }));
    tube.castShadow = true;
    group.add(tube);
  });
  group.add(legs(pins, 1.2 * MM, d, mats().tin));
  return { group, anchorY: () => 0, top: lift + H, footprint: area };
}

// ───────────────────────── Interruptores ─────────────────────────

const CAPS: Record<string, string> = { red: '#d63a2f', black: '#1e1f22', blue: '#2f6fe8', green: '#2fbf4a', yellow: '#f2d21c' };

/** Pulsador táctil 6×6 o 12×12: base negra, placa metálica y botón de color que baja al pulsar. */
export function buildPushbutton(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const large = def.type === 'pushbutton-large';
  const S = (large ? 12 : 6) * MM;
  const xs = pins.map((p) => p.x), zs = pins.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const lift = ctx.onBoard ? 0.4 * MM : 0;
  const H = (large ? 3.6 : 3.4) * MM;
  group.add(body(cx - S / 2, cz - S / 2, S, S, lift, H, blackPlastic(), 0.3 * MM));
  const plate = new THREE.Mesh(new RoundedBoxGeometry(S * 0.98, 0.3 * MM, S * 0.98, 1, 0.1 * MM), metal());
  plate.position.set(cx, lift + H + 0.15 * MM, cz);
  group.add(plate);
  const r = (large ? 4.8 : 1.75) * MM;
  const capH = (large ? 4 : 1.8) * MM;
  const capMat = std(CAPS[String(part.props.cap)] ?? (large ? CAPS.red : '#1e1f22'), 0.42, 0, { bumpMap: plasticNoise(), bumpScale: 0.2 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.03, capH, 32), capMat);
  const capY = lift + H + 0.3 * MM + capH / 2;
  cap.position.set(cx, capY, cz);
  cap.castShadow = true;
  group.add(cap);
  // Patas de ala: salen por los lados y bajan al hueco.
  group.add(legs(pins, lift + 0.5 * MM, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return {
    group,
    anchorY: () => 0,
    top: capY + capH / 2,
    footprint: { x: cx - S / 2, y: cz - S / 2, w: S, h: S },
    update(v: Visual | null) {
      cap.position.y = capY - (v?.pressed ? 0.6 * MM : 0);
    },
  };
}

/** Conmutador deslizante SPDT de 3 patas. */
export function buildSlideSwitch(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const xs = pins.map((p) => p.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = pins[0].y;
  const W = 8.6 * MM, D = 3.6 * MM, H = 3.6 * MM, lift = ctx.onBoard ? 0.5 * MM : 0;
  group.add(body(cx - W / 2, cz - D / 2, W, D, lift, H, metal(), 0.2 * MM));
  const knob = new THREE.Mesh(new RoundedBoxGeometry(1.6 * MM, 2.2 * MM, 1.6 * MM, 1, 0.3 * MM), blackPlastic());
  const on = Boolean(part.props.on);
  knob.position.set(cx + (on ? 1 : -1) * 1.5 * MM, lift + H + 1.1 * MM, cz);
  knob.castShadow = true;
  group.add(knob, legs(pins, lift + 0.2, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return { group, anchorY: () => 0, top: lift + H + 2.2 * MM, footprint: { x: cx - W / 2, y: cz - D / 2, w: W, h: D } };
}

/** Interruptor DIP: cuerpo rojo con su rótulo 2D y palancas blancas en la posición del documento. */
export function buildDipSwitch(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const n = pins.length / 2;
  const area: Bounds = { x: -5, y: 3, w: n * 10, h: 24 };
  const lift = ctx.onBoard ? 0.3 * MM : 0, H = 4.2 * MM;
  group.add(body(area.x, area.y, area.w, area.h, lift, H, std('#c8302c', 0.4), 0.3 * MM));
  group.add(skinPlane(partSkin(def, part, area), area, lift + H, { roughness: 0.4 }));
  for (let i = 0; i < n; i++) {
    const on = Boolean(part.props[`s${i + 1}`]);
    const lever = new THREE.Mesh(new RoundedBoxGeometry(1.2 * MM, 1.1 * MM, 1.6 * MM, 1, 0.2 * MM), std('#f4f4f2', 0.4));
    lever.position.set(i * 10, lift + H + 0.55 * MM, 15 + (on ? -1 : 1) * 1.2 * MM);
    lever.castShadow = true;
    group.add(lever);
  }
  group.add(legs(pins, lift + 0.2, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return { group, anchorY: () => 0, top: lift + H + 1.1 * MM, footprint: area };
}

// ───────────────────────── Semiconductores discretos ─────────────────────────

/** TO-92 (transistor, sensor de temperatura): media luna negra con la cara plana al frente. */
export function buildTo92(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const xs = pins.map((p) => p.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = pins[0].y;
  const R = 2.4 * MM, H = 4.6 * MM, lift = (ctx.onBoard ? 3 : 2) * MM;
  const s = new THREE.Shape();
  s.moveTo(cx - R * 0.95, cz + 0.9 * MM);
  s.lineTo(cx + R * 0.95, cz + 0.9 * MM);
  s.absarc(cx, cz, R, Math.asin(0.9 * MM / R), Math.PI - Math.asin(0.9 * MM / R), true);
  s.closePath();
  const geo = slab(s, lift + H, H, 0.25);
  const m = new THREE.Mesh(geo, mats().epoxy);
  m.castShadow = true;
  group.add(m);
  const label = def.type === 'tmp36' ? 'TMP36' : '2N2222';
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(210,214,220,0.85)';
  g.font = '600 26px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, 64, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.8, H * 0.9), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false }));
  face.position.set(cx, lift + H / 2, cz + 0.9 * MM + 0.05);
  group.add(face);
  const d = ctx.onBoard ? -3 * MM : 0;
  group.add(legs(pins, lift + 0.2, d, mats().tin));
  return { group, anchorY: () => 0, top: lift + H, footprint: { x: cx - R, y: cz - R, w: 2 * R, h: R + 0.9 * MM } };
}

/** TO-220 (MOSFET): cuerpo negro de pie con la aleta metálica y su taladro. */
export function buildTo220(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const xs = pins.map((p) => p.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = pins[0].y;
  const W = 10 * MM, Hb = 9 * MM, T = 4.5 * MM, lift = (ctx.onBoard ? 4 : 3) * MM;
  const b = new THREE.Mesh(new RoundedBoxGeometry(W, Hb, T, 2, 0.3 * MM), mats().epoxy);
  b.position.set(cx, lift + Hb / 2, cz);
  b.castShadow = true;
  const tabShape = new THREE.Shape();
  tabShape.moveTo(-W / 2, 0);
  tabShape.lineTo(W / 2, 0);
  tabShape.lineTo(W / 2, 6.5 * MM);
  tabShape.lineTo(-W / 2, 6.5 * MM);
  tabShape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 3.2 * MM, 1.8 * MM, 0, Math.PI * 2, false);
  tabShape.holes.push(hole);
  const tab = new THREE.Mesh(new THREE.ExtrudeGeometry(tabShape, { depth: 1.3 * MM, bevelEnabled: false }), std('#cfd3d7', 0.3, 1));
  tab.position.set(cx, lift + Hb, cz - T / 2);
  tab.castShadow = true;
  group.add(b, tab, legs(pins, lift + 0.2, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return { group, anchorY: () => 0, top: lift + Hb + 6.5 * MM, footprint: { x: cx - W / 2, y: cz - T / 2, w: W, h: T } };
}

/** Potenciómetro rotatorio: carcasa, casquillo roscado y eje moleteado girado según su posición. */
export function buildPot(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const xs = pins.map((p) => p.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = pins[0].y - 5 * MM;
  const S = 9.6 * MM, H = 6.5 * MM, lift = ctx.onBoard ? 0.5 * MM : 0;
  group.add(body(cx - S / 2, cz - S / 2, S, S, lift, H, std('#2c56b8', 0.45), 0.6 * MM));
  const bush = new THREE.Mesh(new THREE.CylinderGeometry(3.5 * MM, 3.5 * MM, 5 * MM, 24), metal());
  bush.position.set(cx, lift + H + 2.5 * MM, cz);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3 * MM, 3 * MM, 9 * MM, 18), std('#c9ccd0', 0.4, 1));
  shaft.position.set(cx, lift + H + 9.5 * MM, cz);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(6.2 * MM, 1 * MM, 0.8 * MM), std('#2a2b2e', 0.6));
  slot.position.set(cx, lift + H + 14.05 * MM, cz);
  const pos = Number(part.props.position ?? 0.5);
  slot.rotation.y = (pos - 0.5) * (300 * Math.PI) / 180;
  for (const m of [bush, shaft]) m.castShadow = true;
  group.add(bush, shaft, slot);
  // Patas: salen del frente y bajan en ángulo a los tres huecos.
  group.add(legs(pins, lift + 0.4 * MM, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return { group, anchorY: () => 0, top: lift + H + 14 * MM, footprint: { x: cx - S / 2, y: cz - S / 2, w: S, h: S + 5 * MM } };
}

/** LDR: disco de cerámica con la pista de sulfuro de cadmio en zigzag. */
export function buildLdr(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const [a, b] = def.pins(part.props);
  const cx = (a.x + b.x) / 2, cz = a.y;
  const R = 2.6 * MM, lift = (ctx.onBoard ? 3 : 2) * MM;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 2 * MM, 32), std('#e7dccb', 0.5));
  disc.position.set(cx, lift + 1 * MM, cz);
  disc.castShadow = true;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e7dccb';
  g.beginPath();
  g.arc(32, 32, 32, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#b8562a';
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i < 7; i++) {
    const y = 12 + i * 6.6;
    g.lineTo(i % 2 ? 50 : 14, y);
    g.lineTo(i % 2 ? 14 : 50, y);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.96, 32).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.15, clearcoat: 1 }));
  face.position.set(cx, lift + 2 * MM + 0.03, cz);
  group.add(disc, face, legs([a, b], lift, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return { group, anchorY: () => 0, top: lift + 2 * MM, footprint: { x: cx - R, y: cz - R, w: 2 * R, h: 2 * R } };
}

/** Zumbador piezo de 12 mm. */
export function buildBuzzer(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const xs = pins.map((p) => p.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = pins[0].y;
  const R = 6 * MM, H = 9.5 * MM, lift = ctx.onBoard ? 0.4 * MM : 0;
  const can = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 40), blackPlastic());
  can.position.set(cx, lift + H / 2, cz);
  can.castShadow = true;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(1 * MM, 20).rotateX(-Math.PI / 2), std('#050505', 0.9));
  hole.position.set(cx, lift + H + 0.03, cz);
  group.add(can, hole, legs(pins, lift + 0.2, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return { group, anchorY: () => 0, top: lift + H, footprint: { x: cx - R, y: cz - R, w: 2 * R, h: 2 * R } };
}

/** LED RGB de 4 patas: epoxi difuso que mezcla los tres canales de la simulación. */
export function buildRgbLed(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const xs = pins.map((p) => p.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = pins[0].y;
  const r = 2.5 * MM, h = 8.6 * MM, standoff = (ctx.onBoard ? 2.5 : 3) * MM;
  const prof: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(r + 0.4 * MM, 0), new THREE.Vector2(r + 0.4 * MM, 1 * MM), new THREE.Vector2(r, 1 * MM), new THREE.Vector2(r, h - r)];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.max(0.01, r * Math.cos(a)), h - r + r * Math.sin(a)));
  }
  const mat = new THREE.MeshPhysicalMaterial({ color: '#eef1f4', roughness: 0.55, transmission: 0, transparent: true, opacity: 0.92, emissive: new THREE.Color('#000000'), emissiveIntensity: 2.4 });
  const domeMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), mat);
  domeMesh.position.set(cx, standoff, cz);
  domeMesh.castShadow = true;
  group.add(domeMesh, legs(pins, standoff + 0.4, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return {
    group,
    anchorY: () => 0,
    top: standoff + h,
    footprint: { x: cx - r - 2, y: cz - r - 2, w: 2 * r + 4, h: 2 * r + 4 },
    update(v: Visual | null) {
      const k = (key: string) => Math.min(1, Math.sqrt(Math.max(0, Number(v?.[key] ?? 0)) / 0.02));
      mat.emissive.setRGB(k('r'), k('g') * 0.85, k('b'));
    },
  };
}

/** Barra de 10 LED: cuerpo negro con ventanas que se encienden una a una. */
export function buildLedBar(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const pins = def.pins(part.props);
  const n = pins.length / 2;
  const color = LED_COLORS[String(part.props.color)] ?? LED_COLORS.red;
  const area: Bounds = { x: -5, y: 3, w: n * 10, h: 24 };
  const lift = ctx.onBoard ? 0.4 * MM : 0, H = 8 * MM;
  group.add(body(area.x, area.y, area.w, area.h, lift, H, std('#17181a', 0.55), 0.3 * MM));
  const wins: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < n; i++) {
    const m = std(color.body, 0.3, 0, { emissive: new THREE.Color(color.light), emissiveIntensity: 0, transparent: true, opacity: 0.55 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 18).rotateX(-Math.PI / 2), m);
    win.position.set(i * 10, lift + H + 0.03, 15);
    wins.push(m);
    group.add(win);
  }
  group.add(legs(pins, lift + 0.2, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return {
    group,
    anchorY: () => 0,
    top: lift + H,
    footprint: area,
    update(v: Visual | null) {
      wins.forEach((m, i) => {
        const k = Math.min(1, Math.sqrt(Math.max(0, Number(v?.[`i${i}`] ?? 0)) / 0.01));
        m.emissiveIntensity = k * 2.6;
        m.opacity = 0.55 + 0.45 * k;
      });
    },
  };
}

/** Altavoz de 50 mm: cono de papel, imán y aro, apoyado sobre sus terminales. */
export function buildSpeaker(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  void ctx;
  const group = new THREE.Group();
  const b = def.bounds(part.props);
  const cx = b.x + b.w / 2, cz = b.y + b.h / 2, R = Math.min(b.w, b.h) / 2;
  const H = 14 * MM;
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.55, H, 48, 1, true), std('#2a2b2e', 0.45, 0.6));
  frame.position.set(cx, H / 2, cz);
  const coneProfile = [new THREE.Vector2(R * 0.18, H * 0.55), new THREE.Vector2(R * 0.92, H * 0.95)];
  const cone = new THREE.Mesh(new THREE.LatheGeometry(coneProfile, 48), std('#1c1c1e', 0.9, 0, { side: THREE.DoubleSide, bumpMap: plasticNoise(), bumpScale: 0.8 }));
  cone.position.set(cx, 0, cz);
  const dust = new THREE.Mesh(new THREE.SphereGeometry(R * 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#232325', 0.7));
  dust.position.set(cx, H * 0.52, cz);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.96, 1.1 * MM, 8, 48).rotateX(Math.PI / 2), std('#141415', 0.8));
  rim.position.set(cx, H, cz);
  frame.castShadow = true;
  group.add(frame, cone, dust, rim, legs(def.pins(part.props), 2 * MM, ctx.onBoard ? -3 * MM : 0, mats().tin));
  return { group, anchorY: () => 0, top: H, footprint: b };
}

/** Pieza que no está en la protoboard ni es placa: ayuda a decidir el respaldo con piel. */
export function skinnedFallback(def: PartDef, part: PartData, ctx: BuildCtx): Model {
  const group = new THREE.Group();
  const b = def.bounds(part.props);
  const pins = def.pins(part.props);
  const legsList = pins.filter((p) => p.kind === 'leg');
  const sockets = pins.filter((p) => p.kind === 'socket');
  const lift = ctx.onBoard && legsList.length ? 1.5 * MM : 0;
  const H = (def.category === 'Instrumentos' || def.category === 'Energía' ? 12 : 4) * MM;
  group.add(body(b.x, b.y, b.w, b.h, lift, H, std('#1f2124', 0.5), 1 * MM));
  group.add(skinPlane(partSkin(def, part, b), b, lift + H, { roughness: 0.5 }));
  if (legsList.length) group.add(legs(legsList.filter((p) => insideBounds(p, b) || true), lift + 0.2, ctx.onBoard ? -3 * MM : 0, mats().tin));
  const socketTop = femaleHeaders(sockets, lift + H, group);
  return { group, anchorY: (p) => (p.kind === 'socket' ? socketTop : lift), top: Math.max(lift + H, sockets.length ? socketTop : 0), footprint: b };
}
