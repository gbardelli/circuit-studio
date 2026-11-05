import { describe, expect, it } from 'vitest';
import { elevatorClassTemplate } from '../collab/elevatorClass';
import { templateSnapshot } from '../collab/applyTemplate';
import { compileSketch } from '../../server/compile';
import { ELEVATOR_CLASS_GIGA } from '../collab/elevatorClassSketch';
import { SimEngine } from './engine';

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
    expect(h.snapshot.parts.filter((p) => p.type === 'breadboard-full')).toHaveLength(3);
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

  it('el sketch compila y la pantalla del GIGA muestra piso actual, destino y sentido', async () => {
    const compiled = await compileSketch(ELEVATOR_CLASS_GIGA, 'arduino:avr:mega:cpu=atmega2560');
    expect(compiled.ok, compiled.stderr).toBe(true);
    const h = fixture(compiled.hex!);
    h.tick(1);
    const scene = () => String(h.engine.getVisual('screen')?.scene);
    expect(scene()).toContain('ASCENSOR');
    expect(scene()).toContain('EN ESPERA');
    h.floor(2);
    h.tick(0.3);
    h.press('pp4');
    h.tick(0.5);
    expect(scene()).toContain('PISO 4');
    expect(scene()).toContain('SUBIENDO');
    h.floor(0);
    h.floor(4);
    h.tick(0.5);
    expect(scene()).toContain('LLEGO');
    h.press('pp1');
    h.tick(0.5);
    expect(scene()).toContain('PISO 1');
    expect(scene()).toContain('BAJANDO');
    h.engine.stop();
  }, 120_000);
});
