import type { Category, PartDef } from './types';
import { arduinoUno } from './arduino';
import { breadboardFull, breadboardHalf, breadboardMini } from './breadboard';
import { capacitor, ldr, potentiometer, resistor } from './basic';
import { buzzer, dcMotor, led, rgbLed, servo, sevenSegment } from './outputs';
import { aaPack, battery9v, multimeter, npn, pushbutton, slideSwitch } from './misc';

export const PART_LIST: PartDef[] = [
  arduinoUno,
  breadboardHalf,
  breadboardFull,
  breadboardMini,
  resistor,
  capacitor,
  led,
  rgbLed,
  sevenSegment,
  buzzer,
  servo,
  dcMotor,
  pushbutton,
  slideSwitch,
  potentiometer,
  ldr,
  npn,
  battery9v,
  aaPack,
  multimeter,
];

export const PARTS: Record<string, PartDef> = Object.fromEntries(PART_LIST.map((d) => [d.type, d]));

export const CATEGORIES: Category[] = ['Placas', 'Protoboards', 'Básicos', 'Entradas', 'Salidas', 'Semiconductores', 'Energía', 'Instrumentos'];
