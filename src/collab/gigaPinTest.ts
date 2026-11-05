import type { Template } from './templates';

// Prueba de pines del Arduino GIGA R1 WiFi: ¿sacan 3,3 V o 5 V?
// Un multímetro mide el pin que se está probando (D22 al arrancar) y otro mide el pin de 5 V como
// referencia. El sketch pone en alto un solo pin cada vez; se cambia desde el monitor serie.
export const GIGA_PIN_TEST_SKETCH = `// Prueba de pines del GIGA: ¿3,3 V o 5 V?
// Un solo pin sale en HIGH cada vez; los demás quedan como entrada (alta impedancia).
// Escribe en el monitor serie el número del pin (por ejemplo 22, o 54 para A0) y mide con el
// multímetro entre ese pin y GND. En el GIGA debe leerse ≈ 3,3 V; el pin 5V da ≈ 5 V.

const int PRIMER_PIN = 2;
const int ULTIMO_PIN = 53;   // D2–D53 del cabezal; A0 = 54 … A11 = 65
int pinActual = 22;

void soltarTodos() {
  for (int p = PRIMER_PIN; p <= ULTIMO_PIN; p++) pinMode(p, INPUT);
}

void activar(int p) {
  soltarTodos();
  pinActual = p;
  pinMode(p, OUTPUT);
  digitalWrite(p, HIGH);
  Serial.print("Pin ");
  Serial.print(p);
  Serial.println(" en HIGH -> esperado 3.3 V (nunca 5 V)");
}

void setup() {
  Serial.begin(115200);
  activar(pinActual);
  Serial.println("Escribe un numero de pin (2-53) para probarlo.");
}

void loop() {
  if (Serial.available()) {
    int p = Serial.parseInt();
    if (p >= PRIMER_PIN && p <= ULTIMO_PIN) activar(p);
    while (Serial.available()) Serial.read();
  }
}
`;

export const GIGA_PIN_TEST: Template = {
  id: 'giga-pin-test',
  name: 'Prueba de pines del GIGA (3,3 V o 5 V)',
  category: 'Arduino',
  level: 'Básico',
  summary:
    'Un multímetro mide el pin del GIGA que está en HIGH (3,3 V) y otro el pin de 5 V como referencia. Cambia de pin desde el monitor serie.',
  parts: [
    { key: 'mcu', type: 'arduino-giga', x: 0, y: 0 },
    { key: 'pin', type: 'multimeter', x: 450, y: 0, props: { mode: 'V' } },
    { key: 'ref', type: 'multimeter', x: 570, y: 0, props: { mode: 'V' } },
  ],
  wires: [
    { a: ['mcu', 'D22'], b: ['pin', 'IN'], points: [{ x: 440, y: 160 }], color: '#f2862e' },
    { a: ['mcu', 'GND.1'], b: ['pin', 'COM'], points: [{ x: 430, y: 150 }], color: '#26272b' },
    { a: ['mcu', '5V'], b: ['ref', 'IN'], points: [{ x: 560, y: 170 }], color: '#e5484d' },
    { a: ['mcu', 'GND.2'], b: ['ref', 'COM'], points: [{ x: 550, y: 180 }], color: '#26272b' },
  ],
  sketch: GIGA_PIN_TEST_SKETCH,
};
