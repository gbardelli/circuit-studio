// Ascensor de cuatro pisos: control con integrados comerciales y Arduino GIGA como innovación.
//
// La lógica obligatoria (memoria del destino, bloqueo, piso actual, comparación, LEDs y los
// displays del piso actual y del destino) la resuelven CI 74HC y 74LS más un NE555 de reloj. El GIGA
// no decide nada: inyecta llamadas de piso desde la GIGA Display Shield (como un pulsador más),
// mueve la cabina activando los sensores de planta y muestra el estado y el tiempo del viaje. Sin él, el ascensor sigue funcionando
// con los pulsadores y el DIP de sensores.
//
// Lógica a 5 V con una fuente regulada: 74HC salvo los que en el laboratorio solo hay en LS:
// registros 74LS173, comparador 74LS85 y decodificadores 74LS48. No hay 193. El GIGA sigue a 3,3 V:
// cinco módulos SparkFun BOB-12009 aíslan ambos dominios mediante MOSFETs BSS138.
// El riel positivo inferior de la placa 2 es exclusivamente de 3,3 V; los demás son de 5 V.
// La shield va montada detrás del GIGA y no ocupa cabezales. Los dos relojes usan NE555 a 5 V.
// Los decodificadores LS48 incorporan las resistencias de salida de los segmentos.
//   1 · Pulsadores y codificación   U15 NE555 · U1 74HC08 · U2 74HC00 · U20 74HC08
//   2 · Memoria e indicadores       LS/LB · U3 74HC04 · U4 NE555 · U5 74HC74 · U6 74HC08 · U7 74HC32 · U8 74LS173
//   3 · Sensores y comparación      U9 74HC00 · U10 74HC04 · U11 74LS173 · U12 74LS85 · U13 74HC08
//   4 · Cuenta y tres displays      U18 74HC00 · U16 74LS173 · U14/U19/U17 74LS48
//
// No hay 74LS148 en el laboratorio: los dos codificadores de 4 a 3 bits son de compuertas, y el
// «hay sensor» sale de las puertas libres. U11 captura por flanco de llegada y conserva el piso
// cuando se libera el sensor. Entre plantas todos los sensores deben estar inactivos.
import { Bench, WIRE, SEGMENT_COLORS, type Ref } from './bench';
import { ELEVATOR_GIGA } from './elevatorSketch';
import type { Template } from './templates';
import { mountedPosition } from '../parts/stack';
import { ELEVATOR_SIGNAL_COLORS } from './elevatorPalette';

/** Pines del GIGA (columna impar del cabezal lateral: queda de cara a las placas). */
export const GIGA_PINS = {
  trip: ['D6', 'D7', 'D8', 'D9'], // total remaining seconds, BCD into U17
  call: ['D23', 'D25', 'D27', 'D29'],
  sensor: ['D31', 'D33', 'D35', 'D37'],
  count: ['D39', 'D41'], // fase del secuenciador (U16 Q0, Q1): la cabina llega al entrar en 10
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
  u2: '1Y=/PARAR_LED;2Y=PED2_O_PED3;3Y=SEL2;4Y=PED3_O_PED1_HABILITADO',
  u20: '2Y=SEL0;3Y=SEL1',
  u3: '2Y=/SUBIR_LED;4Y=/BAJAR_LED;3Y=/ACEPTAR;6Y=RESET',
  u4: 'OUT=CLK',
  u5: '1Q=OCUPADO;1QN=/OCUPADO;2Q=VÁLIDO',
  u6: '4Y=ACEPTAR;1Y=MANTENER;2Y=CAPTURA_PISO',
  u7: '1Y=OCUPADO_SIG;4Y=VÁLIDO_SIG;3Y=SOLICITUD',
  u8: 'Q0=DEST0;Q1=DEST1;Q2=DEST2',
  u9: '1Y=SEN0;2Y=SEN1;3Y=SEN2;4Y=SEN01',
  u10: '1Y=/SEN0;2Y=/SEN1;3Y=/SEN01;4Y=/SEN2;5Y=SENSOR;6Y=/LLEGÓ',
  u11: 'Q0=PISO0;Q1=PISO1;Q2=PISO2',
  u12: 'OAGTB=PISO>DEST;OALTB=PISO<DEST;OAEQB=DEST=PISO',
  u13: '1Y=LLEGÓ;2Y=SUBIR;3Y=/SENSOR;4Y=BAJAR',
  u19: 'SA=P_A;SB=P_B;SC=P_C;SD=P_D;SE=P_E;SF=P_F;SG=P_G',
  u14: 'SA=SEG_A;SB=SEG_B;SC=SEG_C;SD=SEG_D;SE=SEG_E;SF=SEG_F;SG=SEG_G',
  u15: 'OUT=CLK_1HZ',
  u16: 'Q0=FASE0;Q1=FASE1',
  u17: 'SA=T_A;SB=T_B;SC=T_C;SD=T_D;SE=T_E;SF=T_F;SG=T_G',
  u18: '1Y=/CLK_1HZ;2Y=FASE0_SIG',
};

