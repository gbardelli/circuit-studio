/** NX3224T028 drawing-command subset and documented UART touch packets. */
export type ScreenOp =
  | {
      kind: "fill" | "draw";
      x: number;
      y: number;
      w: number;
      h: number;
      color: string;
    }
  | {
      kind: "line";
      x: number;
      y: number;
      x2: number;
      y2: number;
      color: string;
    }
  | {
      kind: "text";
      x: number;
      y: number;
      w: number;
      h: number;
      font: number;
      color: string;
      background: string;
      align: number;
      valign: number;
      opaque: boolean;
      text: string;
    };

const COLORS: Record<string, number> = {
  BLACK: 0,
  BLUE: 31,
  BROWN: 48192,
  GREEN: 2016,
  YELLOW: 65504,
  RED: 63488,
  GRAY: 33840,
  WHITE: 65535,
};
export function rgb565(value: string | number) {
  const n =
    typeof value === "number" ? value : (COLORS[value] ?? Number(value));
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error("color");
  return `rgb(${Math.round((((n >> 11) & 31) * 255) / 31)},${Math.round((((n >> 5) & 63) * 255) / 63)},${Math.round(((n & 31) * 255) / 31)})`;
}
export class Nextion {
  powered = false;
  scene = "[]";
  brightness = 100;
  baud = 9600;
  error = "";
  private buffer: number[] = [];
  private outgoing: number[] = [];
  private ops: ScreenOp[] = [];
  private end = 0;
  private overflow = false;
  private sendxy = false;
  private bkcmd = 2;
  private page = 0;

