import { describe, expect, it } from 'vitest';
import { elevatorClassTemplate } from '../collab/elevatorClass';
import { templateSnapshot } from '../collab/applyTemplate';
import { compileSketch } from '../../server/compile';
import { ELEVATOR_CLASS_GIGA } from '../collab/elevatorClassSketch';
import { SimEngine } from './engine';
import { buildNetlist, pinKey } from '../core/netlist';
import { PARTS } from '../parts';
import { findTemplate } from '../collab/applyTemplate';
import { TEMPLATES } from '../collab/templates';

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const DIGITS: Record<string, number> = { abcdef: 0, bc: 1, abdeg: 2, abcdg: 3, bcfg: 4 };

function fixture(hex?: string) {
  const snapshot = templateSnapshot(elevatorClassTemplate());
  const engine = new SimEngine();
  engine.update(snapshot);
  if (hex) engine.setProgram('giga', hex);
  engine.start({ manual: true });
  const tick = (s = 0.11) => {
    for (let t = 0; t < s - 1e-9; t += 0.1) engine.tick(Math.min(0.1, s - t));
    expect(engine.status.converged).toBe(true);
  };
  const bit = (part: string, pin: string) => engine.voltageAt(part, pin)! > 2.5;
  const value = (id: string) => [1, 2, 3].reduce((v, n) => v | (bit(id, `${n}Q`) ? 1 << (n - 1) : 0), 0);
  const digit = (display: string) => {
    const v = engine.getVisual(display);
    const on = SEGMENTS.filter((s) => Number(v?.[s] ?? 0) > 0.0002).join('');
    return on === '' ? null : (DIGITS[on] ?? on);
  };
  const floor = (n: number) => {
    const sp = snapshot.parts.find((p) => p.id === 'sp')!;
    sp.props = { ...sp.props, s1: false, s2: false, s3: false, s4: false };
    engine.update({ ...snapshot, parts: [...snapshot.parts] });
    tick(0.002);
    sp.props = { ...sp.props, s1: n === 1, s2: n === 2, s3: n === 3, s4: n === 4 };
    engine.update({ ...snapshot, parts: [...snapshot.parts] });
    tick();
  };
  const press = (id: string) => {
    engine.setInput(id, 'pressed', true);
    tick();
    engine.setInput(id, 'pressed', false);
    tick();
  };
  return { engine, snapshot, tick, bit, value, digit, floor, press };
}

