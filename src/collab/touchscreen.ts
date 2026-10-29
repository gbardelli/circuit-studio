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

export const ELEVATOR_SCREEN = `// Commercial logic ICs retain the destination and control movement.
// The Mega is a display/input interface only. D22..D32 monitor the circuit.
// D33..D36 emulate open-drain hall buttons: INPUT releases, OUTPUT LOW presses.
byte packet[9],used=0;
int activeCall=-1;
unsigned long releaseAt=0,refreshAt=0;
int previous=-1;
void command(const char* text) {
  Serial1.print(text); Serial1.write(255); Serial1.write(255); Serial1.write(255);
}
void setup() {
  Serial1.begin(9600);
  for(int p=22;p<=36;p++) pinMode(p,INPUT);
  command("bkcmd=0"); command("sendxy=1"); command("cls 2113");
  command("xstr 16,8,288,26,0,65535,2113,0,1,1,\\"ELEVATOR / FOUR FLOORS\\"");
  for(int floor=1;floor<=4;floor++) {
    int x=16+((floor-1)%2)*148,y=112+((floor-1)/2)*60;
    char text[100];
    snprintf(text,sizeof(text),"fill %d,%d,140,52,4226",x,y); command(text);
    snprintf(text,sizeof(text),"xstr %d,%d,140,52,1,65535,4226,1,1,1,\\"FLOOR %d\\"",x,y,floor); command(text);
  }
}
void loop() {
  unsigned long now=millis();
  if(activeCall>=0 && (long)(now-releaseAt)>=0) { pinMode(33+activeCall,INPUT); activeCall=-1; }
  while(Serial1.available()) {
    byte b=Serial1.read(); if(used==0 && b!=0x67) continue;
    packet[used++]=b;
    if(used==9) {
      used=0;
      if(packet[6]!=255 || packet[7]!=255 || packet[8]!=255 || packet[5]!=1) continue;
      int x=(packet[1]<<8)|packet[2],y=(packet[3]<<8)|packet[4];
      if(x<16 || x>=304 || y<112 || y>=224 || (x-16)%148>=140 || (y-112)%60>=52) continue;
      if(activeCall>=0) pinMode(33+activeCall,INPUT);
      activeCall=((y-112)/60)*2+(x-16)/148;
      digitalWrite(33+activeCall,LOW); pinMode(33+activeCall,OUTPUT); releaseAt=now+180;
    }
  }
  if((long)(now-refreshAt)<0) return;
  refreshAt=now+150;
  int destination=digitalRead(22)|(digitalRead(23)<<1)|(digitalRead(24)<<2);
  int current=digitalRead(27)|(digitalRead(28)<<1)|(digitalRead(29)<<2);
  bool valid=digitalRead(26),busy=digitalRead(25),up=digitalRead(30),down=digitalRead(31);
  int state=current|(destination<<3)|(valid<<6)|(busy<<7)|(up<<8)|(down<<9);
  if(state==previous) return; previous=state;
  char text[128];
  snprintf(text,sizeof(text),"xstr 16,40,288,26,0,65535,2113,0,1,1,\\"CURRENT %d   TARGET %s\\"",current,valid?String(destination).c_str():"-"); command(text);
  const char* status=up?"MOVING UP":down?"MOVING DOWN":busy?"WAITING FOR SENSOR":"READY";
  snprintf(text,sizeof(text),"xstr 16,72,288,24,0,2016,2113,0,1,1,\\"%-22s\\"",status); command(text);
}
`;
