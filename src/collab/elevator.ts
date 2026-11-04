// Ascensor de cuatro pisos: control con integrados comerciales y Arduino GIGA como innovación.
//
// La lógica obligatoria (memoria del destino, bloqueo, piso actual, comparación, LEDs y los
// displays del piso actual y del destino) la resuelven CI 74HC más un TLC555 de reloj. El GIGA
// no decide nada: inyecta llamadas de piso desde la GIGA Display Shield (como un pulsador más),
// mueve la cabina activando los sensores de planta y muestra el estado y el tiempo del viaje. Sin él, el ascensor sigue funcionando
// con los pulsadores y el DIP de sensores.
//
// Propuesta simulada a 3,3 V. La referencia física del decodificador debe confirmarse:
// este modelo «74hc48» no valida un 74LS48 real a 3,3 V. Usar TLC555 CMOS, no NE555 bipolar.
// La shield va montada detrás del GIGA y no ocupa cabezales.
//
// Cuatro protoboards de 830 puntos; sin resistencias externas en los displays porque el modelo
// 48 incluye 2 kΩ por salida. Para hardware hay que confirmar ese driver, no extrapolar a otro CI.
//   1 · Pulsadores y codificación   U15 TLC555 · U1 74HC08 · U2 74HC00 · U20 74HC08
//   2 · Memoria e indicadores       LS/LB · U3 74HC04 · U4 TLC555 · U5 74HC74 · U6 74HC08 · U7 74HC32 · U8 74HC193
//   3 · Sensores y comparación      U9 74HC00 · U10 74HC04 · U11 74HC273 · U12 74HC85 · U13 74HC08
//   4 · Cuenta y tres displays      U18 74HC00 · U16 74HC193 · U14/U19/U17 74HC48
//
// No hay 74HC148 en el laboratorio: los dos codificadores de 4 a 3 bits son de compuertas, y el
// «hay sensor» sale de las puertas libres. U11 captura por flanco de llegada y conserva el piso
// cuando se libera el sensor. Entre plantas todos los sensores deben estar inactivos.
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
  u2: '2Y=PED2_O_PED3;3Y=SEL2;4Y=PED3_O_PED1_HABILITADO',
  u20: '2Y=SEL0;3Y=SEL1',
  u3: '3Y=/ACEPTAR;6Y=RESET',
  u4: 'OUT=CLK',
  u5: '1Q=OCUPADO;1QN=/OCUPADO;2Q=VÁLIDO',
  u6: '4Y=ACEPTAR;1Y=MANTENER;2Y=CAPTURA_PISO',
  u7: '1Y=OCUPADO_SIG;4Y=VÁLIDO_SIG;3Y=SOLICITUD',
  u8: 'Q0=DEST0;Q1=DEST1;Q2=DEST2',
  u9: '1Y=SEN0;2Y=SEN1;3Y=SEN2;4Y=SEN01',
  u10: '1Y=/SEN0;2Y=/SEN1;3Y=/SEN01;4Y=/SEN2;5Y=SENSOR;6Y=/LLEGÓ',
  u11: 'Q0=PISO0;Q1=PISO1;Q2=PISO2',
  u12: 'OAGTB=DEST>PISO;OALTB=DEST<PISO;OAEQB=DEST=PISO',
  u13: '1Y=LLEGÓ;2Y=SUBIR;3Y=/SENSOR;4Y=BAJAR',
  u19: 'SA=P_A;SB=P_B;SC=P_C;SD=P_D;SE=P_E;SF=P_F;SG=P_G',
  u14: 'SA=SEG_A;SB=SEG_B;SC=SEG_C;SD=SEG_D;SE=SEG_E;SF=SEG_F;SG=SEG_G',
  u15: 'OUT=CLK_1HZ',
  u16: 'Q0=CNT0;Q1=CNT1;Q2=CNT2;Q3=CNT3;TCD=/PRÉSTAMO',
  u17: 'SA=T_A;SB=T_B;SC=T_C;SD=T_D;SE=T_E;SF=T_F;SG=T_G',
  u18: '1Y=/CLK_1HZ;2Y=CARGA;3Y=/CARGA',
};

