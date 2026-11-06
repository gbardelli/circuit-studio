import { toWorld, type CircuitSnapshot, type PartData, type WireEnd } from '../core/types';
import { PARTS } from '../parts';
import type { Project } from './project';
import { HIDDEN_TEMPLATES, TEMPLATES, type Template } from './templates';

export function findTemplate(id: string | null) {
  return TEMPLATES.find((t) => t.id === id) ?? HIDDEN_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Instantánea de la plantilla con los ids = claves; sirve para la vista previa y para sembrar. */
export function templateSnapshot(t: Template): CircuitSnapshot {
  const parts: PartData[] = t.parts.map((p) => ({ id: p.key, type: p.type, x: p.x, y: p.y, rot: p.rot ?? 0, props: { ...PARTS[p.type].defaults, ...(p.props ?? {}) } }));
  const byKey = new Map(parts.map((p) => [p.id, p]));
  const end = ([key, pin]: [string, string]): WireEnd => {
    const part = byKey.get(key)!;
    const def = PARTS[part.type].pins(part.props).find((q) => q.id === pin);
    if (!def) throw new Error(`Plantilla ${t.id}: pin ${key}.${pin} no existe`);
    const pos = toWorld(part, def);
    return { part: key, pin, x: pos.x, y: pos.y };
  };
  return { parts, wires: t.wires.map((w, i) => ({ id: `w${i}`, a: end(w.a), b: end(w.b), points: w.points ?? [], color: w.color })) };
}

/** Huella del montaje de una plantilla: cambia cuando cambian sus piezas, cables o sketch. */
export function templateVersion(t: Template) {
  const text = JSON.stringify([t.parts, t.wires, t.sketch ?? '', t.legend ?? []]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** Plantilla de la que salió un circuito y si hay una versión más nueva de su montaje. */
export function templateUpdate(meta: { get(key: string): unknown }, name: string) {
  const saved = meta.get('template') as { id?: string; version?: string } | undefined;
  // Circuitos creados antes de guardar la plantilla: se reconocen por el nombre que les puso.
  const id = saved?.id ?? (/^Ascensor con integrados de clase/.test(name) ? 'elevator-class' : null);
  const t = findTemplate(id);
  if (!t || saved?.version === templateVersion(t)) return null;
  return t;
}

export function applyTemplate(project: Project, t: Template) {
  const snap = templateSnapshot(t);
  project.setMeta('template', { id: t.id, version: templateVersion(t) });
  if (t.legend?.length) project.setMeta('wiring.legend', t.legend.map((e) => ({ color: e.color.toLowerCase(), colors: [e.color.toLowerCase()], label: e.label })));
  const ids = new Map<string, string>();
  project.setName(t.name);
  for (const p of snap.parts) ids.set(p.id, project.addPart(p.type, p.x, p.y, t.parts.find((q) => q.key === p.id)?.props ?? {}, p.rot));
  for (const w of snap.wires) {
    project.addWire({ ...w.a, part: ids.get(w.a.part!) }, { ...w.b, part: ids.get(w.b.part!) }, w.points, w.color);
  }
  const uno = t.parts.find((p) => PARTS[p.type].mcu);
  if (uno && t.sketch) project.setSketch(ids.get(uno.key)!, t.sketch);
}
