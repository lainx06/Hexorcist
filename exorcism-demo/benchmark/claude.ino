const uint8_t STOP_PIN  = 2;   // STOP button to GND, internal pull-up
const uint8_t MOTOR_PIN = 8;   // HIGH = motor running
const uint8_t LED_PIN   = 13;  // status LED

const unsigned long BLINK_MS   = 200;
const unsigned long RELEASE_MS = 50;   // release must be stable this long before restart

unsigned long lastBlink   = 0;
unsigned long releasedAt  = 0;
bool wasPressed           = true;      // start stopped until the button reads released
bool ledState             = false;

// Stop the motor immediately on press, regardless of what loop() is doing
void stopISR() {
  digitalWrite(MOTOR_PIN, LOW);
}

void setup() {
  digitalWrite(MOTOR_PIN, LOW);
  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(STOP_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(STOP_PIN), stopISR, FALLING);
}

void loop() {
  unsigned long now = millis();
  bool pressed = (digitalRead(STOP_PIN) == LOW);

  if (pressed) {
    digitalWrite(MOTOR_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    ledState   = false;
    wasPressed = true;
    return;
  }

  // Button released: debounce before restarting
  if (wasPressed) {
    releasedAt = now;
    wasPressed = false;
  }
  if (now - releasedAt < RELEASE_MS) {
    return;
  }

  // Re-check the pin with interrupts off so a press can't slip in between
  noInterrupts();
  if (digitalRead(STOP_PIN) == HIGH) {
    digitalWrite(MOTOR_PIN, HIGH);
  }
  interrupts();

  // Blink status LED while running
  if (digitalRead(MOTOR_PIN) == HIGH && now - lastBlink >= BLINK_MS) {
    lastBlink = now;
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState);
  }
}