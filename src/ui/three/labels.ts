import * as THREE from 'three';
import { formatSI } from '../../core/units';
import { PARTS } from '../../parts';
import { isBreadboard } from './breadboard';
import type { CircuitScene } from './scene';

const MAX = 28;

/** Nombre corto como lo leería alguien en la mesa: nombre propio, valor o referencia. */
function caption(type: string, props: Record<string, unknown>) {
  if (props.label) return String(props.label);
  const def = PARTS[type];
  if (type === 'resistor') return formatSI(Number(props.resistance), 'Ω');
  if (type === 'capacitor' || type === 'capacitor-ceramic') return formatSI(Number(props.capacitance), 'F');
  return def?.partNumber ?? def?.name ?? type;
}

/**
 * Etiquetas HTML sobre las piezas. LOD: con la cámara lejos solo se rotulan la selección y lo que
 * está bajo el cursor; al acercarse, todas las visibles (las más cercanas al centro, como máximo 28).
 * Culling: lo que queda fuera del encuadre o detrás de la cámara no se coloca.
 */
export class Labels {
  private layer: HTMLDivElement;
  private pool: HTMLDivElement[] = [];
  private v = new THREE.Vector3();

  constructor(host: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'board3d-labels';
    host.appendChild(this.layer);
  }

  update(circuit: CircuitScene, camera: THREE.PerspectiveCamera, w: number, h: number, dist: number, focus: Set<string>) {
    const near = dist < 900;
    const items: { x: number; y: number; d: number; text: string; strong: boolean }[] = [];
    for (const [id, e] of circuit.parts) {
      const strong = focus.has(id);
      if (!strong && (!near || isBreadboard(e.part.type))) continue;
      const def = PARTS[e.part.type];
      if (!def) continue;
      const b = e.model.footprint ?? def.bounds(e.part.props);
      this.v.set(b.x + b.w / 2, 0, b.y + b.h / 2).applyMatrix4(e.obj.matrixWorld);
      this.v.y = e.base + e.model.top + 4;
      this.v.project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) continue;
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      items.push({ x, y, d: Math.hypot(x - w / 2, y - h / 2) - (strong ? 1e6 : 0), text: caption(e.part.type, e.part.props), strong });
    }
    items.sort((a, b) => a.d - b.d);
    const shown = items.slice(0, MAX);
    while (this.pool.length < shown.length) {
      const el = document.createElement('div');
      el.className = 'board3d-label';
      this.layer.appendChild(el);
      this.pool.push(el);
    }
    this.pool.forEach((el, i) => {
      const it = shown[i];
      if (!it) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      if (el.textContent !== it.text) el.textContent = it.text;
      el.classList.toggle('strong', it.strong);
      el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, -100%)`;
    });
  }

  dispose() {
    this.layer.remove();
  }
}
