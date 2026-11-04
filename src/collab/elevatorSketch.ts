// Firmware del GIGA para el ascensor. Compila para la placa real (arduino:mbed_giga:giga) con las
// librerías oficiales de la GIGA Display Shield y, en el simulador, sobre el núcleo AVR con el
// mismo mapa de pines y una capa compatible de esas librerías (src/sim/gigaDisplayShim.ts).
export const ELEVATOR_GIGA = `// Ascensor de 4 pisos · interfaz e innovación con Arduino GIGA R1 WiFi + GIGA Display Shield
//
// La lógica obligatoria la hacen los integrados: memoria del destino (U8), bloqueo (U5-U7),
// piso actual (U11), comparación (U12), LEDs LS/LB, los displays del piso actual (U19) y del
// destino (U14) y el ritmo de 3 s por tramo (U15, U16). El GIGA presenta el tiempo total
// también en el display U17, sin gobernar la lógica obligatoria de movimiento:
//  1. Llamadas desde la pantalla táctil: pulsa la línea del piso como un botón más.
//  2. Motor de la cabina: el ritmo lo marca la cuenta regresiva de los CI (U16, 3 s por
//     piso). Cuando llega a 0, la cabina alcanza el siguiente piso y el GIGA activa su
//     sensor (MANUAL: activa el DIP SP1-SP4 al terminar cada tramo de 3 segundos).
//  3. Pantalla de 800 x 480: hueco con la cabina, piso actual, destino, tiempo TOTAL del viaje
//     y sentido. El LED RGB de la shield repite el estado: verde sube, rojo baja, azul puertas.
//
// GIGA a 3,3 V y lógica LS a 5 V, unidos por adaptadores BSS138.
// Llamadas y sensores en drenador abierto: INPUT suelta la línea (la sube el
// pull-up de 10 kOhm) y OUTPUT LOW la pone a 0, igual que el pulsador que tiene al lado.
// La shield va montada detrás del GIGA: no usa ningún pin de los cabezales D0-D53.

#include <Arduino_GigaDisplay_GFX.h>
#include <Arduino_GigaDisplayTouch.h>
#include <Arduino_GigaDisplay.h>

GigaDisplay_GFX display;
Arduino_GigaDisplayTouch touchPanel;
GigaDisplayRGB rgb;

const int CALL[4]   = {23, 25, 27, 29};  // llamada de piso 1-4
const int SENSOR[4] = {31, 33, 35, 37};  // sensor de planta 1-4
const int COUNT[2] = {39, 41};           // cuenta regresiva de U16 (Q0, Q1): 3, 2, 1, 0
const int TRIP_BCD[4] = {6, 7, 8, 9}; // total remaining seconds into U17: 0–9
const int BUSY = 43, VALID = 45;
const int DEST[3] = {47, 49, 51};        // destino guardado en U8 (Q0-Q2)

const unsigned long FLOOR_MS  = 3000;    // lo que tarda la cuenta de U16 en un piso
const unsigned long SETTLE_MS = 250;     // deja que los CI lean el sensor nuevo
const unsigned long DOORS_MS  = 1500;    // puertas abiertas al llegar
const unsigned long PULSE_MS  = 200;     // pulsación de una llamada táctil

// Colores RGB565
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
int lastCount = 3;
int tripSeconds = 0, tripTotal = 0, previousTripCount = 3;

// Lo último que se dibujó: solo se redibuja lo que cambia
int shownCab = -1000, shownFloor = -1, shownDest = -2, shownStatus = -1, shownTime = -1, shownCalls = -1, shownMode = -1;
bool shownDoors = false;
char buf[16];

void press(int pin)   { digitalWrite(pin, LOW); pinMode(pin, OUTPUT); }
void release(int pin) { pinMode(pin, INPUT); }

// Texto centrado en una caja con la fuente 5x7 (celda de 6 x 8 por tamaño).
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

int readSensors() {
  for (int i = 3; i >= 0; i--) if (digitalRead(SENSOR[i]) == LOW) return i + 1;
  return 0;
}

int readDest() {
  return digitalRead(DEST[0]) | (digitalRead(DEST[1]) << 1) | (digitalRead(DEST[2]) << 2);
}

int readCount() {
  static int candidate = 3, stable = 3;
  static unsigned long since = 0;
  int raw = digitalRead(COUNT[0]) | (digitalRead(COUNT[1]) << 1);
  unsigned long now = millis();
  if (raw != candidate) { candidate = raw; since = now; }
  if ((unsigned long)(now - since) >= 4) stable = candidate;
  return stable;
}

void writeTripSeconds(int seconds) {
  static int previous = -1;
  int bcd = constrain(seconds, 0, 9);
  if (bcd == previous) return;
  for (int bit = 0; bit < 4; bit++) digitalWrite(TRIP_BCD[bit], (bcd >> bit) & 1);
  previous = bcd;
}

// Sentido pedido por los CI: hay destino guardado, el ascensor está ocupado y aún no llegó.
int wanted(bool busy, bool valid, int dest) {
  if (!busy || !valid || dest < 1 || dest > 4 || dest == floorNow) return 0;
  return dest > floorNow ? 1 : -1;
}

void motor(unsigned long now, bool busy, bool valid, int dest, int count) {
  bool reached = count == 0 && lastCount != 0;  // la cuenta de U16 acaba de llegar a 0
  if (count != lastCount) lastCount = count;
  if (!autoMode) { int s = readSensors(); if (s) floorNow = s; dir = 0; return; }
  if (dir != 0) {
    if (reached) { floorNow += dir; dir = 0; driveSensors(); settleUntil = now + SETTLE_MS; segStart = now; }
    return;
  }
  if ((long)(now - settleUntil) < 0) return;
  dir = wanted(busy, valid, dest);
  if (dir != 0) { doorsUntil = 0; driveSensors(); }   // cierra puertas y sale de la planta
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

// Flecha de sentido (1 sube, 2 baja); en espera, una raya.
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

void render(unsigned long now, bool busy, bool valid, int dest) {
  bool doors = (long)(now - doorsUntil) < 0;
  int heading = dir != 0 ? dir : wanted(busy, valid, dest);

  // La cabina avanza al ritmo de la cuenta: llega justo cuando U16 marca 0.
  long travel = dir == 0 ? 0 : (long)((now - segStart) * SLOT / FLOOR_MS);
  if (travel > SLOT - 2) travel = SLOT - 2;
  int cab = SY + (4 - floorNow) * SLOT + 6 - dir * travel;
  if (cab != shownCab || doors != shownDoors) { drawShaft(cab, doors); shownCab = cab; shownDoors = doors; }

  int shown = dir == 0 ? floorNow : (travel * 2 > SLOT ? floorNow + dir : floorNow);
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

  if (dest != shownDest) {
    if (valid) snprintf(buf, sizeof buf, "PISO %d", dest); else snprintf(buf, sizeof buf, "--");
    display.fillRect(SIDE_X + 10, CARD_Y + 40, SIDE_W - 20, 56, CARD);
    label(SIDE_X + 10, CARD_Y + 40, SIDE_W - 20, 56, 6, valid ? TEXT : DIM, CARD, buf);
    shownDest = dest;
  }

  // Tiempo TOTAL del viaje: 3 s por tramo, de 0 a 9. No recarga al cambiar de piso.
  int secs = valid ? tripSeconds : -1;
  if (secs != shownTime) {
    if (valid) snprintf(buf, sizeof buf, "%d s", tripSeconds); else snprintf(buf, sizeof buf, "--");
    display.fillRect(SIDE_X + 10, CARD_Y + 158, SIDE_W - 20, 48, CARD);
    label(SIDE_X + 10, CARD_Y + 158, SIDE_W - 20, 48, 6, valid ? TEXT : DIM, CARD, buf);
    int bar = SIDE_W - 36;
    display.fillRoundRect(SIDE_X + 18, CARD_Y + 212, bar, 8, 4, LINE);
    if (valid && tripTotal > 0) display.fillRoundRect(SIDE_X + 18, CARD_Y + 212, (long)bar * (tripTotal - tripSeconds) / tripTotal, 8, 4, GREEN);
    shownTime = secs;
  }

  // Botones de llamada: azul mientras se pulsa, ámbar el destino en curso.
  int calls = 0;
  for (int f = 1; f <= 4; f++) {
    int s = (long)(now - pulseUntil[f - 1]) < 0 ? 2 : (busy && valid && dest == f) ? 1 : 0;
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
  pinMode(COUNT[0], INPUT); pinMode(COUNT[1], INPUT); pinMode(BUSY, INPUT); pinMode(VALID, INPUT);
  for (int i = 0; i < 3; i++) pinMode(DEST[i], INPUT);
  for (int i = 0; i < 4; i++) { digitalWrite(TRIP_BCD[i], LOW); pinMode(TRIP_BCD[i], OUTPUT); }
  display.begin();
  display.setRotation(1);
  touchPanel.begin();
  rgb.begin();
  driveSensors();                       // la cabina empieza en el piso 1
  drawFrame();
}

void loop() {
  unsigned long now = millis();
  for (int i = 0; i < 4; i++) if (pulseUntil[i] && (long)(now - pulseUntil[i]) >= 0) { release(CALL[i]); pulseUntil[i] = 0; }
  readTouch(now);

  bool busy = digitalRead(BUSY), valid = digitalRead(VALID);
  int dest = valid ? readDest() : 0, count = readCount();
  if (!wasBusy && busy) {
    segStart = now;
    tripTotal = tripSeconds = constrain(abs(dest - floorNow) * 3, 0, 9);
    previousTripCount = count;
  }
  if (busy && count < previousTripCount) tripSeconds = max(0, tripSeconds - (previousTripCount - count));
  previousTripCount = count;
  if (!busy) tripSeconds = 0;
  writeTripSeconds(tripSeconds);
  if (wasBusy && !busy) doorsUntil = now + DOORS_MS;   // llegó: abre puertas
  wasBusy = busy;

  motor(now, busy, valid, dest, count);
  render(now, busy, valid, dest);
}
`;
