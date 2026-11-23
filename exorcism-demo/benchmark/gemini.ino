const uint8_t STOP_PIN = 2;
const uint8_t MOTOR_PIN = 8;
const uint8_t LED_PIN = 13;

unsigned long lastBlink = 0;
bool ledState = LOW;

void setup() {
  pinMode(STOP_PIN, INPUT_PULLUP);
  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  if (digitalRead(STOP_PIN) == LOW) {
    digitalWrite(MOTOR_PIN, LOW);
    ledState = LOW;
    digitalWrite(LED_PIN, LOW);
  } else {
    digitalWrite(MOTOR_PIN, HIGH);
    unsigned long now = millis();
    if (now - lastBlink >= 200) {
      lastBlink = now;
      ledState = !ledState;
      digitalWrite(LED_PIN, ledState);
    }
  }
}