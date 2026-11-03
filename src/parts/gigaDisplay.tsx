// Arduino GIGA Display Shield (ASX00039). Se acopla al GIGA R1 WiFi por detrás, sin cables: en
// el lienzo basta con dejarla junto a la placa (se monta sobre el GIGA más cercano).
import { memo, useId, useMemo, useRef, type PointerEvent } from 'react';
import { GigaDisplay, SCREEN_H, SCREEN_W, SHIELD_IN, SHIELD_OUT, type ShieldOp } from '../sim/gigaDisplay';
import type { PartDef, RenderProps } from './types';

const FONT = 'Geist, sans-serif';
/** 0,108 mm por píxel; 1 unidad del lienzo = 0,254 mm (paso de la protoboard / 10). */
const PX = 0.425;
const SX = 16;
const SY = 14;
const W = SCREEN_W * PX + SX * 2;
const H = SCREEN_H * PX + SY * 2;

function Op({ op }: { op: ShieldOp }) {
  switch (op.k) {
    case 'rect':
      return op.fill ? (
        <rect x={op.x} y={op.y} width={op.w} height={op.h} rx={op.r} fill={op.fill} />
      ) : (
        <rect x={op.x + 0.5} y={op.y + 0.5} width={op.w - 1} height={op.h - 1} rx={op.r} fill="none" stroke={op.stroke} />
      );
    case 'circle':
      return <circle cx={op.x} cy={op.y} r={op.r} fill={op.fill ?? 'none'} stroke={op.stroke} />;
    case 'line':
      return <line x1={op.x1 + 0.5} y1={op.y1 + 0.5} x2={op.x2 + 0.5} y2={op.y2 + 0.5} stroke={op.stroke} />;
    case 'poly':
      return <polygon points={op.pts.join(' ')} fill={op.fill ?? 'none'} stroke={op.stroke} />;
    case 'text': {
      // Fuente 5×7 en celdas de 6×8: misma anchura que en la pantalla real.
      const w = 6 * op.size * op.text.length;
      const h = 8 * op.size;
      return (
        <g transform={op.rot ? `rotate(${op.rot * 90} ${op.x} ${op.y})` : undefined}>
          {op.bg && <rect x={op.x} y={op.y} width={w} height={h} fill={op.bg} />}
          <text x={op.x} y={op.y + 7 * op.size} fontSize={8.6 * op.size} textLength={w - op.size} lengthAdjust="spacingAndGlyphs" fill={op.color} fontFamily="'Geist Mono', ui-monospace, monospace" fontWeight={600} style={{ whiteSpace: 'pre' }}>
            {op.text}
          </text>
        </g>
      );
    }
  }
}

