export const DEFAULT_SKETCH = `// Parpadeo con atenuación: el LED integrado (pin 13) parpadea
// y un LED en el pin 9 sigue al potenciómetro de A0.

const int LED_PWM = 9;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(LED_PWM, OUTPUT);
  Serial.begin(9600);
  Serial.println("Hola desde Circuit Studio");
}

void loop() {
  int lectura = analogRead(A0);          // 0..1023
  analogWrite(LED_PWM, lectura / 4);     // 0..255
  digitalWrite(LED_BUILTIN, HIGH);
  delay(250);
  digitalWrite(LED_BUILTIN, LOW);
  delay(250);
  Serial.print("A0 = ");
  Serial.println(lectura);
}
`;
