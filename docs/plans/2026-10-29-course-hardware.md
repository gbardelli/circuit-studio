# Hardware coverage for the course projects

The supplied projects set the acceptance target. The GTX diagrams use 7473, 7475, 74153, 74138 and an Uno with a PCF8574 LCD backpack. Elevator control additionally needs encoders, memory, comparators and seven-segment decoding. Ubícate uses logic, a two-bit counter, direct display segments and serial capture.

## Implementation

1. Add the missing exact legacy pinouts and useful modern variants. Model 7473 pulse capture separately from 74LS73A edge capture. Keep paired enable inputs on 7475 and independent strobes on 74153. Use datasheet-derived TTL thresholds for legacy devices without changing existing HC models.
2. Add a reusable I²C device contract and an AVR TWI master bridge. Connect transactions only to powered devices on the actual SDA/SCL nets. Return NACK for missing, swapped, shorted, unpowered or conflicting addresses. Support repeated starts, reads, writes and stop. Model transactions at byte level, not line-level bus waveforms.
3. Implement PCF8574/PCF8574A quasi-bidirectional ports and a four-pin LCD backpack. Share the existing HD44780 renderer/controller. Provide address selection and a documented backpack mapping. Install a pinned LiquidCrystal_I2C library in local and cloud toolchains.
4. Add reference circuits for the GTX chain and the I²C LCD. Test counter reset/counting, latch retention, multiplexing/demultiplexing, Arduino input capture and displayed values. Validate elevator and direction-control building blocks against the course's operating cases.

## Verification

Check real pin order against manufacturer diagrams; enumerate truth tables and disabled states under electrical load. Run compiled Wire and LiquidCrystal_I2C sketches on Uno/Nano/Mega, including wrong address, disconnected bus, unpowered device and topology changes. Verify rendering, library search and reference templates in the browser. Run the complete tests and production build before pushing and deploying.

The model remains educational. No claim of SPICE-level electrical accuracy, multi-master bus arbitration or exact IC propagation timing. A separate GUI/Google Maps bridge, anonymous project viewing and the physical prototype are outside this hardware change.

## Primary references

- TI SN7473 / SN74LS73A: https://www.ti.com/lit/ds/symlink/sn54ls73a.pdf
- TI SN7475 / SN74LS75: https://www.ti.com/lit/ds/symlink/sn74ls75.pdf
- TI SN74153: https://www.ti.com/lit/ds/symlink/sn74ls153.pdf
- TI PCF8574: https://www.ti.com/lit/ds/symlink/pcf8574.pdf
- The installed avr8js TWI implementation and official Arduino Wire sources.
