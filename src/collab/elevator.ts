// Ascensor de cuatro pisos: control con integrados comerciales y Arduino GIGA como innovación.
//
// La lógica obligatoria (memoria del destino, bloqueo, piso actual, comparación, LEDs y display)
// la resuelven 13 CI de las series 74HC y 4000 más un TLC555 de reloj. El GIGA no decide nada:
// inyecta llamadas de piso desde la pantalla táctil (como un pulsador más), mueve la cabina
// activando los sensores de planta y muestra el estado. Sin él, el ascensor sigue funcionando
// con los pulsadores y el DIP de sensores.
//
// Todo trabaja a 3,3 V porque el GIGA no tolera 5 V: los 74HC van de 2 a 6 V, el CD4511 de 3 a
// 18 V y el TLC555 (CMOS) desde 2 V. Solo la Nextion va a 5 V; su UART es de 3,3 V.
//
// Cuatro protoboards de 830 puntos, de arriba abajo en el sentido de la señal:
//   1 · Pulsadores y codificación   U1 74HC08 · U2 74HC148 · U3 74HC04
//   2 · Memoria y control           U4 TLC555 · U5 74HC74 · U6 74HC08 · U7 74HC32 · U8 74HC161
//   3 · Sensores y comparación      U9 74HC148 · U10 74HC04 · U11 74HC161 · U12 74HC85 · U13 74HC08
//   4 · Display e indicadores       U14 CD4511 · display de cátodo común · LS y LB
import { Bench, WIRE, type Ref } from './bench';
import { ELEVATOR_GIGA } from './elevatorSketch';
import type { Template } from './templates';

/** Pines del GIGA (columna impar del cabezal lateral: queda de cara a las placas). */
export const GIGA_PINS = {
  call: ['D23', 'D25', 'D27', 'D29'],
  sensor: ['D31', 'D33', 'D35', 'D37'],
  up: 'D39',
  down: 'D41',
  busy: 'D43',
  valid: 'D45',
  dest: ['D47', 'D49', 'D51'],
};

