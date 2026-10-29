import type { I2cSlave } from '../parts/types';

export interface I2cMasterPort {
  start(repeated: boolean): void;
  stop(): void;
  connect(address: number, write: boolean): boolean;
  write(value: number): boolean;
  read(): number;
}

/** The resolver checks current wiring, power and address on every transfer. */
export class I2cBus implements I2cMasterPort {
  private selected: I2cSlave | null = null;
  private address = -1;
  private writing = false;
  constructor(private resolve: (address: number) => I2cSlave[], private volts: () => Float64Array) {}

  start(_repeated: boolean) { this.selected = null; }
  stop() { this.selected?.stop?.(); this.selected = null; }
  connect(address: number, write: boolean) {
    this.selected = null;
    const matches = this.resolve(address);
    if (matches.length !== 1) return false;
    this.selected = matches[0];
    this.address = address;
    this.writing = write;
    this.selected.start?.(!write);
    return true;
  }
  private current() {
    if (!this.selected) return null;
    const matches = this.resolve(this.address);
    return matches.length === 1 && matches[0] === this.selected ? this.selected : null;
  }
  write(value: number) { return this.writing && Boolean(this.current()?.write(value & 0xff, this.volts())); }
  read() { return !this.writing ? (this.current()?.read(this.volts()) ?? 0xff) & 0xff : 0xff; }
}
