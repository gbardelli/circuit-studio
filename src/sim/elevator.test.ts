import { describe, expect, it } from 'vitest';
import { compileSketch, compilerAvailable } from '../../server/compile';
import { elevatorTemplate } from '../collab/elevator';
import { templateSnapshot } from '../collab/applyTemplate';
import { ELEVATOR_GIGA } from '../collab/elevatorSketch';
import { SimEngine } from './engine';
import { connectTotalCountdown } from '../collab/totalCountdown';

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const DIGITS: Record<string, number> = { bc: 1, abdeg: 2, abcdg: 3, bcfg: 4 };

function fixture(hex?: string, totalCountdown = false) {
  const original = templateSnapshot(elevatorTemplate(false));
  const snapshot = totalCountdown ? connectTotalCountdown(original, {mcu:'giga',decoder:'u17',display:'seg2'}) : original;
  const engine = new SimEngine();
  engine.update(snapshot);
  if (hex) engine.setProgram('giga', hex);
  engine.start({ manual: true });
  // En pasos cortos, como la simulación en vivo: un paso muy largo agota las resoluciones por paso.
  const tick = (s = 0.11) => {
    for (let t = 0; t < s - 1e-9; t += 0.1) engine.tick(Math.min(0.1, s - t));
    expect(engine.status.converged).toBe(true);
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
    const on = SEGMENTS.filter((s) => Number(v?.[s] ?? 0) > 0.001).join('');
    return on === '' ? null : ({ abcdef: 0, bc: 1, abdeg: 2, abcdg: 3, bcfg:4, acdfg:5, acdefg:6, cdefg:6, abc:7, abcdefg:8, abcdfg:9, abcfg:9 } as Record<string, number>)[on] ?? on;
  };
  const down = () => bit('u13', '4Y');
  const digit = () => {
    const v = engine.getVisual('seg');
    const on = SEGMENTS.filter((s) => Number(v?.[s] ?? 0) > 0.001).join('');
    return on === '' ? null : (DIGITS[on] ?? on);
  };
  /** DIP SP1–SP4: `n` activo (0 = ninguno). */
  const floor = (n: number) => {
    const sp = snapshot.parts.find((p) => p.id === 'sp')!;
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

  it('recuerda el destino al soltar el pulsador, bloquea otros y acepta uno nuevo al llegar', () => {
    const h = fixture();
    h.floor(1);
    h.press('pp4');
    expect(h.value('u8')).toBe(4);
    expect(h.digit()).toBe(4);
    expect(h.busy()).toBe(true);
    expect(h.up()).toBe(true);
    expect(h.down()).toBe(false);
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

  it('cuenta regresiva: 3-2-1 cada segundo por piso, fija en 3 y apagada en reposo', () => {
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
    expect(h.seconds()).toBe(null);
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
    h.engine.stop();
  }, 60_000);
});

describe.skipIf(!compilerAvailable())('ascensor con el GIGA: pantalla táctil y motor de la cabina', () => {
  it('shows total remaining seconds from 9, 6 and 3 down to 0 without reloading between floors',async()=>{
    const compiled=await compileSketch(ELEVATOR_GIGA,'arduino:avr:mega:cpu=atmega2560');
    expect(compiled.ok,compiled.stderr).toBe(true);
    const h=fixture(compiled.hex!,true);
    try {
      h.tick(1.5);expect(h.seconds()).toBe(null);
      for(const [target,start] of [[4,9],[2,6],[1,3]]) {
        h.tick(1.6);h.press(`pp${target}`);
        h.tick(.05);
        const changes=[h.seconds()];expect(changes[0]).toBe(start);
        let bcd=start;
        for(let t=0;t<13 && h.busy();t+=.1){
          h.tick(.1);
          const n=['A','B','C','D'].reduce((v,p,i)=>v|(h.bit('u17',p)?1<<i:0),0);
          if(n!==bcd){bcd=n;h.tick(.05);const rendered=h.seconds();if(changes.at(-1)!==rendered)changes.push(rendered);}
        }
        h.tick(.3);if(changes.at(-1)!==h.seconds())changes.push(h.seconds());
        expect(changes).toEqual(Array.from({length:start+1},(_,i)=>start-i));
        expect(h.value('u11')).toBe(target);expect(h.busy()).toBe(false);expect(h.seconds()).toBe(0);
        expect(String(h.engine.getVisual('screen')?.scene)).toContain('0 s');
      }
      h.engine.setInput('reset','pressed',true);h.tick(.3);expect(h.seconds()).toBe(null);
    } finally {h.engine.stop();}
  },240_000);
  it('atiende pedido tras pedido, por botones y por la pantalla, y la cabina se mueve sola', async () => {
    const compiled = await compileSketch(ELEVATOR_GIGA, 'arduino:avr:mega:cpu=atmega2560');
    expect(compiled.ok, compiled.stderr).toBe(true);
    const h = fixture(compiled.hex!);
    h.tick(1.5);
    const scene = () => String(h.engine.getVisual('screen')?.scene);
    expect(scene()).toContain('ASCENSOR');
    expect(h.value('u11')).toBe(1);
    const tap = (x: number, y: number) => {
      h.engine.setInput('screen', 'touch', (1 << 18) | (x << 9) | y);
      h.tick(0.05);
      h.engine.setInput('screen', 'touch', (x << 9) | y);
      h.tick(0.3);
    };
    const waitIdle = () => {
      for (let i = 0; i < 160 && (h.busy() || h.up() || h.down()); i++) h.tick(0.1);
      expect(h.busy()).toBe(false);
    };
    const callButton = (f: number) => tap(104 + (f - 1) * 52 + 24, 190);

    // 1 → 3 con el pulsador de cabina; la cabina sube sola.
    h.press('pp3');
    expect(h.up()).toBe(true);
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
    h.engine.stop();
  }, 240_000);
});
