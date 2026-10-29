import { useEffect, useState } from 'react';
import { Code2, Copy, MousePointer2, RotateCw, Spline, Terminal, Trash2, Users } from 'lucide-react';
import { formatSI, parseSI } from '../core/units';
import { PARTS } from '../parts';
import { schematicPlacement } from './schematic';
import { LED_COLORS } from '../parts/outputs';
import type { Field } from '../parts/types';
import type { PartData } from '../core/types';
import { useEditor, usePeers, useSnapshot, useVisual } from './context';
import { WIRE_COLORS } from './geometry';
import { Thumb } from './Library';
import { useUi } from './store';

const METRICS: Record<string, { label: string; unit: string }> = {
  i: { label: 'Corriente', unit: 'A' },
  p: { label: 'Potencia', unit: 'W' },
  v: { label: 'Tensión', unit: 'V' },
  ic: { label: 'I colector', unit: 'A' },
  ib: { label: 'I base', unit: 'A' },
  r: { label: 'Rojo', unit: 'A' },
  g: { label: 'Verde', unit: 'A' },
  b: { label: 'Azul', unit: 'A' },
  angle: { label: 'Ángulo', unit: '°' },
  freq: { label: 'Frecuencia', unit: 'Hz' },
};

/** Campos de selección que se muestran como muestras de color. */
const SWATCHES: Record<string, Record<string, string>> = {
  color: Object.fromEntries(Object.entries(LED_COLORS).map(([k, c]) => [k, c.body])),
  cap: { red: '#d63a2f', black: '#1e1f22', blue: '#2f6fe8', green: '#2fbf4a', yellow: '#f2d21c' },
};

export function Inspector() {
  const snapshot = useSnapshot();
  const selection = useUi((s) => s.selection);
  const wireSelection = useUi((s) => s.wireSelection);
  const parts = snapshot.parts.filter((p) => selection.includes(p.id));
  const wires = snapshot.wires.filter((w) => wireSelection.includes(w.id));

  return (
    <aside className="inspector" aria-label="Propiedades">
      {parts.length === 1 && wires.length === 0 ? (
        <PartInspector key={parts[0].id} part={parts[0]} />
      ) : parts.length === 0 && wires.length > 0 ? (
        wires.every((w) => w.sch) ? (
          <SchematicLinkInspector ids={wires.map((w) => w.id)} />
        ) : (
          <WireInspector ids={wires.map((w) => w.id)} color={wires[0].color} />
        )
      ) : parts.length + wires.length > 1 ? (
        <MultiInspector parts={parts.length} wires={wires.length} />
      ) : (
        <EmptyInspector />
      )}
    </aside>
  );
}