export function elevatorTemplate(): Template {
  const r = new Bench();
  const [B1, B2, B3, B4] = ['b1', 'b2', 'b3', 'b4'];
  r.board(B1, 0, 0, '1 · Pulsadores y codificación');
  r.board(B2, 0, 300, '2 · Memoria y control');
  r.board(B3, 0, 600, '3 · Sensores y comparación');
  r.board(B4, 0, 900, '4 · Display e indicadores');
  r.loose('giga', 'arduino-giga', -520, 0, { label: 'Arduino GIGA R1 WiFi · innovación' });
  r.loose('screen', 'nextion-28', -470, 330, { label: 'Nextion NX3224T028 · llamadas táctiles' });

  const vcc = (ref: Ref) => r.rail(ref, true);
  const gnd = (ref: Ref) => r.rail(ref, false);

  // ── Alimentación: el GIGA da 3,3 V a la lógica y 5 V solo a la pantalla ──────
  r.chainRails([B1, B2, B3, B4]);
  r.route(['giga', '3V3'], r.railHole(B1, 'tp', 5), WIRE.v33, (a, b) => [
    { x: a.x, y: 236 },
    { x: -6, y: 236 },
    { x: -6, y: -6 },
    { x: b.x, y: -6 },
  ]);
  r.route(['giga', 'GND.2'], r.railHole(B1, 'tn', 8), WIRE.gnd, (a, b) => [
    { x: a.x, y: 241 },
    { x: -10, y: 241 },
    { x: -10, y: -9 },
    { x: b.x, y: -9 },
  ]);

  // ── Placa 1: pulsadores de cabina (PP) y de llamada (innovación) ─────────────
  // Cada pulsador: patilla 1 a masa y patilla 2 con pull-up de 10 kΩ desde el riel. Pulsado = 0.
  const cabin = [5, 9, 13, 17];
  const hall = [21, 25, 29, 33];
  for (let f = 1; f <= 4; f++) {
    for (const [id, col, cap, label] of [
      [`pp${f}`, cabin[f - 1], 'blue', `PP${f} · cabina`],
      [`call${f}`, hall[f - 1], 'yellow', `Llamada · piso ${f}`],
    ] as const) {
      r.put(id, 'pushbutton', B1, col, 'e', { cap, label });
      r.fromRail(`${id}R`, B1, col + 2, 'tp', 10_000);
      gnd([id, '1a']);
    }
  }
  r.dip('u1', '74hc08', B1, 37, 'U1 · 74HC08 · PP o llamada');
  r.dip('u2', '74hc148', B1, 46, 'U2 · 74HC148 · codificador de destino', true);
  r.dip('u3', '74hc04', B1, 56, 'U3 · 74HC04 · bits de destino');
  for (const u of ['u1', 'u2', 'u3']) {
    vcc([u, 'VCC']);
    gnd([u, 'GND']);
  }
  // Los dos pulsadores de un piso entran en una AND: basta que uno esté a 0 para pedirlo.
  // Pisos 1 y 2 por la mitad de abajo (patilla 2b), 3 y 4 por la de arriba (patilla 2a).
  for (const [f, pin] of [
    [1, '2b'],
    [2, '2b'],
    [3, '2a'],
    [4, '2a'],
  ] as const) {
    r.wire([`pp${f}`, pin], ['u1', `${f}A`], WIRE.cabin);
    r.wire([`call${f}`, pin], ['u1', `${f}B`], WIRE.call);
    r.wire(['u1', `${f}Y`], ['u2', `I${f}`], WIRE.cabin);
  }
  // 74HC148: entradas y salidas activas en bajo. I0 e I5–I7 sin uso (a 1); EI habilitado (a 0).
  for (const p of ['I0', 'I5', 'I6', 'I7']) vcc(['u2', p]);
  gnd(['u2', 'EI']);
  // U3 devuelve el código a binario natural y saca SOLICITUD (GS invertido).
  r.wire(['u2', 'A0'], ['u3', '1A'], WIRE.dest);
  r.wire(['u2', 'A1'], ['u3', '4A'], WIRE.dest);
  r.wire(['u2', 'A2'], ['u3', '5A'], WIRE.dest);
  r.wire(['u2', 'GS'], ['u3', '2A'], WIRE.control);
  gnd(['u3', '6A']);

  // ── Placa 2: reloj, memoria del destino y máquina de estados ─────────────────
  // RESET general: pulsador con pull-up; a 0 borra los registros y los biestables.
  r.put('reset', 'pushbutton', B2, 5, 'e', { cap: 'red', label: 'RESET general' });
  r.fromRail('resetR', B2, 7, 'tp', 10_000);
  gnd(['reset', '1a']);
  // U4 TLC555 astable: R1 = 1 kΩ, R2 = 33 kΩ, C = 1 µF → f = 1,44 / ((R1 + 2·R2)·C) ≈ 21 Hz.
  r.dip('u4', 'ne555', B2, 10, 'U4 · TLC555 · reloj de 21 Hz');
  vcc(['u4', 'VCC']);
  gnd(['u4', 'GND']);
  vcc(['u4', 'RESET']);
  r.fromRail('u4R1', B2, 11, 'tp', 1000); // 3,3 V → DIS
  r.put('u4R2', 'resistor', B2, 11, 'c', { resistance: 33_000 }); // DIS → nodo de umbral (col. 15)
  r.put('u4C', 'capacitor', B2, 14, 'd', { capacitance: 1e-6 }); // nodo de umbral → masa
  gnd(['u4C', '-']);
  r.wire(['u4R2', '2'], ['u4', 'THR'], WIRE.clock);
  r.wire(['u4', 'TRIG'], ['u4', 'THR'], WIRE.clock);

  r.dip('u5', '74hc74', B2, 18, 'U5 · 74HC74 · OCUPADO y VÁLIDO');
  r.dip('u6', '74hc08', B2, 27, 'U6 · 74HC08 · ACEPTAR y MANTENER');
  r.dip('u7', '74hc32', B2, 36, 'U7 · 74HC32 · próximo estado');
  r.dip('u8', '74hc161', B2, 45, 'U8 · 74HC161 · memoria del destino', true);
  for (const u of ['u5', 'u6', 'u7', 'u8']) {
    vcc([u, 'VCC']);
    gnd([u, 'GND']);
  }
  // Reloj y reset a los registros de la placa.
  r.wire(['u4', 'OUT'], ['u5', '1CLK'], WIRE.clock);
  r.wire(['u5', '1CLK'], ['u5', '2CLK'], WIRE.clock);
  r.wire(['u5', '2CLK'], ['u8', 'CP'], WIRE.clock);
  r.wire(['reset', '2b'], ['u5', '1CLR'], WIRE.reset);
  r.wire(['reset', '2a'], ['u5', '2CLR'], WIRE.reset);
  r.wire(['u5', '2CLR'], ['u8', 'MR'], WIRE.reset);
  vcc(['u5', '1PRE']);
  vcc(['u5', '2PRE']);
  // Destino: D0–D2 desde U3, D3 a 0 y sin contar (CEP = CET = 0): solo carga en paralelo.
  r.wire(['u3', '1Y'], ['u8', 'D0'], WIRE.dest);
  r.wire(['u3', '4Y'], ['u8', 'D1'], WIRE.dest);
  r.wire(['u3', '5Y'], ['u8', 'D2'], WIRE.dest);
  for (const p of ['D3', 'CEP', 'CET']) gnd(['u8', p]);
  // ACEPTAR = /OCUPADO · SOLICITUD (U6, puerta 4).
  r.wire(['u5', '1QN'], ['u6', '4A'], WIRE.control);
  r.wire(['u3', '2Y'], ['u6', '4B'], WIRE.control);
  // PE de U8 es activo en bajo: carga el destino cuando ACEPTAR = 1 (U3, puerta 3, lo invierte).
  r.wire(['u6', '4Y'], ['u3', '3A'], WIRE.control);
  r.wire(['u3', '3Y'], ['u8', 'PE'], WIRE.control);
  // MANTENER = OCUPADO · /LLEGÓ (U6, puerta 1). OCUPADO⁺ = ACEPTAR + MANTENER (U7, puerta 1).
  r.wire(['u5', '1Q'], ['u6', '1A'], WIRE.control);
  r.wire(['u6', '1Y'], ['u7', '1A'], WIRE.control);
  r.wire(['u6', '4Y'], ['u7', '1B'], WIRE.control);
  r.wire(['u7', '1Y'], ['u5', '1D'], WIRE.control);
  // VÁLIDO⁺ = VÁLIDO + ACEPTAR (U7, puerta 4): el display se enciende con la primera solicitud.
  r.wire(['u5', '2Q'], ['u7', '4B'], WIRE.control);
  r.wire(['u6', '4Y'], ['u7', '4A'], WIRE.control);
  r.wire(['u7', '4Y'], ['u5', '2D'], WIRE.control);
  for (const p of ['2A', '2B', '3A', '3B']) {
    gnd(['u6', p]);
    gnd(['u7', p]);
  }

  // ── Placa 3: sensores de planta, piso actual y comparación ───────────────────
  // SP1–SP4: DIP de 4 interruptores a masa con pull-up de 10 kΩ. Sensor activo = 0.
  r.put('sp', 'dip-switch-4', B3, 7, 'e', { s1: false, s2: false, s3: false, s4: false, label: 'SP1–SP4 · sensores de planta' });
  for (let f = 1; f <= 4; f++) {
    r.fromRail(`sp${f}R`, B3, 6 + f, 'tp', 10_000);
    gnd(['sp', `${f}A`]);
  }
  r.dip('u9', '74hc148', B3, 14, 'U9 · 74HC148 · codificador de sensores');
  r.dip('u10', '74hc04', B3, 24, 'U10 · 74HC04 · bits del piso actual');
  r.dip('u11', '74hc161', B3, 33, 'U11 · 74HC161 · memoria del piso actual');
  r.dip('u12', '74hc85', B3, 43, 'U12 · 74HC85 · comparador');
  r.dip('u13', '74hc08', B3, 53, 'U13 · 74HC08 · LLEGÓ, SUBIR y BAJAR');
  for (const u of ['u9', 'u10', 'u11', 'u12', 'u13']) {
    vcc([u, 'VCC']);
    gnd([u, 'GND']);
  }
  for (let f = 1; f <= 4; f++) r.wire(['sp', `${f}B`], ['u9', `I${f}`], WIRE.sensor);
  for (const p of ['I0', 'I5', 'I6', 'I7']) vcc(['u9', p]);
  gnd(['u9', 'EI']);
  r.wire(['u9', 'A0'], ['u10', '4A'], WIRE.current);
  r.wire(['u9', 'A1'], ['u10', '1A'], WIRE.current);
  r.wire(['u9', 'A2'], ['u10', '2A'], WIRE.current);
  r.wire(['u9', 'GS'], ['u10', '5A'], WIRE.sensor); // 5Y = SENSOR VÁLIDO
  // Piso actual: carga en cada flanco mientras haya un sensor activo (PE = GS, activo en bajo).
  r.wire(['u10', '4Y'], ['u11', 'D0'], WIRE.current);
  r.wire(['u10', '1Y'], ['u11', 'D1'], WIRE.current);
  r.wire(['u10', '2Y'], ['u11', 'D2'], WIRE.current);
  r.wire(['u9', 'GS'], ['u11', 'PE'], WIRE.sensor);
  for (const p of ['D3', 'CEP', 'CET']) gnd(['u11', p]);
  r.wire(['u8', 'CP'], ['u11', 'CP'], WIRE.clock);
  r.wire(['u8', 'MR'], ['u11', 'MR'], WIRE.reset);
  // Comparador: A = destino (U8), B = piso actual (U11), con la cascada en «igual».
  for (let bit = 0; bit < 3; bit++) {
    r.wire(['u8', `Q${bit}`], ['u12', `A${bit}`], WIRE.dest);
    r.wire(['u11', `Q${bit}`], ['u12', `B${bit}`], WIRE.current);
  }
  for (const p of ['A3', 'B3', 'IALTB', 'IAGTB']) gnd(['u12', p]);
  vcc(['u12', 'IAEQB']);
  // LLEGÓ = IGUAL · SENSOR VÁLIDO; SUBIR = OCUPADO · (A > B); BAJAR = OCUPADO · (A < B).
  r.wire(['u12', 'OAEQB'], ['u13', '1A'], WIRE.control);
  r.wire(['u10', '5Y'], ['u13', '1B'], WIRE.sensor);
  r.wire(['u12', 'OAGTB'], ['u13', '2A'], WIRE.control);
  r.wire(['u5', '1Q'], ['u13', '2B'], WIRE.control);
  r.wire(['u13', '2B'], ['u13', '4A'], WIRE.control);
  r.wire(['u12', 'OALTB'], ['u13', '4B'], WIRE.control);
  gnd(['u13', '3A']);
  gnd(['u13', '3B']);
  // /LLEGÓ vuelve a la placa 2 por U10 (puerta 6).
  r.wire(['u13', '1Y'], ['u10', '6A'], WIRE.control);
  r.wire(['u10', '6Y'], ['u6', '1B'], WIRE.control);
  gnd(['u10', '3A']);

  // ── Placa 4: decodificador, display e indicadores de marcha ──────────────────
  r.dip('u14', 'cd4511', B4, 6, 'U14 · CD4511 · BCD a 7 segmentos', true);
  vcc(['u14', 'VDD']);
  for (const p of ['VSS', 'LE', 'D']) gnd(['u14', p]);
  vcc(['u14', 'LT']);
  // BL a 0 apaga el display: VÁLIDO lo enciende desde la primera solicitud.
  r.wire(['u5', '2Q'], ['u14', 'BL'], WIRE.control);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u8', `Q${bit}`], ['u14', pin], WIRE.dest));
  r.put('seg', 'seven-segment', B4, 56, 'c', { label: 'Display · piso solicitado' });
  gnd(['seg', 'COM2']);
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((s, i) => {
    r.put(`r${s}`, 'resistor', B4, 16 + i * 5, 'h', { resistance: 220 });
    r.wire(['u14', `S${s.toUpperCase()}`], [`r${s}`, '1'], WIRE.segment);
    r.wire([`r${s}`, '2'], ['seg', s], WIRE.segment);
  });
  // LS y LB: LED con el cátodo a masa y 220 Ω en serie hacia la señal.
  for (const [id, col, color, label, signal] of [
    ['ls', 20, 'green', 'LS · subiendo', ['u13', '2Y']],
    ['lb', 28, 'red', 'LB · bajando', ['u13', '4Y']],
  ] as const) {
    r.put(id, 'led', B4, col, 'd', { color, label });
    r.put(`${id}R`, 'resistor', B4, col + 1, 'b', { resistance: 220 });
    gnd([id, 'K']);
    r.wire([...signal] as Ref, [`${id}R`, '2'], WIRE.control);
  }

  // ── GIGA: llamadas táctiles, motor de la cabina y monitor ─────────────────────
  // Llamadas y sensores en drenador abierto: INPUT suelta la línea y OUTPUT LOW la pone a 0,
  // igual que el pulsador o el interruptor de al lado. Nunca empuja 3,3 V contra ellos.
  for (let f = 1; f <= 4; f++) {
    r.wire(['giga', GIGA_PINS.call[f - 1]], [`call${f}`, '2a'], WIRE.call);
    r.wire(['giga', GIGA_PINS.sensor[f - 1]], ['sp', `${f}B`], WIRE.sensor);
  }
  r.wire(['giga', GIGA_PINS.up], ['u13', '2Y'], WIRE.monitor);
  r.wire(['giga', GIGA_PINS.down], ['u13', '4Y'], WIRE.monitor);
  r.wire(['giga', GIGA_PINS.busy], ['u5', '1Q'], WIRE.monitor);
  r.wire(['giga', GIGA_PINS.valid], ['u5', '2Q'], WIRE.monitor);
  GIGA_PINS.dest.forEach((pin, bit) => r.wire(['giga', pin], ['u8', `Q${bit}`], WIRE.monitor));

  // Pantalla: 5 V y masa del GIGA; UART cruzada (TX1 D18 → RX, TX → RX1 D19).
  r.route(['screen', 'VCC'], ['giga', '5V'], WIRE.v5, (a, b) => [
    { x: -548, y: a.y },
    { x: -548, y: 226 },
    { x: b.x, y: 226 },
  ]);
  r.route(['screen', 'GND'], ['giga', 'GND.3'], WIRE.gnd, (a, b) => [
    { x: -552, y: a.y },
    { x: -552, y: 230 },
    { x: b.x, y: 230 },
  ]);
  r.route(['giga', 'D18'], ['screen', 'RX'], WIRE.uart, (a, b) => [
    { x: a.x, y: -20 },
    { x: -560, y: -20 },
    { x: -560, y: b.y },
  ]);
  r.route(['giga', 'D19'], ['screen', 'TX'], WIRE.uart, (a, b) => [
    { x: a.x, y: -25 },
    { x: -556, y: -25 },
    { x: -556, y: b.y },
  ]);

  return r.template({
    id: 'elevator-course',
    name: 'Ascensor de cuatro pisos · CI + Arduino GIGA',
    summary: 'Memoria del destino, bloqueo, sensores, comparador, display y LEDs con 14 CI. El GIGA añade llamadas táctiles y mueve la cabina.',
    level: 'Avanzado',
    category: 'Lógica secuencial',
    sketch: ELEVATOR_GIGA,
  });
}
