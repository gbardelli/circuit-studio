import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { PartData, Vec } from '../../core/types';
import type { PartDef, Visual } from '../../parts/types';

/**
 * Toque en 3D con la lógica exacta del 2D. Bajo el cursor se monta, invisible, el Render 2D de la
 * pieza a la escala que tiene en pantalla, con el punto tocado justo debajo del dedo. El toque real
 * se entrega a su control (`data-interactive`): pulsadores, interruptores, potenciómetros, mandos
 * de la fuente y pantallas táctiles funcionan igual que en el plano, arrastres incluidos, porque el
 * control captura el mismo puntero.
 */
export class PartProxy {
  private layer: HTMLDivElement;
  private root: Root;
  private releasing: (() => void) | null = null;

  constructor() {
    this.layer = document.createElement('div');
    this.layer.className = 'board3d-proxy';
    this.layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;opacity:0;pointer-events:none;z-index:60';
    document.body.appendChild(this.layer);
    this.root = createRoot(this.layer);
  }

  /** Devuelve true si la pieza tenía un control activo en ese punto y el toque se le entregó. */
  press(def: PartDef, part: PartData, visual: Visual | null, onInput: (key: string, value: number | boolean) => void, local: Vec, scale: number, e: PointerEvent): boolean {
    this.releasing?.();
    const b = def.bounds(part.props);
    const left = e.clientX - (local.x - b.x) * scale;
    const top = e.clientY - (local.y - b.y) * scale;
    const Render = def.Render;
    flushSync(() =>
      this.root.render(
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} width={b.w * scale} height={b.h * scale} style={{ position: 'absolute', left, top, overflow: 'visible' }}>
          <Render part={{ ...part, x: 0, y: 0, rot: 0 }} visual={visual} onInput={onInput} />
        </svg>,
      ),
    );
    this.layer.style.pointerEvents = 'auto';
    let el = document.elementFromPoint(e.clientX, e.clientY);
    let target = el && this.layer.contains(el) ? el.closest('[data-interactive="true"]') : null;
    let cx = e.clientX, cy = e.clientY;
    if (!target) {
      // El modelo 3D puede colocar el control un poco distinto que el dibujo: si la pieza solo
      // tiene un control (deslizante, potenciómetro), el toque sobre cualquier parte lo acciona.
      const all = this.layer.querySelectorAll('[data-interactive="true"]');
      if (all.length === 1) {
        target = all[0];
        const r = target.getBoundingClientRect();
        cx = r.x + r.width / 2;
        cy = r.y + r.height / 2;
        el = target;
      }
    }
    if (!target) {
      this.reset();
      return false;
    }
    const at = el && target.contains(el) ? el : target;
    e.preventDefault();
    at.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: 1 }),
    );
    // Al soltar (lo recibe primero el control capturado), se desmonta el proxy.
    const end = () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      this.releasing = null;
      setTimeout(() => this.reset(), 0);
    };
    this.releasing = end;
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return true;
  }

  private reset() {
    this.layer.style.pointerEvents = 'none';
    this.root.render(null);
  }

  dispose() {
    this.releasing?.();
    setTimeout(() => {
      this.root.unmount();
      this.layer.remove();
    }, 0);
  }
}
