import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PART_LIST } from './index';
import { SvgDefs } from './common';

describe('component SVG materials', () => {
  it('renders every component with valid, uniquely identified paint servers', () => {
    const markup = renderToStaticMarkup(<>
      <SvgDefs />
      {PART_LIST.map((def) => <svg key={def.type}>
        <def.Render part={{ id: def.type, type: def.type, x: 0, y: 0, rot: 0, props: def.defaults }} visual={{ i: 0.014, v: 5, l: 1, on: true }} preview />
      </svg>)}
    </>);
    const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ref of markup.matchAll(/url\(#([^)]*)\)/g)) expect(ids, ref[1]).toContain(ref[1]);
    expect(markup).not.toMatch(/(?:="|:)(?:NaN|Infinity)/);
  });
});
