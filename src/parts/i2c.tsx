import { Resistor, type Element } from '../core/solver';
import { Hd44780 } from '../sim/hd44780';
import { DipBody, dipPins } from './chips';
import { LcdRender, lcd1602 } from './extra';
import type { I2cSlave, PartDef, SimContext } from './types';

const at = (v: Float64Array, node: number) => node < 0 ? 0 : v[node];
const PORTS = Array.from({ length: 8 }, (_, i) => `P${i}`);
const PCF_PINS = ['A0', 'A1', 'A2', 'P0', 'P1', 'P2', 'P3', 'GND', 'P4', 'P5', 'P6', 'P7', 'INT', 'SCL', 'SDA', 'VCC'];
const PCF_DESC = {
  ...Object.fromEntries([0, 1, 2].map((i) => [`A${i}`, `Bit ${i} de dirección I²C; conecta a VCC o GND`])),
  ...Object.fromEntries(PORTS.map((pin) => [pin, 'Puerto cuasi-bidireccional: escribir 0 hunde corriente; escribir 1 libera con pull-up débil'])),
  INT: 'Interrupción activa baja, drenador abierto. Se libera al leer o escribir el puerto',
  SCL: 'Reloj del bus I²C, requiere pull-up', SDA: 'Datos del bus I²C, requiere pull-up',
  VCC: 'Alimentación positiva de 2.5 a 6 V', GND: 'Referencia común de alimentación y bus',
};

function pcfDef(variantA: boolean): PartDef {
  const name = variantA ? 'PCF8574A' : 'PCF8574';
  return {
    type: name.toLowerCase(), name: 'Expansor I²C de 8 puertos', partNumber: name,
    category: 'Integrados', family: 'Expansores I²C',
    description: `Ocho puertos cuasi-bidireccionales por I²C. Dirección ${variantA ? '0x38–0x3F' : '0x20–0x27'} mediante A0–A2. Compatible con Wire en el bus hardware del Arduino.`,
    keywords: ['i2c', 'i²c', 'expansor', 'puertos', 'gpio', 'wire', 'lcd', name.toLowerCase()],
    defaults: {}, pins: () => dipPins({ pins: PCF_PINS, desc: PCF_DESC }),
    bounds: () => ({ x: -6, y: -2, w: 82, h: 34 }), ground: ['GND'], model: 'Comportamental',
    Render: () => <DipBody count={16} part={name} maker="TI" />,
    sim(ctx) {
      const gnd = ctx.net('GND'), vcc = ctx.net('VCC');
      const nodes = PORTS.map((pin) => ctx.net(pin));
      let latch = 0xff, powered = false, interrupt = false, previous = 0xff, dirty = false;
      let rebaseline = true;
      const sample = (v: Float64Array) => nodes.reduce((value, node, i) => value | (at(v, node) - at(v, gnd) > (at(v, vcc) - at(v, gnd)) * .5 ? 1 << i : 0), 0);
      const isPowered = (v: Float64Array) => at(v, vcc) - at(v, gnd) >= 2.5;
      const elements: Element[] = [new Resistor(vcc, gnd, () => 500_000), {
        nonlinear: true,
        stamp(s) {
          const on = s.volt(vcc) - s.volt(gnd) >= 2.5;
          s.conductance(ctx.net('INT'), gnd, on && interrupt ? 1 / 25 : 1e-10);
          for (const [i, node] of nodes.entries()) {
            s.conductance(node, gnd, on && !(latch & (1 << i)) ? 1 / 25 : 1e-10);
            s.conductance(node, vcc, on && Boolean(latch & (1 << i)) ? 1 / 50_000 : 1e-10);
          }
        },
      }];
      for (const pin of ['A0', 'A1', 'A2', 'SDA', 'SCL']) elements.push(new Resistor(ctx.net(pin), gnd, () => 1e8));
      const i2c: I2cSlave = {
        pins: { sda: 'SDA', scl: 'SCL', ground: 'GND', supply: 'VCC' }, powered: isPowered,
        address: (v) => (variantA ? 0x38 : 0x20) | [0, 1, 2].reduce((value, i) => value | (at(v, ctx.net(`A${i}`)) - at(v, gnd) > (at(v, vcc) - at(v, gnd)) * .5 ? 1 << i : 0), 0),
        write(value, v) { latch = value; interrupt = false; previous = sample(v); rebaseline = true; dirty = true; return true; },
        read(v) { const value = sample(v) & latch; interrupt = false; previous = sample(v); dirty = true; return value; },
      };
      return {
        elements, i2c,
        afterSolve(v) { if (rebaseline) { previous = sample(v); rebaseline = false; } },
        changed() { const changed = dirty; dirty = false; return changed; },
        tracker: {
          sample(v) {
            const next = isPowered(v);
            if (next !== powered) { powered = next; latch = 0xff; interrupt = false; rebaseline = true; dirty = true; return; }
            if (!powered) return;
            const value = sample(v);
            if ((value ^ previous) & latch) { interrupt = true; dirty = true; }
            previous = value;
          },
          read: () => ({ powered, value: latch, interrupt }),
        },
      };
    },
  };
}
export const pcf8574 = pcfDef(false);
export const pcf8574a = pcfDef(true);

