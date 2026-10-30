// Emulación AVR con avr8js: CPU, puertos, temporizadores, USART y ADC, con un perfil
// por placa (ATmega328P para Uno y Nano; ATmega2560 para Mega).
import {
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  AVRTWI,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portAConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  portEConfig,
  portFConfig,
  portGConfig,
  portHConfig,
  portJConfig,
  portKConfig,
  portLConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
  twiConfig,
  type ADCConfig,
  type AVRPortConfig,
  type AVRTimerConfig,
  type TWIConfig,
} from 'avr8js';
import type { McuPinMode } from '../parts/types';
import type { I2cMasterPort } from './i2c';

export const CLOCK_HZ = 16_000_000;

type Port = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L';
const PORTS: Record<Port, AVRPortConfig> = {
  A: portAConfig,
  B: portBConfig,
  C: portCConfig,
  D: portDConfig,
  E: portEConfig,
  F: portFConfig,
  G: portGConfig,
  H: portHConfig,
  J: portJConfig,
  K: portKConfig,
  L: portLConfig,
};

export type BoardId = 'uno' | 'nano' | 'mega';

interface BoardProfile {
  flashBytes: number;
  /** Bytes de datos más allá de los 256 de registros que avr8js reserva (RAMEND + 1 − 0x100). */
  sramBytes: number;
  /** Pin Arduino (índice) → [puerto, bit]. */
  pins: [Port, number][];
  timers: AVRTimerConfig[];
  usart: typeof usart0Config;
  adc: ADCConfig;
  twi: TWIConfig;
  i2cPins: [number, number];
}

const p = (port: Port, bits: number[]) => bits.map((b) => [port, b] as [Port, number]);

const ATMEGA328: Omit<BoardProfile, 'pins'> = {
  flashBytes: 0x8000,
  sramBytes: 2048,
  timers: [timer0Config, timer1Config, timer2Config],
  usart: usart0Config,
  adc: adcConfig,
  twi: twiConfig,
  i2cPins: [18, 19],
};
// D0–D7 = PD0–7, D8–D13 = PB0–5, A0–A5 = PC0–5 (D14–D19).
const PINS_328: [Port, number][] = [...p('D', [0, 1, 2, 3, 4, 5, 6, 7]), ...p('B', [0, 1, 2, 3, 4, 5]), ...p('C', [0, 1, 2, 3, 4, 5])];

