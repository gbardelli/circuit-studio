// Dibujo de los elementos del modo diseño (símbolos de forma distintiva IEEE 91) en coordenadas
// locales, antes de girar. Colores de valor: 1 verde claro, 0 verde oscuro, X azul, error rojo.
import { memo } from 'react';
import { noteFontSize, noteLineHeight, noteLines, SEGMENT_PINS } from '../../logic/elements';
import type { Bit } from '../../logic/types';
import type { Placed } from './geometry';

export const VALUE_COLOR: Record<Bit | 'err', string> = { 0: '#2c6b45', 1: '#4ade80', 2: '#5b8def', err: '#f05252' };
const INK = 'var(--d-ink)';
const BODY = 'var(--d-body)';
const MUTED = 'var(--d-muted)';
const FONT = 'Geist, sans-serif';
const MONO = 'Geist, sans-serif';

// LED de salida: encendido, apagado y borde encendido.
const LED: Record<string, { on: string; off: string; rim: string }> = {
  green: { on: VALUE_COLOR[1], off: '#1b2a21', rim: '#bbf7d0' },
  red: { on: '#f43f3f', off: '#2e1a1a', rim: '#fecaca' },
  yellow: { on: '#facc15', off: '#2b2614', rim: '#fef08a' },
  blue: { on: '#60a5fa', off: '#18212e', rim: '#bfdbfe' },
};

// Segmentos a–g de 0 a F, como un display hexadecimal.
const HEX = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];

export interface SymbolState {
  /** Valor de cada patilla (por id). */
  pin(id: string): Bit;
  /** Valor de la fuente (entrada, pulsador, reloj). */
  source?: Bit;
  hex?: number | null;
  pressed?: boolean;
}

function Stub({ x1, y1, x2, y2, v }: { x1: number; y1: number; x2: number; y2: number; v?: Bit }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={v === undefined ? INK : VALUE_COLOR[v]} strokeWidth={2} strokeLinecap="round" />;
}

function Gate({ kind, h, st }: { kind: string; h: number; st: SymbolState }) {
  const n = h === 40 ? 2 : h / 20;
  const inverted = ['nand', 'nor', 'xnor', 'not'].includes(kind);
  const family = kind === 'not' || kind === 'buf' || kind === 'tri' ? 'tri' : kind.includes('and') ? 'and' : kind.includes('xor') || kind.includes('xnor') ? 'xor' : 'or';
  const mid = h / 2;
  let body: string;
  // Hasta dónde llega cada entrada: el dorso curvo de OR/XOR queda más adentro en el centro.
  const back = (y: number) => (family === 'or' || family === 'xor' ? 10 + 6 * Math.sin((Math.PI * y) / h) : family === 'tri' ? 12 : 10);
  if (family === 'and') body = `M10 0H28A22 ${mid} 0 0 1 28 ${h}H10Z`;
  else if (family === 'tri') body = `M12 ${mid - 16}L46 ${mid}L12 ${mid + 16}Z`;
  else body = `M10 0C28 0 42 ${h * 0.12} 50 ${mid}C42 ${h * 0.88} 28 ${h} 10 ${h}Q22 ${mid} 10 0Z`;
  const tip = family === 'tri' ? 46 : 50;
  const ins = kind === 'not' || kind === 'buf' || kind === 'tri' ? [{ id: 'A', y: mid }] : Array.from({ length: n }, (_, i) => ({ id: `I${i + 1}`, y: 10 + i * 20 }));
  return (
    <g>
      {ins.map((p) => (
        <Stub key={p.id} x1={0} y1={p.y} x2={back(p.y)} y2={p.y} v={st.pin(p.id)} />
      ))}
      {kind === 'tri' && <Stub x1={30} y1={h} x2={30} y2={mid + 9} v={st.pin('EN')} />}
      <path d={body} fill={BODY} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      {family === 'xor' && <path d={`M4 0Q16 ${mid} 4 ${h}`} fill="none" stroke={INK} strokeWidth={2} />}
      {inverted ? (
        <>
          <circle cx={tip + 4} cy={mid} r={4} fill={BODY} stroke={INK} strokeWidth={2} />
          <Stub x1={tip + 8} y1={mid} x2={60} y2={mid} v={st.pin('Y')} />
        </>
      ) : (
        <Stub x1={tip} y1={mid} x2={60} y2={mid} v={st.pin('Y')} />
      )}
    </g>
  );
}

