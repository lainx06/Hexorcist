const byte STOP_PIN  = 2;
const byte MOTOR_PIN = 8;
const byte LED_PIN   = 13;

unsigned long lastBlink = 0;
bool ledState = LOW;

void setup() {
  pinMode(STOP_PIN, INPUT_PULLUP);
  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(LED_PIN, LOW);
}

void loop() {
  // Check STOP button continuously
  bool running = (digitalRead(STOP_PIN) == HIGH);

  // Stop motor immediately when pressed
  digitalWrite(MOTOR_PIN, running ? HIGH : LOW);

  if (!running) {
    ledState = LOW;
    digitalWrite(LED_PIN, LOW);
    lastBlink = millis();
    return;
  }

  // Blink LED every 200 ms without blocking
  if (millis() - lastBlink >= 200) {
    lastBlink = millis();
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState);
  }
}