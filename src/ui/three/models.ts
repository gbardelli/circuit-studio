import type { PartData } from '../../core/types';
import type { PartDef } from '../../parts/types';
import type { BuildCtx, Model } from './generic';
import { buildCeramic, buildDiode, buildDip, buildElectrolytic, buildLed, buildResistor, buildSevenSeg, isDip } from './families';
import {
  buildBenchSupply, buildBuzzer, buildMb102, buildDipSwitch, buildInstrument, buildLdr, buildLedBar, buildPcbModule, buildPot, buildPushbutton, buildRgbLed,
  buildSlideSwitch, buildSpeaker, buildTethered, buildTo220, buildTo92, buildUltrasonic, skinnedFallback,
} from './modules';

type Builder = (def: PartDef, part: PartData, ctx: BuildCtx) => Model;

/** Familia de encapsulado de cada tipo. Lo que no está aquí se decide por forma (DIP, placa) o cae al respaldo. */
const BY_TYPE: Record<string, Builder> = {
  resistor: buildResistor,
  led: buildLed,
  'seven-segment': buildSevenSeg,
  capacitor: buildElectrolytic,
  'capacitor-ceramic': buildCeramic,
  diode: buildDiode,
  'rgb-led': buildRgbLed,
  'led-bar-10': buildLedBar,
  pushbutton: buildPushbutton,
  'pushbutton-large': buildPushbutton,
  'slide-switch': buildSlideSwitch,
  'dip-switch-4': buildDipSwitch,
  'dip-switch-6': buildDipSwitch,
  'dip-switch-8': buildDipSwitch,
  potentiometer: buildPot,
  ldr: buildLdr,
  tmp36: buildTo92,
  npn: buildTo92,
  'mosfet-n': buildTo220,
  buzzer: buildBuzzer,
  'speaker-50mm': buildSpeaker,
  'hc-sr04': buildUltrasonic,
  'battery-9v': buildTethered,
  'aa-pack': buildTethered,
  servo: buildTethered,
  'dc-motor': buildTethered,
  'bench-supply': buildBenchSupply,
  'mb102-power': buildMb102,
  multimeter: buildInstrument,
  oscilloscope: buildInstrument,
  clock: buildInstrument,
};

const PCB_TYPES = new Set(['arduino-uno', 'arduino-nano', 'arduino-mega', 'arduino-giga', 'lcd-1602', 'lcd-i2c', 'nextion-28', 'giga-display-shield', 'relay', 'dfplayer-mini', 'level-converter-4', 'level-converter-8', 'mb102-power']);

/**
 * Modelos por familia de encapsulado. Cada familia es paramétrica y lee sus patillas de PartDef.pins.
 * Lo desconocido: integrado DIP si tiene la forma, placa si es de la categoría Placas, y si no, caja con su dibujo 2D.
 */
export function buildModel(def: PartDef, part: PartData, ctx: BuildCtx, base = 0): Model {
  const byType = BY_TYPE[def.type];
  if (byType) return byType(def, part, ctx);
  if (PCB_TYPES.has(def.type) || def.category === 'Placas' || def.stacksOn) return buildPcbModule(def, part, ctx, base);
  if (isDip(def.pins(part.props))) return buildDip(def, part, ctx);
  return skinnedFallback(def, part, ctx);
}
