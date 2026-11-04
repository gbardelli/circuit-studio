import { describe, expect, it } from 'vitest';
import { compileSketch, compilerAvailable } from '../../server/compile';
import { elevatorTemplate } from '../collab/elevator';
import { templateSnapshot } from '../collab/applyTemplate';
import { ELEVATOR_GIGA } from '../collab/elevatorSketch';
import { SimEngine } from './engine';

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const DIGITS: Record<string, number> = { bc: 1, abdeg: 2, abcdg: 3, bcfg: 4 };

function fixture(hex?: string) {
  const snapshot = templateSnapshot(elevatorTemplate());
  const engine = new SimEngine();
  engine.update(snapshot);
  if (hex) engine.setProgram('giga', hex);
  engine.start({ manual: true });
  // En pasos cortos, como la simulación en vivo: un paso muy largo agota las resoluciones por paso.
  const tick = (s = 0.11) => {
    for (let t = 0; t < s - 1e-9; t += 0.1) engine.tick(Math.min(0.1, s - t));
    expect(engine.status.converged).toBe(true);
    for(const p of snapshot.parts.filter(p=>p.type.startsWith('74ls'))) {
      const supply=engine.voltageAt(p.id,'VCC')!-engine.voltageAt(p.id,'GND')!;
      expect(supply,p.id).toBeGreaterThanOrEqual(4.75);
      expect(supply,p.id).toBeLessThanOrEqual(5.25);
    }
    for(const p of ['D6','D7','D8','D9','D23','D25','D27','D29','D31','D33','D35','D37','D39','D41','D43','D45','D47','D49','D51']) expect(engine.voltageAt('giga',p)!,p).toBeLessThan(3.6);
  };
  // Lógica de 3,3 V.
  const bit = (part: string, pin: string) => engine.voltageAt(part, pin)! > 1.65;
  const value = (id: string) => [0, 1, 2].reduce((v, n) => v | (bit(id, `Q${n}`) ? 1 << n : 0), 0);
  const busy = () => bit('u5', '1Q');
  const valid = () => bit('u5', '2Q');
  const up = () => bit('u13', '2Y');
  const count = () => [0, 1, 2, 3].reduce((v, n) => v | (bit('u16', `Q${n}`) ? 1 << n : 0), 0);
  const seconds = () => {
    const v = engine.getVisual('seg2');
    const on = SEGMENTS.filter((s) => Number(v?.[s] ?? 0) > 0.0002).join('');
    return on === '' ? null : ({ abcdef: 0, bc: 1, abdeg: 2, abcdg: 3, bcfg:4, acdfg:5, acdefg:6, cdefg:6, abc:7, abcdefg:8, abcdfg:9, abcfg:9 } as Record<string, number>)[on] ?? on;
  };
  const down = () => bit('u13', '4Y');
  const digit = (display = 'seg') => {
    const v = engine.getVisual(display);
    const on = SEGMENTS.filter((s) => Number(v?.[s] ?? 0) > 0.0002).join('');
    return on === '' ? null : (DIGITS[on] ?? on);
  };
  /** DIP SP1–SP4: `n` activo (0 = ninguno). */
  const floor = (n: number) => {
    const sp = snapshot.parts.find((p) => p.id === 'sp')!;
    // A cab crosses an interval with no active sensor between different floors.
    sp.props = { ...sp.props, s1: false, s2: false, s3: false, s4: false };
    engine.update({ ...snapshot, parts: [...snapshot.parts] });
    tick(.002);
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
  return { engine, snapshot, tick, bit, value, busy, valid, up, down, digit, floor, press, count, seconds };
}

describe('ascensor de cuatro pisos · requisitos del enunciado (solo integrados)', () => {
  it('matches the reference comparator and direction indicators for all sixteen floor pairs', () => {
    for(let actual=1;actual<=4;actual++)for(let requested=1;requested<=4;requested++) {
      const h=fixture();h.floor(actual);h.press(`pp${requested}`);
      expect(h.value('u8')).toBe(requested);
      expect(h.bit('u12','OAGTB')).toBe(actual>requested);
      expect(h.bit('u12','OAEQB')).toBe(actual===requested);
      expect(h.bit('u12','OALTB')).toBe(actual<requested);
      expect(h.up()).toBe(actual<requested);
      expect(h.down()).toBe(actual>requested);
      expect(Number(h.engine.getVisual('stop')?.i)>.0002).toBe(actual===requested);
      h.engine.stop();
    }
  },60_000);
  it('cabe en cuatro protoboards y limita cada segmento en su driver, sin resistencias externas', () => {
    const scene = templateSnapshot(elevatorTemplate());
    expect(scene.parts.filter(p => p.type === 'breadboard-full')).toHaveLength(4);
    expect(scene.parts.filter(p => p.type === 'resistor')).toHaveLength(20);
    expect(scene.parts.some(p => p.type === 'diode' || p.type === '74hc148')).toBe(false);
    expect(scene.parts.some(p => p.type === 'capacitor-ceramic')).toBe(false);
    expect(scene.parts.filter(p => p.type === 'capacitor')).toHaveLength(2);
    expect(scene.parts.filter(p => p.type === 'seven-segment')).toHaveLength(3);
    const displays = scene.parts.filter(p => p.type === 'seven-segment');
    expect(new Set(displays.map(p => p.y)).size).toBe(1);
    expect(scene.parts.filter(p => p.type === '74ls48')).toHaveLength(3);
    expect(scene.parts.filter(p => p.type === '74ls173')).toHaveLength(2);
    expect(scene.parts.some(p => p.type === '74hc273' || p.type === '74hc193')).toBe(false);
    expect(scene.parts.filter(p => p.type === 'level-converter-4')).toHaveLength(5);
  });
  it('arranca con el display apagado y los dos LEDs de marcha apagados', () => {
    const h = fixture();
    h.floor(1);
    expect(h.value('u11')).toBe(1);
    expect(h.valid()).toBe(false);
    expect(h.digit()).toBe(null);
    expect(h.up()).toBe(false);
    expect(h.down()).toBe(false);
    h.engine.stop();
  }, 60_000);

  it('el display del piso actual sigue a los sensores y queda oscuro hasta el primero', () => {
    const h = fixture();
    h.tick(0.3);
    expect(h.digit('seg3')).toBe(null);
    for (const f of [1, 2, 3, 4]) {
      h.floor(f);
      expect(h.value('u11')).toBe(f);
      expect(h.digit('seg3')).toBe(f);
    }
    h.floor(0); // entre plantas conserva el último piso
    expect(h.digit('seg3')).toBe(4);
    h.engine.stop();
  }, 60_000);

  it('recuerda el destino al soltar el pulsador, bloquea otros y acepta uno nuevo al llegar', () => {
    const h = fixture();
    h.floor(1);
    h.press('pp4');
    expect(h.value('u8')).toBe(4);
    expect(h.digit()).toBe(4);
    expect(h.busy()).toBe(true);
    expect(h.up()).toBe(true);
    expect(h.down()).toBe(false);
    expect(Number(h.engine.getVisual('ls')?.i)).toBeGreaterThan(.0002);
    expect(Number(h.engine.getVisual('ls')?.i)).toBeLessThan(.002);
    h.press('pp2'); // bloqueado durante el viaje
    expect(h.value('u8')).toBe(4);
    h.floor(0); // entre plantas: el piso actual se mantiene
    expect(h.value('u11')).toBe(1);
    expect(h.busy()).toBe(true);
    h.floor(2);
    expect(h.value('u11')).toBe(2);
    expect(h.up()).toBe(true);
    h.floor(4);
    expect(h.busy()).toBe(false);
    expect(h.up()).toBe(false);
    expect(h.digit()).toBe(4); // el display sigue mostrando el piso solicitado
    h.press('pp1');
    expect(h.value('u8')).toBe(1);
    expect(h.down()).toBe(true);
    expect(h.up()).toBe(false);
    expect(Number(h.engine.getVisual('lb')?.i)).toBeGreaterThan(.0002);
    expect(Number(h.engine.getVisual('lb')?.i)).toBeLessThan(.002);
    h.floor(1);
    expect(h.busy()).toBe(false);
    expect(h.down()).toBe(false);
    h.engine.stop();
  }, 60_000);

  it.each([1, 2, 3, 4])('acepta la llamada desde el piso %i (innovación)', (f) => {
    const h = fixture();
    h.floor(f === 1 ? 2 : 1);
    h.press(`call${f}`);
    expect(h.value('u8')).toBe(f);
    expect(h.valid()).toBe(true);
    expect(h.digit()).toBe(f);
    h.engine.stop();
  }, 60_000);

  it('el secuenciador interno mantiene el ritmo de tres segundos por piso', () => {
    const h = fixture();
    h.floor(1);
    h.tick(0.5);
    expect(h.count()).toBe(3);
    expect(h.seconds()).toBe(null);
    h.press('pp3');
    // Muestras cada 0,1 s durante dos pisos: los valores y cuándo cambian.
    const changes: [number, number][] = [];
    for (let t = 0; t < 6.4; t += 0.1) {
      h.tick(0.1);
      const c = h.count();
      if (!changes.length || changes[changes.length - 1][1] !== c) changes.push([Math.round(t * 10) / 10, c]);
    }
    expect(changes.map(([, c]) => c).slice(0, 8)).toEqual([3, 2, 1, 0, 3, 2, 1, 0]);
    // Un piso cada 3 s: de un 0 al siguiente.
    const zeros = changes.filter(([, c]) => c === 0).map(([t]) => t);
    expect(zeros[1] - zeros[0]).toBeGreaterThan(2.7);
    expect(zeros[1] - zeros[0]).toBeLessThan(3.3);
    // Primer piso algo más corto (~2,5 s): el primer ciclo del 555 arranca con el condensador vacío.
    expect(zeros[0]).toBeGreaterThan(1.8);
    // Al llegar se para en 3 y el display se apaga.
    h.floor(3);
    h.tick(0.6);
    expect(h.busy()).toBe(false);
    expect(h.count()).toBe(3);
    h.engine.stop();
  }, 60_000);

  it('el RESET borra destino, estado y display', () => {
    const h = fixture();
    h.floor(1);
    h.press('pp3');
    h.engine.setInput('reset', 'pressed', true);
    h.tick();
    expect(h.value('u8')).toBe(0);
    expect(h.busy()).toBe(false);
    expect(h.valid()).toBe(false);
    expect(h.digit()).toBe(null);
    h.engine.setInput('reset', 'pressed', false);
    h.tick();
    expect(h.value('u11')).toBe(1);
    expect(h.digit('seg3')).toBe(1);
    h.engine.stop();
  }, 60_000);

  it('recuerda el piso al soltar cada sensor y captura una nueva llegada sin diodos', () => {
    const h = fixture();
    for (const floor of [4, 1, 3, 2, 4]) {
      h.floor(floor);
      expect(h.value('u11')).toBe(floor);
      h.floor(0);
      h.tick(.25);
      expect(h.value('u11')).toBe(floor);
      expect(h.digit('seg3')).toBe(floor);
    }
    h.engine.stop();
  }, 60_000);

  it('codifica las 15 combinaciones de llamadas con prioridad 4 > 3 > 2 > 1', () => {
    for (let mask = 1; mask < 16; mask++) {
      const h = fixture();
      h.floor(1);
      for (let f = 1; f <= 4; f++) h.engine.setInput(`pp${f}`, 'pressed', Boolean(mask & (1 << (f - 1))));
      h.tick(.25);
      const expected = Math.floor(Math.log2(mask)) + 1;
      expect(h.value('u8'), `combinación ${mask.toString(2)}`).toBe(expected);
      h.engine.stop();
    }
  }, 120_000);
});

describe.skipIf(!compilerAvailable())('ascensor con el GIGA y su Display Shield: pantalla táctil y motor de la cabina', () => {
  it('atiende pedido tras pedido, por botones y por la pantalla, y la cabina se mueve sola', async () => {
    const compiled = await compileSketch(ELEVATOR_GIGA, 'arduino:avr:mega:cpu=atmega2560');
    expect(compiled.ok, compiled.stderr).toBe(true);
    const h = fixture(compiled.hex!);
    h.tick(1.5);
    const scene = () => String(h.engine.getVisual('screen')?.scene);
    expect(scene()).toContain('ASCENSOR');
    expect(h.value('u11')).toBe(1);
    const tap = (x: number, y: number) => {
      h.engine.setInput('screen', 'touch', (1 << 20) | (x << 10) | y);
      h.tick(0.05);
      h.engine.setInput('screen', 'touch', (x << 10) | y);
      h.tick(0.3);
    };
    const waitIdle = () => {
      for (let i = 0; i < 160 && (h.busy() || h.up() || h.down()); i++) h.tick(0.1);
      expect(h.busy()).toBe(false);
      // Allow the firmware's 250 ms sensor settling window and the averaged display frame.
      h.tick(.35);
    };
    const callButton = (f: number) => tap(236 + (f - 1) * 131 + 60, 404);

    // Longest journey: the physical display must visit every digit once, including zero.
    h.press('pp4');
    h.tick(.15);
    expect(h.seconds()).toBe(9);
    expect(scene()).toContain('9 s');
    // Read the electrical BCD bus during transitions. Segment brightness is averaged per
    // simulation frame and briefly combines the outgoing and incoming digit.
    const tripBCD = () => ['A','B','C','D'].reduce((v, pin, bit) => v | (h.bit('u17', pin) ? 1 << bit : 0), 0);
    const countdown = [tripBCD()];
    for (let i = 0; i < 140 && h.busy(); i++) {
      h.tick(.1);
      const value = tripBCD();
      if (value !== countdown.at(-1)) countdown.push(value);
    }
    h.tick(.35);
    if (tripBCD() !== countdown.at(-1)) countdown.push(tripBCD());
    expect(countdown).toEqual([9,8,7,6,5,4,3,2,1,0]);
    expect(h.value('u11')).toBe(4);
    expect(h.seconds()).toBe(0);
    // Return over the same three floors; loading nine must work on subsequent requests too.
    h.tick(1.6);
    callButton(1);
    expect(h.seconds()).toBe(9);
    waitIdle();
    expect(h.value('u11')).toBe(1);
    expect(h.seconds()).toBe(0);
    h.tick(1.6);

    // 1 → 3 con el pulsador de cabina; la cabina sube sola.
    h.press('pp3');
    expect(h.up()).toBe(true);
    h.tick(0.2);
    expect(scene()).toContain('6 s'); // tiempo total del viaje: dos tramos de 3 s
    expect(h.seconds()).toBe(6);
    waitIdle();
    expect(h.value('u11')).toBe(3);
    expect(h.digit()).toBe(3);
    // 3 → 1 desde la pantalla; un pedido durante el viaje se ignora.
    h.tick(1.6); // puertas
    callButton(1);
    expect(h.down()).toBe(true);
    callButton(4);
    expect(h.value('u8')).toBe(1);
    waitIdle();
    expect(h.value('u11')).toBe(1);
    // Y otra vez desde la pantalla: la segunda, la tercera… también funcionan.
    h.tick(1.6);
    callButton(4);
    waitIdle();
    expect(h.value('u11')).toBe(4);
    h.tick(1.6);
    callButton(2);
    waitIdle();
    expect(h.value('u11')).toBe(2);
    expect(h.digit()).toBe(2);
    expect(scene()).toContain('PISO 2');
    expect(h.digit('seg3')).toBe(2);
    expect(String(h.engine.getVisual('screen')?.led)).toMatch(/^rgb/);
    h.tick(1.6);
    callButton(3);
    expect(tripBCD()).toBe(3);
    expect(h.seconds()).toBe(3);
    waitIdle();
    expect(h.value('u11')).toBe(3);
    expect(tripBCD()).toBe(0);
    expect(h.seconds()).toBe(0);
    h.engine.stop();
  }, 600_000);
});
