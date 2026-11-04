# Laboratory elevator wiring

## Logic families

Parts are LS only where the laboratory has no HC version: **74LS173** (registers and the
floor sequencer), **74LS85** (comparator) and **74LS48** (BCD decoders). There is no 193.
Every other logic IC is **74HC**: 00, 04, 08, 32 and 74. Both families run from the same
5 V supply and can be mixed:

- HC output → LS input: fine. An HC high is close to 5 V and LS only needs 2.0 V.
- LS output → HC input: needs care. LS only guarantees a 2.7 V high, while HC asks for
  3.15 V (0.7·VCC at 4.5 V). It usually works (a typical LS high is about 3.4 V), but
  not with margin. The three 74LS85 outputs feed 74HC gates, so each has a **4.7 kΩ
  pull-up to 5 V** that raises its high close to VCC. U16 Q0/Q1 feed a 74HC00 gate; their
  net already carries the 10 kΩ HV-side pull-up of the level converter, which does the same.
  The 74LS173 memories only feed LS85, LS48 and the converters; the 74LS48 outputs only
  drive the displays.

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
The up/down LED drivers use existing 74HC04 inverters to sink current through 2.2 kΩ resistors.

U16 is a **74LS173 used as a three-phase sequencer** (no 193 is available): D1 = Q0 and
D0 = NAND(Q0, Q1) through a spare 74HC00 gate. While idle, MR = /OCUPADO holds it at 00.
While moving it steps 01 → 11 → 10 → 01 once per second; each entry into 10 marks three
seconds and one floor. The GIGA reads the phase, counts one second per change and sends total remaining seconds to U17 through a protected
four-bit BCD interface: 9→0 for three floors, 6→0 for two, and 3→0 for one. The final zero
remains visible. The GIGA does not replace the register/comparator/state-machine logic.

## Power domains

- The external regulated supply feeds the HC/LS logic at **5 V**. It is not wired into the
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
Simulation also checks HC/LS supply voltages and connected GIGA GPIO voltages during operation.

These are functional/electrical-model checks, not certification of a physical build. IC
internal supply/input currents, mechanical bounce, wiring parasitics and supply transients
are not fully modeled. Ceramic bypass capacitors remain omitted at the user's request;
manufacturer-recommended decoupling must be considered before building real hardware.

## Primary references

- [TI SN74LS173A register](https://www.ti.com/lit/ds/symlink/sn74ls173a.pdf)
- [TI SN74LS85 comparator](https://www.ti.com/lit/ds/symlink/sn74ls85.pdf)
- [TI decoder data sheet covering SN74LS48](https://www.ti.com/lit/ds/symlink/sn74ls47.pdf)
- [SparkFun BOB-12009 hardware](https://github.com/sparkfun/Logic_Level_Bidirectional)
- [Arduino GIGA voltage guidance](https://docs.arduino.cc/tutorials/giga-r1-wifi/cheat-sheet)
