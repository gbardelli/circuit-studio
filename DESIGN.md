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

## Menus and workbench chrome

Keep application chrome independent of circuit artwork and canvas theme tokens.
`chrome.css` defines the raised neutral surfaces, subtle vertical gradients, layered
shadows and readable secondary text for navigation, workbench panels and popups.
The active tool gets a tangible raised surface; inactive navigation stays quieter.

Use `HintButton` for concise control descriptions and a separate shortcut key.
Tooltips share a 420 ms initial hover delay and open immediately when moving among
nearby controls. Keyboard focus shows the description without animated motion.
Use `PopoverPanel` for anchored interactive content. Base UI handles collision
positioning, dismissal and focus return. Portals inside full-screen panels stay
inside their focus boundary. Menu keyboard events never edit the circuit.

Popover transitions use opacity and a small origin-aware transform, with faster
exit and immediate keyboard interaction. Direct resizing has no animated delay.
Reduced-motion and increased-contrast preferences have explicit overrides.

Assembly actions share the workbench heading through `WorkbenchToolbar`, keeping
the stateful assembly body mounted when its toolbar is placed in the heading.
Narrow windows wrap those actions into a second row. Neutral raised buttons use a
short vertical gradient, a brighter top edge and a short contact shadow. Sharing
uses this secondary treatment so the current assembly confirmation keeps priority.
Read assembly metadata at 13 px and terminal instructions at 18 px. The initial assembly panel is 320 px high and remains resizable.

## Laboratory panels and materials

Panel headers use one structural surface, with quieter controls and readable 14–16 px content. Assembly instructions put the physical terminal ahead of the board name; the decorative cable thumbnail is removed. Every native click on confirmation advances one step, including repeated clicks. The wiring legend uses 13 px labels. Idle and selected states share one grid cell and both contribute to its reserved height; selecting a wire must never change canvas bounds.

Materials starts as a shopping checklist. Search matches component names and references; the pending filter excludes acquired quantities. Editors save purchase quantities as project metadata, while visitors keep a project-scoped session checklist. A quantity increase makes a previously completed row pending again. Prices are optional, and missing prices remain visibly absent from the subtotal. The shared panel header exposes labelled expand/reduce controls, and the list retains its state during resizing.

PDF exports load jsPDF and AutoTable only on demand. Local OFL-licensed Noto Sans fonts preserve electrical symbols and Spanish accents. Materials uses portrait A4; the complete assembly guide includes a landscape circuit overview, materials and numbered instructions. Tables repeat headers, avoid splitting ordinary rows and include page numbers. No CSV export is shown in Materials.

Connection labels come from saved project metadata or actual net aliases and power pins, never a color-to-example mapping. Selecting or hovering a wire reveals details in the shared guide grid while the idle legend retains its layout space. Editors can name each wire color in Properties and rename individual breadboards; clearing a manual legend label restores automatic naming.

Participant rows keep names on one line and expose full names on hover. Status uses an icon and uppercase text. Use the account profile photo when supplied; missing or failed photos use a neutral person icon.

## Panel review contract

Use `ConnectionEndpoint` for physical wire instructions and the assembly index. Label Origin and Destination, emphasize the terminal, and show the authored board name as secondary context. Use `TerminalLocation` to render rail or row and column as distinct labelled values in wire instructions, part placements and pinouts. Labels use sentence case (Riel, Fila, Columna), and board position values use Superior/Inferior. Do not flatten structured data into punctuation chains. Do not alter punctuation inside authored names.

Panel controls have 32 px targets with 16 px glyphs, increasing to 44 px for coarse pointers. Closing and expanding share one header. Static dots may not stand in for actual status. Icons must communicate an action or state; remove decorative duplicates. Use one primary action per task and expose undo beside the task it affects.

Group transport separately from waveform viewing and export. Keep the channel column wide enough to distinguish names, with full names available on hover. In diagnostics, show the finding and explanation first; expand upstream evidence on demand. In materials, separate counts with layout and keep PDF export distinct from optional costing.

Verify hierarchy in actual browser screenshots, including laptop and narrow widths. Check long names, keyboard focus, repeated activation, resize/fullscreen state, and constant canvas bounds during wire hover. Do not accept a visual change merely because the build passes.

The assembly instruction uses an inline-size container query for its narrow layout. At 440 px or less, render each placement as a full-width row: a fixed pin-label column, flexible rail/row column, and fixed column-number column. Horizontal rules end at the same edge; never retain vertical separators from the wide layout after stacking. The value aligns with the coordinate column. In the fullscreen sidebar, keep the thumbnail beside the heading and give confirmation its own full-width row. Navigation and undo remain visually secondary.

Comments use a quiet count/filter toolbar, component anchors, author/time metadata and a separate inset writing surface. Empty states describe the next useful action without slogans. Viewers see an access explanation instead of a disabled composer. Keep comment bodies at 14 px and supporting metadata at 12�13 px.

The pinned probe is a persistent contextual inspector, not a notification. Use a subtle neutral vertical gradient, brighter upper edge and layered contact/elevation shadows. Show component identity, structured terminal coordinates, voltage and actual state separately. Expose named Diagnostics and Signals actions. Do not show retained readings or an active status color after simulation stops. Anchor it on the right above the connection guide, with a bounded offset so a reduced canvas does not clip the header; keep zoom controls free.
