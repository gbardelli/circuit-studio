// Cabeceras que sustituyen a las librerías de la GIGA Display Shield al compilar para el núcleo
// AVR del simulador. Mantienen la API pública que usan los sketches (GigaDisplay_GFX como
// Adafruit_GFX, Arduino_GigaDisplayTouch y GigaDisplayRGB), así el mismo código compila para
// el GIGA real con las librerías oficiales. Ver src/sim/gigaDisplay.ts para el protocolo.

import { DFROBOT_FILES } from './dfrobotLibrary.js';

const GFX = `#pragma once
// Simulador de Circuit Studio: sustituto de Arduino_GigaDisplay_GFX para el núcleo AVR.
#include <Arduino.h>
#include <Print.h>

#define GDS_OUT (*(volatile uint8_t *)0x1F8)
static inline void gds8(uint8_t v) { GDS_OUT = v; }
static inline void gds16(int16_t v) { GDS_OUT = (uint8_t)v; GDS_OUT = (uint8_t)((uint16_t)v >> 8); }

class GigaDisplay_GFX : public Print {
 public:
  GigaDisplay_GFX() {}
  void begin() { gds8(0x01); _rot = 0; _x = _y = 0; }
  void setRotation(uint8_t r) { _rot = r & 3; gds8(0x02); gds16(_rot); }
  uint8_t getRotation() const { return _rot; }
  int16_t width() const { return (_rot & 1) ? 800 : 480; }
  int16_t height() const { return (_rot & 1) ? 480 : 800; }
  void startBuffering() { gds8(0x10); }
  void endBuffering() { gds8(0x11); }
  void fillScreen(uint16_t c) { gds8(0x03); gds16(c); }
  void drawPixel(int16_t x, int16_t y, uint16_t c) { gds8(0x0D); gds16(x); gds16(y); gds16(c); }
  void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { op5(0x04, x, y, w, h, c); }
  void drawRect(int16_t x, int16_t y, int16_t w, int16_t h, uint16_t c) { op5(0x05, x, y, w, h, c); }
  void drawFastHLine(int16_t x, int16_t y, int16_t w, uint16_t c) { fillRect(x, y, w, 1, c); }
  void drawFastVLine(int16_t x, int16_t y, int16_t h, uint16_t c) { fillRect(x, y, 1, h, c); }
  void fillRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { gds8(0x06); gds16(x); gds16(y); gds16(w); gds16(h); gds16(r); gds16(c); }
  void drawRoundRect(int16_t x, int16_t y, int16_t w, int16_t h, int16_t r, uint16_t c) { gds8(0x07); gds16(x); gds16(y); gds16(w); gds16(h); gds16(r); gds16(c); }
  void drawLine(int16_t x0, int16_t y0, int16_t x1, int16_t y1, uint16_t c) { op5(0x08, x0, y0, x1, y1, c); }
  void fillCircle(int16_t x, int16_t y, int16_t r, uint16_t c) { gds8(0x09); gds16(x); gds16(y); gds16(r); gds16(c); }
  void drawCircle(int16_t x, int16_t y, int16_t r, uint16_t c) { gds8(0x0A); gds16(x); gds16(y); gds16(r); gds16(c); }
  void fillTriangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint16_t c) { op7(0x0B, x0, y0, x1, y1, x2, y2, c); }
  void drawTriangle(int16_t x0, int16_t y0, int16_t x1, int16_t y1, int16_t x2, int16_t y2, uint16_t c) { op7(0x0C, x0, y0, x1, y1, x2, y2, c); }
  void setCursor(int16_t x, int16_t y) { _x = x; _y = y; }
  int16_t getCursorX() const { return _x; }
  int16_t getCursorY() const { return _y; }
  void setTextColor(uint16_t c) { _fg = c; _opaque = false; }
  void setTextColor(uint16_t c, uint16_t bg) { _fg = c; _bg = bg; _opaque = true; }
  void setTextSize(uint8_t s) { _size = s ? s : 1; }
  void setTextWrap(bool w) { _wrap = w; }
  static uint16_t color565(uint8_t r, uint8_t g, uint8_t b) { return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3); }
  size_t write(uint8_t ch) override {
    if (ch == '\\n') { _x = 0; _y += 8 * _size; return 1; }
    if (ch == '\\r') return 1;
    if (_wrap && _x + 6 * _size > width()) { _x = 0; _y += 8 * _size; }
    gds8(0x0E); gds16(_x); gds16(_y); gds16(_size); gds16(_fg); gds16(_bg); gds16(_opaque); gds16(ch);
    _x += 6 * _size;
    return 1;
  }
  using Print::write;

 private:
  void op5(uint8_t code, int16_t a, int16_t b, int16_t c, int16_t d, uint16_t e) { gds8(code); gds16(a); gds16(b); gds16(c); gds16(d); gds16(e); }
  void op7(uint8_t code, int16_t a, int16_t b, int16_t c, int16_t d, int16_t e, int16_t f, uint16_t g) { gds8(code); gds16(a); gds16(b); gds16(c); gds16(d); gds16(e); gds16(f); gds16(g); }
  uint8_t _rot = 0, _size = 1;
  int16_t _x = 0, _y = 0;
  uint16_t _fg = 0xFFFF, _bg = 0;
  bool _opaque = false, _wrap = true;
};
`;

