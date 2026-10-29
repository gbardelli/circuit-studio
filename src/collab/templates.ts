// Plantillas: circuitos completos alineados a los orificios de la protoboard.
// Protoboard de 400 en (320,−10): columna c → x = 350 + 10·(c−1); filas a–e = 50–90,
// f–j = 120–160; rieles + = 10 / 190, − = 20 / 200 (sin orificio en las columnas 6, 12, 18…).
import type { Props, Rotation, Vec } from '../core/types';

export interface TemplatePart {
  key: string;
  type: string;
  x: number;
  y: number;
  rot?: Rotation;
  props?: Props;
}

export interface TemplateWire {
  a: [string, string];
  b: [string, string];
  points?: Vec[];
  color: string;
}

export interface Template {
  id: string;
  name: string;
  summary: string;
  level: 'Básico' | 'Intermedio';
  parts: TemplatePart[];
  wires: TemplateWire[];
  sketch?: string;
}

const RED = '#e5484d';
const BLACK = '#26272b';
const BLUE = '#3e7bfa';
const ORANGE = '#f2862e';
const GREEN = '#2fbf71';
const YELLOW = '#f5c518';
const PURPLE = '#9b6bf2';

const UNO: TemplatePart = { key: 'uno', type: 'arduino-uno', x: 0, y: 0 };
const BB: TemplatePart = { key: 'bb', type: 'breadboard-half', x: 320, y: -10, props: { cols: 30 } };
const POWER: TemplateWire[] = [
  { a: ['uno', '5V'], b: ['bb', 'bp2'], points: [{ x: 120, y: 246 }, { x: 360, y: 246 }], color: RED },
  { a: ['uno', 'GND.2'], b: ['bb', 'bn1'], points: [{ x: 130, y: 234 }, { x: 330, y: 234 }, { x: 330, y: 200 }], color: BLACK },
];

