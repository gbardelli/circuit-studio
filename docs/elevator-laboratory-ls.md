# Laboratory elevator wiring

The design occupies four 830-point breadboards. The GIGA and its display shield, five
SparkFun BOB-12009 voltage-interface modules and the regulated supply sit alongside them.
The interface modules contain discrete MOSFETs and pull-up resistors, not elevator control logic.

| Board | Main functions |
| --- | --- |
| 1 | Cabin/hall inputs, gate-based priority encoder, nominal 1 Hz NE555 clock |
| 2 | Destination memory, state logic, 5 V NE555 control clock, up/down indicators |
| 3 | Floor sensors, actual-floor memory, comparator, equal-floor indicator |
| 4 | Floor timing sequencer and the destination, actual-floor and total-seconds displays |

## Registers and comparison

U8 and U11 are **74LS173** four-bit registers. M/N enable the outputs when low; G1/G2
enable capture on the positive clock edge when low; MR clears asynchronously when high.
U8 captures requests on the control clock while `/ACEPTAR` is low. U11 captures the
floor-sensor code on the arrival edge. Neither memory uses a 193 counter or a 273 register.

U12 is **74LS85**, wired like the course reference: A receives the actual floor and B the
requested floor. A>B commands down, A<B commands up, and A=B indicates stop. Cascade
inputs are fixed to equal. Movement is also gated by busy state; arrival requires a sensor.
The unused NAND at U2 drives the equal-floor indicator through a current-limiting resistor.

The displays use **74LS48**, common-cathode digits and the driver's internal pull-ups.
The up/down LED drivers use existing LS04 inverters to sink current through 2.2 kΩ resistors.

U16 remains a **74LS193 timing counter only**, sequencing three seconds per floor.
Its laboratory availability still needs confirmation; it is not used as memory. The GIGA
accumulates these timing ticks and sends total remaining seconds to U17 through a protected
four-bit BCD interface: 9→0 for three floors, 6→0 for two, and 3→0 for one. The final zero
remains visible. The GIGA does not replace the register/comparator/state-machine logic.

## Power domains

- The external regulated supply feeds the LS logic at **5 V**. It is not wired into the
  GIGA's USB/5 V output. Grounds are common.
- The GIGA and converter LV terminals use **3.3 V**. Only board 2's lower positive rail
  distributes 3.3 V; the other positive rails carry 5 V. Rail labels show the distinction.
- Every connected GIGA data signal passes through a converter channel. Low and high
  sides are separate physical nets; their matching names identify the same logical signal.
- Each BOB-12009 channel models its two 10 kΩ pull-ups, BSS138-style NMOS and body diode.
  Tests exercise translation in both directions, including a 2.7 V TTL high.

## Validation boundary

Tests cover register capture/hold/reset/output-disable, all sixteen floor comparisons,
request blocking, sequential trips, the total countdown, the four-board limit, unique sockets,
display-face clearance and the 30-unit gaps between neighboring IC bodies on boards 2/3.
Simulation also checks LS supply voltages and connected GIGA GPIO voltages during operation.

These are functional/electrical-model checks, not certification of a physical build. LS
internal supply/input currents, mechanical bounce, wiring parasitics and supply transients
are not fully modeled. Ceramic bypass capacitors remain omitted at the user's request;
manufacturer-recommended decoupling must be considered before building real hardware.

## Primary references

- [TI SN74LS173A register](https://www.ti.com/lit/ds/symlink/sn74ls173a.pdf)
- [TI SN74LS85 comparator](https://www.ti.com/lit/ds/symlink/sn74ls85.pdf)
- [TI decoder data sheet covering SN74LS48](https://www.ti.com/lit/ds/symlink/sn74ls47.pdf)
- [SparkFun BOB-12009 hardware](https://github.com/sparkfun/Logic_Level_Bidirectional)
- [Arduino GIGA voltage guidance](https://docs.arduino.cc/tutorials/giga-r1-wifi/cheat-sheet)
