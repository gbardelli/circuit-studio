import * as THREE from 'three';
import { toWorld, type CircuitSnapshot, type PartData, type WireEnd } from '../../core/types';
import { PARTS } from '../../parts';
import { partBounds } from '../geometry';
import { buildBreadboard, isBreadboard } from './breadboard';
import { buildGeneric, type Model } from './generic';
import { stackHost } from '../../parts/stack';
import { buildModel } from './models';
import { BOARD_H, TABLE_Y, disposeObject, shadowMaterial } from './materials';
import { buildWires, surfaceAt, type Footprint, type WireInput, type WireMeshes } from './wires';

interface PartEntry {
  sig: string;
  obj: THREE.Group;
  model: Model;
  base: number;
  part: PartData;
}

const shadowGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  g.userData.shared = true;
  return g;
})();

/** Convierte el documento en escena: misma pieza, misma posición, mismo hueco. Reconstruye solo lo que cambia. */
export class CircuitScene {
  root = new THREE.Group();
  partsRoot = new THREE.Group();
  parts = new Map<string, PartEntry>();
  wires: WireMeshes | null = null;
  bounds = new THREE.Box3();
  private wireSig = '';

  constructor() {
    this.root.add(this.partsRoot);
  }

  update(snap: CircuitSnapshot) {
    const t0 = performance.now();
    const boards = snap.parts.filter((p) => isBreadboard(p.type) && PARTS[p.type]).map((p) => partBounds(p));
    const onBoard = (p: PartData) => {
      if (isBreadboard(p.type)) return true;
      const def = PARTS[p.type];
      if (!def) return false;
      const pins = def.pins(p.props);
      if (!pins.length) return false;
      const inside = pins.filter((pin) => {
        const w = toWorld(p, pin);
        return boards.some((b) => w.x > b.x && w.x < b.x + b.w && w.y > b.y && w.y < b.y + b.h);
      }).length;
      return inside > 0 && pins.every((pin) => pin.kind === 'leg') ? true : inside > pins.length / 2;
    };
    const seen = new Set<string>();
    let partsChanged = false;
    // Las placas anfitrionas primero: una shield se apoya en lo alto de sus cabezales.
    const ordered = [...snap.parts].sort((a, b) => Number(Boolean(PARTS[a.type]?.stacksOn)) - Number(Boolean(PARTS[b.type]?.stacksOn)));
    for (const p of ordered) {
      const def = PARTS[p.type];
      if (!def || p.type === 'note') continue;
      seen.add(p.id);
      const board = onBoard(p);
      const host = def.stacksOn ? stackHost(p, snap.parts) : undefined;
      const hostEntry = host ? this.parts.get(host.id) : undefined;
      const stackBase = hostEntry ? hostEntry.base + hostEntry.model.top : null;
      const sig = JSON.stringify([p.type, p.props, p.x, p.y, p.rot, board, stackBase]);
      const prev = this.parts.get(p.id);
      if (prev && prev.sig === sig) continue;
      partsChanged = true;
      if (prev) {
        this.partsRoot.remove(prev.obj);
        disposeObject(prev.obj);
      }
      let model: Model;
      if (isBreadboard(p.type)) {
        const group = buildBreadboard(def, p);
        model = { group, anchorY: () => 0, top: 0 };
      } else {
        try {
          model = buildModel(def, p, { onBoard: board });
        } catch (err) {
          console.warn(`3D: sin modelo para ${p.type}`, err);
          model = buildGeneric(def, p, { onBoard: board });
        }
      }
      const obj = model.group;
      const base = stackBase ?? (isBreadboard(p.type) || board ? 0 : TABLE_Y);
      // Oclusión de contacto horneada: sombra suave bajo la huella.
      const b = model.footprint ?? def.bounds(p.props);
      const blob = new THREE.Mesh(shadowGeo, shadowMaterial());
      blob.scale.set(b.w * 1.18 + 8, 1, b.h * 1.18 + 8);
      blob.position.set(b.x + b.w / 2, (isBreadboard(p.type) ? -BOARD_H : 0) + 0.06, b.y + b.h / 2);
      blob.renderOrder = -1;
      blob.userData.noPick = true;
      obj.add(blob);
      obj.position.set(p.x, base, p.y);
      obj.rotation.y = (-p.rot * Math.PI) / 180;
      obj.userData.partId = p.id;
      obj.traverse((n) => {
        if (!n.userData.noPick) n.userData.part = p.id;
      });
      this.partsRoot.add(obj);
      this.parts.set(p.id, { sig, obj, model, base, part: p });
    }
    for (const [id, e] of this.parts) {
      if (seen.has(id)) continue;
      partsChanged = true;
      this.partsRoot.remove(e.obj);
      disposeObject(e.obj);
      this.parts.delete(id);
    }
    const wires = snap.wires.filter((w) => !w.sch);
    const wireSig = JSON.stringify(wires);
    if (wireSig !== this.wireSig || partsChanged) {
      this.wireSig = wireSig;
      this.rebuildWires(wires);
    }
    this.bounds.makeEmpty();
    for (const e of this.parts.values()) this.bounds.expandByObject(e.obj);
    if (this.wires) this.bounds.expandByObject(this.wires.group);
    return performance.now() - t0;
  }

  footprints(): Footprint[] {
    const out: Footprint[] = [];
    for (const e of this.parts.values()) {
      const f = e.model.footprint;
      let b = partBounds(e.part);
      if (f) {
        const c = [toWorld(e.part, { x: f.x, y: f.y }), toWorld(e.part, { x: f.x + f.w, y: f.y + f.h })];
        b = { x: Math.min(c[0].x, c[1].x), y: Math.min(c[0].y, c[1].y), w: Math.abs(c[0].x - c[1].x), h: Math.abs(c[0].y - c[1].y) };
      }
      out.push({ x0: b.x, z0: b.y, x1: b.x + b.w, z1: b.y + b.h, top: isBreadboard(e.part.type) ? 0 : e.base + e.model.top });
    }
    return out;
  }

  /** Punto 3D donde entra el cable: hueco de la protoboard, orificio del cabezal o pata. */
  anchor(end: WireEnd, ground: (x: number, z: number) => number) {
    if (end.part && end.pin) {
      const e = this.parts.get(end.part);
      const pin = e && PARTS[e.part.type]?.pins(e.part.props).find((q) => q.id === end.pin);
      if (e && pin) {
        const w = toWorld(e.part, pin);
        return new THREE.Vector3(w.x, e.base + e.model.anchorY(pin), w.y);
      }
    }
    return new THREE.Vector3(end.x, ground(end.x, end.y), end.y);
  }

  private rebuildWires(wires: CircuitSnapshot['wires']) {
    if (this.wires) {
      this.root.remove(this.wires.group);
      disposeObject(this.wires.group);
    }
    const fps = this.footprints();
    const ground = surfaceAt(fps, TABLE_Y);
    const list: WireInput[] = wires.map((w) => ({
      id: w.id,
      color: w.color,
      a: this.anchor(w.a, ground),
      b: this.anchor(w.b, ground),
      via: w.points.map((p) => ({ x: p.x, z: p.y })),
    }));
    this.wires = buildWires(list, ground);
    this.wires.group.traverse((n) => (n.userData.noPickPart = true));
    this.root.add(this.wires.group);
  }

  dispose() {
    disposeObject(this.root);
    this.parts.clear();
  }
}