describe('ascensor de clase (LS75 / LS85 / LS48 + HC, 5 V)', () => {
  it('se arma y todo converge', () => {
    const h = fixture();
    h.tick();
    expect(h.snapshot.parts.filter((p) => p.type === 'breadboard-full')).toHaveLength(4);
    // Los dos TXS0108E van encajados en la placa 4, no sueltos: cada patilla cae en un agujero.
    const nets = buildNetlist(h.snapshot, PARTS);
    for (const id of ['txs1', 'txs2']) for (const pin of ['VA', 'VB', 'GND', 'OE', 'A1', 'B8']) expect(nets.inserted.has(pinKey(id, pin)), `${id}.${pin}`).toBe(true);
    // Pull-up de 4,7 kΩ en cada salida del LS85 (y en ninguna de sus entradas).
    const netOf = (part: string, pin: string) => nets.netOf.get(pinKey(part, pin));
    const pulled = new Set(h.snapshot.parts.filter((p) => p.type === 'resistor' && p.props.resistance === 4700).flatMap((p) => ['1', '2'].map((pin) => netOf(p.id, pin))));
    for (const pin of ['OAGTB', 'OAEQB', 'OALTB']) expect(pulled.has(netOf('u12', pin)), pin).toBe(true);
    for (const pin of ['A0', 'A1', 'B0', 'B1', 'B2']) expect(pulled.has(netOf('u12', pin)), pin).toBe(false);
    for (const pin of ['OAGTB', 'OAEQB', 'OALTB']) if (h.bit('u12', pin)) expect(h.engine.voltageAt('u12', pin)!, pin).toBeGreaterThan(3.5);
    h.engine.stop();
  });
  it('el display del piso actual sigue a los sensores y conserva el piso al soltarlos', () => {
    const h = fixture();
    for (let f = 1; f <= 4; f++) {
      h.floor(f);
      expect(h.value('u11'), `sensor ${f}`).toBe(f);
      expect(h.digit('seg3')).toBe(f);
    }
    h.floor(0);
    expect(h.value('u11'), 'sin sensor').toBe(4);
    expect(h.digit('seg3')).toBe(4);
    h.engine.stop();
  });
  it('un pulsador guarda el destino, ocupa el ascensor y el display lo muestra', () => {
    const h = fixture();
    h.floor(1);
    expect(h.digit('seg')).toBe(null);
    h.press('pp3');
    expect(h.value('u8')).toBe(3);
    expect(h.bit('u5', '1Q')).toBe(true);
    expect(h.digit('seg')).toBe(3);
    h.engine.stop();
  });
  const lit = (h: ReturnType<typeof fixture>, id: string) => Number(h.engine.getVisual(id)?.i ?? 0) > 0.0005;

  it('compara los doce pares de pisos distintos y enciende LS y LB', () => {
    for (let actual = 1; actual <= 4; actual++) for (let requested = 1; requested <= 4; requested++) {
      if (actual === requested) continue;
      const h = fixture();
      h.floor(actual);
      h.press(`pp${requested}`);
      expect(h.value('u8'), `${actual}→${requested}`).toBe(requested);
      expect(h.bit('u12', 'OAGTB')).toBe(actual > requested);
      expect(h.bit('u12', 'OAEQB')).toBe(false);
      expect(h.bit('u12', 'OALTB')).toBe(actual < requested);
      expect(lit(h, 'stop')).toBe(false);
      expect(h.bit('u5', '1Q')).toBe(true);
      expect(lit(h, 'ls')).toBe(actual < requested);
      expect(lit(h, 'lb')).toBe(actual > requested);
      h.engine.stop();
    }
  }, 120_000);

  it('PARAR se enciende al llegar y pedir el piso en que se está no deja el ascensor ocupado', () => {
    for (let f = 1; f <= 4; f++) {
      const h = fixture();
      h.floor(f);
      h.press(`pp${f}`);
      expect(h.bit('u5', '1Q'), `piso ${f}`).toBe(false);
      expect(h.digit('seg3')).toBe(f);
      h.engine.stop();
    }
  }, 120_000);

  it('bloquea otros pedidos en viaje, termina al llegar y acepta uno nuevo', () => {
    const h = fixture();
    h.floor(1);
    h.press('pp3');
    expect(h.value('u8')).toBe(3);
    h.press('pp2');
    expect(h.value('u8'), 'ocupado: ignora PP2').toBe(3);
    h.floor(0);
    h.floor(2);
    expect(h.bit('u5', '1Q'), 'pasa por el 2').toBe(true);
    expect(h.digit('seg3')).toBe(2);
    h.floor(0);
    h.floor(3);
    expect(h.bit('u5', '1Q'), 'llegó al 3').toBe(false);
    expect(h.digit('seg')).toBe(3);
    expect(h.digit('seg3')).toBe(3);
    h.press('pp1');
    expect(h.value('u8')).toBe(1);
    expect(lit(h, 'lb')).toBe(true);
    h.engine.stop();
  }, 120_000);

  it('codifica las 15 combinaciones de pulsadores con prioridad 4 > 3 > 2 > 1', () => {
    for (let mask = 1; mask < 16; mask++) {
      const h = fixture();
      const expected = [4, 3, 2, 1].find((f) => mask & (1 << (f - 1)))!;
      h.floor(expected === 1 ? 2 : 1); // un piso distinto del pedido: el viaje queda en marcha
      for (let f = 1; f <= 4; f++) if (mask & (1 << (f - 1))) h.engine.setInput(`pp${f}`, 'pressed', true);
      h.tick();
      for (let f = 1; f <= 4; f++) h.engine.setInput(`pp${f}`, 'pressed', false);
      h.tick();
      expect(h.value('u8'), `máscara ${mask.toString(2)}`).toBe(expected);
      h.engine.stop();
    }
  }, 120_000);

  it('el RESET apaga el display del destino y libera OCUPADO', () => {
    const h = fixture();
    h.floor(1);
    h.press('pp4');
    expect(h.digit('seg')).toBe(4);
    h.press('reset');
    expect(h.bit('u5', '1Q')).toBe(false);
    expect(h.digit('seg')).toBe(null);
    h.engine.stop();
  });

  it('los CI de 5 V ven 5 V y el GIGA nunca ve más de 3,3 V', () => {
    const h = fixture();
    h.floor(2);
    h.press('pp4');
    for (const p of h.snapshot.parts.filter((q) => /^(74|ne555)/.test(q.type))) {
      const v = h.engine.voltageAt(p.id, 'VCC')! - h.engine.voltageAt(p.id, 'GND')!;
      expect(v, p.id).toBeGreaterThan(4.75);
      expect(v, p.id).toBeLessThan(5.25);
    }
    for (const pin of ['D23', 'D25', 'D27', 'D29', 'D31', 'D33', 'D35']) expect(h.engine.voltageAt('giga', pin)!, pin).toBeLessThan(3.4);
    // Lo que sale de los LS75 hacia el adaptador llega al GIGA como 3,3 V (1 lógico) o 0 V.
    h.floor(0);
    h.floor(3);
    expect(h.engine.voltageAt('giga', 'D31')!).toBeGreaterThan(2.8); // piso 3 = 011
    expect(h.engine.voltageAt('giga', 'D33')!).toBeGreaterThan(2.8);
    expect(h.engine.voltageAt('giga', 'D35')!).toBeLessThan(0.5);
    h.engine.stop();
  });

  it('con varios sensores activos a la vez gana el más alto: el piso nunca pasa de 4', () => {
    const h = fixture();
    const sp = h.snapshot.parts.find((p) => p.id === 'sp')!;
    for (let mask = 1; mask < 16; mask++) {
      sp.props = { ...sp.props, s1: false, s2: false, s3: false, s4: false };
      h.engine.update({ ...h.snapshot, parts: [...h.snapshot.parts] });
      h.tick(0.002);
      sp.props = { ...sp.props, s1: !!(mask & 1), s2: !!(mask & 2), s3: !!(mask & 4), s4: !!(mask & 8) };
      h.engine.update({ ...h.snapshot, parts: [...h.snapshot.parts] });
      h.tick();
      const expected = [4, 3, 2, 1].find((f) => mask & (1 << (f - 1)))!;
      expect(h.value('u11'), `sensores ${mask.toString(2)}`).toBe(expected);
      expect(h.digit('seg3')).toBe(expected);
    }
    h.engine.stop();
  }, 120_000);

  it('el sketch compila; la pantalla llama al ascensor y el GIGA mueve la cabina hasta el destino', async () => {
    const compiled = await compileSketch(ELEVATOR_CLASS_GIGA, 'arduino:avr:mega:cpu=atmega2560');
    expect(compiled.ok, compiled.stderr).toBe(true);
    const h = fixture(compiled.hex!);
    h.tick(1);
    const scene = () => String(h.engine.getVisual('screen')?.scene);
    expect(scene()).toContain('ASCENSOR');
    expect(scene()).toContain('LLAMAR AL PISO');
    expect(h.value('u11'), 'arranca en el piso 1').toBe(1);
    expect(h.digit('seg3')).toBe(1);
    const tap = (x: number, y: number) => {
      h.engine.setInput('screen', 'touch', (1 << 20) | (x << 10) | y);
      h.tick(0.05);
      h.engine.setInput('screen', 'touch', (x << 10) | y);
      h.tick(0.3);
    };
    const callButton = (f: number) => tap(236 + (f - 1) * 131 + 60, 404);
    const waitIdle = () => {
      for (let i = 0; i < 200 && h.bit('u5', '1Q'); i++) h.tick(0.1);
      expect(h.bit('u5', '1Q')).toBe(false);
      h.tick(0.4);
    };
    // Llamada táctil al 4: sube tres pisos, pasa por 2 y 3 y se detiene en 4.
    callButton(4);
    expect(h.value('u8')).toBe(4);
    expect(h.digit('seg')).toBe(4);
    expect(h.bit('u5', '1Q')).toBe(true);
    expect(scene()).toContain('SUBIENDO');
    const seen = new Set<number>();
    for (let i = 0; i < 140 && h.bit('u5', '1Q'); i++) { h.tick(0.1); seen.add(h.value('u11')); }
    expect([...seen].filter((f) => f > 1)).toEqual([2, 3, 4]);
    waitIdle();
    expect(h.value('u11')).toBe(4);
    expect(h.digit('seg3')).toBe(4);
    // Pulsador azul de cabina al 2: baja.
    h.press('pp2');
    expect(h.value('u8')).toBe(2);
    expect(scene()).toContain('BAJANDO');
    waitIdle();
    expect(h.value('u11')).toBe(2);
    expect(h.digit('seg3')).toBe(2);
    expect(h.digit('seg')).toBe(2);
    expect(scene()).toContain('PISO 2');
    // En marcha, otras llamadas quedan bloqueadas.
    callButton(1);
    h.tick(0.3);
    callButton(3);
    expect(h.value('u8')).toBe(1);
    waitIdle();
    expect(h.value('u11')).toBe(1);
    for (const pin of ['D23', 'D25', 'D27', 'D29', 'D31', 'D33', 'D35', 'D37', 'D39', 'D41', 'D43', 'D45', 'D47', 'D49', 'D51']) expect(h.engine.voltageAt('giga', pin)!, pin).toBeLessThan(3.4);
    h.engine.stop();
  }, 180_000);

  it('no está en la galería, pero el enlace ?new=elevator-class abre el montaje actual', () => {
    expect(TEMPLATES.some((t) => t.id === 'elevator-class')).toBe(false);
    const hidden = findTemplate('elevator-class');
    expect(JSON.parse(JSON.stringify(hidden))).toEqual(JSON.parse(JSON.stringify(elevatorClassTemplate())));
  });
});

