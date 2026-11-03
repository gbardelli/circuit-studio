import { describe, expect, it } from 'vitest';
import { GigaDisplay, type ShieldOp } from './gigaDisplay';
import { simLibraryFiles } from './gigaDisplayShim';

const op16 = (code: number, ...args: number[]) => [code, ...args.flatMap((a) => [a & 255, (a >> 8) & 255])];

function screen() {
  const d = new GigaDisplay();
  d.power(true);
  const send = (bytes: number[]) => bytes.forEach((b) => d.write(b));
  const ops = () => JSON.parse(d.scene) as ShieldOp[];
  return { d, send, ops };
}

describe('GIGA Display Shield', () => {
  it('dibuja en apaisado con la rotación 1 y descarta lo que tapa un relleno', () => {
    const { send, ops } = screen();
    send(op16(0x02, 1));
    send(op16(0x04, 10, 20, 30, 40, 0xf800));
    expect(ops()).toEqual([{ k: 'rect', x: 10, y: 20, w: 30, h: 40, r: 0, fill: 'rgb(255,0,0)' }]);
    send(op16(0x04, 0, 0, 100, 100, 0x001f));
    expect(ops()).toHaveLength(1);
    send(op16(0x03, 0));
    expect(ops()).toEqual([{ k: 'rect', x: 0, y: 0, w: 800, h: 480, r: 0, fill: 'rgb(0,0,0)' }]);
  });

  it('une los caracteres seguidos en un texto y gira la rotación 0 al apaisado', () => {
    const { send, ops } = screen();
    send(op16(0x02, 1));
    for (const [i, c] of [...'PISO'].entries()) send(op16(0x0e, 10 + i * 12, 30, 2, 0xffff, 0, 1, c.charCodeAt(0)));
    expect(ops()).toMatchObject([{ k: 'text', x: 10, y: 30, size: 2, text: 'PISO', rot: 0 }]);
    send(op16(0x02, 0));
    send(op16(0x04, 0, 0, 10, 20, 0xffff));
    // Vertical (480 × 800) → apaisado: (x, y) pasa a (y, 479 − x).
    expect(ops().at(-1)).toMatchObject({ x: 0, y: 470, w: 20, h: 10 });
  });

  it('entrega el toque en coordenadas del panel vertical y el LED RGB', () => {
    const { d, send } = screen();
    d.setTouch(300, 100, true);
    send([0x20]);
    const read = () => d.read();
    expect(read()).toBe(1);
    const x = read() | (read() << 8);
    const y = read() | (read() << 8);
    // El sketch con rotación 1 vuelve a la pantalla con (y, 479 − x).
    expect([y, 479 - x]).toEqual([300, 100]);
    d.setTouch(300, 100, false);
    send([0x20]);
    expect(read()).toBe(0);
    send(op16(0x0f, 0, 160, 60));
    expect(d.led).toBe('rgb(0,160,60)');
  });

  it('solo sustituye las librerías al compilar para el núcleo AVR', () => {
    const src = '#include <Arduino_GigaDisplay_GFX.h>\n#include <Arduino_GigaDisplayTouch.h>\nvoid setup(){}\nvoid loop(){}';
    expect(simLibraryFiles(src, 'arduino:avr:mega:cpu=atmega2560').map((f) => f.path)).toEqual(['Arduino_GigaDisplay_GFX/Arduino_GigaDisplay_GFX.h', 'Arduino_GigaDisplayTouch/Arduino_GigaDisplayTouch.h']);
    expect(simLibraryFiles(src, 'arduino:mbed_giga:giga')).toEqual([]);
  });
});