export function elevatorTemplate(): Template {
  const r = new Bench();
  const [B1, B2, B3, B4] = ['b1', 'b2', 'b3', 'b4'];
  r.board(B1, 0, 0, '1 · Pulsadores, prioridad y reloj de cuenta');
  r.board(B2, 0, 360, '2 · Memoria y control');
  r.board(B3, 0, 720, '3 · Sensores y comparación');
  r.board(B4, 0, 1080, '4 · Cuenta y displays: destino, piso actual, segundos');
  r.loose('giga', 'arduino-giga', -520, 0, { label: 'Arduino GIGA R1 WiFi · innovación' });
  // La shield va encajada sobre el GIGA, como en el banco: se mueven juntos.
  const board = { id: '', type: 'arduino-giga', x: -520, y: 0, rot: 0 as const, props: {} };
  const screen = mountedPosition({ id: '', type: 'giga-display-shield', x: 0, y: 0, rot: 0, props: {} }, board);
  r.loose('screen', 'giga-display-shield', screen.x, screen.y, { label: 'GIGA Display Shield · llamadas táctiles' });

  const vcc = (ref: Ref) => r.rail(ref, true);
  const gnd = (ref: Ref) => r.rail(ref, false);

  // Una 74HC08 adicional resuelve prioridad 4 > 3 > 2 > 1 con las puertas libres de U2/U3.
  // U20 queda junto al codificador; U3 ocupa el extremo libre de la placa de control.
  r.dip('u20', '74hc08', B1, 56, 'U20 · 74HC08 · prioridad de llamadas');
  r.dip('u15', 'ne555', B1, 1, 'U15 · TLC555 · 1 Hz');
  r.fromRail('u15R1', B1, 2, 'tp', 47_000);
  r.put('u15R2', 'resistor', B1, 2, 'c', { resistance: 47_000 });
  r.put('u15C', 'capacitor', B1, 5, 'j', { capacitance: 10e-6 });

  // ── Alimentación: el GIGA da 3,3 V a la lógica y 5 V solo a la pantalla ──────
  r.chainRails([B1, B2, B3, B4]);
  vcc(['u20', 'VCC']);
  gnd(['u20', 'GND']);
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
  r.dip('u3', '74hc04', B2, 56, 'U3 · 74HC04 · inversores de control');
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
  // Codificador con prioridad: SEL2=P4; SEL1=(P2+P3)·/P4;
  // SEL0=(P3+P1·/P2)·/P4. Dos pulsaciones no generan un piso inexistente.
  gnd(['u2', '1A']);
  gnd(['u2', '1B']);
  r.wire(['u1', '2Y'], ['u2', '2A'], WIRE.cabin);
  r.wire(['u1', '3Y'], ['u2', '2B'], WIRE.cabin);
  r.wire(['u1', '4Y'], ['u2', '3A'], WIRE.cabin);
  r.wire(['u2', '3A'], ['u2', '3B'], WIRE.cabin);
  r.wire(['u1', '1Y'], ['u3', '1A'], WIRE.cabin);
  r.wire(['u3', '1Y'], ['u20', '1A'], WIRE.cabin);
  r.wire(['u2', '2A'], ['u20', '1B'], WIRE.cabin);
  r.wire(['u20', '1Y'], ['u3', '5A'], WIRE.cabin);
  r.wire(['u3', '5Y'], ['u2', '4A'], WIRE.cabin);
  r.wire(['u2', '2B'], ['u2', '4B'], WIRE.cabin);
  r.wire(['u2', '4Y'], ['u20', '2A'], WIRE.cabin);
  r.wire(['u1', '4Y'], ['u20', '2B'], WIRE.cabin);
  r.wire(['u2', '2Y'], ['u20', '3A'], WIRE.cabin);
  r.wire(['u20', '2B'], ['u20', '3B'], WIRE.cabin);
  for (const pin of ['4A', '4B']) gnd(['u20', pin]);
  for (const p of ['2A', '4A']) gnd(['u3', p]);


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
  r.wire(['u20', '2Y'], ['u8', 'D0'], WIRE.dest);
  r.wire(['u20', '3Y'], ['u8', 'D1'], WIRE.dest);
  r.wire(['u2', '3Y'], ['u8', 'D2'], WIRE.dest);
  gnd(['u8', 'D3']);
  vcc(['u8', 'CPU']);
  vcc(['u8', 'CPD']);
  // SOLICITUD = SEL0 + SEL1 + SEL2 (U7, puertas 2 y 3): todo piso pedido da un código distinto de 0.
  r.wire(['u20', '2Y'], ['u7', '2A'], WIRE.dest);
  r.wire(['u20', '3Y'], ['u7', '2B'], WIRE.dest);
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
  for (const p of ['3A', '3B']) gnd(['u6', p]);

  // ── Placa 3: sensores de planta, piso actual y comparación ───────────────────
  // SP1–SP4: DIP de 4 interruptores a masa con pull-up de 10 kΩ. Sensor activo = 0.
  r.put('sp', 'dip-switch-4', B3, 7, 'e', { s1: false, s2: false, s3: false, s4: false, label: 'SP1–SP4 · sensores de planta' });
  for (let f = 1; f <= 4; f++) {
    r.fromRail(`sp${f}R`, B3, 6 + f, 'tp', 10_000);
    gnd(['sp', `${f}A`]);
  }
  r.dip('u9', '74hc00', B3, 14, 'U9 · 74HC00 · codificador de sensores');
  r.dip('u10', '74hc04', B3, 24, 'U10 · 74HC04 · SENSOR y /LLEGÓ');
  r.dip('u11', '74hc273', B3, 32, 'U11 · 74HC273 · memoria del piso actual');
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
  // SENSOR = SEN0 + SEN1 + SEN2. El detector usa únicamente puertas ya disponibles.
  // La señal de captura pasa por etapas adicionales después del codificador.
  r.wire(['u9', '1Y'], ['u10', '1A'], WIRE.sensor);
  r.wire(['u9', '2Y'], ['u10', '2A'], WIRE.sensor);
  r.wire(['u10', '1Y'], ['u9', '4A'], WIRE.sensor);
  r.wire(['u10', '2Y'], ['u9', '4B'], WIRE.sensor);
  r.wire(['u9', '4Y'], ['u10', '3A'], WIRE.sensor);
  r.wire(['u9', '3Y'], ['u10', '4A'], WIRE.sensor);
  r.wire(['u10', '3Y'], ['u13', '3A'], WIRE.sensor);
  r.wire(['u10', '4Y'], ['u13', '3B'], WIRE.sensor);
  r.wire(['u13', '3Y'], ['u10', '5A'], WIRE.sensor);
  // U11 es ahora un registro por flanco, no un contador con carga transparente.
  // Captura al llegar a una planta; soltar el sensor produce un flanco de bajada y no borra Q.
  r.wire(['u9', '1Y'], ['u11', 'D0'], WIRE.current);
  r.wire(['u9', '2Y'], ['u11', 'D1'], WIRE.current);
  r.wire(['u9', '3Y'], ['u11', 'D2'], WIRE.current);
  // Al soltar RESET se vuelve a capturar el sensor presente, aunque la cabina no se haya movido.
  r.wire(['u10', '5Y'], ['u6', '2A'], WIRE.sensor);
  r.wire(['reset', '2b'], ['u6', '2B'], WIRE.reset);
  r.wire(['u6', '2Y'], ['u11', 'CP'], WIRE.sensor);
  for (const pin of ['D3', 'D4', 'D5', 'D6', 'D7']) gnd(['u11', pin]);
  r.wire(['reset', '2b'], ['u11', 'MR'], WIRE.reset);
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
  r.wire(['u13', '1Y'], ['u10', '6A'], WIRE.control);
  r.wire(['u10', '6Y'], ['u6', '1B'], WIRE.control);

  // ── Placa 4: cuenta, destino, piso actual y segundos ─────────────────────────
  r.dip('u14', '74hc48', B4, 19, 'U14 · 74HC48 · destino');
  vcc(['u14', 'VCC']);
  for (const p of ['GND', 'D']) gnd(['u14', p]);
  vcc(['u14', 'LT']);
  vcc(['u14', 'RBI']);
  // BI a 0 apaga el display: VÁLIDO lo enciende desde la primera solicitud.
  r.wire(['u5', '2Q'], ['u14', 'BIRBO'], WIRE.control);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u8', `Q${bit}`], ['u14', pin], WIRE.dest));
  compactDisplay('u14', 'seg', 28, 'Display · destino seleccionado');
  // LS y LB: 1 kΩ limita la carga de cada salida lógica a menos de 2 mA a 3,3 V.
  for (const [id, row, resistorRow, color, label, signal] of [
    ['ls', 'd', 'b', 'green', 'LS · subiendo', ['u13', '2Y']],
    ['lb', 'h', 'i', 'red', 'LB · bajando', ['u13', '4Y']],
  ] as const) {
    r.put(id, 'led', B2, 1, row, { color, label });
    r.put(`${id}R`, 'resistor', B2, 2, resistorRow, { resistance: 1000 });
    gnd([id, 'K']);
    r.wire([...signal] as Ref, [`${id}R`, '2'], WIRE.control);
  }

  // ── Cuenta regresiva: reloj en placa 1, contador en placa 4 ───────────────────
  // U15 TLC555 a 1 Hz (R1 = R2 = 47 kΩ, C = 10 µF → 1,44 / (141 kΩ · 10 µF) ≈ 1,02 Hz). Solo oscila mientras OCUPADO = 1:
  // su RESET va a OCUPADO, así que parado queda a 0 y cada viaje empieza con el ciclo entero.
  vcc(['u15', 'VCC']);
  gnd(['u15', 'GND']);
  gnd(['u15C', '-']);
  r.wire(['u15R2', '2'], ['u15C', '+'], WIRE.clock);
  r.wire(['u15R2', '2'], ['u15', 'THR'], WIRE.clock);
  r.wire(['u15', 'TRIG'], ['u15', 'THR'], WIRE.clock);
  // U18 74HC00, tres puertas NAND:
  //  1 · invierte el reloj: el 555 sube nada más arrancar y el 193 cuenta en el flanco de
  //      subida; invertido, el primer «menos uno» llega al cabo de un segundo y no al instante.
  //  2 y 3 · PL = TCD · OCUPADO: en marcha recarga 3 al pasar por 0 (préstamo); parado, PL = 0
  //      lo deja fijo en 3 para el próximo viaje.
  r.dip('u18', '74hc00', B4, 2, 'U18 · 74HC00 · reloj invertido y recarga');
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
  r.dip('u16', '74hc193', B4, 10, 'U16 · 74HC193 · cuenta regresiva 3-2-1');
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
  r.dip('u17', '74hc48', B4, 49, 'U17 · 74HC48 · segundos');
  vcc(['u17', 'VCC']);
  gnd(['u17', 'GND']);
  vcc(['u17', 'LT']);
  vcc(['u17', 'RBI']);
  r.wire(['u18', '2B'], ['u17', 'BIRBO'], WIRE.control);
  ['A', 'B', 'C', 'D'].forEach((pin, bit) => r.wire(['u16', `Q${bit}`], ['u17', pin], WIRE.current));
  compactDisplay('u17', 'seg2', 58, 'Display · segundos al siguiente piso');

  // ── Display del piso actual, al centro de la placa 4 ──────────────────────────
  // U19 lee U11. RBI a 0 apaga el cero: el display queda oscuro hasta que un sensor fija el piso.
  r.dip('u19', '74hc48', B4, 34, 'U19 · 74HC48 · piso actual');
  vcc(['u19', 'VCC']);
  gnd(['u19', 'GND']);
  vcc(['u19', 'LT']);
  vcc(['u19', 'BIRBO']);
  gnd(['u19', 'RBI']);
  gnd(['u19', 'D']);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u11', `Q${bit}`], ['u19', pin], WIRE.current));
  compactDisplay('u19', 'seg3', 43, 'Display · piso actual');

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

  // La versión de clase omite el desacoplo cerámico por petición del usuario.
  // El modelo ideal no verifica ruido de alimentación: no certifica su omisión en hardware.

  /** El modelo 48 limita cada segmento con sus 2 kΩ internos; no se añaden resistencias externas. */
  function compactDisplay(decoder: string, display: string, col: number, label: string) {
    r.put(display, 'seven-segment', B4, col, 'c', { label });
    gnd([display, 'COM2']);
    for (const s of 'abcdefg') r.wire([decoder, `S${s.toUpperCase()}`], [display, s], WIRE.segment);
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
