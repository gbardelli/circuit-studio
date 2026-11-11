import { describe, expect, it } from 'vitest';
import { act, create } from 'react-test-renderer';
import { ComponentReferences } from './ComponentReferences';

describe('manufacturer document display', () => {
  it('links the LVC buffer to the official TI datasheet', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ComponentReferences type="74lvc245a-read" />); });
    expect(renderer!.root.findByType('a').props.href).toBe('https://www.ti.com/lit/ds/symlink/sn74lvc245a.pdf');
    expect(renderer!.root.findByType('img').props.src).toBe('/manufacturers/texas-instruments.svg');
    act(() => renderer!.unmount());
  });
  it('distinguishes the official 74LS47 datasheet from historical archives', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ComponentReferences type="74ls47" />); });
    const links = renderer!.root.findAllByType('a');
    expect(links).toHaveLength(3);
    expect(links[0].props.href).toContain('ti.com');
    expect(links[1].props['aria-label']).toContain('archivada');
    expect(links[2].props['aria-label']).toContain('archivada');
    act(() => renderer!.unmount());
  });
  it('shows several verified sources and logos for 74HC00', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ComponentReferences type="74hc00" />); });
    expect(renderer!.root.findAllByType('a').length).toBeGreaterThanOrEqual(3);
    expect(renderer!.root.findAllByType('img').length).toBe(renderer!.root.findAllByType('a').length);
    act(() => renderer!.unmount());
  });
  it('identifies a generic LED reference as a red example', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ComponentReferences type="led" />); });
    expect(JSON.stringify(renderer!.toJSON())).toContain('LED rojo');
    expect(JSON.stringify(renderer!.toJSON())).toContain('Ejemplo');
    act(() => renderer!.unmount());
  });
  it('labels dimensional drawings accurately', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ComponentReferences type="nextion-28" />); });
    expect(renderer!.root.findByType('a').props['aria-label']).toContain('plano de dimensiones');
    act(() => renderer!.unmount());
  });
  it('identifies the store as a supplier and the generic part as an example', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ComponentReferences type="breadboard-full" />); });
    const html = JSON.stringify(renderer!.toJSON());
    expect(html).toContain('Proveedor');
    expect(html).toContain('Ejemplo');
    expect(renderer!.root.findByType('a').props.href).toBe('https://www.adafruit.com/product/239');
    expect(renderer!.root.findByType('img').props.src).toBe('/manufacturers/adafruit.png');
    act(() => renderer!.unmount());
  });
  it('links the simulated eight-channel adapter to the actual TXS0108E', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ComponentReferences type="level-converter-8" />); });
    expect(renderer!.root.findByType('a').props.href).toBe('https://www.ti.com/lit/ds/symlink/txs0108e.pdf');
    act(() => renderer!.unmount());
  });
});
