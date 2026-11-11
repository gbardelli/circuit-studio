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
});
