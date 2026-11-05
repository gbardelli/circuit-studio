// Firmware del GIGA para el ascensor de clase. Compila para la placa real (arduino:mbed_giga:giga)
// con las librerías oficiales de la GIGA Display Shield y, en el simulador, sobre el núcleo AVR con
// el mismo mapa de pines y una capa compatible de esas librerías (src/sim/gigaDisplayShim.ts).
export const ELEVATOR_CLASS_GIGA = `// Ascensor de 4 pisos · innovación con Arduino GIGA R1 WiFi + GIGA Display Shield
//
// La lógica obligatoria la hacen los integrados de clase (74LS75, 74LS85, 74LS48 y 74HC):
// memoria del destino, bloqueo, piso actual, comparación, LEDs LS/LB y los dos displays.
// El GIGA no decide nada; añade:
//  1. Llamadas desde la pantalla táctil (innovación): pulsa la línea del piso como un botón más.
//  2. Motor de la cabina (modo AUTO): cuando los CI piden subir o bajar, apaga el sensor, espera
//     3 s por piso y enciende el sensor del piso siguiente. En MANUAL lo haces tú con el DIP.
//  3. Pantalla de 800 x 480: hueco con la cabina, piso actual, destino, tiempo y sentido.
//
// Los CI van a 5 V y el GIGA a 3,3 V: TODAS las líneas pasan por dos TXS0108E
// (VA = 3V3 del GIGA, VB = 5 V, OE unido a VA). El GIGA solo toca el lado A.
// Llamadas y sensores en drenador abierto: OUTPUT LOW pone la línea a 0 (como el pulsador) e
// INPUT la suelta; el GIGA nunca empuja tensión contra un pulsador o un interruptor.

#include <Arduino_GigaDisplay_GFX.h>
#include <Arduino_GigaDisplayTouch.h>
#include <Arduino_GigaDisplay.h>

GigaDisplay_GFX display;
Arduino_GigaDisplayTouch touchPanel;
GigaDisplayRGB rgb;

const int DEST[3]   = {23, 25, 27};      // destino guardado en U8 (74LS75)
const int BUSY      = 29;                // OCUPADO (U5)
const int FLOOR[3]  = {31, 33, 35};      // piso actual guardado en U11 (74LS75)
const int CALL[4]   = {37, 39, 41, 43};  // llamada de piso 1-4 (en paralelo con PP1-PP4)
const int SENSOR[4] = {45, 47, 49, 51};  // sensor de planta 1-4 (en paralelo con el DIP)

const unsigned long FLOOR_MS  = 3000;    // lo que tarda la cabina en recorrer un piso
const unsigned long SETTLE_MS = 250;     // deja que los CI lean el sensor nuevo
const unsigned long DOORS_MS  = 1500;    // puertas abiertas al llegar
const unsigned long PULSE_MS  = 250;     // pulsación de una llamada táctil

#define RGB565(r, g, b) (uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3))
const uint16_t BG = RGB565(10, 12, 15), PANEL = RGB565(21, 25, 30), CARD = RGB565(29, 34, 41);
const uint16_t LINE = RGB565(50, 57, 66), TEXT = RGB565(236, 239, 243), DIM = RGB565(128, 138, 150);
const uint16_t GREEN = RGB565(52, 199, 120), RED = RGB565(240, 84, 84), AMBER = RGB565(245, 176, 65);
const uint16_t BLUE = RGB565(70, 156, 255), CABIN = RGB565(226, 232, 240);

// Pantalla apaisada (rotación 1): 800 x 480
const int SX = 36, SY = 84, SW = 150, SLOT = 92;          // hueco: 4 plantas de 92 px
const int CARD_X = 236, CARD_Y = 84;                       // piso actual
const int SIDE_X = 516, SIDE_W = 248;                      // destino y tiempo
const int CALL_X = 236, CALL_Y = 352, CALL_W = 119, CALL_H = 104, CALL_GAP = 12;
const int MODE_X = 640, MODE_Y = 14, MODE_W = 124, MODE_H = 36;

bool autoMode = true;
int floorNow = 1;        // planta de la cabina
int dir = 0;             // +1 sube, -1 baja, 0 parada
unsigned long segStart = 0, settleUntil = 0, doorsUntil = 0, pulseUntil[4] = {0, 0, 0, 0};
bool wasBusy = false, wasTouching = false;

int shownCab = -1000, shownFloor = -1, shownDest = -2, shownStatus = -1, shownTime = -1, shownCalls = -1, shownMode = -1;
bool shownDoors = false;
char buf[16];

void press(int pin)   { digitalWrite(pin, LOW); pinMode(pin, OUTPUT); }
void release(int pin) { pinMode(pin, INPUT); }

void label(int x, int y, int w, int h, int size, uint16_t fg, uint16_t bg, const char* s) {
  int width = strlen(s) * 6 * size - size;
  display.setTextSize(size);
  display.setTextColor(fg, bg);
  display.setCursor(x + (w - width) / 2, y + (h - 7 * size) / 2);
  display.print(s);
}

// AUTO: solo el sensor de la planta donde está parada la cabina; entre plantas, ninguno.
void driveSensors() {
  for (int i = 0; i < 4; i++) {
    if (autoMode && dir == 0 && floorNow == i + 1) press(SENSOR[i]);
    else release(SENSOR[i]);
  }
}

// Sensor más alto activo (misma prioridad que el codificador de los CI).
int readSensors() {
  for (int i = 3; i >= 0; i--) if (digitalRead(SENSOR[i]) == LOW) return i + 1;
  return 0;
}

// Un número de tres bits que lleva 4 ms estable (los latches cambian de golpe).
// Bus 0 = destino, bus 1 = piso actual.
int busStable[2] = {0, 0}, busCandidate[2] = {0, 0};
unsigned long busSince[2] = {0, 0};
int readBus(const int* pins, int k) {
  int raw = digitalRead(pins[0]) | (digitalRead(pins[1]) << 1) | (digitalRead(pins[2]) << 2);
  unsigned long now = millis();
  if (raw != busCandidate[k]) { busCandidate[k] = raw; busSince[k] = now; }
  if ((unsigned long)(now - busSince[k]) >= 4) busStable[k] = busCandidate[k];
  return busStable[k];
}

// Sentido pedido por los CI: hay destino guardado, el ascensor está ocupado y aún no llegó.
int wanted(bool busy, int dest) {
  if (!busy || dest < 1 || dest > 4 || dest == floorNow) return 0;
  return dest > floorNow ? 1 : -1;
}

void motor(unsigned long now, bool busy, int dest, int hwFloor) {
  if (!autoMode) { int s = readSensors(); if (s) floorNow = s; else if (hwFloor >= 1 && hwFloor <= 4) floorNow = hwFloor; dir = 0; return; }
  if (dir != 0) {
    if ((unsigned long)(now - segStart) >= FLOOR_MS) {   // 3 s: la cabina alcanza el piso siguiente
      floorNow += dir; dir = 0; driveSensors();
      settleUntil = now + SETTLE_MS; segStart = now;
    }
    return;
  }
  if ((long)(now - settleUntil) < 0) return;
  dir = wanted(busy, dest);
  if (dir != 0) { doorsUntil = 0; segStart = now; driveSensors(); }   // cierra puertas y sale de la planta
}

// ── Pantalla ───────────────────────────────────────────────────────────────
void drawFrame() {
  display.fillScreen(BG);
  display.fillRect(0, 0, 800, 64, PANEL);
  display.fillRect(0, 64, 800, 1, LINE);
  display.setTextSize(3);
  display.setTextColor(TEXT, PANEL);
  display.setCursor(36, 21);
  display.print("ASCENSOR");
  display.setTextColor(DIM, PANEL);
  display.print("  4 PISOS");
  for (int f = 1; f <= 4; f++) {
    snprintf(buf, sizeof buf, "%d", f);
    label(4, SY + (4 - f) * SLOT, 28, SLOT, 3, DIM, BG, buf);
  }
  display.fillRoundRect(CARD_X, CARD_Y, 264, 230, 10, CARD);
  label(CARD_X + 20, CARD_Y + 14, 120, 20, 2, DIM, CARD, "PISO ACTUAL");
  display.fillRoundRect(SIDE_X, CARD_Y, SIDE_W, 110, 10, CARD);
  label(SIDE_X + 18, CARD_Y + 14, 84, 20, 2, DIM, CARD, "DESTINO");
  display.fillRoundRect(SIDE_X, CARD_Y + 120, SIDE_W, 110, 10, CARD);
  label(SIDE_X + 18, CARD_Y + 134, 192, 20, 2, DIM, CARD, "TIEMPO DEL VIAJE");
  label(CALL_X, CALL_Y - 30, 160, 20, 2, DIM, BG, "LLAMAR AL PISO");
}

void arrow(int x, int y, int status, uint16_t c) {
  display.fillRect(x, y, 40, 44, CARD);
  if (status == 1) { display.fillTriangle(x + 20, y, x, y + 22, x + 40, y + 22, c); display.fillRect(x + 13, y + 22, 14, 22, c); }
  else if (status == 2) { display.fillTriangle(x + 20, y + 44, x, y + 22, x + 40, y + 22, c); display.fillRect(x + 13, y, 14, 22, c); }
  else display.fillRect(x + 4, y + 19, 32, 6, c);
}

void drawShaft(int cab, bool doors) {
  display.fillRoundRect(SX, SY, SW, 4 * SLOT, 8, PANEL);
  for (int k = 1; k < 4; k++) display.fillRect(SX + 8, SY + k * SLOT, SW - 16, 1, LINE);
  display.fillRoundRect(SX + 10, cab, SW - 20, SLOT - 12, 6, CABIN);
  if (doors) display.fillRect(SX + SW / 2 - 16, cab + 8, 32, SLOT - 28, PANEL);
  else display.fillRect(SX + SW / 2 - 1, cab + 8, 2, SLOT - 28, LINE);
}

void render(unsigned long now, bool busy, int dest, int hwFloor) {
  bool doors = (long)(now - doorsUntil) < 0;
  bool hasDest = dest >= 1 && dest <= 4;
  int heading = dir != 0 ? dir : wanted(busy, dest);

  long travel = dir == 0 ? 0 : (long)((now - segStart) * SLOT / FLOOR_MS);
  if (travel > SLOT - 2) travel = SLOT - 2;
  int cab = SY + (4 - floorNow) * SLOT + 6 - dir * travel;
  if (cab != shownCab || doors != shownDoors) { drawShaft(cab, doors); shownCab = cab; shownDoors = doors; }

  // Parado se ve el piso que guardan los CI (U11); en marcha, el que va cruzando la cabina.
  int shown = dir == 0 ? (hwFloor >= 1 && hwFloor <= 4 ? hwFloor : floorNow) : (travel * 2 > SLOT ? floorNow + dir : floorNow);
  if (shown != shownFloor) {
    snprintf(buf, sizeof buf, "%d", shown);
    label(CARD_X + 20, CARD_Y + 40, 150, 140, 16, TEXT, CARD, buf);
    shownFloor = shown;
  }

  int status = heading > 0 ? 1 : heading < 0 ? 2 : doors ? 3 : busy ? 4 : 0;
  if (status != shownStatus) {
    const char* names[] = {"EN ESPERA", "SUBIENDO", "BAJANDO", "PUERTAS", "ESPERANDO"};
    uint16_t colors[] = {DIM, GREEN, RED, BLUE, AMBER};
    arrow(CARD_X + 196, CARD_Y + 88, status, colors[status]);
    display.fillRect(CARD_X + 20, CARD_Y + 186, 224, 32, CARD);
    label(CARD_X + 20, CARD_Y + 186, 224, 32, 3, colors[status], CARD, names[status]);
    if (status == 1) rgb.on(0, 160, 60);
    else if (status == 2) rgb.on(180, 0, 0);
    else if (status == 3) rgb.on(0, 60, 200);
    else if (status == 4) rgb.on(160, 100, 0);
    else rgb.on(20, 20, 20);
    shownStatus = status;
  }

  int d = hasDest ? dest : 0;
  if (d != shownDest) {
    if (hasDest) snprintf(buf, sizeof buf, "PISO %d", dest); else snprintf(buf, sizeof buf, "--");
    display.fillRect(SIDE_X + 10, CARD_Y + 40, SIDE_W - 20, 56, CARD);
    label(SIDE_X + 10, CARD_Y + 40, SIDE_W - 20, 56, 6, hasDest ? TEXT : DIM, CARD, buf);
    shownDest = d;
  }

  // Tiempo que falta: 3 s por piso que queda por recorrer.
  int secs = -1;
  if (busy && hasDest) {
    long left = (long)abs(dest - floorNow) * FLOOR_MS - (dir != 0 ? (long)(now - segStart) : 0);
    secs = left <= 0 ? 0 : (int)((left + 999) / 1000);
  }
  if (secs != shownTime) {
    if (secs >= 0) snprintf(buf, sizeof buf, "%d s", secs); else snprintf(buf, sizeof buf, "--");
    display.fillRect(SIDE_X + 10, CARD_Y + 158, SIDE_W - 20, 48, CARD);
    label(SIDE_X + 10, CARD_Y + 158, SIDE_W - 20, 48, 6, secs >= 0 ? TEXT : DIM, CARD, buf);
    shownTime = secs;
  }

  // Botones de llamada: azul mientras se pulsa, ámbar el destino en curso.
  int calls = 0;
  for (int f = 1; f <= 4; f++) {
    int s = (long)(now - pulseUntil[f - 1]) < 0 ? 2 : (busy && dest == f) ? 1 : 0;
    calls |= s << (2 * (f - 1));
  }
  if (calls != shownCalls) {
    for (int f = 1; f <= 4; f++) {
      int s = (calls >> (2 * (f - 1))) & 3;
      if (shownCalls >= 0 && s == ((shownCalls >> (2 * (f - 1))) & 3)) continue;
      uint16_t bg = s == 2 ? BLUE : s == 1 ? AMBER : CARD;
      int x = CALL_X + (f - 1) * (CALL_W + CALL_GAP);
      display.fillRoundRect(x, CALL_Y, CALL_W, CALL_H, 12, bg);
      snprintf(buf, sizeof buf, "%d", f);
      label(x, CALL_Y, CALL_W, CALL_H, 7, s ? BG : TEXT, bg, buf);
    }
    shownCalls = calls;
  }

  if ((autoMode ? 1 : 0) != shownMode) {
    uint16_t c = autoMode ? GREEN : AMBER;
    display.fillRoundRect(MODE_X, MODE_Y, MODE_W, MODE_H, 18, PANEL);
    display.drawRoundRect(MODE_X, MODE_Y, MODE_W, MODE_H, 18, c);
    label(MODE_X, MODE_Y, MODE_W, MODE_H, 2, c, PANEL, autoMode ? "AUTO" : "MANUAL");
    shownMode = autoMode ? 1 : 0;
  }
}

void touch(int x, int y, unsigned long now) {
  if (y >= MODE_Y && y < MODE_Y + MODE_H && x >= MODE_X && x < MODE_X + MODE_W) {  // AUTO / MANUAL
    autoMode = !autoMode;
    dir = 0;
    driveSensors();
    return;
  }
  if (y >= CALL_Y && y < CALL_Y + CALL_H && x >= CALL_X) {  // llamada de piso
    int f = (x - CALL_X) / (CALL_W + CALL_GAP);
    if (f > 3 || (x - CALL_X) % (CALL_W + CALL_GAP) >= CALL_W) return;
    press(CALL[f]);
    pulseUntil[f] = now + PULSE_MS;
  }
}

// El panel entrega coordenadas en vertical (480 x 800); con la rotación 1 se giran a la
// pantalla. Si en tu shield el toque sale reflejado, cambia aquí el sentido de los ejes.
void readTouch(unsigned long now) {
  GDTpoint_t points[5];
  bool touching = touchPanel.getTouchPoints(points) > 0;
  if (touching && !wasTouching) touch(points[0].y, 479 - points[0].x, now);
  wasTouching = touching;
}

void setup() {
  for (int i = 0; i < 4; i++) { release(CALL[i]); release(SENSOR[i]); }
  for (int i = 0; i < 3; i++) { pinMode(DEST[i], INPUT); pinMode(FLOOR[i], INPUT); }
  pinMode(BUSY, INPUT);
  display.begin();
  display.setRotation(1);
  touchPanel.begin();
  rgb.begin();
  driveSensors();                       // la cabina empieza en el piso 1
  settleUntil = millis() + SETTLE_MS;
  drawFrame();
}

void loop() {
  unsigned long now = millis();
  for (int i = 0; i < 4; i++) if (pulseUntil[i] && (long)(now - pulseUntil[i]) >= 0) { release(CALL[i]); pulseUntil[i] = 0; }
  readTouch(now);

  bool busy = digitalRead(BUSY);
  int dest = readBus(DEST, 0);
  int hwFloor = readBus(FLOOR, 1);
  if (wasBusy && !busy) doorsUntil = now + DOORS_MS;   // llegó: abre puertas
  wasBusy = busy;

  motor(now, busy, dest, hwFloor);
  render(now, busy, dest, hwFloor);
}
`;
