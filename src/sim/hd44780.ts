// Controlador HD44780 (pantallas de caracteres 16×2) a nivel de bus: se alimenta con cada
// flanco de bajada de E y reproduce los comandos que usa la librería LiquidCrystal,
// incluido el arranque en 8 bits y el paso a 4 bits.
const COLS = 40;

export class Hd44780 {
  private ddram = new Uint8Array(0x80).fill(0x20);
  private addr = 0;
  private cgram = false;
  private eightBit = true;
  private pendingHigh: number | null = null;
  private increment = true;
  private shift = 0;
  displayOn = false;
  version = 0;

  /** Flanco de bajada de E con RS y el byte de D7…D0 en ese instante. */
  strobe(rs: boolean, data: number) {
    if (this.eightBit) return this.execute(rs, data & 0xff);
    const nibble = (data >> 4) & 0x0f;
    if (this.pendingHigh === null) {
      this.pendingHigh = nibble;
      return;
    }
    const byte = (this.pendingHigh << 4) | nibble;
    this.pendingHigh = null;
    this.execute(rs, byte);
  }

  private execute(rs: boolean, b: number) {
    this.version++;
    if (rs) {
      if (this.cgram) return; // caracteres propios: se aceptan pero no se dibujan
      this.ddram[this.addr] = b;
      this.move(this.increment ? 1 : -1);
      return;
    }
    if (b & 0x80) {
      this.addr = b & 0x7f;
      this.cgram = false;
    } else if (b & 0x40) {
      this.cgram = true;
    } else if (b & 0x20) {
      this.eightBit = (b & 0x10) !== 0;
      this.pendingHigh = null;
    } else if (b & 0x10) {
      const right = (b & 0x04) !== 0;
      if (b & 0x08) this.shift += right ? 1 : -1;
      else this.move(right ? 1 : -1);
    } else if (b & 0x08) {
      this.displayOn = (b & 0x04) !== 0;
    } else if (b & 0x04) {
      this.increment = (b & 0x02) !== 0;
    } else if (b & 0x02) {
      this.addr = 0;
      this.shift = 0;
    } else if (b & 0x01) {
      this.ddram.fill(0x20);
      this.addr = 0;
      this.shift = 0;
      this.increment = true;
    }
  }

  /** La dirección recorre 0x00–0x27 (línea 1) y 0x40–0x67 (línea 2), saltando entre ellas. */
  private move(step: number) {
    const line = this.addr >= 0x40 ? 1 : 0;
    let col = (this.addr & 0x3f) + step;
    let next = line;
    if (col >= COLS) {
      col = 0;
      next = line ^ 1;
    } else if (col < 0) {
      col = COLS - 1;
      next = line ^ 1;
    }
    this.addr = next * 0x40 + col;
  }

  line(row: 0 | 1): string {
    let out = '';
    for (let c = 0; c < 16; c++) {
      const col = (((c - this.shift) % COLS) + COLS) % COLS;
      const code = this.ddram[row * 0x40 + col];
      out += code === 0xdf ? '°' : code < 8 ? '▮' : code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : ' ';
    }
    return out;
  }
}
