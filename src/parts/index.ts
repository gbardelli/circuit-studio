import type { Category, PartDef } from './types';
import { SCH_PREFIX, schematicDef } from './symbols';
import { arduinoUno } from './arduino';
import { arduinoMega, arduinoNano } from './boards';
import { arduinoGiga } from './giga';
import { breadboardFull, breadboardHalf, breadboardMini } from './breadboard';
import { capacitor, ceramicCapacitor, ldr, potentiometer, resistor } from './basic';
import { buzzer, dcMotor, led, rgbLed, servo, sevenSegment } from './outputs';
import { diode, hcsr04, lcd1602, mosfet, relay, tmp36 } from './extra';
import { aaPack, battery9v, multimeter, npn, pushbutton, slideSwitch } from './misc';
import { CHIPS } from './chips';
import { oscilloscope } from './scope';
import { benchSupply, clockGen, dipSwitch4, dipSwitch6, dipSwitch, ledBar } from './supply';
import { lcdI2c, pcf8574, pcf8574a } from './i2c';
import { nextion } from './nextion';
import { gigaDisplayShield } from './gigaDisplay';
import { levelConverter, levelConverter8 } from './levelConverter';
import { breadboardPower } from './breadboardPower';

export const PART_LIST: PartDef[] = [
  arduinoUno,
  arduinoNano,
  arduinoMega,
  arduinoGiga,
  breadboardHalf,
  breadboardFull,
  breadboardMini,
  resistor,
  capacitor,
  ceramicCapacitor,
  led,
  rgbLed,
  ledBar,
  sevenSegment,
  lcd1602,
  lcdI2c,
  nextion,
  gigaDisplayShield,
  relay,
  buzzer,
  servo,
  dcMotor,
  pushbutton,
  slideSwitch,
  dipSwitch4,
  dipSwitch6,
  dipSwitch,
  clockGen,
  potentiometer,
  ldr,
  tmp36,
  hcsr04,
  diode,
  mosfet,
  npn,
  levelConverter,
  levelConverter8,
  ...CHIPS,
  pcf8574,
  pcf8574a,
  benchSupply,
  breadboardPower,
  battery9v,
  aaPack,
  multimeter,
  oscilloscope,
];

export const PARTS: Record<string, PartDef> = Object.fromEntries(PART_LIST.map((d) => [d.type, d]));

// Símbolos de la vista de esquema: misma pieza, otra forma, mismos pines.
for (const d of PART_LIST) if (d.category !== 'Protoboards') PARTS[SCH_PREFIX + d.type] = schematicDef(d);

export const CATEGORIES: Category[] = ['Placas', 'Protoboards', 'Básicos', 'Entradas', 'Salidas', 'Semiconductores', 'Lógica', 'Integrados', 'Energía', 'Instrumentos'];

// ── Integrados propios del modo diseño ────────────────────────────────────────────
// Cambian con el proyecto: se registran aquí (y en el worker de simulación) al cargarlo.
const CUSTOM = 'ic:';
let customKey = '';
let partsVersion = 0;
const partListeners = new Set<() => void>();

/** Sustituye los integrados propios registrados. `key` evita trabajo si no cambiaron. */
export function setCustomParts(defs: PartDef[], key: string) {
  if (key === customKey) return false;
  customKey = key;
  for (let i = PART_LIST.length - 1; i >= 0; i--) if (PART_LIST[i].type.startsWith(CUSTOM)) PART_LIST.splice(i, 1);
  for (const type of Object.keys(PARTS)) if (type.startsWith(CUSTOM) || type.startsWith(SCH_PREFIX + CUSTOM)) delete PARTS[type];
  for (const d of defs) {
    PART_LIST.push(d);
    PARTS[d.type] = d;
    PARTS[SCH_PREFIX + d.type] = schematicDef(d);
  }
  partsVersion++;
  partListeners.forEach((l) => l());
  return true;
}

export function subscribeParts(fn: () => void) {
  partListeners.add(fn);
  return () => partListeners.delete(fn);
}

export const getPartsVersion = () => partsVersion;
