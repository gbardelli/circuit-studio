// Panel de propiedades del modo diseño: el elemento seleccionado o, sin selección, la hoja. En
// un integrado propio: nombre, referencia, encapsulado, orden de patillas y tabla de verdad.
import { ArrowDown, ArrowUp, CircuitBoard, Cpu, PackagePlus, RotateCw, Trash2 } from 'lucide-react';
import { useMemo, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { elementDef, icSignals, pinName, visualPinOrder } from '../../logic/elements';
import { DIP_SIZES, icIssues, packagePins, packageSize } from '../../logic/ic';
import { truthTable } from '../../logic/sim';
import { IC_PREFIX, MAIN_SHEET, type Bit, type LogicSheet } from '../../logic/types';
import { useEditor } from '../context';
import { useUi } from '../store';
import { useCreateIc } from './SheetTabs';
import { useDesignUi } from './store';
import { useLookup, useSheet } from './useLogic';
import { drawCtx } from './geometry';
import { WIRE_COLORS } from '../geometry';

export function DesignInspector() {
  const sheetId = useDesignUi((s) => s.sheet);
  const nodes = useDesignUi((s) => s.nodes);
  const wires = useDesignUi((s) => s.wires);
  const sheet = useSheet(sheetId);
  const selected = sheet.nodes.filter((n) => nodes.includes(n.id));
  const selWires = sheet.wires.filter((w) => wires.includes(w.id));
  return (
    <aside className="inspector d-inspector" aria-label="Propiedades del diseño">
      {selected.length === 1 && selWires.length === 0 ? (
        <NodeInspector sheet={sheet} id={selected[0].id} />
      ) : selected.length + selWires.length > 0 ? (
        <SelectionInspector sheet={sheet} nodes={selected.map((n) => n.id)} wires={selWires.map((w) => w.id)} />
      ) : sheet.kind === 'ic' ? (
        <IcInspector sheet={sheet} />
      ) : (
        <MainInspector sheet={sheet} />
      )}
    </aside>
  );
}

function NodeInspector({ sheet, id }: { sheet: LogicSheet; id: string }) {
  const { project } = useEditor();
  const lookup = useLookup();
  const node = sheet.nodes.find((n) => n.id === id)!;
  const def = elementDef(node.kind, lookup);
  if (!def) return null;
  const signals = sheet.kind === 'ic' ? icSignals(sheet) : [];
  const pinIndex = packagePins(sheet).findIndex((p) => p.node === node.id);
  const isIc = node.kind.startsWith(IC_PREFIX);
  return (
    <div className="insp-card">
      <div className="insp-head">
        <h2>{isIc ? lookup(node.kind.slice(IC_PREFIX.length))?.name || def.name : def.name}</h2>
      </div>
      <p className="insp-hint">{def.description}</p>
      {sheet.kind === 'ic' && (node.kind === 'in' || node.kind === 'out') && pinIndex >= 0 && (
        <p className="d-badge">
          <Cpu size={12} /> Patilla {pinIndex + 1} del encapsulado · {node.kind === 'in' ? 'entrada' : 'salida'} {pinName(node, signals.indexOf(signals.find((s) => s.id === node.id)!))}
        </p>
      )}
      {def.fields?.map((f) => (
        <div key={f.key} className="insp-section">
          <label className="label" htmlFor={`d-${f.key}`}>
            {f.label}
          </label>
          {f.kind === 'select' ? (
            <select className="input" id={`d-${f.key}`} value={String(node.props[f.key] ?? def.defaults[f.key] ?? '')} onChange={(e) => project.design.setProp(sheet.id, id, f.key, Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}>
              {f.options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.kind === 'number' ? (
            <div className="d-number">
              <input
                className="input"
                id={`d-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                step={f.step ?? 1}
                value={Number(node.props[f.key] ?? def.defaults[f.key])}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) project.design.setProp(sheet.id, id, f.key, Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, v)));
                }}
              />
              {f.unit && <span>{f.unit}</span>}
            </div>
          ) : (
            <DraftText
              className="input"
              id={`d-${f.key}`}
              multiline={f.kind === 'longtext'}
              rows={3}
              value={String(node.props[f.key] ?? '')}
              maxLength={f.kind === 'longtext' ? 400 : 40}
              placeholder={f.key === 'label' && sheet.kind === 'ic' ? 'Nombre de la patilla' : undefined}
              onCommit={(v) => project.design.setProp(sheet.id, id, f.key, v)}
            />
          )}
        </div>
      ))}
      {isIc && (
        <div className="insp-section">
          <button className="btn sm" onClick={() => useDesignUi.getState().setSheet(node.kind.slice(IC_PREFIX.length))}>
            <Cpu size={14} /> Abrir el integrado
          </button>
        </div>
      )}
      {(isIc || node.kind.startsWith('chip:')) && <PinOrderEditor sheet={sheet} id={id} />}
      <div className="insp-section actions">
        <button className="btn sm" onClick={() => project.design.rotateNodes(sheet.id, [id])} title="Girar · R">
          <RotateCw size={14} /> Girar
        </button>
        <button
          className="btn sm danger"
          onClick={() => {
            project.design.delete(sheet.id, [id], []);
            useDesignUi.getState().select([]);
          }}
          title="Eliminar · Supr"
        >
          <Trash2 size={14} /> Eliminar
        </button>
      </div>
    </div>
  );
}

function PinOrderEditor({ sheet, id }: { sheet: LogicSheet; id: string }) {
  const { project } = useEditor();
  const lookup = useLookup();
  const node = sheet.nodes.find(n => n.id === id)!;
  const def = elementDef(node.kind, lookup);
  if (!def) return null;
  const pins = def.pins(node.props, drawCtx(lookup));
  const groups = [
    { name: 'Entradas', dir: 'in', key: 'inputOrder' },
    { name: 'Salidas', dir: 'out', key: 'outputOrder' },
  ] as const;
  return <div className="insp-section"><h3>Posición de las patillas</h3>
    {groups.map(group => {
      const available = pins.filter(p => p.dir === group.dir);
      const order = visualPinOrder(available, node.props[group.key]);
      if (order.length < 2) return null;
      const move = (i: number, delta: number) => {
        const next = [...order], other = i + delta;
        if (other < 0 || other >= next.length) return;
        [next[i], next[other]] = [next[other], next[i]];
        project.design.setProp(sheet.id, id, group.key, JSON.stringify(next));
      };
      return <div key={group.key} className="d-pin-group"><span className="label">{group.name}</span><ol className="d-order">
        {order.map((pinId, i) => {
          const name = available.find(p => p.id === pinId)?.label ?? pinId;
          return <li key={pinId}>
            <span className="d-pin-name">{name}</span>
            <button className="icon-btn" disabled={project.readOnly || i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${name}`}><ArrowUp size={14} /></button>
            <button className="icon-btn" disabled={project.readOnly || i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${name}`}><ArrowDown size={14} /></button>
          </li>;
        })}
      </ol></div>;
    })}
  </div>;
}

function SelectionInspector({ sheet, nodes, wires }: { sheet: LogicSheet; nodes: string[]; wires: string[] }) {
  const { project } = useEditor();
  const create = useCreateIc();
  const ids = new Set(nodes);
  const hasPins = sheet.nodes.some((n) => ids.has(n.id) && (n.kind === 'in' || n.kind === 'out'));
  return (
    <div className="insp-card">
      <div className="insp-head">
        <h2>
          {nodes.length + wires.length} elementos
        </h2>
      </div>
      <p className="insp-hint">
        {nodes.length} {nodes.length === 1 ? 'elemento' : 'elementos'} · {wires.length} {wires.length === 1 ? 'cable' : 'cables'}
      </p>
      {wires.length > 0 && <div className="insp-section"><h3>Color de {wires.length === 1 ? 'cable' : 'cables'}</h3>
        <div className="swatches">{WIRE_COLORS.map(c => <button key={c.value} className="swatch" style={{ background: c.value }} aria-label={c.label} title={c.label} disabled={project.readOnly} aria-pressed={wires.every(id => sheet.wires.find(w => w.id === id)?.color?.toLowerCase() === c.value.toLowerCase())} onClick={() => project.design.setWireColor(sheet.id, wires, c.value)} />)}</div>
        <button className="btn sm" disabled={project.readOnly} onClick={() => project.design.setWireColor(sheet.id, wires, null)}>Color automático</button>
      </div>}
      {nodes.length > 0 && !project.readOnly && (
        <div className="insp-section">
          <button
            className="btn sm"
            onClick={() => {
              const copy = { nodes: sheet.nodes.filter((n) => ids.has(n.id)), wires: sheet.wires.filter((w) => ids.has(w.a.node) && ids.has(w.b.node)) };
              const id = create();
              const x0 = Math.min(...copy.nodes.map((n) => n.x));
              const y0 = Math.min(...copy.nodes.map((n) => n.y));
              project.design.paste(id, copy.nodes, copy.wires, 120 - x0, 120 - y0);
            }}
          >
            <PackagePlus size={14} /> Crear integrado con la selección
          </button>
          <p className="insp-hint">{hasPins ? 'Sus entradas y salidas serán las patillas.' : 'Añade entradas y salidas dentro del integrado: serán sus patillas.'}</p>
        </div>
      )}
      <div className="insp-section actions">
        <button
          className="btn sm danger"
          onClick={() => {
            project.design.delete(sheet.id, nodes, wires);
            useDesignUi.getState().select([]);
          }}
        >
          <Trash2 size={14} /> Eliminar
        </button>
      </div>
    </div>
  );
}

function MainInspector({ sheet }: { sheet: LogicSheet }) {
  const create = useCreateIc();
  const { project } = useEditor();
  const ics = project.design.ics();
  return (
    <div className="insp-card">
      <div className="insp-head">
        <h2>Diseño lógico</h2>
      </div>
      <p className="insp-hint">Lógica ideal, sin tensiones ni retardos. Prueba ideas aquí y conviértelas en integrados propios para usarlos en la protoboard.</p>
      <dl className="d-stats">
        <div>
          <dt>Elementos</dt>
          <dd>{sheet.nodes.length}</dd>
        </div>
        <div>
          <dt>Cables</dt>
          <dd>{sheet.wires.length}</dd>
        </div>
        <div>
          <dt>Integrados</dt>
          <dd>{ics.length}</dd>
        </div>
      </dl>
      {!project.readOnly && (
        <div className="insp-section">
          <button className="btn sm" onClick={create}>
            <Cpu size={14} /> Nuevo integrado
          </button>
        </div>
      )}
    </div>
  );
}

function IcInspector({ sheet }: { sheet: LogicSheet }) {
  const { project } = useEditor();
  const lookup = useLookup();
  const [confirm, setConfirm] = useState(false);
  const signals = icSignals(sheet);
  const pins = packagePins(sheet);
  const size = packageSize(sheet);
  const fit = DIP_SIZES.find((n) => n >= signals.length + 2) ?? size;
  const issues = icIssues(sheet);
  const blocking = !signals.some((n) => n.kind === 'in') || !signals.some((n) => n.kind === 'out');
  const table = useMemo(() => (blocking || signals.filter((n) => n.kind === 'in').length > 6 ? null : truthTable(sheet, lookup)), [sheet, lookup, blocking, signals]);
  const type = `${IC_PREFIX}${sheet.id}`;
  const onBoard = project.snapshot().parts.filter((p) => p.type === type).length;
  const set = (patch: Parameters<typeof project.design.setSheet>[1]) => project.design.setSheet(sheet.id, patch);
  const move = (id: string, d: -1 | 1) => {
    const order = signals.map((n) => n.id);
    const i = order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set({ order });
  };
  return (
    <div className="insp-card">
      <div className="insp-head">
        <h2>
          <Cpu size={15} /> Integrado propio
        </h2>
      </div>
      <div className="insp-section">
        <label className="label" htmlFor="ic-name">
          Nombre
        </label>
        <DraftText className="input" id="ic-name" value={sheet.name} maxLength={60} onCommit={(name) => set({ name })} placeholder="Codificador de pisos" />
      </div>
      <div className="insp-section d-row">
        <div>
          <label className="label" htmlFor="ic-part">
            Referencia
          </label>
          <DraftText className="input" id="ic-part" value={sheet.part} maxLength={16} transform={(v) => v.toUpperCase()} onCommit={(part) => set({ part })} placeholder="CS-001" />
        </div>
        <div>
          <label className="label" htmlFor="ic-pkg">
            Encapsulado
          </label>
          <select className="input" id="ic-pkg" value={sheet.package >= fit ? sheet.package : 0} onChange={(e) => set({ package: Number(e.target.value) })}>
            <option value={0}>DIP-{fit} (mínimo)</option>
            {DIP_SIZES.filter((n) => n > fit).map((n) => (
              <option key={n} value={n}>
                DIP-{n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="insp-section">
        <label className="label" htmlFor="ic-desc">
          Descripción
        </label>
        <DraftText multiline className="input" id="ic-desc" rows={2} value={sheet.description} maxLength={240} onCommit={(description) => set({ description })} placeholder="Qué hace y cómo se usa" />
      </div>

      <div className="insp-section">
        <span className="label">Patillaje · DIP-{size}</span>
        <DipPreview part={sheet.part || 'CS-000'} pins={pins.map((p) => ({ name: p.name, kind: p.node ? signals.find((s) => s.id === p.node)?.kind ?? 'nc' : p.name === 'VCC' ? 'vcc' : p.name === 'GND' ? 'gnd' : 'nc' }))} />
      </div>

      {signals.length > 0 && (
        <div className="insp-section">
          <span className="label">Orden de las patillas</span>
          <ol className="d-order">
            {signals.map((n, i) => {
              const at = pins.findIndex((p) => p.node === n.id) + 1;
              return (
                <li key={n.id}>
                  <span className={`d-dir ${n.kind}`}>{n.kind === 'in' ? 'E' : 'S'}</span>
                  <span className="d-pin-name">{pinName(n, i)}</span>
                  <span className="d-pin-no">patilla {at}</span>
                  <button className="icon-btn" onClick={() => move(n.id, -1)} disabled={i === 0} aria-label={`Subir ${pinName(n, i)}`}>
                    <ArrowUp size={13} />
                  </button>
                  <button className="icon-btn" onClick={() => move(n.id, 1)} disabled={i === signals.length - 1} aria-label={`Bajar ${pinName(n, i)}`}>
                    <ArrowDown size={13} />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {issues.length > 0 && (
        <ul className="d-issues">
          {issues.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      {table && (
        <div className="insp-section">
          <span className="label">Tabla de verdad</span>
          <div className="d-table-wrap">
            <table className="d-table">
              <thead>
                <tr>
                  {table.inputs.map((n) => (
                    <th key={n.id}>{pinName(n, signals.indexOf(n))}</th>
                  ))}
                  {table.outputs.map((n, i) => (
                    <th key={n.id} className={i === 0 ? 'sep' : ''}>
                      {pinName(n, signals.indexOf(n))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, k) => (
                  <tr key={k}>
                    {r.inputs.map((b, i) => (
                      <td key={i}>{b}</td>
                    ))}
                    {r.outputs.map((b, i) => (
                      <td key={`o${i}`} className={`${i === 0 ? 'sep' : ''} ${b === 1 ? 'hi' : ''}`}>
                        {bit(b)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!project.readOnly && (
        <div className="insp-section actions d-actions">
          <button
            className="btn sm primary"
            disabled={blocking}
            onClick={() => {
              const ui = useUi.getState();
              ui.setView('board');
              ui.setPlacing(type);
              ui.showToast(`Haz clic en la protoboard para colocar ${sheet.part || sheet.name}.`);
            }}
          >
            <CircuitBoard size={14} /> Colocar en la protoboard
          </button>
          {confirm ? (
            <button
              className="btn sm danger"
              onClick={() => {
                const parts = project.snapshot().parts.filter((p) => p.type === type).map((p) => p.id);
                if (parts.length) project.deleteItems(parts, []);
                project.design.deleteSheet(sheet.id);
                useDesignUi.getState().setSheet(MAIN_SHEET);
              }}
            >
              <Trash2 size={14} /> {onBoard ? `Eliminar y quitar ${onBoard} de la protoboard` : 'Confirmar'}
            </button>
          ) : (
            <button className="btn sm" onClick={() => setConfirm(true)}>
              <Trash2 size={14} /> Eliminar integrado
            </button>
          )}
        </div>
      )}
      <p className="insp-hint">Integrado virtual: en la protoboard funciona como un 74HC (VCC en la última patilla, GND en la mitad) pero no existe como pieza comercial.</p>
    </div>
  );
}

const bit = (b: Bit) => (b === 2 ? 'X' : b);

/** Encapsulado visto desde arriba: patilla 1 abajo a la izquierda, como en la protoboard. */
function DipPreview({ part, pins }: { part: string; pins: { name: string; kind: string }[] }) {
  const half = pins.length / 2;
  const pitch = 22;
  const w = half * pitch + 16;
  const color = (k: string) => (k === 'in' ? 'var(--d-pin-in)' : k === 'out' ? 'var(--d-pin-out)' : k === 'vcc' ? 'var(--red)' : k === 'gnd' ? 'var(--text-3)' : 'var(--line-2)');
  return (
    <svg className="d-dip" viewBox={`-4 -30 ${w + 8} 132`} role="img" aria-label={`Patillaje de ${part}`}>
      <rect x={0} y={14} width={w} height={44} rx={4} fill="#121417" stroke="#30343a" />
      <path d={`M0 ${36 - 7}a7 7 0 0 1 0 14`} fill="#0b0c0e" />
      <circle cx={12} cy={50} r={2.6} fill="#2a2d31" />
      <text x={w / 2} y={40} textAnchor="middle" fontSize={10} fontWeight={600} fill="#c9ccd1" fontFamily="Geist, sans-serif">
        {part}
      </text>
      {pins.map((p, i) => {
        const bottom = i < half;
        const col = bottom ? i : pins.length - 1 - i;
        const x = 16 + col * pitch;
        return (
          <g key={i}>
            <rect x={x - 4} y={bottom ? 58 : 6} width={8} height={8} rx={1} fill="#9aa1a8" />
            <text x={x} y={bottom ? 76 : -2} textAnchor="middle" fontSize={7.5} fill="var(--text-3)" fontFamily="Geist, sans-serif">
              {i + 1}
            </text>
            <text x={x} y={bottom ? 90 : -14} textAnchor="middle" fontSize={8} fontWeight={600} fill={color(p.kind)} fontFamily="Geist, sans-serif">
              {p.name === 'NC' ? '·' : p.name.length > 4 ? `${p.name.slice(0, 4)}…` : p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type DraftProps = {
  value: string;
  onCommit(value: string): void;
  transform?(value: string): string;
  multiline?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>;

/**
 * Campo de texto sobre el documento compartido. Mientras tiene el foco muestra su propio borrador:
 * el valor del documento vuelve en otro ciclo y, si el campo lo leyera, el cursor saltaría al final.
 */
function DraftText({ value, onCommit, transform = (v) => v, multiline, ...rest }: DraftProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const props = {
    ...rest,
    value: draft ?? value,
    onFocus: () => setDraft(value),
    onBlur: () => setDraft(null),
    onChange: (e: { target: { value: string } }) => {
      const v = transform(e.target.value);
      setDraft(v);
      onCommit(v);
    },
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}
