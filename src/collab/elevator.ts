// Ascensor de cuatro pisos: control con integrados comerciales y Arduino GIGA como innovación.
//
// La lógica obligatoria (memoria del destino, bloqueo, piso actual, comparación, LEDs y los
// displays del piso actual y del destino) la resuelven CI 74HC más un TLC555 de reloj. El GIGA
// no decide nada: inyecta llamadas de piso desde la GIGA Display Shield (como un pulsador más),
// mueve la cabina activando los sensores de planta y muestra el estado y el tiempo del viaje. Sin él, el ascensor sigue funcionando
// con los pulsadores y el DIP de sensores.
//
// Todo trabaja a 3,3 V porque el GIGA no tolera 5 V: los 74HC (incluido el 74HC48) van de 2 a 6 V
// y el TLC555 (CMOS) desde 2 V. La shield va montada detrás del GIGA y no ocupa cabezales.
//
// Seis protoboards de 830 puntos, de arriba abajo en el sentido de la señal:
//   1 · Pulsadores y codificación   U1 74HC08 · U2 74HC00 · U3 74HC04
//   2 · Memoria y control           U4 TLC555 · U5 74HC74 · U6 74HC08 · U7 74HC32 · U8 74HC193
//   3 · Sensores y comparación      U9 74HC00 · U10 74HC04 · U11 74HC193 · U12 74HC85 · U13 74HC08
//   4 · Display del destino         U14 74HC48 · display de cátodo común · LS y LB
//   5 · Cuenta regresiva            U15 TLC555 · U18 74HC00 · U16 74HC193 · U17 74HC48
//   6 · Piso actual                 D1–D4 · U19 74HC48 · display de cátodo común
//
// No hay 74HC148 en el laboratorio: los dos codificadores de 4 a 3 bits son de compuertas, y el
// «hay sensor» de U11 sale de un OR de diodos para que su carga asíncrona nunca lea un 000.
import { Bench, WIRE, type Ref } from './bench';
import { ELEVATOR_GIGA } from './elevatorSketch';
import type { Template } from './templates';
import { mountedPosition } from '../parts/stack';

/** Pines del GIGA (columna impar del cabezal lateral: queda de cara a las placas). */
export const GIGA_PINS = {
  call: ['D23', 'D25', 'D27', 'D29'],
  sensor: ['D31', 'D33', 'D35', 'D37'],
  count: ['D39', 'D41'], // cuenta regresiva (U16 Q0, Q1): la cabina llega cuando vale 0
  busy: 'D43',
  valid: 'D45',
  dest: ['D47', 'D49', 'D51'],
};

/** «pin=NOMBRE;…» de cada pieza que gobierna una señal. */
export const NET_NAMES: Record<string, string> = {
  ...Object.fromEntries([1, 2, 3, 4].flatMap((f) => [[`pp${f}`, `2a=PP${f};2b=PP${f}`], [`call${f}`, `2a=LL${f};2b=LL${f}`]])),
  sp: '1B=SP1;2B=SP2;3B=SP3;4B=SP4',
  reset: '2a=/RESET;2b=/RESET',
  u1: '1Y=/PED1;2Y=/PED2;3Y=/PED3;4Y=/PED4',
  u2: '1Y=SEL0;2Y=SEL1;3Y=SEL2',
  u3: '3Y=/ACEPTAR;6Y=RESET',
  u4: 'OUT=CLK',
  u5: '1Q=OCUPADO;1QN=/OCUPADO;2Q=VÁLIDO',
  u6: '4Y=ACEPTAR;1Y=MANTENER',
  u7: '1Y=OCUPADO_SIG;4Y=VÁLIDO_SIG;3Y=SOLICITUD',
  u8: 'Q0=DEST0;Q1=DEST1;Q2=DEST2',
  u9: '1Y=SEN0;2Y=SEN1;3Y=SEN2',
  u10: '5Y=SENSOR;6Y=/LLEGÓ',
  dsen1: 'A=/SENSOR',
  u11: 'Q0=PISO0;Q1=PISO1;Q2=PISO2',
  u12: 'OAGTB=DEST>PISO;OALTB=DEST<PISO;OAEQB=DEST=PISO',
  u13: '1Y=LLEGÓ;2Y=SUBIR;4Y=BAJAR',
  u19: 'SA=P_A;SB=P_B;SC=P_C;SD=P_D;SE=P_E;SF=P_F;SG=P_G',
  u14: 'SA=SEG_A;SB=SEG_B;SC=SEG_C;SD=SEG_D;SE=SEG_E;SF=SEG_F;SG=SEG_G',
  u15: 'OUT=CLK_1HZ',
  u16: 'Q0=CNT0;Q1=CNT1;Q2=CNT2;Q3=CNT3;TCD=/PRÉSTAMO',
  u17: 'SA=T_A;SB=T_B;SC=T_C;SD=T_D;SE=T_E;SF=T_F;SG=T_G',
  u18: '1Y=/CLK_1HZ;2Y=CARGA;3Y=/CARGA',
};

