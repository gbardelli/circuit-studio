# Elevator electrical review

The template is a **3.3 V simulation design**, not a released hardware schematic. The cloud project must retain a recoverable pre-change version. Do not silently substitute LS-family parts for HC-family parts.

## Circuit organization

The layout uses exactly four 830-point boards. Board 1 holds inputs, priority and the countdown oscillator; board 2 holds state/memory and direction LEDs; board 3 holds sensors/comparison; board 4 holds the countdown counter and all three display drivers/displays. The displays form one aligned horizontal row, ordered destination, current floor, seconds. Signal colors follow the function defined in `collab/bench.ts`, not the instantaneous logic level. The physical rail reference is 3.3 V and shared ground.

The 21 external 220 Ω segment resistors have been removed from the simulation. Each `74hc48` output is already modeled with its own 2 kΩ pull-up, so per-segment current remains limited. The physical SN74LS48 datasheet also documents internal pull-ups, but that does not establish the identity or supply requirements of the lab parts. Do not copy the resistor-free arrangement to a different decoder. No common-cathode series resistor is used as a substitute. All eight physical buttons, three displays and the existing control functions are retained.

There are no discrete diodes. Four 1N4007 parts and their 10 kΩ pull-up were removed. SENSOR = SEN0 OR SEN1 OR SEN2 is generated using spare gates in U9 (74HC00), U10 (74HC04) and U13 (74HC08), all on the sensor board. U11 is a standard 74HC273 edge-triggered D register instead of a 74HC193 used as a transparent load register. Its three low bits store the floor, D3–D7 are grounded, and its active-low clear connects to RESET. A spare U6 AND gates SENSOR with the released reset line to generate CP. Arrival captures the floor; releasing the sensor does not load zero. Releasing RESET recaptures the current sensor. No additional IC package is required.

Floor sensors are one-hot and break before make: there is an interval with all four inactive between different floors, as occurs while a cab travels. Directly replacing one active floor with another without an inactive interval is outside this capture protocol. Simulation fixtures explicitly exercise the inactive interval; integration tests exercise the firmware's actual travel and sensor activation. Do not claim this functional model proves setup/hold, input bounce or propagation margins on real hardware.

Destination encoding has explicit priority 4 > 3 > 2 > 1. Equations for active-high requests P1–P4 are:

* SEL2 = P4
* SEL1 = (P2 OR P3) AND NOT P4
* SEL0 = (P3 OR (P1 AND NOT P2)) AND NOT P4

One additional 74HC08, U20, works with spare gates of U2/U3. This priority applies to concurrent calls before capture; it is not a queue. The sensor encoder assumes one physical floor sensor at a time. Conflicting floor sensors remain an invalid hardware condition.

LS/LB series resistors are 1 kΩ to reduce loading on logic outputs. At the user's request, the classroom simulation omits the twenty 100 nF ceramic bypass capacitors marked 104. This is an educational simplification, not a finding that bypass capacitors are unnecessary. Supply impedance, switching spikes and noise are not modeled, so this version does not validate reliable hardware operation without decoupling. The two timing electrolytics retain their polarity and voltage rating. The GIGA Display Shield is mounted on the GIGA and is not an independently wired display.

## What is measured

Diagnostics shows DC pin-current magnitude, resistor dissipation V²/R, capacitor voltage/polarity, and reference conditions. Resistors warn at half their configured rating, capacitors at 80% of voltage rating. A 2 mA output load is a conservative **design target**, not a manufacturer's absolute maximum. LED current references are provisional until the physical part is identified. CMOS input margins are checked separately from the behavioral model's switching thresholds.

Run `npx tsx scripts/audit-elevator.ts` to sample the logic-only circuit every 50 ms across all 15 nonempty button combinations, reset, all floor sensors and countdown transitions. It writes `work/elevator-electrical-audit.json` with observed extrema. This does not load GIGA firmware or measure board/shield consumption. The integration test separately runs the firmware and checks touch calls and complete trips.

## Unresolved hardware requirements

1. Identify the actual decoder by manufacturer and full marking. The existing `74hc48` model uses a behavioral pull-up approximation. It does not establish that a physical part named HC48 has the same characteristics. A 74LS48 needs its own documented supply and I/O design. Do not remove segment resistors or add arbitrary pull-ups to increase brightness without checking output current and package limits.
2. Confirm both timers are TLC555 CMOS. A generic NE555 is not validated at 3.3 V. The simulation's label override does not change physical hardware.
3. Verify guaranteed output voltage/current, total source/sink current per package, and all GIGA pin constraints against the exact parts. Do not connect 5 V logic directly to GIGA GPIO or assume 3.3 V always drives a 5 V HC input.
4. Add and validate hardware input conditioning if the physical buttons or floor sensors bounce. The ideal button model does not prove antirrebounce behavior. Check setup/hold at U11 and verify the decoded data is stable before its capture clock. A passing functional simulation does not prove it hazard-free.
5. Check real breadboard rail continuity, display pinout/common-cathode type, supply capacity, ground integrity and capacitor polarity before power-on.
6. Review supply decoupling against each manufacturer's recommendations before physical implementation. The classroom drawing intentionally omits it and cannot certify that omission.

## Physical verification

Use a current-limited bench supply for the logic board with the GIGA disconnected initially. Choose the current limit from the completed load budget and actual supply specifications, not from this simulation's omitted quiescent consumption. Verify resistance between rails unpowered, then rail voltages and supply current. Power and test one functional block at a time. Connect the GIGA only after checking all signal voltages and common ground. Measure voltage in parallel; measure current in series or infer it from voltage across a known series resistor. An ammeter placed across the supply shorts it.

No thermal model, tolerance sweep, LED junction-temperature model, transient current peaks, GPIO clamp injection, supply sequencing, signal integrity or physical wiring faults are certified by these checks. The UI intentionally never reports “safe to build”.

## Primary references

* [Arduino GIGA R1 manual](https://docs.arduino.cc/tutorials/giga-r1-wifi/cheat-sheet)
* [GIGA Display Shield](https://docs.arduino.cc/hardware/giga-display-shield/)
* [TI SN74HC08](https://www.ti.com/lit/ds/symlink/sn74hc08.pdf)
* [TI TLC555](https://www.ti.com/lit/ds/symlink/tlc555.pdf)
* [TI SN74HC273](https://www.ti.com/lit/ds/symlink/sn74hc273.pdf)
* [TI 7448/74LS48 family](https://www.ti.com/lit/ds/symlink/sn54ls47.pdf)
