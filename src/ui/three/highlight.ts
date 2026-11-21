import * as THREE from 'three';
import { toWorld } from '../../core/types';
import { PARTS } from '../../parts';
import { isBreadboard } from './breadboard';
import { MM, type Theme3D } from './materials';
import type { CircuitScene } from './scene';

export interface Focus {
  parts: string[];
  wires: string[];
  hoverPart: string | null;
  hoverWire: string | null;
  /** Red que se comprueba: todas sus patillas y cables se resaltan; el resto se atenúa. */
  net: { pins: Set<string>; wires: Set<string> } | null;
}

const accent = () => {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() : '';
  try {
    return new THREE.Color(v || '#3b9eff');
  } catch {
    return new THREE.Color('#3b9eff');
  }
};

/** Contorno por inflado de normales (cara trasera): silueta limpia alrededor de un cable. */
function outlineMaterial(color: THREE.Color, width: number, opacity: number) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: opacity < 1, opacity, depthWrite: false });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normal * ${width.toFixed(3)};`);
  };
  m.customProgramCacheKey = () => `outline-${width.toFixed(3)}`;
  return m;
}

let glowTex: THREE.Texture | null = null;
/** Halo suave rectangular bajo la pieza seleccionada. */
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 10, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let ringTex: THREE.Texture | null = null;
/** Marco cuadrado luminoso que señala un hueco o patilla de la red comprobada. */
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'white';
  g.lineWidth = 9;
  g.shadowColor = 'white';
  g.shadowBlur = 10;
  g.strokeRect(12, 12, 40, 40);
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

/**
 * Capa de resaltado: contornos de selección y paso del cursor, red completa con sus huecos
 * marcados y el resto del montaje atenuado (modo «comprobar cable»).
 */
export class Highlighter {
  root = new THREE.Group();
  private ghosts = new Map<THREE.Material, THREE.Material>();
  private dimmed: { mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
  private wireColorsBackup: Float32Array | null = null;
  private theme: Theme3D = 'dark';

  constructor(private circuit: CircuitScene) {
    this.root.renderOrder = 5;
  }

  setTheme(t: Theme3D) {
    this.theme = t;
  }

  clear() {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      c.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      });
    }
    for (const d of this.dimmed) d.mesh.material = d.mat;
    this.dimmed = [];
    const w = this.circuit.wires?.mesh;
    if (w && this.wireColorsBackup) {
      (w.geometry.attributes.color.array as Float32Array).set(this.wireColorsBackup);
      w.geometry.attributes.color.needsUpdate = true;
    }
    this.wireColorsBackup = null;
  }

  apply(f: Focus) {
    this.clear();
    const col = accent();
    // Piezas seleccionadas o bajo el cursor: aristas de su caja y halo en la base.
    const partSet = new Map<string, number>();
    for (const id of f.parts) partSet.set(id, 1);
    if (f.hoverPart && !partSet.has(f.hoverPart)) partSet.set(f.hoverPart, 0.45);
    for (const [id, strength] of partSet) {
      const e = this.circuit.parts.get(id);
      if (!e) continue;
      const def = PARTS[e.part.type];
      const b = e.model.footprint ?? def.bounds(e.part.props);
      const top = isBreadboard(e.part.type) ? 0.5 : e.model.top + 1;
      const bottom = isBreadboard(e.part.type) ? -e.obj.userData.height || -33 : 0;
      const pad = 3;
      const box = new THREE.BoxGeometry(b.w + 2 * pad, top - bottom + 2, b.h + 2 * pad);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95 * strength, depthTest: false }));
      box.dispose();
      edges.position.set(b.x + b.w / 2, (top + bottom) / 2, b.y + b.h / 2);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 24, b.h + 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.55 * strength, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(b.x + b.w / 2, bottom + 0.2, b.y + b.h / 2);
      const holder = new THREE.Group();
      holder.position.copy(e.obj.position);
      holder.rotation.copy(e.obj.rotation);
      holder.add(edges, glow);
      holder.userData.noPick = true;
      edges.renderOrder = 10;
      this.root.add(holder);
    }

    const wm = this.circuit.wires;
    // Cables seleccionados o bajo el cursor: silueta inflada del tramo de la malla fusionada.
    const outline = (id: string, opacity: number) => {
      const r = wm?.ranges.find((q) => q.id === id);
      if (!wm?.mesh || !r) return;
      const src = wm.mesh.geometry;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position);
      g.setAttribute('normal', src.attributes.normal);
      g.setIndex(new THREE.BufferAttribute((src.index!.array as Uint32Array | Uint16Array).slice(r.start, r.end), 1));
      g.userData.shared = false;
      const m = new THREE.Mesh(g, outlineMaterial(col, 0.75 * MM, opacity));
      m.userData.noPick = true;
      this.root.add(m);
    };
    for (const id of f.wires) outline(id, 0.95);
    if (f.hoverWire && !f.wires.includes(f.hoverWire)) outline(f.hoverWire, 0.45);

    if (!f.net) return;
    // Comprobar cable: atenúa lo que no es de la red.
    const dimTo = new THREE.Color(this.theme === 'dark' ? '#3a3d42' : '#c3c6cb');
    if (wm?.mesh) {
      const attr = wm.mesh.geometry.attributes.color;
      const arr = attr.array as Float32Array;
      this.wireColorsBackup = arr.slice();
      for (const r of wm.ranges) {
        if (f.net.wires.has(r.id)) continue;
        for (let i = r.vStart; i < r.vEnd; i++) {
          arr[i * 3] = arr[i * 3] * 0.25 + dimTo.r * 0.75;
          arr[i * 3 + 1] = arr[i * 3 + 1] * 0.25 + dimTo.g * 0.75;
          arr[i * 3 + 2] = arr[i * 3 + 2] * 0.25 + dimTo.b * 0.75;
        }
      }
      attr.needsUpdate = true;
    }
    const netParts = new Set([...f.net.pins].map((k) => k.slice(0, k.lastIndexOf(':'))));
    for (const [id, e] of this.circuit.parts) {
      if (netParts.has(id) || isBreadboard(e.part.type)) continue;
      e.obj.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        this.dimmed.push({ mesh, mat: mesh.material });
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => this.ghost(m)) : this.ghost(mesh.material);
      });
    }
    // Marcas en cada hueco y patilla de la red: se ve la tira entera de la protoboard.
    const pts: THREE.Vector3[] = [];
    for (const key of f.net.pins) {
      const i = key.lastIndexOf(':');
      const e = this.circuit.parts.get(key.slice(0, i));
      const pin = e && PARTS[e.part.type]?.pins(e.part.props).find((p) => p.id === key.slice(i + 1));
      if (!e || !pin) continue;
      const w = toWorld(e.part, pin);
      pts.push(new THREE.Vector3(w.x, e.base + e.model.anchorY(pin) + 0.15, w.y));
    }
    if (pts.length) {
      const geo = new THREE.PlaneGeometry(8.5, 8.5).rotateX(-Math.PI / 2);
      const marks = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: ringTexture(), color: col, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }), pts.length);
      const m = new THREE.Matrix4();
      pts.forEach((p, i) => marks.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
      marks.userData.noPick = true;
      marks.renderOrder = 11;
      this.root.add(marks);
    }
  }

  private ghost(m: THREE.Material) {
    let g = this.ghosts.get(m);
    if (!g) {
      g = m.clone();
      g.transparent = true;
      g.opacity = 0.18;
      g.depthWrite = false;
      g.userData.shared = true;
      this.ghosts.set(m, g);
    }
    return g;
  }
}
