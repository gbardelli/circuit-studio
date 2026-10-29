// Co-simulación de extremo a extremo: firmware real compilado + circuito + piezas con
// estado, avanzando el motor en modo manual. Se omite sin compilador local.
import { describe, expect, it } from 'vitest';
import { compileSketch, compilerAvailable } from '../../server/compile';
import type { CircuitSnapshot, PartData, WireData } from '../core/types';
import { SimEngine } from './engine';

function circuit(parts: PartData[], links: [string, string, string, string][]): CircuitSnapshot {
  const wires: WireData[] = links.map(([pa, a, pb, b], i) => ({ id: `w${i}`, a: { part: pa, pin: a, x: 0, y: 0 }, b: { part: pb, pin: b, x: 0, y: 0 }, points: [], color: '#000' }));
  return { parts, wires };
}
const part = (id: string, type: string, props: PartData['props'] = {}): PartData => ({ id, type, x: 0, y: 0, rot: 0, props });

async function run(snap: CircuitSnapshot, sketch: string, seconds: number, fqbn = 'arduino:avr:uno') {
  const r = await compileSketch(sketch, fqbn);
  expect(r.ok, r.stderr).toBe(true);
  const engine = new SimEngine();
  let serial = '';
  engine.subscribeSerial((_id, ch) => (serial += ch));
  engine.update(snap);
  engine.setProgram('mcu', r.hex!);
  engine.start({ manual: true });
  for (let t = 0; t < seconds; t += 0.05) engine.tick(0.05);
  return { engine, serial: () => serial };
}

describe.skipIf(!compilerAvailable())('co-simulación con firmware real', () => {
  it('LCD 16×2 con LiquidCrystal en modo de 4 bits', async () => {
    const snap = circuit(
      [part('mcu', 'arduino-uno'), part('lcd', 'lcd-1602')],
      [
        ['lcd', 'RS', 'mcu', 'D12'],
        ['lcd', 'E', 'mcu', 'D11'],
        ['lcd', 'D4', 'mcu', 'D5'],
        ['lcd', 'D5', 'mcu', 'D4'],
        ['lcd', 'D6', 'mcu', 'D3'],
        ['lcd', 'D7', 'mcu', 'D2'],
        ['lcd', 'VSS', 'mcu', 'GND.1'],
        ['lcd', 'RW', 'mcu', 'GND.2'],
        ['lcd', 'VDD', 'mcu', '5V'],
        ['lcd', 'A', 'mcu', '5V'],
        ['lcd', 'K', 'mcu', 'GND.3'],
      ],
    );
    const { engine } = await run(
      snap,
      `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
void setup() { lcd.begin(16, 2); lcd.print("Hola mundo"); lcd.setCursor(0, 1); lcd.print("Circuit Studio"); }
void loop() {}`,
      0.6,
    );
    const v = engine.getVisual('lcd')!;
    expect(v.line0).toBe('Hola mundo      ');
    expect(v.line1).toBe('Circuit Studio  ');
    expect(v.on).toBe(true);
  }, 90_000);

  it('HC-SR04: pulseIn mide la distancia configurada', async () => {
    const snap = circuit(
      [part('mcu', 'arduino-uno'), part('sonar', 'hc-sr04', { distance: 120 })],
      [
        ['sonar', 'VCC', 'mcu', '5V'],
        ['sonar', 'GND', 'mcu', 'GND.1'],
        ['sonar', 'TRIG', 'mcu', 'D9'],
        ['sonar', 'ECHO', 'mcu', 'D10'],
      ],
    );
    const { serial } = await run(
      snap,
      `void setup() { Serial.begin(115200); pinMode(9, OUTPUT); pinMode(10, INPUT); }
void loop() {
  digitalWrite(9, LOW); delayMicroseconds(2);
  digitalWrite(9, HIGH); delayMicroseconds(10);
  digitalWrite(9, LOW);
  long us = pulseIn(10, HIGH);
  Serial.println(us / 58);
  delay(60);
}`,
      0.5,
    );
    const values = serial().trim().split(/\s+/).map(Number).filter(Number.isFinite);
    expect(values.length).toBeGreaterThan(1);
    expect(values.at(-1)!).toBeGreaterThanOrEqual(118);
    expect(values.at(-1)!).toBeLessThanOrEqual(122);
  }, 90_000);

  it('TMP36 en A0 y relé en D7 controlado por la temperatura', async () => {
    const snap = circuit(
      [part('mcu', 'arduino-uno'), part('t', 'tmp36', { temperature: 30 }), part('rl', 'relay')],
      [
        ['t', '+Vs', 'mcu', '5V'],
        ['t', 'GND', 'mcu', 'GND.1'],
        ['t', 'OUT', 'mcu', 'A0'],
        ['rl', 'VCC', 'mcu', '5V'],
        ['rl', 'GND', 'mcu', 'GND.2'],
        ['rl', 'IN', 'mcu', 'D7'],
      ],
    );
    const { engine, serial } = await run(
      snap,
      `void setup() { Serial.begin(115200); pinMode(7, OUTPUT); }
void loop() {
  int raw = analogRead(A0);
  float c = (raw * 5.0 / 1023.0 - 0.5) * 100.0;
  digitalWrite(7, c > 28 ? HIGH : LOW);
  Serial.println((int)c);
  delay(50);
}`,
      0.4,
    );
    const values = serial().trim().split(/\s+/).map(Number).filter(Number.isFinite);
    expect(Math.abs(values.at(-1)! - 30)).toBeLessThanOrEqual(1);
    expect(engine.getVisual('rl')?.on).toBe(true);
  }, 90_000);

  it('Arduino Mega y Nano arrancan con su propio perfil', async () => {
    for (const [type, fqbn] of [
      ['arduino-mega', 'arduino:avr:mega:cpu=atmega2560'],
      ['arduino-nano', 'arduino:avr:nano:cpu=atmega328'],
    ] as const) {
      const snap = circuit([part('mcu', type), part('led', 'led'), part('r', 'resistor', { resistance: 220 })], [
        ['mcu', 'D13', 'r', '1'],
        ['r', '2', 'led', 'A'],
        ['led', 'K', 'mcu', 'GND.1'],
      ]);
      const { engine } = await run(snap, 'void setup(){ pinMode(13, OUTPUT); digitalWrite(13, HIGH); } void loop(){}', 0.1, fqbn);
      expect(Number(engine.getVisual('led')?.i)).toBeGreaterThan(0.01);
    }
  }, 120_000);
});