describe('aviso de versión nueva de la plantilla', () => {
  it('se ofrece en circuitos viejos del ascensor y desaparece al actualizar', async () => {
    const { templateUpdate, templateVersion } = await import('../collab/applyTemplate');
    const meta = new Map<string, unknown>();
    expect(templateUpdate(meta, 'Ascensor con integrados de clase + GIGA (pantalla)')?.id).toBe('elevator-class');
    expect(templateUpdate(meta, 'Mi circuito')).toBe(null);
    meta.set('template', { id: 'elevator-class', version: 'vieja' });
    expect(templateUpdate(meta, 'Mi circuito')?.id).toBe('elevator-class');
    meta.set('template', { id: 'elevator-class', version: templateVersion(findTemplate('elevator-class')!) });
    expect(templateUpdate(meta, 'Ascensor con integrados de clase + GIGA')).toBe(null);
  });

  it('la leyenda trae un nombre para cada color que usan los cables, con la paleta de Tinkercad', async () => {
    const { WIRE_COLORS } = await import('../ui/geometry');
    const t = elevatorClassTemplate();
    const used = new Set(t.wires.map((w) => w.color));
    expect([...used].every((c) => WIRE_COLORS.some((p) => p.value === c))).toBe(true);
    expect(new Set(t.legend!.map((e) => e.color))).toEqual(used);
    expect(t.legend!.every((e) => e.label.trim().length > 0)).toBe(true);
  });
});