// ATmega2560: vectores de interrupción (n−1)·2 según la tabla del datasheet y salidas de comparación de cada timer.
const t16 = (base: Partial<AVRTimerConfig>): AVRTimerConfig => ({ ...timer1Config, ...base });
const MEGA_TIMERS: AVRTimerConfig[] = [
  { ...timer0Config, compAInterrupt: 0x2a, compBInterrupt: 0x2c, ovfInterrupt: 0x2e, compPortA: portBConfig.PORT, compPinA: 7, compPortB: portGConfig.PORT, compPinB: 5, externalClockPort: portDConfig.PORT, externalClockPin: 7 },
  t16({ captureInterrupt: 0x20, compAInterrupt: 0x22, compBInterrupt: 0x24, compCInterrupt: 0x26, ovfInterrupt: 0x28, OCRC: 0x8c, compPortA: portBConfig.PORT, compPinA: 5, compPortB: portBConfig.PORT, compPinB: 6, compPortC: portBConfig.PORT, compPinC: 7, externalClockPort: portDConfig.PORT, externalClockPin: 6 }),
  { ...timer2Config, compAInterrupt: 0x1a, compBInterrupt: 0x1c, ovfInterrupt: 0x1e, compPortA: portBConfig.PORT, compPinA: 4, compPortB: portHConfig.PORT, compPinB: 6 },
  t16({ captureInterrupt: 0x3e, compAInterrupt: 0x40, compBInterrupt: 0x42, compCInterrupt: 0x44, ovfInterrupt: 0x46, TIFR: 0x38, TCCRA: 0x90, TCCRB: 0x91, TCCRC: 0x92, TCNT: 0x94, ICR: 0x96, OCRA: 0x98, OCRB: 0x9a, OCRC: 0x9c, TIMSK: 0x71, compPortA: portEConfig.PORT, compPinA: 3, compPortB: portEConfig.PORT, compPinB: 4, compPortC: portEConfig.PORT, compPinC: 5, externalClockPort: 0, externalClockPin: 0 }),
  t16({ captureInterrupt: 0x52, compAInterrupt: 0x54, compBInterrupt: 0x56, compCInterrupt: 0x58, ovfInterrupt: 0x5a, TIFR: 0x39, TCCRA: 0xa0, TCCRB: 0xa1, TCCRC: 0xa2, TCNT: 0xa4, ICR: 0xa6, OCRA: 0xa8, OCRB: 0xaa, OCRC: 0xac, TIMSK: 0x72, compPortA: portHConfig.PORT, compPinA: 3, compPortB: portHConfig.PORT, compPinB: 4, compPortC: portHConfig.PORT, compPinC: 5, externalClockPort: 0, externalClockPin: 0 }),
  t16({ captureInterrupt: 0x5c, compAInterrupt: 0x5e, compBInterrupt: 0x60, compCInterrupt: 0x62, ovfInterrupt: 0x64, TIFR: 0x3a, TCCRA: 0x120, TCCRB: 0x121, TCCRC: 0x122, TCNT: 0x124, ICR: 0x126, OCRA: 0x128, OCRB: 0x12a, OCRC: 0x12c, TIMSK: 0x73, compPortA: portLConfig.PORT, compPinA: 3, compPortB: portLConfig.PORT, compPinB: 4, compPortC: portLConfig.PORT, compPinC: 5, externalClockPort: 0, externalClockPin: 0 }),
];
const PINS_2560: [Port, number][] = [
  ['E', 0], ['E', 1], ['E', 4], ['E', 5], ['G', 5], ['E', 3], ['H', 3], ['H', 4], ['H', 5], ['H', 6], // D0–D9
  ['B', 4], ['B', 5], ['B', 6], ['B', 7], ['J', 1], ['J', 0], ['H', 1], ['H', 0], ['D', 3], ['D', 2], // D10–D19
  ['D', 1], ['D', 0], ...p('A', [0, 1, 2, 3, 4, 5, 6, 7]), ...p('C', [7, 6, 5, 4, 3, 2, 1, 0]), // D20–D37
  ['D', 7], ['G', 2], ['G', 1], ['G', 0], ...p('L', [7, 6, 5, 4, 3, 2, 1, 0]), ...p('B', [3, 2, 1, 0]), // D38–D53
  ...p('F', [0, 1, 2, 3, 4, 5, 6, 7]), ...p('K', [0, 1, 2, 3, 4, 5, 6, 7]), // A0–A15 = D54–D69
];

export const BOARDS: Record<BoardId, BoardProfile> = {
  uno: { ...ATMEGA328, pins: PINS_328 },
  nano: { ...ATMEGA328, pins: PINS_328 },
  mega: {
    flashBytes: 0x40000,
    sramBytes: 8192 + 256, // los registros extendidos del 2560 llegan a 0x1FF
    pins: PINS_2560,
    timers: MEGA_TIMERS,
    usart: { ...usart0Config, rxCompleteInterrupt: 0x32, dataRegisterEmptyInterrupt: 0x34, txCompleteInterrupt: 0x36 },
    adc: { ...adcConfig, adcInterrupt: 0x3a },
    twi: { ...twiConfig, twiInterrupt: 0x4e },
    i2cPins: [20, 21],
  },
};

