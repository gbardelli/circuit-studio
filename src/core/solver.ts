// Análisis nodal modificado (MNA) con Newton-Raphson para dispositivos no lineales y
// Euler implícito para condensadores. Las fuentes se modelan como equivalentes de Norton
// (siempre con resistencia interna), así la matriz solo tiene incógnitas de nodo.

export const VT = 0.025852; // tensión térmica a 300 K
const GMIN = 1e-12;

export class Stamper {
  G: Float64Array;
  b: Float64Array;
  /** Algún dispositivo limitó su paso: la iteración aún no puede darse por convergida. */
  limited = false;
  constructor(readonly n: number, public v: Float64Array, public dt: number) {
    this.G = new Float64Array(n * n);
    this.b = new Float64Array(n);
  }
  volt(node: number) {
    return node < 0 ? 0 : this.v[node];
  }
  conductance(a: number, k: number, g: number) {
    const n = this.n;
    if (a >= 0) this.G[a * n + a] += g;
    if (k >= 0) this.G[k * n + k] += g;
    if (a >= 0 && k >= 0) {
      this.G[a * n + k] -= g;
      this.G[k * n + a] -= g;
    }
  }
  /** Corriente i que sale del nodo a, atraviesa el elemento y entra en k. */
  current(a: number, k: number, i: number) {
    if (a >= 0) this.b[a] -= i;
    if (k >= 0) this.b[k] += i;
  }
  /** Entrada de jacobiano: derivada de la corriente que sale de `row` respecto a la tensión de `col`. */
  jac(row: number, col: number, g: number) {
    if (row >= 0 && col >= 0) this.G[row * this.n + col] += g;
  }
  rhs(row: number, value: number) {
    if (row >= 0) this.b[row] += value;
  }
}

export interface Element {
  nonlinear?: boolean;
  stamp(s: Stamper): void;
  /** Tras converger un paso transitorio (historia de condensadores). */
  accept?(v: Float64Array): void;
  reset?(): void;
}

const volt = (v: Float64Array, node: number) => (node < 0 ? 0 : v[node]);

export class Resistor implements Element {
  constructor(public a: number, public b: number, public r: () => number) {}
  stamp(s: Stamper) {
    s.conductance(this.a, this.b, 1 / Math.max(this.r(), 1e-6));
  }
  currentOf(v: Float64Array) {
    return (volt(v, this.a) - volt(v, this.b)) / Math.max(this.r(), 1e-6);
  }
}

/** Fuente de tensión con resistencia interna (Norton). */
export class VSource implements Element {
  constructor(public p: number, public n: number, public volts: () => number, public rint: () => number) {}
  stamp(s: Stamper) {
    const r = Math.max(this.rint(), 1e-4);
    s.conductance(this.p, this.n, 1 / r);
    const i = this.volts() / r;
    s.rhs(this.p, i);
    s.rhs(this.n, -i);
  }
  /** Corriente entregada por el terminal positivo. */
  currentOf(v: Float64Array) {
    const r = Math.max(this.rint(), 1e-4);
    return (this.volts() - (volt(v, this.p) - volt(v, this.n))) / r;
  }
}

export class Capacitor implements Element {
  private vPrev = 0;
  constructor(public a: number, public b: number, public c: () => number) {}
  stamp(s: Stamper) {
    if (!(s.dt > 0)) return; // punto de operación: circuito abierto
    const g = this.c() / s.dt;
    s.conductance(this.a, this.b, g);
    s.rhs(this.a, g * this.vPrev);
    s.rhs(this.b, -g * this.vPrev);
  }
  accept(v: Float64Array) {
    this.vPrev = volt(v, this.a) - volt(v, this.b);
  }
  reset() {
    this.vPrev = 0;
  }
  voltage() {
    return this.vPrev;
  }
}

/** Limitación de paso en uniones pn (algoritmo de SPICE). */
export function pnjlim(vnew: number, vold: number, vt: number, vcrit: number) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}

export class Diode implements Element {
  nonlinear = true;
  private vd = 0;
  constructor(public a: number, public k: number, public is: number, public n: number) {}
  private get nvt() {
    return this.n * VT;
  }
  stamp(s: Stamper) {
    const nvt = this.nvt;
    const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * this.is));
    const raw = s.volt(this.a) - s.volt(this.k);
    const vd = pnjlim(raw, this.vd, nvt, vcrit);
    if (Math.abs(vd - raw) > 1e-9) s.limited = true;
    this.vd = vd;
    const e = Math.exp(Math.min(vd / nvt, 80));
    const id = this.is * (e - 1);
    const gd = (this.is * e) / nvt + GMIN;
    s.conductance(this.a, this.k, gd);
    s.current(this.a, this.k, id - gd * vd);
  }
  reset() {
    this.vd = 0;
  }
  currentOf(v: Float64Array) {
    const vd = volt(v, this.a) - volt(v, this.k);
    return this.is * (Math.exp(Math.min(vd / this.nvt, 80)) - 1);
  }
}

