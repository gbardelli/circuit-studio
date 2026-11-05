// Ascensor de cuatro pisos con los integrados del kit de clase y el Arduino GIGA solo como pantalla.
//
// Lógica a 5 V con: 74LS75 ×2 (memoria del destino y del piso actual), 74LS85 (comparador),
// 74LS48 ×2 (displays) y compuertas 74HC (00, 04, 08, 32) más un 74HC74 (OCUPADO / VÁLIDO) y un
// NE555 de reloj. El GIGA (3,3 V) no decide nada: lee el destino, el piso actual y OCUPADO a través
// de dos adaptadores de nivel BOB-12009 (LV = 3V3 del GIGA, HV = 5 V) y lo dibuja en su pantalla.
//
//   1 · Pulsadores y prioridad    PP1–PP4 · U20 74HC08 · U2 74HC00 · U3 74HC04 · U19 74LS48 + display (piso actual)
//   2 · Control y destino         RESET · U4 NE555 · U5 74HC74 · U6 74HC08 · U7 74HC32 · U8 74LS75 · U14 74LS48 + display (destino)
//   3 · Sensores y comparación    SP1–SP4 · U9 74HC00 · U10 74HC04 · U13 74HC08 · U11 74LS75 · U12 74LS85
//
// Los 74LS75 son latches transparentes, no registros de flanco:
//  · U8 (destino) abre mientras ACEPTAR = 1 y el reloj está en bajo; se cierra en el mismo flanco de
//    subida en que el 74HC74 pone OCUPADO a 1.
//  · U11 (piso actual) abre mientras hay un sensor activo (SENSOR) y conserva el piso al soltarlo.
//    Sus datos pasan por dos inversores más que la señal SENSOR (U10): así el latch se cierra
//    antes de que el código del sensor caiga a 0 (tiempo de mantenimiento).
// Limitación conocida del latch: si pides el piso en que ya estás, el ascensor termina en el acto
// pero el latch U8 puede reabrirse mientras sigues pulsando y guardar 0 al soltar; entonces el
// display del destino se apaga (RBI a masa) hasta el siguiente pedido. No afecta a ningún viaje.
// Los LS85 y LS75 dan en alto ≈3,4 V, por debajo del umbral de una puerta HC a 5 V: las tres
// salidas del LS85 que entran en puertas HC llevan un pull-up de 4,7 kΩ.
import { Bench, WIRE, SEGMENT_COLORS, type Ref } from './bench';
import { ELEVATOR_CLASS_GIGA } from './elevatorClassSketch';
import type { Template } from './templates';
import { mountedPosition } from '../parts/stack';
import { ELEVATOR_SIGNAL_COLORS } from './elevatorPalette';

/** Pines del GIGA (columna impar del cabezal lateral) y lo que lee cada uno. */
export const CLASS_GIGA_PINS = {
  dest: ['D23', 'D25', 'D27'], // U8 1Q–3Q
  busy: 'D29', // U5 1Q
  floor: ['D31', 'D33', 'D35'], // U11 1Q–3Q
};

const NET_NAMES: Record<string, string> = {
  u8: '1Q=DEST0;2Q=DEST1;3Q=DEST2',
  u11: '1Q=PISO0;2Q=PISO1;3Q=PISO2',
  u12: 'OAGTB=PISO>DEST;OALTB=PISO<DEST;OAEQB=DEST=PISO',
  u5: '1Q=OCUPADO;1QN=/OCUPADO;2Q=VÁLIDO',
  u4: 'OUT=CLK',
  u9: '1Y=SEN0;2Y=SEN1;3Y=SEN2;4Y=SENSOR',
  u2: '2Y=PED2_O_PED3;3Y=SEL2;4Y=PED3_O_PED1_HABILITADO',
  u20: '2Y=SEL0;3Y=SEL1',
  u6: '4Y=ACEPTAR;1Y=MANTENER;2Y=LLEGÓ',
  u7: '1Y=OCUPADO_SIG;4Y=VÁLIDO_SIG;3Y=SOLICITUD',
  u13: '2Y=SUBIR;4Y=BAJAR',
};

