/**
 * Guía viva del design system: /?design=1
 * Se carga aparte (lazy) y usa los mismos tokens y componentes que la app, así que nunca
 * se desincroniza: lo que ves aquí es exactamente lo que se envía.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Bell, Check, Copy, Cpu, Download, Play, Plus, Search, Settings2, Square, Trash2, Zap } from 'lucide-react';
import { HintProvider } from '../ui/Overlays';
import { Badge, Button, Field, IconButton, Input, Kbd, Panel, Segmented, Switch, type Tone } from './components';
import './guide.css';

const SECTIONS = [
  ['principios', 'Principios'],
  ['color', 'Color'],
  ['tipografia', 'Tipografía'],
  ['espacio', 'Espacio y radios'],
  ['materiales', 'Materiales y elevación'],
  ['movimiento', 'Movimiento'],
  ['componentes', 'Componentes'],
] as const;

const GRAYS = Array.from({ length: 13 }, (_, i) => `--gray-${i}`);
const WHITE = Array.from({ length: 12 }, (_, i) => `--wa-${i + 1}`);
const SEMANTIC: [string, string][] = [
  ['--surface-app', 'Fondo de la app'],
  ['--surface-canvas', 'Lienzo'],
  ['--surface-panel', 'Paneles'],
  ['--surface-raised', 'Elevado'],
  ['--surface-overlay', 'Menús y popovers'],
  ['--text-primary', 'Texto principal'],
  ['--text-secondary', 'Texto secundario'],
  ['--text-tertiary', 'Texto terciario'],
];
const STATUS: [string, string, string][] = [
  ['--accent', '--accent-subtle', 'Acción · selección'],
  ['--success', '--success-subtle', 'Correcto · en marcha'],
  ['--warning', '--warning-subtle', 'Aviso'],
  ['--danger', '--danger-subtle', 'Error · destructivo'],
  ['--live', '--live-subtle', 'Medida en vivo'],
];
const TYPE: [string, string, string][] = [
  ['--fs-display', '--tracking-display', 'Portada y títulos de marca'],
  ['--fs-2xl', '--tracking-xl', 'Títulos de diálogo'],
  ['--fs-xl', '--tracking-lg', 'Títulos de panel'],
  ['--fs-lg', '--tracking-lg', 'Contenido de panel, instrucciones'],
  ['--fs-md', '--tracking-md', 'Texto base de la interfaz'],
  ['--fs-sm', '--tracking-sm', 'Controles, etiquetas'],
  ['--fs-xs', '--tracking-sm', 'Metadatos, tooltips'],
  ['--fs-2xs', '--tracking-2xs', 'Contadores, barra de estado'],
];
const SPACE = ['--space-1', '--space-1-5', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12'];
const RADII = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl'];
const SHADOWS: [string, string][] = [
  ['--shadow-hair', 'Contorno'],
  ['--shadow-card', 'Tarjeta'],
  ['--shadow-raised', 'Elevado'],
  ['--shadow-float', 'Flotante'],
  ['--relief-shadow', 'Relieve (control)'],
  ['--sunken-shadow', 'Hundido (pulsado)'],
];
const CURVES: [string, string, string][] = [
  ['--ease-out', '--dur-mid', 'Entradas, aparece algo nuevo'],
  ['--ease-drawer', '--dur-slow', 'Paneles y cajones'],
  ['--ease-in-out', '--dur-mid', 'Algo que ya estaba se mueve'],
  ['--ease-standard', '--dur-fast', 'Cambios de estado (hover, color)'],
];

function useToken(name: string) {
  const [v, set] = useState('');
  useEffect(() => set(getComputedStyle(document.documentElement).getPropertyValue(name).trim()), [name]);
  return v;
}

function Token({ name }: { name: string }) {
  const value = useToken(name);
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="dg-token"
      title="Copiar"
      onClick={() => {
        void navigator.clipboard?.writeText(`var(${name})`);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
      }}
    >
      <code>{name}</code>
      <span>{copied ? <Check size={11} /> : value.length > 40 ? '' : value}</span>
    </button>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="dg-section">
      <header>
        <h2>{title}</h2>
        <p>{lead}</p>
      </header>
      {children}
    </section>
  );
}

function MotionDemo({ ease, dur, use }: { ease: string; dur: string; use: string }) {
  const [on, setOn] = useState(false);
  return (
    <div className="dg-motion">
      <button type="button" className="dg-track" onClick={() => setOn((v) => !v)} aria-label={`Reproducir ${ease}`}>
        <span style={{ transform: on ? 'translateX(calc(100% * 7))' : 'none', transitionTimingFunction: `var(${ease})`, transitionDuration: `var(${dur})` }} />
      </button>
      <div>
        <Token name={ease} />
        <Token name={dur} />
        <p>{use}</p>
      </div>
    </div>
  );
}

export default function Guide() {
  const [view, setView] = useState<'board' | 'schematic' | 'design'>('board');
  const [snap, setSnap] = useState(true);
  const [name, setName] = useState('R1');
  useEffect(() => {
    document.title = 'Design system · CircuitStudio';
  }, []);
  const tones: Tone[] = ['neutral', 'accent', 'success', 'warning', 'danger', 'live'];
  return (
    <HintProvider>
      <div className="dg">
        <aside className="dg-nav">
          <a className="dg-brand" href="/">
            circuit<b>studio</b>
          </a>
          <span className="dg-version">Design system</span>
          <nav>
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <p className="dg-foot">
            Fuente única: <code>src/design/tokens.css</code>. Componentes: <code>src/design/components.tsx</code>.
          </p>
        </aside>
        <main className="dg-main">
          <header className="dg-hero">
            <Badge tone="live">Vivo</Badge>
            <h1>El sistema con el que se construye CircuitStudio</h1>
            <p>
              Esta página usa los mismos tokens y componentes que la app. Si algo cambia aquí, cambia en todas partes. Pulsa cualquier token
              para copiarlo.
            </p>
          </header>

          <Section id="principios" title="Principios" lead="Cinco reglas que deciden las dudas.">
            <ol className="dg-principles">
              <li>
                <strong>La velocidad es diseño.</strong> Nada bloquea el hilo principal; lo pesado se carga al usarse. Si algo tarda, se ve el
                progreso real, no un adorno.
              </li>
              <li>
                <strong>Profundidad con sobriedad.</strong> El peso del material marca la jerarquía: estructura pesada, controles en relieve,
                cristal solo sobre el lienzo. Nunca cristal sobre cristal.
              </li>
              <li>
                <strong>El color significa algo.</strong> Azul es acción y selección; verde, en marcha; menta, medida en vivo; ámbar y rojo,
                avisos. El resto es gris.
              </li>
              <li>
                <strong>Movimiento con propósito.</strong> Menos de 250 ms, solo transform y opacity, ease-out para entrar. Responde al pulsar.
                Los atajos de teclado no animan.
              </li>
              <li>
                <strong>Una acción principal por tarea.</strong> Las demás son secundarias o fantasma. Los iconos sin texto llevan etiqueta y
                tooltip.
              </li>
            </ol>
          </Section>

          <Section id="color" title="Color" lead="Primitivos crudos y, encima, los nombres con significado. Los componentes solo usan los semánticos.">
            <h3>Grises</h3>
            <div className="dg-ramp">
              {GRAYS.map((g) => (
                <div key={g} className="dg-swatch">
                  <span style={{ background: `var(${g})` }} />
                  <Token name={g} />
                </div>
              ))}
            </div>
            <h3>Luz translúcida</h3>
            <p className="dg-note">Filos, bordes y estados sobre materiales oscuros. Se ven sobre el panel, no sobre blanco.</p>
            <div className="dg-ramp is-alpha">
              {WHITE.map((g) => (
                <div key={g} className="dg-swatch">
                  <span style={{ background: `linear-gradient(var(${g}), var(${g})), var(--surface-panel)` }} />
                  <Token name={g} />
                </div>
              ))}
            </div>
            <h3>Semánticos</h3>
            <div className="dg-grid">
              {SEMANTIC.map(([t, use]) => (
                <div key={t} className="dg-semantic">
                  <span style={t.startsWith('--text') ? { color: `var(${t})` } : { background: `var(${t})` }}>{t.startsWith('--text') ? 'Aa' : ''}</span>
                  <div>
                    <Token name={t} />
                    <p>{use}</p>
                  </div>
                </div>
              ))}
            </div>
            <h3>Estado</h3>
            <div className="dg-grid">
              {STATUS.map(([t, soft, use]) => (
                <div key={t} className="dg-semantic">
                  <span style={{ background: `var(${soft})`, color: `var(${t})` }}>
                    <Zap size={16} />
                  </span>
                  <div>
                    <Token name={t} />
                    <p>{use}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="tipografia" title="Tipografía" lead="Geist con cifras tabulares. Ocho pasos; el tracking se estrecha al crecer.">
            <div className="dg-type">
              {TYPE.map(([fs, tr, use]) => (
                <div key={fs}>
                  <p style={{ fontSize: `var(${fs})`, letterSpacing: `var(${tr})` }}>Contador de década con display</p>
                  <div>
                    <Token name={fs} />
                    <span>{use}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="espacio" title="Espacio y radios" lead="Base de 4 px. Radios concéntricos: el exterior es el interior más el relleno.">
            <div className="dg-space">
              {SPACE.map((s) => (
                <div key={s}>
                  <span style={{ width: `var(${s})` }} />
                  <Token name={s} />
                </div>
              ))}
            </div>
            <div className="dg-radii">
              {RADII.map((r) => (
                <div key={r}>
                  <span style={{ borderRadius: `var(${r})` }} />
                  <Token name={r} />
                </div>
              ))}
            </div>
          </Section>

          <Section id="materiales" title="Materiales y elevación" lead="De pegado al plano a flotante. La luz viene de arriba; al pulsar, el control se hunde.">
            <div className="dg-materials">
              <div className="dg-mat" style={{ background: 'var(--mat-panel)', boxShadow: 'var(--mat-panel-shadow)' }}>
                <strong>Panel</strong>
                <Token name="--mat-panel" />
              </div>
              <div className="dg-mat is-stage">
                <div className="dg-mat dg-glass">
                  <strong>Cristal</strong>
                  <Token name="--glass" />
                </div>
              </div>
              <div className="dg-mat" style={{ background: 'var(--relief)', boxShadow: 'var(--relief-shadow)' }}>
                <strong>Relieve</strong>
                <Token name="--relief" />
              </div>
            </div>
            <div className="dg-shadows">
              {SHADOWS.map(([s, use]) => (
                <div key={s}>
                  <span style={{ boxShadow: `var(${s})` }} />
                  <Token name={s} />
                  <p>{use}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="movimiento" title="Movimiento" lead="Pulsa cada pista. Cada curva tiene un uso; si dudas, ease-out.">
            <div className="dg-motions">
              {CURVES.map(([e, d, use]) => (
                <MotionDemo key={e} ease={e} dur={d} use={use} />
              ))}
            </div>
            <ul className="dg-rules">
              <li>Hover solo con ratón (<code>@media (hover: hover)</code>). Al pulsar, <code>scale(0.97)</code> en 100 ms.</li>
              <li>Los popovers nacen desde su ancla (<code>transform-origin</code>) y salen más rápido de lo que entran.</li>
              <li>Con <code>prefers-reduced-motion</code> se quitan desplazamientos; se mantienen los fundidos cortos.</li>
            </ul>
          </Section>

          <Section id="componentes" title="Componentes" lead="Primitivos React. Úsalos en vez de clases sueltas.">
            <Panel title="Button">
              <div className="dg-row">
                <Button variant="primary" icon={<Play size={14} />}>
                  Simular
                </Button>
                <Button icon={<Download size={14} />}>Exportar</Button>
                <Button variant="accent" icon={<Plus size={14} />}>
                  Añadir
                </Button>
                <Button variant="ghost">Cancelar</Button>
                <Button variant="danger" icon={<Trash2 size={14} />}>
                  Borrar
                </Button>
                <Button disabled>Desactivado</Button>
              </div>
              <div className="dg-row">
                <Button size="sm" variant="primary">
                  Pequeño
                </Button>
                <Button size="sm">Secundario</Button>
                <Button size="sm" variant="ghost">
                  Fantasma
                </Button>
              </div>
            </Panel>
            <Panel title="IconButton">
              <div className="dg-row">
                <IconButton label="Buscar · Ctrl+K">
                  <Search size={15} />
                </IconButton>
                <IconButton label="Ajustes">
                  <Settings2 size={15} />
                </IconButton>
                <IconButton label="Ajustar a rejilla" active={snap} onClick={() => setSnap((v) => !v)}>
                  <Cpu size={15} />
                </IconButton>
                <IconButton label="Copiar">
                  <Copy size={15} />
                </IconButton>
                <IconButton label="Detener" disabled>
                  <Square size={15} />
                </IconButton>
              </div>
            </Panel>
            <Panel title="Segmented · Switch">
              <div className="dg-row">
                <Segmented
                  label="Vista"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'board', label: 'Protoboard' },
                    { value: 'schematic', label: 'Esquema' },
                    { value: 'design', label: 'Diseño' },
                  ]}
                />
                <label className="dg-inline">
                  <Switch checked={snap} onChange={setSnap} label="Ajustar a rejilla" /> Ajustar a rejilla
                </label>
              </div>
            </Panel>
            <Panel title="Field · Input">
              <div className="dg-fields">
                <Field label="Nombre" hint="Aparece en el esquema y en la lista de materiales.">
                  {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
                </Field>
                <Field label="Resistencia" error="Usa un valor con unidad, por ejemplo 4k7.">
                  {(p) => <Input {...p} defaultValue="4,7 kilos" />}
                </Field>
              </div>
            </Panel>
            <Panel title="Badge · Kbd">
              <div className="dg-row">
                {tones.map((t) => (
                  <Badge key={t} tone={t}>
                    {t === 'live' && <Bell />}
                    {t}
                  </Badge>
                ))}
                <span className="dg-inline">
                  <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
                </span>
              </div>
            </Panel>
          </Section>
        </main>
      </div>
    </HintProvider>
  );
}
