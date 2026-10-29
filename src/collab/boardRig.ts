import { PARTS } from "../parts";
import { toWorld, type Props, type Rotation } from "../core/types";
import type { Template, TemplatePart, TemplateWire } from "./templates";

export type Ref = [string, string];
export class BoardRig {
  parts: TemplatePart[] = [];
  wires: TemplateWire[] = [];
  private occupied = new Set<string>();
  private mounted = new Map<string, { board: string; group: string[] }>();
  private boards = new Map<string, Map<string, string[]>>();

  board(key: string, x: number, y: number, type = "breadboard-full") {
    this.loose(key, type, x, y);
    const def = PARTS[type];
    const groups = new Map<string, string[]>();
    for (const group of def.internal!(def.defaults))
      for (const pin of group) groups.set(pin, group);
    this.boards.set(key, groups);
  }
  loose(
    key: string,
    type: string,
    x: number,
    y: number,
    props: Props = {},
    rot: Rotation = 0,
  ) {
    this.parts.push({ key, type, x, y, props, rot });
  }
  put(
    key: string,
    type: string,
    board: string,
    hole: string,
    props: Props = {},
    rot: Rotation = 0,
  ) {
    const b = this.parts.find((part) => part.key === board)!;
    const def = PARTS[b.type];
    const sockets = def.pins(def.defaults);
    const start = sockets.find((pin) => pin.id === hole)!;
    if (!start) throw new Error(`Unknown socket ${board}.${hole}`);
    this.loose(key, type, b.x + start.x, b.y + start.y, props, rot);
    const p = this.parts.at(-1)!;
    for (const pin of PARTS[type].pins({ ...PARTS[type].defaults, ...props })) {
      const at = toWorld({ ...p, rot }, pin);
      const socket = sockets.find(
        (candidate) => b.x + candidate.x === at.x && b.y + candidate.y === at.y,
      );
      if (!socket)
        throw new Error(`Part ${key}.${pin.id} misses the breadboard`);
      const occupied = `${board}.${socket.id}`;
      if (this.occupied.has(occupied))
        throw new Error(`Occupied socket ${occupied}`);
      this.occupied.add(occupied);
      this.mounted.set(`${key}.${pin.id}`, {
        board,
        group: this.boards.get(board)!.get(socket.id)!,
      });
    }
  }
  dip(key: string, type: string, board: string, col: number, label?: string) {
    this.put(key, type, board, `e${col}`, label ? { label } : {});
  }
  private end(ref: Ref): Ref {
    const mounted = this.mounted.get(`${ref[0]}.${ref[1]}`);
    if (!mounted) {
      if (this.boards.has(ref[0])) {
        const id = `${ref[0]}.${ref[1]}`;
        if (this.occupied.has(id))
          throw new Error(`Wire uses occupied socket ${id}`);
        this.occupied.add(id);
      }
      return ref;
    }
    const socket = mounted.group.find(
      (pin) => !this.occupied.has(`${mounted.board}.${pin}`),
    );
    if (!socket) throw new Error(`No free socket for ${ref[0]}.${ref[1]}`);
    this.occupied.add(`${mounted.board}.${socket}`);
    return [mounted.board, socket];
  }
  wire(a: Ref, b: Ref, color = "#6c9de8", lane?: number) {
    const aa = this.end(a),
      bb = this.end(b);
    const points =
      lane === undefined
        ? undefined
        : [
            { x: this.position(aa).x, y: lane },
            { x: this.position(bb).x, y: lane },
          ];
    this.wires.push({ a: aa, b: bb, color, points });
  }
  private position(ref: Ref) {
    const part = this.parts.find((part) => part.key === ref[0])!;
    const pin = PARTS[part.type]
      .pins({ ...PARTS[part.type].defaults, ...part.props })
      .find((pin) => pin.id === ref[1])!;
    return toWorld({ ...part, rot: part.rot ?? 0 }, pin);
  }
  rail(board: string, plus: boolean): Ref {
    const group = this.boards.get(board)!.get(plus ? "tp1" : "tn1")!;
    const pin = group.find((pin) => !this.occupied.has(`${board}.${pin}`));
    if (!pin) throw new Error(`Power rail full on ${board}`);
    return [board, pin];
  }
  power(ref: Ref, board: string, plus: boolean) {
    this.wire(ref, this.rail(board, plus), plus ? "#e5484d" : "#34383d");
  }
  template(meta: Omit<Template, "parts" | "wires">): Template {
    return { ...meta, parts: this.parts, wires: this.wires };
  }
}
