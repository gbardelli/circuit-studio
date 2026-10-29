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
- Library pills retain 8px horizontal padding and a 21px minimum height. Color indicates an actionable capability, with quiet neutral reference tags.

## Brand and startup

The PWM signal stands freely without a containing tile. Instrument Sans gives the wordmark its own rhythm; green marks the signal's terminal and the wordmark's period. The startup composition uses static tiled grain, faint routed conductors and a restrained green light field.

The first session entry reveals the signal and brings the wordmark into focus over 1.2 seconds. Authentication and project loading continue concurrently. Any pointer or keyboard input skips the decorative introduction. Later document navigations skip it, and reduced motion removes it entirely. The same composition appears before the JavaScript bundle loads and while real authentication or project requests remain pending. There are no fabricated percentages or progress steps.

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
