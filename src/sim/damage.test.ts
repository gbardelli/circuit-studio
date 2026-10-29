import { describe, expect, it } from 'vitest';
import { assessDamage, clearDamage, damageOf, trackDamage } from './damage';

describe('daños', () => {
  it('un LED sin resistencia se quema y explica por qué', () => {
    const d = assessDamage('led', {}, { i: 0.12 });
    expect(d?.level).toBe('broken');
    expect(d?.reason).toMatch(/120 mA/);
    expect(d?.fix).toMatch(/resistencia/);
    expect(assessDamage('led', {}, { i: 0.015 })).toBeNull();
  });

  it('un electrolítico al revés o con sobretensión revienta', () => {
    expect(assessDamage('capacitor', { voltage: 16 }, { v: -5 })).toMatchObject({ level: 'broken', effect: 'burst' });
    expect(assessDamage('capacitor', { voltage: 16 }, { v: 24 })).toMatchObject({ level: 'broken', effect: 'burst' });
    expect(assessDamage('capacitor', { voltage: 16 }, { v: 5 })).toBeNull();
  });

  it('una resistencia que disipa de más primero avisa y luego se quema', () => {
    expect(assessDamage('resistor', { power: 0.25 }, { p: 0.3 })?.level).toBe('warn');
    expect(assessDamage('resistor', { power: 0.25 }, { p: 0.8 })?.level).toBe('broken');
  });

  it('lo roto sigue roto aunque la corriente baje, hasta reiniciar', () => {
    clearDamage();
    trackDamage('p1', assessDamage('led', {}, { i: 0.2 }));
    expect(trackDamage('p1', assessDamage('led', {}, { i: 0 })).damage?.level).toBe('broken');
    expect(damageOf('p1')?.title).toBe('LED quemado');
    clearDamage('p1');
    expect(damageOf('p1')).toBeNull();
  });

  it('la vista de esquema usa las mismas reglas', () => {
    expect(assessDamage('sch:led', {}, { i: 0.2 })?.level).toBe('broken');
  });
});
