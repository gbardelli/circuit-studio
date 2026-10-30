import { SimulationSession, type Probe } from "./session";
import type { CircuitSnapshot } from "../core/types";
type Request =
  | { type: "update"; snapshot: CircuitSnapshot }
  | { type: "program"; id: string; hex: string | null }
  | { type: "start" | "stop" | "dispose" }
  | { type: "input"; id: string; key: string; value: number | boolean }
  | { type: "serial"; id: string; text: string }
  | { type: "watch"; probes: Probe[] }
  | { type: "pause"; on: boolean }
  | { type: "seek"; time: number };
const session = new SimulationSession();
let previous = performance.now(),
  lastPost = 0;
const emit = () => {
  postMessage({ type: "frame", frame: session.frame(session.lab.seeking) });
  lastPost = performance.now();
};
const timer = setInterval(() => {
  const now = performance.now(),
    elapsed = (now - previous) / 1000;
  previous = now;
  if (session.engine.running && !session.lab.paused && !session.lab.seeking) {
    session.pulse(elapsed);
    if (now - lastPost >= 32) emit();
  }
}, 8);
onmessage = (message: MessageEvent<Request>) => {
  const r = message.data;
  try {
    switch (r.type) {
      case "update":
        session.update(r.snapshot);
        break;
      case "program":
        session.program(r.id, r.hex);
        break;
      case "start":
        session.start();
        previous = performance.now();
        break;
      case "stop":
        session.stop();
        break;
      case "input":
        session.input(r.id, r.key, r.value);
        break;
      case "serial":
        session.write(r.id, r.text);
        break;
      case "watch":
        session.watch(r.probes);
        break;
      case "pause":
        session.pause(r.on);
        previous = performance.now();
        break;
      case "seek":
        void session.seek(r.time, emit);
        return;
      case "dispose":
        clearInterval(timer);
        session.stop();
        close();
        return;
    }
    emit();
  } catch (error) {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