let cachedTemplate: Template | undefined;
export function elevatorTemplate(): Template {
  if (cachedTemplate) return structuredClone(cachedTemplate);
  const r = new Bench();
  const [B1, B2, B3, B4] = ['b1', 'b2', 'b3', 'b4'];
  r.auxiliaryBottomRail = B2;
  r.board(B1, 0, 0, '1 · Pulsadores, prioridad y reloj de cuenta');
  r.board(B2, 0, 360, '2 · Memoria y control');
  r.board(B3, 0, 720, '3 · Sensores, piso actual y comparación');
  r.board(B4, 0, 1080, '4 · Cuenta y visualización');
  for (const p of r.parts) if (p.type === 'breadboard-full') p.props = { ...p.props, topVoltage: 5, bottomVoltage: p.key === B2 ? 3.3 : 5 };
  r.loose('giga', 'arduino-giga', -620, 500, { label: 'Arduino GIGA R1 WiFi · innovación' });
  // La shield va encajada sobre el GIGA, como en el banco: se mueven juntos.
  const board = { id: '', type: 'arduino-giga', x: -620, y: 500, rot: 0 as const, props: {} };
  const screen = mountedPosition({ id: '', type: 'giga-display-shield', x: 0, y: 0, rot: 0, props: {} }, board);
  r.loose('screen', 'giga-display-shield', screen.x, screen.y, { label: 'GIGA Display Shield · llamadas táctiles' });

  const vcc = (ref: Ref) => r.rail(ref, true, WIRE.v5);
  const gnd = (ref: Ref) => r.rail(ref, false);

  // Una 74HC08 adicional resuelve prioridad 4 > 3 > 2 > 1 con las puertas libres de U2/U3.
  // U20 queda junto al codificador; U3 ocupa el extremo libre de la placa de control.
  r.dip('u20', '74hc08', B1, 56, 'U20 · 74HC08 · prioridad de llamadas');
  r.dip('u15', 'ne555', B1, 1, 'U15 · NE555 · 1 Hz');
  r.fromRail('u15R1', B1, 2, 'tp', 47_000);
  r.put('u15R2', 'resistor', B1, 2, 'c', { resistance: 47_000 });
  r.put('u15C', 'capacitor', B1, 5, 'j', { capacitance: 10e-6 });

  // ── Alimentación: lógica a 5 V, GIGA e interfaces LV a 3,3 V ──────
  r.chainRails([B1, B2, B3, B4], WIRE.v5);
  vcc(['u20', 'VCC']);
  gnd(['u20', 'GND']);
  r.loose('supply', 'bench-supply', -520, 220, { voltage: 5, current: 1, label: 'Fuente de lógica · 5 V' });
  r.wire(['supply', '+'], r.railHole(B1, 'tp', 5), WIRE.v5);
  r.wire(['supply', '-'], r.railHole(B1, 'tn', 8), WIRE.gnd);
  r.wire(['giga', 'GND.2'], r.railHole(B2, 'tn', 8), WIRE.gnd);
  r.wire(['giga','3V3'], r.railHole(B2,'bp',5), WIRE.v33);
  for (let i = 0; i < 5; i++) {
    const key = `level${i}`;
    r.loose(key, 'level-converter-4', -145, 180 + i*200, { label: ['Interfaz · llamadas','Interfaz · sensores','Interfaz · destino','Interfaz · estado','Interfaz · tiempo total'][i] });
    r.wire(r.railHole(B2,'bp',10+i), [key,'LV'], WIRE.v33);
    r.wire(r.railHole(B2,'tp',40+i), [key,'HV'], WIRE.v5);
    r.wire(r.railHole(B2,'bn',40+i), [key,'GND.H'], WIRE.gnd);
  }
  function interfaceWire(module: number, channel: number, pin: string, target: Ref, color: string, name: string) {
    const key = `level${module}`, p = r.parts.find(p => p.key === key)!;
    p.props = { ...p.props, nets: `${p.props?.nets ? p.props.nets+';' : ''}L${channel}=${name};H${channel}=${name}` };
    r.wire(['giga',pin],[key,`L${channel}`],color);
    r.wire([key,`H${channel}`],target,color);
  }

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
  r.dip('u3', '74hc04', B2, 57, 'U3 · 74HC04 · inversores de control');
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



  // ── Placa 2: reloj, memoria del destino y máquina de estados ─────────────────
  // RESET general: pulsador con pull-up; a 0 borra los registros y los biestables.
  r.put('reset', 'pushbutton', B2, 5, 'e', { cap: 'red', label: 'RESET general' });
  r.fromRail('resetR', B2, 7, 'tp', 10_000);
  gnd(['reset', '1a']);
  // RESET activo en alto para los MR de los 74LS173 (el pulsador da RESET activo en bajo): U3, puerta 6.
  r.wire(['reset', '2a'], ['u3', '6A'], WIRE.reset);
  // U4 NE555 astable: R1 = 1 kΩ, R2 = 33 kΩ, C = 1 µF → f = 1,44 / ((R1 + 2·R2)·C) ≈ 21 Hz.
  r.dip('u4', 'ne555', B2, 9, 'U4 · NE555 · reloj de 21 Hz');
  vcc(['u4', 'VCC']);
  gnd(['u4', 'GND']);
  vcc(['u4', 'RESET']);
  r.fromRail('u4R1', B2, 10, 'tp', 1000); // 5 V → DIS
  r.put('u4R2', 'resistor', B2, 10, 'c', { resistance: 33_000 }); // DIS → threshold node
  r.put('u4C', 'capacitor', B2, 13, 'd', { capacitance: 1e-6 }); // threshold node → ground
  gnd(['u4C', '-']);
  r.wire(['u4R2', '2'], ['u4', 'THR'], WIRE.clock);
  r.wire(['u4', 'TRIG'], ['u4', 'THR'], WIRE.clock);

  r.dip('u5', '74hc74', B2, 16, 'U5 · 74HC74 · OCUPADO y VÁLIDO');
  r.dip('u6', '74hc08', B2, 26, 'U6 · 74HC08 · ACEPTAR y MANTENER');
  r.dip('u7', '74hc32', B2, 36, 'U7 · 74HC32 · próximo estado');
  r.dip('u8', '74ls173', B2, 46, 'U8 · 74LS173 · memoria del destino');
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
  // Destination register: clocked capture while /ACEPTAR enables G1; outputs stay enabled.
  r.wire(['u20', '2Y'], ['u8', 'D0'], WIRE.dest);
  r.wire(['u20', '3Y'], ['u8', 'D1'], WIRE.dest);
  r.wire(['u2', '3Y'], ['u8', 'D2'], WIRE.dest);
  gnd(['u8', 'D3']);
  for (const pin of ['M','N','G2']) gnd(['u8', pin]);
  r.wire(['u4','OUT'], ['u8','CP'], WIRE.clock);
  // SOLICITUD = SEL0 + SEL1 + SEL2 (U7, puertas 2 y 3): todo piso pedido da un código distinto de 0.
  r.wire(['u20', '2Y'], ['u7', '2A'], WIRE.dest);
  r.wire(['u20', '3Y'], ['u7', '2B'], WIRE.dest);
  r.wire(['u7', '2Y'], ['u7', '3A'], WIRE.control);
  r.wire(['u2', '3Y'], ['u7', '3B'], WIRE.dest);
  // ACEPTAR = /OCUPADO · SOLICITUD (U6, puerta 4).
  r.wire(['u5', '1QN'], ['u6', '4A'], WIRE.control);
  r.wire(['u7', '3Y'], ['u6', '4B'], WIRE.control);
  // U8 captures on the clock edge while /ACEPTAR is low; otherwise it retains the destination.
  r.wire(['u6', '4Y'], ['u3', '3A'], WIRE.control);
  r.wire(['u3', '3Y'], ['u8', 'G1'], WIRE.control);
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
  r.dip('u9', '74hc00', B3, 13, 'U9 · 74HC00 · codificador de sensores');
  r.dip('u10', '74hc04', B3, 23, 'U10 · 74HC04 · SENSOR y /LLEGÓ');
  r.dip('u11', '74ls173', B3, 33, 'U11 · 74LS173 · memoria del piso actual');
  r.dip('u12', '74ls85', B3, 44, 'U12 · 74LS85 · comparador');
  r.dip('u13', '74hc08', B3, 55, 'U13 · 74HC08 · LLEGÓ, SUBIR y BAJAR');
  for (const u of ['u9', 'u10', 'u11', 'u12', 'u13']) {
    vcc([u, 'VCC']);
    gnd([u, 'GND']);
  }
  // Las salidas del 74LS85 entran a puertas 74HC. Un alto LS garantiza solo 2,7 V y el HC pide
  // 3,15 V (0,7·VCC a 4,5 V): una pull-up de 4,7 kΩ a 5 V lleva cada alto casi a VCC.
  // La columna 48 cae en un hueco del riel: la de OAGTB va en la 52 con un puente hasta la patilla.
  for (const [pin, col] of [['OAGTB', 52], ['OAEQB', 49], ['OALTB', 50]] as const) r.fromRail(`u12${pin}R`, B3, col, 'tp', 4700);
  r.wire(['u12OAGTBR', '2'], ['u12', 'OAGTB'], WIRE.control);
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
  // U11 es un registro 74LS173 de cuatro bits, con las habilitaciones de captura y salida a 0.
  // Captura al llegar a una planta; soltar el sensor produce un flanco de bajada y no borra Q.
  r.wire(['u9', '1Y'], ['u11', 'D0'], WIRE.current);
  r.wire(['u9', '2Y'], ['u11', 'D1'], WIRE.current);
  r.wire(['u9', '3Y'], ['u11', 'D2'], WIRE.current);
  // Al soltar RESET se vuelve a capturar el sensor presente, aunque la cabina no se haya movido.
  r.wire(['u10', '5Y'], ['u6', '2A'], WIRE.sensor);
  r.wire(['reset', '2b'], ['u6', '2B'], WIRE.reset);
  r.wire(['u6', '2Y'], ['u11', 'CP'], WIRE.sensor);
  for (const pin of ['D3', 'M', 'N', 'G1', 'G2']) gnd(['u11', pin]);
  r.wire(['u3', '6Y'], ['u11', 'MR'], WIRE.reset);
  // Comparator matches the course diagram: A = actual floor, B = requested floor.
  for (let bit = 0; bit < 3; bit++) {
    r.wire(['u8', `Q${bit}`], ['u12', `B${bit}`], WIRE.dest);
    r.wire(['u11', `Q${bit}`], ['u12', `A${bit}`], WIRE.current);
  }
  for (const p of ['A3', 'B3', 'IALTB', 'IAGTB']) gnd(['u12', p]);
  vcc(['u12', 'IAEQB']);
  // Arrival = equal AND sensor; up = busy AND A<B; down = busy AND A>B.
  r.wire(['u12', 'OAEQB'], ['u13', '1A'], WIRE.control);
  // The spare NAND drives a third indicator for A=B, matching the reference diagram.
  r.wire(['u12','OAEQB'],['u2','1A'],WIRE.control);
  r.wire(['u2','1A'],['u2','1B'],WIRE.control);
  r.put('stop','led',B3,1,'d',{color:'yellow',label:'PARAR · pisos iguales'});
  r.fromRail('stopR',B3,2,'tp',2200);
  r.wire(['u2','1Y'],['stop','K'],WIRE.control);
  r.wire(['u10', '5Y'], ['u13', '1B'], WIRE.sensor);
  r.wire(['u12', 'OALTB'], ['u13', '2A'], WIRE.control);
  r.wire(['u5', '1Q'], ['u13', '2B'], WIRE.control);
  r.wire(['u13', '2B'], ['u13', '4A'], WIRE.control);
  r.wire(['u12', 'OAGTB'], ['u13', '4B'], WIRE.control);
  // /LLEGÓ vuelve a la placa 2 por U10 (puerta 6).
  r.wire(['u13', '1Y'], ['u10', '6A'], WIRE.control);
  r.wire(['u10', '6Y'], ['u6', '1B'], WIRE.control);

  // ── Placa 4: cuenta, destino, piso actual y segundos ─────────────────────────
  r.dip('u14', '74ls48', B4, 18, 'U14 · 74LS48 · destino');
  vcc(['u14', 'VCC']);
  for (const p of ['GND', 'D']) gnd(['u14', p]);
  vcc(['u14', 'LT']);
  vcc(['u14', 'RBI']);
  // BI a 0 apaga el display: VÁLIDO lo enciende desde la primera solicitud.
  r.wire(['u5', '2Q'], ['u14', 'BIRBO'], WIRE.control);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u8', `Q${bit}`], ['u14', pin], WIRE.dest));
  compactDisplay('u14', 'seg', 28, 'Display · destino seleccionado');
  // Los inversores 74HC04 absorben la corriente de los indicadores a través de 2,2 kΩ.
  for (const [id, row, resistorRow, color, label, signal, inverter] of [
    ['ls', 'd', 'b', 'green', 'LS · subiendo', ['u13', '2Y'], '2'],
    ['lb', 'h', 'i', 'red', 'LB · bajando', ['u13', '4Y'], '4'],
  ] as const) {
    r.put(id, 'led', B2, 1, row, { color, label });
    r.put(`${id}R`, 'resistor', B2, 2, resistorRow, { resistance: 2200 });
    vcc([`${id}R`, '2']);
    r.wire([...signal] as Ref, ['u3', `${inverter}A`], WIRE.control);
    r.wire(['u3', `${inverter}Y`], [id,'K'], WIRE.control);
  }

  // ── Cuenta regresiva: reloj en placa 1, contador en placa 4 ───────────────────
  // U15 NE555 a 1 Hz (R1 = R2 = 47 kΩ, C = 10 µF → 1,44 / (141 kΩ · 10 µF) ≈ 1,02 Hz). Solo oscila mientras OCUPADO = 1:
  // su RESET va a OCUPADO, así que parado queda a 0 y cada viaje empieza con el ciclo entero.
  vcc(['u15', 'VCC']);
  gnd(['u15', 'GND']);
  gnd(['u15C', '-']);
  r.wire(['u15R2', '2'], ['u15C', '+'], WIRE.clock);
  r.wire(['u15R2', '2'], ['u15', 'THR'], WIRE.clock);
  r.wire(['u15', 'TRIG'], ['u15', 'THR'], WIRE.clock);
  // U18 74HC00:
  //  1 · invierte el reloj: el 555 sube nada más arrancar; invertido, el primer paso de U16
  //      llega al cabo de un segundo y no al instante.
  //  2 · D0 = NAND(Q0, Q1) de U16 (siguiente fase del secuenciador).
  //  3 y 4 · libres, con las entradas a masa.
  r.dip('u18', '74hc00', B4, 1, 'U18 · 74HC00 · reloj invertido y secuenciador');
  vcc(['u18', 'VCC']);
  gnd(['u18', 'GND']);
  r.wire(['u15', 'OUT'], ['u18', '1A'], WIRE.clock);
  r.wire(['u18', '1A'], ['u18', '1B'], WIRE.clock);
  r.wire(['u5', '1Q'], ['u15', 'RESET'], WIRE.control); // el reloj de 1 Hz solo corre en marcha
  for (const pin of ['3A', '3B', '4A', '4B']) gnd(['u18', pin]);
  // U16 74LS173 como secuenciador de 3 fases (no hay 193 en el laboratorio): D1 = Q0 y
  // D0 = NAND(Q0, Q1). Parado, MR = /OCUPADO lo deja en 00; en marcha recorre 01 → 11 → 10 → 01…,
  // un paso por segundo: cada vez que entra en 10 han pasado 3 s y la cabina llega a un piso.
  // Q0 y Q1 (LS) entran a la NAND 74HC: la pull-up de 10 kΩ del lado de 5 V del adaptador de
  // nivel, en la misma red, sube su nivel alto casi a VCC.
  r.dip('u16', '74ls173', B4, 9, 'U16 · 74LS173 · secuenciador de 3 s por piso');
  vcc(['u16', 'VCC']);
  gnd(['u16', 'GND']);
  r.wire(['u18', '1Y'], ['u16', 'CP'], WIRE.clock);
  for (const pin of ['M', 'N', 'G1', 'G2', 'D2', 'D3']) gnd(['u16', pin]);
  r.wire(['u5', '1QN'], ['u16', 'MR'], WIRE.control);
  r.wire(['u16', 'Q0'], ['u18', '2A'], WIRE.control);
  r.wire(['u16', 'Q1'], ['u18', '2B'], WIRE.control);
  r.wire(['u18', '2Y'], ['u16', 'D0'], WIRE.control);
  r.wire(['u16', 'Q0'], ['u16', 'D1'], WIRE.control);
  // U16 remains the floor sequencer. The GIGA accumulates its ticks into total trip seconds
  // and drives U17 through four BCD GPIOs. VALID keeps the final zero visible after arrival.
  r.dip('u17', '74ls48', B4, 50, 'U17 · 74LS48 · segundos', true);
  vcc(['u17', 'VCC']);
  gnd(['u17', 'GND']);
  vcc(['u17', 'LT']);
  vcc(['u17', 'RBI']);
  r.wire(['u5', '2Q'], ['u17', 'BIRBO'], WIRE.control);
  ['A', 'B', 'C', 'D'].forEach((pin, bit) => interfaceWire(4, bit+1, GIGA_PINS.trip[bit], ['u17',pin], WIRE.current, `TIEMPO${bit}`));
  compactDisplay('u17', 'seg2', 59, 'Display · segundos restantes del viaje');

  // ── Piso actual: driver y display al centro de la placa 4 ───────────────────
  // U19 lee U11. RBI a 0 apaga el cero: el display queda oscuro hasta que un sensor fija el piso.
  r.dip('u19', '74ls48', B4, 34, 'U19 · 74LS48 · piso actual');
  vcc(['u19', 'VCC']);
  gnd(['u19', 'GND']);
  vcc(['u19', 'LT']);
  vcc(['u19', 'BIRBO']);
  gnd(['u19', 'RBI']);
  gnd(['u19', 'D']);
  ['A', 'B', 'C'].forEach((pin, bit) => r.wire(['u11', `Q${bit}`], ['u19', pin], WIRE.current));
  compactDisplay('u19', 'seg3', 44, 'Display · piso actual');

  // ── GIGA: llamadas táctiles, motor de la cabina y monitor ─────────────────────
  // Llamadas y sensores en drenador abierto: INPUT suelta la línea y OUTPUT LOW la pone a 0,
  // igual que el pulsador o el interruptor de al lado. Nunca empuja 3,3 V contra ellos.
  for (let f = 1; f <= 4; f++) {
    interfaceWire(0,f,GIGA_PINS.call[f-1],[`call${f}`,'2a'],WIRE.call,`LL${f}`);
    interfaceWire(1,f,GIGA_PINS.sensor[f-1],['sp',`${f}B`],WIRE.sensor,`SP${f}`);
  }
  GIGA_PINS.count.forEach((pin,bit) => interfaceWire(3,bit+1,pin,['u16',`Q${bit}`],WIRE.monitor,`FASE${bit}`));
  interfaceWire(2,4,GIGA_PINS.busy,['u5','1Q'],WIRE.monitor,'OCUPADO');
  interfaceWire(3,3,GIGA_PINS.valid,['u5','2Q'],WIRE.monitor,'VÁLIDO');
  GIGA_PINS.dest.forEach((pin,bit) => interfaceWire(2,bit+1,pin,['u8',`Q${bit}`],WIRE.monitor,`DEST${bit}`));

  // La versión de clase omite el desacoplo cerámico por petición del usuario.
  // El modelo ideal no verifica ruido de alimentación: no certifica su omisión en hardware.

  /** El modelo 48 limita cada segmento con sus 2 kΩ internos; no se añaden resistencias externas. */
  function compactDisplay(decoder: string, display: string, col: number, label: string) {
    r.put(display, 'seven-segment', B4, col, 'c', { label });
    gnd([display, 'COM2']);
    for (const s of 'abcdefg') r.wire([decoder, `S${s.toUpperCase()}`], [display, s], SEGMENT_COLORS[s]);
  }

  // Nombres de las señales para el esquema: las etiquetas de red se leen como en el plano.
  for (const p of r.parts) {
    if (p.key === 'giga') p.props = { ...p.props, nets: GIGA_PINS.trip.map((pin, bit) => `${pin}=TIEMPO${bit}`).join(';') };
    if (NET_NAMES[p.key]) p.props = { ...p.props, nets: NET_NAMES[p.key] };
    if (p.key==='u4' || p.key==='u15') p.props = {...p.props, partNumber:'NE555'};
  }

  cachedTemplate = r.template({
    id: 'elevator-course',
    name: 'Ascensor de cuatro pisos · CI + Arduino GIGA',
    summary: 'Memoria del destino, bloqueo, sensores, comparador, displays del piso actual y del destino, cuenta regresiva y LEDs con CI 74HC y 74LS. El GIGA añade llamadas táctiles y mueve la cabina.',
    level: 'Avanzado',
    category: 'Lógica secuencial',
    sketch: ELEVATOR_GIGA,
  }, ELEVATOR_SIGNAL_COLORS);
  return structuredClone(cachedTemplate);
}
