export interface ManufacturerReference {
  manufacturer: string;
  partNumber: string;
  datasheet: string;
  documentType?: 'product' | 'archive' | 'drawing';
  example?: boolean;
  note?: string;
}

// Documents describe real reference parts, not a guarantee that the simulation
// implements every electrical characteristic or a particular physical package.
const tiHc = ['00', '02', '04', '08', '10', '11', '14', '20', '27', '32', '86', '125', '74', '112', '373', '374', '273', '595', '164', '165', '193', '138', '139', '151', '153', '157', '148'];
const tiLs = ['00', '02', '04', '08', '10', '20', '27', '32', '48', '75', '85'];

export const MANUFACTURER_REFERENCES: Record<string, ManufacturerReference[]> = {};

for (const number of tiHc) {
  const partNumber = `SN74HC${number}`;
  MANUFACTURER_REFERENCES[`74hc${number}`] = [{
    manufacturer: 'Texas Instruments', partNumber,
    datasheet: `https://www.ti.com/lit/ds/symlink/${partNumber.toLowerCase()}.pdf`,
  }];
}
for (const number of tiLs) {
  const partNumber = `SN74LS${number}`;
  MANUFACTURER_REFERENCES[`74ls${number}`] = [{
    manufacturer: 'Texas Instruments', partNumber,
    datasheet: `https://www.ti.com/lit/ds/symlink/${number === '48' ? 'sn74ls47' : partNumber.toLowerCase()}.pdf`,
  }];
}
const nexperiaPages: Record<string, string> = {
  '00': 'https://www.nexperia.com/products/analog-logic-ics/logic/gates/nand-gates/serie/74hc00-74hct00',
  '04': 'https://www.nexperia.com/products/analog-logic-ics/logic/buffers-inverters-transceivers/series/74HC04-74HCT04.html',
  '08': 'https://www.nexperia.com/products/analog-logic-ics/logic/gates/and-gates/serie/74hc08-74hct08',
  '595': 'https://www.nexperia.com/products/analog-logic-ics/logic/flip-flops-latches-registers-counters-dividers/shift-registers/serie/74hc595-74hct595',
};
for (const [number, datasheet] of Object.entries(nexperiaPages)) {
  MANUFACTURER_REFERENCES[`74hc${number}`].push({
    manufacturer: 'Nexperia', partNumber: `74HC${number}`, datasheet, documentType: 'product',
  });
}
MANUFACTURER_REFERENCES['74ls173'] = [{
  manufacturer: 'Texas Instruments', partNumber: 'SN74LS173A',
  datasheet: 'https://www.ti.com/lit/ds/symlink/sn54ls173a.pdf',
}];

const tiReferences: Record<string, string> = {
  cd4001: 'CD4001B', cd4011: 'CD4011B', cd4069: 'CD4069UB', cd4070: 'CD4070B',
  cd4071: 'CD4071B', cd4077: 'CD4077B', cd4081: 'CD4081B', cd4017: 'CD4017B',
  cd4040: 'CD4040B', cd4511: 'CD4511B', cd4066: 'CD4066B', ne555: 'NE555',
  tlc555: 'TLC555', uln2003: 'ULN2003A', l293d: 'L293D',
  '74ls193': 'SN74LS193', '74ls153': 'SN74LS153', '74ls138': 'SN74LS138',
};
for (const [type, partNumber] of Object.entries(tiReferences)) {
  MANUFACTURER_REFERENCES[type] = [{
    manufacturer: 'Texas Instruments', partNumber,
    datasheet: `https://www.ti.com/lit/ds/symlink/${partNumber.toLowerCase()}.pdf`,
  }];
}

MANUFACTURER_REFERENCES.pcf8574 = [{ manufacturer: 'Texas Instruments', partNumber: 'PCF8574', datasheet: 'https://www.ti.com/lit/ds/symlink/pcf8574.pdf' }];
MANUFACTURER_REFERENCES['arduino-giga'] = [{ manufacturer: 'Arduino', partNumber: 'GIGA R1 WiFi', datasheet: 'https://docs.arduino.cc/tutorials/giga-r1-wifi/cheat-sheet/', documentType: 'product' }];
MANUFACTURER_REFERENCES['arduino-uno'] = [{ manufacturer: 'Arduino', partNumber: 'UNO R3', datasheet: 'https://docs.arduino.cc/hardware/uno-rev3/', documentType: 'product' }];
MANUFACTURER_REFERENCES['arduino-mega'] = [{ manufacturer: 'Arduino', partNumber: 'Mega 2560 Rev3', datasheet: 'https://docs.arduino.cc/hardware/mega-2560/', documentType: 'product' }];
MANUFACTURER_REFERENCES['arduino-nano'] = [{ manufacturer: 'Arduino', partNumber: 'Nano', datasheet: 'https://docs.arduino.cc/hardware/nano/', documentType: 'product' }];

const additionalTiReferences: Record<string, string> = {
  '74hc161': 'SN74HC161', '74hc163': 'SN74HC163', '74hc85': 'CD74HC85',
  '74ls73a': 'SN74LS73A', pcf8574a: 'PCF8574A',
};
for (const [type, partNumber] of Object.entries(additionalTiReferences)) {
  MANUFACTURER_REFERENCES[type] = [{
    manufacturer: 'Texas Instruments', partNumber,
    datasheet: `https://www.ti.com/lit/ds/symlink/${partNumber.toLowerCase()}.pdf`,
  }];
}

