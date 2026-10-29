import { toWorld, type CircuitSnapshot, type PartData, type WireEnd } from '../core/types';
import { PARTS } from '../parts';
import type { Project } from './project';
import { TEMPLATES, type Template } from './templates';

export function findTemplate(id: string | null) {
  return TEMPLATES.find((t) => t.id === id) ?? null;
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

export function applyTemplate(project: Project, t: Template) {
  const snap = templateSnapshot(t);
  const ids = new Map<string, string>();
  project.setName(t.name);
  for (const p of snap.parts) ids.set(p.id, project.addPart(p.type, p.x, p.y, t.parts.find((q) => q.key === p.id)?.props ?? {}, p.rot));
  for (const w of snap.wires) {
    project.addWire({ ...w.a, part: ids.get(w.a.part!) }, { ...w.b, part: ids.get(w.b.part!) }, w.points, w.color);
  }
  const uno = t.parts.find((p) => p.type === 'arduino-uno');
  if (uno && t.sketch) project.setSketch(ids.get(uno.key)!, t.sketch);
}
