/** DFPlayer Mini serial commands, modelled at the byte level (not an audio circuit). */
export class DFPlayer {
  powered = false;
  playing = false;
  track = 0;
  volume = 20;
  sequence = 0;
  private buffer: number[] = [];
  private outgoing: number[] = [];
  power(on: boolean) {
    if (on === this.powered) return;
    this.powered = on;
    this.playing = false;
    this.buffer = [];
    this.outgoing = [];
    if (!on) { this.track = 0; this.volume = 20; }
  }
  receive(byte: number) {
    if (!this.powered) return;
    if (!this.buffer.length && byte !== 0x7e) return;
    this.buffer.push(byte & 255);
    if (this.buffer.length < 10) return;
    const p = this.buffer;
    this.buffer = [];
    if (p[1] !== 0xff || p[2] !== 6 || p[9] !== 0xef) return;
    const check = (0x10000 - p.slice(1, 7).reduce((a, b) => a + b, 0)) & 0xffff;
    if (((p[7] << 8) | p[8]) !== check) return;
    const value = (p[5] << 8) | p[6];
    switch (p[3]) {
      case 0x03: case 0x12: this.track = value; this.playing = value > 0; this.sequence++; break;
      case 0x0f: this.track = p[6]; this.playing = p[6] > 0; this.sequence++; break;
      case 0x06: this.volume = Math.min(30, value); break;
      case 0x04: this.volume = Math.min(30, this.volume + 1); break;
      case 0x05: this.volume = Math.max(0, this.volume - 1); break;
      case 0x0d: if (this.track) this.playing = true; break;
      case 0x0e: this.playing = false; break;
      case 0x16: this.playing = false; this.sequence++; break;
      case 0x0c: this.track = 0; this.playing = false; this.volume = 20; break;
    }
    if (p[4]) this.reply(0x41, 0);
    if (p[3] === 0x0c) this.reply(0x3f, 2);
  }
  finish(sequence: number) {
    if (sequence !== this.sequence || !this.playing) return;
    this.playing = false;
    this.reply(0x3d, this.track);
  }
  private reply(command: number, value: number) {
    const p = [0xff, 6, command, 0, value >> 8, value & 255];
    const sum = (0x10000 - p.reduce((a, b) => a + b, 0)) & 0xffff;
    this.outgoing.push(0x7e, ...p, sum >> 8, sum & 255, 0xef);
  }
  drain() { return this.outgoing.splice(0); }
}