function lcdBackpack(ctx: SimContext) {
  const gnd = ctx.net('GND'), vcc = ctx.net('VCC');
  let lcd = new Hd44780();
  let port = 0xff, powered = false;
  const isPowered = (v: Float64Array) => at(v, vcc) - at(v, gnd) >= 4;
  const i2c: I2cSlave = {
    pins: { sda: 'SDA', scl: 'SCL', ground: 'GND', supply: 'VCC' }, powered: isPowered,
    address: () => Number(ctx.props.address ?? '0x27'),
    write(value) {
      // Common backpack: RS=P0, RW=P1, E=P2, backlight=P3, D4–D7=P4–P7.
      if ((port & 4) && !(value & 4) && !(port & 2)) lcd.strobe(Boolean(port & 1), port & 0xf0);
      port = value;
      return true;
    },
    read: () => port,
  };
  return {
    elements: [
      new Resistor(vcc, gnd, () => powered && Boolean(port & 8) ? 330 : 5000),
      new Resistor(ctx.net('SDA'), vcc, () => 4700), new Resistor(ctx.net('SCL'), vcc, () => 4700),
    ],
    i2c,
    tracker: {
      sample(v: Float64Array) {
        const next = isPowered(v);
        if (!next && powered) { lcd = new Hd44780(); port = 0xff; }
        powered = next;
      },
      read: () => ({ on: powered && lcd.displayOn, line0: lcd.line(0), line1: lcd.line(1), backlight: powered && Boolean(port & 8) ? .015 : 0, v: lcd.version }),
    },
  };
}

export const lcdI2c: PartDef = {
  type: 'lcd-i2c', name: 'Pantalla LCD 16×2 I²C', category: 'Salidas',
  description: 'LCD HD44780 con adaptador PCF8574 y cuatro conexiones. Compatible con LiquidCrystal_I2C 1.1.2. Dirección por defecto 0x27; incluye pull-ups de SDA/SCL.',
  keywords: ['lcd', '16x2', '1602', 'i2c', 'i²c', 'pcf8574', 'liquidcrystal_i2c', 'pantalla', 'display', 'wire'],
  defaults: { color: 'blue', address: '0x27' },
  pins: () => ['GND', 'VCC', 'SDA', 'SCL'].map((id, i) => ({ id, x: -40, y: -100 + i * 10, kind: 'leg' as const, label: id, desc: {
    GND: 'Tierra común con el Arduino', VCC: 'Alimentación de 5 V', SDA: 'Datos: A4 en Uno/Nano; D20 en Mega', SCL: 'Reloj: A5 en Uno/Nano; D21 en Mega',
  }[id] })),
  bounds: () => ({ x: -42, y: -151, w: 343, h: 152 }), ground: ['GND'],
  fields: [...lcd1602.fields!, { key: 'address', label: 'Dirección I²C', kind: 'select', options: [0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f].map((address) => ({ value: `0x${address.toString(16).toUpperCase()}`, label: `0x${address.toString(16).toUpperCase()}` })) }],
  model: 'Comportamental', Render: LcdRender, sim: lcdBackpack,
};
