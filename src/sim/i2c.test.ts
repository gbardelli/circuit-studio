import { beforeAll, describe, expect, it } from 'vitest';
import { compileSketch, compilerAvailable } from '../../server/compile';
import { PARTS } from '../parts';
import type { CircuitSnapshot, PartData } from '../core/types';
import { SimEngine } from './engine';

const part = (id: string, type: string, x: number, props: PartData['props'] = {}): PartData => ({ id, type, x, y: 0, rot: 0, props: { ...PARTS[type].defaults, ...props } });
function fixture(board = 'arduino-uno', changes: 'none' | 'swapped' | 'missing-sda' | 'missing-scl' | 'missing-ground' | 'unpowered' | 'shorted' | 'sda-power' = 'none', address = '0x27'): CircuitSnapshot {
  const mcu = part('mcu', board, 0), lcd = part('lcd', 'lcd-i2c', 1000, { address });
  const spec = PARTS[board].mcu!;
  const sda = spec.pinIds[board === 'arduino-mega' ? 20 : 18], scl = spec.pinIds[board === 'arduino-mega' ? 21 : 19];
  const links = [
    ['lcd', 'VCC', 'mcu', '5V'], ['lcd', 'GND', 'mcu', 'GND.1'],
    ['lcd', 'SDA', 'mcu', changes === 'swapped' ? scl : sda], ['lcd', 'SCL', 'mcu', changes === 'swapped' ? sda : scl],
  ].filter((link) => !(changes === 'missing-sda' && link[1] === 'SDA') && !(changes === 'missing-scl' && link[1] === 'SCL')
    && !(changes === 'missing-ground' && link[1] === 'GND') && !(changes === 'unpowered' && link[1] === 'VCC'));
  if (changes === 'shorted') links.push(['lcd', 'SDA', 'lcd', 'SCL']);
  if (changes === 'sda-power') links.push(['lcd', 'SDA', 'mcu', '5V']);
  return { parts: [mcu, lcd], wires: links.map(([a, ap, b, bp], i) => ({ id: `w${i}`, a: { part: a, pin: ap, x: 0, y: 0 }, b: { part: b, pin: bp, x: 0, y: 0 }, color: '#000', points: [] })) };
}
function run(snap: CircuitSnapshot, hex: string, seconds: number) {
  const engine = new SimEngine();
  let serial = '';
  engine.subscribeSerial((_id, char) => serial += char);
  engine.update(snap); engine.setProgram('mcu', hex); engine.start({ manual: true });
  for (let i = 0; i < seconds; i += .025) engine.tick(.025);
  return { engine, serial: () => serial };
}

const SCANNER = `#include <Wire.h>
void setup() { Wire.begin(); Serial.begin(115200); delay(5); }
void loop() {
  Wire.beginTransmission(0x27); Serial.println(Wire.endTransmission()); delay(20);
}`;
const LCD = `#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27,16,2);
void setup() { lcd.init(); lcd.backlight(); lcd.print("GTX: 13"); lcd.setCursor(0,1); lcd.print("I2C funcionando"); }
void loop() {}`;

