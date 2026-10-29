import { memo, useId, useMemo, useRef, type PointerEvent } from "react";
import { Resistor } from "../core/solver";
import { Nextion, type ScreenOp } from "../sim/nextion";
import type { PartDef, RenderProps } from "./types";

function Primitive({ op }: { op: ScreenOp }) {
  if (op.kind === "fill" || op.kind === "draw")
    return (
      <rect
        x={op.x}
        y={op.y}
        width={op.w}
        height={op.h}
        fill={op.kind === "fill" ? op.color : "none"}
        stroke={op.kind === "draw" ? op.color : undefined}
      />
    );
  if (op.kind === "line")
    return <line x1={op.x} y1={op.y} x2={op.x2} y2={op.y2} stroke={op.color} />;
  if (op.kind !== "text") return null;
  const size = op.font === 0 ? 16 : 24;
  const x = op.x + (op.align === 0 ? 0 : op.align === 1 ? op.w / 2 : op.w);
  const y =
    op.y +
    (op.valign === 0 ? size : op.valign === 1 ? (op.h + size * 0.7) / 2 : op.h);
  return (
    <svg
      x={op.x}
      y={op.y}
      width={op.w}
      height={op.h}
      viewBox={`${op.x} ${op.y} ${op.w} ${op.h}`}
      overflow="hidden"
    >
      {op.opaque && (
        <rect
          x={op.x}
          y={op.y}
          width={op.w}
          height={op.h}
          fill={op.background}
        />
      )}
      <text
        x={x}
        y={y}
        fontSize={size}
        fill={op.color}
        textAnchor={
          op.align === 0 ? "start" : op.align === 1 ? "middle" : "end"
        }
        fontFamily="monospace"
      >
        {op.text}
      </text>
    </svg>
  );
}
const NextionRender = memo(function NextionRender({
  visual,
  onInput,
  preview,
}: RenderProps) {
  const id = useId().replace(/:/g, "");
  const scene = String(visual?.scene ?? "[]");
  const ops = useMemo(() => JSON.parse(scene) as ScreenOp[], [scene]);
  const held = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const powered = Boolean(visual?.powered);
  const live = !preview && powered && Boolean(onInput);
  const coordinate = (e: PointerEvent<SVGGElement>) => {
    const matrix = e.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return {
      x: Math.max(0, Math.min(319, Math.floor(p.x))),
      y: Math.max(0, Math.min(239, Math.floor(p.y))),
    };
  };
  const release = (pointer?: number) => {
    const p = held.current;
    if (p && (pointer === undefined || pointer === p.pointer)) {
      onInput?.("touch", (p.x << 9) | p.y);
      held.current = null;
    }
  };
  return (
    <g>
      <defs>
        <linearGradient id={`${id}frame`} x2="0" y2="1">
          <stop stopColor="#b6bac1" />
          <stop offset=".06" stopColor="#60646c" />
          <stop offset=".5" stopColor="#343840" />
          <stop offset="1" stopColor="#101217" />
        </linearGradient>
        <linearGradient id={`${id}glass`} x2=".7" y2="1">
          <stop stopColor="#fff" stopOpacity=".07" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}screen`}>
          <rect width={320} height={240} />
        </clipPath>
      </defs>
      <rect
        x={-10}
        y={-12}
        width={386}
        height={302}
        rx={4}
        fill="#164b46"
        stroke="#44756a"
        strokeWidth={1}
      />
      {[
        [0, 0],
        [366, 0],
        [0, 278],
        [366, 278],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={5} fill="#c1a763" />
          <circle cx={x} cy={y} r={2.8} fill="#151c20" />
          <circle
            cx={x}
            cy={y}
            r={4.2}
            fill="none"
            stroke="#e5d296"
            strokeWidth={0.6}
          />
        </g>
      ))}
      <rect
        x={8}
        y={10}
        width={350}
        height={266}
        rx={3}
        fill={`url(#${id}frame)`}
        stroke="#121416"
        strokeWidth={2}
      />
      <rect
        x={17}
        y={19}
        width={332}
        height={250}
        rx={1}
        fill="#07090b"
        stroke="#020304"
        strokeWidth={2}
      />
      <g transform="translate(23 24)">
        <rect width={320} height={240} fill={powered ? "#071016" : "#10151a"} />
        <g
          clipPath={`url(#${id}screen)`}
          opacity={powered ? Number(visual?.brightness ?? 100) / 100 : 0}
          pointerEvents="none"
        >
          {ops.map((op, i) => (
            <Primitive key={i} op={op} />
          ))}
        </g>
        {!visual && (
          <g fill="#899392" fontFamily="monospace" pointerEvents="none">
            <text x={160} y={105} fontSize={20} textAnchor="middle">
              NEXTION
            </text>
            <text x={160} y={129} fontSize={10} textAnchor="middle">
              320 × 240 · UART HMI
            </text>
          </g>
        )}
        <rect
          width={320}
          height={240}
          fill={`url(#${id}glass)`}
          pointerEvents="none"
        />
        <g
          data-interactive={live ? "true" : undefined}
          role="application"
          aria-label="Pantalla táctil Nextion, 320 por 240 píxeles"
          tabIndex={live ? 0 : undefined}
          style={{
            cursor: live ? "crosshair" : undefined,
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            if (!live || held.current) return;
            e.stopPropagation();
            const p = coordinate(e);
            if (p) {
              held.current = { ...p, pointer: e.pointerId };
              e.currentTarget.setPointerCapture(e.pointerId);
              onInput?.("touch", (1 << 18) | (p.x << 9) | p.y);
            }
          }}
          onPointerUp={(e) => {
            if (held.current?.pointer === e.pointerId) {
              e.stopPropagation();
              const p = coordinate(e);
              if (p) held.current = { ...p, pointer: e.pointerId };
            }
            release(e.pointerId);
          }}
          onPointerCancel={(e) => release(e.pointerId)}
          onLostPointerCapture={(e) => release(e.pointerId)}
          onKeyDown={(e) => {
            if (live && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              e.stopPropagation();
              onInput?.("touch", (1 << 18) | (160 << 9) | 120);
              onInput?.("touch", (160 << 9) | 120);
            }
          }}
        >
          <rect width={320} height={240} fill="transparent" />
        </g>
      </g>
      <rect
        x={-19}
        y={78}
        width={15}
        height={48}
        rx={1}
        fill="#e0dcd1"
        stroke="#97968e"
      />
      {["5V", "TX", "RX", "GND"].map((pin, i) => (
        <g key={pin}>
          <rect x={-25} y={88 + i * 10} width={10} height={4} fill="#b0aaa0" />
          <text
            x={-3}
            y={93 + i * 10}
            fontSize={4}
            fill="#d0d6cd"
            fontFamily="monospace"
          >
            {pin}
          </text>
        </g>
      ))}
      <text
        x={183}
        y={285}
        textAnchor="middle"
        fontFamily="monospace"
        fontSize={5.5}
        letterSpacing="1"
        fill="#c8d6c9"
      >
        NEXTION NX3224T028 · 2.8″ BASIC
      </text>
    </g>
  );
});
export const nextion: PartDef = {
  type: "nextion-28",
  name: "Pantalla táctil Nextion 2.8″",
  partNumber: "NX3224T028",
  category: "Salidas",
  family: "Pantallas",
  description:
    "HMI táctil real de 320×240 por UART. Dibuja desde Arduino con cls, fill, draw, line y xstr. sendxy=1 devuelve coordenadas al tocar. Modelo de protocolo; no carga archivos .TFT del editor Nextion.",
  keywords: [
    "pantalla",
    "tactil",
    "táctil",
    "touch",
    "touchscreen",
    "display",
    "hmi",
    "nextion",
    "uart",
    "serial",
    "nx3224t028",
  ],
  defaults: {},
  pins: () => [
    {
      id: "VCC",
      x: -20,
      y: 90,
      kind: "leg",
      label: "5 V",
      desc: "Alimentación de 5 V; conecta también GND al Arduino",
    },
    {
      id: "TX",
      x: -20,
      y: 100,
      kind: "leg",
      label: "TX → RX Arduino",
      desc: "Salida UART: respuestas y paquetes táctiles 0x67, 9600 baudios al encender",
    },
    {
      id: "RX",
      x: -20,
      y: 110,
      kind: "leg",
      label: "RX ← TX Arduino",
      desc: "Entrada UART: instrucciones ASCII terminadas con tres bytes 0xFF",
    },
    {
      id: "GND",
      x: -20,
      y: 120,
      kind: "leg",
      label: "GND",
      desc: "Tierra común de alimentación y comunicación",
    },
  ],
  bounds: () => ({ x: -26, y: -12, w: 402, h: 302 }),
  ground: ["GND"],
  model: "Comportamental",
  Render: NextionRender,
  thumbScale: 0.7,
  sim(ctx) {
    const screen = new Nextion(),
      vcc = ctx.net("VCC"),
      gnd = ctx.net("GND");
    const powered = (v: Float64Array) => {
      const voltage = (vcc < 0 ? 0 : v[vcc]) - (gnd < 0 ? 0 : v[gnd]);
      return voltage >= 4.75 && voltage <= 5.5;
    };
    return {
      elements: [
        new Resistor(vcc, gnd, () => (screen.powered ? 65 : 1e8)),
        new Resistor(ctx.net("RX"), gnd, () => 1e8),
        new Resistor(ctx.net("TX"), gnd, () => 1e8),
      ],
      uart: {
        pins: { rx: "RX", tx: "TX", ground: "GND", supply: "VCC" },
        powered,
        baud: () => screen.baud,
        receive: (b) => screen.receive(b),
        drain: () => screen.drain(),
      },
      afterSolve: (v) => screen.power(powered(v)),
      onInput(key, value) {
        if (key === "touch" && typeof value === "number")
          screen.touch(
            (value >> 9) & 511,
            value & 511,
            Boolean(value & (1 << 18)),
          );
      },
      tracker: {
        sample: () => {},
        read: () => ({
          powered: screen.powered,
          scene: screen.scene,
          brightness: screen.brightness,
          error: screen.error,
        }),
      },
    };
  },
};
