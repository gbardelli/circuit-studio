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
});
