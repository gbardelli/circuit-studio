import { PART_LIST } from '../parts';
import type { PartDef } from '../parts/types';

export const CATALOG_SECTIONS = [
  { id: 'boards', name: 'Placas y protoboards', description: 'Arduino y montaje' },
  { id: 'basic', name: 'Componentes básicos', description: 'Resistencias, diodos y transistores' },
  { id: 'inputs', name: 'Entradas y sensores', description: 'Interruptores, controles y señales' },
  { id: 'outputs', name: 'Salidas y actuadores', description: 'LEDs, pantallas, motores y sonido' },
  { id: 'logic', name: 'Integrados y lógica', description: 'Compuertas, memoria y contadores' },
  { id: 'power', name: 'Alimentación y medida', description: 'Fuentes, baterías e instrumentos' },
] as const;
export type CatalogSection = typeof CATALOG_SECTIONS[number]['id'];

export function sectionOf(def: PartDef): CatalogSection {
  if (def.mcu || def.category === 'Protoboards') return 'boards';
  if (def.category === 'Energía' || def.category === 'Instrumentos') return 'power';
  if (def.category === 'Lógica' || def.category === 'Integrados') return 'logic';
  if (def.category === 'Entradas' || ['potentiometer', 'ldr'].includes(def.type)) return 'inputs';
  if (def.category === 'Salidas') return 'outputs';
  return 'basic';
}

function groupOf(def: PartDef): string {
  switch (sectionOf(def)) {
    case 'boards': return def.mcu ? 'Arduino' : 'Protoboards';
    case 'basic': return def.category === 'Semiconductores' ? 'Diodos y transistores' : 'Resistencias y condensadores';
    case 'inputs': return ['ldr', 'tmp36', 'hc-sr04'].includes(def.type) ? 'Sensores' : def.type === 'clock' ? 'Generadores de señal' : 'Interruptores y controles';
    case 'outputs': return ['dc-motor', 'servo', 'buzzer', 'relay'].includes(def.type) ? 'Actuadores' : 'LEDs y pantallas';
    case 'logic': return def.family ?? 'Otros integrados';
    case 'power': return def.category === 'Instrumentos' ? 'Instrumentos' : 'Fuentes y baterías';
  }
}

export function catalogGroups(section: CatalogSection) {
  const groups = new Map<string, PartDef[]>();
  for (const def of PART_LIST.filter((part) => sectionOf(part) === section)) {
    const title = groupOf(def);
    groups.set(title, [...(groups.get(title) ?? []), def]);
  }
  return [...groups].map(([title, items]) => ({ title, items }));
}

export function partLabel(def: PartDef) {
  return {
    title: def.partNumber ?? def.name,
    detail: def.partNumber ? def.name.replace(def.partNumber, '').trim() : null,
  };
}
