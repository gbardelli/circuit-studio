import { buildNetlist, pinKey } from '../core/netlist';
import { toWorld, type CircuitSnapshot, type WireEnd } from '../core/types';
import { PARTS } from '../parts';

export const TRIP_OUTPUTS = ['D24','D26','D28','D30','D32'] as const;
export const TRIP_INPUTS = ['A','B','C','D','BL'] as const;

/** U16 remains the hardware floor timer. The GIGA presents total trip seconds through U17. */
export function connectTotalCountdown(input: CircuitSnapshot, ids: { mcu: string; decoder: string; display: string }): CircuitSnapshot {
  const snapshot=structuredClone(input);
  const nets=buildNetlist(snapshot,PARTS),mcu=snapshot.parts.find(p=>p.id===ids.mcu),decoder=snapshot.parts.find(p=>p.id===ids.decoder),display=snapshot.parts.find(p=>p.id===ids.display);
  if(!mcu || !decoder || !display) throw new Error('Faltan el GIGA o los componentes del display de tiempo.');
  TRIP_INPUTS.forEach((pin,index)=>{
    const socket=nets.inserted.get(pinKey(ids.decoder,pin));
    const board=socket?.slice(0,socket.lastIndexOf(':')),hole=socket?.slice(socket.lastIndexOf(':')+1),match=hole?.match(/^([a-j])(\d+)$/);
    const terminal=(end:WireEnd)=>{
      if(end.part===ids.decoder && end.pin===pin) return true;
      if(!match || end.part!==board || !end.pin) return false;
      const target=end.pin.match(/^([a-j])(\d+)$/);
      return target && target[2]===match[2] && (target[1]<='e')===(match[1]<='e');
    };
    const candidates=snapshot.wires.filter(w=>terminal(w.a)||terminal(w.b));
    if(candidates.length!==1) throw new Error(`La entrada ${pin} debe tener un único cable antes de actualizar el tiempo total.`);
    const wire=candidates[0],side=terminal(wire.a)?'b':'a',output=TRIP_OUTPUTS[index],definition=PARTS[mcu.type].pins(mcu.props).find(p=>p.id===output),at=definition&&toWorld(mcu,definition);
    if(!at) throw new Error(`El GIGA no tiene el pin ${output}.`);
    if(snapshot.wires.some(w=>w.id!==wire.id && [w.a,w.b].some(e=>e.part===mcu.id && e.pin===output))) throw new Error(`El pin ${output} ya está utilizado.`);
    wire[side]={part:mcu.id,pin:output,...at};
    wire.points=[];
  });
  const aliases=TRIP_OUTPUTS.map((pin,i)=>`${pin}=${i<4?`TIME${i}`:'TIME_ENABLE'}`).join(';');
  const existing=String(mcu.props.nets??'').split(';').filter(entry=>!TRIP_OUTPUTS.some(pin=>entry.startsWith(`${pin}=`))).filter(Boolean).join(';');
  mcu.props.nets=[existing,aliases].filter(Boolean).join(';');
  decoder.props.label='U17 · CD4511 · tiempo total 0–9 s';
  display.props.label='Display · segundos restantes del viaje';
  return snapshot;
}
