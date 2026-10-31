import { buildNetlist, pinKey } from '../core/netlist';
import type { CircuitSnapshot, PartData } from '../core/types';
import { PARTS } from '../parts';
import { endPosition, partBounds } from './geometry';
import { OrthogonalRouter } from './connectionLayout';

export const SIGNAL_FAMILIES = [
  { key:'power', label:'Alimentación', colors:['#e6535b','#f38a45'] },
  { key:'ground', label:'GND', colors:['#414954'] },
  { key:'cabin', label:'Cabina', colors:['#1878de','#42ade8','#4f63cf','#1c9db8'] },
  { key:'call', label:'Llamadas', colors:['#67ac28','#aecb37','#268d72','#5cc787'] },
  { key:'destination', label:'Destino', colors:['#e0a214','#f5ca42','#bb7b16'] },
  { key:'floor', label:'Piso y sensores', colors:['#8566da','#aa88ed','#6650b8','#bf99df'] },
  { key:'control', label:'Control', colors:['#d65b99','#ef8fb4','#c53c77','#e56d5b','#b34b52','#f28a70'] },
  { key:'clock', label:'Relojes', colors:['#23bfb3','#73e0c3'] },
  { key:'reset', label:'Reinicio', colors:['#e4ebf4','#a7b6cf'] },
  { key:'counter', label:'Cuenta regresiva', colors:['#39a9c2','#77cad4','#247f9f','#49b9ad'] },
  { key:'segments', label:'Segmentos a–g', colors:['#be8756','#d68eae','#8c91db','#bdaf48','#66b7b1','#ac76b7','#7d9d61'] },
  { key:'uart', label:'UART', colors:['#8fd5f5','#b6e6ed'] },
] as const;

export function namedPins(part: PartData): [string,string][] {
  return String(part.props.nets ?? '').split(';').flatMap(entry=>{
    const eq=entry.indexOf('=');
    return eq<0 ? [] : [[entry.slice(0,eq).trim(),entry.slice(eq+1).trim()] as [string,string]];
  });
}

/** Board holes can change during a remount, but every device pin must retain its peers. */
export function deviceNetworks(snapshot: CircuitSnapshot): string[][] {
  const nets=buildNetlist(snapshot,PARTS),groups=new Map<number,string[]>();
  const devices=new Set(snapshot.parts.filter(p=>!p.type.startsWith('breadboard')).map(p=>p.id));
  for(const [key,id] of nets.netOf) {
    if(!devices.has(key.slice(0,key.lastIndexOf(':')))) continue;
    groups.set(id,[...(groups.get(id)??[]),key]);
  }
  return [...groups.values()].map(g=>g.sort()).sort((a,b)=>a[0].localeCompare(b[0]));
}

export function signalColors(snapshot: CircuitSnapshot) {
  const nets=buildNetlist(snapshot,PARTS),names=new Map<number,string[]>(),pins=new Map<number,string[]>();
  for(const [key,net] of nets.netOf) pins.set(net,[...(pins.get(net)??[]),key.slice(key.lastIndexOf(':')+1)]);
  for(const p of snapshot.parts) for(const [pin,name] of namedPins(p)) {
    const net=nets.netOf.get(pinKey(p.id,pin));
    if(net!==undefined) names.set(net,[...(names.get(net)??[]),name]);
  }
  const hash=(s:string)=>[...s].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,0);
  const familyColors=new Map<number,{color:string;family:string;name:string}>();
  for(const [net,keys] of pins) {
    const aliases=[...new Set(names.get(net)??[])].sort();
    const name=aliases[0]??keys.join('|'),normal=aliases.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    let family: typeof SIGNAL_FAMILIES[number] = SIGNAL_FAMILIES[6];
    if(keys.some(pin=>/^GND(?:\.\d+)?$/.test(pin))) family=SIGNAL_FAMILIES[1];
    else if(keys.includes('3V3') || keys.includes('5V') || keys.includes('VCC') || keys.includes('VDD')) family=SIGNAL_FAMILIES[0];
    else if(/RESET|RST/.test(normal)) family=SIGNAL_FAMILIES[8];
    else if(/CLK|CLOCK/.test(normal)) family=SIGNAL_FAMILIES[7];
    else if(/NX_|UART/.test(normal)) family=SIGNAL_FAMILIES[11];
    else if(/SEG_[A-G]|T_[A-G]/.test(normal)) family=SIGNAL_FAMILIES[10];
    else if(/CNT\d|TIME|PRESTAMO|CARGA/.test(normal)) family=SIGNAL_FAMILIES[9];
    else if(/PISO[0-2]|SEN\d|SENSOR|SP\d/.test(normal)) family=SIGNAL_FAMILIES[5];
    else if(/DEST[0-2]|SEL\d/.test(normal)) family=SIGNAL_FAMILIES[4];
    else if(/LL\d|PED\d/.test(normal)) family=SIGNAL_FAMILIES[3];
    else if(/PP\d/.test(normal)) family=SIGNAL_FAMILIES[2];
    const bit=name.match(/(?:PP|LL|PED|SEL|SEN|DEST|PISO|SP|CNT)(\d)/)?.[1];
    const segment=name.match(/(?:SEG_|T_)([A-G])/i)?.[1];
    const index=family.key==='power' ? (keys.includes('5V')?1:0) : segment ? segment.toUpperCase().charCodeAt(0)-65 : bit ? Number(bit) : hash(name);
    familyColors.set(net,{color:family.colors[index%family.colors.length],family:family.label,name});
  }
  return {nets, colors:familyColors};
}