export function parseIntelHex(hex: string, flashBytes = 0x8000): Uint16Array {
  const bytes = new Uint8Array(flashBytes);
  let base = 0;
  for (const raw of hex.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(':')) continue;
    const len = parseInt(line.slice(1, 3), 16);
    const addr = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type === 0) {
      for (let i = 0; i < len; i++) {
        const target = base + addr + i;
        if (target < bytes.length) bytes[target] = parseInt(line.slice(9 + i * 2, 11 + i * 2), 16);
      }
    } else if (type === 2) {
      base = parseInt(line.slice(9, 13), 16) << 4;
    } else if (type === 4) {
      base = parseInt(line.slice(9, 13), 16) << 16;
    }
  }
  return new Uint16Array(bytes.buffer);
}

export class AvrRunner {
  readonly cpu: CPU;
  private ports = new Map<Port, AVRIOPort>();
  readonly adc: AVRADC;
  readonly usart: AVRUSART;
  readonly uarts: AVRUSART[];
  readonly uartPins: [number, number][];
  private rxQueues: number[][] = [];
  onUart: ((port: number, value: number) => void) | null = null;
  readonly twi: AVRTWI;
  i2c: I2cMasterPort | null = null;
  /** Se activa cuando cambia la salida de algún pin; el motor resuelve el circuito entonces. */
  pinsChanged = false;
  onSerial: ((char: string) => void) | null = null;
  txActivity = 0;

  constructor(
    program: Uint16Array,
    readonly board: BoardProfile = BOARDS.uno,
  ) {
    this.cpu = new CPU(program, board.sramBytes);
    for (const t of board.timers) new AVRTimer(this.cpu, t);
    for (const port of new Set(board.pins.map(([port]) => port))) {
      const io = new AVRIOPort(this.cpu, PORTS[port]);
      io.addListener(() => (this.pinsChanged = true));
      this.ports.set(port, io);
    }
    this.adc = new AVRADC(this.cpu, board.adc);
    const configs = board === BOARDS.mega ? [board.usart,
      { UCSRA:0xc8, UCSRB:0xc9, UCSRC:0xca, UBRRL:0xcc, UBRRH:0xcd, UDR:0xce, rxCompleteInterrupt:0x48, dataRegisterEmptyInterrupt:0x4a, txCompleteInterrupt:0x4c },
      { UCSRA:0xd0, UCSRB:0xd1, UCSRC:0xd2, UBRRL:0xd4, UBRRH:0xd5, UDR:0xd6, rxCompleteInterrupt:0x66, dataRegisterEmptyInterrupt:0x68, txCompleteInterrupt:0x6a },
      { UCSRA:0x130, UCSRB:0x131, UCSRC:0x132, UBRRL:0x134, UBRRH:0x135, UDR:0x136, rxCompleteInterrupt:0x6c, dataRegisterEmptyInterrupt:0x6e, txCompleteInterrupt:0x70 },
    ] : [board.usart];
    this.uartPins = board === BOARDS.mega ? [[0,1],[19,18],[17,16],[15,14]] : [[0,1]];
    this.uarts = configs.map((config, port) => {
      const uart = new AVRUSART(this.cpu, config, CLOCK_HZ);
      // avr8js borra RXC y UDRE al escribir UCSRA, pero en el chip son de solo lectura.
      // · RXC: la rutina de envío de Arduino escribe UCSRA en cada byte; si en ese momento había
      //   un byte recibido sin leer, se perdía su interrupción. Con la pantalla dibujando, se
      //   perdían bytes de los toques y, desalineados los paquetes, el táctil dejaba de responder.
      // · UDRE: un segundo Serial.begin() (para cambiar de velocidad) dejaba la UART muda.
      const flags = uart as unknown as Record<'RXC' | 'UDRE', Parameters<CPU['setInterruptFlag']>[0]>;
      const writeUcsra = this.cpu.writeHooks[config.UCSRA];
      this.cpu.writeHooks[config.UCSRA] = (value, old, addr, mask) => {
        const before = this.cpu.data[config.UCSRA];
        const handled = writeUcsra(value, old, addr, mask);
        if (before & 0x80) this.cpu.setInterruptFlag(flags.RXC);
        if (before & 0x20) this.cpu.setInterruptFlag(flags.UDRE);
        return handled;
      };
      // Y al escribir UCSRB con la recepción activa cancela la interrupción del byte recibido.
      // Arduino escribe UCSRB al encolar cada envío: dibujar en la pantalla mientras llegaba
      // un toque perdía bytes. En el chip, UCSRB no toca RXC.
      const writeUcsrb = this.cpu.writeHooks[config.UCSRB];
      this.cpu.writeHooks[config.UCSRB] = (value, old, addr, mask) => {
        const pending = this.cpu.data[config.UCSRA] & 0x80;
        const handled = writeUcsrb(value, old, addr, mask);
        if (pending && value & 0x10) this.cpu.setInterruptFlag(flags.RXC);
        return handled;
      };
      this.rxQueues[port] = [];
      const pump = () => {
        const queue = this.rxQueues[port];
        if (queue.length && !uart.rxBusy && uart.rxEnable && uart.writeByte(queue[0])) queue.shift();
      };
      uart.onRxComplete = pump;
      uart.onConfigurationChange = pump;
      uart.onByteTransmit = (b) => {
        this.txActivity = 1;
        if (port === 0) this.onSerial?.(String.fromCharCode(b));
        this.onUart?.(port,b);
      };
      return uart;
    });
    this.usart = this.uarts[0];
    this.twi = new AVRTWI(this.cpu, board.twi, CLOCK_HZ);
    const finish = (bits: number, operation: () => void) => {
      this.cpu.addClockEvent(() => { operation(); this.pinsChanged = true; }, Math.max(1, Math.round(bits * CLOCK_HZ / this.twi.sclFrequency)));
    };
    this.twi.eventHandler = {
      start: (repeated) => finish(1, () => { this.i2c?.start(repeated); this.twi.completeStart(); }),
      stop: () => finish(1, () => { this.i2c?.stop(); this.twi.completeStop(); }),
      connectToSlave: (address, write) => finish(9, () => this.twi.completeConnect(this.i2c?.connect(address, write) ?? false)),
      writeByte: (value) => finish(9, () => this.twi.completeWrite(this.i2c?.write(value) ?? false)),
      readByte: () => finish(9, () => this.twi.completeRead(this.i2c?.read() ?? 0xff)),
    };
  }

