import type { Category, PartDef } from './types';
import { SCH_PREFIX, schematicDef } from './symbols';
import { arduinoUno } from './arduino';
import { arduinoMega, arduinoNano } from './boards';
import { breadboardFull, breadboardHalf, breadboardMini } from './breadboard';
import { capacitor, ldr, potentiometer, resistor } from './basic';
import { buzzer, dcMotor, led, rgbLed, servo, sevenSegment } from './outputs';
import { diode, hcsr04, lcd1602, mosfet, relay, tmp36 } from './extra';
import { aaPack, battery9v, multimeter, npn, pushbutton, slideSwitch } from './misc';

export const PART_LIST: PartDef[] = [
  arduinoUno,
  arduinoNano,
  arduinoMega,
  breadboardHalf,
  breadboardFull,
  breadboardMini,
  resistor,
  capacitor,
  led,
  rgbLed,
  sevenSegment,
  lcd1602,
  relay,
  buzzer,
  servo,
  dcMotor,
  pushbutton,
  slideSwitch,
  potentiometer,
  ldr,
  tmp36,
  hcsr04,
  diode,
  mosfet,
  npn,
  battery9v,
  aaPack,
  multimeter,
];

export const PARTS: Record<string, PartDef> = Object.fromEntries(PART_LIST.map((d) => [d.type, d]));

// Símbolos de la vista de esquema: misma pieza, otra forma, mismos pines.
for (const d of PART_LIST) if (d.category !== 'Protoboards') PARTS[SCH_PREFIX + d.type] = schematicDef(d);

export const CATEGORIES: Category[] = ['Placas', 'Protoboards', 'Básicos', 'Entradas', 'Salidas', 'Semiconductores', 'Energía', 'Instrumentos'];
