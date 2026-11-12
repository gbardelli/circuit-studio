import { describe, expect, it } from 'vitest';
import { DFPlayer } from './dfplayer';
import { PARTS } from '../parts';
import { compilerAvailable, compileSketch } from '../../server/compile';
import { SimEngine } from './engine';
import { templateSnapshot } from '../collab/applyTemplate';
import { TOUCHSCREEN } from '../collab/touchscreen';

function command(device: DFPlayer, cmd: number, value = 0, ack = 0) {
  const payload = [0xff, 6, cmd, ack, value >> 8, value & 255];
  const checksum = (0x10000 - payload.reduce((a, b) => a + b, 0)) & 0xffff;
  for (const byte of [0x7e, ...payload, checksum >> 8, checksum & 255, 0xef]) device.receive(byte);
}
describe('DFPlayer serial simulation', () => {
  it('accepts tracks, volume, pause and resume only when powered', () => {
    const p = new DFPlayer();
    command(p, 3, 1); expect(p.playing).toBe(false);
    p.power(true); command(p, 6, 25); command(p, 3, 1);
    expect([p.track, p.volume, p.playing]).toEqual([1, 25, true]);
    command(p, 14); expect(p.playing).toBe(false);
    command(p, 13); expect(p.playing).toBe(true);
    p.finish(p.sequence); expect(p.playing).toBe(false);
    expect(p.drain()[3]).toBe(0x3d);
  });
  it('rejects corrupt commands and reports card online on reset', () => {
    const p = new DFPlayer(); p.power(true);
    for (const b of [0x7e, 0xff, 6, 3, 0, 0, 1, 0, 0, 0xef]) p.receive(b);
    expect(p.playing).toBe(false);
    command(p, 12, 0, 1); const response = p.drain();
    expect([response[3], response[13], response[16]]).toEqual([0x41, 0x3f, 2]);
  });
  it('restores the large pushbutton and the documented DFPlayer pinout', () => {
    expect(PARTS['pushbutton-large'].defaults.footprint).toBe('5x5');
    const pins = PARTS['dfplayer-mini'].pins({});
    expect(pins.find(p => p.id === 'BUSY')?.y).toBe(0);
    expect(pins.find(p => p.id === 'GND2')?.y).toBe(60);
  });
});

describe.skipIf(!compilerAvailable())('compiled Arduino and DFPlayer', () => {
  it.each(['arduino-mega', 'arduino-giga'])('runs the official DFRobot library over %s hardware UART', async (board) => {
    const source = `#include <DFRobotDFPlayerMini.h>
DFRobotDFPlayerMini player;
void setup() { Serial1.begin(9600); if (player.begin(Serial1)) { player.volume(23); player.playMp3Folder(1); } }
void loop() {}`;
    const result = await compileSketch(source, 'arduino:avr:mega:cpu=atmega2560');
    expect(result.ok, result.stderr).toBe(true);
    const snapshot = templateSnapshot(TOUCHSCREEN);
    snapshot.parts.find(p => p.id === 'mcu')!.type = board;
    snapshot.parts.find(p => p.id === 'screen')!.type = 'dfplayer-mini';
    const engine = new SimEngine(); engine.update(snapshot); engine.setProgram('mcu', result.hex!);
    engine.start({ manual: true }); engine.tick(3);
    expect(engine.getVisual('screen')).toMatchObject({ powered: true, playing: true, track: 1, volume: 23 });
    engine.stop();
  }, 90_000);
});