const verifiedReferences: Record<string, ManufacturerReference> = {
  '74lvc245a-read': { manufacturer: 'Texas Instruments', partNumber: 'SN74LVC245A', datasheet: 'https://www.ti.com/lit/ds/symlink/sn74lvc245a.pdf' },
  '74hc173': { manufacturer: 'Texas Instruments', partNumber: 'CD74HC173', datasheet: 'https://www.ti.com/lit/ds/symlink/cd74hc173.pdf' },
  '74ls74': { manufacturer: 'Texas Instruments', partNumber: 'SN74LS74A', datasheet: 'https://www.ti.com/lit/ds/symlink/sn74ls74a.pdf' },
  '7473': { manufacturer: 'Texas Instruments', partNumber: 'SN7473', datasheet: 'https://www.ti.com/lit/ds/symlink/sn54ls73a.pdf' },
  '7475': { manufacturer: 'Texas Instruments', partNumber: 'SN7475', datasheet: 'https://www.ti.com/lit/ds/symlink/sn74ls75.pdf' },
  '74153': { manufacturer: 'Texas Instruments', partNumber: 'SN74153', datasheet: 'https://www.ti.com/lit/ds/symlink/sn74ls153.pdf' },
  '74148': { manufacturer: 'Texas Instruments', partNumber: 'SN74148', datasheet: 'https://www.ti.com/lit/ds/symlink/sn54ls148.pdf' },
  '74ls47': { manufacturer: 'Texas Instruments', partNumber: 'SN74LS47', datasheet: 'https://www.ti.com/lit/ds/symlink/sn74ls47.pdf' },
  '74hc283': { manufacturer: 'Texas Instruments', partNumber: 'CD74HC283', datasheet: 'https://www.ti.com/lit/ds/symlink/cd74hc283.pdf' },
  'tmp36': { manufacturer: 'Analog Devices', partNumber: 'TMP36', datasheet: 'https://www.analog.com/en/products/tmp36.html', documentType: 'product' },
  'giga-display-shield': { manufacturer: 'Arduino', partNumber: 'GIGA Display Shield', datasheet: 'https://docs.arduino.cc/hardware/giga-display-shield/', documentType: 'product' },
};
for (const [type, reference] of Object.entries(verifiedReferences)) {
  MANUFACTURER_REFERENCES[type] = [reference];
}

// Historical manufacturer datasheets hosted by independent archives.
MANUFACTURER_REFERENCES['74ls47'].push(
  { manufacturer: 'Fairchild Semiconductor', partNumber: 'DM74LS47', datasheet: 'https://www.alldatasheet.com/datasheet-pdf/view/51080/FAIRCHILD/74LS47.html', documentType: 'archive' },
  { manufacturer: 'ON Semiconductor', partNumber: 'SN74LS47', datasheet: 'https://www.datasheetq.com/en/pdf-html/172773/ON-Semiconductor/1page/74LS47.html', documentType: 'archive' },
);

// Manufacturer references are examples for generic simulated components.
MANUFACTURER_REFERENCES.resistor = [
  { manufacturer: 'KOA Speer', partNumber: 'CF1/4', datasheet: 'https://www.koaspeer.com/products/leaded-resistors/general-purpose-leaded/cf/', documentType: 'product', example: true },
  { manufacturer: 'Vishay', partNumber: 'CMF Industrial', datasheet: 'https://www.vishay.com/en/product/31018/', documentType: 'product', example: true },
];
MANUFACTURER_REFERENCES.led = [
  { manufacturer: 'Kingbright', partNumber: 'WP1503ID', datasheet: 'https://www.kingbrightusa.com/images/catalog/SPEC/WP1503ID.pdf', example: true, note: 'LED rojo' },
];
MANUFACTURER_REFERENCES.diode = [
  { manufacturer: 'Vishay', partNumber: '1N4007', datasheet: 'https://www.vishay.com/docs/88503/1n4001.pdf' },
  { manufacturer: 'Diodes Incorporated', partNumber: '1N4007', datasheet: 'https://www.diodes.com/datasheet/download/1N4007.pdf' },
];
MANUFACTURER_REFERENCES['nextion-28'] = [
  { manufacturer: 'Nextion', partNumber: 'NX3224T028', datasheet: 'https://cdn.nextion.tech/wp-content/uploads/2022/03/NX3224T028_dimension.pdf', documentType: 'drawing' },
];

for (const number of ['00', '04', '08', '14', '32', '86', '125', '595', '164', '138']) {
  MANUFACTURER_REFERENCES[`74hc${number}`].push({
    manufacturer: 'Diodes Incorporated', partNumber: `74HC${number}`,
    datasheet: `https://www.diodes.com/datasheet/download/74HC${number}.pdf`,
  });
}
for (const number of ['00', '02', '04', '08']) {
  MANUFACTURER_REFERENCES[`74hc${number}`].push({
    manufacturer: 'onsemi', partNumber: `MM74HC${number}`,
    datasheet: `https://www.onsemi.com/pdf/datasheet/mm74hc${number}-d.pdf`,
  });
}
MANUFACTURER_REFERENCES['74hc32'].push({
  manufacturer: 'Nexperia', partNumber: '74HC32',
  datasheet: 'https://www.nexperia.com/products/analog-logic-ics/logic/gates/or-gates/series/74HC32-74HCT32.html', documentType: 'product',
});
MANUFACTURER_REFERENCES['74hc138'].push({
  manufacturer: 'Nexperia', partNumber: '74HC138',
  datasheet: 'https://www.nexperia.com/products/analog-logic-ics/logic/decoders-and-demultiplexers-digital-multiplexers/decoders-demultiplexers/series/74HC138-74HCT138.html', documentType: 'product',
});
MANUFACTURER_REFERENCES['74hc74'].push({
  manufacturer: 'Nexperia', partNumber: '74HC74',
  datasheet: 'https://assets.nexperia.com/documents/data-sheet/74HC_HCT74.pdf',
});
