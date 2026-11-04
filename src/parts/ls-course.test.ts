import { describe, expect, it } from 'vitest';
import { PARTS } from './index';
import { fixture } from '../test/electrical';

describe('laboratory LS packages', () => {
  it('uses the 173 manufacturer pinout and implements capture, hold, clear and tristate', () => {
    expect(PARTS['74ls173'].pins({}).map(p=>p.id)).toEqual(['M','N','Q0','Q1','Q2','Q3','CP','GND','G1','G2','D3','D2','D1','D0','MR','VCC']);
    const h=fixture('74ls173',{VCC:5,M:0,N:0,G1:0,G2:0,MR:5,CP:0,D0:0,D1:0,D2:0,D3:0},{Q0:100_000,Q1:100_000,Q2:100_000,Q3:100_000});
    const value=()=>[0,1,2,3].reduce((v,i)=>v|(h.volts(`Q${i}`)>2?1<<i:0),0);
    for(let n=0;n<16;n++) {
      h.settle({MR:0,CP:0,...Object.fromEntries([0,1,2,3].map(i=>[`D${i}`,n&(1<<i)?5:0]))});
      h.settle({CP:5});expect(value()).toBe(n);
      h.settle({G1:5,CP:0,D0:0,D1:0,D2:0,D3:0});h.settle({CP:5});expect(value()).toBe(n);
      h.settle({G1:0});
    }
    h.settle({M:5});expect(value()).toBe(0);
    h.settle({M:0});expect(value()).toBe(15);
    h.settle({MR:5});expect(value()).toBe(0);
    h.settle({VCC:3.3});expect(h.model.tracker!.read().powered).toBe(false);
  });
  it('compares actual A and requested B for all sixteen floor combinations', () => {
    const h=fixture('74ls85',{VCC:5,IALTB:0,IAGTB:0,IAEQB:5,A0:0,A1:0,A2:0,A3:0,B0:0,B1:0,B2:0,B3:0});
    for(let a=1;a<=4;a++)for(let b=1;b<=4;b++) {
      h.settle(Object.fromEntries([0,1,2,3].flatMap(i=>[[`A${i}`,a&(1<<i)?5:0],[`B${i}`,b&(1<<i)?5:0]])));
      expect(h.volts('OAGTB')>2).toBe(a>b);
      expect(h.volts('OAEQB')>2).toBe(a===b);
      expect(h.volts('OALTB')>2).toBe(a<b);
    }
  });
  it('translates high and low signals in both directions while keeping the LV side below 3.6 V', () => {
    for(const drive of ['L1','H1'])for(const high of [false,true]) {
      const inputs={LV:3.3,HV:5,'GND.H':0,[drive]:high?(drive==='L1'?3.3:5):0};
      const h=fixture('level-converter-4',inputs);
      expect(h.volts('L1')).toBeLessThan(3.6);
      expect(h.volts('L1')>2.3).toBe(high);
      expect(h.volts('H1')>2).toBe(high);
    }
    // Even a TTL high at the specified 2.7 V minimum must be read as high on the GIGA side.
    const lowHigh=fixture('level-converter-4',{LV:3.3,HV:5,'GND.H':0,H1:2.7});
    expect(lowHigh.volts('L1')).toBeGreaterThan(2.3);
    expect(lowHigh.volts('L1')).toBeLessThan(3.6);
  });
});
