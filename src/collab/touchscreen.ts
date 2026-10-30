import type { Template } from "./templates";

export const NEXTION_DEMO = `// Nextion NX3224T028: 5V, GND, RX <- Mega TX1/D18, TX -> Mega RX1/D19.
// Protocol-level drawing; no proprietary .TFT file is needed in this simulator.
bool light = false;
byte packet[9];
byte used = 0;
void command(const char* text) {
  Serial1.print(text);
  Serial1.write(0xFF); Serial1.write(0xFF); Serial1.write(0xFF);
}
void paint() {
  command(light ? "fill 20,90,280,100,2016" : "fill 20,90,280,100,4226");
  command(light ? "xstr 20,90,280,100,1,0,2016,1,1,1,\\"LED ON\\"" : "xstr 20,90,280,100,1,65535,4226,1,1,1,\\"LED OFF\\"");
}
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(115200); Serial1.begin(9600);
  command("bkcmd=0"); command("sendxy=1"); command("cls 2113");
  command("xstr 20,18,280,40,1,65535,2113,0,1,1,\\"TOUCH CONTROL\\"");
  command("xstr 20,202,280,24,0,33840,2113,0,1,1,\\"Tap to switch pin 13\\"");
  paint();
}
void loop() {
  while (Serial1.available()) {
    byte b=Serial1.read();
    if (used==0 && b!=0x67) continue;
    packet[used++]=b;
    if (used==9) {
      used=0;
      if (packet[6]!=255 || packet[7]!=255 || packet[8]!=255) continue;
      int x=(packet[1]<<8)|packet[2], y=(packet[3]<<8)|packet[4];
      Serial.print(x); Serial.print(','); Serial.print(y); Serial.print(','); Serial.println(packet[5]);
      if (packet[5]==1 && x>=20 && x<300 && y>=90 && y<190) {
        light=!light; digitalWrite(13,light); paint();
      }
    }
  }
}
`;

export const TOUCHSCREEN: Template = {
  id: "nextion-touch",
  name: "Pantalla táctil programable",
  category: "Arduino",
  level: "Intermedio",
  summary:
    "Una Nextion real por UART. Toca el botón para controlar el LED del pin 13; edita el sketch para dibujar tu interfaz.",
  parts: [
    { key: "mcu", type: "arduino-mega", x: 0, y: 0 },
    { key: "screen", type: "nextion-28", x: 400, y: 0 },
  ],
  wires: [
    { a: ["mcu", "5V"], b: ["screen", "VCC"], color: "#e5484d" },
    { a: ["mcu", "GND.1"], b: ["screen", "GND"], color: "#43464d" },
    { a: ["mcu", "D18"], b: ["screen", "RX"], color: "#6c9de8" },
    { a: ["mcu", "D19"], b: ["screen", "TX"], color: "#e1b65b" },
  ],
  sketch: NEXTION_DEMO,
};