export function elevatorTemplate(): Template {
  const r = new Bench();
  const [B1, B2, B3, B4, B5, B6] = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
  r.board(B1, 0, 0, '1 · Pulsadores y codificación');
  r.board(B2, 0, 300, '2 · Memoria y control');
  r.board(B3, 0, 600, '3 · Sensores y comparación');
  r.board(B4, 0, 900, '4 · Display del destino e indicadores');
  r.board(B5, 0, 1200, '5 · Cuenta regresiva');
  r.board(B6, 0, 1500, '6 · Piso actual');
  r.loose('giga', 'arduino-giga', -520, 0, { label: 'Arduino GIGA R1 WiFi · innovación' });
  // La shield va encajada sobre el GIGA, como en el banco: se mueven juntos.
  const board = { id: '', type: 'arduino-giga', x: -520, y: 0, rot: 0 as const, props: {} };
  const screen = mountedPosition({ id: '', type: 'giga-display-shield', x: 0, y: 0, rot: 0, props: {} }, board);
  r.loose('screen', 'giga-display-shield', screen.x, screen.y, { label: 'GIGA Display Shield · llamadas táctiles' });

  const vcc = (ref: Ref) => r.rail(ref, true);
  const gnd = (ref: Ref) => r.rail(ref, false);

  // ── Alimentación: el GIGA da 3,3 V a la lógica y 5 V solo a la pantalla ──────
  r.chainRails([B1, B2, B3, B4, B5, B6]);
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
  r.dip('u2', '74hc00', B1, 46, 'U2 · 74HC00 · codificador de destino', true);
  r.dip('u3', '74hc04', B1, 56, 'U3 · 74HC04 · inversores de control');
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
  }
  // Codificador de compuertas (U2 74HC00). /PEDf vale 0 si se pide el piso f; el piso f sale en
  // binario natural: SEL0 = PED1 + PED3, SEL1 = PED2 + PED3 y SEL2 = PED4, cada OR como una NAND
  // de las entradas activas en bajo. Sin prioridad: dos pisos pulsados a la vez suman sus bits.
  r.wire(['u1', '1Y'], ['u2', '1A'], WIRE.cabin);
  r.wire(['u1', '3Y'], ['u2', '1B'], WIRE.cabin);
  r.wire(['u1', '2Y'], ['u2', '2A'], WIRE.cabin);
  r.wire(['u2', '1B'], ['u2', '2B'], WIRE.cabin);
  r.wire(['u1', '4Y'], ['u2', '3A'], WIRE.cabin);
  r.wire(['u2', '3A'], ['u2', '3B'], WIRE.cabin);
  gnd(['u2', '4A']);
  gnd(['u2', '4B']);
  // U3 solo conserva /ACEPTAR (puerta 3) y RESET (puerta 6).
  for (const p of ['1A', '2A', '4A', '5A']) gnd(['u3', p]);


  // ── Placa 2: reloj, memoria del destino y máquina de estados ─────────────────
  // RESET general: pulsador con pull-up; a 0 borra los registros y los biestables.
  r.put('reset', 'pushbutton', B2, 5, 'e', { cap: 'red', label: 'RESET general' });
  r.fromRail('resetR', B2, 7, 'tp', 10_000);
  gnd(['reset', '1a']);
  // RESET activo en alto para los 74HC193 (el pulsador da RESET activo en bajo): U3, puerta 6.
  r.wire(['reset', '2a'], ['u3', '6A'], WIRE.reset);
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
  r.dip('u8', '74hc193', B2, 45, 'U8 · 74HC193 · memoria del destino');
  for (const u of ['u5', 'u6', 'u7', 'u8']) {
    vcc([u, 'VCC']);
    gnd([u, 'GND']);
  }
  // Reloj de la máquina de estados; reset a biestables (activo en bajo) y registros (en alto).
  r.wire(['u4', 'OUT'], ['u5', '1CLK'], WIRE.clock);
  r.wire(['u5', '1CLK'], ['u5', '2CLK'], WIRE.clock);
  r.wire(['reset', '2b'], ['u5', '1CLR'], WIRE.reset);
  r.wire(['reset', '2a'], ['u5', '2CLR'], WIRE.reset);
  r.wire(['u3', '6Y'], ['u8', 'MR'], WIRE.reset);
  vcc(['u5', '1PRE']);
  vcc(['u5', '2PRE']);
  // Destino: el 74HC193 como registro. D0–D2 desde U2 y D3 a 0; con CPU = CPD = 1 nunca
  // cuenta, solo carga (PL a 0 copia D al instante).
  r.wire(['u2', '1Y'], ['u8', 'D0'], WIRE.dest);
  r.wire(['u2', '2Y'], ['u8', 'D1'], WIRE.dest);
  r.wire(['u2', '3Y'], ['u8', 'D2'], WIRE.dest);
  gnd(['u8', 'D3']);
  vcc(['u8', 'CPU']);
  vcc(['u8', 'CPD']);
  // SOLICITUD = SEL0 + SEL1 + SEL2 (U7, puertas 2 y 3): todo piso pedido da un código distinto de 0.
  r.wire(['u2', '1Y'], ['u7', '2A'], WIRE.dest);
  r.wire(['u2', '2Y'], ['u7', '2B'], WIRE.dest);
  r.wire(['u7', '2Y'], ['u7', '3A'], WIRE.control);
  r.wire(['u2', '3Y'], ['u7', '3B'], WIRE.dest);
  // ACEPTAR = /OCUPADO · SOLICITUD (U6, puerta 4).
  r.wire(['u5', '1QN'], ['u6', '4A'], WIRE.control);
  r.wire(['u7', '3Y'], ['u6', '4B'], WIRE.control);
  // PL de U8 es activo en bajo: carga el destino mientras ACEPTAR = 1 (U3, puerta 3, lo invierte).
  r.wire(['u6', '4Y'], ['u3', '3A'], WIRE.control);
  r.wire(['u3', '3Y'], ['u8', 'PL'], WIRE.control);
  // MANTENER = OCUPADO · /LLEGÓ (U6, puerta 1). OCUPADO⁺ = ACEPTAR + MANTENER (U7, puerta 1).
  r.wire(['u5', '1Q'], ['u6', '1A'], WIRE.control);
  r.wire(['u6', '1Y'], ['u7', '1A'], WIRE.control);
  r.wire(['u6', '4Y'], ['u7', '1B'], WIRE.control);
  r.wire(['u7', '1Y'], ['u5', '1D'], WIRE.control);
  // VÁLIDO⁺ = VÁLIDO + ACEPTAR (U7, puerta 4): el display se enciende con la primera solicitud.
  r.wire(['u5', '2Q'], ['u7', '4B'], WIRE.control);
  r.wire(['u6', '4Y'], ['u7', '4A'], WIRE.control);
  r.wire(['u7', '4Y'], ['u5', '2D'], WIRE.control);
  for (const p of ['2A', '2B', '3A', '3B']) gnd(['u6', p]);

  // ── Placa 3: sensores de planta, piso actual y comparación ───────────────────
  // SP1–SP4: DIP de 4 interruptores a masa con pull-up de 10 kΩ. Sensor activo = 0.
  r.put('sp', 'dip-switch-4', B3, 7, 'e', { s1: false, s2: false, s3: false, s4: false, label: 'SP1–SP4 · sensores de planta' });
  for (let f = 1; f <= 4; f++) {
    r.fromRail(`sp${f}R`, B3, 6 + f, 'tp', 10_000);
    gnd(['sp', `${f}A`]);
  }
  // Detector de sensor, en la placa 6 por espacio: /SENSOR = /SP1 · /SP2 · /SP3 · /SP4 con cuatro
  // diodos y un pull-up de 10 kΩ. Un sensor activo (a 0) tira del nodo a ≈0,6 V por su diodo.
  // Ánodos en la columna 7, en las dos mitades.
  r.fromRail('dsenR', B6, 7, 'tp', 10_000);
  for (const [f, row, rot] of [
    [1, 'c', 180],
    [2, 'd', 0],
    [3, 'g', 180],
    [4, 'h', 0],
  ] as const) {
    r.put(`dsen${f}`, 'diode', B6, 7, row, { label: `D${f} · sensor ${f}` }, rot);
    r.wire(['sp', `${f}B`], [`dsen${f}`, 'K'], WIRE.sensor);
  }
  r.wire(['dsen1', 'A'], ['dsen3', 'A'], WIRE.sensor);
  r.dip('u9', '74hc00', B3, 14, 'U9 · 74HC00 · codificador de sensores');
  r.dip('u10', '74hc04', B3, 24, 'U10 · 74HC04 · SENSOR y /LLEGÓ');
  r.dip('u11', '74hc193', B3, 33, 'U11 · 74HC193 · memoria del piso actual');
  r.dip('u12', '74hc85', B3, 43, 'U12 · 74HC85 · comparador');
  r.dip('u13', '74hc08', B3, 53, 'U13 · 74HC08 · LLEGÓ, SUBIR y BAJAR');
  for (const u of ['u9', 'u10', 'u11', 'u12', 'u13']) {
    vcc([u, 'VCC']);
    gnd([u, 'GND']);
  }
  // Mismo codificador que U2: SEN0 = SP1 + SP3, SEN1 = SP2 + SP3 y SEN2 = SP4 (U9, puertas 1–3).
  r.wire(['sp', '1B'], ['u9', '1A'], WIRE.sensor);
  r.wire(['sp', '3B'], ['u9', '1B'], WIRE.sensor);
  r.wire(['sp', '2B'], ['u9', '2A'], WIRE.sensor);
  r.wire(['u9', '1B'], ['u9', '2B'], WIRE.sensor);
  r.wire(['sp', '4B'], ['u9', '3A'], WIRE.sensor);
  r.wire(['u9', '3A'], ['u9', '3B'], WIRE.sensor);
  gnd(['u9', '4A']);
  gnd(['u9', '4B']);
  // /SENSOR (placa 6) llega por los diodos sin retardo de compuerta; U10 (puerta 5) da SENSOR.
  r.wire(['dsen3', 'A'], ['u10', '5A'], WIRE.sensor);
  for (const p of ['1A', '2A', '4A']) gnd(['u10', p]);
  // Piso actual: copia el sensor mientras haya uno activo (PL = /SENSOR, activo en bajo) y lo
  // conserva entre plantas. Al soltarse el sensor, PL sube antes de que U9 lleve los bits a 000.
  r.wire(['u9', '1Y'], ['u11', 'D0'], WIRE.current);
  r.wire(['u9', '2Y'], ['u11', 'D1'], WIRE.current);
  r.wire(['u9', '3Y'], ['u11', 'D2'], WIRE.current);
  r.wire(['dsen3', 'A'], ['u11', 'PL'], WIRE.sensor);
  gnd(['u11', 'D3']);
  vcc(['u11', 'CPU']);
  vcc(['u11', 'CPD']);
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
  // /LLEGÓ vuelve a la placa 2 por U10 (puerta 6).
  gnd(['u13', '3A']);
  gnd(['u13', '3B']);
  r.wire(['u13', '1Y'], ['u10', '6A'], WIRE.control);
  r.wire(['u10', '6Y'], ['u6', '1B'], WIRE.control);
  gnd(['u10', '3A']);

  // ── Placa 4: decodificador, display e indicadores de marcha ──────────────────
  r.dip('u14', '74hc48', B4, 6, 'U14 · 74HC48 · BCD a 7 segmentos', true);
  vcc(['u14', 'VCC']);
  for (const p of ['GND', 'D']) gnd(['u14', p]);
  vcc(['u14', 'LT']);
  vcc(['u14', 'RBI']);
  // BI a 0 apaga el display: VÁLIDO lo enciende desde la primera solicitud.
  r.wire(['u5', '2Q'], ['u14', 'BIRBO'], WIRE.control);
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

  // ── Placa 5: cuenta regresiva de 3 s por piso ────────────────────────────────
  // U15 TLC555 a 1 Hz (R1 = R2 = 47 kΩ, C = 10 µF → 1,44 / (141 kΩ · 10 µF) ≈ 1,02 Hz). Solo oscila mientras OCUPADO = 1:
  // su RESET va a OCUPADO, así que parado queda a 0 y cada viaje empieza con el ciclo entero.
  r.dip('u15', 'ne555', B5, 7, 'U15 · TLC555 · 1 Hz');
  vcc(['u15', 'VCC']);
  gnd(['u15', 'GND']);
  r.fromRail('u15R1', B5, 8, 'tp', 47_000); // 3,3 V → DIS
  r.put('u15R2', 'resistor', B5, 8, 'c', { resistance: 47_000 }); // DIS → nodo de umbral (col. 12)
  r.put('u15C', 'capacitor', B5, 11, 'd', { capacitance: 10e-6 }); // nodo de umbral → masa
  gnd(['u15C', '-']);
  r.wire(['u15R2', '2'], ['u15', 'THR'], WIRE.clock);
  r.wire(['u15', 'TRIG'], ['u15', 'THR'], WIRE.clock);
  // U18 74HC00, tres puertas NAND:
  //  1 · invierte el reloj: el 555 sube nada más arrancar y el 193 cuenta en el flanco de
  //      subida; invertido, el primer «menos uno» llega al cabo de un segundo y no al instante.
  //  2 y 3 · PL = TCD · OCUPADO: en marcha recarga 3 al pasar por 0 (préstamo); parado, PL = 0
  //      lo deja fijo en 3 para el próximo viaje.
  r.dip('u18', '74hc00', B5, 15, 'U18 · 74HC00 · reloj invertido y recarga');
  vcc(['u18', 'VCC']);
  gnd(['u18', 'GND']);
  r.wire(['u15', 'OUT'], ['u18', '1A'], WIRE.clock);
  r.wire(['u18', '1A'], ['u18', '1B'], WIRE.clock);
  r.wire(['u5', '1Q'], ['u18', '2B'], WIRE.control); // OCUPADO baja desde la placa 2
  r.wire(['u18', '2B'], ['u15', 'RESET'], WIRE.control);
  r.wire(['u18', '2Y'], ['u18', '3A'], WIRE.control);
  r.wire(['u18', '3A'], ['u18', '3B'], WIRE.control);
  gnd(['u18', '4A']);
  gnd(['u18', '4B']);
  // U16 74HC193 cuenta hacia abajo con el reloj invertido; carga 0011 = 3.
  r.dip('u16', '74hc193', B5, 24, 'U16 · 74HC193 · cuenta regresiva 3-2-1');
  vcc(['u16', 'VCC']);
  gnd(['u16', 'GND']);
  r.wire(['u18', '1Y'], ['u16', 'CPD'], WIRE.clock);
  vcc(['u16', 'CPU']);
  vcc(['u16', 'D0']);
  vcc(['u16', 'D1']);
  gnd(['u16', 'D2']);
  gnd(['u16', 'D3']);
  gnd(['u16', 'MR']);
  r.wire(['u16', 'TCD'], ['u18', '2A'], WIRE.control);
  r.wire(['u18', '3Y'], ['u16', 'PL'], WIRE.control);
  // U17 74HC48 y su display: los segundos que faltan para el siguiente piso, directo de U16.
  // BI = OCUPADO: apagado en reposo. El tiempo total del viaje lo muestra la pantalla del GIGA.
  r.dip('u17', '74hc48', B5, 33, 'U17 · 74HC48 · segundos');
  vcc(['u17', 'VCC']);
  gnd(['u17', 'GND']);
  vcc(['u17', 'LT']);
  vcc(['u17', 'RBI']);
  r.wire(['u18', '2B'], ['u17', 'BIRBO'], WIRE.control);
  ['A', 'B', 'C', 'D'].forEach((pin, bit) => r.wire(['u16', `Q${bit}`], ['u17', pin], WIRE.current));
  compactDisplay('u17', 't', 'seg2', B5, 'Display · segundos al siguiente piso');

  // ── Placa 6: display del piso actual ──────────────────────────────────────────
  // U19 lee U11. RBI a 0 apaga el cero: el display queda oscuro hasta que un sensor fija el piso.
  r.dip('u19', '74hc48', B6, 33, 'U19 · 74HC48 · piso actual');
  vcc(['u19', 'VCC']);
  gnd(['u19', 'GND']);
  vcc(['u19', 'LT']);
  vcc(['u19', 'BIRBO']);
  gnd(['u19', 'RBI']);
  gnd(['u19', 'D']);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u11', `Q${bit}`], ['u19', pin], WIRE.current));
  compactDisplay('u19', 'p', 'seg3', B6, 'Display · piso actual');

  // ── GIGA: llamadas táctiles, motor de la cabina y monitor ─────────────────────
  // Llamadas y sensores en drenador abierto: INPUT suelta la línea y OUTPUT LOW la pone a 0,
  // igual que el pulsador o el interruptor de al lado. Nunca empuja 3,3 V contra ellos.
  for (let f = 1; f <= 4; f++) {
    r.wire(['giga', GIGA_PINS.call[f - 1]], [`call${f}`, '2a'], WIRE.call);
    r.wire(['giga', GIGA_PINS.sensor[f - 1]], ['sp', `${f}B`], WIRE.sensor);
  }
  GIGA_PINS.count.forEach((pin, bit) => r.wire(['giga', pin], ['u16', `Q${bit}`], WIRE.monitor));
  r.wire(['giga', GIGA_PINS.busy], ['u5', '1Q'], WIRE.monitor);
  r.wire(['giga', GIGA_PINS.valid], ['u5', '2Q'], WIRE.monitor);
  GIGA_PINS.dest.forEach((pin, bit) => r.wire(['giga', pin], ['u8', `Q${bit}`], WIRE.monitor));

  /** Display a la derecha de un 74HC48 en la columna 33, con sus siete resistencias de 220 Ω. */
  function compactDisplay(decoder: string, prefix: string, display: string, board: string, label: string) {
    r.put(display, 'seven-segment', board, 59, 'c', { label });
    gnd([display, 'COM2']);
    // g y e quedan en la columna del display: su resistencia lo toca sin cable.
    for (const [s, col, row] of [
      ['a', 42, 'b'],
      ['b', 47, 'b'],
      ['f', 52, 'b'],
      ['g', 55, 'a'],
      ['c', 42, 'i'],
      ['d', 47, 'i'],
      ['e', 55, 'j'],
    ] as const) {
      r.put(`${prefix}${s}`, 'resistor', board, col, row, { resistance: 220 });
      r.wire([decoder, `S${s.toUpperCase()}`], [`${prefix}${s}`, '1'], WIRE.segment);
      if (s !== 'g' && s !== 'e') r.wire([`${prefix}${s}`, '2'], [display, s], WIRE.segment);
    }
  }

  // Nombres de las señales para el esquema: las etiquetas de red se leen como en el plano.
  for (const p of r.parts) {
    if (NET_NAMES[p.key]) p.props = { ...p.props, nets: NET_NAMES[p.key] };
    if (p.key==='u4' || p.key==='u15') p.props = {...p.props, partNumber:'TLC555'};
  }

  return r.template({
    id: 'elevator-course',
    name: 'Ascensor de cuatro pisos · CI + Arduino GIGA',
    summary: 'Memoria del destino, bloqueo, sensores, comparador, displays del piso actual y del destino, cuenta regresiva y LEDs con CI 74HC. El GIGA añade llamadas táctiles y mueve la cabina.',
    level: 'Avanzado',
    category: 'Lógica secuencial',
    sketch: ELEVATOR_GIGA,
  });
}
