// GIGA Display Shield (ASX00039): KD040WVFID026 de 3,97″ y 480×800, táctil capacitivo por I²C y
// LED RGB con driver IS31FL3197. En la placa real va por DSI detrás del GIGA. En el simulador el
// sketch se ejecuta en un núcleo AVR, así que las librerías Arduino_GigaDisplay_GFX,
// Arduino_GigaDisplayTouch y Arduino_GigaDisplay se sustituyen por una capa compatible
// (src/sim/gigaDisplayShim.ts) que habla con esta pantalla por dos registros reservados del
// ATmega2560. No ocupa pines, igual que la shield real, que no usa los cabezales D0–D53.

/** Registros libres del espacio de E/S extendido del ATmega2560 (tras UDR3, 0x136). */
export const SHIELD_OUT = 0x1f8;
export const SHIELD_IN = 0x1f9;

export const NATIVE_W = 480;
export const NATIVE_H = 800;
/** La escena se guarda en apaisado (rotación 1): 800 × 480, como se monta sobre la mesa. */
export const SCREEN_W = 800;
export const SCREEN_H = 480;

export type ShieldOp =
  | { k: 'rect'; x: number; y: number; w: number; h: number; r: number; fill?: string; stroke?: string }
  | { k: 'circle'; x: number; y: number; r: number; fill?: string; stroke?: string }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { k: 'poly'; pts: number[]; fill?: string; stroke?: string }
  | { k: 'text'; x: number; y: number; size: number; color: string; bg?: string; text: string; rot: number };

/** Opcodes y número de argumentos de 16 bits de cada uno. */
const ARGS: Record<number, number> = {
  0x01: 0, // begin
  0x02: 1, // setRotation
  0x03: 1, // fillScreen
  0x04: 5, // fillRect
  0x05: 5, // drawRect
  0x06: 6, // fillRoundRect
  0x07: 6, // drawRoundRect
  0x08: 5, // drawLine
  0x09: 4, // fillCircle
  0x0a: 4, // drawCircle
  0x0b: 7, // fillTriangle
  0x0c: 7, // drawTriangle
  0x0d: 3, // drawPixel
  0x0e: 7, // carácter: x, y, tamaño, color, fondo, ¿fondo opaco?, código
  0x0f: 3, // LED RGB
  0x10: 0, // startBuffering
  0x11: 0, // endBuffering
  0x20: 0, // fija un informe táctil para leerlo por SHIELD_IN
};

const MAX_OPS = 3000;

export function rgb565(n: number) {
  const r = Math.round((((n >> 11) & 31) * 255) / 31);
  const g = Math.round((((n >> 5) & 63) * 255) / 63);
  const b = Math.round(((n & 31) * 255) / 31);
  return `rgb(${r},${g},${b})`;
}

const s16 = (lo: number, hi: number) => {
  const v = lo | (hi << 8);
  return v & 0x8000 ? v - 0x10000 : v;
};