const TOUCH = `#pragma once
// Simulador de Circuit Studio: sustituto de Arduino_GigaDisplayTouch para el núcleo AVR.
#include <Arduino.h>

#define GDS_OUT (*(volatile uint8_t *)0x1F8)
#define GDS_IN (*(volatile uint8_t *)0x1F9)

typedef struct GDTpoint_s {
  uint8_t trackId;
  uint16_t x;
  uint16_t y;
  uint16_t area;
} GDTpoint_t;

class Arduino_GigaDisplayTouch {
 public:
  bool begin() { return true; }
  void end() {}
  // Un solo punto: el panel admite cinco, el simulador sigue un dedo.
  uint8_t getTouchPoints(GDTpoint_t *points) {
    GDS_OUT = 0x20;
    uint8_t n = GDS_IN;
    if (!n) return 0;
    uint16_t x = GDS_IN; x |= (uint16_t)GDS_IN << 8;
    uint16_t y = GDS_IN; y |= (uint16_t)GDS_IN << 8;
    points[0].trackId = 0; points[0].x = x; points[0].y = y; points[0].area = 20;
    return 1;
  }
};
`;

const DISPLAY = `#pragma once
// Simulador de Circuit Studio: sustituto de Arduino_GigaDisplay (LED RGB) para el núcleo AVR.
#include <Arduino.h>

#define GDS_OUT (*(volatile uint8_t *)0x1F8)

class GigaDisplayRGB {
 public:
  void begin() { off(); }
  void on(uint8_t r, uint8_t g, uint8_t b) { GDS_OUT = 0x0F; s(r); s(g); s(b); }
  void off() { on(0, 0, 0); }

 private:
  static void s(uint8_t v) { GDS_OUT = v; GDS_OUT = 0; }
};

class GigaDisplayBacklight {
 public:
  void begin() {}
  void set(int) {}
  void off() {}
};
`;

const FILES: Record<string, string> = {
  'Arduino_GigaDisplay_GFX.h': GFX,
  'Arduino_GigaDisplayTouch.h': TOUCH,
  'Arduino_GigaDisplay.h': DISPLAY,
};

/**
 * Librerías del simulador que necesita el sketch en el núcleo AVR, como rutas relativas a una
 * carpeta que se pasa a arduino-cli con --libraries (una carpeta por librería).
 */
export function simLibraryFiles(source: string, fqbn: string): { path: string; content: string }[] {
  if (!fqbn.startsWith('arduino:avr:')) return [];
  const result = Object.entries(FILES)
    .filter(([name]) => new RegExp(`#\\s*include\\s*[<"]${name.replace('.', '\\.')}[>"]`).test(source))
    .map(([name, content]) => ({ path: `${name.slice(0, -2)}/${name}`, content }));
  if (/^\s*#\s*include\s*[<"]DFRobotDFPlayerMini\.h[>"]/m.test(source)) {
    for (const [name, content] of Object.entries(DFROBOT_FILES)) result.push({ path: `DFRobotDFPlayerMini/${name}`, content });
  }
  return result;
}
