// Firmware del GIGA para el ascensor de clase: solo dibuja el estado en la GIGA Display Shield.
// Compila para la placa real (arduino:mbed_giga:giga) con las librerías oficiales de la shield y,
// en el simulador, sobre el núcleo AVR con una capa compatible (src/sim/gigaDisplayShim.ts).
export const ELEVATOR_CLASS_GIGA = `// Ascensor de 4 pisos · pantalla con Arduino GIGA R1 WiFi + GIGA Display Shield
//
// La lógica la hacen los integrados de clase (74LS75, 74LS85, 74LS48 y compuertas 74HC).
// El GIGA no decide nada: lee tres cosas y las dibuja.
//   DEST   destino guardado en U8 (74LS75), 3 bits  -> D23, D25, D27
//   OCUPADO  hay un viaje en curso (U5)            -> D29
//   PISO   piso actual guardado en U11 (74LS75)    -> D31, D33, D35
// Cada línea llega por un adaptador de nivel BOB-12009: los CI trabajan a 5 V y los pines del
// GIGA son de 3,3 V, así que NUNCA conectes una salida de 5 V directo a un pin del GIGA.
// Los pines son solo entradas: el GIGA no mueve ninguna línea del circuito.

#include <Arduino_GigaDisplay_GFX.h>
#include <Arduino_GigaDisplay.h>

GigaDisplay_GFX display;
GigaDisplayRGB rgb;

const int DEST[3] = {23, 25, 27};
const int BUSY = 29;
const int FLOOR[3] = {31, 33, 35};

#define RGB565(r, g, b) (uint16_t)((((r) & 0xF8) << 8) | (((g) & 0xFC) << 3) | ((b) >> 3))
const uint16_t BG = RGB565(10, 12, 15), PANEL = RGB565(21, 25, 30), CARD = RGB565(29, 34, 41);
const uint16_t LINE = RGB565(50, 57, 66), TEXT = RGB565(236, 239, 243), DIM = RGB565(128, 138, 150);
const uint16_t GREEN = RGB565(52, 199, 120), RED = RGB565(240, 84, 84), AMBER = RGB565(245, 176, 65);
const uint16_t BLUE = RGB565(70, 156, 255), CABIN = RGB565(226, 232, 240);

// Pantalla apaisada (rotación 1): 800 x 480
const int SX = 60, SY = 84, SW = 170, SLOT = 92;   // hueco: 4 plantas de 92 px
const int CARD_X = 290, CARD_Y = 84, CARD_W = 440; // piso actual
const int DEST_Y = 330, DEST_H = 110;              // destino

int shownFloor = -1, shownDest = -1, shownStatus = -1;
char buf[16];

// Texto centrado en una caja con la fuente 5x7 (celda de 6 x 8 por tamaño).
void label(int x, int y, int w, int h, int size, uint16_t fg, uint16_t bg, const char* s) {
  int width = strlen(s) * 6 * size - size;
  display.setTextSize(size);
  display.setTextColor(fg, bg);
  display.setCursor(x + (w - width) / 2, y + (h - 7 * size) / 2);
  display.print(s);
}

// Lee un número de tres bits; solo lo da por bueno si lleva 4 ms estable (los latches cambian de golpe).
int readBits(const int* pins, int* stable, unsigned long* since, int* candidate) {
  int raw = digitalRead(pins[0]) | (digitalRead(pins[1]) << 1) | (digitalRead(pins[2]) << 2);
  unsigned long now = millis();
  if (raw != *candidate) { *candidate = raw; *since = now; }
  if ((unsigned long)(now - *since) >= 4) *stable = *candidate;
  return *stable;
}

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
    label(20, SY + (4 - f) * SLOT, 36, SLOT, 3, DIM, BG, buf);
  }
  display.fillRoundRect(CARD_X, CARD_Y, CARD_W, 230, 10, CARD);
  label(CARD_X + 20, CARD_Y + 14, 150, 20, 2, DIM, CARD, "PISO ACTUAL");
  display.fillRoundRect(CARD_X, DEST_Y, CARD_W, DEST_H, 10, CARD);
  label(CARD_X + 20, DEST_Y + 14, 100, 20, 2, DIM, CARD, "DESTINO");
}

void drawShaft(int floorNow) {
  display.fillRoundRect(SX, SY, SW, 4 * SLOT, 8, PANEL);
  for (int k = 1; k < 4; k++) display.fillRect(SX + 8, SY + k * SLOT, SW - 16, 1, LINE);
  if (floorNow >= 1 && floorNow <= 4) {
    int cab = SY + (4 - floorNow) * SLOT + 6;
    display.fillRoundRect(SX + 10, cab, SW - 20, SLOT - 12, 6, CABIN);
    display.fillRect(SX + SW / 2 - 1, cab + 8, 2, SLOT - 28, LINE);
  }
}

// Flecha de sentido (1 sube, 2 baja); en espera, una raya.
void arrow(int x, int y, int status, uint16_t c) {
  display.fillRect(x, y, 40, 44, CARD);
  if (status == 1) { display.fillTriangle(x + 20, y, x, y + 22, x + 40, y + 22, c); display.fillRect(x + 13, y + 22, 14, 22, c); }
  else if (status == 2) { display.fillTriangle(x + 20, y + 44, x, y + 22, x + 40, y + 22, c); display.fillRect(x + 13, y, 14, 22, c); }
  else display.fillRect(x + 4, y + 19, 32, 6, c);
}

void render(int floorNow, int dest, bool busy) {
  bool known = floorNow >= 1 && floorNow <= 4;
  bool hasDest = dest >= 1 && dest <= 4;
  if (floorNow != shownFloor) {
    drawShaft(floorNow);
    if (known) snprintf(buf, sizeof buf, "%d", floorNow); else snprintf(buf, sizeof buf, "-");
    display.fillRect(CARD_X + 20, CARD_Y + 40, 150, 140, CARD);
    label(CARD_X + 20, CARD_Y + 40, 150, 140, 16, known ? TEXT : DIM, CARD, buf);
    shownFloor = floorNow;
  }

  // 0 en espera, 1 sube, 2 baja, 3 llegó, 4 viaje sin sentido (el sensor aún no marca un piso)
  int status = 0;
  if (busy && known && hasDest && dest != floorNow) status = dest > floorNow ? 1 : 2;
  else if (busy) status = 4;
  else if (known && hasDest && dest == floorNow) status = 3;
  if (status != shownStatus) {
    const char* names[] = {"EN ESPERA", "SUBIENDO", "BAJANDO", "LLEGO", "EN VIAJE"};
    uint16_t colors[] = {DIM, GREEN, RED, BLUE, AMBER};
    arrow(CARD_X + 340, CARD_Y + 88, status, colors[status]);
    display.fillRect(CARD_X + 190, CARD_Y + 186, 240, 32, CARD);
    label(CARD_X + 190, CARD_Y + 186, 240, 32, 3, colors[status], CARD, names[status]);
    if (status == 1) rgb.on(0, 160, 60);
    else if (status == 2) rgb.on(180, 0, 0);
    else if (status == 3) rgb.on(0, 60, 200);
    else if (status == 4) rgb.on(160, 100, 0);
    else rgb.on(20, 20, 20);
    shownStatus = status;
  }

  int shown = hasDest ? dest : 0;
  if (shown != shownDest) {
    if (hasDest) snprintf(buf, sizeof buf, "PISO %d", dest); else snprintf(buf, sizeof buf, "--");
    display.fillRect(CARD_X + 10, DEST_Y + 40, CARD_W - 20, 56, CARD);
    label(CARD_X + 10, DEST_Y + 40, CARD_W - 20, 56, 6, hasDest ? TEXT : DIM, CARD, buf);
    shownDest = shown;
  }
}

void setup() {
  for (int i = 0; i < 3; i++) { pinMode(DEST[i], INPUT); pinMode(FLOOR[i], INPUT); }
  pinMode(BUSY, INPUT);
  display.begin();
  display.setRotation(1);
  rgb.begin();
  drawFrame();
}

void loop() {
  static int destStable = 0, destCandidate = 0, floorStable = 0, floorCandidate = 0;
  static unsigned long destSince = 0, floorSince = 0;
  int dest = readBits(DEST, &destStable, &destSince, &destCandidate);
  int floorNow = readBits(FLOOR, &floorStable, &floorSince, &floorCandidate);
  render(floorNow, dest, digitalRead(BUSY));
}
`;