/** Caja que ocupa una operación, para descartar lo que queda tapado por un relleno opaco. */
function box(op: ShieldOp): [number, number, number, number] {
  switch (op.k) {
    case 'rect':
      return [op.x, op.y, op.x + op.w, op.y + op.h];
    case 'circle':
      return [op.x - op.r, op.y - op.r, op.x + op.r, op.y + op.r];
    case 'line':
      return [Math.min(op.x1, op.x2), Math.min(op.y1, op.y2), Math.max(op.x1, op.x2) + 1, Math.max(op.y1, op.y2) + 1];
    case 'poly': {
      const xs = op.pts.filter((_, i) => i % 2 === 0);
      const ys = op.pts.filter((_, i) => i % 2 === 1);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'text': {
      const w = 6 * op.size * op.text.length;
      const h = 8 * op.size;
      return op.rot % 2 ? [op.x - h, op.y, op.x, op.y + w] : [op.x, op.y, op.x + w, op.y + h];
    }
  }
}

export class GigaDisplay {
  powered = false;
  scene = '[]';
  led = '';
  rotation = 0;
  private ops: ShieldOp[] = [];
  private pending: number[] = [];
  private buffering = false;
  private dirty = false;
  private report: number[] = [];
  private touch: { x: number; y: number; down: boolean } = { x: 0, y: 0, down: false };

  power(on: boolean) {
    if (on === this.powered) return;
    this.powered = on;
    this.ops = [];
    this.pending = [];
    this.rotation = 0;
    this.buffering = false;
    this.led = '';
    this.scene = '[]';
  }

  /** Coordenadas de la rotación actual → escena apaisada (rotación 1). */
  private map(x: number, y: number): [number, number] {
    switch (this.rotation & 3) {
      case 0:
        return [y, NATIVE_W - 1 - x];
      case 2:
        return [SCREEN_W - 1 - y, x];
      case 3:
        return [SCREEN_W - 1 - x, SCREEN_H - 1 - y];
      default:
        return [x, y];
    }
  }

  private rect(x: number, y: number, w: number, h: number) {
    const [ax, ay] = this.map(x, y);
    const [bx, by] = this.map(x + w - 1, y + h - 1);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax) + 1, h: Math.abs(by - ay) + 1 };
  }

  write(byte: number) {
    if (!this.powered) return;
    this.pending.push(byte & 0xff);
    const code = this.pending[0];
    const argc = ARGS[code];
    if (argc === undefined) {
      this.pending = [];
      return;
    }
    if (this.pending.length < 1 + argc * 2) return;
    const a = Array.from({ length: argc }, (_, i) => s16(this.pending[1 + i * 2], this.pending[2 + i * 2]));
    this.pending = [];
    this.run(code, a);
  }

  read() {
    return this.report.shift() ?? 0;
  }

  private run(code: number, a: number[]) {
    const color = (n: number) => rgb565(n & 0xffff);
    switch (code) {
      case 0x01:
        this.ops = [];
        this.rotation = 0;
        this.commit();
        return;
      case 0x02:
        this.rotation = a[0] & 3;
        return;
      case 0x03:
        this.ops = [];
        return this.add({ k: 'rect', x: 0, y: 0, w: SCREEN_W, h: SCREEN_H, r: 0, fill: color(a[0]) });
      case 0x04:
      case 0x05: {
        if (a[2] <= 0 || a[3] <= 0) return;
        const r = this.rect(a[0], a[1], a[2], a[3]);
        return this.add(code === 0x04 ? { k: 'rect', ...r, r: 0, fill: color(a[4]) } : { k: 'rect', ...r, r: 0, stroke: color(a[4]) });
      }
      case 0x06:
      case 0x07: {
        if (a[2] <= 0 || a[3] <= 0) return;
        const r = this.rect(a[0], a[1], a[2], a[3]);
        return this.add(code === 0x06 ? { k: 'rect', ...r, r: a[4], fill: color(a[5]) } : { k: 'rect', ...r, r: a[4], stroke: color(a[5]) });
      }
      case 0x08: {
        const [x1, y1] = this.map(a[0], a[1]);
        const [x2, y2] = this.map(a[2], a[3]);
        return this.add({ k: 'line', x1, y1, x2, y2, stroke: color(a[4]) });
      }
      case 0x09:
      case 0x0a: {
        const [x, y] = this.map(a[0], a[1]);
        return this.add(code === 0x09 ? { k: 'circle', x, y, r: a[2], fill: color(a[3]) } : { k: 'circle', x, y, r: a[2], stroke: color(a[3]) });
      }
      case 0x0b:
      case 0x0c: {
        const pts = [0, 2, 4].flatMap((i) => this.map(a[i], a[i + 1]));
        return this.add(code === 0x0b ? { k: 'poly', pts, fill: color(a[6]) } : { k: 'poly', pts, stroke: color(a[6]) });
      }
      case 0x0d: {
        const [x, y] = this.map(a[0], a[1]);
        return this.add({ k: 'rect', x, y, w: 1, h: 1, r: 0, fill: color(a[2]) });
      }
      case 0x0e:
        return this.char(a);
      case 0x0f:
        this.led = a[0] || a[1] || a[2] ? `rgb(${a[0] & 255},${a[1] & 255},${a[2] & 255})` : '';
        this.dirty = true;
        if (!this.buffering) this.commit();
        return;
      case 0x10:
        this.buffering = true;
        return;
      case 0x11:
        this.buffering = false;
        this.commit();
        return;
      case 0x20:
        this.latchTouch();
        return;
    }
  }

  /** Un carácter de la fuente 5×7 de Adafruit GFX (celda 6×8). Se une al texto de al lado. */
  private char(a: number[]) {
    const [x0, y0, size, fg, bg, opaque, code] = a;
    const ch = String.fromCharCode(code & 255);
    const s = Math.max(1, size);
    const [x, y] = this.map(x0, y0);
    const rot = this.rotation === 0 ? 3 : this.rotation === 2 ? 1 : this.rotation === 3 ? 2 : 0;
    const op: ShieldOp = { k: 'text', x, y, size: s, color: rgb565(fg & 0xffff), bg: opaque ? rgb565(bg & 0xffff) : undefined, text: ch, rot };
    const last = this.ops[this.ops.length - 1];
    if (rot === 0 && last?.k === 'text' && last.rot === 0 && last.size === s && last.color === op.color && last.bg === op.bg && last.y === y && last.x + 6 * s * last.text.length === x) {
      last.text += ch;
      this.dirty = true;
      if (!this.buffering) this.commit();
      return;
    }
    this.add(op);
  }

  private add(op: ShieldOp) {
    // Un relleno opaco descarta lo que tapa por completo: la escena no crece al redibujar.
    if ((op.k === 'rect' && op.fill && !op.r) || (op.k === 'text' && op.bg)) {
      const [x1, y1, x2, y2] = box(op);
      this.ops = this.ops.filter((o) => {
        const [a1, b1, a2, b2] = box(o);
        return !(a1 >= x1 && b1 >= y1 && a2 <= x2 && b2 <= y2);
      });
    }
    this.ops.push(op);
    if (this.ops.length > MAX_OPS) this.ops.splice(0, this.ops.length - MAX_OPS);
    this.dirty = true;
    if (!this.buffering) this.commit();
  }

  private commit() {
    if (!this.dirty && this.scene !== '[]') return;
    this.scene = JSON.stringify(this.ops);
    this.dirty = false;
  }

  /** Toque en coordenadas de la escena apaisada; `down` = dedo apoyado. */
  setTouch(x: number, y: number, down: boolean) {
    this.touch = { x: Math.max(0, Math.min(SCREEN_W - 1, x)), y: Math.max(0, Math.min(SCREEN_H - 1, y)), down };
  }

  /**
   * Informe táctil como el del GT911: coordenadas del panel en vertical (480 × 800).
   * Con setRotation(1) el sketch las pasa a la pantalla con x = punto.y, y = 479 − punto.x.
   */
  private latchTouch() {
    if (!this.touch.down) {
      this.report = [0];
      return;
    }
    const nx = NATIVE_W - 1 - this.touch.y;
    const ny = this.touch.x;
    this.report = [1, nx & 255, nx >> 8, ny & 255, ny >> 8];
  }
}