export const TEMPLATES: Template[] = [
  {
    id: 'blink',
    name: 'Parpadeo',
    summary: 'Un LED en el pin 13 que se enciende cada medio segundo.',
    level: 'Básico',
    parts: [UNO, BB, { key: 'led', type: 'led', x: 470, y: 120, props: { color: 'red' } }, { key: 'r', type: 'resistor', x: 480, y: 160, props: { resistance: 220 } }],
    wires: [
      ...POWER,
      { a: ['uno', 'D13'], b: ['bb', 'h18'], points: [{ x: 110, y: -28 }, { x: 520, y: -28 }], color: ORANGE },
      { a: ['bb', 'j13'], b: ['bb', 'bn13'], color: BLACK },
    ],
    sketch: `// Parpadeo: el LED del pin 13 se enciende y se apaga.

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`,
  },
  {
    id: 'traffic',
    name: 'Semáforo',
    summary: 'Tres LEDs con su ciclo de rojo, verde y ámbar.',
    level: 'Básico',
    parts: [
      UNO,
      BB,
      { key: 'l1', type: 'led', x: 420, y: 120, props: { color: 'red' } },
      { key: 'l2', type: 'led', x: 490, y: 120, props: { color: 'yellow' } },
      { key: 'l3', type: 'led', x: 560, y: 120, props: { color: 'green' } },
      { key: 'r1', type: 'resistor', x: 430, y: 160, props: { resistance: 220 } },
      { key: 'r2', type: 'resistor', x: 500, y: 160, props: { resistance: 220 } },
      { key: 'r3', type: 'resistor', x: 570, y: 160, props: { resistance: 220 } },
    ],
    wires: [
      ...POWER,
      { a: ['uno', 'D12'], b: ['bb', 'h13'], points: [{ x: 120, y: -44 }, { x: 470, y: -44 }], color: RED },
      { a: ['uno', 'D11'], b: ['bb', 'h20'], points: [{ x: 130, y: -36 }, { x: 540, y: -36 }], color: YELLOW },
      { a: ['uno', 'D10'], b: ['bb', 'h27'], points: [{ x: 140, y: -28 }, { x: 610, y: -28 }], color: GREEN },
      { a: ['bb', 'j8'], b: ['bb', 'bn8'], color: BLACK },
      { a: ['bb', 'j15'], b: ['bb', 'bn15'], color: BLACK },
      { a: ['bb', 'j22'], b: ['bb', 'bn22'], color: BLACK },
    ],
    sketch: `// Semáforo: rojo, verde y ámbar en bucle.

const int ROJO = 12;
const int AMBAR = 11;
const int VERDE = 10;

void luz(int pin, int ms) {
  digitalWrite(pin, HIGH);
  delay(ms);
  digitalWrite(pin, LOW);
}

void setup() {
  pinMode(ROJO, OUTPUT);
  pinMode(AMBAR, OUTPUT);
  pinMode(VERDE, OUTPUT);
}

void loop() {
  luz(ROJO, 2000);
  luz(VERDE, 2000);
  luz(AMBAR, 700);
}
`,
  },
  {
    id: 'button',
    name: 'Pulsador y LED',
    summary: 'Lee un pulsador con resistencia interna de pull-up.',
    level: 'Básico',
    parts: [
      UNO,
      BB,
      { key: 'btn', type: 'pushbutton', x: 430, y: 90, props: { cap: 'blue' } },
      { key: 'led', type: 'led', x: 510, y: 120, props: { color: 'green' } },
      { key: 'r', type: 'resistor', x: 520, y: 160, props: { resistance: 220 } },
    ],
    wires: [
      ...POWER,
      { a: ['uno', 'D2'], b: ['bb', 'a9'], points: [{ x: 230, y: -28 }, { x: 430, y: -28 }], color: BLUE },
      { a: ['bb', 'j11'], b: ['bb', 'bn11'], color: BLACK },
      { a: ['uno', 'D13'], b: ['bb', 'h22'], points: [{ x: 110, y: -40 }, { x: 560, y: -40 }], color: ORANGE },
      { a: ['bb', 'j17'], b: ['bb', 'bn17'], color: BLACK },
    ],
    sketch: `// Pulsador y LED: mientras pulsas, el LED se enciende.

const int BOTON = 2;
const int LED = 13;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
}

void loop() {
  bool pulsado = digitalRead(BOTON) == LOW;
  digitalWrite(LED, pulsado ? HIGH : LOW);
}
`,
  },
  {
    id: 'pwm',
    name: 'Atenuador PWM',
    summary: 'El potenciómetro regula el brillo del LED por PWM.',
    level: 'Intermedio',
    parts: [
      UNO,
      BB,
      { key: 'led', type: 'led', x: 470, y: 120, props: { color: 'red' } },
      { key: 'r', type: 'resistor', x: 480, y: 160, props: { resistance: 220 } },
      { key: 'pot', type: 'potentiometer', x: 550, y: 120, props: { resistance: 10000, position: 0.6 } },
    ],
    wires: [
      ...POWER,
      { a: ['uno', 'D9'], b: ['bb', 'h18'], points: [{ x: 150, y: -28 }, { x: 520, y: -28 }], color: ORANGE },
      { a: ['bb', 'j13'], b: ['bb', 'bn13'], color: BLACK },
      { a: ['bb', 'j21'], b: ['bb', 'bn21'], color: BLACK },
      { a: ['bb', 'j23'], b: ['bb', 'bp23'], color: RED },
      { a: ['bb', 'j22'], b: ['uno', 'A0'], points: [{ x: 560, y: 258 }, { x: 170, y: 258 }], color: BLUE },
    ],
    sketch: `// Atenuador PWM: A0 lee el potenciómetro y el pin 9 regula el LED.

const int LED_PWM = 9;

void setup() {
  pinMode(LED_PWM, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(A0);
  analogWrite(LED_PWM, lectura / 4);
  Serial.print("A0 = ");
  Serial.println(lectura);
  delay(200);
}
`,
  },
  {
    id: 'servo',
    name: 'Servo con potenciómetro',
    summary: 'El ángulo del servo sigue al mando.',
    level: 'Intermedio',
    parts: [UNO, BB, { key: 'pot', type: 'potentiometer', x: 550, y: 120, props: { resistance: 10000, position: 0.3 } }, { key: 'servo', type: 'servo', x: 700, y: 150 }],
    wires: [
      ...POWER,
      { a: ['bb', 'j21'], b: ['bb', 'bn21'], color: BLACK },
      { a: ['bb', 'j23'], b: ['bb', 'bp23'], color: RED },
      { a: ['bb', 'j22'], b: ['uno', 'A0'], points: [{ x: 560, y: 258 }, { x: 170, y: 258 }], color: BLUE },
      { a: ['servo', 'GND'], b: ['bb', 'bn29'], points: [{ x: 700, y: 214 }, { x: 630, y: 214 }], color: BLACK },
      { a: ['servo', 'V+'], b: ['bb', 'bp28'], points: [{ x: 710, y: 176 }, { x: 620, y: 176 }], color: RED },
      { a: ['servo', 'SIG'], b: ['uno', 'D9'], points: [{ x: 720, y: -30 }, { x: 150, y: -30 }], color: ORANGE },
    ],
    sketch: `// Servo con potenciómetro: 0–1023 en A0 → 0–180°.

#include <Servo.h>

Servo servo;

void setup() {
  servo.attach(9);
}

void loop() {
  int valor = analogRead(A0);
  servo.write(map(valor, 0, 1023, 0, 180));
  delay(15);
}
`,
  },
  {
    id: 'divider',
    name: 'Divisor de tensión',
    summary: 'Pila de 9 V, dos resistencias y un multímetro. Sin código.',
    level: 'Básico',
    parts: [
      { key: 'bb', type: 'breadboard-half', x: 0, y: 0, props: { cols: 30 } },
      { key: 'bat', type: 'battery-9v', x: -60, y: 130 },
      // Con la protoboard en el origen: columna c → x = 30 + 10·(c−1); filas a–e = 60–100, f–j = 130–170.
      { key: 'r1', type: 'resistor', x: 120, y: 100, rot: 90, props: { resistance: 10000 } },
      { key: 'r2', type: 'resistor', x: 120, y: 150, props: { resistance: 10000 } },
      { key: 'dmm', type: 'multimeter', x: 380, y: 60, props: { mode: 'V' } },
    ],
    wires: [
      { a: ['bat', '+'], b: ['bb', 'tp1'], points: [{ x: -50, y: 20 }], color: RED },
      { a: ['bat', '-'], b: ['bb', 'bn1'], points: [{ x: -60, y: 210 }], color: BLACK },
      { a: ['bb', 'tp10'], b: ['bb', 'a10'], color: RED },
      { a: ['bb', 'j14'], b: ['bb', 'bn14'], color: BLACK },
      { a: ['dmm', 'IN'], b: ['bb', 'i10'], points: [{ x: 440, y: 234 }, { x: 120, y: 234 }], color: PURPLE },
      { a: ['dmm', 'COM'], b: ['bb', 'bn26'], points: [{ x: 400, y: 222 }, { x: 280, y: 222 }], color: BLACK },
    ],
  },
];
