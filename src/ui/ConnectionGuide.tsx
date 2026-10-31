import { X } from 'lucide-react';
import { pinKey, type Netlist } from '../core/netlist';
import type { CircuitSnapshot, WireData, WireEnd, Vec } from '../core/types';
import { PARTS } from '../parts';
import { wirePoints } from './geometry';
import { useEditor } from './context';
import { namedPins, SIGNAL_FAMILIES } from './readableConnections';

export function wireNet(w: WireData, nets: Netlist) {
  return w.a.part && w.a.pin ? nets.netOf.get(pinKey(w.a.part, w.a.pin)) : w.b.part && w.b.pin ? nets.netOf.get(pinKey(w.b.part, w.b.pin)) : undefined;
}

/** Bridges mark physical crossings, never a new electrical junction. */
export function wireCrossings(snapshot: CircuitSnapshot): Map<string, (Vec & { vertical?: boolean })[]> {
  const parts = new Map(snapshot.parts.map(p => [p.id,p]));
  const prior: { a: Vec; b: Vec }[] = [], result = new Map<string, (Vec & { vertical?: boolean })[]>();
  for (const w of snapshot.wires) {
    if (w.sch) continue;
    const points = wirePoints(w,parts), hits: (Vec & { vertical?: boolean })[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i-1], b = points[i];
      const vertical = Math.abs(a.x-b.x)<.01;
      const horizontal = Math.abs(a.y-b.y)<.01;
      if ((!vertical && !horizontal) || Math.hypot(a.x-b.x,a.y-b.y)<10) continue;
      for (const seg of prior) {
        const otherVertical = Math.abs(seg.a.x-seg.b.x)<.01;
        const otherHorizontal = Math.abs(seg.a.y-seg.b.y)<.01;
        if (vertical ? !otherHorizontal : !otherVertical) continue;
        const x = vertical ? a.x : seg.a.x, y = vertical ? seg.a.y : a.y;
        const along = vertical ? y : x, across = vertical ? x : y;
        const lo = vertical ? Math.min(a.y,b.y) : Math.min(a.x,b.x), hi = vertical ? Math.max(a.y,b.y) : Math.max(a.x,b.x);
        const otherLo = vertical ? Math.min(seg.a.x,seg.b.x) : Math.min(seg.a.y,seg.b.y), otherHi = vertical ? Math.max(seg.a.x,seg.b.x) : Math.max(seg.a.y,seg.b.y);
        if (along <= lo+6 || along >= hi-6 || across <= otherLo+6 || across >= otherHi-6) continue;
        if (!hits.some(p => Math.hypot(p.x-x,p.y-y)<9)) hits.push(vertical ? {x,y,vertical:true} : {x,y});
      }
    }
    result.set(w.id,hits);
    for(let i=1;i<points.length;i++) prior.push({a:points[i-1],b:points[i]});
  }
  return result;
}

export function ConnectionGuide({ snapshot, netlist, wire, onClear }: { snapshot: CircuitSnapshot; netlist: Netlist; wire?: WireData; onClear: () => void }) {
  const { project } = useEditor();
  const rawLegend = project.meta.get('wiring.legend');
  const configuredLegend = (Array.isArray(rawLegend) ? rawLegend : []).filter((entry): entry is { color: string; colors?: string[]; label: string } => entry && typeof entry.color === 'string' && /^#[a-f\d]{6}$/i.test(entry.color) && typeof entry.label === 'string').slice(0, 12);
  const usedColors=new Set(snapshot.wires.map(w=>w.color));
  const families=SIGNAL_FAMILIES.filter(f=>f.colors.some(c=>usedColors.has(c))).map(f=>({color:f.colors[0],colors:f.colors.filter(c=>usedColors.has(c)),label:f.label}));
  const legend = families.length>=6 ? families : configuredLegend;
  const net = wire && wireNet(wire,netlist);
  const endpoint = (end: WireEnd) => {
    const part = snapshot.parts.find(p=>p.id===end.part);
    if (!part || !end.pin) return 'Extremo suelto';
    const name = String(part.props.label || PARTS[part.type]?.partNumber || PARTS[part.type]?.name || part.type);
    return `${name} · ${end.pin.toUpperCase()}`;
  };
  let name = 'Conexión';
  if (net !== undefined) {
    for (const [key,id] of netlist.netOf) {
      if (id !== net) continue;
      const pin = key.slice(key.lastIndexOf(':')+1);
      if (/^(GND(\.\d+)?|tn\d+|bn\d+)$/i.test(pin)) name='GND';
      if (/^(3V3|5V|VCC|VDD)$/i.test(pin)) name='Alimentación';
    }
    for (const p of snapshot.parts) {
      for (const [pin,label] of namedPins(p)) {
        if (label && netlist.netOf.get(pinKey(p.id,pin)) === net) name=label;
      }
    }
  }
  const count = wire ? snapshot.wires.filter(w=>wireNet(w,netlist)===net).length : 0;
  return <aside className={`connection-guide ${wire ? 'is-focused' : ''} ${legend.length ? 'has-legend' : ''}`} aria-label="Guía de conexiones" aria-live="polite">
    {wire ? <>
      <div className="connection-heading"><span className="connection-swatch" style={{background:wire.color}}/><strong>{name}</strong><span>{count} {count===1?'cable':'cables'} en esta red</span><button className="icon-btn" aria-label="Dejar de seguir la conexión" onClick={onClear}><X size={13}/></button></div>
      <div className="connection-ends"><span>{endpoint(wire.a)}</span><span aria-hidden="true">→</span><span>{endpoint(wire.b)}</span></div>
    </> : <>
      {legend.length > 0 && <div className="connection-legend">{legend.map(entry=><span key={entry.color}><span className="connection-tones">{(Array.isArray(entry.colors) ? entry.colors.filter(c=>typeof c==='string' && /^#[a-f\d]{6}$/i.test(c)).slice(0,8) : [entry.color]).map(color=><i key={color} className="connection-swatch" style={{background:color}}/>)}</span>{entry.label}</span>)}</div>}
      <span className="connection-help">Señala un cable para seguir su red · Los cruces no unen cables</span><span className="connection-convention">Cruce con corte = sin unión · Punto metálico = extremo insertado</span></>}
  </aside>;
}