/** Transistor NPN, modelo de Ebers-Moll de transporte. */
export class NPN implements Element {
  nonlinear = true;
  private vbe = 0;
  private vbc = 0;
  constructor(public c: number, public b: number, public e: number, public is = 1e-14, public bf = 150, public br = 5) {}
  stamp(s: Stamper) {
    const vcrit = VT * Math.log(VT / (Math.SQRT2 * this.is));
    const rawBe = s.volt(this.b) - s.volt(this.e);
    const rawBc = s.volt(this.b) - s.volt(this.c);
    const vbe = (this.vbe = pnjlim(rawBe, this.vbe, VT, vcrit));
    const vbc = (this.vbc = pnjlim(rawBc, this.vbc, VT, vcrit));
    if (Math.abs(vbe - rawBe) > 1e-9 || Math.abs(vbc - rawBc) > 1e-9) s.limited = true;
    const ef = Math.exp(Math.min(vbe / VT, 80));
    const er = Math.exp(Math.min(vbc / VT, 80));
    const iF = this.is * (ef - 1);
    const iR = this.is * (er - 1);
    const gF = (this.is * ef) / VT + GMIN;
    const gR = (this.is * er) / VT + GMIN;
    // Corrientes que entran al dispositivo por colector y base.
    const ic = iF - iR - iR / this.br;
    const ib = iF / this.bf + iR / this.br;
    // Derivadas respecto a vbe y vbc.
    const dic_dvbe = gF;
    const dic_dvbc = -gR - gR / this.br;
    const dib_dvbe = gF / this.bf;
    const dib_dvbc = gR / this.br;
    const { c, b, e } = this;
    // vbe = vb - ve, vbc = vb - vc
    const terms: [number, number, number][] = [
      [c, dic_dvbe, dic_dvbc],
      [b, dib_dvbe, dib_dvbc],
    ];
    for (const [row, dbe, dbc] of terms) {
      const i0 = row === c ? ic : ib;
      // ∂I/∂vb = dbe + dbc, ∂I/∂ve = -dbe, ∂I/∂vc = -dbc
      s.jac(row, b, dbe + dbc);
      s.jac(row, e, -dbe);
      s.jac(row, c, -dbc);
      s.rhs(row, -(i0 - dbe * vbe - dbc * vbc));
      // El emisor recibe la suma con signo opuesto.
      s.jac(e, b, -(dbe + dbc));
      s.jac(e, e, dbe);
      s.jac(e, c, dbc);
      s.rhs(e, i0 - dbe * vbe - dbc * vbc);
    }
  }
  reset() {
    this.vbe = 0;
    this.vbc = 0;
  }
  currents(v: Float64Array) {
    const vbe = volt(v, this.b) - volt(v, this.e);
    const vbc = volt(v, this.b) - volt(v, this.c);
    const iF = this.is * (Math.exp(Math.min(vbe / VT, 80)) - 1);
    const iR = this.is * (Math.exp(Math.min(vbc / VT, 80)) - 1);
    return { ic: iF - iR - iR / this.br, ib: iF / this.bf + iR / this.br };
  }
}

export interface SolveResult {
  v: Float64Array;
  converged: boolean;
  iterations: number;
}

/** Resuelve G·x = b in situ (eliminación gaussiana con pivoteo parcial). */
export function solveLinear(G: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const x = new Float64Array(n);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let max = Math.abs(G[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(G[r * n + col]);
      if (val > max) {
        max = val;
        piv = r;
      }
    }
    if (max < 1e-300) return null;
    if (piv !== col) {
      for (let k = 0; k < n; k++) {
        const t = G[col * n + k];
        G[col * n + k] = G[piv * n + k];
        G[piv * n + k] = t;
      }
      const t = b[col];
      b[col] = b[piv];
      b[piv] = t;
    }
    const d = G[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = G[r * n + col] / d;
      if (f === 0) continue;
      for (let k = col; k < n; k++) G[r * n + k] -= f * G[col * n + k];
      b[r] -= f * b[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let k = r + 1; k < n; k++) sum -= G[r * n + k] * x[k];
    x[r] = sum / G[r * n + r];
  }
  return x;
}

export class Circuit {
  v: Float64Array;
  constructor(readonly nodeCount: number, readonly elements: Element[]) {
    this.v = new Float64Array(nodeCount);
  }

  reset() {
    this.v.fill(0);
    for (const e of this.elements) e.reset?.();
  }

  /** dt = 0 → punto de operación; dt > 0 → paso transitorio. */
  solve(dt: number, maxIter = 120): SolveResult {
    const n = this.nodeCount;
    if (n === 0) return { v: this.v, converged: true, iterations: 0 };
    const nonlinear = this.elements.some((e) => e.nonlinear);
    let v = this.v;
    for (let it = 1; it <= maxIter; it++) {
      const s = new Stamper(n, v, dt);
      for (let i = 0; i < n; i++) s.G[i * n + i] += GMIN;
      for (const e of this.elements) e.stamp(s);
      const x = solveLinear(s.G, s.b, n);
      if (!x) return { v, converged: false, iterations: it };
      let done = true;
      for (let i = 0; i < n; i++) {
        if (Math.abs(x[i] - v[i]) > 1e-6 + 1e-4 * Math.abs(x[i])) {
          done = false;
          break;
        }
      }
      v = x;
      if (!nonlinear || (done && !s.limited && it > 1)) {
        this.v = v;
        for (const e of this.elements) e.accept?.(v);
        return { v, converged: true, iterations: it };
      }
    }
    this.v = v;
    for (const e of this.elements) e.accept?.(v);
    return { v, converged: false, iterations: maxIter };
  }
}
