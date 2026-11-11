export interface ManufacturerReference {
  manufacturer: string;
  partNumber: string;
  datasheet: string;
  documentType?: 'product';
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
