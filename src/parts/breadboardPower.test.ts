import { describe, expect, it } from 'vitest';
import { buildNetlist, pinKey } from '../core/netlist';
import { Circuit, Resistor, VSource } from '../core/solver';
import { PARTS } from './index';
import { buildAssemblyPlan, orientationText } from '../ui/assembly-plan';
import { breadboardPower } from './breadboardPower';

function supply(top = 5, bottom = 3.3) {
  const input: Record<string, number | boolean> = {};
  const props = { ...breadboardPower.defaults, top, bottom };
  const nodes: Record<string, number> = { TP: 0, BP: 1, TN: -1, BN: -1 };
  const model = breadboardPower.sim!({ props, net: pin => nodes[pin], node: () => 2, input: key => input[key] });
  const circuit = new Circuit(2, [...model.elements, new Resistor(0, -1, () => 100), new Resistor(1, -1, () => 100)]);
  const solve = () => { expect(circuit.solve(0.001).converged).toBe(true); return circuit.v; };
  return { model, input, circuit, solve };
}

describe('MB102 breadboard power module', () => {
  it('inserts all four feet into the matching rail holes and joins only the grounds', () => {
    const snapshot = {parts: [
      { id:'board',type:'breadboard-full',x:0,y:0,rot:0 as const,props:PARTS['breadboard-full'].defaults },
      { id:'power',type:'mb102-power',x:30,y:20,rot:0 as const,props:breadboardPower.defaults },
    ],wires:[]};
    const step=buildAssemblyPlan(snapshot).steps.find(s=>s.kind==='part'&&s.part.id==='power')!;
    expect(step.kind==='part'&&step.placements.length).toBe(4);
    expect(orientationText(snapshot.parts[1])).toContain('jumpers');
    const netlist = buildNetlist(snapshot, PARTS);
    for(const [pin,hole] of [['TP','tp1'],['TN','tn1'],['BP','bp1'],['BN','bn1']]) expect(netlist.inserted.get(pinKey('power',pin))).toBe(pinKey('board',hole));
    expect(netlist.netOf.get('power:TN')).toBe(netlist.netOf.get('power:BN'));
    expect(netlist.netOf.get('power:TP')).not.toBe(netlist.netOf.get('power:BP'));
  });
  it('supplies independent 5 V and 3.3 V rails under load and measures delivered current', () => {
    const h=supply(); const v=h.solve();
    expect(v[0]).toBeCloseTo(5*100/100.3,5);
    expect(v[1]).toBeCloseTo(3.3*100/100.3,5);
    expect(h.model.probe!(v).i).toBeCloseTo((v[0]+v[1])/100,6);
  });
  it('changes jumpers and the switch through live simulator input', () => {
    const h=supply();h.solve();h.input.top=3.3;expect(h.solve()[0]).toBeCloseTo(3.3*100/100.3,5);
    h.input.top=0;expect(h.solve()[0]).toBeLessThan(1e-6);expect(h.solve()[1]).toBeGreaterThan(3.2);
    h.input.on=false;expect([...h.solve()].every(v=>Math.abs(v)<1e-6)).toBe(true);
    h.input.on=true;h.input.top=5;expect(h.solve()[0]).toBeGreaterThan(4.9);
  });
  it('disconnects an OFF rail instead of shorting a different supply to ground', () => {
    const h=supply(0);h.circuit.elements.push(new VSource(0,-1,()=>5,()=>0.1));
    const v=h.solve();expect(v[0]).toBeGreaterThan(4.99);
    expect(Math.abs(h.model.elements[0] instanceof VSource ? h.model.elements[0].currentOf(v) : 1)).toBeLessThan(1e-9);
  });
});
