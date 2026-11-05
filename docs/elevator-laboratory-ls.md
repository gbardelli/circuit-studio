# Laboratory elevator wiring (3.3 V, no level converters)

The whole circuit runs from **one 3.3 V rail**, the voltage of the Arduino GIGA pins. The GIGA is
wired straight to the logic: no BOB-12009 modules, no second supply voltage, no pull-ups to 5 V.

## Parts

| Qty | Part | Where |
| --- | --- | --- |
| 2 | 74HC273 | U8 destination memory, U11 actual-floor memory |
| 1 | 74HC85 | U12 comparator |
| 3 | CD4511 or 74HC4511 | U14 destination, U19 actual floor, U17 total seconds |
| 2 | TLC555 / LMC555 / ICM7555 (CMOS, pieza `tlc555`) | U15 1 Hz clock, U4 control clock |
| 2 | 74HC74 | U5 OCUPADO / VÁLIDO flip-flops, U16 three-phase sequencer |
| 3 / 2 / 4 / 1 | 74HC00 / 04 / 08 / 32 | gates (U2 U9 U18 / U3 U10 / U1 U6 U13 U20 / U7) |
| 3 | 68 Ω | one in the common cathode of each display |
| 3 | 680 Ω | LS, LB and "equal floors" LEDs |

The 74HC173 and 74HC193 are **not used**: U16 is a 74HC74 (D1 = Q0, D0 = NAND(Q0, Q1)) and the
registers are 74HC273, so a 193 would only be a spare. Every family member must be **HC/CMOS**: a 74LS part needs ~4.75 V and does
not work at 3.3 V, and a bipolar NE555 does not oscillate below ~4.5 V.

The design occupies four 830-point breadboards. The GIGA and its display shield and the
regulated supply (set to **3.3 V**) sit alongside them.

| Board | Main functions |
| --- | --- |
| 1 | Cabin/hall inputs, gate-based priority encoder, nominal 1 Hz TLC555 clock |
| 2 | Destination memory, state logic, TLC555 control clock, up/down indicators |
| 3 | Floor sensors, actual-floor memory, comparator, equal-floor indicator |
| 4 | Floor timing sequencer and the destination, actual-floor and total-seconds displays |

## Registers and comparison

U11 (actual floor) is a **74HC273**: it captures the sensor code on the arrival edge (CP) and is
cleared by RESET (MR, active low, straight from the RESET button). D3–D7 are grounded.

U8 (destination) is also a **74HC273**. It has no enable input, so its clock goes through one
AND gate: CP = CLK · ACEPTAR (U6 gate 3). It captures the requested floor on the first clock
edge after a request is accepted; ACEPTAR then drops when OCUPADO rises. The gated clock can give
a short extra pulse if ACEPTAR rises while CLK is high; that only stores a provisional
destination while the elevator is idle, and the next real clock edge overwrites it.

U12 is **74HC85**: A receives the actual floor and B the requested floor. A>B commands down,
A<B commands up, and A=B indicates stop. Cascade inputs are fixed to equal. Movement is also
gated by busy state; arrival requires a sensor. The unused NAND at U2 drives the equal-floor
indicator through a 680 Ω resistor.

## Displays

The three displays use **CD4511 / 74HC4511** (common-cathode, same pinout as the 7448 they
replace): LT to VDD, LE to GND (transparent). BL low blanks the display: U14 and U17 take it
from VÁLIDO, so they stay dark until the first request; U19 has BL tied high.

Unlike the 7448, the 4511 has **no internal segment resistors**. Each display has one **68 Ω**
resistor from its common cathode to ground. Segment current then depends on how many segments
are lit (about 2 mA each on an "8", up to ~7 mA on a "1"). At 3.3 V the LED (≈ 1.9 V) leaves
little headroom, so prefer the 74HC4511 (stronger outputs than the CD4511) and tune the resistor
for the real display. Before the first floor sensor, the actual-floor display shows **0**; the
4511 has no ripple-blanking input.

## Sequencer and GIGA

U16 is a **74HC74 used as a three-phase sequencer** (two D flip-flops: D1 = Q0, D0 = NAND(Q0, Q1)).
While idle, CLR = OCUPADO (active low) holds it at 00.
While moving it steps 01 → 11 → 10 → 01 once per second; each entry into 10 marks three seconds
and one floor. The GIGA reads the phase, counts one second per change and sends total remaining
seconds straight to U17 through four BCD GPIOs: 9→0 for three floors, 6→0 for two, and 3→0 for
one. The final zero remains visible. The GIGA does not replace the register, comparator or
state-machine logic.

Calls and sensors are open-drain on the GIGA side (INPUT releases the line, OUTPUT LOW pulls it
to 0), so the GIGA never drives 3.3 V against a button or switch. Everything the GIGA reads
(phase, OCUPADO, VÁLIDO, destination) is an HC output at 3.3 V.

## Power

- The regulated supply feeds all four breadboard rails at **3.3 V**. The GIGA's own power comes
  from USB; its 3V3 pin is not used. Grounds are common (GIGA GND to the board 2 ground rail).
- Both rails of every breadboard carry the same 3.3 V.

## Validation boundary

Tests cover register capture/hold/reset/output-disable, all sixteen floor comparisons, request
blocking, sequential trips, the total countdown driven by the real firmware, the four-board limit,
unique sockets, display-face clearance and the 30-unit gaps between neighboring IC bodies on
boards 2/3. Simulation also checks that every HC/CD4511 sees 3.3 V and that the connected GIGA
pins stay below 3.6 V.

These are functional/electrical-model checks, not certification of a physical build. IC
supply/input currents, mechanical bounce, wiring parasitics, supply transients and the real
output drive of the 4511 at 3.3 V are not fully modeled. Ceramic bypass capacitors remain omitted
at the user's request; manufacturer-recommended decoupling must be considered before building
real hardware.

## Primary references

- [TI CD74HC273 register](https://www.ti.com/lit/ds/symlink/cd74hc273.pdf)
- [TI CD74HC74 flip-flop](https://www.ti.com/lit/ds/symlink/cd74hc74.pdf)
- [TI CD74HC85 comparator](https://www.ti.com/lit/ds/symlink/cd74hc85.pdf)
- [Nexperia 74HC4511 decoder](https://assets.nexperia.com/documents/data-sheet/74HC_HCT4511.pdf)
- [TI TLC555 timer](https://www.ti.com/lit/ds/symlink/tlc555.pdf)
- [Arduino GIGA voltage guidance](https://docs.arduino.cc/tutorials/giga-r1-wifi/cheat-sheet)