let cached: Template | undefined;
export function elevatorClassTemplate(): Template {
  if (cached) return structuredClone(cached);
  const r = new Bench();
  const [B1, B2, B3] = ['b1', 'b2', 'b3'];
  r.board(B1, 0, 0, '1 · Pulsadores, prioridad y piso actual');
  r.board(B2, 0, 360, '2 · Control, destino y su display');
  r.board(B3, 0, 720, '3 · Sensores, piso actual y comparación');
  for (const p of r.parts) if (p.type === 'breadboard-full') p.props = { ...p.props, topVoltage: 5, bottomVoltage: 5 };
  r.loose('giga', 'arduino-giga', -700, 440, { label: 'Arduino GIGA R1 WiFi · pantalla' });
  const board = { id: '', type: 'arduino-giga', x: -700, y: 440, rot: 0 as const, props: {} };
  const screen = mountedPosition({ id: '', type: 'giga-display-shield', x: 0, y: 0, rot: 0, props: {} }, board);
  r.loose('screen', 'giga-display-shield', screen.x, screen.y, { label: 'GIGA Display Shield · estado del ascensor' });
  r.loose('conv1', 'level-converter-4', -220, 330, { label: 'Adaptador 1 · destino y OCUPADO' });
  r.loose('conv2', 'level-converter-4', -220, 470, { label: 'Adaptador 2 · piso actual' });

  const vcc = (ref: Ref) => r.rail(ref, true, WIRE.v5);
  const gnd = (ref: Ref) => r.rail(ref, false);
  const power = (u: string) => {
    vcc([u, 'VCC']);
    gnd([u, 'GND']);
  };

  // ── Alimentación: fuente de protoboard a 5 V ──────────────────────────────
  r.chainRails([B1, B2, B3], WIRE.v5);
  r.loose('supply', 'bench-supply', -520, 120, { voltage: 5, current: 1, label: 'Fuente de protoboard · 5 V' });
  r.wire(['supply', '+'], r.railHole(B1, 'tp', 5), WIRE.v5);
  r.wire(['supply', '-'], r.railHole(B1, 'tn', 8), WIRE.gnd);
  r.wire(['giga', 'GND.2'], r.railHole(B2, 'tn', 8), WIRE.gnd);

  // ── Placa 1: pulsadores de cabina, prioridad 4 > 3 > 2 > 1 y display del piso actual ──
  // Cada pulsador: patilla 1 a masa y patilla 2 con pull-up de 10 kΩ al riel. Pulsado = 0.
  const cabin = [5, 9, 13, 17];
  for (let f = 1; f <= 4; f++) {
    r.put(`pp${f}`, 'pushbutton', B1, cabin[f - 1], 'e', { cap: 'blue', label: `PP${f} · piso ${f}` });
    r.fromRail(`pp${f}R`, B1, cabin[f - 1] + 2, 'tp', 10_000);
    gnd([`pp${f}`, '1a']);
  }
  const pp = (f: number): Ref => [`pp${f}`, f <= 2 ? '2b' : '2a'];
  r.dip('u20', '74hc08', B1, 22, 'U20 · 74HC08 · prioridad de llamadas');
  r.dip('u2', '74hc00', B1, 31, 'U2 · 74HC00 · codificador de destino', true);
  r.dip('u3', '74hc04', B1, 40, 'U3 · 74HC04 · inversores');
  for (const u of ['u20', 'u2', 'u3']) power(u);
  // SEL2 = P4; SEL1 = (P2 + P3)·/P4; SEL0 = (P3 + P1·/P2)·/P4. Dos pulsaciones no dan un piso inexistente.
  r.wire(pp(2), ['u2', '2A'], WIRE.cabin);
  r.wire(pp(3), ['u2', '2B'], WIRE.cabin);
  r.wire(pp(4), ['u2', '3A'], WIRE.cabin);
  r.wire(['u2', '3A'], ['u2', '3B'], WIRE.cabin);
  r.wire(pp(1), ['u3', '1A'], WIRE.cabin);
  r.wire(['u3', '1Y'], ['u20', '1A'], WIRE.cabin);
  r.wire(['u2', '2A'], ['u20', '1B'], WIRE.cabin);
  r.wire(['u20', '1Y'], ['u3', '5A'], WIRE.cabin);
  r.wire(['u3', '5Y'], ['u2', '4A'], WIRE.cabin);
  r.wire(['u2', '2B'], ['u2', '4B'], WIRE.cabin);
  r.wire(['u2', '4Y'], ['u20', '2A'], WIRE.cabin);
  r.wire(pp(4), ['u20', '2B'], WIRE.cabin);
  r.wire(['u2', '2Y'], ['u20', '3A'], WIRE.cabin);
  r.wire(['u20', '2B'], ['u20', '3B'], WIRE.cabin);
  for (const pin of ['4A', '4B']) gnd(['u20', pin]);

  // Display del piso actual: 74LS48 (cátodo común, resistencias internas de 2 kΩ a VCC).
  // Antes del primer sensor el piso vale 0 y el display muestra «0».
  r.dip('u19', '74ls48', B1, 49, 'U19 · 74LS48 · piso actual');
  power('u19');
  vcc(['u19', 'LT']);
  vcc(['u19', 'BIRBO']);
  vcc(['u19', 'RBI']);
  gnd(['u19', 'D']);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u11', `${bit + 1}Q`], ['u19', pin], WIRE.current));
  r.put('seg3', 'seven-segment', B1, 58, 'c', { label: 'Display · piso actual' });
  gnd(['seg3', 'COM1']);
  for (const s of 'abcdefg') r.wire(['u19', `S${s.toUpperCase()}`], ['seg3', s], SEGMENT_COLORS[s]);

  // ── Placa 2: reloj, estado, memoria del destino y su display ────────────────
  r.put('reset', 'pushbutton', B2, 3, 'e', { cap: 'red', label: 'RESET general' });
  r.fromRail('resetR', B2, 5, 'tp', 10_000);
  gnd(['reset', '1a']);
  // NE555 astable (5 V): R1 = 1 kΩ, R2 = 33 kΩ, C = 1 µF → f = 1,44 / ((R1 + 2·R2)·C) ≈ 21 Hz.
  r.dip('u4', 'ne555', B2, 7, 'U4 · NE555 · reloj de 21 Hz');
  power('u4');
  vcc(['u4', 'RESET']);
  r.fromRail('u4R1', B2, 8, 'tp', 1000);
  r.put('u4R2', 'resistor', B2, 8, 'c', { resistance: 33_000 });
  r.put('u4C', 'capacitor', B2, 11, 'd', { capacitance: 1e-6 });
  gnd(['u4C', '-']);
  r.wire(['u4R2', '2'], ['u4', 'THR'], WIRE.clock);
  r.wire(['u4', 'TRIG'], ['u4', 'THR'], WIRE.clock);

  r.dip('u5', '74hc74', B2, 15, 'U5 · 74HC74 · OCUPADO y VÁLIDO');
  r.dip('u6', '74hc08', B2, 23, 'U6 · 74HC08 · ACEPTAR, MANTENER, LLEGÓ y LE');
  r.dip('u7', '74hc32', B2, 31, 'U7 · 74HC32 · próximo estado');
  r.dip('u8', '74ls75', B2, 39, 'U8 · 74LS75 · memoria del destino');
  for (const u of ['u5', 'u6', 'u7', 'u8']) power(u);
  r.wire(['u4', 'OUT'], ['u5', '1CLK'], WIRE.clock);
  r.wire(['u5', '1CLK'], ['u5', '2CLK'], WIRE.clock);
  r.wire(['reset', '2b'], ['u5', '1CLR'], WIRE.reset);
  r.wire(['reset', '2a'], ['u5', '2CLR'], WIRE.reset);
  vcc(['u5', '1PRE']);
  vcc(['u5', '2PRE']);
  // Memoria del destino: latch abierto con ACEPTAR · /CLK; se cierra cuando el flanco de subida
  // del reloj hace subir OCUPADO. U3 (puerta 3) invierte el reloj.
  r.wire(['u4', 'OUT'], ['u3', '3A'], WIRE.clock);
  r.wire(['u6', '4Y'], ['u6', '3A'], WIRE.control);
  r.wire(['u3', '3Y'], ['u6', '3B'], WIRE.clock);
  r.wire(['u6', '3Y'], ['u8', 'LE12'], WIRE.clock);
  r.wire(['u8', 'LE12'], ['u8', 'LE34'], WIRE.clock);
  r.wire(['u20', '2Y'], ['u8', '1D'], WIRE.dest);
  r.wire(['u20', '3Y'], ['u8', '2D'], WIRE.dest);
  r.wire(['u2', '3Y'], ['u8', '3D'], WIRE.dest);
  gnd(['u8', '4D']);
  // SOLICITUD = SEL0 + SEL1 + SEL2 (U7, puertas 2 y 3).
  r.wire(['u20', '2Y'], ['u7', '2A'], WIRE.dest);
  r.wire(['u20', '3Y'], ['u7', '2B'], WIRE.dest);
  r.wire(['u7', '2Y'], ['u7', '3A'], WIRE.control);
  r.wire(['u2', '3Y'], ['u7', '3B'], WIRE.dest);
  // ACEPTAR = /OCUPADO · SOLICITUD (U6, puerta 4).
  r.wire(['u5', '1QN'], ['u6', '4A'], WIRE.control);
  r.wire(['u7', '3Y'], ['u6', '4B'], WIRE.control);
  // MANTENER = OCUPADO · /LLEGÓ (U6, puerta 1); OCUPADO⁺ = ACEPTAR + MANTENER (U7, puerta 1).
  r.wire(['u5', '1Q'], ['u6', '1A'], WIRE.control);
  r.wire(['u3', '6Y'], ['u6', '1B'], WIRE.control);
  r.wire(['u6', '1Y'], ['u7', '1A'], WIRE.control);
  r.wire(['u6', '4Y'], ['u7', '1B'], WIRE.control);
  r.wire(['u7', '1Y'], ['u5', '1D'], WIRE.control);
  // VÁLIDO⁺ = VÁLIDO + ACEPTAR (U7, puerta 4): el display del destino se enciende con la primera solicitud.
  r.wire(['u5', '2Q'], ['u7', '4B'], WIRE.control);
  r.wire(['u6', '4Y'], ['u7', '4A'], WIRE.control);
  r.wire(['u7', '4Y'], ['u5', '2D'], WIRE.control);
  // LLEGÓ = (A = B) · SENSOR (U6, puerta 2) y su inverso (U3, puerta 6).
  r.wire(['u6', '2Y'], ['u3', '6A'], WIRE.control);

  // Display del destino: BI = VÁLIDO lo apaga hasta la primera solicitud; RBI a masa apaga el 0.
  r.dip('u14', '74ls48', B2, 48, 'U14 · 74LS48 · destino');
  power('u14');
  vcc(['u14', 'LT']);
  gnd(['u14', 'RBI']);
  gnd(['u14', 'D']);
  r.wire(['u5', '2Q'], ['u14', 'BIRBO'], WIRE.control);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u8', `${bit + 1}Q`], ['u14', pin], WIRE.dest));
  r.put('seg', 'seven-segment', B2, 58, 'c', { label: 'Display · destino seleccionado' });
  gnd(['seg', 'COM1']);
  for (const s of 'abcdefg') r.wire(['u14', `S${s.toUpperCase()}`], ['seg', s], SEGMENT_COLORS[s]);

  // LS y LB: inversores de U3 (puertas 2 y 4) hunden la corriente a través de 1 kΩ desde VCC.
  for (const [id, row, resistorRow, color, label, signal, inverter] of [
    ['ls', 'd', 'b', 'green', 'LS · subiendo', ['u13', '2Y'], '2'],
    ['lb', 'h', 'i', 'red', 'LB · bajando', ['u13', '4Y'], '4'],
  ] as const) {
    r.put(id, 'led', B2, 1, row, { color, label });
    r.put(`${id}R`, 'resistor', B2, 2, resistorRow, { resistance: 1000 });
    vcc([`${id}R`, '2']);
    r.wire([...signal] as Ref, ['u3', `${inverter}A`], WIRE.control);
    r.wire(['u3', `${inverter}Y`], [id, 'K'], WIRE.control);
  }

  // ── Placa 3: sensores de planta, piso actual y comparación ──────────────────
  // SP1–SP4: DIP de interruptores a masa con pull-up de 10 kΩ. Sensor activo = 0.
  r.put('sp', 'dip-switch-4', B3, 7, 'e', { s1: false, s2: false, s3: false, s4: false, label: 'SP1–SP4 · sensores de planta' });
  for (let f = 1; f <= 4; f++) {
    r.fromRail(`sp${f}R`, B3, 6 + f, 'tp', 10_000);
    gnd(['sp', `${f}A`]);
  }
  r.dip('u9', '74hc00', B3, 13, 'U9 · 74HC00 · codificador y SENSOR');
  r.dip('u10', '74hc04', B3, 22, 'U10 · 74HC04 · retardo de los datos');
  r.dip('u13', '74hc08', B3, 31, 'U13 · 74HC08 · SENSOR, SUBIR y BAJAR');
  r.dip('u11', '74ls75', B3, 40, 'U11 · 74LS75 · memoria del piso actual');
  r.dip('u12', '74ls85', B3, 51, 'U12 · 74LS85 · comparador');
  // Salidas TTL del LS85 hacia puertas HC: pull-up de 4,7 kΩ (pines 5–7 → columnas 55–57).
  r.fromRail('u12Rgt', B3, 55, 'tp', 4700);
  r.fromRail('u12Req', B3, 56, 'tp', 4700);
  r.fromRail('u12Rlt', B3, 57, 'tp', 4700);
  for (const u of ['u9', 'u10', 'u13', 'u11', 'u12']) power(u);
  // SEN0 = SP1 + SP3, SEN1 = SP2 + SP3, SEN2 = SP4 (U9, puertas 1–3: NAND de señales activas en bajo).
  r.wire(['sp', '1B'], ['u9', '1A'], WIRE.sensor);
  r.wire(['sp', '3B'], ['u9', '1B'], WIRE.sensor);
  r.wire(['sp', '2B'], ['u9', '2A'], WIRE.sensor);
  r.wire(['u9', '1B'], ['u9', '2B'], WIRE.sensor);
  r.wire(['sp', '4B'], ['u9', '3A'], WIRE.sensor);
  r.wire(['u9', '3A'], ['u9', '3B'], WIRE.sensor);
  // SENSOR = hay algún sensor activo = NAND(SP1' · SP2', SP3' · SP4') (U13 puertas 1 y 3, U9 puerta 4).
  r.wire(['sp', '1B'], ['u13', '1A'], WIRE.sensor);
  r.wire(['sp', '2B'], ['u13', '1B'], WIRE.sensor);
  r.wire(['sp', '3B'], ['u13', '3A'], WIRE.sensor);
  r.wire(['sp', '4B'], ['u13', '3B'], WIRE.sensor);
  r.wire(['u13', '1Y'], ['u9', '4A'], WIRE.sensor);
  r.wire(['u13', '3Y'], ['u9', '4B'], WIRE.sensor);
  // Datos del piso actual: cada bit pasa por dos inversores (U10) → llega después que SENSOR.
  for (const [i, gate] of [[0, '1'], [1, '2'], [2, '3']] as const) {
    const a = i * 2 + 1;
    r.wire(['u9', `${gate}Y`], ['u10', `${a}A`], WIRE.current);
    r.wire(['u10', `${a}Y`], ['u10', `${a + 1}A`], WIRE.current);
    r.wire(['u10', `${a + 1}Y`], ['u11', `${i + 1}D`], WIRE.current);
  }
  gnd(['u11', '4D']);
  r.wire(['u9', '4Y'], ['u11', 'LE12'], WIRE.sensor);
  r.wire(['u11', 'LE12'], ['u11', 'LE34'], WIRE.sensor);
  // Comparador: A = piso actual, B = destino. Cascada fija en «iguales».
  for (let bit = 0; bit < 3; bit++) {
    r.wire(['u8', `${bit + 1}Q`], ['u12', `B${bit}`], WIRE.dest);
    r.wire(['u11', `${bit + 1}Q`], ['u12', `A${bit}`], WIRE.current);
  }
  for (const p of ['A3', 'B3', 'IALTB', 'IAGTB']) gnd(['u12', p]);
  vcc(['u12', 'IAEQB']);
  r.wire(['u12', 'OAEQB'], ['u6', '2A'], WIRE.control);
  r.wire(['u12', 'OALTB'], ['u13', '2A'], WIRE.control);
  r.wire(['u5', '1Q'], ['u13', '2B'], WIRE.control);
  r.wire(['u13', '2B'], ['u13', '4A'], WIRE.control);
  r.wire(['u12', 'OAGTB'], ['u13', '4B'], WIRE.control);
  r.wire(['u9', '4Y'], ['u6', '2B'], WIRE.sensor);
  // PARAR: NAND con las dos entradas unidas al «iguales»; el LED se enciende con A = B.
  r.wire(['u12', 'OAEQB'], ['u2', '1A'], WIRE.control);
  r.wire(['u2', '1A'], ['u2', '1B'], WIRE.control);
  r.put('stop', 'led', B3, 1, 'd', { color: 'yellow', label: 'PARAR · pisos iguales' });
  r.fromRail('stopR', B3, 2, 'tp', 1000);
  r.wire(['u2', '1Y'], ['stop', 'K'], WIRE.control);
  // OCUPADO: el LED se enciende con /OCUPADO (QN del 74HC74) a 0.
  r.put('busy', 'led', B3, 1, 'h', { color: 'blue', label: 'OCUPADO · viaje en curso' });
  r.put('busyR', 'resistor', B3, 2, 'i', { resistance: 1000 });
  vcc(['busyR', '2']);
  r.wire(['u5', '1QN'], ['busy', 'K'], WIRE.control);

  // ── GIGA: solo lee, a través de dos adaptadores BOB-12009 ────────────────────
  // LV a 3V3 del GIGA y HV a 5 V; el GIGA nunca ve más de 3,3 V.
  const gigaNets: string[] = [];
  const level = (id: string, hv: Ref, gndRef: Ref) => {
    r.wire(['giga', '3V3'], [id, 'LV'], WIRE.v33);
    r.wire(hv, [id, 'HV'], WIRE.v5);
    r.wire(['giga', 'GND.1'], [id, 'GND.L'], WIRE.gnd);
    r.wire(gndRef, [id, 'GND.H'], WIRE.gnd);
  };
  level('conv1', r.railHole(B2, 'tp', 52), r.railHole(B2, 'tn', 50));
  level('conv2', r.railHole(B3, 'tp', 46), r.railHole(B3, 'tn', 44));
  const read = (conv: string, ch: number, pin: string, source: Ref, name: string) => {
    gigaNets.push(`${pin}=${name}`);
    r.wire(source, [conv, `H${ch}`], WIRE.monitor);
    r.wire([conv, `L${ch}`], ['giga', pin], WIRE.monitor);
  };
  CLASS_GIGA_PINS.dest.forEach((pin, bit) => read('conv1', bit + 1, pin, ['u8', `${bit + 1}Q`], `DEST${bit}`));
  read('conv1', 4, CLASS_GIGA_PINS.busy, ['u5', '1Q'], 'OCUPADO');
  CLASS_GIGA_PINS.floor.forEach((pin, bit) => read('conv2', bit + 1, pin, ['u11', `${bit + 1}Q`], `PISO${bit}`));

  for (const p of r.parts) {
    if (p.key === 'giga') p.props = { ...p.props, nets: gigaNets.join(';') };
    if (NET_NAMES[p.key]) p.props = { ...p.props, nets: NET_NAMES[p.key] };
  }

  cached = r.template({
    id: 'elevator-class',
    name: 'Ascensor con integrados de clase + GIGA (pantalla)',
    summary: 'Memorias 74LS75, comparador 74LS85, displays 74LS48 y compuertas HC a 5 V. El GIGA, con dos adaptadores de nivel, solo muestra el estado del ascensor en su pantalla.',
    level: 'Avanzado',
    category: 'Lógica secuencial',
    sketch: ELEVATOR_CLASS_GIGA,
  }, ELEVATOR_SIGNAL_COLORS);
  return structuredClone(cached);
}
