# CircuitStudio design system

## Direction

A quiet editing workspace surrounding tangible electronic hardware. Depth belongs to materials and controls. The interface uses a restrained dark palette, readable sans-serif text and shallow neutral bevels. Selection and live electrical states carry color.

## Interface

- Geist is the UI family. Instrument Sans is reserved for the approved PWM wordmark.
- The inspector is one continuous panel. Measurements are aligned label/value rows, with no nested statistic cards.
- The library shows components directly on the panel surface. Their reference numbers are secondary text. Hover, focus and selection reveal boundaries.
- Standard controls share `--control-fill` and `--control-shadow`. Stop uses a neutral control with a small red icon.
- Keep canvas navigation, view switching and circuit actions in stable locations. Narrow windows use explicit panel toggles instead of stacking the panels above and below a tiny canvas.
- Respect keyboard focus and reduced motion. Pin information includes function and polarity, not color alone.
- The library starts with six visible sections. Section pages expose functional groups; integrated circuits also have a family selector. Search covers the whole catalog and clearing it restores the current section. Favorites and recent parts stay available without duplicates.
- Component cards have no capability pills. IC references are primary plain text with their function below; other components keep their descriptive name.

## Brand and startup

The PWM signal stands freely beside the wordmark. A single 440ms connection trace reaches its green terminal; the wordmark stays legible from the first frame. The charcoal field has only a barely visible static grain. There are no slogans, blueprint scenery, glow fields, blur reveals or display punctuation.

The first-session introduction lasts 520ms, followed by a 140ms fade. Actual authentication and project loading run concurrently and determine when the loading screen can leave. Input skips the decorative introduction. Returning visitors and reduced-motion users get no decorative delay. The pre-JavaScript document shares the same composition, typography and mark geometry.

## Workbench interaction

The workbench rail groups signal capture, evidence-based diagnosis, physical assembly and component review. A restrained mint trace palette distinguishes live measurements from blue editing selection. Floating readouts show the pinned net; the same physical net remains selected across views. Layout changes retain canvas context, while explicit fit remains available.

Manipulation follows the pointer immediately. Compatible breadboard holes attract leads within a six-screen-pixel capture radius and release beyond eleven pixels; occupied holes are marked and reject placement. Connection confirmation is a short local fade. The browser's reduced-motion preference removes nonessential motion.

The main thread renders the workspace; circuit calculation runs in a module worker. Incremental signal edges avoid copying the entire capture on each frame. Historical inspection visibly distinguishes reconstruction and paused state from live execution. Names of watched signals are local project preferences. Simulation recordings belong to the current session.

On narrow windows, simulation controls move to a second header row and compact panel controls stay beneath the workbench rail. Secondary panels remain scrollable. The optional frame meter reports measured values rather than promising a fixed refresh rate.

## Hardware materials

Keep all model pin coordinates independent of artwork changes. Use reusable SVG paint servers for solder mask, epoxy, metal, brushed aluminum, plastic and optical glass. Restrict texture to small tiled patterns; avoid per-component turbulence filters and raster dependencies.

Board artwork includes solder pads, plated contacts, component leads, small passive parts and silkscreen. DIP packages include lead shoulders, a molded bevel, pin-one marks and a shallow package texture. The power supply has a recessed display, a metal front panel, knurled controls and binding posts. LED emission uses a colored halo and a small bright core, while off-state and reverse-polarity behavior remain tied to the electrical model.

## Studied references

- [Linear's UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui): hierarchy, density and reducing competing containers.
- [Linear's 2026 refresh](https://linear.app/now/behind-the-latest-design-refresh): predictable header actions and a calmer workspace.
- [Ramp by Bakken & Bæck](https://bakkenbaeck.com/case/ramp): a shared visual language across brand, product graphics and motion. Here, the routed signal provides that connection.
- [Arduino Uno Rev3](https://store.arduino.cc/products/arduino-uno-rev3), [Nano](https://store.arduino.cc/products/arduino-nano), [Mega 2560](https://store.arduino.cc/products/arduino-mega-2560-rev3): board proportions, connectors, sockets, package markings and silkscreen.
- [TI SN74HC595](https://www.ti.com/product/SN74HC595/part-details/SN74HC595N): the PDIP package, lead geometry and orientation marks.
- [Keysight E36300 bench supplies](https://www.keysight.com/us/en/products/dc-power-supplies/bench-power-supplies/e36300-series-triple-output-power-supply-80-160w.html): recessed displays, machined knobs and binding posts.

These references inform original vector artwork. They are not a claim of dimensional, electrical or manufacturer-certified replication.

## Wiring readability

Large physical circuits use two columns of named stages, with 220 world units between columns and 200 between board rows. The router reserves stage captions, component bodies and parallel tracks. Power, ground, cabin requests, external calls, destination, current floor, control, clock, reset, countdown, segments and UART each have a distinct family. Related bits use different tones, and one electrical net retains one color across stages. The legend sits in a reserved canvas rail.

Physical remounts must preserve the complete partition of device pins into electrical nets. Display cases share a baseline and leave visible space between them. Fitting the whole circuit is an overview; tracing a named net and zooming into a stage remain available.
