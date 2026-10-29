// Daños por uso fuera de especificación, como en un banco real: un LED sin resistencia se
// quema, un electrolítico al revés revienta, una resistencia pequeña echa humo. Se evalúa con
// los valores medios que publica el motor y, una vez roto, el componente sigue roto hasta que
// se detiene la simulación. Es una indicación visual: el modelo eléctrico no cambia.
import { formatSI } from '../core/units';
import type { Props } from '../core/types';
import type { Visual } from '../parts/types';

export interface Damage {
  /** warn: fuera de lo recomendado; broken: el componente real ya se habría estropeado. */
  level: 'warn' | 'broken';
  /** burn: se quema y ennegrece; burst: revienta (electrolíticos); heat: se calienta. */
  effect: 'burn' | 'burst' | 'heat';
  title: string;
  reason: string;
  fix?: string;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const A = (i: number) => formatSI(Math.abs(i), 'A');
const V = (v: number) => formatSI(Math.abs(v), 'V');
const W = (p: number) => formatSI(p, 'W');

function ledRule(i: number, what = 'el LED'): Damage | null {
  if (i >= 0.06)
    return { level: 'broken', effect: 'burn', title: 'LED quemado', reason: `Por ${what} pasan ${A(i)} y aguanta 20 mA como máximo.`, fix: 'Pon una resistencia en serie: 220–330 Ω con 5 V.' };
  if (i > 0.03)
    return { level: 'warn', effect: 'heat', title: 'Demasiada corriente', reason: `Por ${what} pasan ${A(i)}; lo recomendado son 20 mA.`, fix: 'Aumenta la resistencia en serie.' };
  return null;
}

/** El peor de varios canales (segmentos de un display, colores de un LED RGB). */
function worst(list: (Damage | null)[]) {
  return list.find((d) => d?.level === 'broken') ?? list.find(Boolean) ?? null;
}

const RULES: Record<string, (props: Props, v: Visual) => Damage | null> = {
  led: (_p, v) => ledRule(n(v.i)),
  'rgb-led': (_p, v) => worst([ledRule(n(v.r), 'el rojo'), ledRule(n(v.g), 'el verde'), ledRule(n(v.b), 'el azul')]),
  'seven-segment': (_p, v) => worst('abcdefg'.split('').map((s) => ledRule(n(v[s]), `el segmento ${s}`)).concat(ledRule(n(v.dp), 'el punto'))),
  'led-bar-10': (_p, v) => worst(Array.from({ length: 10 }, (_, k) => ledRule(n(v[`i${k}`]), `el segmento ${k + 1}`))),

  resistor(p, v) {
    const rating = n(p.power) || 0.25;
    const pw = n(v.p);
    if (pw > rating * 2)
      return { level: 'broken', effect: 'burn', title: 'Resistencia quemada', reason: `Disipa ${W(pw)} y es de ${W(rating)}.`, fix: 'Usa una resistencia mayor o de más potencia.' };
    if (pw > rating) return { level: 'warn', effect: 'heat', title: 'Se calienta demasiado', reason: `Disipa ${W(pw)} y es de ${W(rating)}.`, fix: 'Usa una de más potencia.' };
    return null;
  },

  capacitor(p, v) {
    const volts = n(v.v);
    const rated = n(p.voltage) || 16;
    if (volts < -1)
      return { level: 'broken', effect: 'burst', title: 'Condensador reventado', reason: `Está al revés: la patilla negativa (la de la franja) recibe ${V(volts)} más que la positiva.`, fix: 'Gíralo: la franja va hacia el lado de menor tensión.' };
    if (volts > rated * 1.1)
      return { level: 'broken', effect: 'burst', title: 'Condensador reventado', reason: `Recibe ${V(volts)} y aguanta ${V(rated)}.`, fix: 'Usa uno de mayor tensión nominal (al menos 1,5 veces la del circuito).' };
    if (volts < -0.3) return { level: 'warn', effect: 'heat', title: 'Polaridad invertida', reason: `La patilla negativa está ${V(volts)} por encima de la positiva.`, fix: 'Gíralo antes de subir la tensión.' };
    if (volts > rated * 0.9) return { level: 'warn', effect: 'heat', title: 'Al límite de tensión', reason: `Recibe ${V(volts)} de ${V(rated)} nominales.` };
    return null;
  },

  'battery-9v': (_p, v) => shortRule(n(v.i), 1),
  'aa-pack': (_p, v) => shortRule(n(v.i), 2),

  npn(_p, v) {
    const ic = Math.abs(n(v.ic));
    if (ic > 1.2) return { level: 'broken', effect: 'burn', title: 'Transistor quemado', reason: `Por el colector pasan ${A(ic)} y el 2N2222 aguanta 600 mA.`, fix: 'Añade una resistencia en el colector o usa un MOSFET.' };
    if (ic > 0.6) return { level: 'warn', effect: 'heat', title: 'Transistor al límite', reason: `Por el colector pasan ${A(ic)}; el máximo son 600 mA.` };
    return null;
  },

  diode(_p, v) {
    const i = n(v.i);
    if (i > 3) return { level: 'broken', effect: 'burn', title: 'Diodo quemado', reason: `Conduce ${A(i)} y el 1N4007 aguanta 1 A.` };
    if (i > 1) return { level: 'warn', effect: 'heat', title: 'Diodo al límite', reason: `Conduce ${A(i)}; el máximo continuo es 1 A.` };
    return null;
  },

  multimeter(p, v) {
    const i = Math.abs(n(v.i));
    if (p.mode === 'A' && i > 10)
      return { level: 'broken', effect: 'burn', title: 'Fusible fundido', reason: `Mide ${A(i)} y la escala de corriente admite 10 A.`, fix: 'Para medir tensión, pon el multímetro en V y conéctalo en paralelo.' };
    return null;
  },
};

function shortRule(i: number, limit: number): Damage | null {
  if (Math.abs(i) > limit)
    return { level: 'warn', effect: 'heat', title: 'Cortocircuito', reason: `La pila entrega ${A(i)}: se calienta y se agota en minutos.`, fix: 'Busca un cable o un pulsador que una + y − sin carga en medio.' };
  return null;
}

export function assessDamage(type: string, props: Props, visual: Visual | null): Damage | null {
  if (!visual) return null;
  return RULES[type.replace(/^sch:/, '')]?.(props, visual) ?? null;
}

// ── Estado durante la simulación ────────────────────────────────────────────────
const broken = new Map<string, Damage>();
const current = new Map<string, Damage>();

/** Registra la evaluación de este instante; devuelve lo que hay que mostrar. */
export function trackDamage(id: string, now: Damage | null): { damage: Damage | null; fresh: boolean } {
  const latched = broken.get(id);
  if (latched) return { damage: latched, fresh: false };
  if (now?.level === 'broken') {
    broken.set(id, now);
    current.delete(id);
    return { damage: now, fresh: true };
  }
  if (now) current.set(id, now);
  else current.delete(id);
  return { damage: now, fresh: false };
}

export function damageOf(id: string): Damage | null {
  return broken.get(id) ?? current.get(id) ?? null;
}

export function clearDamage(id?: string) {
  if (id === undefined) {
    broken.clear();
    current.clear();
  } else {
    broken.delete(id);
    current.delete(id);
  }
}