function Box({ w, h, title, pins, st, accent }: { w: number; h: number; title: string; pins: Placed['pins']; st: SymbolState; accent?: string }) {
  const left = pins.filter((p) => p.x <= 0);
  const right = pins.filter((p) => p.x >= w);
  const top = pins.filter((p) => p.y <= 0 && p.x > 0 && p.x < w);
  const bottom = pins.filter((p) => p.y >= h && p.x > 0 && p.x < w);
  const label = (p: Placed['pins'][number]) => p.label ?? p.id;
  return (
    <g>
      {left.map((p) => <Stub key={p.id} x1={0} y1={p.y} x2={10} y2={p.y} v={st.pin(p.id)} />)}
      {right.map((p) => <Stub key={p.id} x1={w - 10} y1={p.y} x2={w} y2={p.y} v={st.pin(p.id)} />)}
      {top.map((p) => <Stub key={p.id} x1={p.x} y1={0} x2={p.x} y2={6} v={st.pin(p.id)} />)}
      {bottom.map((p) => <Stub key={p.id} x1={p.x} y1={h - 6} x2={p.x} y2={h} v={st.pin(p.id)} />)}
      <rect x={10} y={top.length ? 6 : 0} width={w - 20} height={h - (top.length ? 6 : 0) - (bottom.length ? 6 : 0)} rx={3} fill={BODY} stroke={accent ?? INK} strokeWidth={2} />
      {accent && <rect x={11} y={1} width={w - 22} height={4} rx={1} fill={accent} opacity={0.9} />}
      <g fontFamily={MONO} fontSize={7.5} fill={MUTED}>
        {left.map((p) => (
          <text key={p.id} x={14} y={p.y + 2.6}>
            {p.id === 'CLK' ? '' : label(p)}
          </text>
        ))}
        {right.map((p) => (
          <text key={p.id} x={w - 14} y={p.y + 2.6} textAnchor="end">
            {label(p)}
          </text>
        ))}
        {top.map((p) => (
          <text key={p.id} x={p.x} y={15} textAnchor="middle">
            {label(p)}
          </text>
        ))}
        {bottom.map((p) => (
          <text key={p.id} x={p.x} y={h - 9} textAnchor="middle">
            {label(p)}
          </text>
        ))}
      </g>
      {left.some((p) => p.id === 'CLK') && <path d={`M10 ${left.find((p) => p.id === 'CLK')!.y - 5}l7 5l-7 5`} fill="none" stroke={INK} strokeWidth={1.5} />}
      {title && (
        <text x={w / 2} y={-5} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fontWeight={600} fill={INK}>
          {title}
        </text>
      )}
    </g>
  );
}

function SevenSeg({ value, mask }: { value?: number | null; mask?: number }) {
  const on = mask ?? (value == null ? 0 : HEX[value & 15]);
  const seg = (i: number) => ((on >> i) & 1 ? '#ff5a3c' : 'rgba(255,90,60,.1)');
  const x = 22;
  const y = 12;
  const w = 20;
  const t = 4;
  return (
    <g>
      <rect x={x - 6} y={y - 6} width={w + 12} height={68} rx={3} fill="#111316" />
      <rect x={x} y={y - 2} width={w} height={t} rx={2} fill={seg(0)} />
      <rect x={x + w - 2} y={y} width={t} height={26} rx={2} fill={seg(1)} />
      <rect x={x + w - 2} y={y + 30} width={t} height={26} rx={2} fill={seg(2)} />
      <rect x={x} y={y + 54} width={w} height={t} rx={2} fill={seg(3)} />
      <rect x={x - 2} y={y + 30} width={t} height={26} rx={2} fill={seg(4)} />
      <rect x={x - 2} y={y} width={t} height={26} rx={2} fill={seg(5)} />
      <rect x={x} y={y + 26} width={w} height={t} rx={2} fill={seg(6)} />
    </g>
  );
}

