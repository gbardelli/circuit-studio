# Elevator design derived from a physical project

`elevatorDesign(snapshot)` derives connections from the supplied project's netlist, including
breadboard strip connections and component defaults. It does not instantiate a similar template.
The overview contains the actual LS48 decoders and seven-segment displays, interactive active-low
requests, reset and floor sensors, the 21 Hz clock, and direction/busy indicators.

The functional sheets contain each physical logic IC exactly once:

| Sheet | Physical ICs |
| --- | --- |
| PEDIDOS | U20, U2 |
| DESTINO | U8 |
| CONTROL | U3, U5, U6, U7 |
| PLANTA | U9, U10, U21, U11, U13 |
| COMPARAR | U12 |

These sheets are organizational blocks, not additional physical ICs. Their ports are derived
from cross-stage nets. Each chip node records its physical part ID. The floor's transparent
latch stays with its sensor-data delay gates to preserve hold timing in the nested delta-cycle
simulator. Splitting this path across independently settled subcircuits loses that timing.

Supply rails, passive pull-ups and level translation are implicit in this ideal logic model.
The GIGA's firmware, touchscreen and automatic movement remain in the physical simulator.
In Design, manually release the old floor sensor, then activate the next one. Inputs use 0
for a pressed button/active sensor, and 1 for released/inactive. Reset is active-low.

`routeDesign` lays out persistent orthogonal routes outside node bodies, reserves terminal
approaches and prevents distinct signals from sharing route edges. Semantic colors distinguish
destination, current floor, sensors, requests, clock/reset and control. Wire geometry is not
part of the simulator's structure identity. Moving/rotating a connected node invalidates only
its obsolete manual bends; copying a selection translates its bends with it. Geometry, colors
and labels survive project-file export/import.

Publication must preserve parts, physical wires, source code and existing metadata. A source
fingerprint and backup identify the physical revision used. Subsequent physical changes do not
automatically regenerate this design. Reject a changed source or an occupied Design section
before publishing, rather than replacing another person's edits.

Tests flatten the generated hierarchy to prove physical net equivalence. They also cover all
twelve distinct floor pairs, latch hold between sensors, both displays, blocked requests,
arrival, reset, orthogonal routing and body clearance.
