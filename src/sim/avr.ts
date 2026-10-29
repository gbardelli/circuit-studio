// Emulación del ATmega328P con avr8js: CPU, puertos, temporizadores, USART y ADC.
import {
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js';
import type { McuPinMode } from '../parts/types';

export const CLOCK_HZ = 16_000_000;

export function parseIntelHex(hex: string): Uint16Array {
  const bytes = new Uint8Array(0x8000);
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

/** Pin Arduino (0–19) → [puerto, bit]. */
function locate(index: number): ['B' | 'C' | 'D', number] {
  if (index < 8) return ['D', index];
  if (index < 14) return ['B', index - 8];
  return ['C', index - 14];
}

export class AvrRunner {
  readonly cpu: CPU;
  private ports: Record<'B' | 'C' | 'D', AVRIOPort>;
  readonly adc: AVRADC;
  readonly usart: AVRUSART;
  /** Se activa cuando cambia la salida de algún pin; el motor resuelve el circuito entonces. */
  pinsChanged = false;
  onSerial: ((char: string) => void) | null = null;
  txActivity = 0;

  constructor(program: Uint16Array) {
    this.cpu = new CPU(program);
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    for (const port of Object.values(this.ports)) port.addListener(() => (this.pinsChanged = true));
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.usart.onByteTransmit = (b) => {
      this.txActivity = 1;
      this.onSerial?.(String.fromCharCode(b));
    };
  }

  get seconds() {
    return this.cpu.cycles / CLOCK_HZ;
  }

  pinMode(index: number): McuPinMode {
    const [port, bit] = locate(index);
    switch (this.ports[port].pinState(bit)) {
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
    const [port, bit] = locate(index);
    this.ports[port].setPin(bit, high);
  }

  setAnalog(channel: number, volts: number) {
    this.adc.channelValues[channel] = Math.min(5, Math.max(0, volts));
  }

  serialWrite(text: string) {
    for (const ch of text) this.usart.writeByte(ch.charCodeAt(0));
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