/** Sin selección: lista de materiales del circuito (como la de Tinkercad) y quién está dentro. */
function EmptyInspector() {
  const snapshot = useSnapshot();
  const peers = usePeers();
  const { project } = useEditor();
  const select = useUi((s) => s.select);
  const groups = new Map<string, string[]>();
  for (const p of snapshot.parts) groups.set(p.type, [...(groups.get(p.type) ?? []), p.id]);
  const rows = [...groups.entries()].sort((a, b) => PARTS[a[0]].name.localeCompare(PARTS[b[0]].name));

  return (
    <>
      <div className="insp-card">
        <div className="insp-head">
          <h2>Componentes</h2>
        </div>
        {rows.length === 0 ? (
          <p className="insp-hint">Arrastra piezas desde la izquierda o empieza por una protoboard.</p>
        ) : (
          <ul className="bom" aria-label="Lista de materiales">
            {rows.map(([type, ids]) => (
              <li key={type}>
                <button onClick={() => select(ids, [])} title="Seleccionar en el lienzo">
                  <Thumb def={PARTS[type]} />
                  <span className="bom-name">{PARTS[type].name}</span>
                  <span className="bom-count">{ids.length}</span>
                </button>
              </li>
            ))}
            {snapshot.wires.length > 0 && (
              <li>
                <button onClick={() => select([], snapshot.wires.map((w) => w.id))} title="Seleccionar todos los cables">
                  <span className="thumb bom-icon">
                    <Spline size={15} />
                  </span>
                  <span className="bom-name">Cables</span>
                  <span className="bom-count">{snapshot.wires.length}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="insp-card">
        <div className="insp-head">
          <h2>En el circuito</h2>
        </div>
        <ul className="people">
          <li>
            <span className="avatar" style={{ background: project.user.color }}>
              {project.user.name.slice(0, 2).toUpperCase()}
            </span>
            <span>{project.user.name}</span>
            <span className="faint">tú</span>
          </li>
          {peers.map((p) => (
            <li key={p.clientId}>
              <span className="avatar" style={{ background: p.user.color }}>
                {p.user.name.slice(0, 2).toUpperCase()}
              </span>
              <span>{p.user.name}</span>
              <span className="faint">{p.drag ? 'moviendo' : p.selection?.length ? 'editando' : 'mirando'}</span>
            </li>
          ))}
        </ul>
        {peers.length === 0 && <p className="insp-hint">Comparte el enlace para editar a la vez.</p>}
      </div>
    </>
  );
}

function MultiInspector({ parts, wires }: { parts: number; wires: number }) {
  const { project } = useEditor();
  const selection = useUi((s) => s.selection);
  const wireSelection = useUi((s) => s.wireSelection);
  const select = useUi((s) => s.select);
  return (
    <div className="insp-card">
      <div className="insp-empty">
        <h2>
          {parts + wires} elementos
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {parts} componentes · {wires} cables
        </p>
      </div>
      <div className="insp-section">
        <div className="actions">
          {parts > 0 && (
            <button className="btn sm" onClick={() => project.rotateParts(selection)}>
              <RotateCw size={13} /> Rotar
            </button>
          )}
          {parts > 0 && (
            <button className="btn sm" onClick={() => select(project.duplicate(selection, 20, 20), [])}>
              <Copy size={13} /> Duplicar
            </button>
          )}
          <button className="btn sm danger" onClick={() => (project.deleteItems(selection, wireSelection), select([], []))}>
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Conexión dibujada en el esquema: no tiene color ni codos, solo existe o no. */
function SchematicLinkInspector({ ids }: { ids: string[] }) {
  const { project } = useEditor();
  const select = useUi((s) => s.select);
  return (
    <div className="insp-card">
      <div className="insp-hero">
        <span className="thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sch-wire)' }}>
          <Spline size={26} />
        </span>
        <div>
          <h2>{ids.length === 1 ? 'Conexión del esquema' : `${ids.length} conexiones del esquema`}</h2>
        </div>
      </div>
      <div className="insp-section">
        <p className="faint" style={{ margin: '0 0 10px', fontSize: 12 }}>
          Cuenta para la simulación. En la protoboard se ve discontinua hasta que pongas el cable.
        </p>
        <div className="actions">
          <button className="btn sm danger" onClick={() => (project.deleteItems([], ids), select([], []))}>
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function WireInspector({ ids, color }: { ids: string[]; color: string }) {
  const { project } = useEditor();
  const select = useUi((s) => s.select);
  return (
    <div className="insp-card">
      <div className="insp-hero">
        <span className="thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <Spline size={26} />
        </span>
        <div>
          <h2>{ids.length === 1 ? 'Cable de puente' : `${ids.length} cables`}</h2>
        </div>
      </div>
      <div className="insp-section">
        <h3>Color</h3>
        <div className="swatches">
          {WIRE_COLORS.map((c) => (
            <button key={c.value} className="swatch" style={{ background: c.value }} aria-label={c.label} title={c.label} aria-pressed={c.value === color} onClick={() => ids.forEach((id) => project.updateWire(id, { color: c.value }))} />
          ))}
        </div>
      </div>
      <div className="insp-section">
        <p className="faint" style={{ margin: '0 0 10px', fontSize: 12 }}>
          Arrastra el cable para crear un codo. Doble clic en un codo lo elimina.
        </p>
        <div className="actions">
          <button className="btn sm" onClick={() => ids.forEach((id) => project.updateWire(id, { points: [] }))}>
            <MousePointer2 size={13} /> Enderezar
          </button>
          <button className="btn sm danger" onClick={() => (project.deleteItems([], ids), select([], []))}>
            <Trash2 size={13} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function PartInspector({ part }: { part: PartData }) {
  const { project } = useEditor();
  const def = PARTS[part.type];
  const visual = useVisual(part.id);
  const simRunning = useUi((s) => s.simRunning);
  const view = useUi((s) => s.view);
  const openCode = useUi((s) => s.openCode);
  const select = useUi((s) => s.select);
  const peers = usePeers().filter((p) => p.selection?.includes(part.id));
  const metrics = visual ? Object.entries(visual).filter(([k, v]) => METRICS[k] && typeof v === 'number') : [];

  return (
    <>
      <div className="insp-card">
        <div className="insp-hero">
          <Thumb def={def} />
          <div style={{ minWidth: 0 }}>
            <h2>{def.name}</h2>
            <p className="insp-desc" title={def.description}>{def.description}</p>
          </div>
        </div>
        {peers.length > 0 && (
          <div className="insp-section" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <span className="peer-note" style={{ margin: 0 }}>
              <Users size={13} />
              {peers.map((p) => (
                <strong key={p.clientId} style={{ color: p.user.color, fontWeight: 600 }}>
                  {p.user.name}
                </strong>
              ))}
              también lo está mirando
            </span>
          </div>
        )}
        {def.fields && def.fields.length > 0 && (
          <div className="insp-section">
            {def.fields.map((f) => (
              <FieldEditor key={f.key} field={f} value={part.props[f.key]} onChange={(v) => project.setProp(part.id, f.key, v)} />
            ))}
          </div>
        )}
        {def.mcu && (
          <div className="insp-section">
            <h3>Programa</h3>
            <div className="actions">
              <button className="btn sm accent" onClick={() => openCode(part.id, 'code')}>
                <Code2 size={13} /> Código
              </button>
              <button className="btn sm" onClick={() => openCode(part.id, 'serial')}>
                <Terminal size={13} /> Serie
              </button>
            </div>
          </div>
        )}
        <div className="insp-section">
          <div className="actions">
            <button className="btn sm" onClick={() => view === 'schematic' ? project.rotateSchematic([part.id], schematicPlacement(project.snapshot().parts)) : project.rotateParts([part.id])} title="Rotar · R">
              <RotateCw size={13} /> Rotar
            </button>
            <button className="btn sm" onClick={() => select(project.duplicate([part.id], 20, 20), [])} title="Duplicar · Ctrl D">
              <Copy size={13} /> Duplicar
            </button>
            <button className="btn sm danger icon-only" onClick={() => (project.deleteItems([part.id], []), select([], []))} title="Eliminar · Supr" aria-label="Eliminar">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
      {simRunning && metrics.length > 0 && (
        <section className="insp-section measurements" aria-label="Mediciones">
            <h3>Mediciones</h3>
            <dl className="readouts">
              {metrics.map(([k, v]) => (
                <div key={k} className="readout">
                  <dt className="k">{METRICS[k].label}</dt>
                  <dd className="v">{METRICS[k].unit === '°' ? `${Math.round(Number(v))}°` : formatSI(Math.abs(Number(v)) < 1e-9 ? 0 : Number(v), METRICS[k].unit)}</dd>
                </div>
              ))}
            </dl>
        </section>
      )}
    </>
  );
}

function FieldEditor({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: string | number | boolean) => void }) {
  const id = `f-${field.key}`;
  if (field.kind === 'si') return <SiField id={id} field={field} value={Number(value)} onChange={onChange} />;
  if (field.kind === 'select') {
    const numeric = field.options!.every((o) => !Number.isNaN(Number(o.value)));
    const colors = SWATCHES[field.key];
    if (colors) {
      return (
        <div className="prop">
          <span className="label">{field.label}</span>
          <div className="swatches">
            {field.options!.map((o) => (
              <button key={o.value} className="swatch" style={{ background: colors[o.value] }} title={o.label} aria-label={o.label} aria-pressed={String(value) === o.value} onClick={() => onChange(o.value)} />
            ))}
          </div>
        </div>
      );
    }
    if (field.options!.length <= 3) {
      return (
        <div className="prop">
          <span className="label">{field.label}</span>
          <div className="segmented" role="group" aria-label={field.label}>
            {field.options!.map((o) => (
              <button key={o.value} aria-pressed={String(value) === o.value} onClick={() => onChange(numeric ? Number(o.value) : o.value)}>
                {o.label.replace(/\s*\(.*\)/, '')}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="prop">
        <label htmlFor={id}>{field.label}</label>
        <select id={id} className="input" value={String(value)} onChange={(e) => onChange(numeric ? Number(e.target.value) : e.target.value)}>
          {field.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.kind === 'range') {
    const v = Number(value);
    const pct = ((v - (field.min ?? 0)) / ((field.max ?? 1) - (field.min ?? 0))) * 100;
    return (
      <div className="prop">
        <label htmlFor={id}>{field.label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input id={id} type="range" min={field.min} max={field.max} step={field.step} value={v} style={{ ['--fill' as string]: `${pct}%` }} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="mono muted" style={{ minWidth: 34, textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
            {field.unit ? formatSI(v, field.unit) : `${Math.round(pct)}%`}
          </span>
        </div>
      </div>
    );
  }
  if (field.kind === 'boolean') {
    return (
      <div className="prop">
        <span className="label">{field.label}</span>
        <button className="switch" role="switch" aria-checked={Boolean(value)} aria-label={field.label} onClick={() => onChange(!value)} />
      </div>
    );
  }
  return null;
}

function SiField({ id, field, value, onChange }: { id: string; field: Field; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(formatSI(value, field.unit));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatSI(value, field.unit));
  }, [value, field.unit, focused]);
  const parsed = parseSI(text);
  const valid = parsed !== null && parsed > 0;
  const commit = () => {
    if (valid && parsed !== value) onChange(parsed);
    else setText(formatSI(value, field.unit));
  };
  return (
    <div className="prop">
      <label htmlFor={id}>{field.label}</label>
      <input
        id={id}
        className={`input mono ${valid ? '' : 'invalid'}`}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(formatSI(value, field.unit));
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-invalid={!valid}
      />
      {focused && <span className={`help ${valid ? '' : 'error'}`}>{valid ? `= ${formatSI(parsed!, field.unit, 4)}` : 'Prueba 220, 4k7 o 10u'}</span>}
    </div>
  );
}