/** Generous routing corridors between stages, with no change to the mounted circuit. */
export function readableConnections(input: CircuitSnapshot): CircuitSnapshot {
  if(!input.parts.length) return input;
  const boards=input.parts.filter(p=>p.type.startsWith('breadboard') && p.rot===0);
  const original=buildNetlist(input,PARTS),moves=new Map<string,{x:number;y:number}>();
  const left=Math.min(...boards.map(p=>p.x)),top=Math.min(...boards.map(p=>p.y));
  const width=Math.max(...boards.map(p=>partBounds(p).w));
  const columns=boards.length>=4 ? 2 : 1;
  boards.forEach((p,i)=>moves.set(p.id,{x:left+(i%columns)*(width+220)-p.x,y:top+Math.floor(i/columns)*430-p.y}));
  for(const [leg,socket] of original.inserted) {
    const board=socket.slice(0,socket.lastIndexOf(':')),id=leg.slice(0,leg.lastIndexOf(':')),move=moves.get(board);
    if(!move) continue;
    const prior=moves.get(id);
    if(prior && (prior.x!==move.x || prior.y!==move.y)) throw new Error('Una pieza une dos placas. Hay que separarla manualmente.');
    moves.set(id,move);
  }
  const parts=input.parts.map(p=>{
    let move=moves.get(p.id);
    if(!move) {
      const owner=boards.find(b=>{const box=partBounds(b),pb=partBounds(p);return pb.x>=box.x && pb.x+pb.w<=box.x+box.w && p.y>=b.y && p.y<b.y+box.h;});
      if(owner) move=moves.get(owner.id);
    }
    return move ? {...p,x:p.x+move.x,y:p.y+move.y} : p;
  });
  const byId=new Map(parts.map(p=>[p.id,p])),snapshot={parts,wires:input.wires.map(w=>({...w}))};
  if(JSON.stringify(deviceNetworks(snapshot))!==JSON.stringify(deviceNetworks(input))) throw new Error('El montaje no se puede mover sin cambiar una conexión.');
  const {nets,colors}=signalColors(snapshot),router=new OrthogonalRouter(parts,true);
  const ordered=[...snapshot.wires].filter(w=>!w.sch).sort((a,b)=>{
    const distance=(w:typeof a)=>{const p=endPosition(w.a,byId),q=endPosition(w.b,byId);return Math.abs(p.x-q.x)+Math.abs(p.y-q.y);};
    return distance(a)-distance(b)||a.id.localeCompare(b.id);
  });
  for(const w of ordered) {
    const net=w.a.part&&w.a.pin ? nets.netOf.get(pinKey(w.a.part,w.a.pin)) : undefined;
    const signal=net===undefined?undefined:colors.get(net);
    if(signal) w.color=signal.color;
    w.points=router.route(endPosition(w.a,byId),endPosition(w.b,byId)).slice(1,-1);
  }
  return snapshot;
}
