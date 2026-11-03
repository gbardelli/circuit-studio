import { mkdirSync, writeFileSync } from 'node:fs';
import { elevatorTemplate } from '../src/collab/elevator';
import { templateSnapshot } from '../src/collab/applyTemplate';
import { SimEngine } from '../src/sim/engine';
import { electricalReview, type ElectricalMeasurement } from '../src/sim/electricalReview';

const scene = templateSnapshot(elevatorTemplate());
const engine = new SimEngine();
engine.update(scene);
engine.start({ manual: true });
const peaks = new Map<string, ElectricalMeasurement>();
const errors: string[] = [];
let samples = 0;
const sample = () => {
  if (!engine.status.converged) throw new Error('El circuito no converge');
  const review = electricalReview(scene, engine.readings(false), engine.pinCurrents());
  for (const row of review.rows) {
    const key = `${row.part}:${row.pin ?? row.quantity}`;
    const previous = peaks.get(key);
    if (!previous || Math.abs(row.value) > Math.abs(previous.value)) peaks.set(key, row);
    if (row.state === 'error') errors.push(`${key}: ${row.value} ${row.quantity}`);
  }
  samples++;
};
const tick = (seconds = .3) => { for (let t = 0; t < seconds - 1e-9; t += .05) { engine.tick(.05); sample(); } };
const floor = (n: number) => {
  const sp = scene.parts.find(p => p.id === 'sp')!;
  sp.props = { ...sp.props, ...Object.fromEntries([1, 2, 3, 4].map(f => [`s${f}`, f === n])) };
  engine.update({ ...scene, parts: [...scene.parts] }); tick();
};
for (let mask = 1; mask < 16; mask++) {
  engine.setInput('reset', 'pressed', true); tick(.1);
  engine.setInput('reset', 'pressed', false); floor(1);
  for (let f = 1; f <= 4; f++) engine.setInput(`pp${f}`, 'pressed', Boolean(mask & (1 << (f - 1))));
  tick(.3);
  for (let f = 1; f <= 4; f++) engine.setInput(`pp${f}`, 'pressed', false);
  floor(4); tick(.1);
}
// Exercise countdown transitions and all sensors with a loaded destination.
engine.setInput('reset', 'pressed', true); tick(.1);
engine.setInput('reset', 'pressed', false); floor(1);
engine.setInput('pp4', 'pressed', true); tick(.3);
engine.setInput('pp4', 'pressed', false); tick(3.5);
for (const f of [0, 2, 0, 3, 0, 4]) floor(f);
const report = {
  generated: new Date().toISOString(), samples, parts: scene.parts.length, wires: scene.wires.length,
  scope: 'DC points sampled every 50 ms. Logic-only circuit; GIGA firmware not loaded. No thermal model, tolerance sweep or internal board/shield consumption. Not a hardware safety certificate.',
  pending: electricalReview(scene, {}, new Map()).pending,
  errors: [...new Set(errors)],
  peaks: [...peaks.values()],
};
engine.stop();
mkdirSync('work', { recursive: true });
writeFileSync('work/elevator-electrical-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ samples, parts: report.parts, wires: report.wires, errors: report.errors,
  maxResistorWatts: Math.max(...report.peaks.filter(r => r.quantity === 'power').map(r => r.value)),
  maxLogicOutputAmps: Math.max(...report.peaks.filter(r => r.pin && r.part.startsWith('u')).map(r => r.value)),
  pending: report.pending,
}, null, 2));
if (errors.length) process.exitCode = 1;