  static fromHex(hex: string, board: BoardId = 'uno') {
    const profile = BOARDS[board];
    return new AvrRunner(parseIntelHex(hex, profile.flashBytes), profile);
  }

  get seconds() {
    return this.cpu.cycles / CLOCK_HZ;
  }

  pinMode(index: number): McuPinMode {
    const loc = this.board.pins[index];
    if (!loc) return 'input';
    switch (this.ports.get(loc[0])!.pinState(loc[1])) {
      case PinState.High:
        return 'high';
      case PinState.Low:
        return 'low';
      case PinState.InputPullUp:
        return 'pullup';
      default:
        return 'input';
    }
  }

  setInput(index: number, high: boolean) {
    const loc = this.board.pins[index];
    if (loc) this.ports.get(loc[0])!.setPin(loc[1], high);
  }

  setAnalog(channel: number, volts: number) {
    this.adc.channelValues[channel] = Math.min(5, Math.max(0, volts));
  }

  serialWrite(text: string) {
    this.receiveUart(0,Array.from(text,ch => ch.charCodeAt(0)));
  }

  receiveUart(port: number, bytes: number[]) {
    const uart = this.uarts[port], queue = this.rxQueues[port];
    if (!uart?.rxEnable) return;
    queue.push(...bytes.slice(0,Math.max(0,4096-queue.length)).map(b => b & 255));
    if (queue.length && !uart.rxBusy && uart.writeByte(queue[0])) queue.shift();
  }

  /** Ejecuta hasta `untilCycle` o hasta que cambie un pin. Devuelve true si paró por un cambio. */
  run(untilCycle: number): boolean {
    const cpu = this.cpu;
    this.pinsChanged = false;
    while (cpu.cycles < untilCycle) {
      avrInstruction(cpu);
      cpu.tick();
      if (this.pinsChanged) return true;
    }
    return false;
  }
}
