import type { FC } from 'react';
import type { Element } from '../core/solver';
import type { PartData, PinDef, Props } from '../core/types';

export type Category = 'Placas' | 'Protoboards' | 'Básicos' | 'Salidas' | 'Entradas' | 'Semiconductores' | 'Lógica' | 'Integrados' | 'Energía' | 'Instrumentos';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Visual = Record<string, number | boolean | string | undefined>;

export interface RenderProps {
  part: PartData;
  visual: Visual | null;
  /** Interacción en vivo (pulsar un botón, girar un potenciómetro). */
  onInput?: (key: string, value: number | boolean) => void;
  preview?: boolean;
}

export type McuPinMode = 'high' | 'low' | 'input' | 'pullup';

/** Puente entre el emulador de CPU y el circuito: modo eléctrico de cada pin. */
export interface McuBridge {
  pinMode(index: number): McuPinMode;
  running: boolean;
}

export interface SimContext {
  props: Props;
  net(pin: string): number;
  /** Nodo interno de la pieza (p. ej. entre el LED y la resistencia de una retroiluminación). */
  node(): number;
  /** Entradas locales del usuario durante la simulación (botón pulsado, etc.). */
  input(key: string): number | boolean | undefined;
  mcu?: McuBridge;
}

export interface PartSim {
  elements: Element[];
  /** Muestra instantánea; el motor promedia en el tiempo cada valor numérico. */
  probe?(v: Float64Array): Record<string, number>;
  /** Para lo que no es un promedio (anchura de pulso de un servo, frecuencia de un zumbador). */
  tracker?: {
    sample(v: Float64Array, dt: number): void;
    read(): Visual;
  };
  /** Próximo instante (tiempo simulado) en que la pieza cambiará sola; el motor corta ahí el segmento. */
  nextEvent?(): number | null;
  /** True si la pieza cambió de estado desde la última consulta y hay que resolver el circuito. */
  changed?(): boolean;
  /** Nodo de cada pin digital del microcontrolador (por índice Arduino), para leer entradas. */
  mcuNodes?: number[];
  /** Nodo de cada entrada analógica (A0, A1…), para el ADC. */
  analogNodes?: number[];
}

export interface Field {
  key: string;
  label: string;
  kind: 'si' | 'select' | 'range' | 'color' | 'boolean';
  unit?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

/** Placa programable: perfil del emulador, placa para el compilador y pines por índice Arduino. */
export interface McuSpec {
  board: 'uno' | 'nano' | 'mega';
  fqbn: string;
  /** Índice Arduino (D0, D1…) → id del pin en la pieza. */
  pinIds: string[];
  /** Canal analógico (A0, A1…) → id del pin. */
  analogIds: string[];
}

export interface PartDef {
  type: string;
  mcu?: McuSpec;
  name: string;
  /** Referencia del fabricante (74HC00, NE555…): se muestra en la tarjeta y se busca. */
  partNumber?: string;
  /** Subgrupo dentro de la categoría (Puertas lógicas, Contadores…). */
  family?: string;
  category: Category;
  description: string;
  keywords: string[];
  defaults: Props;
  pins(props: Props): PinDef[];
  bounds(props: Props): Bounds;
  /** Grupos de pines unidos internamente (tiras de protoboard, pares de un pulsador). */
  internal?(props: Props): string[][];
  /** Pines que son la referencia de tierra del circuito. */
  ground?: string[];
  /** Pin preferido como referencia si la isla no tiene tierra (polo negativo de una batería). */
  reference?: string;
  sim?(ctx: SimContext): PartSim;
  fields?: Field[];
  /** Fidelidad mostrada en la biblioteca y el inspector. */
  model: 'SPICE' | 'Comportamental' | 'Ideal' | 'MCU' | 'Pasivo';
  Render: FC<RenderProps>;
  /** Escala de la miniatura en la biblioteca. */
  thumbScale?: number;
}