const GigaDisplayRender = memo(function GigaDisplayRender({ visual, onInput, preview }: RenderProps) {
  const id = useId().replace(/:/g, '');
  const scene = String(visual?.scene ?? '[]');
  const ops = useMemo(() => JSON.parse(scene) as ShieldOp[], [scene]);
  const powered = Boolean(visual?.powered);
  const led = String(visual?.led ?? '');
  const live = !preview && powered && Boolean(onInput);
  const held = useRef<number | null>(null);
  const at = (e: PointerEvent<SVGGElement>) => {
    const m = e.currentTarget.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: Math.max(0, Math.min(SCREEN_W - 1, Math.floor(p.x))), y: Math.max(0, Math.min(SCREEN_H - 1, Math.floor(p.y))) };
  };
  const send = (x: number, y: number, down: boolean) => onInput?.('touch', (down ? 1 << 20 : 0) | (x << 10) | y);
  const last = useRef({ x: 0, y: 0 });
  return (
    <g>
      <defs>
        <linearGradient id={`${id}bezel`} x2="0" y2="1">
          <stop stopColor="#2b2f35" />
          <stop offset=".08" stopColor="#15181c" />
          <stop offset="1" stopColor="#0a0b0d" />
        </linearGradient>
        <linearGradient id={`${id}glass`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#fff" stopOpacity=".09" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}clip`}>
          <rect width={SCREEN_W} height={SCREEN_H} />
        </clipPath>
      </defs>
      <g filter="url(#f-shadow)">
        <rect x={0} y={0} width={W} height={H} rx={6} fill={`url(#${id}bezel)`} stroke="#3a3f46" strokeWidth={0.8} />
      </g>
      <rect x={SX - 3} y={SY - 3} width={SCREEN_W * PX + 6} height={SCREEN_H * PX + 6} rx={2} fill="#040506" />
      {/* Micrófono MP34DT06 y LED RGB del marco */}
      <circle cx={W - 9} cy={SY + 18} r={1.3} fill="#000" stroke="#2d3238" strokeWidth={0.4} />
      <circle cx={W - 9} cy={SY + 30} r={2.6} fill={led || '#1f2226'} stroke="#3b4048" strokeWidth={0.5} />
      {led && <circle cx={W - 9} cy={SY + 30} r={6} fill={led} opacity={0.35} pointerEvents="none" />}
      <g transform={`translate(${SX} ${SY}) scale(${PX})`}>
        <rect width={SCREEN_W} height={SCREEN_H} fill={powered ? '#000' : '#0b0d10'} />
        <g clipPath={`url(#${id}clip)`} pointerEvents="none" opacity={powered ? 1 : 0}>
          {ops.map((op, i) => (
            <Op key={i} op={op} />
          ))}
        </g>
        {!powered && (
          <g fill="#59616b" fontFamily={FONT} textAnchor="middle" pointerEvents="none">
            <text x={SCREEN_W / 2} y={SCREEN_H / 2 - 6} fontSize={34} fontWeight={600} letterSpacing={2}>
              GIGA DISPLAY SHIELD
            </text>
            <text x={SCREEN_W / 2} y={SCREEN_H / 2 + 30} fontSize={20}>
              3,97″ · 800 × 480 · táctil capacitiva
            </text>
          </g>
        )}
        <rect width={SCREEN_W} height={SCREEN_H} fill={`url(#${id}glass)`} pointerEvents="none" />
        <g
          data-interactive={live ? 'true' : undefined}
          role="application"
          aria-label="Pantalla táctil GIGA Display Shield, 800 por 480 píxeles"
          tabIndex={live ? 0 : undefined}
          style={{ cursor: live ? 'crosshair' : undefined, touchAction: 'none' }}
          onPointerDown={(e) => {
            if (!live || held.current !== null) return;
            e.stopPropagation();
            const p = at(e);
            if (!p) return;
            held.current = e.pointerId;
            last.current = p;
            e.currentTarget.setPointerCapture(e.pointerId);
            send(p.x, p.y, true);
          }}
          onPointerMove={(e) => {
            if (held.current !== e.pointerId) return;
            const p = at(e);
            if (p && (Math.abs(p.x - last.current.x) > 3 || Math.abs(p.y - last.current.y) > 3)) {
              last.current = p;
              send(p.x, p.y, true);
            }
          }}
          onPointerUp={(e) => {
            if (held.current !== e.pointerId) return;
            e.stopPropagation();
            held.current = null;
            send(last.current.x, last.current.y, false);
          }}
          onLostPointerCapture={(e) => {
            if (held.current !== e.pointerId) return;
            held.current = null;
            send(last.current.x, last.current.y, false);
          }}
          onKeyDown={(e) => {
            if (live && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              e.stopPropagation();
              send(SCREEN_W / 2, SCREEN_H / 2, true);
              send(SCREEN_W / 2, SCREEN_H / 2, false);
            }
          }}
        >
          <rect width={SCREEN_W} height={SCREEN_H} fill="transparent" />
        </g>
      </g>
      <text x={SX} y={H - 4} fontSize={4.6} fill="#8d959e" fontFamily={FONT} letterSpacing={0.6}>
        ARDUINO GIGA DISPLAY SHIELD · ASX00039
      </text>
      <text x={W - SX} y={H - 4} fontSize={4.6} fill="#6b737c" fontFamily={FONT} textAnchor="end">
        {powered ? 'montada en el GIGA' : 'acércala a un GIGA R1 con firmware'}
      </text>
    </g>
  );
});

export const gigaDisplayShield: PartDef = {
  type: 'giga-display-shield',
  name: 'GIGA Display Shield',
  partNumber: 'ASX00039',
  category: 'Salidas',
  family: 'Pantallas',
  description:
    'Pantalla táctil de 3,97″ (800 × 480) que se monta detrás del GIGA R1 WiFi, sin cables ni pines de los cabezales. Dibuja con Arduino_GigaDisplay_GFX, lee el táctil con Arduino_GigaDisplayTouch y enciende su LED RGB con GigaDisplayRGB. Modelo de las librerías; no emula LVGL, la IMU ni el micrófono.',
  keywords: ['pantalla', 'tactil', 'táctil', 'touch', 'display', 'giga', 'shield', 'asx00039', 'gfx', 'tft', 'hmi', 'rgb'],
  defaults: {},
  pins: () => [],
  bounds: () => ({ x: -2, y: -2, w: W + 4, h: H + 4 }),
  model: 'Comportamental',
  thumbScale: 0.6,
  Render: GigaDisplayRender,
  sim() {
    const screen = new GigaDisplay();
    return {
      elements: [],
      shield: {
        host: 'arduino-giga',
        out: SHIELD_OUT,
        input: SHIELD_IN,
        write: (b) => screen.write(b),
        read: () => screen.read(),
        power: (on) => screen.power(on),
      },
      onInput(key, value) {
        if (key === 'touch' && typeof value === 'number') screen.setTouch((value >> 10) & 1023, value & 1023, Boolean(value & (1 << 20)));
      },
      tracker: {
        sample: () => {},
        read: () => ({ powered: screen.powered, scene: screen.scene, led: screen.led }),
      },
    };
  },
};
