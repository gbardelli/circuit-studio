import type { PartDef, RenderProps } from './types';
import type { Props } from '../core/types';

/** Colores de la nota: fondo, borde y texto. */
export const NOTE_TONES: Record<string, { bg: string; edge: string; ink: string }> = {
  yellow: { bg: '#f6e27a', edge: '#c9b14a', ink: '#2b2a1c' },
  blue: { bg: '#a9cdf5', edge: '#6f9fd4', ink: '#14263a' },
  green: { bg: '#b3e3b4', edge: '#78b87a', ink: '#14301a' },
  pink: { bg: '#f3b4cf', edge: '#cf7fa1', ink: '#3a1626' },
  white: { bg: '#e9edf2', edge: '#aab3bf', ink: '#1d2229' },
};

/** Una nota es un comentario dibujado sobre el montaje: no tiene patillas ni entra en materiales, esquema ni pasos de armado. */
export const isNote = (type: string) => type === 'note';

const PAD = 10;
const num = (v: unknown, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** Parte el texto en líneas que caben en `width` (la fuente se aproxima a 0,56 em por carácter). */
export function noteLines(text: string, width: number, size: number): string[] {
  const max = Math.max(6, Math.floor((width - PAD * 2) / (size * 0.56)));
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > max) {
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (!line) line = w;
      else if ((line + ' ' + w).length <= max) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

function geometry(props: Props) {
  const width = num(props.width, 220), size = num(props.size, 14);
  const title = String(props.label ?? '').trim();
  const lines = noteLines(String(props.text ?? ''), width, size);
  const height = Math.round(PAD * 2 + (title ? size * 1.5 : 0) + lines.length * size * 1.35);
  return { width, size, title, lines, height };
}

function NoteRender({ part }: RenderProps) {
  const { width, size, title, lines, height } = geometry(part.props);
  const tone = NOTE_TONES[String(part.props.tone ?? 'yellow')] ?? NOTE_TONES.yellow;
  const top = PAD + size, body = top + (title ? size * 1.5 : 0);
  return (
    <g>
      <rect x={3} y={4} width={width} height={height} rx={4} fill="#000" opacity={0.28} />
      <rect x={0} y={0} width={width} height={height} rx={4} fill={tone.bg} stroke={tone.edge} strokeWidth={1} />
      <g fill={tone.ink} fontFamily="Inter, 'Segoe UI', sans-serif" fontSize={size} style={{ userSelect: 'none', pointerEvents: 'none' }}>
        {title && <text x={PAD} y={top} fontWeight={700}>{title}</text>}
        {lines.map((line, i) => <text key={i} x={PAD} y={body + i * size * 1.35} xmlSpace="preserve">{line}</text>)}
      </g>
    </g>
  );
}

export const note: PartDef = {
  type: 'note',
  name: 'Nota',
  category: 'Básicos',
  description: 'Un comentario sobre el montaje: explica una conexión, un paso o un cuidado. No es una pieza eléctrica ni sale en materiales.',
  keywords: ['nota', 'comentario', 'anotacion', 'texto', 'etiqueta', 'note', 'label'],
  defaults: { text: 'Escribe aquí tu nota.', tone: 'yellow', width: 220, size: 14, label: '' },
  pins: () => [],
  bounds: (props) => {
    const g = geometry(props);
    return { x: 0, y: 0, w: g.width + 3, h: g.height + 4 };
  },
  fields: [
    { key: 'text', label: 'Texto de la nota', kind: 'text' },
    { key: 'tone', label: 'Color', kind: 'select', options: Object.keys(NOTE_TONES).map((value) => ({ value, label: { yellow: 'Amarillo', blue: 'Azul', green: 'Verde', pink: 'Rosa', white: 'Blanco' }[value]! })) },
    { key: 'size', label: 'Tamaño de letra', kind: 'select', options: [{ value: '11', label: 'Pequeña' }, { value: '14', label: 'Normal' }, { value: '20', label: 'Grande' }] },
    { key: 'width', label: 'Ancho', kind: 'range', min: 120, max: 520, step: 20 },
  ],
  model: 'Ideal',
  thumbScale: 0.5,
  Render: NoteRender,
};
