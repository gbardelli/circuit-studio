// Modo diseño: circuitos lógicos ideales, al estilo de Logisim o CircuitVerse, independientes del
// modelo eléctrico. Cada hoja es un circuito; una hoja de tipo «ic» define un integrado propio
// que se usa dentro de otras hojas y, como integrado virtual, en la protoboard y el esquema.
import type { Props, Rotation, Vec } from '../core/types';

/** 0, 1 o X (sin conducir, conflicto o indeterminado). */
export type Bit = 0 | 1 | 2;
export const X: Bit = 2;

export interface LogicPinRef {
  node: string;
  pin: string;
}

export interface LogicNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  rot: Rotation;
  props: Props;
}

export interface LogicWire {
  id: string;
  a: LogicPinRef;
  b: LogicPinRef;
  /** Optional manually routed interior bends; terminal positions remain attached to nodes. */
  points?: Vec[];
  color?: string;
  label?: string;
}

export interface LogicSheet {
  id: string;
  kind: 'main' | 'ic';
  name: string;
  /** Referencia del integrado (p. ej. «CS-001»): la que se imprime sobre el encapsulado. */
  part: string;
  description: string;
  /** Orden de las patillas de señal (ids de nodos de entrada y salida). */
  order: string[];
  /** Patillas del encapsulado DIP; 0 = el menor que quepa. */
  package: number;
  nodes: LogicNode[];
  wires: LogicWire[];
}

export const MAIN_SHEET = 'main';
export const IC_PREFIX = 'ic:';