describe.skipIf(!compilerAvailable())('hardware I2C with compiled Arduino firmware', () => {
  let scanner: string;
  beforeAll(async () => {
    const result = await compileSketch(SCANNER);
    expect(result.ok, result.stderr).toBe(true); scanner = result.hex!;
  }, 60_000);

  it.each([
    ['arduino-uno', 'arduino:avr:uno'],
    ['arduino-nano', 'arduino:avr:nano:cpu=atmega328'],
    ['arduino-mega', 'arduino:avr:mega:cpu=atmega2560'],
  ])('%s executes LiquidCrystal_I2C on its real SDA/SCL pins', async (board, fqbn) => {
    const result = await compileSketch(LCD, fqbn);
    expect(result.ok, result.stderr).toBe(true);
    const { engine } = run(fixture(board), result.hex!, 1.5);
    expect(engine.getVisual('lcd')?.line0).toBe('GTX: 13         ');
    expect(engine.getVisual('lcd')?.line1).toBe('I2C funcionando ');
    expect(engine.getVisual('lcd')?.on).toBe(true);
    expect(Number(engine.getVisual('lcd')?.backlight)).toBeGreaterThan(.01);
    expect(engine.status.converged).toBe(true); engine.stop();
  }, 90_000);

  it('acknowledges a correctly powered and wired device', () => {
    const { engine, serial } = run(fixture(), scanner, .08);
    expect(serial()).toMatch(/^0\r?\n/); engine.stop();
  });

  it.each(['swapped', 'missing-sda', 'missing-scl', 'missing-ground', 'unpowered', 'shorted', 'sda-power'] as const)('NACKs %s wiring', (fault) => {
    const { engine, serial } = run(fixture('arduino-uno', fault), scanner, .08);
    expect(serial()).toMatch(/^2\r?\n/); engine.stop();
  });

  it('NACKs a different address', () => {
    const { engine, serial } = run(fixture('arduino-uno', 'none', '0x3F'), scanner, .08);
    expect(serial()).toMatch(/^2\r?\n/); engine.stop();
  });

  it('detects duplicate addresses and acknowledges again after removing the collision', () => {
    const snap = fixture();
    snap.parts.push(part('other', 'lcd-i2c', 2000));
    for (const pin of ['GND', 'VCC', 'SDA', 'SCL']) snap.wires.push({ id: `other-${pin}`, a: { part: 'other', pin, x: 0, y: 0 }, b: { part: 'lcd', pin, x: 0, y: 0 }, points: [], color: '#000' });
    const { engine, serial } = run(snap, scanner, .08);
    expect(serial()).toMatch(/^2\r?\n/);
    engine.update(fixture()); engine.tick(.08);
    expect(serial()).toMatch(/0\r?\n/); engine.stop();
  });

  it.each(['pcf8574', 'pcf8574a'])('%s reads actual port voltages, supports repeated starts and resets INT', async (type) => {
    const address = type === 'pcf8574' ? '0x20' : '0x38';
    const result = await compileSketch(`#include <Wire.h>
void writePort(byte value) { Wire.beginTransmission(${address}); Wire.write(value); Serial.print(Wire.endTransmission(false)); Serial.print(":"); Wire.requestFrom(${address},1); Serial.println(Wire.read(),HEX); }
void setup() {
  Serial.begin(115200); Wire.begin(); pinMode(7,OUTPUT); digitalWrite(7,LOW); pinMode(2,INPUT); delay(10);
  Wire.requestFrom(${address},1); Wire.read(); delay(2); Serial.print("initial:"); Serial.println(digitalRead(2));
  writePort(255); writePort(165); writePort(0); writePort(255);
  digitalWrite(7,HIGH); delay(2); Serial.print("irq:"); Serial.println(digitalRead(2));
  Wire.requestFrom(${address},1); Serial.println(Wire.read(),HEX); delay(2);
  Serial.print("clear:"); Serial.println(digitalRead(2));
}
void loop() {}`);
    expect(result.ok, result.stderr).toBe(true);
    const snap = fixture();
    snap.parts = [snap.parts[0], part('pcf', type, 1000), part('r', 'resistor', 2000, { resistance: 1000 }), part('pull', 'resistor', 3000, { resistance: 10000 })];
    const links = [
      ['pcf','VCC','mcu','5V'], ['pcf','GND','mcu','GND.1'], ['pcf','SDA','mcu','A4'], ['pcf','SCL','mcu','A5'],
      ['pcf','A0','mcu','GND.1'], ['pcf','A1','mcu','GND.1'], ['pcf','A2','mcu','GND.1'],
      ['pcf','P2','r','1'], ['r','2','mcu','D7'], ['pcf','INT','mcu','D2'], ['pcf','INT','pull','1'], ['pull','2','mcu','5V'],
    ];
    snap.wires = links.map(([a, ap, b, bp], i) => ({ id: `p${i}`, a: { part: a, pin: ap, x: 0, y: 0 }, b: { part: b, pin: bp, x: 0, y: 0 }, points: [], color: '#000' }));
    const { engine, serial } = run(snap, result.hex!, .15);
    expect(serial()).toContain('initial:1');
    expect(serial()).toContain('0:FB'); expect(serial()).toContain('0:A1'); expect(serial()).toContain('0:0');
    expect(serial()).toContain('irq:0'); expect(serial()).toContain('FF'); expect(serial()).toContain('clear:1');
    engine.stop();
  }, 60_000);
});