  power(on: boolean) {
    if (on === this.powered) return;
    this.powered = on;
    this.ops = [];
    this.scene = "[]";
    this.buffer = [];
    this.outgoing = [];
    this.end = 0;
    this.overflow = false;
    this.sendxy = false;
    this.bkcmd = 2;
    this.baud = 9600;
    this.brightness = 100;
    this.error = "";
    this.page = 0;
  }
  drain() {
    const bytes = this.outgoing;
    this.outgoing = [];
    return bytes;
  }
  private packet(bytes: number[]) {
    if (this.outgoing.length + bytes.length + 3 <= 4096)
      this.outgoing.push(...bytes, 255, 255, 255);
  }
  touch(x: number, y: number, pressed: boolean) {
    if (!this.powered || !this.sendxy || x < 0 || x >= 320 || y < 0 || y >= 240)
      return;
    x = Math.floor(x);
    y = Math.floor(y);
    this.packet([0x67, x >> 8, x & 255, y >> 8, y & 255, pressed ? 1 : 0]);
  }
  receive(value: number) {
    if (!this.powered) return;
    if (value === 255) {
      if (++this.end === 3) {
        if (this.overflow) this.result(false, 0x24);
        else if (this.buffer.length)
          this.command(String.fromCharCode(...this.buffer));
        this.buffer = [];
        this.end = 0;
        this.overflow = false;
      }
      return;
    }
    while (this.end-- > 0 && !this.overflow) this.buffer.push(255);
    this.end = 0;
    if (this.buffer.length >= 1024) {
      this.overflow = true;
      this.buffer = [];
    }
    if (!this.overflow) this.buffer.push(value & 255);
  }
  private result(ok: boolean, code = 0x1a) {
    if (this.bkcmd === 3 || this.bkcmd === (ok ? 1 : 2))
      this.packet([ok ? 1 : code]);
  }
  private add(op: ScreenOp) {
    if (op.kind === "fill" || (op.kind === "text" && op.opaque))
      this.ops = this.ops.filter((old) => {
        // Un relleno opaco tapa también las líneas que caen dentro: en la pantalla real ya no se ven.
        if (old.kind === "line")
          return !(
            Math.min(old.x, old.x2) >= op.x &&
            Math.min(old.y, old.y2) >= op.y &&
            Math.max(old.x, old.x2) <= op.x + op.w &&
            Math.max(old.y, old.y2) <= op.y + op.h
          );
        return !(
          old.x >= op.x &&
          old.y >= op.y &&
          old.x + old.w <= op.x + op.w &&
          old.y + old.h <= op.y + op.h
        );
      });
    // Preserve the drawing; reject overflow rather than silently erase previous primitives.
    if (this.ops.length >= 512) throw new Error("drawing buffer");
    this.ops.push(op);
    this.scene = JSON.stringify(this.ops);
  }
  private command(command: string) {
    this.error = "";
    try {
      const assign = /^(sendxy|bkcmd|dim|baud)=(\d+)$/.exec(command);
      if (assign) {
        const value = Number(assign[2]);
        switch (assign[1]) {
          case "sendxy":
            if (value > 1) throw new Error("sendxy");
            this.sendxy = Boolean(value);
            break;
          case "bkcmd":
            if (value > 3) throw new Error("bkcmd");
            this.bkcmd = value;
            break;
          case "dim":
            if (value > 100) throw new Error("dim");
            this.brightness = value;
            break;
          case "baud":
            if (
              ![2400, 4800, 9600, 19200, 38400, 57600, 115200].includes(value)
            )
              throw new Error("baud");
            this.baud = value;
            break;
        }
        this.result(true);
        return;
      }
      if (command === "sendme") {
        this.packet([0x66, this.page]);
        return;
      }
      if (command.startsWith("get ")) {
        const key = command.slice(4),
          values: Record<string, number> = {
            sendxy: Number(this.sendxy),
            bkcmd: this.bkcmd,
            dim: this.brightness,
            baud: this.baud,
          };
        if (!(key in values)) throw new Error("attribute");
        const n = values[key];
        this.packet([
          0x71,
          n & 255,
          (n >> 8) & 255,
          (n >> 16) & 255,
          (n >> 24) & 255,
        ]);
        return;
      }
      const match = /^(cls|fill|draw|line|xstr) (.+)$/.exec(command);
      if (!match) {
        this.error = `Unsupported instruction: ${command.slice(0, 48)}`;
        this.result(false, 0);
        return;
      }
      const args =
        match[2].match(/"(?:[^"\\]|\\.)*"|[^,]+/g)?.map((s) => s.trim()) ?? [];
      const num = (i: number) => {
        const n = Number(args[i]);
        if (args[i] === undefined || !Number.isInteger(n) || n < 0 || n > 65535)
          throw new Error("number");
        return n;
      };
      switch (match[1]) {
        case "cls":
          if (args.length !== 1) throw new Error("arguments");
          this.ops = [];
          this.add({
            kind: "fill",
            x: 0,
            y: 0,
            w: 320,
            h: 240,
            color: rgb565(args[0]),
          });
          break;
        case "fill":
        case "draw": {
          if (args.length !== 5) throw new Error("arguments");
          const [x, y, a, b] = [num(0), num(1), num(2), num(3)];
          if (match[1] === "draw" && (a < x || b < y))
            throw new Error("bounds");
          this.add({
            kind: match[1],
            x,
            y,
            w: match[1] === "fill" ? a : a - x,
            h: match[1] === "fill" ? b : b - y,
            color: rgb565(args[4]),
          });
          break;
        }
        case "line":
          if (args.length !== 5) throw new Error("arguments");
          this.add({
            kind: "line",
            x: num(0),
            y: num(1),
            x2: num(2),
            y2: num(3),
            color: rgb565(args[4]),
          });
          break;
        case "xstr": {
          if (
            args.length !== 11 ||
            num(7) > 2 ||
            num(8) > 3 ||
            ![1, 3].includes(num(9)) ||
            !/^".*"$/.test(args[10] ?? "")
          )
            throw new Error("text arguments");
          const text = JSON.parse(args[10]) as string;
          this.add({
            kind: "text",
            x: num(0),
            y: num(1),
            w: num(2),
            h: num(3),
            font: num(4),
            color: rgb565(args[5]),
            background: rgb565(args[6]),
            align: num(7),
            valign: num(8),
            opaque: num(9) === 1,
            text,
          });
          break;
        }
      }
      this.result(true);
    } catch {
      this.error = `Invalid instruction: ${command.slice(0, 48)}`;
      this.result(false);
    }
  }
}
