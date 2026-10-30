// Firmware del GIGA para el ascensor. Compila para la placa real (arduino:mbed_giga:giga) y,
// en el simulador, sobre el núcleo AVR con el mismo mapa de pines.
export const ELEVATOR_GIGA = `// Ascensor de 4 pisos · interfaz e innovación con Arduino GIGA R1 WiFi
//
// La lógica obligatoria la hacen los integrados: memoria del destino (U8), bloqueo (U5-U7),
// piso actual (U11), comparación (U12), LEDs LS/LB y display (U14). El GIGA no decide nada:
//  1. Llamadas desde la pantalla táctil: pulsa la línea del piso como un botón más.
//  2. Motor de la cabina: mientras los CI piden SUBIR o BAJAR, mueve la cabina activando
//     el sensor del piso al que llega (MANUAL: lo haces tú con el DIP SP1-SP4).
//  3. Pantalla: piso actual, destino, sentido y la cabina moviéndose por el hueco.
//
// Todo a 3,3 V. Llamadas y sensores en drenador abierto: INPUT suelta la línea (la sube el
// pull-up de 10 kOhm) y OUTPUT LOW la pone a 0, igual que el pulsador que tiene al lado.

#if defined(ARDUINO_GIGA)
#define NEXTION Serial2   // GIGA: D18 = TX1, D19 = RX1 son Serial2
#else
#define NEXTION Serial1   // simulador (nucleo AVR): los mismos pines D18/D19
#endif

const int CALL[4]   = {23, 25, 27, 29};  // llamada de piso 1-4
const int SENSOR[4] = {31, 33, 35, 37};  // sensor de planta 1-4
const int UP = 39, DOWN = 41, BUSY = 43, VALID = 45;
const int DEST[3] = {47, 49, 51};        // destino guardado en U8 (Q0-Q2)

const unsigned long TRAVEL_MS = 1400;    // de un piso al siguiente
const unsigned long SETTLE_MS = 250;     // deja que los CI lean el sensor nuevo
const unsigned long DOORS_MS  = 1500;    // puertas abiertas al llegar
const unsigned long PULSE_MS  = 200;     // pulsación de una llamada táctil

// Colores RGB565
const unsigned BG = 2146, PANEL = 4292, CARD = 6437, TEXT = 63422, DIM = 35988;
const unsigned GREEN = 11758, AMBER = 63011, RED = 64201, BLUE = 15327, CABIN = 61277, RULE = 10631;

// Hueco del ascensor: 4 plantas de 48 px
const int SX = 30, SY = 38, SW = 62, SLOT = 48;

bool autoMode = true;
int floorNow = 1;        // planta de la cabina
int dir = 0;             // +1 sube, -1 baja, 0 parada
unsigned long travelStart = 0, settleUntil = 0, doorsUntil = 0, pulseUntil[4] = {0, 0, 0, 0};
bool wasBusy = false;

// Lo último que se dibujó: solo se envía lo que cambia
int shownCab = -1000, shownFloor = -1, shownDest = -2, shownStatus = -1, shownCalls = -1, shownMode = -1;
bool shownDoors = false;

byte packet[9], used = 0;
char buf[24];    // números y textos cortos
char line[140];  // la instrucción que se envía

void cmd(const char* s) {
  NEXTION.print(s);
  NEXTION.write(0xFF); NEXTION.write(0xFF); NEXTION.write(0xFF);
}
void fill(int x, int y, int w, int h, unsigned c) {
  snprintf(line, sizeof line, "fill %d,%d,%d,%d,%u", x, y, w, h, c);
  cmd(line);
}
void text(int x, int y, int w, int h, int font, unsigned fg, unsigned bg, int align, const char* s) {
  snprintf(line, sizeof line, "xstr %d,%d,%d,%d,%d,%u,%u,%d,1,1,\\"%s\\"", x, y, w, h, font, fg, bg, align, s);
  cmd(line);
}

void press(int pin)   { digitalWrite(pin, LOW); pinMode(pin, OUTPUT); }
void release(int pin) { pinMode(pin, INPUT); }

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

void motor(unsigned long now) {
  if (!autoMode) { int s = readSensors(); if (s) floorNow = s; dir = 0; return; }
  if (dir != 0) {
    if (now - travelStart >= TRAVEL_MS) { floorNow += dir; dir = 0; driveSensors(); settleUntil = now + SETTLE_MS; }
    return;
  }
  if ((long)(now - settleUntil) < 0 || (long)(now - doorsUntil) < 0) return;
  if (digitalRead(UP) && floorNow < 4) { dir = 1; travelStart = now; driveSensors(); }
  else if (digitalRead(DOWN) && floorNow > 1) { dir = -1; travelStart = now; driveSensors(); }
}

// ── Pantalla ───────────────────────────────────────────────────────────────
void drawFrame() {
  cmd("cls 2146");
  fill(0, 0, 320, 30, PANEL);
  text(12, 0, 200, 30, 0, TEXT, PANEL, 0, "ASCENSOR  4 PISOS");
  for (int f = 1; f <= 4; f++) {
    snprintf(buf, sizeof buf, "%d", f);
    text(6, SY + (4 - f) * SLOT, 20, SLOT, 0, DIM, BG, 1, buf);
  }
  fill(104, 38, 208, 82, CARD);
  text(112, 40, 100, 18, 0, DIM, CARD, 0, "PISO");
  fill(104, 124, 208, 30, CARD);
  text(112, 124, 80, 30, 0, DIM, CARD, 0, "DESTINO");
}

// Flecha de sentido hecha con rellenos (1 sube, 2 baja); en espera, una raya.
void arrow(int x, int y, int status, unsigned c) {
  if (status == 1 || status == 2) {
    bool upward = status == 1;
    // Punta: 7 franjas de 2 px que se ensanchan desde el vértice; luego el vástago.
    for (int i = 0; i < 7; i++) {
      int w = 2 + i * 4;
      fill(x + 13 - w / 2, upward ? y + 1 + i * 2 : y + 29 - i * 2, w, 2, c);
    }
    fill(x + 9, upward ? y + 15 : y + 1, 8, 15, c);
  } else fill(x + 2, y + 14, 22, 4, c);
}

void drawShaft(int cab, bool doors) {
  fill(SX, SY, SW, 4 * SLOT, PANEL);
  for (int k = 1; k < 4; k++) fill(SX, SY + k * SLOT, SW, 1, RULE);
  fill(SX + 4, cab, SW - 8, SLOT - 8, CABIN);
  if (doors) fill(SX + SW / 2 - 7, cab + 4, 14, SLOT - 16, PANEL);
  else fill(SX + SW / 2 - 1, cab + 4, 2, SLOT - 16, RULE);
}

void render(unsigned long now) {
  bool busy = digitalRead(BUSY), valid = digitalRead(VALID);
  bool up = digitalRead(UP), down = digitalRead(DOWN);
  bool doors = (long)(now - doorsUntil) < 0;
  int dest = valid ? readDest() : 0;

  long travel = dir == 0 ? 0 : (long)((now - travelStart) * SLOT / TRAVEL_MS);
  if (travel > SLOT) travel = SLOT;
  int cab = SY + (4 - floorNow) * SLOT + 4 - dir * travel;
  if (cab != shownCab || doors != shownDoors) { drawShaft(cab, doors); shownCab = cab; shownDoors = doors; }

  int shown = dir == 0 ? floorNow : (travel * 2 > SLOT ? floorNow + dir : floorNow);
  if (shown != shownFloor) {
    snprintf(buf, sizeof buf, "%d", shown);
    text(110, 58, 80, 58, 3, TEXT, CARD, 0, buf);
    shownFloor = shown;
  }

  int status = up || dir > 0 ? 1 : down || dir < 0 ? 2 : doors ? 3 : busy ? 4 : 0;
  if (status != shownStatus) {
    const char* label[] = {"EN ESPERA", "SUBIENDO", "BAJANDO", "PUERTAS", "ESPERANDO"};
    unsigned color[] = {DIM, GREEN, RED, BLUE, AMBER};
    fill(196, 56, 110, 34, CARD);
    arrow(204, 58, status, color[status]);
    text(196, 92, 110, 22, 0, color[status], CARD, 0, label[status]);
    shownStatus = status;
  }

  if (dest != shownDest) {
    if (valid) snprintf(buf, sizeof buf, "PISO %d", dest); else snprintf(buf, sizeof buf, "--");
    text(196, 124, 110, 30, 1, valid ? TEXT : DIM, CARD, 0, buf);
    shownDest = dest;
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
      if (s == ((shownCalls >> (2 * (f - 1))) & 3) && shownCalls >= 0) continue;
      unsigned bg = s == 2 ? BLUE : s == 1 ? AMBER : CARD;
      snprintf(buf, sizeof buf, "%d", f);
      text(104 + (f - 1) * 52, 162, 48, 66, 2, s ? BG : TEXT, bg, 1, buf);
    }
    shownCalls = calls;
  }

  if ((autoMode ? 1 : 0) != shownMode) {
    text(232, 4, 80, 22, 0, autoMode ? GREEN : AMBER, CARD, 1, autoMode ? "AUTO" : "MANUAL");
    shownMode = autoMode ? 1 : 0;
  }
}

void touch(int x, int y, unsigned long now) {
  if (y < 30 && x >= 232) {            // AUTO / MANUAL
    autoMode = !autoMode;
    dir = 0;
    driveSensors();
    return;
  }
  if (y >= 162 && y < 228 && x >= 104) {  // llamada de piso
    int f = (x - 104) / 52;
    if (f > 3 || (x - 104) % 52 >= 48) return;
    press(CALL[f]);
    pulseUntil[f] = now + PULSE_MS;
  }
}

void setup() {
  for (int i = 0; i < 4; i++) { release(CALL[i]); release(SENSOR[i]); }
  pinMode(UP, INPUT); pinMode(DOWN, INPUT); pinMode(BUSY, INPUT); pinMode(VALID, INPUT);
  for (int i = 0; i < 3; i++) pinMode(DEST[i], INPUT);
  delay(400);                           // la Nextion tarda en arrancar tras recibir 5 V
  NEXTION.begin(9600);                  // y lo hace a 9600 baudios
  cmd("baud=115200");                   // y pasa a 115200 para animar sin parpadeos
  delay(20);
  NEXTION.begin(115200);
  cmd("bkcmd=0");
  cmd("sendxy=1");
  driveSensors();                       // la cabina empieza en el piso 1
  drawFrame();
}

void loop() {
  unsigned long now = millis();
  for (int i = 0; i < 4; i++) if (pulseUntil[i] && (long)(now - pulseUntil[i]) >= 0) { release(CALL[i]); pulseUntil[i] = 0; }

  while (NEXTION.available()) {
    byte b = NEXTION.read();
    if (used == 0 && b != 0x67) continue;   // 0x67: coordenadas del toque
    packet[used++] = b;
    if (used == 9) {
      used = 0;
      if (packet[6] == 255 && packet[7] == 255 && packet[8] == 255 && packet[5] == 1)
        touch((packet[1] << 8) | packet[2], (packet[3] << 8) | packet[4], now);
    }
  }

  bool busy = digitalRead(BUSY);
  if (wasBusy && !busy) doorsUntil = now + DOORS_MS;   // llegó: abre puertas
  wasBusy = busy;

  motor(now);
  render(now);
}
`;