export const LogicSymbol = memo(function LogicSymbol({ placed, st }: { placed: Placed; st: SymbolState }) {
  const { node, w, h, pins } = placed;
  const k = node.kind;
  const label = String(node.props.label ?? '');
  if (['and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'buf', 'tri'].includes(k)) return <Gate kind={k} h={h} st={st} />;
  if (k === 'in' || k === 'button' || k === 'clock' || k === 'const') {
    const v = k === 'const' ? (Number(node.props.value) ? 1 : 0) : st.source ?? st.pin('Y');
    return (
      <g>
        <Stub x1={28} y1={10} x2={40} y2={10} v={st.pin('Y')} />
        <rect x={0} y={0} width={28} height={20} rx={k === 'button' ? 10 : 3} fill={v === 1 ? 'rgba(74,222,128,.16)' : BODY} stroke={v === 1 ? VALUE_COLOR[1] : INK} strokeWidth={2} />
        {k === 'clock' ? (
          <path d="M5 14h4v-8h5v8h5v-8h4" fill="none" stroke={v === 1 ? VALUE_COLOR[1] : INK} strokeWidth={1.6} strokeLinejoin="round" />
        ) : (
          <text x={14} y={14} textAnchor="middle" fontFamily={MONO} fontSize={11} fontWeight={700} fill={v === 1 ? VALUE_COLOR[1] : INK}>
            {v === 2 ? 'X' : v}
          </text>
        )}
        {label && (
          <text x={-6} y={13.5} textAnchor="end" fontFamily={FONT} fontSize={9} fontWeight={600} fill={INK}>
            {label}
          </text>
        )}
      </g>
    );
  }
  if (k === 'out') {
    const v = st.pin('A');
    const led = LED[String(node.props.color)] ?? LED.green;
    return (
      <g>
        <Stub x1={0} y1={10} x2={14} y2={10} v={v} />
        {v === 1 && <circle cx={24} cy={10} r={13} fill={led.on} opacity={0.18} />}
        <circle cx={24} cy={10} r={9} fill={v === 1 ? led.on : v === 2 ? 'rgba(91,141,239,.18)' : led.off} stroke={v === 1 ? led.rim : INK} strokeWidth={2} />
        {label && (
          <text x={39} y={13.5} fontFamily={FONT} fontSize={9} fontWeight={600} fill={INK}>
            {label}
          </text>
        )}
      </g>
    );
  }
  if (k === 'seg7') {
    // Segmento encendido solo con un 1: X o sin conectar se ven apagados.
    const mask = SEGMENT_PINS.reduce((m, id, i) => (st.pin(id) === 1 ? m | (1 << i) : m), 0);
    return (
      <g>
        {pins.map((p) => (
          <Stub key={p.id} x1={w - 10} y1={p.y} x2={w} y2={p.y} v={st.pin(p.id)} />
        ))}
        <g transform="translate(-14 12) scale(1.8)">
          <SevenSeg mask={mask} />
        </g>
        <g fontFamily={MONO} fontSize={7.5} fill={MUTED}>
          {pins.map((p) => (
            <text key={p.id} x={w - 5} y={p.y - 3} textAnchor="middle">
              {p.id}
            </text>
          ))}
        </g>
      </g>
    );
  }
  if (k === 'hex')
    return (
      <g>
        <Box w={w} h={h} title="" pins={pins} st={st} />
        <SevenSeg value={st.hex} />
      </g>
    );
  if (k === 'note')
    return (
      <g>
        <rect x={0} y={0} width={w} height={h} rx={4} fill="var(--d-note)" />
        <text fontFamily={FONT} fontSize={noteFontSize(node.props)} fill={INK} style={{ whiteSpace: 'pre' }}>
          {noteLines(node.props).map((line, i) => (
            <tspan key={i} x={8} y={13.5 * noteFontSize(node.props) / 9.5 + i * noteLineHeight(node.props)}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  if (k === 'mux2')
    return (
      <g>
        <Stub x1={0} y1={20} x2={10} y2={20} v={st.pin('I0')} />
        <Stub x1={0} y1={40} x2={10} y2={40} v={st.pin('I1')} />
        <Stub x1={30} y1={52} x2={30} y2={60} v={st.pin('S')} />
        <Stub x1={40} y1={30} x2={50} y2={30} v={st.pin('Y')} />
        <path d="M10 4L40 14V46L10 56Z" fill={BODY} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <g fontFamily={MONO} fontSize={7.5} fill={MUTED}>
          <text x={14} y={22.6}>0</text>
          <text x={14} y={42.6}>1</text>
        </g>
      </g>
    );
  const title = k === 'dff' ? 'D' : k === 'jkff' ? 'JK' : k === 'tff' ? 'T' : k === 'srlatch' ? 'SR' : placed.def.name;
  return <Box w={w} h={h} title={k.startsWith('chip:') || k.startsWith('ic:') ? title : ''} pins={pins} st={st} accent={k.startsWith('ic:') ? 'var(--d-ic)' : undefined} />;
});

/** Miniatura para la paleta: el símbolo centrado y sin valores. */
const IDLE: SymbolState = { pin: () => 2, source: 0 };

export function Thumb({ placed }: { placed: Placed }) {
  const pad = 14;
  return (
    <svg viewBox={`${-pad} ${-pad} ${placed.w + pad * 2} ${placed.h + pad * 2}`} width={56} height={40} aria-hidden>
      <LogicSymbol placed={placed} st={IDLE} />
    </svg>
  );
}
