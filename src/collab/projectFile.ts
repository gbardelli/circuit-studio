import * as Y from 'yjs';
import { PARTS } from '../parts';
import { elementDef } from '../logic/elements';
import type { LogicSheet } from '../logic/types';
import type { Project } from './project';

export const PROJECT_FILE_EXTENSION = '.circuitstudio';
export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;
const FORMAT = 'circuitstudio-project';
const ROOTS = ['parts', 'wires', 'code', 'meta', 'logic'] as const;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type RecordData = Record<string, Json>;

export interface ProjectFile {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  document: {
    parts: Record<string, RecordData>;
    wires: Record<string, RecordData>;
    code: Record<string, string>;
    meta: RecordData;
    logic: Record<string, RecordData>;
  };
}

function invalid(message: string): never { throw new Error(message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label}: se esperaba un objeto.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') invalid(`${label}: se esperaba texto.`);
}
function finite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${label}: coordenada o valor inválido.`);
}
function rotation(value: unknown, label: string) {
  if (![0, 90, 180, 270].includes(value as number)) invalid(`${label}: giro inválido.`);
}
function positioned(value: Record<string, unknown>, label: string) {
  finite(value.x, label); finite(value.y, label); rotation(value.rot, label);
}
function point(value: unknown, label: string) {
  const p = record(value, label); finite(p.x, label); finite(p.y, label);
}
function properties(value: unknown, label: string) {
  for (const v of Object.values(record(value, label))) {
    if (!['string', 'number', 'boolean'].includes(typeof v)) invalid(`${label}: propiedad inválida.`);
  }
}
function boundedMap(value: unknown, label: string, limit: number) {
  const map = record(value, label);
  if (Object.keys(map).length > limit) invalid(`${label}: demasiados elementos.`);
  for (const id of Object.keys(map)) if (!id || id.length > 200) invalid(`${label}: identificador inválido.`);
  return map;
}

/** Validate before touching a live document or registering custom components. */
export function parseProjectFile(text: string): ProjectFile {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_FILE_BYTES) invalid('El archivo supera los 10 MB.');
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { invalid('El archivo no contiene un proyecto JSON válido.'); }
  // Reject dangerous keys and excessive nesting, including inside metadata and future fields.
  let count = 0;
  const inspect = (v: unknown, depth: number) => {
    if (++count > 500_000 || depth > 40) invalid('El archivo es demasiado complejo.');
    if (typeof v === 'number') finite(v, 'Archivo');
    if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid('El archivo contiene una clave no permitida.');
      inspect(child, depth + 1);
    }
  };
  inspect(raw, 0);
  const file = record(raw, 'Archivo');
  if (file.format !== FORMAT) invalid('Este archivo no es un proyecto de CircuitStudio.');
  if (file.version !== 1) invalid('Esta versión del archivo no es compatible. Actualiza CircuitStudio antes de abrirlo.');
  string(file.exportedAt, 'Fecha');
  if (!Number.isFinite(Date.parse(file.exportedAt))) invalid('La fecha del archivo no es válida.');
  const doc = record(file.document, 'Proyecto');
  if (Object.keys(doc).some(k => !(ROOTS as readonly string[]).includes(k))) invalid('El proyecto contiene secciones que esta versión no puede abrir.');
  const parts = boundedMap(doc.parts, 'Componentes', 10_000);
  const wires = boundedMap(doc.wires, 'Cables', 50_000);
  const code = boundedMap(doc.code, 'Código', 10_000);
  const meta = record(doc.meta, 'Metadatos');
  string(meta.name, 'Nombre');
  if (!meta.name.trim() || meta.name.length > 120) invalid('El nombre del proyecto no es válido.');
  const logic = boundedMap(doc.logic, 'Diseño', 500);
  const sheets: LogicSheet[] = [];
  for (const [id, value] of Object.entries(logic)) {
    const sheet = record(value, 'Hoja de diseño');
    if (!['main', 'ic'].includes(sheet.kind as string)) invalid('Tipo de hoja de diseño desconocido.');
    for (const key of ['name', 'part', 'description']) string(sheet[key], `Hoja: ${key}`);
    if (!Array.isArray(sheet.order) || sheet.order.some(v => typeof v !== 'string')) invalid('Orden de patillas inválido.');
    if (typeof sheet.package !== 'number' || !Number.isInteger(sheet.package) || sheet.package < 0 || sheet.package > 40) invalid('Encapsulado inválido.');
    const nodes = boundedMap(sheet.nodes, 'Elementos de diseño', 20_000);
    const links = boundedMap(sheet.wires, 'Conexiones de diseño', 50_000);
    for (const n of Object.values(nodes)) {
      const node = record(n, 'Elemento de diseño'); positioned(node, 'Elemento de diseño');
      string(node.kind, 'Tipo de elemento'); properties(node.props, 'Propiedades de diseño');
    }
    for (const w of Object.values(links)) for (const end of ['a', 'b']) {
      const ref = record(record(w, 'Conexión de diseño')[end], 'Terminal de diseño');
      string(ref.node, 'Elemento conectado'); string(ref.pin, 'Patilla');
      if (!Object.hasOwn(nodes, ref.node)) invalid('Una conexión de diseño apunta a un elemento que no existe.');
    }
    sheets.push({ ...sheet, id, nodes: Object.entries(nodes).map(([nid, n]) => ({ ...record(n, 'Elemento'), id: nid })), wires: Object.entries(links).map(([wid, w]) => ({ ...record(w, 'Conexión'), id: wid })) } as unknown as LogicSheet);
  }
  const lookup = (id: string) => sheets.find(s => s.id === id);
  for (const sheet of sheets) for (const node of sheet.nodes) {
    if (!elementDef(node.kind, lookup)) invalid(`Elemento de diseño no compatible: ${node.kind}.`);
  }
  for (const [id, value] of Object.entries(parts)) {
    const p = record(value, 'Componente'); string(p.type, 'Tipo de componente');
    // A custom IC must be defined in this file, never resolved through another open project.
    if (p.type.startsWith('ic:') ? !sheets.some(s => s.kind === 'ic' && `ic:${s.id}` === p.type) : !Object.hasOwn(PARTS, p.type)) invalid(`Componente no compatible: ${p.type}.`);
    positioned(p, `Componente ${id}`); properties(p.props, 'Propiedades');
    if (p.z !== undefined) finite(p.z, 'Orden de capas');
    if (p.sx !== undefined || p.sy !== undefined) { finite(p.sx, 'Esquema'); finite(p.sy, 'Esquema'); }
    if (p.srot !== undefined) rotation(p.srot, 'Esquema');
  }
  for (const value of Object.values(wires)) {
    const w = record(value, 'Cable');
    for (const end of ['a', 'b']) {
      const ref = record(w[end], 'Terminal'); point(ref, 'Terminal');
      if (ref.part !== undefined) {
        string(ref.part, 'Componente conectado'); string(ref.pin, 'Patilla');
        if (!Object.hasOwn(parts, ref.part)) invalid('Un cable apunta a un componente que no existe.');
      } else if (ref.pin !== undefined) invalid('Patilla sin componente.');
    }
    if (!Array.isArray(w.points) || w.points.length > 10_000) invalid('Recorrido de cable inválido.');
    w.points.forEach(p => point(p, 'Recorrido de cable'));
    string(w.color, 'Color');
    if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(w.color)) invalid('Color de cable inválido.');
    if (w.sch !== undefined && typeof w.sch !== 'boolean') invalid('Vista del cable inválida.');
  }
  for (const [id, source] of Object.entries(code)) {
    string(source, 'Código');
    if (source.length > 1_000_000) invalid('Un programa supera el tamaño permitido.');
    // Orphaned sketches are preserved: deleting a board does not currently delete its code.
    if (!id) invalid('Identificador de programa inválido.');
  }
  return file as unknown as ProjectFile;
}

/** Export live values only, without CRDT tombstones, room IDs, tokens or presence. */
export function exportProjectFile(project: Project): string {
  const unknown = [...project.doc.share.keys()].filter(k => !(ROOTS as readonly string[]).includes(k));
  if (unknown.length) invalid('El proyecto contiene secciones que esta versión no puede exportar.');
  const file = {
    format: FORMAT, version: 1, exportedAt: new Date().toISOString(),
    document: {
      parts: project.parts.toJSON(), wires: project.wires.toJSON(), code: project.code.toJSON(),
      meta: { ...project.meta.toJSON(), name: project.name }, logic: project.design.map.toJSON(),
    },
  };
  const text = JSON.stringify(file, null, 2);
  parseProjectFile(text);
  return text;
}

/** Fresh Yjs identities prevent an imported copy from merging with the original. */
export function projectFileDocument(file: ProjectFile): Y.Doc {
  // Revalidate public inputs so callers cannot bypass the parser accidentally.
  const data = parseProjectFile(JSON.stringify(file)).document;
  const doc = new Y.Doc();
  const map = (raw: RecordData) => new Y.Map<unknown>(Object.entries(raw));
  doc.transact(() => {
    for (const [id, p] of Object.entries(data.parts)) {
      const part = map(p); part.set('props', map(p.props as RecordData)); doc.getMap('parts').set(id, part);
    }
    for (const [id, w] of Object.entries(data.wires)) doc.getMap('wires').set(id, map(w));
    for (const [id, source] of Object.entries(data.code)) doc.getMap('code').set(id, new Y.Text(source));
    for (const [key, value] of Object.entries(data.meta)) doc.getMap('meta').set(key, value);
    for (const [id, s] of Object.entries(data.logic)) {
      const sheet = map(s);
      sheet.set('nodes', new Y.Map(Object.entries(s.nodes as Record<string, RecordData>).map(([key, value]) => [key, map(value)])));
      sheet.set('wires', map(s.wires as RecordData));
      doc.getMap('logic').set(id, sheet);
    }
  });
  return doc;
}

export function projectFileName(name: string) {
  return `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100) || 'CircuitStudio'}${PROJECT_FILE_EXTENSION}`;
}

export function projectFileSummary(file: ProjectFile) {
  const d = file.document;
  return { name: String(d.meta.name), parts: Object.keys(d.parts).length, wires: Object.keys(d.wires).length, sheets: Object.keys(d.logic).length, programs: Object.keys(d.code).length };
}
