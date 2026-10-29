// Compila un sketch real con el arduino-cli local (tools/) y lo ejecuta en el emulador:
// valida perfiles de placa, vectores de interrupción (millis/delay) y mapa de pines.
// Se omite si el compilador no está instalado (npm run setup:arduino).
import { describe, expect, it } from 'vitest';
import { compileSketch, compilerAvailable } from '../../server/compile';
import { AvrRunner, CLOCK_HZ, type BoardId } from './avr';

const BLINK = (pin: number) => `
void setup() { pinMode(${pin}, OUTPUT); Serial.begin(9600); Serial.print("ok"); }
void loop() { digitalWrite(${pin}, HIGH); delay(100); digitalWrite(${pin}, LOW); delay(100); }
`;

const ANALOG = `
void setup() { Serial.begin(9600); }
void loop() { Serial.println(analogRead(A1)); delay(20); }
`;

const cases: [BoardId, string, number][] = [
  ['uno', 'arduino:avr:uno', 13],
  ['nano', 'arduino:avr:nano:cpu=atmega328', 13],
  ['mega', 'arduino:avr:mega:cpu=atmega2560', 13],
  ['mega', 'arduino:avr:mega:cpu=atmega2560', 44], // puerto L, solo en el Mega
];

describe.skipIf(!compilerAvailable())('placas con firmware real', () => {
  it.each(cases)('%s: parpadeo en D%2$s con delay() y salida serie', async (board, fqbn, pin) => {
    const r = await compileSketch(BLINK(pin), fqbn);
    expect(r.ok, r.stderr).toBe(true);
    const avr = AvrRunner.fromHex(r.hex!, board);
    let serial = '';
    avr.onSerial = (c) => (serial += c);
    const states: string[] = [];
    let last = '';
    for (let t = 0.005; t <= 0.5; t += 0.005) {
      avr.run(Math.round(t * CLOCK_HZ));
      while (avr.pinsChanged) avr.run(Math.round(t * CLOCK_HZ));
      const mode = avr.pinMode(pin);
      if (mode !== last) states.push(mode);
      last = mode;
    }
    // 500 ms con periodos de 100 ms: al menos 4 cambios entre alto y bajo.
    expect(states.filter((s) => s === 'high').length).toBeGreaterThanOrEqual(2);
    expect(states.filter((s) => s === 'low').length).toBeGreaterThanOrEqual(2);
    expect(serial).toContain('ok');
  }, 60_000);

  it.each([['uno', 'arduino:avr:uno'] as const, ['mega', 'arduino:avr:mega:cpu=atmega2560'] as const])('%s: analogRead lee la tensión inyectada', async (board, fqbn) => {
    const r = await compileSketch(ANALOG, fqbn);
    expect(r.ok, r.stderr).toBe(true);
    const avr = AvrRunner.fromHex(r.hex!, board);
    let serial = '';
    avr.onSerial = (c) => (serial += c);
    avr.setAnalog(1, 2.5);
    avr.run(Math.round(0.2 * CLOCK_HZ));
    const values = serial.trim().split(/\s+/).map(Number).filter(Number.isFinite);
    expect(values.length).toBeGreaterThan(2);
    expect(values.at(-1)!).toBeGreaterThan(500);
    expect(values.at(-1)!).toBeLessThan(525);
  }, 60_000);
});
