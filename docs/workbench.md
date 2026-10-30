# Workbench

## Inspect and record

Open **Señales** in the workbench rail. Add a component pin, or use the available logic outputs as a starting set. Alt-clicking a physical pin or wire fixes that network and adds it to the analyzer. Channel names and colors are remembered in this browser for each project. Up to twelve channels record transitions at solver boundaries, independently of rendering.

Pause to inspect the capture. Click a waveform near an edge or use the previous/next edge controls. The time cursor reconstructs CPU, peripheral and electrical state from the initial circuit and recorded inputs. A cached visual frame appears while reconstruction runs. Replaying uses the original integration boundaries, including for capacitors. Resuming from a historical position discards the future and creates a new trajectory. Changing circuit topology starts a new capture; code programs are retained. Reloading the page does not retain the recording. A stopped capture can be exported; pause instead of stopping to navigate it.

Visual preview frames have a 12 MB / 1800-frame limit. Each channel keeps at most 6000 transitions before rolling its oldest samples out. Input and integration history are retained for reconstructing the current recording. Long recordings with firmware may need time to reconstruct. The interface stays responsive and newer seeks cancel previous ones.

VCD uses a 1 µs timescale and a 2.5 V digital threshold. Recorded values are simulated voltages. UART and I²C models that exchange bytes do not synthesize bit-level electrical waveforms; their pins cannot be used as a physical protocol-decoder trace.

## Diagnose

**Diagnóstico** checks known IC input connectivity, model thresholds and supply, conflicting push-pull currents and MCU input overvoltage. It reports evidence rather than declaring every circuit correct. Unknown electrical roles are not inferred as active drivers. The signal tree follows actual nets, series resistors, gate inputs and configured MCU output/pull-up modes. Sequential state is explicitly distinguished from the history that produced it. A focused question such as “¿Por qué no enciende LS?” searches the named circuit signal; this is deterministic inspection, not an external language-model service.

The optional logic overlay preserves physical wire colors. A pinned network stays highlighted across board and schematic views. Component badges open the relevant diagnostic or anchored comment. Diagnostic thresholds follow the selected model, not manufacturer-certified limits for every real device.

## Build

**Montaje** orders physical wires, highlights both endpoints and records completed connections in the collaborative document. Changing a connection invalidates its previous checkmark. The material table groups exact modeled variants; users enter their own supplier prices and currency. CSV export and browser print/PDF include the full visible circuit geometry, materials, connection list, date and project title.

Photo comparison is manual: choose a local image, view it beside the design and place numbered review marks. Photos are not uploaded, recognized automatically or persisted after the panel session.

## Review and command

**Comentarios** attaches observations and replies to a component, with resolve/reopen states. Concurrent comments use independent Yjs keys and do not replace another author's comment. Viewer permissions prevent writing comments, completion data or prices.

Ctrl/Cmd K opens action and part search. It can start placement, switch views, open tools, connect explicitly selected pins and add a supported clocked part connected to an unambiguous clock. Ambiguous connections ask for explicit pins in the palette. The performance command displays measured main-thread FPS, frame-interval p95 and long tasks; refresh rate depends on the display, browser and circuit workload.

Simulation executes in a module worker. The UI receives incremental trace updates and component visuals, while input, panning and zoom remain on the main thread. Hardware modules omit the browser-only React Refresh preamble so development workers can import the same electrical definitions safely.
